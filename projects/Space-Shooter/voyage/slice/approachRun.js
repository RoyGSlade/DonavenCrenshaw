// The page side of an approach (opening B, outcome 3): shows the time bar and the work bar, marks the target when the roll bought a hint,
// reads the player's position and the use key each frame, and reports 'pass' | 'fail' | 'abandon'. The rules are in ./assist.js (pure);
// the targets and words are in ./staging.js (data). Plain words, drawn bars, a Hold button for touch and a way out ("Try something else").
import { createApproach, verdictWords } from './assist.js';
import { targetPoint, targetReached, FORCED_DEFAULT, STEALTH } from './staging.js';
import { SWITCHES } from './switches.js';
import { doorToward } from '../datapad/route.js';
import { MAP_DEFS } from '../maps/index.js';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const niceName = (id) => ({ tull: 'Tull', nessa: 'Nessa', pip: 'Pip', reck: 'Reck', reaver: 'The Reaver' })[id] || id;

/**
 * world(): the on-foot world. toast(text). root: where the bar goes. now(): ms clock (tests). frame(fn): schedules a frame (tests).
 * run({ spec, approach, label }, done) -> { cancel() }. approach: assist.js approachFor(). done({ branch }).
 */
export function createApproachRunner({ world, toast = () => {}, root = document.body, bus = null, stealthOf = (key) => STEALTH[key] || null, frame = (fn) => requestAnimationFrame(fn), now = () => performance.now() }) {
  let active = null, scale = 1; // scale: tests speed the clock up

  function run({ spec, approach, label = '', key = '' }, done) {
    active?.cancel('abandon');
    const w = world();
    const sneak = SWITCHES.stealthTaste && spec?.kind === 'stealth' ? stealthOf(key) : null; // opening B outcome 5: live stealth in the cargo hold
    // Stealth: reaching the goal is the whole job (no hold), and the clock only runs once you are in the hold.
    const machine = createApproach(sneak ? { ...approach, needsHold: false } : approach, { handMs: 250 });
    const hud = el('section', 'op-approach');
    hud.setAttribute('role', 'status');
    hud.setAttribute('aria-live', 'polite');
    hud.dataset.tier = String(approach.tier);
    const verb = el('p', 'op-ap-verb', spec?.verb || label);
    const timeBar = el('div', 'op-ap-bar op-ap-time'); const timeFill = el('i'); timeBar.append(timeFill);
    timeBar.setAttribute('role', 'meter'); timeBar.setAttribute('aria-label', 'Time left');
    const workBar = el('div', 'op-ap-bar op-ap-work'); const workFill = el('i'); workBar.append(workFill);
    workBar.setAttribute('role', 'meter'); workBar.setAttribute('aria-label', 'Work done');
    const seconds = el('span', 'op-ap-secs');
    const helpLine = el('p', 'op-ap-help', helpWords(spec, approach));
    const hint = el('p', 'op-ap-hint', approach.help.includes('hint') ? (spec?.hint || '') : 'No hint this time. Look around.');
    const hold = el('button', 'op-ap-hold', approach.needsHold ? 'Hold to work' : 'Get there');
    if (sneak) hold.hidden = true;
    hold.type = 'button';
    const other = el('button', 'op-ap-else', 'Try something else');
    other.type = 'button';
    const actions = el('div', 'op-ap-actions'); actions.append(hold, other);
    const head = el('div', 'op-ap-head'); head.append(verb, seconds);
    hud.append(head, timeBar, workBar, helpLine, hint, actions);
    root.append(hud);

    let touchHold = false, over = false, last = now();
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); touchHold = true; hold.classList.add('is-down'); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) hold.addEventListener(t, () => { touchHold = false; hold.classList.remove('is-down'); });
    other.addEventListener('click', () => finish('abandon'));
    const onKey = (e) => { if (e.code === 'KeyE') e.preventDefault(); };
    addEventListener('keydown', onKey, true);

    w.stage.capture(true);
    const target = () => targetPoint(w.map, spec?.where, { npcs: w.npcsHere() });
    const pointer = () => {
      // A hint marks the spot on the floor; without one the player has to find it.
      const t = approach.help.includes('hint') ? target() : null;
      w.stage.mark(t ? { x: t.x, y: t.y - (spec?.where?.npc ? 48 : 0), label: spec?.verb || '' } : null);
    };

    let leftover = null, offStealth = null;
    function finish(branch) {
      if (over) return;
      over = true;
      offStealth?.();
      if (sneak) leftover = { map: sneak.map, guards: w.endStealth(), quiet: false };
      if (leftover) leftover.quiet = leftover.guards.length > 0 && leftover.guards.every((g) => g.down);
      removeEventListener('keydown', onKey, true);
      hud.remove();
      w.stage.capture(false);
      w.stage.mark(null);
      active = null;
      if (branch === 'fail') {
        const f = spec?.forces || FORCED_DEFAULT;
        if (f.who && w.npcsHere().some((n) => n.id === f.who)) w.bark(f.who, f.line, 3200); else toast(f.line);
      } else if (branch === 'pass') w.sound?.('unlock');
      bus?.emit('approach:end', { branch, label });
      done({ branch, ...(leftover ? { stealth: leftover } : {}) });
    }

    let failed = false;
    function startSneak() {
      const def = { guards: sneak.guards.filter((g) => !(approach.help.includes('hand') && g.id === 'reaver-b')) }; // a hand calls the second Reaver away
      w.beginStealth(def, approach.help.includes('tool') ? { setup: { points: { range: 4 }, level: 9 } } : {});
      offStealth = w.onStealth((e) => { if (e.type === 'alarm' || e.type === 'caught') failed = true; });
    }
    const goalPoint = () => (sneak ? targetPoint(w.map, { tile: sneak.goal.tile }) : null);

    function tick() {
      if (over) return;
      const t = now(), dt = Math.min(250, t - last) * scale; last = t;
      const p = w.position();
      let reached, ev = null, holding = touchHold || w.holding();
      if (sneak) {
        const inHold = w.map.id === sneak.map;
        if (inHold && !w.stealth) startSneak();
        if (!inHold && w.stealth) { w.endStealth(); offStealth?.(); }
        hud.dataset.phase = inHold ? 'sneak' : 'travel';
        if (!inHold) {
          // On the way in: the clock waits, the door to the hold is ringed.
          const doorId = doorToward(w.map.id, [sneak.map], MAP_DEFS), d = doorId && w.map.doors.find((x) => x.id === doorId);
          if (d && approach.help.includes('hint')) w.stage.mark({ x: d.x + d.w / 2, y: d.y + d.h / 2, label: 'Cargo hold' }); else w.stage.mark(null);
          hint.textContent = 'Get to the cargo hold. The clock starts when you are in.';
          reached = false;
        } else {
          const g = goalPoint();
          const guards = w.stealth ? w.stealth.sim.guards : [];
          const allDown = guards.length > 0 && guards.every((x) => x.state === 'down');
          reached = allDown || Boolean(g && Math.hypot(g.x - p.x, g.y - p.y) <= sneak.goal.reach * w.map.tile);
          if (g && approach.help.includes('hint')) w.stage.mark({ x: g.x, y: g.y, label: sneak.goal.label }); else w.stage.mark(null);
          hint.textContent = approach.help.includes('hint') ? 'Reach the ring behind them, or take them down from behind. Stay out of their cones.' : 'Get behind them. Stay out of their cones. Ctrl sneaks, E takes one down from behind.';
          ev = failed ? { type: 'fail' } : machine.step({ dtMs: dt, inReach: reached, holding: true });
        }
      } else {
        const tg = target();
        reached = tg ? targetReached(tg, p.x, p.y) : true; // no target here (the player is in another room): work anywhere
        ev = machine.step({ dtMs: dt, inReach: reached, holding });
        pointer();
      }
      timeFill.style.width = `${Math.round(machine.timeFraction * 100)}%`;
      workFill.style.width = `${Math.round((sneak ? 0 : machine.workFraction) * 100)}%`;
      seconds.textContent = `${Math.ceil(machine.left / 1000)} s`;
      hud.classList.toggle('is-near', reached);
      hud.classList.toggle('is-low', machine.timeFraction < 0.25);
      hold.disabled = !reached;
      hud.dataset.reached = String(reached);
      if (ev) { finish(ev.type); return; }
      frame(tick);
    }
    frame(tick);
    active = { cancel: (branch = 'abandon') => finish(branch), hud, machine };
    return active;
  }

  return { run, get active() { return active; }, cancel: () => active?.cancel('abandon'), setScale: (n) => { scale = Math.max(0.1, Number(n) || 1); }, verdictWords };
}

function helpWords(spec, a) {
  const bits = [];
  if (a.help.includes('hint')) bits.push('Hint');
  if (a.help.includes('tool')) bits.push(`Tool: ${spec?.tool || 'a good one'}`);
  if (a.help.includes('hand')) bits.push(`A hand: ${niceName(spec?.hand?.who || 'the crew')}${spec?.hand?.line ? ` ("${spec.hand.line}")` : ''}`);
  return bits.length ? bits.join(' · ') : 'No help this time.';
}
