// The proof set. node tests/proofs.mjs <outDir> [names] [sizes] ; one browser, one job (one slot hold).
// Each scene is played with real input (mouse on desktop, real touch on the phone); the phone shots come after a real tap.
import { loadPlaywright, startServer } from './kit.mjs';
import { Driver } from './drive.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/ralph-proof'; mkdirSync(out, { recursive: true });
const only = (process.argv[3] || '').split(',').filter(Boolean); const sizes = (process.argv[4] || 'desktop,phone').split(',');
const SIZES = { desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };

const L = (d) => d.st(() => window.__ralph.state.L);
const SCENES = {
  async 'greet-low'(d, shot) { await d.load('fixture=new&seed=3'); await d.page.waitForTimeout(1600); await shot(); },
  async 'greet-high'(d, shot) { await d.load('fixture=devoted&seed=3&lastSeen=0.1'); await d.page.waitForTimeout(900); await shot(); },
  async 'greet-frenzy'(d, shot) { await d.load('fixture=devoted&seed=3'); await d.page.waitForTimeout(1300); await shot(); },
  async 'ball-pulled'(d, shot) { await d.load('fixture=friend&seed=5'); await d.page.waitForTimeout(2500); const l = await L(d); const b = await d.st(() => window.__ralph.state.ball); const a = await d.scr(b.x, b.y); await d.down(a); const t = await d.scr(b.x - 1.1, b.y + 2.4); await d.moveTo({ x: (a.x + t.x) / 2, y: (a.y + t.y) / 2 }); await d.moveTo(t); await d.page.waitForTimeout(900); await shot(); await d.release(); },
  async 'ball-air'(d, shot) { await d.load('fixture=friend&seed=5'); await d.page.waitForTimeout(2500); const l = await L(d); await d.throwAt(l.scrap.x + 1.5, l.scrap.y + 1.2, 2.8); await d.page.waitForTimeout(340); await shot(); },
  async 'return'(d, shot) { await d.load('fixture=friend&seed=5&force=bring'); await d.page.waitForTimeout(2200); const l = await L(d); await d.throwAt(l.w * 0.6, l.h * 0.4, 2.2); await d.waitFor(() => window.__ralph.state.ralph.mode === 'bring'); await d.page.waitForTimeout(700); await shot(); },
  async 'drop-halfway'(d, shot) { await d.load('fixture=friend&seed=5&force=drop'); await d.page.waitForTimeout(2200); const l = await L(d); await d.throwAt(l.w * 0.55, l.h * 0.25, 2.6); await d.waitFor(() => window.__ralph.state.ralph.mode === 'wait'); await d.page.waitForTimeout(600); await shot(); },
  async 'kept-ball'(d, shot) { await d.load('fixture=friend&seed=5&force=keep'); await d.page.waitForTimeout(2200); const l = await L(d); await d.throwAt(l.w * 0.55, l.h * 0.35, 2.4); await d.waitFor(() => window.__ralph.state.ralph.mode === 'keep'); await d.page.waitForTimeout(900); await shot(); },
  async 'rub-kick'(d, shot) { await d.load('fixture=friend&seed=5&spot=behind-ear'); await d.page.waitForTimeout(5200); await d.waitFor(() => ['idle', 'come', 'wander'].includes(window.__ralph.state.ralph.mode)); const dn = d.rubSpot(9); await d.waitFor(() => window.__ralph.state.ralph.pose === 'kick', 12000); await d.page.waitForTimeout(250); await shot(); await dn; },
  async 'bone-carried'(d, shot) { await d.load('fixture=friend&seed=5'); await d.page.waitForTimeout(4600); const r = await d.st(() => { const r = window.__ralph.state.ralph; return { x: r.x, y: r.y }; }); await d.dragPad('bone', r); await d.waitFor(() => window.__ralph.state.ralph.mode === 'bonego'); await d.page.waitForTimeout(500); await shot(); },
  async 'kibble-eat'(d, shot) { await d.load('fixture=friend&seed=5'); await d.page.waitForTimeout(4600); const l = await L(d); await d.dragPad('kibble', l.bowl); await d.waitFor(() => window.__ralph.state.ralph.mode === 'eat'); await d.page.waitForTimeout(400); await shot(); },
  async 'wrong-thing'(d, shot) { await d.load('fixture=friend&seed=5&force=find'); await d.page.waitForTimeout(2200); const l = await L(d); await d.throwAt(l.w * 0.5, l.h * 0.4, 2.2); await d.waitFor(() => window.__ralph.state.ralph.mode === 'showoff', 25000); await d.page.waitForTimeout(500); await shot(); },
  async 'asleep'(d, shot) { await d.load('fixture=asleep&seed=3'); await d.page.waitForTimeout(2600); await shot(); },
  async 'quick'(d, shot) { await d.load('fixture=friend&seed=3&quick=1'); await d.page.waitForTimeout(1400); await shot(); },
  async 'called'(d, shot) { await d.load('fixture=friend&seed=5&mood=95'); await d.page.waitForTimeout(5200); await d.waitFor(() => ['idle', 'wander'].includes(window.__ralph.state.ralph.mode)); const l = await L(d); await d.tap(await d.scr(l.w * 0.5, l.h * 0.55)); await d.page.waitForTimeout(260); await shot(); },
  async 'rub-warm'(d, shot) { await d.load('fixture=friend&seed=5&spot=behind-ear'); await d.page.waitForTimeout(5200); await d.waitFor(() => ['idle', 'come', 'wander'].includes(window.__ralph.state.ralph.mode)); const dn = d.rubSpot(9); await d.waitFor(() => window.__ralph.state.ralph.warm > 0.6, 8000); await d.page.waitForTimeout(100); await shot(); await dn; },
  async 'sprint-skid'(d, shot) { await d.load('fixture=friend&seed=5'); await d.page.waitForTimeout(2500); const l = await L(d); await d.throwAt(l.w * 0.7, l.h * 0.2, 3.4); await d.waitFor(() => Math.hypot(window.__ralph.state.ralph.vx, window.__ralph.state.ralph.vy) > 5.5); await d.page.waitForTimeout(150); await shot(); },
};
const { chromium } = await loadPlaywright(); const srv = await startServer(); const browser = await chromium.launch({ headless: true });
const errors = [];
for (const size of sizes) {
  for (const [name, fn] of Object.entries(SCENES)) {
    if (only.length && !only.includes(name)) continue;
    const ctx = await browser.newContext(SIZES[size]); const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${size}/${name}: ${e}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${size}/${name}: ${m.text()}`); });
    const d = await new Driver(page, size === 'phone').init(); d.origin = srv.origin;
    try { await fn(d, async () => { await page.screenshot({ path: `${out}/${name}-${size}.png` }); const p = await page.evaluate(() => { const r = window.__ralph.state.ralph; return window.__ralph.toScreen(r.x, r.y); }); const x = Math.max(0, Math.min(p.x - 90, SIZES[size].viewport.width - 180)), y = Math.max(0, Math.min(p.y - 90, SIZES[size].viewport.height - 180)); await page.screenshot({ path: `${out}/${name}-${size}-dog.png`, clip: { x, y, width: 180, height: 180 } }); }); console.log('ok  ', size, name); } catch (e) { console.log('FAIL', size, name, String(e).split('\n')[0]); await page.screenshot({ path: `${out}/${name}-${size}-FAIL.png` }).catch(() => {}); }
    await ctx.close();
  }
}
console.log('page errors:', errors); await browser.close(); await srv.close();
