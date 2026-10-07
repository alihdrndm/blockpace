// Renders social-preview.html to social-preview.png (1280x640, the GitHub social preview size).
// Usage: node docs/media/render-social-preview.mjs   (needs `pnpm exec playwright install chromium`)
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const html = fileURLToPath(new URL("./social-preview.html", import.meta.url));
const png = fileURLToPath(new URL("./social-preview.png", import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
await page.goto(`file://${html}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: png,
  clip: { x: 0, y: 0, width: 1280, height: 640 },
});
await browser.close();
console.log(`wrote ${png}`);
