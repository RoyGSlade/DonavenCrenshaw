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
  let idleTimer = 0;
  let lone = null; // the lone plain choice's button, while one is showing
  const offs = [];

  function setPortrait(speaker, emotion) {
    // A stage direction (the narrator) has no face: the box drops the frame for it (round 3, jobs).
    root.classList.toggle('is-narration', speaker === 'narrator');
    const url = speaker === 'narrator' ? null : castPortrait(speaker, emotion);
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
    // Nothing follows in a moment: the box steps out of the way (a choice or a new line keeps it).
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!current && choices.hidden) root.hidden = true; }, 2600);
  }

  /** Show a line. line: { seq?, speaker, name, text, audio?, durationMs? } */
  function show(line) {
    if (current) finish(current.seq);
    clearTimeout(idleTimer);
    const seq = line.seq ?? `local-${Date.now()}`;
    root.hidden = false;
    root.dataset.speaker = line.speaker || '';
    choices.replaceChildren();
    choices.hidden = true;
    next.hidden = false;
    setPortrait(line.speaker, line.emotion);
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

  // A box with nothing left to say or ask steps out of the way (a new line or a new question keeps it).
  function hideSoon(ms = 500) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!choices.hidden) return;
      if (current) finish(current.seq); // the answer is in: the rest of the reading time is not worth keeping the box up
      root.hidden = true;
    }, ms);
  }

  function showChoices(d) {
    // null: the talk is over (story's director and the job talk both send it); clear the buttons.
    if (!d) { choices.replaceChildren(); choices.hidden = true; next.hidden = false; if (!current) hideSoon(); return; }
    clearTimeout(idleTimer);
    const { options = [] } = d;
    root.hidden = false;
    next.hidden = true;
    choices.hidden = false;
    choices.replaceChildren(...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-btn ui-dlg-choice';
      b.textContent = o.label;
      if (o.kind) b.dataset.kind = o.kind;
      if (o.kind === 'later') b.classList.add('is-later');
      // An attempt shows its odds: a fresh d20 plus the skill level, against the target.
      if (o.kind === 'attempt' && Number.isFinite(o.chance)) {
        const odds = document.createElement('small');
        odds.className = 'ui-dlg-odds';
        odds.textContent = `Roll ${o.roll || 'd20'} vs ${o.dc}: ${Math.round(o.chance * 100)}%`;
        b.append(odds);
      }
      if (o.locked && o.reason) {
        const why = document.createElement('small');
        why.className = 'ui-dlg-odds';
        why.textContent = o.reason;
        b.append(why);
      }
      b.disabled = Boolean(o.locked);
      if (o.locked && o.reason) b.title = o.reason;
      b.addEventListener('click', () => {
        choices.replaceChildren();
        choices.hidden = true;
        hideSoon(); // the answer is in: if no line follows, the box does not stay stuck on the last one
        bus?.emit('story:choose', { index: o.index });
      });
      return b;
    }));
    // One plain choice besides "Later" (a lone "Go on"): a tap on the box takes it.
    const plain = options.filter((o) => o.kind !== 'later');
    lone = plain.length === 1 && !plain[0].locked && plain[0].kind === 'choice' ? [...choices.querySelectorAll('button')].find((b) => b.dataset.kind === 'choice') : null;
    choices.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function hide() {
    if (current) finish(current.seq);
    root.hidden = true;
  }

  next.addEventListener('click', () => { if (current) finish(current.seq); else hide(); });
  root.addEventListener('click', (e) => { if (e.target === root || e.target === text) { if (current) finish(current.seq); else if (lone?.isConnected) lone.click(); } });
  // Intro lines are drawn by the intro overlay; the box only plays their voice
  // and answers story:said when it ends, so the intro keeps its own pace.
  let introSeq = null;
  function playOnly(line) {
    introSeq = line.seq;
    const played = audio && line.audio ? audio.playLine(line.audio) : Promise.resolve('silent');
    played.then((how) => { if (how === 'ended' && introSeq === line.seq) bus?.emit('story:said', { seq: line.seq }); });
  }
  if (bus) {
    offs.push(bus.on('story:say', (d) => (d?.channel === 'intro' ? playOnly(d) : show(d))));
    offs.push(bus.on('story:said', (d) => { if (introSeq != null && d?.seq === introSeq) { introSeq = null; audio?.stopLine(); } }));
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
