/**
 * Sample live canvas mouth pixels for color verification.
 * Usage: node scripts/debug-mist-mouth-colors-live.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const ACCESS = "chromies-mist-demo";
const EXPRESSIONS = [
  "Chubby_Smile",
  "Chubby_Frown",
  "Chubby_Neutral",
  "Chubby_Pouting",
];

async function enterDemo(page) {
  const codeInput = page.locator('input[type="password"]');
  if (await codeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await codeInput.fill(ACCESS);
    await page.getByRole("button", { name: "Enter" }).click();
  }
  await page.waitForSelector('canvas[role="img"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
}

function sampleCoords(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas[role="img"]');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const coords = [
      [29, 34],
      [31, 34],
      [32, 34],
      [33, 34],
      [31, 33],
      [32, 33],
      [32, 32],
    ];
    return coords.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { x, y, rgba: [d[0], d[1], d[2], d[3]] };
    });
  });
}

async function runCase(browser, name, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${baseUrl}/awaken-demo?${query}`, { waitUntil: "networkidle" });
  await enterDemo(page);
  const pixels = await sampleCoords(page);
  await page.close();
  return { name, query, pixels };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  results.push(
    await runCase(browser, "baseline", "mistMouthDebug=1"),
  );

  for (const expr of EXPRESSIONS) {
    results.push(
      await runCase(
        browser,
        `force-${expr}`,
        `mistMouthDebug=1&mistMouthForce=${expr}`,
      ),
    );
  }

  results.push(
    await runCase(
      browser,
      "talk-sim-only",
      "mistMouthDebug=1&mistTalkSim=1",
    ),
  );

  results.push(
    await runCase(
      browser,
      "talk-sim-full-open",
      "mistMouthDebug=1&mistTalkSim=1&mistMouthLevel=1",
    ),
  );

  results.push(
    await runCase(
      browser,
      "talk-sim-plus-force-smile",
      "mistMouthDebug=1&mistTalkSim=1&mistMouthForce=Chubby_Smile",
    ),
  );

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
