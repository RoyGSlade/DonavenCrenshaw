// node tests/shot.mjs <out.png> <desktop|laptop|phone> "<query>" [actions-json] : one screenshot, for looking while building
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';
const [out, size, query = '', actionsJson = '[]'] = process.argv.slice(2);
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext(size === 'phone' ? PHONE : size === 'laptop' ? { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } : DESKTOP);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${srv.origin}/test.html?autoplay=1&mute=1&${query}`);
await page.waitForSelector('.m-ralph .rl-canvas');
await page.waitForTimeout(1800);
for (const a of JSON.parse(actionsJson)) { if (a.wait) await page.waitForTimeout(a.wait); }
await page.screenshot({ path: out });
console.log('errors:', errors);
await browser.close(); await srv.close();
