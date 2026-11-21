// Ralph: the pure rules. Seeded, no DOM, no clock, no system random: time comes in as dt, the day comes in as context.now.
// World units: the yard is w x h units (the view picks them from the screen). Ralph is about 1.1 units long.
import { hashSeed, step } from './rng.js';

export const DAY = 86400000;
export const RATES = Object.freeze({ bring: 0.72, drop: 0.18, keep: 0.10 }); // how a fetch ends (keep also happens when he is tired)
export const FIND_CAP = 2;               // wrong things he may bring in one visit
export const SPOTS = Object.freeze({ 'behind-ear': { x: 0.28, y: 0.5 }, chest: { x: 0, y: 0.25 }, back: { x: 0, y: -0.15 }, shoulder: { x: -0.3, y: 0.15 }, rump: { x: 0, y: -0.55 } });
const G = 16, STEP = 1 / 60;
const BODY = 0.95;                       // body radius used for rub hit tests (units)
const GAITS = { walk: 1.6, trot: 4.2, run: 5.6, sprint: 7.6 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------- the yard ----------
export function layout(w, h) {
  w = clamp(num(w, 16), 8, 26); h = clamp(num(h, 10), 8, 20);
  const kennel = { id: 'kennel', x: 0.4, y: 0.4, w: 3.2, h: 2.75, tall: 1.3 };
  const scrap = { id: 'scrap', x: w - 3.6, y: 0.4, w: 3.2, h: 2.4, tall: 1.1 };
  const mid = (w - kennel.w - scrap.w) / 2;
  const crates = [
    { id: 'crate1', x: clamp(w * 0.28, 1.2, w - 3), y: h * 0.5, w: 1.3, h: 1.3, tall: 0.9 },
    { id: 'crate2', x: clamp(w * 0.66, 2.2, w - 2.4), y: h * 0.4, w: 1.3, h: 1.3, tall: 0.9 },
  ];
  if (w < 11) { crates[0].x = 1.4; crates[0].y = h * 0.42; crates[1].x = w - 2.7; crates[1].y = h * 0.52; }
  const rects = [kennel, scrap, ...crates];
  const bed = { x: kennel.x + kennel.w + Math.min(1.5, mid * 0.5), y: kennel.y + 1.0, r: 0.85 };
  const bowl = { x: kennel.x + 1.1, y: kennel.y + kennel.h + 0.85, r: 0.5 };
  const hand = { x: w / 2, y: h - 0.9 };
  const bounds = { x0: 0.35, y0: 0.35, x1: w - 0.35, y1: h - 0.35 };
  const pois = [bed, bowl, { x: scrap.x + 0.6, y: scrap.y + scrap.h + 0.9 }, { x: w * 0.5, y: h * 0.42 }, { x: w * 0.5, y: h - 3.2 }];
  return { w, h, kennel, scrap, crates, rects, bed, bowl, hand, bounds, pois, scrapMouth: { x: scrap.x + scrap.w / 2, y: scrap.y + scrap.h + 0.55 } };
}

function insideRect(r, x, y, pad = 0) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
function pushOut(r, p, pad) { // moves p (x,y) out of the padded rect by the shortest way; returns the normal or null
  const x0 = r.x - pad, x1 = r.x + r.w + pad, y0 = r.y - pad, y1 = r.y + r.h + pad;
  if (!(p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)) return null;
  const dl = p.x - x0, dr = x1 - p.x, dt = p.y - y0, db = y1 - p.y, m = Math.min(dl, dr, dt, db);
  if (m === dl) { p.x = x0; return { x: -1, y: 0 }; }
  if (m === dr) { p.x = x1; return { x: 1, y: 0 }; }
  if (m === dt) { p.y = y0; return { x: 0, y: -1 }; }
  p.y = y1; return { x: 0, y: 1 };
}
function segHitsRect(ax, ay, bx, by, r, pad) { // does a-b cross the padded rect (slab test)
  const x0 = r.x - pad, x1 = r.x + r.w + pad, y0 = r.y - pad, y1 = r.y + r.h + pad;
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return t1 - t0 > 1e-6;
}

// ---------- the record ----------
export function normaliseRecord(context = {}) {
  const c = context && typeof context === 'object' ? context : {};
  const r = c.ralph && typeof c.ralph === 'object' ? c.ralph : {};
  const save = c.save && typeof c.save === 'object' ? c.save : {};
  const it = save.items && typeof save.items === 'object' ? save.items : {};
  const finds = Array.isArray(r.finds) ? r.finds.filter((f) => f && typeof f.item === 'string' && f.item).map((f) => ({ item: f.item, chance: clamp(num(f.chance, 0.1), 0, 1) })) : [];
  const spot = typeof r.spot === 'string' && SPOTS[r.spot] ? { ...SPOTS[r.spot], name: r.spot } : (r.spot && typeof r.spot === 'object' ? { x: clamp(num(r.spot.x, 0), -1, 1), y: clamp(num(r.spot.y, 0.2), -1, 1), name: 'spot' } : { ...SPOTS['behind-ear'], name: 'behind-ear' });
  const now = num(c.now, 0);
  return {
    now,
    mood: clamp(num(r.mood, 50), 0, 100), bond: clamp(Math.round(num(r.bond, 1)), 0, 5), bondProgress: clamp(num(r.bondProgress, 0), 0, 1),
    bondedOn: Number.isFinite(r.bondedOn) ? r.bondedOn : null, asleep: !!r.asleep,
    lastSeen: Number.isFinite(r.lastSeen) ? r.lastSeen : null, fetches: Math.max(0, Math.floor(num(r.fetches, 0))),
    favourite: ['ball', 'bone', 'kibble', 'rub', 'scrap'].includes(r.favourite) ? r.favourite : null,
    spot, tricks: Array.isArray(r.tricks) ? r.tricks.filter((x) => ['sit', 'paw', 'roll', 'spin'].includes(x)) : ['sit'],
    finds, names: c.items && typeof c.items === 'object' ? c.items : {},
    have: { bone: Math.max(0, Math.floor(num(it.bone, 0))), kibble: Math.max(0, Math.floor(num(it.kibble, 0))), ball: Math.max(0, Math.floor(num(it.ball, 1))) },
  };
}
export const today = (rec) => Math.floor(rec.now / DAY);

// ---------- creating a visit ----------
export function createRalph(o = {}) {
  const rec = normaliseRecord(o.context);
  const L = layout(o.w, o.h);
  const s = {
    seed: Math.floor(num(o.seed, 1)), rng: hashSeed('ralph', Math.floor(num(o.seed, 1))), t: 0, quick: !!o.quick,
    L, rec, events: [], flash: null, left: false,
    ralph: {
      x: L.bed.x, y: L.bed.y, vx: 0, vy: 0, heading: Math.PI / 2 * 0, look: 0, mode: 'idle', mt: 0, pose: 'stand', energy: 1,
      mood: rec.mood, bond: rec.bond, bondProgress: rec.bondProgress, bondedOn: rec.bondedOn, carry: null, goal: null,
      tail: 0.3, rubbing: false, heat: 0, spotT: 0, warm: 0, rubT: 0, rubLook: null, stride: 0, brakeCd: 0, idleT: 0, patience: 0, kick: 0,
      awayCd: 0, pending: [], tricking: null, find: null, lean: 0, panting: 0, sleepZ: 0,
    },
    ball: { x: L.hand.x, y: L.hand.y - 0.2, z: 0, vx: 0, vy: 0, vz: 0, state: 'rest', first: false, from: null, spin: 0 },
    touch: null, drag: null, bowlFull: false, chewing: false,
    stat: { fetches: 0, petted: 0, fed: 0, found: 0, throws: 0, calls: 0, rubTotal: 0, goodRub: false, boneGiven: false, usedBone: 0, usedKibble: 0, kicks: 0, drops: 0, keeps: 0, brings: 0, opinions: { likes: 0, loves: 0, looks: 0 } },
    foundItems: [], pocketed: [], greeting: 'none', fetchDone: false, today: today(rec),
  };
  s.ralph.heading = -Math.PI / 2; // facing up the screen (0 = right, y grows downward)
  beginGreeting(s);
  return s;
}

function rnd(s) { const [v, n] = step(s.rng); s.rng = n; return v; }
function emit(s, type, extra) { s.events.push({ t: s.t, type, ...extra }); }
function sayFlash(s, key, dur = 2.2) { s.flash = { key, until: s.t + dur }; }

function beginGreeting(s) {
  const r = s.ralph, rec = s.rec, L = s.L;
  const gapDays = rec.lastSeen == null ? 0 : Math.max(0, (rec.now - rec.lastSeen) / DAY);
  if (s.quick) {
    s.greeting = 'quick';
    r.x = L.hand.x - 1.0; r.y = L.hand.y - 1.7; r.pose = 'sit'; r.mode = 'idle'; r.heading = -Math.PI / 2; r.tail = 0.8;
    s.ball.x = L.hand.x + 0.05; s.ball.y = L.hand.y;
    return;
  }
  if (rec.asleep) { s.greeting = 'asleep'; r.mode = 'sleep'; r.pose = 'lie'; r.x = L.bed.x; r.y = L.bed.y; r.heading = 0.4; r.tail = 0; return; }
  r.x = L.bed.x; r.y = L.bed.y; r.mt = 0;
  if (gapDays >= 2 && rec.bond >= 1) {
    s.greeting = 'frenzy'; r.x = L.kennel.x + 1.6; r.y = L.kennel.y + L.kennel.h + 0.6; r.mode = 'frenzy'; r.mt = 0; r.pose = 'stand'; r.laps = 0; r.tail = 1;
  } else if (rec.bond >= 4) {
    s.greeting = 'run'; r.mode = 'runto'; r.pose = 'stand'; r.tail = 1; r.goal = { x: L.hand.x - 0.9, y: L.hand.y - 1.1, speed: GAITS.sprint, arrive: 0.5 };
  } else if (rec.bond >= 2) {
    s.greeting = 'trot'; r.mode = 'runto'; r.pose = 'stand'; r.tail = 0.7; r.goal = { x: L.hand.x - 0.8, y: L.hand.y - 1.9, speed: GAITS.trot, arrive: 0.6 };
  } else {
    s.greeting = 'glance'; r.mode = 'glance'; r.pose = 'lie'; r.mt = 0; r.tail = 0.2; r.heading = 0.3;
  }
}

// ---------- the ball ----------
function ballStep(s, h) {
  const b = s.ball, L = s.L;
  if (b.state === 'carried') return;
  if (b.state === 'rest') {
    for (const r of L.rects) pushOut(r, b, 0.2);
    return;
  }
  b.vz -= G * h; b.z += b.vz * h; b.x += b.vx * h; b.y += b.vy * h;
  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < -1.3) {
      b.vz = -b.vz * 0.52; b.vx *= 0.82; b.vy *= 0.82;
      emit(s, 'bounce', { power: clamp(-b.vz / 7, 0.1, 1), x: b.x, y: b.y });
      if (!b.first) { b.first = true; opinion(s); }
    } else { b.vz = 0; if (!b.first) { b.first = true; opinion(s); } }
  }
  if (b.z === 0 && b.vz === 0) {
    const sp = hyp(b.vx, b.vy);
    if (sp < 0.25) { b.vx = b.vy = 0; b.state = 'rest'; emit(s, 'settle', {}); }
    else { const k = Math.max(0, sp - 3.4 * h) / sp; b.vx *= k; b.vy *= k; if (rnd(s) < 0.05) emit(s, 'roll', { speed: sp }); }
  }
  // walls
  const bd = L.bounds;
  if (b.x < bd.x0) { b.x = bd.x0; b.vx = Math.abs(b.vx) * 0.6; emit(s, 'bounce', { power: 0.35, x: b.x, y: b.y }); }
  if (b.x > bd.x1) { b.x = bd.x1; b.vx = -Math.abs(b.vx) * 0.6; emit(s, 'bounce', { power: 0.35, x: b.x, y: b.y }); }
  if (b.y < bd.y0) { b.y = bd.y0; b.vy = Math.abs(b.vy) * 0.6; emit(s, 'bounce', { power: 0.35, x: b.x, y: b.y }); }
  if (b.y > bd.y1) { b.y = bd.y1; b.vy = -Math.abs(b.vy) * 0.6; emit(s, 'bounce', { power: 0.35, x: b.x, y: b.y }); }
  for (const r of L.rects) {
    if (!insideRect(r, b.x, b.y, 0.15)) continue;
    const hv = hyp(b.vx, b.vy);
    const n = pushOut(r, b, 0.15);
    if (!n) continue;
    if (b.z > r.tall) continue; // flew over; pushed out only if it lands inside (the ground check above keeps z>0)
    if (b.z < 0.02 && b.vz === 0) { b.vx *= 0.5; b.vy *= 0.5; continue; }
    const vn = b.vx * n.x + b.vy * n.y;
    if (vn < 0) { b.vx -= 1.7 * vn * n.x; b.vy -= 1.7 * vn * n.y; emit(s, 'knock', { what: r.id, power: clamp(hv / 9, 0.15, 1), x: b.x, y: b.y }); }
  }
}
function opinion(s) { // what Ralph thinks of the throw, judged where it first touches the deck
  const b = s.ball, L = s.L; if (s.fetchDone) return;
  const near = (r, d) => b.x > r.x - d && b.x < r.x + r.w + d && b.y > r.y - d && b.y < r.y + r.h + d;
  const far = b.from ? hyp(b.x - b.from.x, b.y - b.from.y) : 9;
  const fav = s.rec.favourite;
  if (near(L.scrap, 1.1)) { s.stat.opinions.loves++; mood(s, fav === 'scrap' ? 12 : 6); s.ralph.tail = 1; emit(s, 'opinion', { kind: 'loves' }); sayFlash(s, 'loves'); }
  else if (near(L.kennel, 1.1)) { s.stat.opinions.likes++; mood(s, 3); emit(s, 'opinion', { kind: 'likes' }); sayFlash(s, 'likes'); }
  else if (far < 1.9) { s.stat.opinions.looks++; emit(s, 'opinion', { kind: 'looks' }); sayFlash(s, 'nowhere'); }
}
function mood(s, d) { const r = s.ralph; r.mood = clamp(r.mood + d, 0, 100); }

// ---------- movement ----------
function nav(s, ax, ay, bx, by) { // the next point to steer to, going round the rectangles
  const L = s.L, pad = 0.62;
  for (const r of L.rects) {
    if (insideRect(r, bx, by, pad) || !segHitsRect(ax, ay, bx, by, r, pad)) continue;
    const cs = [[r.x - pad - 0.12, r.y - pad - 0.12], [r.x + r.w + pad + 0.12, r.y - pad - 0.12], [r.x - pad - 0.12, r.y + r.h + pad + 0.12], [r.x + r.w + pad + 0.12, r.y + r.h + pad + 0.12]]
      .filter(([x, y]) => x > 0.4 && y > 0.4 && x < L.w - 0.4 && y < L.h - 0.4 && !L.rects.some((o) => o !== r && insideRect(o, x, y, pad)));
    let best = null, bd = 1e9;
    for (const [x, y] of cs) { const d = hyp(x - ax, y - ay) + hyp(bx - x, by - y); if (d < bd && !segHitsRect(ax, ay, x, y, r, pad - 0.05)) { bd = d; best = { x, y }; } }
    if (best) return best;
  }
  return { x: bx, y: by };
}
function moveStep(s, h) {
  const r = s.ralph, L = s.L;
  const tiredK = 0.55 + 0.45 * clamp(r.energy / 0.5, 0, 1);
  let dvx = 0, dvy = 0, arrived = false;
  const locked = r.rubbing || r.pose === 'kick' || r.pose === 'shake' || r.mode === 'sleep' || r.tricking;
  if (r.goal && !locked) {
    const g = r.goal, dist = hyp(g.x - r.x, g.y - r.y);
    if (dist < g.arrive) arrived = true;
    const wp = nav(s, r.x, r.y, g.x, g.y);
    const wd = hyp(wp.x - r.x, wp.y - r.y) || 1;
    const final = wp.x === g.x && wp.y === g.y;
    const brake = Math.sqrt(2 * 15 * Math.max(0, dist - g.arrive * 0.6));
    const sp = Math.min(g.speed * tiredK, final ? brake : 99);
    dvx = (wp.x - r.x) / wd * sp; dvy = (wp.y - r.y) / wd * sp;
  }
  const speed = hyp(r.vx, r.vy), want = hyp(dvx, dvy);
  const acc = (want >= speed ? 24 : 17) * h;
  const ex = dvx - r.vx, ey = dvy - r.vy, em = hyp(ex, ey);
  if (em <= acc) { r.vx = dvx; r.vy = dvy; } else { r.vx += ex / em * acc; r.vy += ey / em * acc; }
  if (speed > 5.2 && want < speed - 3 && r.brakeCd <= 0) { emit(s, 'skid', { speed, x: r.x, y: r.y, dir: Math.atan2(r.vy, r.vx) }); r.brakeCd = 0.7; }
  r.brakeCd -= h;
  r.x += r.vx * h; r.y += r.vy * h;
  const bd = L.bounds; r.x = clamp(r.x, bd.x0 + 0.3, bd.x1 - 0.3); r.y = clamp(r.y, bd.y0 + 0.3, bd.y1 - 0.3);
  for (const o of L.rects) { const n = pushOut(o, r, 0.42); if (n) { const vn = r.vx * n.x + r.vy * n.y; if (vn < 0) { r.vx -= vn * n.x; r.vy -= vn * n.y; } } }
  const sp2 = hyp(r.vx, r.vy);
  if (sp2 > 0.5) {
    const th = Math.atan2(r.vy, r.vx), rate = (sp2 > 4.5 ? 4.2 : 8) * h;
    const d = angDiff(r.heading, th); r.heading += clamp(d, -rate, rate);
    const before = Math.floor(r.stride); r.stride += sp2 * h * 0.62;
    if (Math.floor(r.stride) !== before && sp2 > 1.6) emit(s, 'claw', { speed: sp2 });
  } else if (r.lookAt) {
    const th = Math.atan2(r.lookAt.y - r.y, r.lookAt.x - r.x), d = angDiff(r.heading, th); r.heading += clamp(d, -3.2 * h, 3.2 * h);
  }
  return arrived;
}
const faceAt = (s, x, y) => { s.ralph.lookAt = { x, y }; };

// ---------- the dog's mind ----------
const CALM = new Set(['idle', 'wander', 'wait', 'glance', 'come', 'search']);
const CARRYING = new Set(['bring', 'dropwalk', 'present', 'keepgo', 'keep']);
const BUSY_FETCH = new Set(['chase', 'bring', 'dropwalk', 'findgo', 'dig', 'findback']);
function setMode(s, mode, mt = 0, pose) { const r = s.ralph; r.mode = mode; r.mt = 0; r.mtMax = mt; if (pose) r.pose = pose; r.lookAt = null; if (mode !== 'sleep') r.sleepZ = 0; }
function goto_(s, x, y, speed, arrive = 0.5) { s.ralph.goal = { x, y, speed, arrive }; }
function stopGoal(s) { s.ralph.goal = null; }

function enterIdle(s) {
  const r = s.ralph;
  stopGoal(s); setMode(s, 'idle', 1.5 + rnd(s) * 3, 'stand'); r.idleT = 0;
  if (r.pending.length) startPending(s);
}
function startPending(s) {
  const r = s.ralph; const what = r.pending.shift();
  if (what === 'eat') startEat(s);
}
function startEat(s) {
  const r = s.ralph, L = s.L;
  if (r.carry === 'ball') dropBall(s, r.x + Math.cos(r.heading) * 0.6, r.y + Math.sin(r.heading) * 0.6);
  s.chewing = false; // he leaves the bone for a minute
  setMode(s, 'eatgo', 0, 'stand'); goto_(s, L.bowl.x + 0.1, L.bowl.y + 0.85, GAITS.trot, 0.4);
}
function dropBall(s, x, y) { const b = s.ball; b.x = x; b.y = y; b.z = 0.1; b.vx = b.vy = 0; b.vz = 1.6; b.state = 'air'; b.first = true; b.from = null; s.ralph.carry = null; emit(s, 'drop', {}); }

function pickUp(s) { // Ralph reaches the ball
  const r = s.ralph, b = s.ball, L = s.L;
  if (r.forceBring) { // he dropped it halfway and now carries on: no new roll, not a new fetch
    r.forceBring = false; b.state = 'carried'; r.carry = 'ball'; emit(s, 'pickup', {}); r.style = 'bring';
    setMode(s, 'bring', 0, 'stand'); goto_(s, L.hand.x, L.hand.y - 0.8, GAITS.trot, 0.55); return;
  }
  // the wrong thing?
  if (r.find == null && s.foundItems.length < FIND_CAP) {
    for (const f of s.rec.finds) {
      if (rnd(s) < f.chance) { r.find = f.item; break; }
    }
  }
  s.stat.fetches++; r.energy = clamp(r.energy - 0.13, 0, 1);
  mood(s, s.rec.favourite === 'ball' ? 8 : 4); r.tail = 1;
  if (r.find) { // he ignores the ball and trots off to the scrap pile
    emit(s, 'sniff', {}); b.state = 'rest'; b.vx = b.vy = 0; b.z = 0;
    setMode(s, 'findgo', 0, 'stand'); goto_(s, L.scrapMouth.x, L.scrapMouth.y, GAITS.run, 0.5); sayFlash(s, 'scrapped', 3);
    return;
  }
  b.state = 'carried'; emit(s, 'pickup', {});
  const u = rnd(s), tired = r.energy < 0.18;
  r.styleFrom = { x: r.x, y: r.y };
  if (tired || u >= RATES.bring + RATES.drop) { r.style = 'keep'; s.stat.keeps++; r.carry = 'ball'; keepSpot(s); }
  else if (u >= RATES.bring) { r.style = 'drop'; r.carry = 'ball'; setMode(s, 'dropwalk', 0, 'stand'); goto_(s, L.hand.x, L.hand.y - 0.8, GAITS.trot, 0.5); r.dropAt = 0.4 + 0.15 * rnd(s); r.d0 = hyp(L.hand.x - r.x, L.hand.y - r.y); }
  else { r.style = 'bring'; r.carry = 'ball'; setMode(s, 'bring', 0, 'stand'); goto_(s, L.hand.x, L.hand.y - 0.8, GAITS.run, 0.55); }
}
function keepSpot(s) {
  const r = s.ralph, L = s.L;
  const opts = [{ x: L.bed.x + 0.9, y: L.bed.y + 1.6 }, { x: L.w * 0.5, y: L.h * 0.3 }, { x: L.scrap.x - 0.8, y: L.scrap.y + L.scrap.h + 1.2 }].filter((p) => !L.rects.some((o) => insideRect(o, p.x, p.y, 0.7)));
  const p = opts[Math.floor(rnd(s) * opts.length)] || { x: L.w / 2, y: L.h / 2 };
  setMode(s, 'keepgo', 0, 'stand'); goto_(s, p.x, p.y, GAITS.trot, 0.5);
}

function ralphThink(s, h) {
  const r = s.ralph, b = s.ball, L = s.L;
  r.mt += h; r.awayCd = Math.max(0, r.awayCd - h);
  r.kick = Math.max(0, r.kick - h);
  if (r.pose === 'kick' && r.kick <= 0) r.pose = 'stand';
  if (r.pose === 'shake' && r.kick <= 0) r.pose = 'stand';
  r.tail = lerp(r.tail, r.rubbing ? 1 : (r.mood > 60 ? 0.55 : r.mood > 30 ? 0.3 : 0.1), 1 - Math.exp(-2 * h));
  r.panting = r.energy < 0.35 && !BUSY_FETCH.has(r.mode) ? 1 : 0;
  if (!BUSY_FETCH.has(r.mode)) r.energy = clamp(r.energy + 0.02 * h, 0, 1);
  // ball in hand: ears up, turn to look
  const aiming = s.touch && s.touch.kind === 'ball';
  if (aiming && CALM.has(r.mode) && !s.chewing) { faceAt(s, b.x, b.y); r.tail = Math.max(r.tail, 0.9); if (s.touch.t > 0.5 && r.pose === 'stand') { r.pose = 'bow'; emit(s, 'bow', {}); } }
  if (!aiming && r.pose === 'bow') r.pose = 'stand';

  // rubbing overlay
  if (r.rubbing) { updateRub(s, h); }
  else r.heat = Math.max(0, r.heat - 0.5 * h);
  if (r.rubbing) stopGoalSoft(r);

  // the ball is only ever in his mouth while he is carrying it somewhere; any other time it goes down
  if (b.state === 'carried' && !CARRYING.has(r.mode)) dropBall(s, r.x + Math.cos(r.heading) * 0.7, r.y + Math.sin(r.heading) * 0.7);
  const arrivedFlag = r.goal ? hyp(r.goal.x - r.x, r.goal.y - r.y) < r.goal.arrive : false;
  switch (r.mode) {
    case 'sleep': r.sleepZ += h; if (r.rubbing && r.rubT > 1.4) wake(s); break;
    case 'wake': if (r.mt > 1.4) { enterIdle(s); } break;
    case 'glance':
      faceAt(s, L.hand.x, L.hand.y);
      if (r.mt > 1.2 && r.pose === 'lie') { r.pose = 'sit'; }
      if (r.mt > 3.2) { r.pose = 'stand'; setMode(s, 'come', 0, 'stand'); goto_(s, L.hand.x, L.hand.y - 3.2, GAITS.walk, 0.7); }
      break;
    case 'runto': if (arrivedFlag) { if (s.greeting === 'run') { setMode(s, 'lean', 2.4, 'stand'); r.goal = { x: L.hand.x - 0.55, y: L.hand.y - 0.85, speed: 1.6, arrive: 0.25 }; } else { stopGoal(s); setMode(s, 'idle', 2, 'sit'); faceAt(s, L.hand.x, L.hand.y); } } break;
    case 'frenzy': {
      const c = L.hand, a = r.mt * 3.4 + 2.4, R = 2.4;
      goto_(s, clamp(c.x + Math.cos(a) * R * 1.2, 1, L.w - 1), clamp(c.y - 1.0 + Math.sin(a) * R * 0.75 - 1.1, 1, L.h - 1), GAITS.sprint, 0.1);
      if (r.mt > 3.4) { setMode(s, 'lean', 2.4, 'stand'); r.goal = { x: L.hand.x - 0.55, y: L.hand.y - 0.85, speed: GAITS.run, arrive: 0.25 }; }
      break; }
    case 'lean': r.lean = lerp(r.lean, 1, 1 - Math.exp(-6 * h)); faceAt(s, L.hand.x, L.hand.y + 3); if (r.mt > r.mtMax) { r.lean = 0; enterIdle(s); } break;
    case 'idle': {
      stopGoal(s); r.idleT += h;
      if (r.pose === 'stand' && r.idleT > 2.5 && !s.touch) r.pose = 'sit';
      if (r.pose === 'sit' && r.idleT > 8 && r.mood < 70) r.pose = 'lie';
      if (!aiming && !r.rubbing) faceAt(s, (s.drag ? s.drag.x : b.x), (s.drag ? s.drag.y : b.y));
      if (r.mt > r.mtMax + (r.pose === 'lie' ? 5 : 0) && !r.rubbing && !aiming && !s.drag) {
        const p = L.pois[Math.floor(rnd(s) * L.pois.length)];
        setMode(s, 'wander', 0, 'stand'); goto_(s, p.x + (rnd(s) - 0.5) * 0.8, p.y + (rnd(s) - 0.5) * 0.8, GAITS.walk + 0.6, 0.45);
      }
      break; }
    case 'wander': if (arrivedFlag) enterIdle(s); else if (r.mt > 12) enterIdle(s); break;
    case 'come': if (arrivedFlag) { stopGoal(s); setMode(s, 'idle', 3, 'sit'); faceAt(s, L.hand.x, L.hand.y); } else if (r.mt > 10) enterIdle(s); break;
    case 'chase': {
      const air = b.state === 'air', lead = air ? 0.35 : 0.05;
      if (b.state === 'carried') { enterIdle(s); break; }
      if (r.mt < 0.12) break; // the beat before he sets off
      goto_(s, b.x + b.vx * lead, b.y + b.vy * lead, GAITS.sprint, 0.35);
      const d = hyp(b.x - r.x, b.y - r.y);
      if (d < 0.9 && b.z < 1.0) { if (b.z > 0.35) { emit(s, 'catch', {}); r.leap = 0.35; } stopGoal(s); pickUp(s); }
      else if (r.mt > 14) { enterIdle(s); }
      break; }
    case 'bring':
      if (arrivedFlag || r.mt > 14) {
        stopGoal(s);
        const trick = r.bond >= 2 && s.rec.tricks.length && rnd(s) < 0.55 ? s.rec.tricks[Math.floor(rnd(s) * s.rec.tricks.length)] : null;
        setMode(s, 'present', trick ? 1.4 : 0.6, trick ? 'stand' : 'sit'); r.tricking = trick; faceAt(s, L.hand.x, L.hand.y + 2);
      }
      break;
    case 'present':
      if (r.mt > r.mtMax) { r.tricking = null; const p = { x: L.hand.x + (rnd(s) - 0.5) * 0.5, y: L.hand.y - 0.55 }; b.x = p.x; b.y = p.y; b.z = 0.3; b.vx = b.vy = 0; b.vz = 1.4; b.state = 'air'; b.first = true; b.from = null; r.carry = null; s.stat.brings++; emit(s, 'give', {}); sayFlash(s, 'brought'); mood(s, 2); enterIdle(s); r.pose = 'sit'; r.mtMax = 5; }
      break;
    case 'dropwalk':
      if (hyp(r.x - L.hand.x, r.y - L.hand.y) < r.d0 * (1 - r.dropAt - 0.1) + 0.3 || r.mt > 12) {
        stopGoal(s); dropBall(s, r.x + Math.cos(r.heading) * 0.7, r.y + Math.sin(r.heading) * 0.7); b.vz = 1.2; s.stat.drops++;
        setMode(s, 'wait', 4.8, 'sit'); faceAt(s, L.hand.x, L.hand.y); sayFlash(s, 'dropped', 3);
      }
      break;
    case 'wait': {
      faceAt(s, L.hand.x, L.hand.y);
      if (!BUSY_FETCH.has(r.mode) && b.state === 'rest' && r.mt > r.mtMax && !aiming && !s.fetchDone) { // nobody took it: he gets on with it
        setMode(s, 'chase', 0, 'stand'); r.forceBring = true;
      }
      break; }
    case 'keepgo': if (arrivedFlag || r.mt > 8) { stopGoal(s); setMode(s, 'keep', 12, 'lie'); sayFlash(s, 'kept', 4); } break;
    case 'keep': if (r.mt > r.mtMax && !r.rubbing) { giveUp(s, 'bored'); } break;
    case 'findgo': if (arrivedFlag || r.mt > 8) { stopGoal(s); setMode(s, 'dig', 1.5, 'stand'); emit(s, 'dig', {}); faceAt(s, L.scrap.x + 1, L.scrap.y + 1); } break;
    case 'dig': if (r.mt > r.mtMax) { setMode(s, 'findback', 0, 'stand'); r.carry = 'find'; goto_(s, L.hand.x, L.hand.y - 0.9, GAITS.run, 0.6); emit(s, 'unearth', {}); } break;
    case 'findback': if (arrivedFlag || r.mt > 14) { stopGoal(s); setMode(s, 'showoff', 2.2, 'sit'); faceAt(s, L.hand.x, L.hand.y + 2); s.pocketing = { item: r.find, at: s.t }; s.stat.found++; s.foundItems.push(r.find); r.carry = null; mood(s, 6); emit(s, 'found', { item: r.find }); } break;
    case 'showoff': if (r.mt > r.mtMax) { r.find = null; enterIdle(s); } break;
    case 'eatgo': if (arrivedFlag || r.mt > 8) { stopGoal(s); setMode(s, 'eat', 2.6, 'stand'); r.eatBeats = 0; faceAt(s, L.bowl.x, L.bowl.y); } break;
    case 'eat': {
      const beat = Math.floor(r.mt / 0.5); if (beat !== r.eatBeats && r.mt < r.mtMax) { r.eatBeats = beat; emit(s, 'crunch', {}); }
      if (r.mt > r.mtMax) {
        s.bowlFull = false; s.stat.fed++; mood(s, s.rec.favourite === 'kibble' ? 12 : 6); sayFlash(s, 'ate', 2.5);
        if (r.carry === 'bone') { setMode(s, 'bonego', 0, 'stand'); goto_(s, L.bed.x, L.bed.y, GAITS.walk + 1.2, 0.35); }
        else { setMode(s, 'search', 0, 'stand'); goto_(s, b.x, b.y, GAITS.walk + 1, 0.9); }
      }
      break; }
    case 'search': if (arrivedFlag || r.mt > 8) { stopGoal(s); faceAt(s, b.x, b.y); setMode(s, 'idle', 2.5, 'sit'); sayFlash(s, 'ballwhere', 2.5); } break;
    case 'bonetake': if (r.mt > 0.9) { setMode(s, 'bonego', 0, 'stand'); goto_(s, L.bed.x, L.bed.y, GAITS.walk + 1.2, 0.35); } break;
    case 'bonego': if (arrivedFlag || r.mt > 10) { stopGoal(s); setMode(s, 'chew', 0, 'lie'); s.chewing = true; r.heading = -2.4; emit(s, 'settle-bone', {}); } break;
    case 'chew': if (!r.rubbing) faceAt(s, L.bed.x - 1, L.bed.y + 2); break;
    case 'away':
      if (arrivedFlag || r.mt > r.mtMax) { stopGoal(s); setMode(s, 'idle', 3, 'sit'); }
      break;
    default: break;
  }
  if (r.leap) r.leap = Math.max(0, r.leap - h);
  // a throw while he is busy is noticed
  r.panting = r.panting && !r.rubbing ? 1 : 0;
}
function stopGoalSoft(r) { r.vx *= 0.8; r.vy *= 0.8; }
function wake(s) { const r = s.ralph; setMode(s, 'wake', 1.4, 'sit'); emit(s, 'wake', {}); sayFlash(s, 'woke', 2.5); mood(s, 3); }
function giveUp(s, why) {
  const r = s.ralph; if (r.carry !== 'ball') return;
  const x = r.x + Math.cos(r.heading) * 0.7, y = r.y + Math.sin(r.heading) * 0.7;
  dropBall(s, x, y); s.ball.vz = 1.6;
  setMode(s, 'idle', 3, 'sit'); faceAt(s, s.L.hand.x, s.L.hand.y);
  sayFlash(s, why === 'asked' ? 'gaveup' : 'boredkeep', 3);
}

// ---------- rubbing ----------
function updateRub(s, h) {
  const r = s.ralph, t = s.touch; if (!t || t.kind !== 'ralph') return;
  const moving = t.speed > 0.35;
  r.rubT += h; s.stat.rubTotal += h;
  r.heat += (moving ? 1 : -0.1) * h; if (r.heat < 0) r.heat = 0;
  mood(s, (moving ? 3.2 : 1.2) * h * (s.rec.favourite === 'rub' ? 1.5 : 1) * (r.mood < 30 ? 1.6 : 1));
  const dx = t.x - r.x, dy = t.y - r.y;
  // body frame: forward = +y; heading points along the nose
  const fx = dx * Math.cos(r.heading) + dy * Math.sin(r.heading), side = -dx * Math.sin(r.heading) + dy * Math.cos(r.heading);
  const loc = { x: side / BODY, y: fx / BODY };
  const d = hyp(loc.x - s.rec.spot.x, loc.y - s.rec.spot.y);
  r.warm = clamp(1 - d / 0.9, 0, 1);
  if (d < 0.4 && moving) r.spotT += h; else r.spotT = Math.max(0, r.spotT - h * 0.7);
  if (r.spotT > 0.9 && r.kick <= 0 && r.pose !== 'kick') {
    r.pose = 'kick'; r.kick = 1.5; r.spotT = 0; s.stat.kicks++; emit(s, 'kick', {}); sayFlash(s, 'spot', 3);
    mood(s, 8); goodRub(s);
  }
  if (!s.stat.goodRub && r.rubT > 5) goodRub(s);
  r.rubLook = { x: t.x, y: t.y };
  if (r.heat > 14) { // too long in one go
    r.rubbing = false; s.touch.kind = 'none'; r.heat = 0; r.pose = 'shake'; r.kick = 1.1; emit(s, 'shake', {}); sayFlash(s, 'enough', 3);
    setMode(s, 'away', 6, 'shake'); r.awayCd = 3; r.pending = r.pending.filter(Boolean);
    const L = s.L, far = [{ x: L.w * 0.5, y: L.h * 0.35 }, { x: L.scrap.x - 1.4, y: L.scrap.y + 3.2 }, { x: L.bed.x + 0.4, y: L.bed.y + 2.4 }];
    const p = far[Math.floor(rnd(s) * far.length)]; goto_(s, p.x, p.y, GAITS.walk + 0.4, 0.5);
  }
}
function goodRub(s) { if (s.stat.goodRub) return; s.stat.goodRub = true; raiseBond(s, 0.5); }
function raiseBond(s, amount) {
  const r = s.ralph; if (r.bond >= 5) return;
  r.bondProgress += amount;
  const day = s.today;
  if (r.bondProgress >= 1) {
    if (r.bondedOn !== day) { r.bond++; r.bondProgress = r.bond >= 5 ? 0 : r.bondProgress - 1; r.bondedOn = day; emit(s, 'bond', { bond: r.bond }); sayFlash(s, 'bond', 3.2); }
    else r.bondProgress = Math.min(r.bondProgress, 0.99);
  }
}

// ---------- the player's hands ----------
export function press(s, x, y) {
  if (s.left) return 'none';
  const r = s.ralph, b = s.ball;
  s.touch = { kind: 'deck', x, y, sx: x, sy: y, t: 0, speed: 0, moved: 0 };
  const onBall = (b.state === 'rest') && hyp(x - b.x, y - b.y) < 0.85;
  const onRalph = hyp(x - r.x, y - r.y) < 1.05;
  if (onBall && !(onRalph && r.mode === 'keep')) { s.touch.kind = 'ball'; return 'ball'; }
  if (onRalph && (CALM.has(r.mode) || r.mode === 'sleep' || r.mode === 'keep' || r.mode === 'chew' || r.mode === 'lean' || r.mode === 'present' || r.mode === 'showoff' || r.mode === 'search')) {
    s.touch.kind = 'ralph'; r.rubbing = true; r.rubT = 0; r.spotT = 0; s.stat.petted++; emit(s, 'pet', {});
    if (r.mode === 'wander') { stopGoal(s); }
    return 'ralph';
  }
  return 'deck';
}
export function move(s, x, y, dt = 0) {
  const t = s.touch; if (!t) return;
  const d = hyp(x - t.x, y - t.y); t.moved += d; t.speed = dt > 0 ? d / dt : t.speed; t.x = x; t.y = y;
}
export function release(s, x, y) {
  const t = s.touch; if (!t) return null; s.touch = null;
  const r = s.ralph, b = s.ball; let out = 'none';
  if (t.kind === 'ball') {
    const dx = b.x - x, dy = b.y - y, pull = hyp(dx, dy);
    if (pull >= 0.7 && !s.left) { out = throwBall(s, dx / pull, dy / pull, Math.min(pull, 4.2)); } else { out = 'noThrow'; sayFlash(s, 'pullback', 2); }
    if (r.pose === 'bow') r.pose = 'stand';
  } else if (t.kind === 'ralph') {
    r.rubbing = false; r.rubLook = null; r.warm = 0;
    if (t.moved < 0.5 && t.t < 0.45) { // a tap on him
      if (r.mode === 'keep' && r.carry === 'ball') { giveUp(s, 'asked'); out = 'asked'; }
      else if (r.mode === 'chew') { emit(s, 'thump', {}); out = 'pat'; }
      else out = 'pat';
    } else out = 'rub';
    if (r.mode === 'wander') enterIdle(s);
  } else if (t.kind === 'deck' && t.moved < 0.6 && t.t < 0.5) { out = callRalph(s, x, y); }
  return out;
}
function throwBall(s, ux, uy, P) {
  const b = s.ball, r = s.ralph;
  b.from = { x: b.x, y: b.y }; b.first = false; b.z = 0.5;
  b.vx = ux * (3 + P * 2.6); b.vy = uy * (3 + P * 2.6); b.vz = 4.5 + P * 1.1; b.state = 'air'; s.stat.throws++;
  emit(s, 'throw', { power: P / 4.2 });
  if (s.chewing || s.fetchDone) { emit(s, 'look', {}); sayFlash(s, 'busy', 2.5); return 'thrown'; }
  if (r.mode === 'sleep') { emit(s, 'ear', {}); sayFlash(s, 'sleepsthrough', 2.5); return 'thrown'; }
  const canChase = CALM.has(r.mode) || ['lean', 'showoff', 'runto', 'frenzy', 'search'].includes(r.mode) || (r.mode === 'away' && r.awayCd <= 0);
  if (canChase) { r.rubbing = false; r.carry = null; r.pose = 'stand'; r.lean = 0; r.forceBring = false; setMode(s, 'chase', 0, 'stand'); sayFlash(s, 'chasing', 3); }
  else emit(s, 'look', {}); // busy (eating, carrying something): he glances at it
  return 'thrown';
}
function callRalph(s, x, y) {
  const r = s.ralph, L = s.L; s.stat.calls++;
  emit(s, 'call', { x, y });
  if (r.mode === 'sleep') { emit(s, 'ear', {}); sayFlash(s, 'sleepsthrough', 2.5); return 'ear'; }
  if (r.mode === 'chew') { emit(s, 'look', {}); sayFlash(s, 'busy', 2.5); return 'busy'; }
  if (!(CALM.has(r.mode) || r.mode === 'lean' || r.mode === 'showoff' || r.mode === 'away')) return 'busy';
  if (r.mode === 'away' && r.awayCd > 0) { r.patience += 0.15; return 'ignored'; }
  const p = clamp(0.35 + r.mood / 160 + r.bond * 0.06 + r.patience, 0, 1);
  if (rnd(s) < p || r.patience >= 0.6) {
    r.patience = 0; r.lean = 0; setMode(s, 'come', 0, 'stand');
    const tx = clamp(x, L.bounds.x0 + 0.5, L.bounds.x1 - 0.5), ty = clamp(y, L.bounds.y0 + 0.5, L.bounds.y1 - 0.5);
    const q = { x: tx, y: ty }; for (const o of L.rects) pushOut(o, q, 0.7);
    goto_(s, q.x, q.y, GAITS.trot, 0.5); sayFlash(s, 'coming', 2.5); return 'come';
  }
  r.patience += 0.25; sayFlash(s, 'notnow', 2.5); r.tail = 0.2; emit(s, 'ignore', {});
  return 'ignored';
}
// dragging a tray item: the view tells the model where it is, so Ralph can look
export function dragTo(s, item, x, y) { s.drag = { item, x, y }; }
export function dragEnd(s) { s.drag = null; }
export function dropItem(s, item, x, y) {
  s.drag = null; const r = s.ralph, L = s.L, rec = s.rec;
  if (item === 'bone') {
    const left = rec.have.bone - s.stat.usedBone;
    if (left <= 0 || s.chewing) { sayFlash(s, s.chewing ? 'havebone' : 'nobone', 2.5); return 'no'; }
    if (hyp(x - r.x, y - r.y) > 1.9) { sayFlash(s, 'closer', 2.5); return 'miss'; }
    s.stat.usedBone++; s.stat.boneGiven = true; s.fetchDone = true;
    if (r.carry === 'ball') dropBall(s, r.x, r.y);
    r.rubbing = false; if (s.touch) s.touch = null;
    setMode(s, 'bonetake', 0, 'stand'); r.carry = 'bone'; r.lean = 0; r.tricking = null; faceAt(s, x, y);
    mood(s, rec.favourite === 'bone' ? 16 : 10); raiseBond(s, 1);
    emit(s, 'take-bone', {}); sayFlash(s, 'bone', 3); return 'bone';
  }
  if (item === 'kibble') {
    const left = rec.have.kibble - s.stat.usedKibble;
    if (left <= 0) { sayFlash(s, 'nokibble', 2.5); return 'no'; }
    if (hyp(x - L.bowl.x, y - L.bowl.y) > 1.5) { sayFlash(s, 'bowlfar', 2.5); return 'miss'; }
    if (s.bowlFull) { sayFlash(s, 'bowlfull', 2.5); return 'full'; }
    s.stat.usedKibble++; s.bowlFull = true; emit(s, 'pour', {}); sayFlash(s, 'kibble', 2.5);
    if (CALM.has(r.mode) || r.mode === 'chew' || r.mode === 'keep' || r.mode === 'lean' || r.mode === 'showoff' || r.mode === 'sleep' || r.mode === 'away') {
      if (r.mode === 'sleep') { setMode(s, 'wake', 1.4, 'sit'); emit(s, 'wake', {}); r.pending.push('eat'); } else startEat(s);
    } else r.pending.push('eat');
    return 'kibble';
  }
  return 'no';
}

// ---------- the tick ----------
export function tick(s, dt) {
  if (s.left) return;
  dt = clamp(num(dt, 0), 0, 0.1); const n = Math.max(1, Math.ceil(dt / STEP)); const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.t += h;
    if (s.touch) s.touch.t += h;
    ballStep(s, h); ralphThink(s, h); moveStep(s, h);
    const r = s.ralph; // mood drifts home; it never sticks at the bottom
    const target = 38, k = r.mood < target ? 0.6 : 0.12; r.mood = clamp(r.mood + (target - r.mood) * k * h * 0.1 + (r.mood < 12 ? 0.8 * h : 0), 0, 100);
    if (s.pocketing && s.t - s.pocketing.at > 3) pocket(s);
  }
  if (s.flash && s.flash.until < s.t) s.flash = null;
}
export function pocket(s) { if (s.pocketing) { s.pocketed.push(s.pocketing.item); s.pocketing = null; emit(s, 'pocket', {}); } }

// ---------- words: derived from what he is doing right now, so nothing goes stale ----------
export function sayKey(s) {
  if (s.flash) return s.flash.key;
  const r = s.ralph;
  if (s.touch?.kind === 'ball') return r.pose === 'bow' ? 'bowing' : 'aiming';
  if (s.drag) return s.drag.item === 'bone' ? 'draggingBone' : 'draggingKibble';
  if (r.rubbing) return r.warm > 0.55 ? 'warm' : 'rubbing';
  return 'mode-' + r.mode;
}
export function areas(s) { return { ralph: { x: s.ralph.x, y: s.ralph.y }, ball: s.ball, hand: s.L.hand }; }

// ---------- finishing ----------
export function finish(s, { left = false } = {}) {
  s.left = true; pocket(s);
  const r = s.ralph, rec = s.rec;
  const items = {};
  if (s.stat.usedBone) items.bone = -s.stat.usedBone;
  if (s.stat.usedKibble) items.kibble = -s.stat.usedKibble;
  for (const f of s.foundItems) items[f] = (items[f] || 0) + 1;
  const res = {
    done: true, success: true, grade: Math.round(clamp(r.mood, 0, 100)), ...(left ? { left: true } : {}),
    fetches: s.stat.fetches, petted: s.stat.petted, fed: s.stat.fed, found: s.stat.found, greeting: s.greeting,
    effects: { items, world: { ralph: { bond: r.bond, bondProgress: Math.round(r.bondProgress * 100) / 100, bondedOn: r.bondedOn, mood: Math.round(r.mood), lastSeen: rec.now, fetches: rec.fetches + s.stat.fetches } } },
  };
  return JSON.parse(JSON.stringify(res));
}
