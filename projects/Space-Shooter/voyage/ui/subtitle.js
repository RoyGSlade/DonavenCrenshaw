// The caption strip (opening B): descriptive narration as a small subtitle that goes by itself after its reading time. Never a box, never
// Next. Also sets body[data-danger] while the music mood is danger or combat, which shrinks dialogue to subtitles (ui/dialogue.js, kit.css).
import { captionMs } from '../slice/narration.js';

export function createSubtitles({ bus, root = document.body }) {
  const strip = document.createElement('p');
  strip.className = 'op-caption';
  strip.hidden = true;
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  root.append(strip);
  let timer = 0;
  const offs = [
    bus.on('talk:caption', (d) => {
      const text = String(d?.text || '').trim();
      if (!text) return;
      strip.textContent = text;
      strip.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { strip.hidden = true; }, d?.ms || captionMs(text));
    }),
    bus.on('talk:close', () => { clearTimeout(timer); strip.hidden = true; }), // the beat is over: its narration goes with it
    bus.on('audio:mood', (d) => { const on = d?.mode === 'danger' || d?.mode === 'combat'; root.dataset.danger = on ? '1' : ''; if (!on) delete root.dataset.danger; else { clearTimeout(timer); strip.hidden = true; } }),
  ];
  return { strip, destroy() { offs.forEach((o) => o?.()); clearTimeout(timer); strip.remove(); } };
}
