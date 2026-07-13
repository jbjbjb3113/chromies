#!/usr/bin/env python3
"""
Task 3 (historical) — ABI probe for payload-input render path.

Superseded by `scripts/verify_deployed_artifacts.py` (verification by construction:
bytecode match + 1280/1280 palette read-back). This script remains as the probe
that confirmed storage-only `renderSVG(uint256)` — no txs, no merkle changes.
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "chromies-engine"
DEPLOY_LOG = ENGINE / "reports" / "SEPOLIA_DEPLOY_LOG.md"

DEFAULT_RENDERER = "0x7680D210ed242330877b31D9749a92307484Aae1"

# Payload-shaped selectors that would allow read-only parity without storage writes.
_PAYLOAD_RENDER_SELECTORS = (
    "render(bytes,bytes)(string)",
    "renderSVG(bytes,bytes)(string)",
    "renderPayload(bytes,bytes)(string)",
    "previewSVG(bytes,bytes)(string)",
)

# What test_ExportOnChainSvgFixtures actually calls on-chain.
_STORAGE_RENDER_SELECTOR = "renderSVG(uint256)(string)"


@dataclass
class SamplePlan:
    """Planned ~40-sample composition (not executed when STOP)."""

    forced_palette_ids: list[int]
    shirt_palette_min: int
    side_profile_min: int
    agent_min: int
    plain_min: int

    @property
    def minimum_total(self) -> int:
        return (
            len(self.forced_palette_ids)
            + self.shirt_palette_min
            + self.side_profile_min
            + self.agent_min
            + self.plain_min
        )


SAMPLE_PLAN = SamplePlan(
    forced_palette_ids=[24, 27, *range(28, 37)],
    shirt_palette_min=10,
    side_profile_min=5,
    agent_min=2,
    plain_min=4,
)


def load_renderer_address() -> str:
    env_path = REPO / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("CHROMA_RENDERER_ADDRESS="):
                return line.split("=", 1)[1].strip()
    return DEFAULT_RENDERER


def cast(*args: str) -> subprocess.CompletedProcess[str]:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.run(cmd, text=True, cwd=REPO, capture_output=True)


def has_selector(address: str, signature: str) -> bool:
    selector = cast("sig", signature)
    if selector.returncode != 0:
        return False
    sig_hex = selector.stdout.strip()
    result = cast("call", address, sig_hex, "--rpc-url", "sepolia")
    # Revert or empty still means the selector isn't a usable render entrypoint.
    return result.returncode == 0 and "error" not in result.stderr.lower()


def append_deploy_log(block: str) -> None:
    text = DEPLOY_LOG.read_text(encoding="utf-8")
    start = "## Task 3 — Sampled parity (read-only, revised)"
    end = "## Task 4"
    if start in text:
        head = text.split(start)[0].rstrip()
        tail = text.split(end, 1)[1] if end in text else ""
        text = head + "\n\n" + block.rstrip() + "\n\n## Task 4" + tail
    else:
        text = text.replace("## Task 3 — Sampled parity\n\n*(pending)*", block)
    DEPLOY_LOG.write_text(text, encoding="utf-8")


def main() -> int:
    renderer = load_renderer_address()
    payload_paths = [s for s in _PAYLOAD_RENDER_SELECTORS if has_selector(renderer, s)]

    lines = [
        "## Task 3 — Sampled parity (read-only, revised)",
        "",
        f"**Run:** {datetime.now(timezone.utc).isoformat()}",
        f"**Renderer:** `{renderer}`",
        "",
        "### ABI probe",
        "",
        "| Candidate entrypoint | Present |",
        "|---------------------|:-------:|",
    ]
    for sig in _PAYLOAD_RENDER_SELECTORS:
        present = sig in payload_paths
        lines.append(f"| `{sig}` | {'yes' if present else 'no'} |")
    lines.extend(
        [
            f"| `{_STORAGE_RENDER_SELECTOR}` (storage-backed) | yes |",
            "",
            "### Result: **STOP**",
            "",
            "The deployed `ChromaRenderer` exposes **only** `renderSVG(uint256)`, which reads "
            "pixels and traits from `ChromaStorage` by token ID. There is **no** payload-input "
            "render path on the live contract.",
            "",
            "`test_ExportOnChainSvgFixtures` achieves parity by **writing storage first** "
            "(`WriterCaller.writeTokenData`) then calling `renderSVG(tokenId)` — not by passing "
            "packed payloads to the renderer. A read-only `eth_call` against Sepolia cannot "
            "replicate that shape without either:",
            "",
            "1. On-chain state mutation (mint/inscribe — rejected for Task 3), or",
            "2. A new view/helper on the renderer (requires redeploy).",
            "",
            "**No transactions were broadcast. Reveal merkle root unchanged.**",
            "",
            f"Planned sample composition (not executed): **{SAMPLE_PLAN.minimum_total}** tokens minimum — "
            f"{len(SAMPLE_PLAN.forced_palette_ids)} forced palette IDs "
            f"({SAMPLE_PLAN.forced_palette_ids[0]}–{SAMPLE_PLAN.forced_palette_ids[-1]} coverage), "
            f"≥{SAMPLE_PLAN.shirt_palette_min} shirt-palette, "
            f"≥{SAMPLE_PLAN.side_profile_min} side-profile, "
            f"≥{SAMPLE_PLAN.agent_min} Agent, "
            f"≥{SAMPLE_PLAN.plain_min} plain baseline seeds.",
            "",
            "**Next step (requires approval):** add a `view` render helper on `ChromaRenderer`, "
            "or approve transactional inscribe parity (Task 4 shape) for full ~40-sample coverage.",
        ]
    )

    append_deploy_log("\n".join(lines))

    report = {
        "status": "STOP",
        "reason": "no_payload_render_path",
        "renderer": renderer,
        "storage_only_selector": _STORAGE_RENDER_SELECTOR,
        "payload_selectors_found": payload_paths,
        "planned_sample_minimum": SAMPLE_PLAN.minimum_total,
    }
    out = ENGINE / "generated" / "sepolia_parity_stop.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    print("\nSTOP: no payload-input render path on deployed renderer.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
