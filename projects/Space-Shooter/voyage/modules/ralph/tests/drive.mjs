// Real input for the browser: a mouse on desktop, real touch (CDP) on the phone. Positions come from the page's own world->screen hook.
export class Driver {
  constructor(page, phone) { this.page = page; this.phone = phone; this.cdp = null; }
  async init() { if (this.phone) this.cdp = await this.page.context().newCDPSession(this.page); return this; }
  async load(query = '') { await this.page.goto(`${this.origin}/test.html?autoplay=1&mute=1&${query}`); await this.page.waitForSelector('.m-ralph .rl-canvas'); await this.page.waitForFunction(() => window.__ralph); }
  scr(x, y) { return this.page.evaluate(([a, b]) => window.__ralph.toScreen(a, b), [x, y]); }
  st(fn) { return this.page.evaluate(fn); }
  async mode() { return this.page.evaluate(() => window.__ralph.state.ralph.mode); }
  async waitFor(expr, ms = 15000) { await this.page.waitForFunction(expr, null, { timeout: ms, polling: 50 }); }
  async down(p) { if (this.phone) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); else { await this.page.mouse.move(p.x, p.y); await this.page.mouse.down(); } }
  async moveTo(p) { if (this.phone) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); else await this.page.mouse.move(p.x, p.y); }
  async up(p) { if (this.phone) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await this.page.mouse.up(); }
  // press at a, slide to b in n steps (ms apart), optionally hold, release
  async drag(a, b, { steps = 10, ms = 16, hold = 0 } = {}) {
    await this.down(a); await this.page.waitForTimeout(40);
    for (let i = 1; i <= steps; i++) { await this.moveTo({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }); await this.page.waitForTimeout(ms); }
    if (hold) await this.page.waitForTimeout(hold);
    await this.up(b);
  }
  async tap(p) { if (this.phone) await this.page.touchscreen.tap(p.x, p.y); else await this.page.mouse.click(p.x, p.y); }
  // a flick: press on the ball, pull back away from (tx, ty) in world units by `pull` units, let go. Returns nothing; the page decides.
  async throwAt(tx, ty, pull = 2.6, { hold = 0 } = {}) {
    const b = await this.st(() => ({ x: window.__ralph.state.ball.x, y: window.__ralph.state.ball.y }));
    const d = Math.hypot(tx - b.x, ty - b.y) || 1; const px = b.x - (tx - b.x) / d * pull, py = b.y - (ty - b.y) / d * pull;
    await this.drag(await this.scr(b.x, b.y), await this.scr(px, py), { steps: 8, ms: 18, hold });
  }
  async rubSpot(secs, { onlyMove = true } = {}) { // rub in small circles over the spot until the leg kicks (or time runs out)
    const end = Date.now() + secs * 1000; const first = await this.st(() => { const r = window.__ralph.state.ralph; return { x: r.x, y: r.y }; });
    await this.down(await this.scr(first.x, first.y)); let n = 0;
    while (Date.now() < end) {
      const p = await this.st(() => { const s = window.__ralph.state, r = s.ralph, sp = s.rec.spot; const a = performance.now() / 70; const cx = r.x + (Math.cos(r.heading) * sp.y - Math.sin(r.heading) * sp.x) * 0.95, cy = r.y + (Math.sin(r.heading) * sp.y + Math.cos(r.heading) * sp.x) * 0.95; return window.__ralph.toScreen(cx + Math.cos(a) * 0.22, cy + Math.sin(a) * 0.22); });
      await this.moveTo(p); await this.page.waitForTimeout(24); if (await this.st(() => window.__ralph.state.ralph.pose === 'kick')) { n++; if (n > 8) break; }
    }
    return this.up({ x: 0, y: 0 });
  }
  async release() { return this.up({ x: 0, y: 0 }); }
  async dragPad(item, toWorld) { // drag a tray pad out onto the yard
    const el = await this.page.locator(`.m-ralph .rl-pad[data-item=${item}]`).boundingBox(); const a = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const b = await this.scr(toWorld.x, toWorld.y); await this.drag(a, b, { steps: 14, ms: 20 });
  }
}
