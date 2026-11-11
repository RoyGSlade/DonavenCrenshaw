// The default renderer for story lines: a speech strip with the speaker's
// portrait (or initials), their name and the line; the talk options; and the
// objective chip with "Skip tutorial". Any lane can restyle it (story.css,
// sy-* classes) or replace it by listening to the same bus events
// (ROUND2-CONTRACT.md sections 2-4). All text goes in with textContent.
import { CAST, castPortrait } from './cast.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/**
 * createCaption({ root, bus, onSkip, skippable }) -> { node, destroy }.
 * onSkip(): the player confirmed "Skip tutorial" (default: emit tutorial:skip).
 */
export function createCaption({ root = document.body, bus, onSkip = null, skippable = () => true, reducedMotion = () => false } = {}) {
  const node = el('div', 'sy-layer');
  const strip = el('div', 'sy-strip');
  strip.hidden = true;
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.tabIndex = 0;
  const face = el('div', 'sy-face');
  const body = el('div', 'sy-body');
  const who = el('p', 'sy-who');
  const text = el('p', 'sy-text');
  const hint = el('p', 'sy-tap', 'Tap to continue');
  body.append(who, text, hint);
  strip.append(face, body);

  const choices = el('div', 'sy-choices');
  choices.hidden = true;
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Choose what to say');

  const goal = el('div', 'sy-goal');
  goal.hidden = true;
  const goalText = el('p', 'sy-goal-text');
  const skip = el('button', 'sy-skip', 'Skip tutorial');
  skip.type = 'button';
  goal.append(el('span', 'sy-goal-mark', 'NOW'), goalText, skip);

  // "New" toasts for unlocks, stacked above the strip.
  const toasts = el('div', 'sy-toasts');
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');

  node.append(goal, toasts, choices, strip);
  root.append(node);

  let current = null; // the story:say detail on screen
  let last = null; // the last line shown, kept above the options while the player picks
  let confirming = 0;
  let typing = 0;

  // The line types itself out (fast: about 3 lines a second of reading), unless reduced motion is on.
  // A tap while it types shows it all; the next tap moves on.
  function reveal(full) {
    clearInterval(typing);
    typing = 0;
    text.setAttribute('aria-label', full);
    if (reducedMotion()) { text.textContent = full; return; }
    let shown = 0;
    text.textContent = '';
    typing = setInterval(() => {
      shown = Math.min(full.length, shown + 2);
      text.textContent = full.slice(0, shown);
      if (shown >= full.length) { clearInterval(typing); typing = 0; }
    }, 16);
  }

  const offs = [
    bus.on('story:say', (d) => {
      if (d.channel === 'intro') return;
      current = d;
      last = d;
      strip.hidden = false;
      strip.dataset.speaker = d.speaker;
      strip.dataset.emotion = d.emotion;
      strip.classList.toggle('sy-sound', Boolean(d.sound));
      strip.style.setProperty('--sy-accent', CAST[d.speaker]?.color || '#81e6df');
      who.textContent = d.name;
      reveal(d.text);
      const url = castPortrait(d.speaker, d.emotion);
      face.replaceChildren();
      if (url) {
        const img = el('img');
        img.alt = '';
        img.src = url;
        img.onerror = () => { face.replaceChildren(el('span', 'sy-initials', initials(d.name))); };
        face.append(img);
      } else face.append(el('span', 'sy-initials', initials(d.name)));
    }),
    bus.on('story:clear', (d) => {
      if (current && d.seq === current.seq) { current = null; strip.hidden = true; }
    }),
    bus.on('story:choices', (d) => {
      choices.replaceChildren();
      choices.hidden = !d;
      if (!d) return;
      if (last) {
        const ask = el('p', 'sy-ask');
        ask.style.setProperty('--sy-accent', CAST[last.speaker]?.color || '#81e6df');
        ask.append(el('b', '', `${last.name}: `), document.createTextNode(last.text));
        choices.append(ask);
      }
      for (const o of d.options) {
        const b = el('button', 'sy-choice', o.label);
        b.type = 'button';
        b.disabled = o.locked;
        if (o.stat) b.dataset.stat = o.stat;
        if (o.locked) b.append(el('small', 'sy-why', ` ${o.reason}`));
        b.addEventListener('click', () => bus.emit('story:choose', { index: o.index }));
        choices.append(b);
      }
      choices.querySelector('button:not(:disabled)')?.focus();
    }),
    bus.on('story:unlock', (d) => {
      const t = el('p', 'sy-toast');
      t.append(el('b', '', 'NEW'), document.createTextNode(` ${d.name || d.id}`));
      toasts.append(t);
      setTimeout(() => t.classList.add('sy-gone'), 3200);
      setTimeout(() => t.remove(), 3700);
    }),
    bus.on('story:objective', (d) => {
      goal.classList.remove('sy-fresh');
      if (d && !reducedMotion()) { void goal.offsetWidth; goal.classList.add('sy-fresh'); }
      goal.hidden = !d;
      goalText.textContent = d ? d.text : '';
      skip.hidden = !skippable();
      skip.textContent = 'Skip tutorial';
      confirming = 0;
    }),
    bus.on('story:done', () => { goal.hidden = true; choices.hidden = true; }),
  ];

  const advance = () => {
    if (!current) return;
    if (typing) { clearInterval(typing); typing = 0; text.textContent = current.text; return; }
    bus.emit('story:said', { seq: current.seq });
  };
  strip.addEventListener('click', advance);
  strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } });
  // Two taps to skip, so a stray tap never throws the tutorial away.
  skip.addEventListener('click', () => {
    if (Date.now() - confirming < 4000) {
      confirming = 0;
      if (onSkip) onSkip(); else bus.emit('tutorial:skip', {});
      return;
    }
    confirming = Date.now();
    skip.textContent = 'Sure? Tap again';
  });

  return {
    node,
    /** Cuts the current line short (a page's own key handler can call it). */
    advance,
    destroy() { clearInterval(typing); for (const off of offs) off(); node.remove(); },
  };
}
