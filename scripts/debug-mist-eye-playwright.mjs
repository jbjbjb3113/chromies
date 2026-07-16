/**
 * Playwright: systematic mist eye-cycle debug on /awaken-demo.
 * Usage: node scripts/debug-mist-eye-playwright.mjs [baseUrl]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outDir = path.join("out", "rig");
const ACCESS = "chromies-mist-demo";

async function enterDemo(page) {
  const codeInput = page.locator('input[type="password"]');
  if (await codeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await codeInput.fill(ACCESS);
    await page.getByRole("button", { name: "Enter" }).click();
  }
  await page.waitForSelector('canvas[role="img"]', { timeout: 120000 });
}

function sampleCanvasEyePixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas[role="img"]');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const coords = [
      [25, 25],
      [27, 25],
      [35, 25],
      [37, 25],
    ];
    const samples = [];
    for (const [x, y] of coords) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      samples.push({ x, y, rgba: [d[0], d[1], d[2], d[3]] });
    }
    return { canvasSize: [w, canvas.height], samples };
  });
}

async function runScenario(browser, { name, query, waitMs }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[mist-eye]")) logs.push({ t: Date.now(), text });
  });

  await page.goto(`${baseUrl}/awaken-demo?${query}`, { waitUntil: "domcontentloaded" });
  await enterDemo(page);

  const afterLoad = await sampleCanvasEyePixels(page);
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  const afterWait = await sampleCanvasEyePixels(page);

  const shot = path.join(outDir, `debug-live-${name}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const swaps = logs.filter((l) => l.text.includes("swap START") || l.text.includes("swap END"));
  const forced = logs.filter((l) => l.text.includes("FORCED"));
  const baseLoad = logs.filter((l) => l.text.includes("baseImageData"));

  await page.close();

  return {
    name,
    query,
    waitMs,
    screenshot: shot,
    swapCount: swaps.filter((l) => l.text.includes("swap START")).length,
    swaps,
    forced,
    baseLoad,
    canvasAfterLoad: afterLoad,
    canvasAfterWait: afterWait,
    totalLogs: logs.length,
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  const results = [];
  results.push(
    await runScenario(browser, {
      name: "baseline-no-debug",
      query: "",
      waitMs: 2000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "fast-cycle-65s",
      query: "mistEyeDebug=1&mistEyeFast=1",
      waitMs: 65000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "force-stoned",
      query: "mistEyeDebug=1&mistEyeForce=Chubby_Stoned",
      waitMs: 2000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "force-cross-eyed",
      query: "mistEyeDebug=1&mistEyeForce=Chubby_CrossEyed",
      waitMs: 2000,
    }),
  );

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
