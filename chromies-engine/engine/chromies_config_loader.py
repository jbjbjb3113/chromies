"""Load chromies-config.js exports without modifying source art."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def load_chromies_config(config_path: Path) -> dict[str, Any]:
    config_path = config_path.resolve()
    script = (
        "const cfg = require(process.argv[1]);"
        "console.log(JSON.stringify({"
        "roles: cfg.ROLES,"
        "palettes: cfg.PALETTES,"
        "settings: cfg.SETTINGS,"
        "characters: cfg.CHARACTERS"
        "}));"
    )
    try:
        proc = subprocess.run(
            ["node", "-e", script, str(config_path)],
            check=True,
            capture_output=True,
            text=True,
            cwd=str(config_path.parent),
        )
        return json.loads(proc.stdout)
    except (FileNotFoundError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Failed to load chromies-config.js via Node.js: {config_path}\n{exc}"
        ) from exc
