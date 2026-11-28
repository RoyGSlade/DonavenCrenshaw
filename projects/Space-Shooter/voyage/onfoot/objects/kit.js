// The object-screen kit (opening track A, outcome 6). Donaven: "we should create ui screens for interactable objects the engine
// core tea coffee gun feed ammo ...". One shared shape for them all, built on the house full-screen helper (fullScreenHelper.js):
// a screen that owns the whole display, plain words, drawn bars, phone first, Leave in the top corner. DOM only; no rules.
//
//   const screen = openObjectScreen({ word: 'ENGINE ROOM', title: 'Reactor core', note, onLeave })
//   screen.body                      where the parts go (a scrolling column)
//   bar({ label, value, tone, real, note })       a drawn bar with its word and number
//   row(label, value, tone)          a plain label-and-value line
//   section(title, ...kids)          a titled block
//   chip(text, tone)                 a status word
//   button({ label, onClick, tone, locked, reason, data })   a flat button (no kit frame: nothing to stick on a phone)
//   segmented({ label, options, value, onChange })           a two-or-three way switch
//   screen.close()                   remove it
//
// A bar's `real: false` draws it dashed: it is for show. Solid bars read the ship.
import { openFullScreen } from '../fullScreenHelper.js';
import { createEl } from '../dom.js';

function ensureStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[data-ok-kit]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./kit.css', import.meta.url).href;
  link.dataset.okKit = '';
  document.head.append(link);
}

/** The words for a bar value in plain terms. */
export const levelWord = (v) => (v >= 80 ? 'High' : v >= 55 ? 'Good' : v >= 30 ? 'Low' : v > 0 ? 'Very low' : 'Empty');

export function openObjectScreen({ word = '', title = '', note = '', onLeave = () => {}, kind = '' } = {}) {
  ensureStyles();
  let fs = null;
  const leave = () => { onLeave(); };
  fs = openFullScreen({ word, title, note: '', onLeave: leave });
  fs.root.classList.add('ok-screen');
  if (kind) fs.root.dataset.screen = kind;
  fs.leave.textContent = 'Leave';
  const body = createEl('div', { class: 'ok-body' });
  fs.stage.append(body);
  if (note) body.append(createEl('p', { class: 'ok-note', text: note }));
  const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); } };
  addEventListener('keydown', onKey, true);
  return {
    root: fs.root, body, leave: fs.leave,
    close() { removeEventListener('keydown', onKey, true); fs.close(); },
  };
}

export const section = (title, ...kids) => createEl('section', { class: 'ok-sec' }, title ? createEl('h3', { class: 'ok-h', text: title }) : null, ...kids);
export const chip = (text, tone = 'plain') => createEl('span', { class: `ok-chip is-${tone}`, text });
export const row = (label, value, tone = 'plain') => createEl('p', { class: `ok-row is-${tone}` }, createEl('span', { text: label }), createEl('b', { text: value }));
export const note = (text, cls = '') => createEl('p', { class: `ok-note ${cls}`.trim(), text });

/** A drawn bar: a word, a track and fill, and the number. tone: good | warn | bad | plain. */
export function bar({ label, value, max = 100, unit = '%', tone = 'plain', real = true, hint = '', segments = 0 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = createEl('i', { class: 'ok-fill', style: `width:${pct}%` });
  const track = createEl('div', { class: `ok-track${segments ? ' is-segmented' : ''}`, style: segments ? `--cells:${segments}` : '' }, fill);
  const wrap = createEl('div', { class: `ok-bar is-${tone}${real ? '' : ' is-show'}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(Math.round(value)), 'aria-label': label, dataset: { bar: String(label).toLowerCase().replace(/[^a-z]+/g, '-'), value: String(Math.round(value)) } },
    createEl('div', { class: 'ok-bar-top' }, createEl('span', { class: 'ok-bar-label', text: label }), createEl('b', { class: 'ok-bar-num', text: `${Math.round(value)}${unit}` })),
    track,
    hint ? createEl('small', { class: 'ok-bar-hint', text: hint }) : null);
  return wrap;
}

/** A button with a lock: locked shows the reason right under it, always (a phone cannot hover). */
export function button({ label, onClick = () => {}, tone = 'plain', locked = false, reason = '', data = null, primary = false }) {
  const b = createEl('button', { type: 'button', class: `ok-btn is-${tone}${primary ? ' is-primary' : ''}${locked ? ' is-locked' : ''}`, 'aria-disabled': locked ? 'true' : null, dataset: data || {} }, createEl('span', { text: label }));
  b.addEventListener('click', () => { if (!locked) onClick(); });
  if (!locked) return b;
  return createEl('div', { class: 'ok-lock' }, b, createEl('p', { class: 'ok-lock-why', role: 'note', text: reason }));
}

/** A switch of two or three words. */
export function segmented({ label, options, value, onChange = () => {}, data = '' }) {
  const wrap = createEl('div', { class: 'ok-seg', role: 'radiogroup', 'aria-label': label, dataset: data ? { seg: data } : {} });
  const draw = (v) => {
    wrap.replaceChildren(...options.map((o) => {
      const b = createEl('button', { type: 'button', role: 'radio', 'aria-checked': String(o.id === v), class: `ok-seg-b${o.id === v ? ' is-on' : ''}`, dataset: { value: o.id }, text: o.label });
      b.addEventListener('click', () => { if (o.id === v) return; draw(o.id); onChange(o.id); });
      return b;
    }));
  };
  draw(value);
  return wrap;
}
