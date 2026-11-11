// The captain's licence: name your captain, pick a colour, then roll a real
// die once for each of the four stats. Each roll's landed face is the stat
// (ui/dice.js reads it off the settled cube). Rolls already made are kept on
// this device until the licence is signed, so a reload does not re-roll.
// Signing makes the captain through core's store, sets the rolled stats in
// the same breath, and tells the story director (`captain:created`).
import { STATS, COLORS, NAME_MAX, PORTRAITS } from '../data.js';
import { cleanName } from '../character.js';
import { createDiceTray, cryptoRng } from './dice.js';
import { iconFor } from './assets.js';
import { STAT_TEXT, chance } from '../hangarLinks.js';
import { HANGAR_DATA } from '../hangarData.js';

const COPY = HANGAR_DATA.licence;

export const PENDING_KEY = 'stardust.newgame.pendingRolls';
const STAT_IDS = STATS.map((s) => s.id);

export function readPending(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(PENDING_KEY) || '{}');
    const out = {};
    for (const id of STAT_IDS) if (Number.isInteger(v?.[id]) && v[id] >= 1 && v[id] <= 6) out[id] = v[id];
    return out;
  } catch { return {}; }
}
function writePending(rolls, storage = globalThis.localStorage) {
  try { if (rolls) storage?.setItem(PENDING_KEY, JSON.stringify(rolls)); else storage?.removeItem(PENDING_KEY); } catch { /* this page only */ }
}

/** What a rolled value means, in a line: the stat's passive at this value and its odds on a typical check. */
export function rollWords(statId, value) {
  const text = STAT_TEXT[statId] || { options: 'stat', boon: '' };
  const over = value - 3;
  const odds = Math.round(chance(value, COPY.checkDc) * 6);
  const parts = [];
  if (over > 0) parts.push(`Above average (+${over} on its passives).`);
  else if (over < 0) parts.push(`Below average (${over} on its passives).`);
  else parts.push('Average: no bonus, no penalty.');
  parts.push(`Passes a normal check ${odds} times in 6.`);
  if (value >= 5) parts.push(`Opens ${text.options} choices.`);
  if (value === 6 && text.boon) parts.push(text.boon);
  return parts.join(' ');
}

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'on') for (const [e, f] of Object.entries(v)) node.addEventListener(e, f);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/**
 * root: the licence overlay. store, bus (story bus), toast(text), reducedMotion(),
 * onSigned(character), dev (adds a quick-roll button for testing).
 */
export function createLicence({ root, store, bus, toast = () => {}, reducedMotion = () => false, onSigned = () => {}, dev = false, rng = cryptoRng() }) {
  const form = { name: '', color: COLORS[0] };
  let rolls = readPending();
  let tray = null;
  let rolling = false;

  const nextStat = () => STAT_IDS.find((id) => !rolls[id]) || null;

  async function roll(aim = null) {
    const id = nextStat();
    if (!id || rolling || !tray) return;
    rolling = true;
    sync();
    const value = await tray.roll(aim);
    rolls = { ...rolls, [id]: value };
    writePending(rolls);
    rolling = false;
    sync();
    const stat = STATS.find((s) => s.id === id);
    root.querySelector(`[data-roll-row="${id}"]`)?.classList.add('is-landed');
    bus?.emit('licence:rolled', { stat: id, value });
    if (!nextStat()) toast(COPY.rolledAll);
    else toast(`${stat.name} ${value}.`);
  }

  function sign(e) {
    e?.preventDefault();
    const name = cleanName(form.name);
    if (!name) { toast('Give your captain a name.'); root.querySelector('#vy-name')?.focus(); return; }
    if (nextStat()) { toast('Roll all four stats first.'); return; }
    const r = store.createCharacter({ name, look: { portrait: PORTRAITS[0].id, color: form.color } });
    if (!r.ok) { toast(r.reason); return; }
    store.update((s) => ({ ...s, character: { ...s.character, stats: { ...rolls } } }));
    writePending(null);
    const character = store.get().character;
    bus?.emit('captain:created', { character });
    toast(`${character.name} signs on.`);
    onSigned(character);
  }

  // Only the parts that change are touched on each update, so the dice canvas stays put.
  const refs = {};
  function sync() {
    const next = nextStat();
    for (const s of STATS) {
      const row = refs[s.id];
      const v = rolls[s.id];
      row.value.textContent = v ? String(v) : '?';
      row.words.textContent = v ? rollWords(s.id, v) : (STAT_TEXT[s.id]?.short || s.blurb || '');
      row.node.classList.toggle('is-rolled', Boolean(v));
      row.node.classList.toggle('is-next', s.id === next);
      row.node.dataset.value = v ? String(v) : '';
    }
    const stat = STATS.find((s) => s.id === next);
    refs.roll.disabled = !next || rolling;
    refs.roll.textContent = rolling ? 'Rolling…' : stat ? `Roll ${stat.name}` : 'All rolled';
    refs.hint.textContent = stat ? COPY.hint.replace('{stat}', stat.name) : COPY.hintDone;
    refs.sign.disabled = Boolean(next) || rolling;
    if (refs.quick) refs.quick.disabled = !next || rolling;
  }

  function build() {
    const name = el('input', { type: 'text', id: 'vy-name', maxlength: String(NAME_MAX), autocomplete: 'off', value: form.name, on: { input: (e) => { form.name = e.target.value; } } });
    const swatches = el('div', { class: 'ui-swatches', role: 'group', 'aria-label': 'Colour' }, COLORS.map((c) => {
      const b = el('button', { type: 'button', class: 'ui-swatch', 'aria-pressed': String(form.color === c), 'aria-label': `Colour ${c}`, on: { click: () => {
        form.color = c;
        for (const x of swatches.children) x.setAttribute('aria-pressed', String(x === b));
      } } }, el('i', { style: `background:${c}` }));
      return b;
    }));
    const rows = STATS.map((s) => {
      const value = el('b', { class: 'ui-roll-value', 'aria-live': 'polite' });
      const words = el('small', {});
      const icon = iconFor(s.id);
      const node = el('li', { class: 'ui-roll-row', dataset: { rollRow: s.id } },
        icon ? el('img', { src: icon, alt: '', class: 'ui-roll-icon' }) : null,
        el('div', {}, el('strong', { text: s.name }), words),
        value);
      refs[s.id] = { node, value, words };
      return node;
    });
    const canvas = el('canvas', { id: 'hg-dice', class: 'ui-dice', 'aria-label': 'Dice tray', role: 'img' });
    refs.roll = el('button', { type: 'button', class: 'ui-btn primary', id: 'hg-roll', on: { click: () => roll() } });
    refs.hint = el('p', { class: 'ui-note' });
    refs.sign = el('button', { type: 'submit', class: 'ui-btn primary', id: 'hg-sign', text: COPY.sign });
    refs.quick = dev ? el('button', { type: 'button', class: 'ui-btn', id: 'hg-quick-roll', text: 'Quick roll (test tools)', on: { click: async () => { while (nextStat()) await roll(); } } }) : null;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const len = Math.hypot(dx, dy);
      down = null;
      // A flick throws that way; a tap just rolls.
      roll(len > 18 ? { dx, dy: -dy, power: Math.min(1, len / 160) } : null);
    });
    root.replaceChildren(el('form', { class: 'ui-licence ui-panel', on: { submit: sign } },
      el('p', { class: 'ui-eyebrow', text: COPY.eyebrow }),
      el('h2', { id: 'hg-licence-title', text: COPY.title }),
      el('p', { text: COPY.body }),
      el('div', { class: 'ui-licence-grid' },
        el('div', { class: 'ui-licence-who' },
          el('label', { for: 'vy-name' }, 'Name', name),
          el('p', { class: 'ui-note', text: 'Colour' }), swatches,
          el('ol', { class: 'ui-roll-list' }, rows)),
        el('div', { class: 'ui-licence-dice' }, canvas, refs.hint, el('div', { class: 'ui-row' }, refs.roll, refs.quick))),
      el('div', { class: 'ui-licence-foot' }, refs.sign)));
    sync();
    tray?.destroy();
    tray = createDiceTray(canvas, { rng, reducedMotion });
    const last = [...STAT_IDS].reverse().find((id) => rolls[id]);
    if (last) tray.show(rolls[last]);
  }

  return {
    open() { root.hidden = false; build(); root.querySelector('#vy-name')?.focus({ preventScroll: true }); },
    close() { root.hidden = true; tray?.destroy(); tray = null; },
    get rolls() { return { ...rolls }; },
    get open_() { return !root.hidden; },
    roll,
  };
}
