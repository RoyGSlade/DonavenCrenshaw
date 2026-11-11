// The hangar's dialogue box: the renderer for the story contract's say()
// path (ROUND2-CONTRACT.md section 2). On `story:say` it shows the speaker's
// name and the line (textContent only), plays the line's audio through the
// hangar audio player, and answers `story:said { seq }` when the audio ends,
// the reading time passes, or the player taps to skip. On `story:choices` it
// shows the options and answers `story:choose { index }`.
import { castPortrait } from './assets.js';

const readMs = (text) => Math.min(7000, 900 + 55 * String(text || '').length);

/**
 * root: the dialogue box element (empty; this fills it). bus: the story bus.
 * audio: voyage/ui/audio.js player. reducedMotion(). Returns { show(line), hide(), destroy(), current }.
 */
export function createDialogueBox({ root, bus, audio, reducedMotion = () => false }) {
  const portrait = document.createElement('div');
  portrait.className = 'ui-dlg-portrait';
  portrait.setAttribute('aria-hidden', 'true');
  const name = document.createElement('p');
  name.className = 'ui-dlg-name';
  const text = document.createElement('p');
  text.className = 'ui-dlg-text';
  const choices = document.createElement('div');
  choices.className = 'ui-dlg-choices';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'ui-dlg-next';
  next.textContent = 'Next ▸';
  const body = document.createElement('div');
  body.className = 'ui-dlg-body';
  body.append(name, text, choices, next);
  root.replaceChildren(portrait, body);
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'Dialogue');

  let current = null; // { seq, timer }
  let typeTimer = 0;
  const offs = [];

  function setPortrait(speaker) {
    const url = castPortrait(speaker);
    portrait.replaceChildren();
    portrait.dataset.speaker = speaker || '';
    if (url) {
      const img = new Image();
      img.alt = '';
      img.src = url;
      portrait.append(img);
    } else {
      // No art yet: the speaker's initial on a nameplate disc.
      const span = document.createElement('span');
      span.textContent = (speaker || '?').slice(0, 1).toUpperCase();
      portrait.append(span);
    }
  }

  function typeOut(full) {
    clearInterval(typeTimer);
    if (reducedMotion() || full.length < 4) { text.textContent = full; return; }
    let i = 0;
    text.textContent = '';
    typeTimer = setInterval(() => {
      i = Math.min(full.length, i + 2);
      text.textContent = full.slice(0, i);
      if (i >= full.length) clearInterval(typeTimer);
    }, 18);
  }

  function finish(seq) {
    if (!current || current.seq !== seq) return;
    clearTimeout(current.timer);
    clearInterval(typeTimer);
    text.textContent = current.text;
    current = null;
    audio?.stopLine();
    bus?.emit('story:said', { seq });
  }

  /** Show a line. line: { seq?, speaker, name, text, audio?, durationMs? } */
  function show(line) {
    if (current) finish(current.seq);
    const seq = line.seq ?? `local-${Date.now()}`;
    root.hidden = false;
    root.dataset.speaker = line.speaker || '';
    choices.replaceChildren();
    choices.hidden = true;
    next.hidden = false;
    setPortrait(line.speaker);
    name.textContent = line.name || '';
    typeOut(String(line.text || ''));
    const duration = Number.isFinite(line.durationMs) ? line.durationMs : readMs(line.text);
    current = { seq, text: String(line.text || ''), timer: 0 };
    const mine = current;
    const played = audio ? audio.playLine(line.audio || null) : Promise.resolve('silent');
    played.then((how) => {
      if (current !== mine) return;
      if (how === 'ended') finish(seq);
      else mine.timer = setTimeout(() => finish(seq), duration); // text only: the reading time
    });
    return seq;
  }

  function showChoices({ options = [] }) {
    root.hidden = false;
    next.hidden = true;
    choices.hidden = false;
    choices.replaceChildren(...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-btn ui-dlg-choice';
      b.textContent = o.label;
      b.disabled = Boolean(o.locked);
      if (o.locked && o.reason) b.title = o.reason;
      b.addEventListener('click', () => {
        choices.replaceChildren();
        choices.hidden = true;
        bus?.emit('story:choose', { index: o.index });
      });
      return b;
    }));
    choices.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function hide() {
    if (current) finish(current.seq);
    root.hidden = true;
  }

  next.addEventListener('click', () => { if (current) finish(current.seq); else hide(); });
  root.addEventListener('click', (e) => { if (e.target === root || e.target === text) { if (current) finish(current.seq); } });
  if (bus) {
    offs.push(bus.on('story:say', (d) => show(d)));
    offs.push(bus.on('story:choices', (d) => showChoices(d)));
    offs.push(bus.on('story:done', () => hide()));
  }

  return {
    show,
    hide,
    showChoices,
    get current() { return current; },
    get open() { return !root.hidden; },
    destroy() { offs.forEach((off) => off()); clearInterval(typeTimer); if (current) clearTimeout(current.timer); },
  };
}
