// The crew's station (P11): what player two sees and does aboard the pilot's
// ship. It draws the state the pilot's browser sends (crew/state.js) and sends
// back crew actions; the pilot's game decides what they do. Every string goes
// in with textContent.
//
//   Shoot (S54): a turret you aim yourself. Click or tap the target, or aim
//     with the arrow keys and press Space. One shot a round.
//   Repair (S53): hold a button to fix a knocked-out system or patch the hull.
//     One repair a round. Hold R on a keyboard.
//   Navigation (S56): the odds of trouble on each lane and the next jump; scan
//     the next jump; point the pilot at a lane.
//   Docked (S55): take a dialogue check with your own stats, or work the seal.
import { renderDpr, readRenderScale } from '../renderScale.js';
import { CREW_RULES } from '../quests/parts/crew.js';
import { STATS } from '../data.js';
// Live (real-time) fights: the crew's scope, free-aim turret, repairs and abilities (races lane).
import { createLiveScope } from '../races/liveScope.js';

const STAT_NAME = Object.fromEntries(STATS.map((s) => [s.id, s.name]));
const CIPHER_LIMIT = 6;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const str = (v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : '');

function bar(label, value, max, cls = '') {
  const v = Math.max(0, Math.round(num(value))), m = Math.max(1, Math.round(num(max, 1)));
  return el('div', { class: `qs-bar ${cls}` },
    el('span', { text: `${label} ${v}/${m}` }),
    el('div', { class: 'qs-bar-track', role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(m), 'aria-valuenow': String(v) }, el('i', { style: `width:${Math.min(100, Math.round((v / m) * 100))}%` })));
}

// ---- the turret ----------------------------------------------------------
// The target moves the way the enemy flies (its movement), on a small scope.
function createTurret({ onFire, reducedMotion }) {
  const W = 320, H = 180;
  const canvas = el('canvas', { class: 'cw-scope', 'aria-label': 'Turret scope. Click or tap the target to fire, or aim with the arrow keys and press Space.', tabindex: '0' });
  const aim = { x: W / 2, y: H / 2 };
  let target = { x: W / 2, y: H / 2, r: 16 };
  let movement = 'hold', cloaked = false, ready = false, raf = 0, flash = 0, flashHit = false;
  const t0 = performance.now();

  function size() {
    const dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    return dpr;
  }
  let dpr = size();
  addEventListener('stardust:render-scale', () => { dpr = size(); });

  function place(t) {
    const s = reducedMotion() ? 0.5 : 1;
    const cx = W / 2, cy = H / 2;
    if (movement === 'strafe') return { x: cx + Math.sin(t * 1.6 * s) * 120, y: cy + Math.sin(t * 0.5 * s) * 22, r: 15 };
    if (movement === 'orbit') return { x: cx + Math.cos(t * 1.1 * s) * 80, y: cy + Math.sin(t * 1.1 * s) * 50, r: 15 };
    if (movement === 'charge') return { x: cx + Math.sin(t * 0.9 * s) * 60, y: cy + Math.sin(t * 1.3 * s) * 30, r: 14 + (Math.sin(t * 0.8 * s) + 1) * 6 };
    return { x: cx + Math.sin(t * 0.7 * s) * 24, y: cy + Math.cos(t * 0.5 * s) * 12, r: 17 };
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    target = place(t);
    canvas.dataset.tx = target.x.toFixed(1);
    canvas.dataset.ty = target.y.toFixed(1);
    canvas.dataset.tr = target.r.toFixed(1);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#050b14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1d3344';
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = cloaked ? 0.25 : 1;
    ctx.fillStyle = '#ffad72';
    ctx.beginPath(); ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#070d17';
    ctx.beginPath(); ctx.arc(target.x, target.y, target.r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ready ? '#81e6df' : '#4c6677';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aim.x - 16, aim.y); ctx.lineTo(aim.x + 16, aim.y); ctx.moveTo(aim.x, aim.y - 16); ctx.lineTo(aim.x, aim.y + 16); ctx.stroke();
    if (flash > now) {
      ctx.fillStyle = flashHit ? '#81e6df' : '#ffad72';
      ctx.font = '700 14px Consolas, monospace';
      ctx.fillText(flashHit ? 'HIT' : 'MISS', aim.x + 14, aim.y - 14);
    }
    ctx.fillStyle = '#8fa6b7';
    ctx.font = '11px Consolas, monospace';
    ctx.fillText(ready ? 'TURRET READY' : 'RECHARGING: NEXT ROUND', 10, H - 10);
    raf = requestAnimationFrame(draw);
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    aim.x = Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W));
    aim.y = Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H));
  }
  function fire() {
    if (!ready) return;
    const hit = Math.hypot(aim.x - target.x, aim.y - target.y) <= target.r + 4;
    ready = false;
    flash = performance.now() + 600;
    flashHit = hit;
    onFire(hit);
  }
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); point(e); fire(); });

  return {
    canvas,
    set({ movement: m, cloaked: c, ready: r }) { movement = m; cloaked = c; ready = r; },
    start() { if (!raf) raf = requestAnimationFrame(draw); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    nudge(dx, dy) { aim.x = Math.max(0, Math.min(W, aim.x + dx)); aim.y = Math.max(0, Math.min(H, aim.y + dy)); },
    fire,
  };
}

// ---- hold-to-repair --------------------------------------------------------
function holdButton(label, onDone, { disabled = false, system }) {
  const fill = el('i', { class: 'cw-hold-fill' });
  const b = el('button', { type: 'button', class: 'cw-hold', disabled, dataset: { repair: system }, 'aria-label': `${label}: hold for ${(CREW_RULES.holdMs / 1000).toFixed(1)} seconds` }, fill, el('span', { text: label }));
  let start = 0, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; start = 0; fill.style.width = '0%'; };
  const tick = (now) => {
    const p = Math.min(1, (now - start) / CREW_RULES.holdMs);
    fill.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) { stop(); onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  const begin = (e) => { e?.preventDefault?.(); if (b.disabled || start) return; start = performance.now(); raf = requestAnimationFrame(tick); };
  b.addEventListener('pointerdown', begin);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) begin(e); });
  b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  return { node: b, begin, stop };
}

/**
 * root: the element to draw in. send(action): a crew action to the pilot.
 * me(): this player's crew card (their own stats, for the check buttons).
 * reducedMotion(): slow the turret target.
 */
export function createStation({ root, send, me, reducedMotion = () => false }) {
  let state = null;
  let noteText = '';
  let cipher = [];
  let riddle = [];
  let repairs = [];
  let puzzleKey = '';
  const turret = createTurret({ reducedMotion, onFire: (hit) => send({ job: 'turret', hit }) });
  let liveScope = null; // while the captain flies a fight live
  const endLive = () => { liveScope?.stop(); liveScope = null; };

  function header(s) {
    return [
      el('p', { class: 'vy-eyebrow', text: `CREW STATION · ABOARD ${s.captain.toUpperCase()}'S SHIP` }),
      el('h2', { text: s.job ? s.job.title : 'Docked in the hangar' }),
      s.job ? el('p', { class: 'vy-note', text: s.job.where }) : null,
      s.hullMax ? bar('Hull', s.hull, s.hullMax) : null,
    ];
  }

  function talk(s) {
    const card = me();
    return el('section', { class: 'cw-part' },
      s.speaker ? el('p', { class: 'qs-speaker', text: s.speaker }) : null,
      el('p', { class: 'qs-text', text: s.text }),
      s.checks.length ? el('h3', { text: 'CHECKS YOU CAN TAKE' }) : el('p', { class: 'vy-note', text: 'Nothing here for you to roll. The captain does the talking.' }),
      el('ul', { class: 'vy-list cw-checks' }, ...s.checks.map((c) => el('li', {},
        el('span', { text: c.label }),
        el('button', { type: 'button', dataset: { check: String(c.index) }, onclick: () => send({ job: 'check', index: c.index }),
          text: `Take it: your ${c.statName} ${card?.stats?.[c.stat] ?? '?'} + d6 vs ${c.dc}` })))),
    );
  }

  function liveFight(s) {
    const f = s.fight;
    if (!liveScope) liveScope = createLiveScope({ send, me, reducedMotion });
    return el('section', { class: 'cw-part cw-fight cw-live' },
      el('h3', { text: `LIVE FIGHT · ${f.name}` }),
      liveScope.node,
      el('p', { class: 'vy-note', text: 'Point at them and fire: the turret swings from your ship to wherever you aim. Hold a repair when something breaks.' }),
    );
  }

  function fight(s) {
    const f = s.fight;
    if (f.live) return liveFight(s);
    turret.set({ movement: f.movement, cloaked: f.cloaked, ready: f.turretReady && !f.live });
    const broken = Object.entries(f.systems).filter(([, b]) => b).map(([id]) => id);
    const names = { guns: 'Guns', engine: 'Engine' };
    const holds = [
      ...broken.map((id) => holdButton(`Repair ${names[id] || id}`, () => send({ job: 'repair', system: id }), { disabled: !f.repairReady || f.live, system: id })),
      holdButton('Patch the hull', () => send({ job: 'repair', system: 'hull' }), { disabled: !f.repairReady || f.live || f.hull >= f.hullMax, system: 'hull' }),
    ];
    repairs = holds;
    return el('section', { class: 'cw-part cw-fight' },
      el('h3', { text: `SHIP FIGHT · ROUND ${f.round}` }),
      bar(f.name, f.hp, f.hpMax, 'is-enemy'),
      f.shield ? el('p', { class: 'vy-note', text: `Shield: ${f.shield}` }) : null,
      f.live ? el('p', { class: 'qs-locked', text: 'The captain is flying this fight live. Hold on until it ends.' }) : null,
      el('div', { class: 'cw-turret' }, turret.canvas,
        el('button', { type: 'button', class: 'primary', id: 'cw-fire', disabled: !f.turretReady || f.live, onclick: () => turret.fire(), text: f.turretReady ? 'Fire the turret [Space]' : 'Turret recharging' })),
      el('p', { class: 'vy-note', text: `Systems: ${broken.length ? broken.map((id) => `${names[id] || id} knocked out`).join(', ') : 'all working'}. ${f.repairReady ? 'Hold a button to repair (or hold R).' : 'One repair a round: wait for the next round.'}` }),
      el('div', { class: 'cw-repairs' }, ...holds.map((h) => h.node)),
      el('ol', { class: 'qs-minilog' }, ...f.log.map((l) => el('li', { text: l }))),
    );
  }

  function trip(s) {
    const t = s.trip;
    return el('section', { class: 'cw-part cw-nav' },
      el('h3', { text: `NAVIGATION · ${t.at} TO ${t.to}`.toUpperCase() }),
      t.phase === 'plan' ? el('p', { class: 'vy-note', text: 'The captain is picking a lane. You can see the odds; they can\'t. Point them at one.' }) : null,
      el('ul', { class: 'vy-list cw-routes' }, ...t.routes.map((r) => el('li', { dataset: { route: r.id } },
        el('span', { text: `${r.label}: ${r.odds}% chance of trouble` }),
        el('button', { type: 'button', 'aria-pressed': String(t.mark === r.id), onclick: () => send({ job: 'mark', route: r.id }), text: t.mark === r.id ? 'Recommended' : 'Recommend' })))),
      t.next ? el('p', { class: 'qs-text', dataset: { odds: String(t.nextOdds) }, text: `Next jump: ${t.next}, ${t.nextOdds}% chance of trouble${t.scanned ? ' (scanned)' : ''}.` }) : null,
      el('button', { type: 'button', id: 'cw-scan', disabled: !t.canScan, onclick: () => send({ job: 'scan' }),
        text: t.canScan ? `Scan the next jump (Wisdom ${me()?.stats?.wis ?? '?'} + d6 vs ${CREW_RULES.scan.dc})` : 'Next jump scanned' }),
      el('p', { class: 'vy-note', text: 'A good scan spots trouble early and halves the next jump\'s odds.' }),
    );
  }

  function puzzle(s) {
    const p = s.puzzle;
    const key = `${s.job?.id}:${p.kind}:${p.attemptsLeft}`;
    if (key !== puzzleKey) { puzzleKey = key; cipher = []; riddle = []; }
    if (p.kind === 'cipher') {
      const symbols = Array.isArray(p.symbols) ? p.symbols.slice(0, CIPHER_LIMIT) : [];
      const glyph = (id) => symbols.find((x) => x.id === id)?.symbol || '?';
      const slots = el('div', { class: 'qs-slots' }, ...Array.from({ length: num(p.length, 4) }, (_, i) => el('span', { class: 'qs-slot', text: cipher[i] != null ? glyph(cipher[i]) : p.reveal?.slot === i ? glyph(p.reveal.symbol) : '·' })));
      return el('section', { class: 'cw-part' },
        el('h3', { text: `THE SEAL · ${p.attemptsLeft} TRIES LEFT` }),
        el('p', { class: 'vy-note', text: 'Work the code with the captain. No symbol repeats; "in place" and "elsewhere" count after each try.' }),
        slots,
        el('div', { class: 'qs-pad' }, ...symbols.map((x) => el('button', { type: 'button', dataset: { glyph: String(x.id) }, onclick: () => { if (cipher.length < p.length && !cipher.includes(x.id)) { cipher.push(x.id); draw(); } }, text: `${x.symbol} ${str(x.label, 20)}` }))),
        el('div', { class: 'qs-moves' },
          el('button', { type: 'button', onclick: () => { cipher.pop(); draw(); }, text: 'Undo' }),
          el('button', { type: 'button', class: 'primary', disabled: cipher.length !== p.length, onclick: () => { const code = [...cipher]; cipher = []; send({ job: 'puzzle', action: { type: 'guess', code } }); }, text: 'Try the code' })),
        el('ol', { class: 'qs-guesses' }, ...(p.guesses || []).map((g) => el('li', { text: `${g.code.map(glyph).join(' ')}   ${g.exact} in place, ${g.near} elsewhere` }))),
      );
    }
    const pads = Array.isArray(p.pads) ? p.pads.slice(0, 4) : [];
    const label = (id) => pads.find((g) => g.id === id)?.label || '?';
    return el('section', { class: 'cw-part' },
      el('h3', { text: `THE RIDDLE · ${p.attemptsLeft} TRIES LEFT` }),
      el('p', { class: 'qs-text', text: p.instruction }),
      el('ul', { class: 'qs-fragments' }, ...p.fragments.map((f) => el('li', {}, el('b', { text: f.symbol }), ` ${f.text}`))),
      el('div', { class: 'glyph-grid' }, ...pads.map((g) => el('button', { type: 'button', 'aria-pressed': String(riddle.includes(g.id)), onclick: () => { if (!riddle.includes(g.id) && riddle.length < 4) { riddle.push(g.id); draw(); } } }, el('b', { text: g.symbol }), ` ${str(g.label, 20)}`))),
      el('p', { class: 'vy-note', role: 'status', text: riddle.length ? `${riddle.length} of 4: ${riddle.map(label).join(' → ')}` : '0 of 4 entered' }),
      el('div', { class: 'qs-moves' },
        el('button', { type: 'button', onclick: () => { riddle = []; draw(); }, text: 'Clear' }),
        el('button', { type: 'button', class: 'primary', disabled: riddle.length !== 4, onclick: () => { const order = [...riddle]; riddle = []; send({ job: 'puzzle', action: { type: 'answer', order } }); }, text: 'Return the echoes' })),
      p.wrong ? el('p', { class: 'qs-locked', text: 'The seal rejects that order.' }) : null,
      p.hint ? el('p', { class: 'vy-note', text: p.hint }) : null,
    );
  }

  function body(s) {
    switch (s.step) {
      case 'board': return el('p', { class: 'qs-text', text: 'The captain is at the job board. When they take a job, it shows up here: you take checks, man the turret, repair the ship and read the scopes.' });
      case 'talk': return talk(s);
      case 'fight': return fight(s);
      case 'trip': return trip(s);
      case 'puzzle': return puzzle(s);
      case 'end': return el('section', { class: `qs-end ${s.ended?.result === 'success' ? 'is-win' : 'is-fail'}` },
        el('p', { class: 'qs-eyebrow', text: s.ended?.result === 'success' ? 'JOB DONE' : 'JOB FAILED' }),
        el('h3', { text: s.ended?.title || '' }),
        el('p', { class: 'qs-text', text: s.text }));
      default: return el('p', { class: 'qs-text', text: s.text || 'On the way. Nothing for the crew this moment.' });
    }
  }

  function draw() {
    if (!state) return;
    repairs = [];
    // replaceChildren would print a null as the word "null"; leave such parts out.
    root.replaceChildren(...[
      ...header(state),
      body(state),
      noteText ? el('p', { class: 'vy-note cw-note', role: 'status', text: noteText }) : null,
      state.log.length && state.step !== 'fight' ? el('ol', { class: 'qs-minilog' }, ...state.log.map((l) => el('li', { text: l }))) : null,
    ].filter(Boolean));
    if (state.step === 'fight' && !state.fight?.live) turret.start(); else turret.stop();
    if (!(state.step === 'fight' && state.fight?.live)) endLive();
  }

  return {
    update(next) { state = next; draw(); },
    /** A live fight frame from the pilot's browser (about 15 a second). */
    liveFrame(frame) {
      if (!liveScope && state?.step === 'fight') { state = { ...state, fight: { ...state.fight, live: true } }; draw(); }
      liveScope?.frame(frame);
    },
    note(text) { noteText = str(text, 200); draw(); },
    get state() { return state; },
    /** Keys while the Crew tab is open: Space fires, arrows aim, R holds a repair. */
    keydown(e) {
      if (liveScope && state?.step === 'fight') return liveScope.keydown(e);
      if (state?.step !== 'fight' || e.target.closest?.('input, textarea, select, button')) return false;
      const step = 8;
      if (e.key === ' ') { e.preventDefault(); turret.fire(); return true; }
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) { e.preventDefault(); turret.nudge(...move); return true; }
      if ((e.key === 'r' || e.key === 'R') && !e.repeat) { const h = repairs.find((x) => !x.node.disabled); if (h) { h.begin(); return true; } }
      return false;
    },
    keyup(e) { liveScope?.keyup(e); if (e.key === 'r' || e.key === 'R') for (const h of repairs) h.stop(); },
    stop() { turret.stop(); endLive(); },
    statName: (id) => STAT_NAME[id] || id,
  };
}
