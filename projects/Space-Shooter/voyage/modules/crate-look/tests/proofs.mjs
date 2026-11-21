// Proof shots at 1440x900 and 390x844 (the phone ones after a real tap), every state the brief lists. Usage: node tests/proofs.mjs <outDir> [filter] [sizes]
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';
import fs from 'node:fs';
const [out = '/tmp/cl/proof', only = '', sizesArg = 'desktop,phone'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SIZES = { desktop: DESKTOP, phone: PHONE, laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } };
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ headless: true });

const press = async (page, size, sel, o = {}) => { const l = page.locator(sel).first(); size === 'phone' ? await l.tap({ timeout: 6000, ...o }) : await l.click({ timeout: 6000, ...o }); };
const open = async (page, size) => { await press(page, size, '.cl-lid'); await page.waitForSelector('.cl-lid.is-off', { timeout: 6000 }); await page.waitForTimeout(500); };
const SCENES = [
  { name: '01-shut', q: 'fixture=ore', run: async () => {} },
  { name: '02-lid-lifting', q: 'fixture=ore', run: async (page, size) => { await press(page, size, '.cl-lid'); await page.waitForTimeout(640); } },
  { name: '03-full-cold-box', q: 'fixture=food', run: open },
  { name: '04-took-one', q: 'fixture=ore', run: async (page, size) => { await open(page, size); await press(page, size, '.cl-stack[data-item=ore]'); await page.waitForTimeout(800); } },
  { name: '05-empty', q: 'fixture=empty&seed=4', run: open },
  { name: '06-sealed', q: 'fixture=sealed', run: async (page, size) => { await press(page, size, '.cl-lid'); await page.waitForTimeout(500); } },
  { name: '07-wrong-slip-inspection', q: 'fixture=wrongslip&points=0,1,0&level=9', run: async (page, size) => { await open(page, size); if (size === 'phone') await press(page, size, '.cl-slip'); await page.waitForTimeout(300); } },
  { name: '08-hidden-uncovered', q: 'fixture=wrongslip', run: async (page, size) => { await open(page, size); for (let i = 0; i < 5 && !(await page.locator('.cl-stack[data-item=nav-chip]').count()); i++) { await press(page, size, '.cl-stack[data-item=fuel-cell], .cl-stack[data-item=scrap]'); await page.waitForTimeout(250); } await page.waitForTimeout(700); } },
  { name: '09-chalk-sell', q: 'fixture=ore', run: async (page, size) => { await open(page, size); await press(page, size, '.cl-chalkbtn'); await press(page, size, '.cl-chalkbtn'); await page.waitForTimeout(900); } },
  { name: '10-quick', q: 'fixture=ore&quick=1', run: async () => {} },
  { name: '11-glint-awareness', q: 'fixture=wrongslip&points=1,0,0&level=9', run: open },
  { name: '12-trace-origin', q: 'fixture=food&points=0,0,1&level=9&seed=2', run: open },
  { name: '14-nearly-empty', q: 'fixture=ore&crate=' + encodeURIComponent(JSON.stringify({ contents: [{ item: 'ore', qty: 3 }, { item: 'scrap', qty: 2 }], slip: null })), run: open },
  { name: '15-packed-ore', q: 'fixture=ore&crate=' + encodeURIComponent(JSON.stringify({ contents: [{ item: 'ore', qty: 14 }, { item: 'scrap', qty: 9 }], capacity: 24 })), run: open },
  { name: '13-steel-open', q: 'fixture=wrongslip&tier=-2', run: open },
];
for (const sz of sizesArg.split(',')) {
  const ctx = await browser.newContext(SIZES[sz]); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const s of SCENES) {
    if (only && !s.name.includes(only)) continue;
    await page.goto(`${srv.origin}/test.html?autoplay=1&sfx=0&${s.q}`);
    await page.waitForSelector('.m-crate-look .cl-crate'); await page.waitForTimeout(900);
    await s.run(page, sz === 'laptop' ? 'desktop' : sz);
    await page.screenshot({ path: `${out}/${sz}-${s.name}.png` });
  }
  console.log(sz, 'errors:', errors);
  await ctx.close();
}
await browser.close(); await srv.close();
