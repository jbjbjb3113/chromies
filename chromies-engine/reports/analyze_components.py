"""Analyze art-pipeline/components for Identity Forge asset report."""
from __future__ import annotations

import hashlib
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean

from PIL import Image
import numpy as np

ROOT = Path(r"X:\Cursor\Homies\art-pipeline\components")
TRAITS_JSON = Path(r"X:\Cursor\Homies\art-pipeline\traits.json")
OUT = Path(__file__).parent / "components_full_report.json"

CATEGORY_RULES = [
    (r"^SP_", "side_profile"),
    (r"^HEAD|^MasterHead", "head"),
    (r"^MASK", "mask"),
    (r"^EYES", "eyes"),
    (r"^EXPRESSION", "expression"),
    (r"^HAIR", "hair"),
    (r"^BEARD", "beard"),
    (r"^MUSTACHE|^Mustache", "mustache"),
    (r"^GLASSES", "glasses"),
    (r"^HOOD", "hood"),
    (r"^BODYTATTOO|^TATTOO", "tattoo"),
    (r"^BODY[^T]|^BODY$", "body"),
    (r"^SHIRT", "clothing_shirt"),
    (r"^NECKLACE|^NECK", "neck_accessory"),
    (r"^EARRINGS|^EARRING", "earrings"),
    (r"^ACCESSORY", "accessory"),
    (r"^NORMIE", "normie_reference"),
]

BODY_MORPHS = {
    "": "default",
    "male": "male",
    "female": "female",
    "Chubby": "chubby",
    "chubby": "chubby",
    "sideprofile": "sideprofile_legacy",
    "SideProfile_Male": "sideprofile_male",
    "SideProfile_Female": "sideprofile_female",
    "zombie": "zombie",
    "alien": "alien",
    "Agent": "agent",
    "legendary": "legendary",
}


def categorize(stem: str, folder: str, ext: str) -> str:
    if ext == ".gpl":
        return "palette"
    if ext in {".aseprite", ".ase"}:
        return "source_art"
    for pat, cat in CATEGORY_RULES:
        if re.search(pat, stem, re.I):
            return cat
    if folder == "legendary":
        return "legendary_asset"
    return "uncategorized"


def analyze_file(path: Path) -> dict:
    rel = path.relative_to(ROOT)
    folder = str(rel.parent).replace("\\", "/") if rel.parent != Path(".") else ""
    entry = {
        "path": str(rel).replace("\\", "/"),
        "folder": folder,
        "name": path.name,
        "stem": path.stem,
        "ext": path.suffix.lower(),
        "bytes": path.stat().st_size,
        "category": categorize(path.stem, folder, path.suffix.lower()),
        "body_morph": BODY_MORPHS.get(folder.replace("\\", "/"), folder or "root"),
    }
    if path.suffix.lower() != ".png":
        entry["asset_type"] = entry["category"]
        return entry

    try:
        im = Image.open(path).convert("RGBA")
        arr = np.array(im)
        alpha = arr[:, :, 3]
        opaque = alpha == 255
        entry.update(
            {
                "asset_type": "png_layer",
                "size": list(im.size),
                "opaque_pixels": int(opaque.sum()),
                "partial_alpha": int(((alpha > 0) & (alpha < 255)).sum()),
                "distinct_colors": len({tuple(map(int, c)) for c in arr[opaque][:, :3]}) if opaque.any() else 0,
            }
        )
        if opaque.any():
            ys, xs = np.where(opaque)
            entry["bbox"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            entry["bbox_w"] = entry["bbox"][2] - entry["bbox"][0] + 1
            entry["bbox_h"] = entry["bbox"][3] - entry["bbox"][1] + 1
            entry["anchor"] = {
                "feet_y": entry["bbox"][3],
                "head_top_y": entry["bbox"][1],
                "center_x": round((entry["bbox"][0] + entry["bbox"][2]) / 2, 2),
            }
        entry["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        buf = io.BytesIO()
        im.transpose(Image.FLIP_LEFT_RIGHT).save(buf, format="PNG")
        entry["flip_sha256"] = hashlib.sha256(buf.getvalue()).hexdigest()[:16]
    except Exception as e:
        entry["error"] = str(e)
    return entry


def main() -> None:
    files = [analyze_file(p) for p in sorted(ROOT.rglob("*")) if p.is_file()]
    pngs = [f for f in files if f.get("asset_type") == "png_layer"]

    by_hash: dict[str, list[str]] = defaultdict(list)
    by_flip: dict[str, str] = {}
    for f in pngs:
        if "sha256" in f:
            by_hash[f["sha256"]].append(f["path"])
            by_flip[f["path"]] = f.get("flip_sha256", "")

    duplicates = {h: ps for h, ps in by_hash.items() if len(ps) > 1}
    mirror_pairs = []
    sha_map = {f["sha256"]: f["path"] for f in pngs if "sha256" in f}
    for f in pngs:
        flip = f.get("flip_sha256")
        if flip and flip in sha_map and sha_map[flip] != f["path"]:
            pair = tuple(sorted([f["path"], sha_map[flip]]))
            if pair not in mirror_pairs:
                mirror_pairs.append(pair)

    violations = []
    for f in pngs:
        if f.get("size") != [64, 64]:
            continue
        issues = []
        if f.get("partial_alpha", 0) > 0:
            issues.append("partial_alpha")
        p = ROOT / Path(f["path"])
        arr = np.array(Image.open(p).convert("RGBA"))
        alpha = arr[:, :, 3]
        opaque = alpha == 255
        edge = opaque.copy()
        edge[2:-2, 2:-2] = False
        if edge.any():
            issues.append("edge_touch")
        if f.get("opaque_pixels", 0) == 0:
            issues.append("empty_layer")
        if "NORMIE" in f["stem"] or "Normies" in f["stem"]:
            issues.append("normie_naming_in_library")
        if f["category"] == "side_profile":
            issues.append("side_profile_not_front_constitution")
        if issues:
            violations.append({"path": f["path"], "category": f["category"], "issues": issues})

    # traits.json crosswalk
    traits = json.loads(TRAITS_JSON.read_text(encoding="utf-8"))
    slot_files: dict[str, list[str]] = defaultdict(list)
    missing = []
    referenced = set()
    for slot, data in traits.get("slots", {}).items():
        for v in data.get("variants", []):
            f = v.get("file", "")
            if not f:
                continue
            referenced.add(f.replace("\\", "/"))
            slot_files[slot].append(f.replace("\\", "/"))
            if not (ROOT / Path(f)).exists():
                missing.append(f.replace("\\", "/"))

    on_disk = {f["path"] for f in pngs}
    unreferenced = sorted(on_disk - referenced)

    cat_counts = defaultdict(int)
    for f in files:
        cat_counts[f["category"]] += 1

    anchor_stats = {}
    for cat in sorted(set(f["category"] for f in pngs)):
        subset = [f for f in pngs if f["category"] == cat and f.get("anchor")]
        if not subset:
            continue
        anchor_stats[cat] = {
            "count": len(subset),
            "feet_y_mean": round(mean(x["anchor"]["feet_y"] for x in subset), 2),
            "head_top_mean": round(mean(x["anchor"]["head_top_y"] for x in subset), 2),
            "center_x_mean": round(mean(x["anchor"]["center_x"] for x in subset), 2),
        }

    # normalize trait values
    trait_values: dict[str, set[str]] = defaultdict(set)
    for f in pngs:
        stem = f["stem"]
        for prefix in (
            "SP_",
            "HAIR_",
            "GLASSES_",
            "EYES_",
            "BEARD_",
            "BODY_",
            "HEAD_",
            "MASK_",
            "EXPRESSION_",
            "TATTOO_",
            "BODYTATTOO_",
            "NECKLACE_",
            "NECK_",
            "HOOD_",
            "SHIRT_",
            "ACCESSORY_",
            "MUSTACHE_",
            "EARRINGS_",
            "EARRING_",
        ):
            if stem.startswith(prefix):
                trait_values[f["category"]].add(stem[len(prefix) :])
                break
        else:
            trait_values[f["category"]].add(stem)

    report = {
        "summary": {
            "total_files": len(files),
            "png_layers": len(pngs),
            "size_64x64": sum(1 for f in pngs if f.get("size") == [64, 64]),
            "non_64x64": [f["path"] for f in pngs if f.get("size") != [64, 64]],
            "empty_layers": [f["path"] for f in pngs if f.get("opaque_pixels", 0) == 0],
            "duplicate_groups": len(duplicates),
            "mirror_pairs": len(mirror_pairs),
            "traits_json_referenced": len(referenced),
            "traits_json_missing_on_disk": missing,
            "unreferenced_pngs": len(unreferenced),
        },
        "category_counts": dict(sorted(cat_counts.items(), key=lambda x: -x[1])),
        "anchor_stats_by_category": anchor_stats,
        "trait_values_by_category": {k: sorted(v) for k, v in trait_values.items()},
        "duplicate_groups": {h: ps for h, ps in list(duplicates.items())[:30]},
        "mirror_pairs": mirror_pairs[:30],
        "slot_files_from_traits_json": {k: v for k, v in slot_files.items()},
        "traits_json_slots": list(traits.get("slots", {}).keys()),
        "unreferenced_pngs_sample": unreferenced[:40],
        "constitution_violations": violations,
        "inventory": files,
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    print("SLOTS", report["traits_json_slots"])
    print("CATEGORIES", report["category_counts"])


if __name__ == "__main__":
    main()
