// The hangar's weekly card: the layout, a live countdown to the opening (then
// to the close), this browser's best, and "Fly week N". ?weekly=<id> lands on
// the card; ?preview=weekly flies the current week before it opens, unsaved.
// G toggles ghosts in flight.
import { currentWeekly, weeklyStatus, parseWeeklyQuery, weeklyPreviewSvg } from './weekly.js';
import { readLocalBest, toggleWeeklyGhosts } from '../engine/modes/weekly.js';
import { launchRun } from '../ui/overlays.js';
import { formatMs } from '../data.js';
import { state } from '../state.js';

const byId = (id) => document.getElementById(id);

export function initWeeklyUi({ ready = true, lab = null } = {}) {
  const card = byId('weekly-card');
  const button = byId('weekly-btn');
  const note = byId('weekly-note');
  if (!card || !button || !note) return;
  const query = parseWeeklyQuery(location.search);
  const event = query.event || currentWeekly();
  const preview = query.preview || !!lab;

  byId('weekly-eyebrow').textContent = `WEEKLY TIME TRIAL / WEEK ${event.week}`;
  byId('weekly-title').firstChild.textContent = event.title;
  byId('weekly-sub').textContent = event.tagline;
  try {
    const svg = weeklyPreviewSvg(event, { title: false });
    byId('weekly-map').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    byId('weekly-map').alt = `${event.title} layout, obstacles hidden`;
  } catch { /* the card still works without its picture */ }

  let timer = 0;
  function paint() {
    const status = weeklyStatus(event, Date.now());
    const flyable = ready && (status.state === 'live' || preview);
    card.dataset.state = preview ? 'live' : status.state;
    button.disabled = !flyable;
    button.textContent = preview
      ? `Preview week ${event.week} (not saved)`
      : status.state === 'upcoming' ? `Opens in ${status.countdown.label}`
        : status.state === 'live' ? `Fly week ${event.week}: ${event.title}`
          : status.state === 'closed' ? `Week ${event.week} is closed` : 'Weekly track unavailable';
    const lines = [];
    if (preview) lines.push(lab ? 'Playtest lab: nothing is saved.' : 'Preview: flown before release, never saved.');
    if (status.state === 'upcoming') lines.push(`Opens ${status.opensText}. Study the layout on the weekly page.`);
    if (status.state === 'live') lines.push(`Closes in ${status.countdown.label} (${status.closesText}).`);
    if (status.state === 'closed') lines.push('Final standings and the champion are on the weekly page.');
    const best = readLocalBest(event);
    if (best) lines.push(`Your best on this browser: ${formatMs(best.ms)}. It flies with you as a ghost (G toggles ghosts).`);
    note.textContent = lines.join(' ');
    note.hidden = !lines.length;
    if (status.state !== 'upcoming' && status.state !== 'live' && timer) { clearInterval(timer); timer = 0; }
    return { status, flyable };
  }

  button.addEventListener('click', () => {
    const { flyable, status } = paint();
    if (!flyable) return;
    launchRun({ kind: 'weekly', event, preview: preview || status.state !== 'live' });
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'g' || e.key === 'G') && state.run?.kind === 'weekly' && !e.repeat && !e.ctrlKey && !e.metaKey) toggleWeeklyGhosts();
  });

  card.hidden = false;
  paint();
  timer = setInterval(paint, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') paint(); });
  if (query.focus) {
    card.classList.add('is-focus');
    card.scrollIntoView?.({ block: 'center' });
    if (!button.disabled) button.focus({ preventScroll: true });
  }
}
