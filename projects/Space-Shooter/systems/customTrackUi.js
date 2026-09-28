// The hangar's custom track card: a disabled button with a live countdown
// until releaseAt, then "Fly the custom track". ?preview=custom flies it early
// (and ?preview=custom&draft=1 flies the editor's draft), always unsaved.
import { CUSTOM_TRACK } from '../tracks/custom-track.js';
import { customTrackView, parseCustomQuery, readDraft, releaseText, useCustomTrack } from './customTrack.js';
import { checkTrack } from '../engine/trackChecks.js';
import { launchRun } from '../ui/overlays.js';

const byId = (id) => document.getElementById(id);

function storage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * ready: the flight systems loaded (the button stays off otherwise).
 * lab: the playtest lab rules, or null. Lab runs are never saved either.
 */
export function initCustomTrackUi({ ready = true, lab = null } = {}) {
  const card = byId('custom-track-card');
  const button = byId('custom-track-btn');
  const note = byId('custom-track-note');
  if (!card || !button || !note) return;
  const query = parseCustomQuery(location.search);

  let track = CUSTOM_TRACK;
  let draftError = null;
  if (query.draft) {
    const draft = readDraft(storage());
    if (draft.track) track = draft.track;
    else draftError = draft.error;
  }
  // The same checks the tests and the editor run (the scripted lap stays in the tests).
  const check = checkTrack(track);
  if (check.ok) useCustomTrack(track);

  const title = byId('custom-track-title');
  if (title && track.title) title.textContent = track.title;

  const notes = [];
  if (query.preview) notes.push([['strong', 'Preview — not saved.'], query.draft ? ' Flying the editor draft on this browser.' : ' Flying the track before its release.']);
  if (lab) notes.push([['strong', 'Playtest lab — not saved.'], ' The lab rules apply here too.']);
  if (draftError) notes.push([draftError]);

  let timer = 0;
  function paint() {
    const view = customTrackView({ track, now: Date.now(), preview: query.preview, valid: check.ok });
    card.dataset.state = view.state;
    button.textContent = view.button;
    button.disabled = !ready || !view.enabled;
    const lines = [...notes];
    if (view.state === 'locked') {
      const when = releaseText(track.releaseAt);
      if (when) lines.push([`Opens ${when}.`]);
    } else if (view.state === 'pending') {
      lines.push(['The track is still being built. It opens here as soon as it’s ready.']);
    } else if (view.state === 'invalid') {
      lines.push(check.ok ? ['The track’s release time isn’t a valid date.'] : [['strong', 'This track didn’t pass its checks:']]);
    }
    note.replaceChildren(...lines.map((parts) => {
      const line = document.createElement('span');
      line.style.display = 'block';
      for (const part of parts) {
        if (Array.isArray(part)) {
          const node = document.createElement(part[0]);
          node.textContent = part[1];
          line.append(node);
        } else line.append(part);
      }
      return line;
    }));
    if (view.state === 'invalid' && !check.ok) {
      const list = document.createElement('ul');
      for (const p of check.problems.slice(0, 4)) {
        const li = document.createElement('li');
        li.textContent = p.message;
        list.append(li);
      }
      note.append(list);
    }
    note.hidden = !note.childNodes.length;
    // Tick only while counting down; once released the card is settled.
    if (view.state !== 'locked' && timer) { clearInterval(timer); timer = 0; }
    return view;
  }

  button.addEventListener('click', () => {
    const view = paint();
    if (!view.enabled || button.disabled) return;
    launchRun({ kind: 'custom', preview: query.preview });
  });

  card.hidden = false;
  const first = paint();
  if (first.state === 'locked') timer = setInterval(paint, 1000);
  // Coming back to a background tab: repaint at once instead of on the next tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const view = paint();
    if (view.state === 'locked' && !timer) timer = setInterval(paint, 1000);
  });

  // Links from the Stardust page (?track=custom) and previews land on the card.
  if (query.focus) {
    card.classList.add('is-focus');
    card.scrollIntoView?.({ block: 'center' });
    if (!button.disabled) button.focus({ preventScroll: true });
  }
}
