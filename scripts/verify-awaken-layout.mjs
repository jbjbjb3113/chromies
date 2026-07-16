/**
 * Three-viewport DOM check for /awaken-demo mobile vs desktop layouts.
 * Usage: node scripts/verify-awaken-layout.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const ACCESS = "chromies-mist-demo";

async function probe(page) {
  return page.evaluate(() => {
    const layout = document.querySelector("[data-awaken-layout]")?.getAttribute("data-awaken-layout");
    const tabLabels = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    const makeOffer = [...document.querySelectorAll("button")].some((b) =>
      /make offer/i.test(b.textContent),
    );
    const chatBtn = [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Chat");
    const talkBtn = [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Talk");
    const mobileNav = !!document.querySelector('nav button[aria-label="Go back"]');
    const desktopAccordion = !!document.querySelector("#listing-traits");
    const canvas = document.querySelector('canvas[role="img"]');
    const lgTwoCol = !!document.querySelector(".lg\\:h-screen.lg\\:flex-row");
    return {
      layout,
      tabLabels,
      makeOffer,
      chatBtn,
      talkBtn,
      mobileNav,
      desktopAccordion,
      hasCanvas: !!canvas,
      lgTwoCol,
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
}

async function runViewport(browser, width, height, label) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${baseUrl}/awaken-demo`, { waitUntil: "networkidle", timeout: 120000 });
  const code = page.locator('input[type="password"]');
  if (await code.isVisible({ timeout: 3000 }).catch(() => false)) {
    await code.fill(ACCESS);
    await page.getByRole("button", { name: "Enter" }).click();
  }
  await page.waitForSelector('[data-awaken-layout], #listing-traits, canvas[role="img"]', {
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
  const result = await probe(page);
  await page.close();
  return { label, width, height, ...result };
}

async function main() {
  const browser = await chromium.launch();
  const results = await Promise.all([
    runViewport(browser, 1280, 800, "desktop-1280"),
    runViewport(browser, 1920, 1080, "desktop-1920"),
    runViewport(browser, 390, 844, "mobile-390"),
  ]);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
