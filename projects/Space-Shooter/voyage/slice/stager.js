// The stager (opening B, outcome 4): plays the shot lists in ./shots.js on the on-foot world's stage, beside the dialogue, never instead of it.
// It resolves places ('hatch', 'reck', 'player') in the room, runs a timeline per shot, tweens the seam and the airlock cam, and
// tells the page about sound (bus 'audio:mood', 'audio:loop'; one-shots go through world.sound) so the music cuts to a tense bed when the alarm goes.
import { createTimeline } from './timeline.js';
import { SWITCHES } from './switches.js';
import { SHOTS, MOOD, CALM_AFTER, shotFor } from './shots.js';

const HATCH_ID = 'corridor';

/** world(): the on-foot world or null. bus: the story bus. frame/now: injected for tests. */
export function createStager({ world, bus, toast = () => {}, tickMs = 40, now = () => performance.now(), setTimer = (fn, ms) => setInterval(fn, ms), clearTimer = (id) => clearInterval(id) }) {
  const running = []; // { key, tl, map }
  const tweens = []; // { what, from, to, ms, t, rect? }
  const started = new Set(); // shot keys already played in this scene
  let timer = 0, last = 0;
  const fired = new Set(); // every signal so far this scene: a shot that starts later still hears the ones before it
  const signalAll = (name) => { fired.add(name); for (const r of running) r.tl.signal(name); };
  const offs = [bus.on('talk:line', (d) => { if (d?.id) signalAll(`say:${d.id}`); })];

  // ---- places in the room ----
  const doorRect = (w) => { const d = w.doors?.get?.(HATCH_ID) || w.map.doors.find((x) => x.id === HATCH_ID); return d ? { x: d.x, y: d.y, w: d.w, h: d.h } : null; };
  function frame(w) {
    const T = w.map.tile, door = doorRect(w);
    if (!door) return null;
    const cx = door.x + door.w / 2, cy = door.y + door.h / 2;
    const dx = w.map.w / 2 - cx, dy = w.map.h / 2 - cy;
    const inward = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
    return { T, door, cx, cy, inward };
  }
  function resolve(w, at) {
    if (at == null) return null;
    if (typeof at === 'object' && at.tile) return { x: (at.tile[0] + 0.5) * w.map.tile, y: (at.tile[1] + 0.5) * w.map.tile };
    const f = frame(w);
    if (at === 'player') return w.position();
    if (at === 'reck') { const n = w.npcAt('reck'); return n || { x: 5.5 * w.map.tile, y: 6.5 * w.map.tile }; }
    if (!f) return null;
    if (at === 'hatch') return { x: f.cx, y: f.cy };
    if (at === 'hatch-in') return { x: f.cx + f.inward.x * f.T * 1.1, y: f.cy + f.inward.y * f.T * 1.1 };
    if (at === 'stub-mid') return { x: f.cx - f.inward.x * f.T * 2, y: f.cy - f.inward.y * f.T * 2 };
    if (at === 'stub-far') return { x: f.cx - f.inward.x * f.T * 3.8, y: f.cy - f.inward.y * f.T * 3.8 };
    if (w.stage.actor(at)) { const a = w.stage.actor(at); return { x: a.x, y: a.y }; }
    return null;
  }

  // ---- the ops ----
  function apiFor(key, map) {
    const w = () => { const x = world(); return x && x.map.id === map ? x : null; };
    return {
      music: (s) => bus.emit('audio:mood', { mode: s.mode, key }),
      loop: (s) => bus.emit('audio:loop', { id: s.id, on: s.on }),
      sfx: (s) => world()?.sound?.(s.id),
      pulse: (s) => w()?.stage.pulse(s.on),
      banner: (s) => w()?.stage.banner(s.text, s.ms),
      inset: (s) => w()?.stage.inset(s.on, s.p ?? 0),
      cam: (s) => { const x = w(); if (x) x.stage.camera(s.at ? resolve(x, s.at) : null); },
      tween: (s) => { tweens.push({ what: s.what, from: s.what === 'seam' ? 0 : 0.04, to: s.to, ms: s.ms, t: 0, map }); },
      blow: () => {
        const x = w(); if (!x) return;
        const f = frame(x); if (!f) return;
        x.stage.blow(f.door);
        x.stage.decal({ kind: 'scorch', x: f.cx, y: f.cy, r: f.T * 1.4 });
        x.doors?.force?.(HATCH_ID, true); x.doors?.force?.(`${HATCH_ID}-far`, true);
        x.sound?.('breach');
      },
      actor: (s) => { const x = w(); if (!x) return; const p = resolve(x, s.at), f = frame(x); if (p) x.stage.spawn(s.id, { x: p.x, y: p.y, angle: f ? Math.atan2(f.inward.y, f.inward.x) : 0 }); },
      walk: (s) => { const x = w(); if (!x) return; const p = resolve(x, s.to); if (p) x.stage.walk(s.id, [p], s.speed); },
      fire: (s) => {
        const x = w(); if (!x) return;
        const a = resolve(x, s.from), b = resolve(x, s.at);
        if (!a || !b) return;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        x.stage.face(s.from, ang);
        x.stage.bolt(a.x + Math.cos(ang) * 18, a.y + Math.sin(ang) * 18, b.x, b.y, { color: s.from === 'reck' ? '#cff8f4' : '#ffb27a' });
        x.sound?.('shot');
      },
      hit: (s) => { const x = w(); if (!x) return; const p = resolve(x, s.at); if (p) { x.stage.hurtAt(p.x, p.y); x.sound?.('hurt'); x.stage.shake(0.12); } },
      reck: (s) => { const x = world(); if (!x) return; x.setState('reck', s.state === 'alive' ? 'alive' : null); if (s.state !== 'alive') x.sound?.('thud'); const p = resolve(x, 'reck'); if (p && s.state === 'down') x.stage.smoke(p.x, p.y, { count: 5, life: 1.2 }); },
      remove: (s) => w()?.stage.remove(s.id),
      signal: (s) => signalAll(`shot:${s.name}`),
      bark: (s) => world()?.bark(s.who, s.text),
      flash: (s) => w()?.stage.flash(s.ms),
      shake: (s) => w()?.stage.shake(s.a),
      error: (error, step) => console.warn('Stardust: a staged step failed', step?.op, error),
    };
  }

  function loop() {
    const t = now(), dt = Math.min(200, t - last); last = t;
    for (const r of running) r.tl.step(dt);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], x = world();
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.ms), p = tw.from + (tw.to - tw.from) * k;
      if (x && x.map.id === tw.map) {
        if (tw.what === 'seam') { const f = frame(x); if (f) x.stage.seam(f.door, p); } else if (tw.what === 'inset') x.stage.inset(true, p);
      }
      if (k >= 1) tweens.splice(i, 1);
    }
    for (let i = running.length - 1; i >= 0; i--) if (running[i].tl.done) running.splice(i, 1);
    if (!running.length && !tweens.length) { clearTimer(timer); timer = 0; }
  }

  /** Start a shot list (once per scene run). Returns its timeline, or null when there is none or it already played. */
  function start(key) {
    const shot = SHOTS[key];
    const w = world();
    if (!shot || !w || started.has(key)) return null;
    started.add(key);
    if (key === 'visitors/last' || key === 'visitors/reck-falls') w.setState('reck', 'alive'); // Reck stays in his seat until the stand shows what happens to him
    const tl = createTimeline(shot, apiFor(key, w.map.id));
    for (const f of fired) tl.signal(f);
    running.push({ key, tl, map: w.map.id });
    if (!timer) { last = now(); timer = setTimer(loop, tickMs); }
    return tl;
  }

  /** The music's mood for now: 'calm' | 'danger' | 'combat' (the page maps it to sound). */
  const mood = (mode) => bus.emit('audio:mood', { mode, key: 'direct' });

  /** A mood change for a node with no shot (the corridor beats). */
  const moodFor = (key) => { const mode = MOOD[key]; if (mode) bus.emit('audio:mood', { mode, key }); };

  /**
   * For the director: a beat's staging. Returns a function that plays the shot beside the beat, or null for a beat with none.
   */
  function stagerOf(v, play) {
    const key = `${v.quest?.id}/${v.node}`;
    if (!SWITCHES.stagedScenes) return null;
    if (!shotFor(v.quest?.id, v.node) && !MOOD[key]) return null;
    return (opts) => { moodFor(key); start(key); play(opts); };
  }

  /** A result card of a staged scene: Reavers leave first, and the music settles when the corridor is over. true: the stager shows the card itself. */
  function endHook(v, show) {
    const id = v.quest?.id, w = world();
    if (!SWITCHES.stagedScenes) return false;
    if (CALM_AFTER.includes(id)) bus.emit('audio:mood', { mode: 'calm', key: `${id}/end` });
    if (id === 'visitors' && w && w.stage.actorIds.length && w.map.id === 'duchess-bridge') {
      const tl = start('visitors/leave');
      let shown = false;
      const go = () => { if (!shown) { shown = true; show(); } };
      setTimeout(go, 2300);
      return Boolean(tl);
    }
    return false;
  }

  /** The scene is over, or being replayed: clear everything the stager put on the stage. */
  function reset() {
    running.length = 0; tweens.length = 0; started.clear(); fired.clear();
    if (timer) { clearTimer(timer); timer = 0; }
    const w = world();
    if (w) { w.stage.clearFx(); w.stage.camera(null); w.stage.pulse(false); w.stage.inset(false); w.stage.banner(null); w.setState('reck', null); w.doors?.force?.(HATCH_ID, null); w.doors?.force?.(`${HATCH_ID}-far`, null); for (const id of w.stage.actorIds) w.stage.remove(id); }
    bus.emit('audio:loop', { id: 'klaxon', on: false });
    bus.emit('audio:loop', { id: 'torch', on: false });
    bus.emit('audio:mood', { mode: 'calm', key: 'reset' });
  }

  return { start, stagerOf, endHook, reset, signal: signalAll, moodFor, mood, get running() { return running.map((r) => r.key); }, get played() { return [...started]; }, destroy() { offs.forEach((o) => o?.()); if (timer) clearTimer(timer); } };
}
