// A quick look at the first screens at three sizes. node tests/looks.mjs <outDir> ; one browser, one job.
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/ralph-looks'; mkdirSync(out, { recursive: true });
const { chromium } = await loadPlaywright();
const srv = await startServer(); const browser = await chromium.launch({ headless: true });
const SIZES = { desktop: DESKTOP, laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, phone: PHONE };
const errors = [];
for (const [name, opt] of Object.entries(SIZES)) {
  const ctx = await browser.newContext(opt); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ': ' + e)); page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  await page.goto(`${srv.origin}/test.html?autoplay=1&mute=1&fixture=friend`);
  await page.waitForSelector('.m-ralph .rl-canvas'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-a.png` });
  await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/${name}-b.png` });
  await ctx.close();
}
console.log('errors:', errors); await browser.close(); await srv.close();
