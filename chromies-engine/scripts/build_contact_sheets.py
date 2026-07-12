"""Build contact-sheet PNG previews from dry-run output."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DRYRUN = ROOT / "generated" / "dryrun_1000"
IMAGES_DIR = DRYRUN / "images"
METADATA_DIR = DRYRUN / "metadata"
REPORTS = ROOT / "reports"

SCALE = 6
COLS_MAIN = 10
ROWS_MAIN = 10
LABEL_H = 18
PAD = 4
BG = (24, 24, 28, 255)
LABEL_FG = (220, 220, 220, 255)


def _load_font(size: int = 11) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("consola.ttf", "Consolas.ttf", "cour.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _read_meta(token_id: int) -> dict:
    path = METADATA_DIR / f"chromie_{token_id:04d}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _passed_token_ids() -> list[int]:
    ids: list[int] = []
    for path in sorted(METADATA_DIR.glob("chromie_*.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        if meta.get("review", {}).get("bucket") == "passed":
            ids.append(int(meta["token_id"]))
    return sorted(ids)


def _scale_nearest(img: Image.Image, scale: int) -> Image.Image:
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def _draw_cell(
    sheet: Image.Image,
    draw: ImageDraw.ImageDraw,
    font: ImageFont.ImageFont,
    img: Image.Image,
    col: int,
    row: int,
    cell_w: int,
    cell_h: int,
    label: str,
) -> None:
    x0 = PAD + col * (cell_w + PAD)
    y0 = PAD + row * (cell_h + PAD)
    scaled = _scale_nearest(img, SCALE)
    sx = x0 + (cell_w - scaled.width) // 2
    sy = y0
    sheet.paste(scaled, (sx, sy), scaled if scaled.mode == "RGBA" else None)
    tw = draw.textlength(label, font=font)
    tx = x0 + (cell_w - tw) // 2
    ty = y0 + scaled.height + 2
    draw.text((tx, ty), label, fill=LABEL_FG, font=font)


def build_main_contact_sheet(token_ids: list[int], out_path: Path) -> None:
    font = _load_font()
    sample = Image.open(IMAGES_DIR / f"chromie_{token_ids[0]:04d}.png")
    cell_w = sample.width * SCALE
    cell_h = sample.height * SCALE + LABEL_H
    sheet_w = PAD + COLS_MAIN * (cell_w + PAD)
    sheet_h = PAD + ROWS_MAIN * (cell_h + PAD)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), BG)
    draw = ImageDraw.Draw(sheet)

    for idx, token_id in enumerate(token_ids[: COLS_MAIN * ROWS_MAIN]):
        row, col = divmod(idx, COLS_MAIN)
        img = Image.open(IMAGES_DIR / f"chromie_{token_id:04d}.png").convert("RGBA")
        _draw_cell(sheet, draw, font, img, col, row, cell_w, cell_h, f"#{token_id}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    print(f"Wrote {out_path} ({sheet_w}x{sheet_h})")


def _find_archetype_samples() -> list[tuple[str, int]]:
    targets = [
        ("HeroA Male", "HeroA:Male"),
        ("HeroA Female", "HeroA:Female"),
        ("Chubby", "Chubby:Male"),
        ("SideProfile Male", "SideProfile:Male"),
        ("SideProfile Female", "SideProfile:Female"),
        ("Zombie", "Zombie:None"),
        ("Agent", "Agent:None"),
        ("Alien", "Alien:Non-Binary"),
    ]
    found: list[tuple[str, int]] = []
    for label, key in targets:
        for path in sorted(METADATA_DIR.glob("chromie_*.json")):
            meta = json.loads(path.read_text(encoding="utf-8"))
            comp = meta.get("rarity", {}).get("compositor", {})
            archetype = (comp.get("character") or {}).get("archetype_key")
            if archetype == key:
                found.append((label, int(meta["token_id"])))
                break
        else:
            print(f"Warning: no token found for {label} ({key})")
    return found


def build_archetype_sheet(samples: list[tuple[str, int]], out_path: Path) -> None:
    font = _load_font(10)
    cols = 4
    rows = (len(samples) + cols - 1) // cols
    sample = Image.open(IMAGES_DIR / f"chromie_{samples[0][1]:04d}.png")
    cell_w = sample.width * SCALE
    cell_h = sample.height * SCALE + LABEL_H + 10
    sheet_w = PAD + cols * (cell_w + PAD)
    sheet_h = PAD + rows * (cell_h + PAD)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), BG)
    draw = ImageDraw.Draw(sheet)

    for idx, (label, token_id) in enumerate(samples):
        row, col = divmod(idx, cols)
        img = Image.open(IMAGES_DIR / f"chromie_{token_id:04d}.png").convert("RGBA")
        _draw_cell(sheet, draw, font, img, col, row, cell_w, cell_h, label)
        tw = draw.textlength(f"#{token_id}", font=font)
        x0 = PAD + col * (cell_w + PAD)
        y0 = PAD + row * (cell_h + PAD)
        draw.text(
            (x0 + (cell_w - tw) // 2, y0 + sample.height * SCALE + LABEL_H - 2),
            f"#{token_id}",
            fill=(160, 160, 160, 255),
            font=font,
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    print(f"Wrote {out_path} ({sheet_w}x{sheet_h})")


def main() -> None:
    passed = _passed_token_ids()
    print(f"Passed tokens: {len(passed)}")
    build_main_contact_sheet(passed, REPORTS / "dryrun_1000_contact_sheet.png")
    samples = _find_archetype_samples()
    build_archetype_sheet(samples, REPORTS / "archetype_sample_sheet.png")


if __name__ == "__main__":
    main()
