import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "reports", "robinhood", "mockup");

async function diagnoseViewport(width, height, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  const errors = [];
  page.on("console", (msg) => logs.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("http://localhost:5173/awaken-demo", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[type="password"]', "chromies-mist-demo");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Chromie #0001", { timeout: 60000 });
  await page.waitForTimeout(2000);

  const diag = await page.evaluate(() => {
    const chatBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Chat");
    const talkBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Talk");
    const input = document.querySelector('input[placeholder="Message Mist…"]');
    const panel = chatBtn?.closest(".bg-paper");
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const style = (el) => (el ? getComputedStyle(el) : null);
    const sections = [...document.querySelectorAll("section")].map((s, i) => ({
      i,
      className: s.className,
      rect: rect(s),
      childCount: s.children.length,
    }));
    const inViewport = (r) =>
      r ? r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth : false;
    return {
      hasChatBtn: !!chatBtn,
      hasTalkBtn: !!talkBtn,
      hasMessageInput: !!input,
      chatInViewport: inViewport(rect(chatBtn)),
      talkInViewport: inViewport(rect(talkBtn)),
      inputInViewport: inViewport(rect(input)),
      chatRect: rect(chatBtn),
      inputRect: rect(input),
      panelRect: rect(panel),
      panelHeight: style(panel)?.height,
      sections,
      bodyScrollHeight: document.body.scrollHeight,
      viewport: { w: innerWidth, h: innerHeight },
      imgSprite: (() => {
        const img = document.querySelector("article img.pixelated");
        return { rect: rect(img), width: style(img)?.width, height: style(img)?.height };
      })(),
    };
  });

  await page.screenshot({
    path: path.join(outDir, `awaken-demo-diag-${label}.png`),
    fullPage: true,
  });

  await browser.close();
  return { label, width, height, diag, errors, logs };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const results = await Promise.all([
    diagnoseViewport(1280, 800, "desktop"),
    diagnoseViewport(390, 844, "mobile"),
  ]);

  for (const { label, width, height, diag, errors, logs } of results) {
    console.log(`\n=== ${label.toUpperCase()} (${width}x${height}) ===`);
    console.log(JSON.stringify(diag, null, 2));
    console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "(none)");
    const notable = logs.filter((x) => x.type === "error" || x.type === "warning");
    if (notable.length) {
      console.log("CONSOLE:", notable.map((l) => `${l.type}: ${l.text}`).join("\n"));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
