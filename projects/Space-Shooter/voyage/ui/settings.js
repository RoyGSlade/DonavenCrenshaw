// The hangar's settings panel (the gear in the header): sound and render
// quality. Sound is per device (ui/audio.js); render quality is the shared
// per-device setting every new canvas reads (renderScale.js).
import { RENDER_SCALES, readRenderScale, writeRenderScale } from '../renderScale.js';

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'on') for (const [e, f] of Object.entries(v)) node.addEventListener(e, f);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/** root: the settings panel. button: the header gear. audio: ui/audio.js player. toast(text). */
export function createSettings({ root, button, audio, toast = () => {} }) {
  function slider(label, key, value) {
    const out = el('output', { text: `${Math.round(value * 100)}` });
    const input = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), 'data-volume': key, 'aria-label': `${label} volume` });
    input.addEventListener('input', () => { out.textContent = input.value; audio.set({ [key]: Number(input.value) / 100 }); });
    return el('label', {}, el('span', { text: label }), input, out);
  }
  function render() {
    const prefs = audio.settings();
    const now = readRenderScale();
    root.replaceChildren(
      el('p', { class: 'ui-eyebrow', text: 'SETTINGS · THIS DEVICE' }),
      el('h3', { text: 'SOUND' }),
      el('button', { type: 'button', class: 'ui-btn', id: 'hg-mute', 'aria-pressed': String(prefs.muted), text: prefs.muted ? 'Sound off' : 'Sound on', on: { click: () => { audio.set({ muted: !audio.settings().muted }); render(); } } }),
      slider('Hangar', 'ambience', prefs.ambience),
      slider('Voices', 'voice', prefs.voice),
      el('h3', { text: 'RENDER QUALITY' }),
      el('div', { class: 'vy-choices', role: 'group', 'aria-label': 'Render quality' }, RENDER_SCALES.map((r) => el('button', {
        type: 'button', class: 'ui-btn', 'aria-pressed': String(now === r.id), 'data-render': r.id, title: r.blurb, text: r.name,
        on: { click: () => { writeRenderScale(r.id); render(); toast(`Render quality: ${r.name}. ${r.blurb}`); } },
      }))),
      el('p', { class: 'ui-note', text: 'Fast draws at 1x: smoothest on older phones.' }),
    );
  }
  function open() { render(); root.hidden = false; button.setAttribute('aria-expanded', 'true'); root.querySelector('button')?.focus({ preventScroll: true }); }
  function close() { root.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  button.addEventListener('click', () => (root.hidden ? open() : close()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) { close(); button.focus(); e.preventDefault(); } }, true);
  document.addEventListener('pointerdown', (e) => { if (!root.hidden && !root.contains(e.target) && !button.contains(e.target)) close(); });
  return { open, close, render };
}
