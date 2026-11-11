// The racing page's screens for a quest race (a quest's race leg) and the
// hangar's practice circuit, both flown with the new game's upgraded ship.
// boot.js calls initQuestRaceUi when the page is opened with ?questrace=<token>.
//
//   intro   the track, the rival's time, your ship against stock, "Line up"
//   grid    a line as the countdown starts
//   result  your time against the rival's, in the new game's voice; take it
//           back to the job, or fly it again
//   wreck   try again, or limp back (you lose the race)
//
// Nothing here writes: the mode (systems/questRace.js) blocks every board,
// ghost, best and weekly write, and the time goes back to the new game, by
// postMessage to the hangar's race frame or by a return link. Text goes in
// with textContent.
import { formatMs } from '../data.js';
import { launchRun } from './overlays.js';
import { retryRun } from '../engine/modeManager.js';
import { retryQuestRaceAttempt } from '../engine/modes/questRace.js';
import { weeklyById } from '../tracks/weekly.js';
import { equippedBuild } from '../systems/shipBuild.js';
import { setQuestRaceMode } from '../systems/questRace.js';
import { readTicket, resolveTicket, resultMessage, returnHref, fillCopy, pickLine, gapText, pct } from '../voyage/races/questRace.js';
import { RACE_COPY } from '../voyage/races/data.js';
import { decodeSave, LOCAL_KEY } from '../voyage/save.js';

// Sentences can start with the rival's name ('a Syndicate runner').
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const STAT_LABELS = [['topSpeed', 'Top speed'], ['accel', 'Thrust'], ['grip', 'Grip']];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function readSave() {
  try { return decodeSave(globalThis.localStorage?.getItem(LOCAL_KEY) ?? null); } catch { return null; }
}

/** query: parseQuestRaceQuery(location.search). Returns the race, or null when the ticket is stale. */
export function initQuestRaceUi(query, { parentWindow = globalThis.parent } = {}) {
  if (!document.querySelector('link[data-questrace-css]')) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./questRace.css', import.meta.url).href, dataset: { questraceCss: '' } }));
  }
  const root = el('div', { class: 'qr-root', id: 'questrace' });
  document.body.append(root);
  const embedded = Boolean(query.embed && parentWindow && parentWindow !== globalThis.window);

  const ticket = readTicket();
  const save = readSave();
  const build = equippedBuild() || null;
  const race = ticket && query.token && ticket.token === query.token ? resolveTicket(ticket, save, { build }) : { error: RACE_COPY.expired };
  const event = race.error ? null : weeklyById(race.weekly);
  if (race.error || !event) {
    // The mode stays on (set at boot), so even a stale ticket keeps nothing.
    show('stale', [
      el('p', { class: 'qr-eyebrow', text: RACE_COPY.questEyebrow }),
      el('h2', { text: 'Ticket expired' }),
      el('p', { class: 'qr-text', text: race.error || RACE_COPY.expired }),
      el('div', { class: 'qr-moves' }, el('button', { type: 'button', class: 'primary', onclick: () => giveBack(0, false), text: RACE_COPY.leave })),
    ]);
    return null;
  }
  const flight = Object.freeze({ ...race, build });
  setQuestRaceMode(flight);
  const vars = { rival: flight.rival.name, track: flight.title };
  const circuit = flight.kind === 'circuit';
  let attempts = 0;
  let lastMs = null;

  function show(name, children) {
    root.dataset.screen = name;
    root.replaceChildren(el('section', { class: `qr-panel qr-${name}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': name }, ...children));
    root.hidden = false;
    root.querySelector('button.primary')?.focus({ preventScroll: true });
  }
  function hide() { root.hidden = true; root.replaceChildren(); delete root.dataset.screen; }

  function shipLine() {
    return el('ul', { class: 'qr-stats', 'aria-label': 'Your upgraded ship against stock' },
      ...STAT_LABELS.map(([k, label]) => {
        const v = pct(flight.stats[k], flight.stock[k]);
        return el('li', { dataset: { stat: k, value: v }, class: v.startsWith('+') && v !== '+0%' ? 'is-up' : '' }, el('span', { text: label }), el('b', { text: v }));
      }));
  }

  function intro() {
    show('intro', [
      el('p', { class: 'qr-eyebrow', text: circuit ? RACE_COPY.circuitEyebrow : `${RACE_COPY.questEyebrow} · ${flight.label}` }),
      el('h2', { text: flight.title }),
      el('p', { class: 'qr-text qr-rival', text: `${cap(flight.rival.name)} runs it in ${formatMs(flight.targetMs)}. Beat that.` }),
      circuit && flight.best ? el('p', { class: 'qr-note', text: `Your practice best: ${formatMs(flight.best)}.` }) : null,
      el('p', { class: 'qr-label', text: 'YOUR SHIP, UPGRADES IN' }),
      shipLine(),
      el('p', { class: 'qr-note', text: 'Grab every shard, then cross the line. Arrows or WASD to fly, Space to launch, Shift to boost. On a phone: the touch pad.' }),
      el('p', { class: 'qr-note qr-offbooks', text: fillCopy(RACE_COPY.noBoards, vars) }),
      el('div', { class: 'qr-moves' },
        el('button', { type: 'button', class: 'primary', id: 'qr-launch', onclick: launch, text: RACE_COPY.lineUp }),
        el('button', { type: 'button', id: 'qr-forfeit', onclick: () => giveBack(circuit ? 0 : flight.targetMs * 2, false), text: circuit ? RACE_COPY.leave : RACE_COPY.forfeit })),
    ]);
  }

  function launch() {
    hide();
    // The intro shows over today's start screen (at boot, or after the pause menu's quit).
    launchRun({ kind: 'weekly', event, preview: true, questRace: flight });
  }

  function banner(text, cls = '') {
    const b = el('p', { class: `qr-banner ${cls}`, role: 'status', text });
    document.body.append(b);
    setTimeout(() => b.remove(), 2600);
  }

  function result(ms) {
    lastMs = ms;
    const gap = ms - flight.targetMs;
    const won = gap <= 0;
    const best = circuit && (!flight.best || ms < flight.best);
    const line = cap(fillCopy(pickLine(won ? RACE_COPY.win : RACE_COPY.lose, ms), { ...vars, gap: gapText(gap) }));
    banner(won ? 'FINISH · FIRST' : 'FINISH', won ? 'is-win' : 'is-lose');
    show('result', [
      el('p', { class: 'qr-eyebrow', text: won ? 'YOU WIN' : `${flight.rival.name.toUpperCase()} WINS` }),
      el('p', { class: `qr-time ${won ? 'is-win' : 'is-lose'}`, dataset: { ms: String(ms) }, text: formatMs(ms) }),
      el('p', { class: 'qr-vs', text: `${cap(flight.rival.name)}: ${formatMs(flight.targetMs)} · ${won ? '-' : '+'}${gapText(gap)}` }),
      el('p', { class: 'qr-text', text: line }),
      best ? el('p', { class: 'qr-note is-win', text: fillCopy(RACE_COPY.practiceBest, vars) }) : null,
      el('p', { class: 'qr-note qr-offbooks', text: 'Not on any board. No ghost, no best, no weekly entry.' }),
      el('div', { class: 'qr-moves' },
        el('button', { type: 'button', class: 'primary', id: 'qr-take', onclick: () => giveBack(ms, true), text: circuit ? 'Back to the hangar with this lap' : RACE_COPY.takeBack }),
        el('button', { type: 'button', id: 'qr-again', onclick: () => { hide(); retryRun(); }, text: RACE_COPY.again })),
    ]);
  }

  function wreck(detail) {
    show('wreck', [
      el('p', { class: 'qr-eyebrow is-lose', text: RACE_COPY.wreck }),
      el('h2', { text: detail.cause === 'mine' ? 'Mine. Big one.' : detail.cause === 'fuel' ? 'Out of fuel.' : 'Hull gave out.' }),
      el('p', { class: 'qr-text', text: `${formatMs(detail.ms)} in, ${detail.shards} of ${detail.total} shards. ${cap(flight.rival.name)} didn't even slow down.` }),
      el('div', { class: 'qr-moves' },
        el('button', { type: 'button', class: 'primary', id: 'qr-retry', onclick: () => { hide(); retryQuestRaceAttempt(); }, text: RACE_COPY.retry }),
        el('button', { type: 'button', id: 'qr-limp', onclick: () => giveBack(circuit ? 0 : Math.max(detail.ms, flight.targetMs * 2), false), text: circuit ? RACE_COPY.leave : RACE_COPY.limpBack })),
    ]);
  }

  // Back to the new game with the time (0 = no time: just close).
  function giveBack(ms, finished) {
    const token = query.token || '';
    show('back', [el('p', { class: 'qr-eyebrow', text: 'HEADING BACK' }), el('p', { class: 'qr-text', text: ms > 0 ? `${formatMs(ms)} on the clock.` : 'Back to the hangar.' })]);
    root.dataset.result = ms > 0 ? `${Math.round(ms)}:${finished ? 1 : 0}` : 'none';
    if (embedded) { parentWindow.postMessage(resultMessage(token, ms, finished), location.origin); return; }
    if (ms > 0 && token) location.href = returnHref(token, ms, finished);
    else location.href = './voyage/';
  }

  addEventListener('stardust:questRaceAttempt', (e) => {
    if (e.detail?.token !== flight.token) return;
    attempts += 1;
    if (attempts === 1) banner(cap(fillCopy(RACE_COPY.gridLine, vars)), 'is-grid');
  });
  addEventListener('stardust:questRaceFinish', (e) => { if (e.detail?.token === flight.token) result(e.detail.ms); });
  addEventListener('stardust:questRaceWreck', (e) => { if (e.detail?.token === flight.token) wreck(e.detail); });
  // The pause menu's "quit" lands back here, not on today's hangar.
  addEventListener('stardust:runQuit', () => intro());
  addEventListener('keydown', (e) => {
    if (root.hidden || e.key !== 'Enter' || e.target.closest?.('button, input, textarea, select')) return;
    const primary = root.querySelector('button.primary');
    if (primary) { e.preventDefault(); primary.click(); }
  });

  intro();
  return { flight, get lastMs() { return lastMs; } };
}
