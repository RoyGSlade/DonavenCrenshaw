// Browser helpers for the opening B tests (talk, cuts, approaches, the marauder scene, stealth, combat, sound).
// Dev-only. Shares the playwright finder and the static server with stardust-test-kit.mjs.
import { loadPlaywright, startServer, blockHub } from './stardust-test-kit.mjs';
export { loadPlaywright, startServer, blockHub };

export const V = '/projects/Space-Shooter/voyage/';
export const PROOF = process.env.PROOF_DIR || null;
export const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
export const SIZES = [
  ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
export const settle = (page, ms = 600) => page.waitForTimeout(ms);

/** A fresh opening in a browser context. extra: context options (reducedMotion: 'reduce' makes text and fades instant). */
export async function boot(browser, origin, profile, { query = '?newgame=1', reduced = true, storage = {}, sampler = false } = {}) {
  const context = await browser.newContext({ ...profile, ...(reduced ? { reducedMotion: 'reduce' } : {}) });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((storage) => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); } catch {} }, storage);
  if (sampler) await page.addInitScript(FRAME_SAMPLER);
  await page.goto(`${origin}${V}${query}`);
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(page, 1800);
  return { context, page, errors };
}

/** The page's state in one read: map, held, dialogue box, quest node, positions. */
export const state = (page) => page.evaluate(() => {
  const w = window.__stardust.onfoot.world, d = document.querySelector('#hg-dialogue');
  const run = Object.values(window.__stardust.store.get().quests.active || {})[0];
  return {
    map: w.map.id, held: w.held, mode: w.mode, dlgOpen: !d.hidden, paused: d.classList.contains('is-paused'),
    choices: [...d.querySelectorAll('.ui-dlg-choice')].map((b) => b.textContent), text: d.innerText,
    quest: run?.quest || null, node: run?.node || null, assist: run?.assist || null,
    pos: w.position(), bubbles: w.stage.bubbles(), talkingTo: w.stage.talkingTo,
  };
});

/** Walk with real keys for ms, return where the player was and ended. */
export async function walk(page, keys, ms = 600) {
  const a = (await state(page)).pos;
  for (const k of keys) await page.keyboard.down(k);
  await settle(page, ms);
  for (const k of keys) await page.keyboard.up(k);
  return { a, b: (await state(page)).pos };
}

/** Advance the opening with Go on taps until the dialogue shows text containing `needle`. */
export async function toLine(page, needle, tries = 14) {
  for (let i = 0; i < tries; i++) {
    if ((await state(page)).text.includes(needle)) return;
    const go = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Go on' });
    if (await go.count()) await go.click({ timeout: 2000 }).catch(() => {});
    await settle(page, 500);
  }
  throw new Error(`never reached the line with "${needle}"`);
}

/** A free spot `tiles` away from a person (no solid within the body's radius), inside the room, or null. */
export const freeSpotAt = (page, who, tiles) => page.evaluate(({ who, tiles }) => {
  const w = window.__stardust.onfoot.world, n = w.npcAt(who), T = w.map.tile;
  if (!n) return null;
  const free = (x, y) => x > 20 && y > 20 && x < w.map.w - 20 && y < w.map.h - 20 && !w.map.solids.some((s) => x > s.x - 16 && x < s.x + s.w + 16 && y > s.y - 16 && y < s.y + s.h + 16);
  for (let a = 0; a < 360; a += 15) {
    const x = n.x + Math.cos((a * Math.PI) / 180) * tiles * T, y = n.y + Math.sin((a * Math.PI) / 180) * tiles * T;
    if (free(x, y)) return { x, y };
  }
  return null;
}, { who, tiles });
export const placeAt = (page, p) => page.evaluate((p) => window.__stardust.onfoot.world.place(p.x, p.y), p);

/** Jump the save to just before a scene (earlier scenes done) and reload, so the opening starts there. */
export async function bootAt(browser, origin, profile, sceneId, opts = {}) {
  const b = await boot(browser, origin, profile, opts);
  await b.page.evaluate(async (sceneId) => {
    const { SLICE_ORDER } = await import('/projects/Space-Shooter/voyage/quests/data/slice/index.js');
    const upTo = SLICE_ORDER.indexOf(sceneId);
    window.__stardust.store.update((s) => ({ ...s, quests: { ...s.quests, active: {}, done: Object.fromEntries(SLICE_ORDER.slice(0, upTo).map((id) => [id, { result: 'success', outcome: 'x', at: 0, times: 1 }])) } }));
  }, sceneId);
  await b.page.reload();
  await b.page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(b.page, 1800);
  return b;
}

/**
 * Sample the world canvas every frame: how much of the picture changed since the last frame, the map, and how opaque the fade overlay is.
 * A hard cut is a big change (60% of a 32x18 grid) while the fade overlay is not opaque. Also notes the fade captions it saw.
 * Install with boot(..., { sampler: true }) (runs from page start, surviving reloads) or installFrameSampler(page).
 */
export const FRAME_SAMPLER = `(() => {
  const start = () => {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const S = (window.__frames = { frames: 0, cuts: [], maps: [], lastMap: null, prev: null, maxChange: 0, captions: [] });
    const tick = () => {
      const world = document.querySelector('.of-canvas'), fade = document.querySelector('.of-fade');
      if (world && world.width) {
        g.drawImage(world, 0, 0, 32, 18);
        const d = g.getImageData(0, 0, 32, 18).data, lum = [];
        for (let i = 0; i < d.length; i += 4) lum.push(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
        const op = fade ? Number(getComputedStyle(fade).opacity) : 0;
        const cap = document.querySelector('.of-fade-caption')?.textContent || '';
        if (cap && op > 0.3 && !S.captions.includes(cap)) S.captions.push(cap);
        if (S.prev) {
          let n = 0; for (let i = 0; i < lum.length; i++) if (Math.abs(lum[i] - S.prev[i]) > 40) n++;
          const frac = n / lum.length;
          S.maxChange = Math.max(S.maxChange, frac);
          if (frac >= 0.6 && op < 0.7) S.cuts.push({ t: Math.round(performance.now()), frac: +frac.toFixed(2), fade: op });
        }
        S.prev = lum; S.frames++;
        const id = window.__stardust?.onfoot?.world?.map?.id;
        if (id !== S.lastMap) { S.maps.push({ t: Math.round(performance.now()), map: id, fade: op }); S.lastMap = id; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;
export const installFrameSampler = (page) => page.evaluate(FRAME_SAMPLER);
export const frameReport = (page) => page.evaluate(() => { const S = window.__frames; return { frames: S.frames, cuts: S.cuts, maps: S.maps, maxChange: S.maxChange, captions: S.captions }; });
