import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "screenshots");
const baseUrl = "http://localhost:5173/awaken-demo";

async function openDemo(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Chromie #0001");
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await openDemo(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "awaken-demo-chat.png"), fullPage: false });

  await page.click('button:has-text("Talk")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "awaken-demo-talk.png"), fullPage: false });

  await browser.close();
  console.log("Screenshots saved to", outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
