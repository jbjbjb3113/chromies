#!/usr/bin/env node
/** Apply JB-approved legendary palettes (IDs 28,29,32,33,34) to registry sources. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const approved = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/approved-legendary-palettes.json"), "utf8")
);

const cfgPath = path.join(ROOT, "art-pipeline/chromies-config.js");
let cfg = fs.readFileSync(cfgPath, "utf8");
const reg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "art-pipeline/palette-registry.json"), "utf8")
);

for (const [name, spec] of Object.entries(approved)) {
  const re = new RegExp(`${name}:\\s*\\{[\\s\\S]*?\\n  \\},`, "m");
  const desc = `${name.replace("NORMIE_", "Normie Legendary — ")} (JB-approved from final art, 2026-07-08).`;
  const repl = `${name}: {
    name: "${name}",
    description: "${desc}",
    colors: ${JSON.stringify(spec.colors)},
  }`;
  if (!re.test(cfg)) throw new Error(`config block not found: ${name}`);
  cfg = cfg.replace(re, repl);

  const entry = reg.palettes.find((p) => p.id === spec.id);
  if (!entry || entry.name !== name) throw new Error(`registry entry missing: ${name}`);
  entry.colors = spec.colors;
  entry.description = desc;
}

fs.writeFileSync(cfgPath, cfg);
fs.writeFileSync(
  path.join(ROOT, "art-pipeline/palette-registry.json"),
  `${JSON.stringify(reg, null, 2)}\n`
);
console.log("Updated:", Object.keys(approved).join(", "));
