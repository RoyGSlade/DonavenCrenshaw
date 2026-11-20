// Proof pictures at 1440x900 and 390x844 (phone shots follow a real tap). node tests/proofs.mjs <outDir> [only-name]
import { mkdir } from 'node:fs/promises';
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';
const LAPTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const LANDSCAPE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const out = process.argv[2] || '/tmp/sc/proof';
const only = process.argv[3] || '';
const sizes = (process.argv[4] || 'desktop,phone').split(',');
await mkdir(out, { recursive: true });
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ headless: true });
const errors = [];

for (const [size, profile] of [['desktop', DESKTOP], ['phone', PHONE], ['laptop', LAPTOP], ['landscape', LANDSCAPE]].filter(([s]) => sizes.includes(s))) {
  const phone = Boolean(profile.hasTouch);
  const extra = size === 'laptop' || size === 'landscape';
  const ctx = await browser.newContext(profile);
  const scenes = [];
  const scene = (name, query, fn) => scenes.push({ name, query, fn });
  const tap = async (page, sel) => { const l = page.locator(sel).first(); phone ? await l.tap({ timeout: 8000 }) : await l.click({ timeout: 8000 }); };
  const settle = (page, ms = 1300) => page.waitForTimeout(ms);

  scene('01-shutter', 'fixture=mel', async (page, shot) => { await page.waitForTimeout(560); await shot(); });
  scene('02-shelves', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await shot(); });
  scene('03-on-the-counter', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=flak-vest]'); await tap(page, '.sc-slot[data-id=medkit]'); await tap(page, '.sc-slot[data-id=medkit]'); await settle(page, 900); await shot(); });
  scene('04-paid', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=flak-vest]'); await tap(page, '.sc-slot[data-id=medkit]'); await settle(page, 700); await tap(page, '.sc-pay'); await settle(page, 1500); await shot(); });
  scene('05-broke', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=scatter-pistol]'); await tap(page, '.sc-slot[data-id=bolt-carbine]'); await settle(page, 700); await tap(page, '.sc-pay'); await settle(page, 450); await shot(); });
  scene('06-locked', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=plated-coat]'); await settle(page, 700); await shot(); });
  scene('07-discount-board', 'fixture=edna', async (page, shot) => { await settle(page, 1700); await shot(); });
  const haggle = (o) => async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=nav-chip]'); await settle(page, 600); await tap(page, '.sc-haggle'); await page.waitForSelector('#picker:not([hidden])'); await shot('a'); await tap(page, `#picker button[data-o=${o}]`); await settle(page, 1200); await shot(); };
  scene('08-haggle-well', 'fixture=edna', haggle('well'));
  scene('09-haggle-walked', 'fixture=edna', haggle('walked'));
  scene('10-selling', 'fixture=mel', async (page, shot) => { await settle(page, 1700); if (phone) await tap(page, '.sc-sellbtn'); await tap(page, '.sc-tray-item[data-k="tray:breach-kit"]'); await settle(page, 700); await shot(); });
  scene('11-sold', 'fixture=mel', async (page, shot) => { await settle(page, 1700); if (phone) await tap(page, '.sc-sellbtn'); await tap(page, '.sc-tray-item[data-k="tray:breach-kit"]'); await settle(page, 400); await tap(page, '.sc-take'); await settle(page, 1200); await shot(); });
  scene('12-shut', 'fixture=stall&open=0', async (page, shot) => { await settle(page, 1700); await shot(); });
  scene('13-paths', 'fixture=edna&points=3,0,4', async (page, shot) => { await settle(page, 1700); await shot(); });
  scene('14-stall-limits', 'fixture=stall', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=lucky-bolt]'); await settle(page, 700); await shot(); });
  scene('16-lift-flight', 'fixture=mel', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=scan-goggles]'); await page.waitForTimeout(170); await shot('a'); await page.waitForTimeout(150); await shot('b'); await page.waitForTimeout(900); await shot('c'); });
  scene('17-no-stale-line', 'fixture=mel&haggle=fair', async (page, shot) => { await settle(page, 1700); await tap(page, '.sc-slot[data-id=scatter-pistol]'); await tap(page, '.sc-slot[data-id=bolt-carbine]'); await settle(page, 500); await tap(page, '.sc-pay'); await settle(page, 400); await shot('a'); await tap(page, '.sc-chip[data-id=bolt-carbine]'); await settle(page, 400); await tap(page, '.sc-haggle'); await settle(page, 1100); await shot('b'); await tap(page, '.sc-pay'); await settle(page, 1300); await shot('c'); });
  scene('15-quick', 'fixture=mel&quick=1', async (page, shot) => { await settle(page, 600); await shot(); });

  for (const sc of scenes) {
    if (only && !sc.name.includes(only)) continue;
    if (extra && !['02-shelves', '03-on-the-counter', '10-selling'].includes(sc.name)) continue;
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${sc.name} ${size}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${sc.name} ${size}: ${m.text()}`); });
    await page.goto(`${srv.origin}/test.html?autoplay=1&${sc.query}`);
    await page.waitForSelector('.m-shop-counter .sc-shutter', { state: 'attached' });
    const shot = (suffix = '') => page.screenshot({ path: `${out}/${sc.name}${suffix ? `-${suffix}` : ''}-${size}.png` });
    try { await sc.fn(page, shot); } catch (e) { errors.push(`${sc.name} ${size}: ${e.message.split('\n')[0]}`); await shot('FAILED').catch(() => {}); }
    await page.close();
  }
  await ctx.close();
}
console.log('errors:', errors);
await browser.close(); await srv.close();
