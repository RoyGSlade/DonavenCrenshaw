// Shared bits of the crafting chain's screens: the stylesheet, a tiny element helper, the effect chips (every skill point and
// roll effect in plain words, straight from the setup so the words cannot disagree with the game), the grade card and a
// requestAnimationFrame loop. DOM only; no rules here.
import { KIND_NAME, PASS, CLEAN, PERFECT, gradeWord } from './craftChain.js';
import { CUT_BASE, SCREW_BASE, BEND_BASE, FLATTEN_BASE, POLISH_BASE, POUR_BASE, ORDER_BASE } from './setup.js';

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

const TOOL_WORDS = Object.freeze({ worn: 'thin line', shop: 'normal line', good: 'wide line' });
export const toolWords = (tool) => `${tool[0].toUpperCase()}${tool.slice(1)} cutter: ${TOOL_WORDS[tool] || 'normal line'}`;
const CUT_ROLL = Object.freeze({ '-2': 'a much narrower line', '-1': 'a narrower line', '0': 'a normal line', '1': 'a wider line and a dotted guide to follow', '2': 'a much wider line and a dotted guide to follow' });
const SCREW_ROLL = Object.freeze({ '-2': 'more turns and a narrow snug zone', '-1': 'a few more turns and a narrower snug zone', '0': 'normal turns and a normal snug zone', '1': 'fewer turns and a wider snug zone', '2': 'much fewer turns and a wide snug zone' });
const BEND_ROLL = Object.freeze({ '-2': 'a much narrower rhythm window and a tight stop zone', '-1': 'a narrower rhythm window and a tighter stop zone', '0': 'a normal rhythm window and stop zone', '1': 'a wider rhythm window and stop zone', '2': 'a much wider rhythm window and stop zone' });
const FLATTEN_ROLL = Object.freeze({ '-2': 'a much narrower power band, a stronger lean and one more bubble', '-1': 'a narrower power band and a stronger lean', '0': 'a normal power band and lean', '1': 'a wider power band and a gentler lean', '2': 'a much wider power band, a gentler lean and one fewer bubble' });
const POUR_ROLL = Object.freeze({ '-2': 'much narrower clean and pass bands on the line', '-1': 'narrower clean and pass bands on the line', '0': 'normal clean and pass bands on the line', '1': 'wider clean and pass bands on the line', '2': 'much wider clean and pass bands on the line' });
const ORDER_ROLL = Object.freeze({ '-2': 'much narrower heat bands and time windows', '-1': 'narrower heat bands and time windows', '0': 'normal heat bands and time windows', '1': 'wider heat bands and time windows', '2': 'much wider heat bands and time windows' });
const POLISH_ROLL = Object.freeze({ '-2': 'a stronger pull and cells that dimple sooner', '-1': 'a slightly stronger pull and cells that dimple a little sooner', '0': 'a normal pull and dimple point', '1': 'a slightly weaker pull and cells that dimple a little later', '2': 'a weaker pull and cells that dimple later' });

/**
 * The effect chips for one game at this craft's roll, in plain words: what the roll did and what each of the three paths did.
 * Every point shown; no formulas. Returns [{ id, text }].
 */
export function effectChips(kind, setup) {
  const p = setup.points || {}, q = p.quality | 0, sp = p.speed | 0, ma = p.material | 0;
  const out = [];
  if (kind === 'cut') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${CUT_ROLL[String(setup.tier)]}` });
    out.push({ id: 'tool', text: toolWords(setup.tool) });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: you can feed ${Math.round(CUT_BASE.feedPerPoint * sp * 100)}% faster before it tears` : 'Speed 0: normal feed' });
  } else if (kind === 'screw') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${SCREW_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: the bolt goes in ${Math.round(SCREW_BASE.threadPerPoint * sp * 100)}% faster, so fewer turns` : 'Speed 0: normal thread' });
  }
  else if (kind === 'bend') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${BEND_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: a rushed press strains the bar ${Math.round(BEND_BASE.rushPerPoint * sp / BEND_BASE.rush * 100)}% less` : 'Speed 0: a rushed press strains the bar fully' });
  }
  else if (kind === 'flatten') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${FLATTEN_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: the hammer charges ${Math.round(FLATTEN_BASE.chargePerPoint * sp * 100)}% faster` : 'Speed 0: normal hammer' });
  }
  else if (kind === 'polish') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${POLISH_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: tiles reach polished ${Math.round(POLISH_BASE.ratePerPoint * sp * 100)}% faster (the heat toward a dimple is unchanged)` : 'Speed 0: normal wheel' });
  }
  else if (kind === 'pour') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${POUR_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: the stream runs ${Math.round(POUR_BASE.ratePerPoint * sp * 100)}% faster until it nears the line (the last stretch is unchanged)` : 'Speed 0: normal stream' });
  }
  else if (kind === 'order') {
    out.push({ id: 'roll', text: `${setup.label} roll: ${ORDER_ROLL[String(setup.tier)]}` });
    out.push({ id: 'speed', text: sp ? `Speed ${sp}: the cold pan warms ${Math.round(ORDER_BASE.warmPerPoint * sp * 100)}% faster up to the butter's heat (no window gets shorter)` : 'Speed 0: normal warm-up' });
  }
  out.push({ id: 'quality', text: q ? `Quality ${q}: +${setup.qualityBonus} on the item` : 'Quality 0: no bonus' });
  out.push({ id: 'material', text: ma ? `Material ${ma}: ${Math.round((1 - setup.materialFactor) * 100)}% less scrap, carried across crafts` : 'Material 0: normal scrap use' });
  if (sp) out.push({ id: 'build', text: `Speed ${sp}: ${Math.round((1 - setup.buildFactor) * 100)}% quicker build` });
  return out;
}

export function chipList(chips) {
  return h('ul', { class: 'cc-chips', 'aria-label': 'What your roll and points did' }, ...chips.map((c) => h('li', { class: 'cc-chip', 'data-chip': c.id, text: c.text })));
}

/** A meter: a bar with a tick at the limit and a word ("too fast" when over). update(value) moves it. No raw numbers. */
export function meter({ label, limit, max, words = ['still', 'good', 'too fast'] }) {
  const fill = h('i'), tick = h('b', { class: 'cc-tick', style: `left:${(100 * limit) / max}%` }), num = h('em', { text: words[0] });
  const bar = h('div', { class: 'cc-meter', role: 'img', 'aria-label': `${label} against its limit` }, fill, tick);
  const root = h('div', { class: 'cc-stat cc-feedstat' }, h('span', { text: label }), bar, num);
  return { root, update(v) { fill.style.width = `${Math.min(100, (100 * v) / max)}%`; root.classList.toggle('is-over', v > limit); num.textContent = v > limit ? words[2] : v < limit * 0.08 ? words[0] : words[1]; } };
}

/** Keep a canvas at its aspect ratio inside the space its wrapper is given (full-screen games); a no-op outside the overlay. */
export function fitCanvas(wrap, canvas, aspect) {
  if (typeof ResizeObserver === 'undefined') return;
  const fit = () => {
    if (!wrap.closest('.wb-full')) { canvas.style.width = ''; canvas.style.height = ''; return; }
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    const w = Math.max(120, Math.floor(Math.min(aw, ah * aspect)));
    canvas.style.width = `${w}px`; canvas.style.height = `${Math.floor(w / aspect)}px`;
  };
  new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);
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
