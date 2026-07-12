"""100-token smoke test with source-art integrity verification."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from engine.art_safety import ReadOnlyArtGuard
from engine.batch_guards import BatchGuardContext, build_trait_vector_key
from engine.config import GENERATED_DIR, REPORTS_DIR, ROOT
from engine.generate_character import forge_identity
from engine.validation_modes import DEFAULT_VALIDATION_MODE


def _strength_histogram(totals: list[int]) -> dict[str, int]:
    buckets = Counter()
    for total in totals:
        if total >= 80:
            buckets["80-100"] += 1
        elif total >= 70:
            buckets["70-79"] += 1
        elif total >= 60:
            buckets["60-69"] += 1
        elif total >= 50:
            buckets["50-59"] += 1
        else:
            buckets["0-49"] += 1
    return dict(buckets)


def _report_name_for_output(out_root: Path) -> str:
    name = out_root.name
    if name.startswith("smoke_") or name.startswith("dryrun_"):
        return f"{name}_report.json"
    return "smoke_100_report.json"


def _trait_outliers(slot_counts: dict[str, Counter[str]], count: int) -> dict[str, list[dict]]:
    """Flag per-slot variants with unusually low frequency in this batch."""
    floor = max(2, int(count * 0.002))
    outliers: dict[str, list[dict]] = {}
    for slot, counter in sorted(slot_counts.items()):
        rare = [
            {"variant": name, "count": freq}
            for name, freq in counter.most_common()
            if freq <= floor
        ]
        if rare:
            outliers[slot] = sorted(rare, key=lambda item: item["count"])
    return outliers


def run_smoke_test(
    *,
    count: int = 100,
    seed_start: int = 1,
    token_start: int = 1,
    out_dir: Path | None = None,
) -> dict:
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    hash_before = guard.snapshot_before()

    out_root = out_dir or (GENERATED_DIR / "smoke_100")
    if not out_root.is_absolute():
        out_root = ROOT / out_root
    images_dir = out_root / "images"
    metadata_dir = out_root / "metadata"
    images_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    batch = BatchGuardContext()
    bucket_counts: Counter[str] = Counter()
    review_reasons: Counter[str] = Counter()
    reject_reasons: Counter[str] = Counter()
    archetype_counts: Counter[str] = Counter()
    palette_counts: Counter[str] = Counter()
    slot_trait_counts: dict[str, Counter[str]] = {}
    reject_examples: list[dict] = []
    review_examples: list[dict] = []
    pixel_counts: list[int] = []
    color_counts: list[int] = []
    strength_totals: list[int] = []
    trait_keys: dict[str, int] = {}
    near_dup_keys: dict[str, list[int]] = {}
    duplicate_vectors: list[dict] = []
    near_duplicate_combos: list[dict] = []
    prevention_events: list[dict] = []
    write_violations: list[str] = []

    for i in range(count):
        seed = seed_start + i
        token_id = token_start + i
        try:
            image, metadata, routing, compositor_result = forge_identity(
                seed, token_id, validation_mode=DEFAULT_VALIDATION_MODE, batch=batch
            )
            stem = f"chromie_{token_id:04d}"
            Image.fromarray(image, mode="RGBA").save(images_dir / f"{stem}.png")
            metadata_path = metadata_dir / f"{stem}.json"
            metadata_path.write_text(
                json.dumps(metadata.model_dump(by_alias=True), indent=2),
                encoding="utf-8",
            )

            bucket_counts[routing.bucket] += 1
            strength_totals.append(metadata.identity_strength.total)

            comp_block = metadata.rarity.get("compositor", {})
            char_block = comp_block.get("character") or {}
            archetype_counts[char_block.get("archetype_key") or "unknown"] += 1
            palette_counts[str(comp_block.get("palette") or "unknown")] += 1
            for slot, value in (comp_block.get("render_traits") or {}).items():
                slot_trait_counts.setdefault(slot, Counter())[str(value)] += 1

            if routing.bucket == "review":
                review_reasons[routing.reason or "UNKNOWN"] += 1
                for detail in routing.reasons or []:
                    review_reasons[detail] += 1
                if len(review_examples) < 10:
                    review_examples.append(
                        {
                            "token_id": token_id,
                            "seed": seed,
                            "reason": routing.reason,
                            "reasons": routing.reasons,
                            "identity_strength_total": metadata.identity_strength.total,
                        }
                    )
            elif routing.bucket != "passed":
                reject_reasons[routing.reason or "UNKNOWN"] += 1
                for detail in routing.reasons or []:
                    reject_reasons[detail] += 1
                if len(reject_examples) < 10:
                    reject_examples.append(
                        {
                            "token_id": token_id,
                            "seed": seed,
                            "bucket": routing.bucket,
                            "reason": routing.reason,
                            "reasons": routing.reasons,
                            "identity_strength_total": metadata.identity_strength.total,
                        }
                    )

            pixel_counts.append(metadata.validation.pixel.pixel_count)
            color_counts.append(metadata.validation.palette.distinct_colors)

            guard_meta = compositor_result.batch_guard or {}
            slot_order = list((comp_block.get("render_traits") or {}).keys())
            key = guard_meta.get("trait_vector_key") or comp_block.get("batch_guard", {}).get(
                "trait_vector_key"
            )
            if not key:
                char = comp_block.get("character") or {}
                render = comp_block.get("render_traits") or {}
                key = build_trait_vector_key(
                    {
                        "name": char.get("name"),
                        "gender": char.get("gender"),
                    },
                    str(comp_block.get("palette") or ""),
                    {slot: {"variant": {"name": name}} for slot, name in render.items()},
                    slot_order,
                )

            if key in trait_keys:
                duplicate_vectors.append(
                    {
                        "trait_vector": key,
                        "token_a": trait_keys[key],
                        "token_b": token_id,
                    }
                )
            else:
                trait_keys[key] = token_id

            near_key = guard_meta.get("near_dup_combo_key")
            if near_key:
                if near_key in near_dup_keys:
                    near_duplicate_combos.append(
                        {
                            "near_dup_combo_key": near_key,
                            "token_a": near_dup_keys[near_key][0],
                            "token_b": token_id,
                            "count": len(near_dup_keys[near_key]) + 1,
                        }
                    )
                near_dup_keys.setdefault(near_key, []).append(token_id)

            for reroll in guard_meta.get("dedupe_rerolls") or []:
                prevention_events.append({"token_id": token_id, "seed": seed, **reroll, "type": "dedupe_reroll"})
            for reroll in guard_meta.get("combo_cap_rerolls") or []:
                prevention_events.append(
                    {"token_id": token_id, "seed": seed, **reroll, "type": "combo_cap_reroll"}
                )
        except Exception as exc:
            bucket_counts["error"] += 1
            reject_reasons[type(exc).__name__] += 1
            write_violations.append(f"token {token_id}: {exc}")

    hash_after = guard.snapshot_after()
    guard.verify_unchanged()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "validation_mode": DEFAULT_VALIDATION_MODE.value,
        "count": count,
        "seed_start": seed_start,
        "token_start": token_start,
        "output_dir": str(out_root),
        "source_art": {
            "root": str(guard.root),
            "file_count": guard.file_count,
            "hash_before": hash_before,
            "hash_after": hash_after,
            "unchanged": hash_before == hash_after,
            "write_violations": write_violations,
        },
        "buckets": dict(bucket_counts),
        "pass_count": bucket_counts.get("passed", 0),
        "review_count": bucket_counts.get("review", 0),
        "reject_count": bucket_counts.get("rejected", 0) + bucket_counts.get("error", 0),
        "top_review_reasons": review_reasons.most_common(15),
        "top_reject_reasons": reject_reasons.most_common(15),
        "review_examples": review_examples,
        "reject_examples": reject_examples,
        "distributions": {
            "archetype": dict(archetype_counts.most_common()),
            "palette": dict(palette_counts.most_common()),
            "traits_by_slot": {
                slot: dict(counter.most_common()) for slot, counter in sorted(slot_trait_counts.items())
            },
            "trait_outliers": _trait_outliers(slot_trait_counts, count),
        },
        "duplicate_trait_vectors": duplicate_vectors,
        "duplicate_trait_vector_count": len(duplicate_vectors),
        "near_duplicate_combos": near_duplicate_combos,
        "near_duplicate_combo_count": len(near_duplicate_combos),
        "duplicate_prevention": {
            "dedupe_reroll_total": batch.dedupe_reroll_total,
            "combo_cap_reroll_total": batch.combo_cap_reroll_total,
            "event_count": len(batch.events),
            "events": [event.to_dict() for event in batch.events],
            "logged_events": prevention_events,
        },
        "identity_strength": {
            "min": min(strength_totals) if strength_totals else 0,
            "max": max(strength_totals) if strength_totals else 0,
            "average": round(sum(strength_totals) / len(strength_totals), 2) if strength_totals else 0,
            "histogram": _strength_histogram(strength_totals),
        },
        "average_pixel_count": round(sum(pixel_counts) / len(pixel_counts), 2) if pixel_counts else 0,
        "average_color_count": round(sum(color_counts) / len(color_counts), 2) if color_counts else 0,
        "min_pixel_count": min(pixel_counts) if pixel_counts else 0,
        "max_pixel_count": max(pixel_counts) if pixel_counts else 0,
        "calibration_notes": {
            "v1_review_explanation": (
                "Smoke v1 sent 21 tokens to review solely because Identity Strength totals "
                "fell in band 62-68 (below pass threshold 69). All had passing hard validation. "
                "v2 uses trigger-based review (weak subscores, orphans, legibility) instead of "
                "a narrow total-score band."
            ),
        },
    }

    report_path = REPORTS_DIR / _report_name_for_output(out_root)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report["report_path"] = str(report_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run 100-token compositor smoke test")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--seed-start", type=int, default=1)
    parser.add_argument("--token-start", type=int, default=1)
    parser.add_argument("--out", type=str, default="generated/smoke_100")
    args = parser.parse_args()

    report = run_smoke_test(
        count=args.count,
        seed_start=args.seed_start,
        token_start=args.token_start,
        out_dir=Path(args.out),
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
