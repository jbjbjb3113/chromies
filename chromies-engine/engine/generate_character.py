"""Seed in → art-derived Chromie PNG + metadata out."""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from engine import __version__
from engine.art_safety import ReadOnlyArtGuard
from engine.batch_guards import BatchGuardContext
from engine.art_schema_loader import load_art_schema_bundle
from engine.compositor import CompositorResult, generate_chromie
from engine.payload_pipeline import build_payload_from_compositor
from engine.config import (
    ART_SCHEMA_VERSION,
    CANDIDATES_DIR,
    ROOT,
    SCHEMA_VERSION,
    THRESHOLDS_VERSION,
)
from engine.export_metadata import (
    build_attributes,
    build_compositor_metadata_block,
    write_internal_metadata,
    write_review_card,
)
from engine.models import (
    ClothingTrait,
    GenerationBlock,
    HairTrait,
    IdentityLayers,
    IdentityMetadata,
    ProvenanceBlock,
    ReviewRouting,
    TraitVector,
    ValidationBlock,
)
from engine.review_routing import (
    build_review_card as make_review_card,
    collect_hard_validation_failures,
    route_review_bucket,
)
from engine.roll_traits import roll_identity_dna
from engine.score_identity_strength import score_identity_strength
from engine.validate_palette import validate_palette
from engine.validate_pixels import validate_pixels
from engine.validate_silhouette import validate_silhouette
from engine.validation_context import ValidationContext
from engine.validation_modes import DEFAULT_VALIDATION_MODE, ValidationMode


@dataclass
class SavedIdentity:
    bucket: str
    png_path: Path
    metadata_path: Path
    review_card_path: Path | None
    routing: ReviewRouting


def compositor_to_trait_vector(result: CompositorResult) -> TraitVector:
    render = result.render_picks
    hair_name = render.get("hair", {}).get("variant", {}).get("name", "None")
    accessories = []
    acc_name = render.get("accessory", {}).get("variant", {}).get("name")
    if acc_name and acc_name != "None":
        accessories.append(acc_name)

    return TraitVector(
        head_shape=render.get("head", {}).get("variant", {}).get("name", "HeroA"),
        mask_type="None",
        eyes=render.get("eyes", {}).get("variant", {}).get("name", "None"),
        hair=HairTrait(style=hair_name, side="L"),
        forehead_mark="None",
        mouth=render.get("expression", {}).get("variant", {}).get("name", "None"),
        body_type=render.get("body", {}).get("variant", {}).get("name", "Default"),
        clothing=ClothingTrait(
            torso=render.get("shirt", {}).get("variant", {}).get("name", "None"),
            overlayer=render.get("hood", {}).get("variant", {}).get("name")
            if render.get("hood", {}).get("variant", {}).get("name") not in {None, "None"}
            else None,
        ),
        accessories=accessories,
        drift_tier="Stable",
        palette_family=result.palette_key,
        background="Solid",
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def png_bytes(image: np.ndarray) -> bytes:
    img = Image.fromarray(image, mode="RGBA")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def resolve_bucket_dirs(bucket: str, out: str | None = None) -> tuple[Path, Path, Path]:
    base = Path(out) if out else CANDIDATES_DIR
    if not base.is_absolute():
        base = ROOT / base
    bucket_root = base / bucket
    images_dir = bucket_root / "images"
    metadata_dir = bucket_root / "metadata"
    review_cards_dir = bucket_root / "review_cards"
    for path in (images_dir, metadata_dir, review_cards_dir):
        path.mkdir(parents=True, exist_ok=True)
    return images_dir, metadata_dir, review_cards_dir


def resolve_flat_output_dirs(out: str) -> tuple[Path, Path]:
    base = Path(out)
    if not base.is_absolute():
        base = ROOT / base
    images_dir = base / "images"
    metadata_dir = base / "metadata"
    images_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)
    return images_dir, metadata_dir


def _provenance_status(bucket: str) -> str:
    return {"passed": "candidate", "review": "review", "rejected": "rejected"}[bucket]


def forge_identity(
    seed: int,
    token_id: int,
    *,
    validation_mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
    batch: BatchGuardContext | None = None,
) -> tuple[np.ndarray, IdentityMetadata, ReviewRouting, CompositorResult]:
    if phase1_lenient is not None:
        validation_mode = ValidationMode.LENIENT if phase1_lenient else ValidationMode.STRICT

    schema = load_art_schema_bundle()
    compositor_result = generate_chromie(seed, token_id, schema, batch=batch)
    payload_result = build_payload_from_compositor(compositor_result, schema)
    image = payload_result.image_rgba
    appearance = compositor_to_trait_vector(compositor_result)
    identity_dna = roll_identity_dna(seed)

    compositor_block = build_compositor_metadata_block(compositor_result)
    val_ctx = ValidationContext.from_compositor(compositor_block)

    pixel = validate_pixels(image, mode=validation_mode)
    palette = validate_palette(image, appearance.palette_family, mode=validation_mode)
    silhouette = validate_silhouette(image, mode=validation_mode, context=val_ctx)
    strength = score_identity_strength(
        appearance,
        pixel,
        palette,
        silhouette,
        [],
        forehead_mark_gated=val_ctx.forehead_mark_gated,
        mask_gated=val_ctx.mask_gated,
        side_profile=val_ctx.is_side_profile,
    )

    validation_failures, hard_validation = collect_hard_validation_failures(
        pixel,
        palette,
        silhouette,
        mode=validation_mode,
        side_profile=val_ctx.is_side_profile,
    )
    hard_pass = len(validation_failures) == 0
    routing = route_review_bucket(
        hard_validation_pass=hard_pass,
        validation_failures=validation_failures,
        hard_validation=hard_validation,
        identity_strength_total=strength.total,
        strength=strength,
        pixel=pixel,
        silhouette=silhouette,
        side_profile=val_ctx.is_side_profile,
        mode=validation_mode,
    )

    digest = sha256_bytes(png_bytes(image))

    metadata = IdentityMetadata(
        schema_version=SCHEMA_VERSION,
        token_id=token_id,
        name=f"Chromie #{token_id}",
        image_sha256=digest,
        generation=GenerationBlock(
            seed=hex(seed),
            engine_version=__version__,
            roll_order_version=0,
            identity_dna_roll_order_version=1,
            prng_streams=[
                "appearance:mulberry32(seedFromStr)",
                "identity_dna:PCG64(SeedSequence)",
            ],
            thresholds_version=THRESHOLDS_VERSION,
            repairs=[],
        ),
        identity=IdentityLayers(appearance=appearance, identity_dna=identity_dna),
        validation=ValidationBlock(
            mode=validation_mode.value,
            pixel=pixel,
            palette=palette,
            silhouette=silhouette,
        ),
        identity_strength=strength,
        review=routing,
        provenance=ProvenanceBlock(
            generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            status=_provenance_status(routing.bucket),
        ),
        rarity={
            "art_schema_version": ART_SCHEMA_VERSION,
            "compositor": compositor_block,
        },
    )
    metadata.attributes = build_attributes(metadata)
    return image, metadata, routing, compositor_result


def save_identity(
    seed: int,
    token_id: int,
    *,
    out: str | None = None,
    validation_mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
    flat_output: bool = False,
    art_guard: ReadOnlyArtGuard | None = None,
) -> SavedIdentity:
    if art_guard is not None and art_guard.before_hash is None:
        art_guard.snapshot_before()

    image, metadata, routing, _ = forge_identity(
        seed,
        token_id,
        validation_mode=validation_mode,
        phase1_lenient=phase1_lenient,
    )

    if art_guard is not None:
        art_guard.verify_unchanged()

    review_card_path: Path | None = None
    if flat_output and out:
        images_dir, metadata_dir = resolve_flat_output_dirs(out)
    else:
        images_dir, metadata_dir, review_cards_dir = resolve_bucket_dirs(routing.bucket, out)
        review_card_path = review_cards_dir / f"chromie_{token_id:04d}.json"

    stem = f"chromie_{token_id:04d}"
    png_path = images_dir / f"{stem}.png"
    json_path = metadata_dir / f"{stem}.json"

    Image.fromarray(image, mode="RGBA").save(png_path)
    write_internal_metadata(metadata, json_path)
    if review_card_path is not None:
        write_review_card(make_review_card(metadata, routing), review_card_path)

    return SavedIdentity(
        bucket=routing.bucket,
        png_path=png_path,
        metadata_path=json_path,
        review_card_path=review_card_path,
        routing=routing,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Chromie from art-derived compositor")
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--token-id", type=int, default=1)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="Output root. With --flat: {out}/images + {out}/metadata. Otherwise bucket subdirs.",
    )
    parser.add_argument(
        "--flat",
        action="store_true",
        help="Write directly to {out}/images and {out}/metadata (no review bucket folders).",
    )
    parser.add_argument(
        "--mode",
        choices=[m.value for m in ValidationMode],
        default=DEFAULT_VALIDATION_MODE.value,
        help="Validation mode (default: art_pipeline)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Deprecated alias for --mode strict",
    )
    parser.add_argument(
        "--lenient",
        action="store_true",
        help="Deprecated alias for --mode lenient",
    )
    args = parser.parse_args()

    validation_mode = ValidationMode.from_str(args.mode)
    if args.strict:
        validation_mode = ValidationMode.STRICT
    if args.lenient:
        validation_mode = ValidationMode.LENIENT

    flat = args.flat or args.out is not None
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    guard.snapshot_before()

    for i in range(args.count):
        seed = args.seed + i
        token_id = args.token_id + i
        saved = save_identity(
            seed,
            token_id,
            out=args.out,
            validation_mode=validation_mode,
            flat_output=flat,
            art_guard=guard,
        )
        print(f"Generated token {token_id} seed {seed} -> bucket: {saved.bucket}")
        if saved.routing.reason and saved.bucket != "passed":
            print(f"  reason:   {saved.routing.reason}")
            for line in saved.routing.reasons:
                print(f"            {line}")
        print(f"  image:    {saved.png_path}")
        print(f"  metadata: {saved.metadata_path}")
        if saved.review_card_path:
            print(f"  review:   {saved.review_card_path}")

    guard.verify_unchanged()
    print(f"Source art hash verified unchanged: {guard.before_hash[:16]}…")


if __name__ == "__main__":
    main()
