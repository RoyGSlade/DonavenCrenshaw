// The hangar's weekly card: the layout, a live countdown to the opening (then
// to the close), this browser's best, and "Fly week N". ?weekly=<id> lands on
// the card; ?preview=weekly flies the current week before it opens, unsaved.
// G toggles ghosts in flight.
import { currentWeekly, weeklyById, weeklyStatus, parseWeeklyQuery, weeklyPreviewSvg } from './weekly.js';
import { readLocalBest, toggleWeeklyGhosts } from '../engine/modes/weekly.js';
import { launchRun } from '../ui/overlays.js';
import { formatMs } from '../data.js';
import { state } from '../state.js';
import { equippedBuild } from './shipBuild.js';
import { canLaunchWeeklyMode, weeklyAccess } from './weeklyAccess.js';

const byId = (id) => document.getElementById(id);

export function initWeeklyUi({ ready = true, lab = null } = {}) {
  const card = byId('weekly-card');
  const button = byId('weekly-btn');
  const note = byId('weekly-note');
  const practiceButton = byId('weekly-practice-btn');
  if (!card || !button || !note) return;
  const query = parseWeeklyQuery(location.search);
  let event = query.event || currentWeekly();
  if (!event) return;
  const preview = query.preview || !!lab;

  function renderEvent() {
    byId('weekly-eyebrow').textContent = `WEEKLY TIME TRIAL / WEEK ${event.week}`;
    byId('weekly-title').firstChild.textContent = event.title;
    byId('weekly-sub').textContent = event.tagline;
    try {
      const svg = weeklyPreviewSvg(event, { title: false });
      byId('weekly-map').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      byId('weekly-map').alt = `${event.title} layout, obstacles hidden`;
    } catch { /* the card still works without its picture */ }
    byId('weekly-blurb').textContent = event.week === 2
      ? 'First: a hull variant named after the winner and Week 2 Champion. Second: nothin wrong with silver. Third: hell you could be fifth. Finish both weeks for Week 2 Hero.'
      : 'Challenger for every eligible finisher. Week 1 Champion for first. The top 3 earn a pending Planetfall early-access entitlement; codes arrive later.';
  }
  renderEvent();

  let timer = 0;
  function paint() {
    const featured = query.event || currentWeekly();
    if (featured && featured !== event) { event = featured; renderEvent(); }
    const status = weeklyStatus(event, Date.now());
    const flyable = ready && canLaunchWeeklyMode({ kind: 'weekly', event, preview });
    card.dataset.state = preview ? 'live' : status.state;
    button.disabled = !flyable;
    button.textContent = preview
      ? `Preview week ${event.week} (not saved)`
      : status.state === 'upcoming' ? `Opens in ${status.countdown.label}`
        : status.state === 'live' ? `Fly week ${event.week}: ${event.title}`
          : status.state === 'closed' ? `Week ${event.week} is closed` : 'Weekly track unavailable';
    const lines = [];
    if (status.state === 'pending') lines.push('The owner is preparing this track. Release approval is pending.');
    if (weeklyAccess(event.id) === 'retired') lines.push('Legacy / retired. Its standings, runs and ghosts remain available.');
    if (preview) lines.push(lab ? 'Playtest lab: nothing is saved.' : 'Preview: flown before release, never saved.');
    if (status.state === 'upcoming') lines.push(`Opens ${status.opensText}. Study the layout on the weekly page.`);
    if (status.state === 'live') lines.push(`Closes in ${status.countdown.label} (${status.closesText}).`);
    if (status.state === 'closed') lines.push('Final standings and the champion are on the weekly page.');
    // "Practice in your ship": a preview flight (never submitted) as the equipped garage build.
    const build = practiceButton ? equippedBuild() : null;
    if (practiceButton) {
      practiceButton.hidden = !build;
      practiceButton.disabled = !flyable;
    }
    if (build) lines.push(`Your ${build.split(':')[0]} build flies fully ranked on the shared leaderboard. Practice is never submitted.`);
    const best = readLocalBest(event);
    if (best) lines.push(`Your best on this browser: ${formatMs(best.ms)}. It flies with you as a ghost (G toggles ghosts).`);
    note.textContent = lines.join(' ');
    note.hidden = !lines.length;
    const overlapLink = byId('weekly-overlap-link');
    if (overlapLink) overlapLink.hidden = event.week !== 2 || weeklyStatus(weeklyById('weekly-01')).state !== 'live' || weeklyAccess('weekly-01') !== 'open';
    if (status.state !== 'upcoming' && status.state !== 'live' && timer) { clearInterval(timer); timer = 0; }
    return { status, flyable };
  }

  button.addEventListener('click', () => {
    const { flyable, status } = paint();
    if (!flyable) return;
    launchRun({ kind: 'weekly', event, preview: preview || status.state !== 'live' });
  });
  practiceButton?.addEventListener('click', () => {
    const { flyable } = paint();
    if (!flyable || !equippedBuild()) return;
    launchRun({ kind: 'weekly', event, preview: true, ship: 'equipped' });
  });
  window.addEventListener('stardust:appearance-changed', () => paint());
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
