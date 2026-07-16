/**
 * Playwright: mouth expression overlay debug scenarios.
 * Usage: node scripts/debug-mist-mouth-playwright.mjs [baseUrl]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outDir = path.join("out", "rig");
const ACCESS = "chromies-mist-demo";

function sampleMouthPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas[role="img"]');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const coords = [
      [29, 34],
      [32, 34],
      [28, 33],
      [35, 33],
    ];
    return coords.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { x, y, rgba: [d[0], d[1], d[2], d[3]] };
    });
  });
}

async function enterDemo(page) {
  const codeInput = page.locator('input[type="password"]');
  if (await codeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await codeInput.fill(ACCESS);
    await page.getByRole("button", { name: "Enter" }).click();
  }
  await page.waitForSelector('canvas[role="img"]', { timeout: 120000 });
}

async function runScenario(browser, { name, query, waitMs }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[mist-mouth]")) logs.push({ t: Date.now(), text });
  });

  await page.goto(`${baseUrl}/awaken-demo?${query}`, { waitUntil: "domcontentloaded" });
  await enterDemo(page);
  await page.waitForTimeout(waitMs);

  const mouthPixels = await sampleMouthPixels(page);
  const shot = path.join(outDir, `debug-mouth-${name}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const resets = logs.filter((l) => l.text.includes("resetMouthExpressionState"));
  const resumes = logs.filter((l) => l.text.includes("resumeMouthExpressionCycle"));
  const forced = logs.filter((l) => l.text.includes("FORCED expression"));
  const audioEdges = logs.filter((l) => l.text.includes("isAudioPlaying edge"));

  await page.close();

  return {
    name,
    query,
    waitMs,
    screenshot: shot,
    mouthPixels,
    resetCount: resets.length,
    resumeCount: resumes.length,
    resets,
    resumes,
    forced,
    audioEdges,
    totalLogs: logs.length,
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  const results = [];
  results.push(
    await runScenario(browser, {
      name: "force-smile-idle",
      query: "mistMouthDebug=1&mistMouthForce=Chubby_Smile",
      waitMs: 2000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "force-smile-then-talk-sim",
      query: "mistMouthDebug=1&mistMouthForce=Chubby_Smile&mistTalkSim=1",
      waitMs: 2000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "force-neutral-idle",
      query: "mistMouthDebug=1&mistMouthForce=Chubby_Neutral",
      waitMs: 2000,
    }),
  );
  results.push(
    await runScenario(browser, {
      name: "baseline-no-force",
      query: "mistMouthDebug=1",
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
