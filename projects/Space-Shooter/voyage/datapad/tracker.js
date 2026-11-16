// The quest tracker on the HUD (round 3, basics lane): the job (or the
// tutorial leg) you are on, the current step and what comes next, 4 lines at
// most, collapsible (T, or tap the head). The tutorial's NEXT banner is this
// same tracker now. It also tells the world where the objective marker goes:
// the tutorial step's station or person, or the job board while a job runs.
//
//   const tracker = createTracker({ root, store, bus, world, stationInfo })
import { BASICS_DATA } from './data.js';
import { currentTrack, trackerLines } from './steps.js';
import { QUEST_GIVERS } from '../quests/data/givers.js';
import { el } from './pages.js';
import { icon, keyCap, stepMark } from './icons.js';
import { hudArt } from '../ui/assets.js';

const T = BASICS_DATA.tracker;
const COLLAPSE_KEY = 'stardust.voyage.tracker.v1';

/**
 * root: the tracker element (#hg-objective). store, bus. world(): onfoot.world or null.
 * stationInfo(id): { name } for the marker label. boardOpen(): true while the job board's panel is open.
 * touch: start collapsed on phones.
 */
// jobBusy(): a job's beat or card is up right now. onContinue(): pick the job back up (round 3:
// a job you have taken plays in the world; the tracker's Continue is how you get back to it).
export function createTracker({ root, store, bus = null, world = () => null, stationInfo = () => null, boardOpen = () => false, jobBusy = () => false, onContinue = () => {}, touch = false }) {
  let collapsed = (() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } })();
  let last = '';
  root.className = 'dp-tracker';
  const frame = hudArt('tracker-frame');
  if (frame) { root.classList.add('has-art'); root.style.setProperty('--dp-tracker-art', `url("${frame}")`); }
  const notch = hudArt('tracker-notch'); // the amber notch on the frame's top edge (art lane)
  if (notch) root.style.setProperty('--dp-tracker-notch', `url("${notch}")`);
  root.removeAttribute('hidden');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  const toggleBtn = el('button', { type: 'button', class: 'dp-tracker-head', 'aria-expanded': 'true' });
  toggleBtn.addEventListener('click', () => setCollapsed(!collapsed));

  function setCollapsed(on) {
    collapsed = on;
    try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch { /* private window */ }
    last = '';
    render();
  }

  function render(save = store.get()) {
    const track = currentTrack(save);
    const lines = trackerLines(track, T.maxLines);
    const key = JSON.stringify([track?.kind, track?.title, lines, collapsed, boardOpen(), jobBusy()]);
    if (key !== last) {
      last = key;
      root.hidden = !lines.length;
      if (lines.length) draw(track, lines);
    }
    aimWorld(track);
  }

  function draw(track, lines) {
    const eyebrow = track.kind === 'tutorial' ? T.tutorialEyebrow : `${T.jobEyebrow} · ${(QUEST_GIVERS[track.giver]?.short || '').toUpperCase()}`;
    const [now, ...next] = lines;
    toggleBtn.replaceChildren(
      el('span', { class: 'dp-tracker-eyebrow', text: eyebrow }),
      el('span', { class: 'dp-tracker-title', text: track.title }),
      el('span', { class: 'dp-tracker-fold' }, touch ? null : keyCap('T', 'dp-key dp-key-xs'), el('span', { class: 'dp-tracker-chev', text: collapsed ? '▸' : '▾', 'aria-hidden': 'true' })));
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute('aria-label', `${eyebrow}: ${track.title}. ${collapsed ? T.show : T.hide} the steps (T).`);
    root.dataset.track = track.kind;
    root.classList.toggle('is-collapsed', collapsed);
    root.replaceChildren(...[
      toggleBtn,
      // NEXT plus the step text: the line older tests and screen readers read.
      el('p', { class: 'dp-tracker-now' }, el('b', { text: 'NEXT' }), stepMark('now', 'dp-tracker-star') || icon('objective', 'dp-tracker-star'), el('span', { text: now.text }), now.where ? el('small', { text: now.where }) : null),
      collapsed ? null : el('ol', { class: 'dp-tracker-next' }, next.map((s) => el('li', { dataset: { step: s.id } }, stepMark('next', 'dp-tracker-todo') || el('i', { 'aria-hidden': 'true' }), el('span', { text: s.text })))),
      track.kind === 'job' && !jobBusy() ? el('button', { type: 'button', class: 'ui-btn primary dp-tracker-go', id: 'dp-continue', text: T.resume, on: { click: () => onContinue() } }) : null,
    ].filter(Boolean)); // replaceChildren would print a null as the word "null"
  }

  // The objective marker: the tutorial's step target, or the job board while a job runs.
  function aimWorld(track) {
    const w = world();
    if (!w) return;
    const target = track?.target || null;
    const label = target?.station ? stationInfo(target.station)?.name || null : null;
    const want = target ? { text: track.steps.find((s) => s.state === 'now')?.text || '', station: target.station || null, npc: target.npc || null, label } : null;
    w.setObjective(want);
  }

  store.subscribe((save) => render(save));
  // After the on-foot layer's own listener: the tracker has the last word on the marker.
  bus?.on?.('story:objective', () => { last = ''; render(); });
  bus?.on?.('hangar:opened', () => render());
  bus?.on?.('hangar:closed', () => render());
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!BASICS_DATA.keys.tracker.includes(e.code)) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
    if (document.body.classList.contains('dp-open') || document.body.classList.contains('hg-sheet-open')) return;
    if (root.hidden) return;
    setCollapsed(!collapsed);
  });
  render();
  return { render, setCollapsed, get collapsed() { return collapsed; } };
}
