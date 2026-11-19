// Shared bits of the crafting chain's screens: the stylesheet, a tiny element helper, the effect chips (every skill point and
// roll effect in plain words, straight from the setup so the words cannot disagree with the game), the grade card and a
// requestAnimationFrame loop. DOM only; no rules here.
import { KIND_NAME, PASS, CLEAN, PERFECT, gradeWord } from './craftChain.js';
import { CUT_BASE, SCREW_BASE } from './setup.js';

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};

/** Load craftchain.css once (the page links minigames.css itself; the chain's own file rides along with its views). */
export function ensureStyle() {
  if (typeof document === 'undefined' || document.querySelector('link[data-craftchain]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./craftchain.css', import.meta.url).href; link.dataset.craftchain = '';
  document.head.append(link);
}

const r1 = (x) => Math.round(x * 10) / 10;
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The effect chips for one game at this craft's roll: what the roll did, what each of the three paths did. Every point shown.
 * Returns [{ id, text }]; a path with no points reads "0 points: nothing yet".
 */
export function effectChips(kind, setup) {
  const p = setup.points || {}, q = p.quality | 0, sp = p.speed | 0, ma = p.material | 0;
  const out = [];
  if (kind === 'cut') {
    out.push({ id: 'roll', text: `${setup.label} roll: line ${r1(setup.width)} wide (${setup.toolWidth} x ${r1(1 + CUT_BASE.tierWidth * setup.tier)})${setup.guide ? ', dotted guide on' : ''}` });
    out.push({ id: 'tool', text: `Cutter: ${setup.tool} (${setup.toolWidth} wide)` });
    out.push({ id: 'speed', text: `Speed ${sp}: clean feed up to ${Math.round(setup.feed)} units a second${sp ? ` (+${Math.round(CUT_BASE.feedPerPoint * sp * 100)}%)` : ''}` });
  } else if (kind === 'screw') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${r1(setup.turns * (1 + SCREW_BASE.threadPerPoint * sp))} turns before points, snug zone ${r1(setup.zone * 100)}% of the last turn` });
    out.push({ id: 'speed', text: `Speed ${sp}: thread +${Math.round(SCREW_BASE.threadPerPoint * sp * 100)}% a turn, so ${Math.round(setup.turns * 100) / 100} turns` });
  }
  out.push({ id: 'quality', text: `Quality ${q}: ${sign(setup.qualityBonus)} on the item` });
  out.push({ id: 'material', text: `Material ${ma}: ${Math.round((1 - setup.materialFactor) * 100)}% less scrap, carried across crafts` });
  if (sp) out.push({ id: 'build', text: `Speed ${sp}: ${Math.round((1 - setup.buildFactor) * 100)}% off the build time` });
  return out;
}

export function chipList(chips) {
  return h('ul', { class: 'cc-chips', 'aria-label': 'What your roll and points did' }, ...chips.map((c) => h('li', { class: 'cc-chip', 'data-chip': c.id, text: c.text })));
}

/** A meter: a bar, a tick at the limit and a number. update(value) moves it. */
export function meter({ label, limit, max, unit = '' }) {
  const fill = h('i'), tick = h('b', { class: 'cc-tick', style: `left:${(100 * limit) / max}%` }), num = h('em', { text: `0 / ${Math.round(limit)}${unit}` });
  const bar = h('div', { class: 'cc-meter', role: 'img', 'aria-label': `${label} against its limit` }, fill, tick);
  const root = h('div', { class: 'cc-stat cc-feedstat' }, h('span', { text: label }), bar, num);
  return { root, update(v) { fill.style.width = `${Math.min(100, (100 * v) / max)}%`; root.classList.toggle('is-over', v > limit); num.textContent = `${Math.round(v)} / ${Math.round(limit)}${unit}`; } };
}

/** The card a finished game leaves: the grade, its word, the three marks on a bar and what to do next. */
export function gradeCard({ kind, grade, why = '', passed, redoNo = 0, redosAllowed = 2, last = false, onGo, goText }) {
  const word = gradeWord(grade);
  const bar = h('div', { class: 'cc-gbar', role: 'img', 'aria-label': `Grade ${Math.round(grade)} of 100; 70 passes, 85 is clean, 95 is perfect` },
    h('i', { style: `width:${Math.max(0, Math.min(100, grade))}%` }), ...[PASS, CLEAN, PERFECT].map((n) => h('b', { class: 'cc-gmark', style: `left:${n}%`, 'data-at': n, text: String(n) })));
  const next = passed ? '' : last ? 'That was the last redo allowed: the craft is ruined.' : `It spoils one unit of material. Redo ${redoNo} of ${redosAllowed}, on a fresh sheet.`;
  const go = h('button', { type: 'button', class: 'primary ui-btn cc-go', text: goText || (passed ? 'Continue' : last ? 'Step back' : 'Redo on a fresh sheet') });
  go.addEventListener('click', () => onGo?.());
  const card = h('div', { class: `rp-result ui-card cc-grade ${passed ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-pass': passed ? '1' : '0', 'data-grade': Math.round(grade) },
    h('b', { class: 'cc-gnum', text: String(Math.round(grade)) }), h('span', { class: 'cc-gword', text: `${KIND_NAME[kind]}: ${word}` }), bar,
    h('span', { class: 'cc-why', text: [why, next].filter(Boolean).join(' ') }), go);
  return { card, go };
}

/** A requestAnimationFrame loop with a capped dt (seconds); returns stop(). */
export function loop(fn) {
  let raf = 0, last = 0, on = true;
  const frame = (now) => { if (!on) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; fn(dt, now); };
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return () => { on = false; cancelAnimationFrame(raf); };
}

/** Seeded 0..1 numbers for the sheet's brushing (the same sheet for the same seed). */
export function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
