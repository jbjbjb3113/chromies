#!/usr/bin/env python3
"""
Generate Chromie component candidates with a trained kohya LoRA + SD 1.5.

Run from art-pipeline/lora-pipeline/:
  py -3.12 generate-asset.py "chromie pixel art hair new style" --output HAIR_NewStyle.png

Requires: pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import re
import sys
import traceback
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
ART_PIPELINE_DIR = SCRIPT_DIR.parent
CONFIG_PATH = ART_PIPELINE_DIR / "chromies-config.js"
DEFAULT_LORA = SCRIPT_DIR / "output" / "chromie-lora-v1.safetensors"
DEFAULT_MODEL = "runwayml/stable-diffusion-v1-5"
CANDIDATES_DIR = SCRIPT_DIR / "candidates"
SIZE = 64
BACKGROUND_WHITE_MIN = 240
BACKGROUND_PALETTE_TOLERANCE = 10

# SIGNAL palette fallback (synced with chromies-config.js)
SIGNAL_PALETTE_FALLBACK = [
    "#e3e5e4", "#1a0d0e", "#2a1518", "#f0eae0",
    "#4c270f", "#89532a", "#b2723f", "#d18b4d",
    "#df9c5e", "#1c1c26", "#1a0a14", "#a01856",
    "#ff2d8a", "#4d051b", "#9b2352", "#db5a91",
]


def load_signal_palette(config_path: Path) -> list[str]:
    if not config_path.exists():
        return SIGNAL_PALETTE_FALLBACK

    text = config_path.read_text(encoding="utf-8")
    match = re.search(r"SIGNAL:\s*\{.*?colors:\s*\[(.*?)\]", text, re.DOTALL)
    if not match:
        return SIGNAL_PALETTE_FALLBACK

    colors = re.findall(r"#[0-9a-fA-F]{6}", match.group(1))
    return colors if len(colors) == 16 else SIGNAL_PALETTE_FALLBACK


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def build_palette_image(hex_colors: list[str]) -> Image.Image:
    if not hex_colors:
        raise ValueError("SIGNAL palette is empty; cannot quantize.")
    palette: list[int] = []
    for hx in hex_colors:
        palette.extend(hex_to_rgb(hx))
    # PIL palette images expect 256 RGB triplets (768 values).
    palette.extend([0] * (768 - len(palette)))
    pal = Image.new("P", (16, 16))
    pal.putpalette(palette)
    return pal


def quantize_to_signal(img: Image.Image, hex_colors: list[str]) -> Image.Image:
    if len(hex_colors) < 2:
        raise ValueError(
            f"SIGNAL palette must have at least 2 colors for quantize, got {len(hex_colors)}."
        )
    rgb = img.convert("RGB").resize((SIZE, SIZE), Image.Resampling.NEAREST)
    pal_img = build_palette_image(hex_colors)
    indexed = rgb.quantize(
        colors=len(hex_colors),
        palette=pal_img,
        dither=Image.Dither.NONE,
    )
    return indexed.convert("RGB")


def strip_background(
    img: Image.Image,
    hex_colors: list[str],
    *,
    white_min: int = BACKGROUND_WHITE_MIN,
    bg_tolerance: int = BACKGROUND_PALETTE_TOLERANCE,
) -> Image.Image:
    """Make near-white and palette-background pixels fully transparent."""
    rgba = img.convert("RGBA")
    bg_rgb = hex_to_rgb(hex_colors[0]) if hex_colors else hex_to_rgb(SIGNAL_PALETTE_FALLBACK[0])
    pixels = rgba.load()
    width, height = rgba.size
    stripped = 0

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            near_white = r >= white_min and g >= white_min and b >= white_min
            near_palette_bg = (
                max(abs(r - bg_rgb[0]), abs(g - bg_rgb[1]), abs(b - bg_rgb[2])) <= bg_tolerance
            )
            if near_white or near_palette_bg:
                pixels[x, y] = (r, g, b, 0)
                stripped += 1

    print(
        f"Background strip: {stripped} px transparent "
        f"(white min={white_min}, palette bg={bg_rgb}, tol={bg_tolerance})"
    )
    return rgba


def load_chromie_lora(pipe, lora_path: Path, *, adapter_name: str = "chromie") -> None:
    """Load kohya LoRA into UNet only.

    diffusers' load_lora_weights() also loads the text encoder; kohya checkpoints
    often fail there (empty rank dict after key conversion). UNet weights are
    sufficient for image generation.
    """
    state_dict, network_alphas, metadata = pipe.lora_state_dict(
        str(lora_path),
        return_lora_metadata=True,
    )
    if not state_dict or not all("lora" in key for key in state_dict.keys()):
        raise ValueError("Invalid LoRA checkpoint: no lora-prefixed weights found.")

    pipe.load_lora_into_unet(
        state_dict,
        network_alphas=network_alphas,
        unet=pipe.unet,
        adapter_name=adapter_name,
        metadata=metadata,
        _pipeline=pipe,
    )
    pipe.set_adapters([adapter_name])


def generate_image(
    prompt: str,
    *,
    model_id: str,
    lora_path: Path,
    steps: int,
    guidance: float,
    seed: int | None,
) -> Image.Image:
    import torch
    from diffusers import StableDiffusionPipeline

    if not lora_path.exists():
        raise FileNotFoundError(f"LoRA not found: {lora_path}")

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    device = "cuda" if torch.cuda.is_available() else "cpu"

    print(f"Loading base model: {model_id}")
    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=dtype)
    pipe = pipe.to(device)

    print(f"Loading LoRA (UNet only): {lora_path}")
    load_chromie_lora(pipe, lora_path)

    generator = None
    if seed is not None:
        generator = torch.Generator(device=device).manual_seed(seed)

    print(f"Generating {SIZE}x{SIZE}: {prompt!r}")
    result = pipe(
        prompt=prompt,
        negative_prompt="blurry, photorealistic, 3d, smooth gradient, anti-aliased",
        width=SIZE,
        height=SIZE,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=generator,
    ).images[0]

    pipe.unload_lora_weights()
    del pipe
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Chromie component art with trained LoRA (64x64, SIGNAL palette)."
    )
    parser.add_argument("prompt", help='Text prompt, e.g. "chromie pixel art hair new style"')
    parser.add_argument(
        "--output", "-o", required=True, help="Output filename in lora-pipeline/candidates/"
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SD 1.5 base model id or path")
    parser.add_argument("--lora", default=str(DEFAULT_LORA), help="Path to LoRA .safetensors")
    parser.add_argument("--steps", type=int, default=30, help="Inference steps")
    parser.add_argument("--guidance", type=float, default=7.5, help="Classifier-free guidance scale")
    parser.add_argument("--seed", type=int, default=None, help="Random seed (optional)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_name = Path(args.output).name
    if output_name != args.output or ".." in args.output:
        print("Error: --output must be a plain filename (no directories).", file=sys.stderr)
        return 1

    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = CANDIDATES_DIR / output_name

    try:
        raw = generate_image(
            args.prompt,
            model_id=args.model,
            lora_path=Path(args.lora),
            steps=args.steps,
            guidance=args.guidance,
            seed=args.seed,
        )
        signal = load_signal_palette(CONFIG_PATH)
        final = quantize_to_signal(raw, signal)
        final = strip_background(final, signal)
        final.save(out_path, format="PNG")
    except Exception as err:
        print(f"Generation failed: {err}", file=sys.stderr)
        traceback.print_exc()
        return 1

    print(f"Saved: {out_path}")
    print(f"Palette: SIGNAL ({len(signal)} colors from {CONFIG_PATH.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
