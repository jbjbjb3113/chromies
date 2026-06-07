import { readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const foregroundDir = resolve(process.cwd(), "public/foreground");
const manifestPath = resolve(foregroundDir, "manifest.json");

async function main(): Promise<void> {
  const entries = await readdir(foregroundDir);
  const images = entries
    .filter((name) => /^.+\.png$/i.test(name))
    .sort()
    .map((name) => `/foreground/${name}`);

  await writeFile(
    manifestPath,
    `${JSON.stringify({ images }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Foreground manifest: ${images.length} image(s) → ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
