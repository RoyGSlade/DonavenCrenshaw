// The launch API for races and the arena (the hangar lane calls it from its
// stations; see ROUND2-CONTRACT.md "Proposed changes", races):
//
//   flyQuestRace({ store, title, onResult })  the job's race leg, live
//   flyCircuit(trackId, { store, onResult })  the hangar practice circuit
//   openArena()                               today's Dogfight arena
//   mountFlightDeck(root, { store, toast })   a ready-made card with both
//
// Races fly on today's racing page (../index.html?questrace=<token>) inside a
// full-screen race frame, so this page (and a crew room) stays alive, and the
// time comes back by postMessage. The racing page runs in quest race mode:
// no board, no ghost, no personal best, no weekly entry (systems/questRace.js).
// All text goes in with textContent.
import { QUEST_RACE, makeToken, questTicket, circuitTicket, writeTicket, readTicket, clearTicket, cleanResult, parseReturn, recordPractice, practiceBest, pct } from './questRace.js';
import { ARENA, CIRCUITS } from './data.js';
import { TRACKS } from '../quests/data/tracks.js';
import { raceStats } from '../upgrades.js';

// Today's racing page and Dogfight, found from this file so any page can mount the deck.
const RACING_PAGE = new URL('../../', import.meta.url).href;
const ARENA_PAGE = new URL('../../dogfight/', import.meta.url).href;
let open = null; // the race frame on screen, or null

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

function ensureCss() {
  if (document.querySelector('link[data-races-css]')) return;
  document.head.append(el('link', { rel: 'stylesheet', href: new URL('./races.css', import.meta.url).href, dataset: { racesCss: '' } }));
}

/** The racing page URL for a ticket token (relative to the new hangar page). */
export const raceFrameUrl = (token, base = RACING_PAGE) => `${base}?${new URLSearchParams({ [QUEST_RACE.query]: token, [QUEST_RACE.embed]: '1' })}`;

/**
 * Opens the race frame for a ticket that is already written. onResult({ timeMs,
 * finished }) runs once, with the time, when the pilot takes one back; onClose()
 * whenever the frame goes away. Returns { close } (or null if one is open).
 */
export function openRaceFrame(ticket, { onResult = () => {}, onClose = () => {}, label = 'Race' } = {}) {
  if (open) return null;
  ensureCss();
  const frame = el('iframe', { class: 'rc-frame', src: raceFrameUrl(ticket.token), title: `${label}: today's racing engine`, allow: 'fullscreen; gamepad', dataset: { token: ticket.token } });
  const quit = el('button', { type: 'button', class: 'rc-quit', 'aria-label': 'Leave the race', onclick: () => close(), text: '✕' });
  const shell = el('div', { class: 'rc-shell', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, dataset: { kind: ticket.kind } }, frame, quit);
  document.body.append(shell);
  document.body.classList.add('rc-racing');
  let done = false;
  function onMessage(e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || d.type !== QUEST_RACE.message || d.token !== ticket.token) return;
    const result = cleanResult(d, ticket.token);
    if (result && !done) { done = true; onResult(result); }
    close();
  }
  addEventListener('message', onMessage);
  function close() {
    if (!open) return;
    removeEventListener('message', onMessage);
    shell.remove();
    document.body.classList.remove('rc-racing');
    clearTicket();
    open = null;
    onClose();
  }
  setTimeout(() => frame.focus(), 50);
  open = { close, frame, ticket };
  return open;
}

/** Is a race frame on screen? */
export const raceOpen = () => Boolean(open);

/** The race leg of the job in progress, flown live. onResult({ timeMs, finished }). */
export function flyQuestRace({ store, title = '', onResult, onClose, rand = Math.random } = {}) {
  const ticket = questTicket(store.get(), { token: makeToken(rand), title, now: Date.now() });
  if (!ticket || !writeTicket(ticket)) return null;
  return openRaceFrame(ticket, { onResult, onClose, label: `Quest race${title ? `: ${title}` : ''}` });
}

/**
 * The hangar practice circuit. The lap is kept as the new game's own practice
 * best (save.races), never on a board. onResult({ timeMs, finished, best }).
 */
export function flyCircuit(trackId, { store, onResult = () => {}, onClose, rand = Math.random } = {}) {
  const ticket = circuitTicket(trackId, { token: makeToken(rand), now: Date.now() });
  if (!ticket || !store.get().character || !writeTicket(ticket)) return null;
  return openRaceFrame(ticket, {
    onClose,
    label: `Practice circuit: ${TRACKS[trackId].title}`,
    onResult: (r) => {
      let best = false;
      store.update((save) => { const out = recordPractice(save, trackId, r.timeMs, { finished: r.finished, now: Date.now() }); best = out.best; return out.save; });
      onResult({ ...r, best });
    },
  });
}

/**
 * A race time that came back by link (a racing page opened on its own): the
 * result when it matches this tab's ticket, else null. The ticket is used up.
 */
export function takeReturnedRace(search = location.search) {
  const ticket = readTicket();
  const result = parseReturn(search, ticket);
  if (!result) return null;
  clearTicket();
  try {
    const url = new URL(location.href);
    for (const k of [QUEST_RACE.query, QUEST_RACE.time, QUEST_RACE.finished]) url.searchParams.delete(k);
    history.replaceState(history.state, '', url);
  } catch { /* the address keeps the link; the ticket is gone, so it cannot count twice */ }
  return { ...result, kind: ticket.kind, track: ticket.track || null };
}

/** Today's Dogfight arena (2-3 pilots, today's classes and records), as it is. */
export function openArena({ assign = (href) => location.assign(href) } = {}) {
  assign(ARENA_PAGE);
}

/**
 * A card with the arena and the practice circuits, for any hangar station.
 * store: voyage/store.js; toast(text). Returns { render, node }.
 */
export function mountFlightDeck(root, { store, toast = () => {}, build = () => null } = {}) {
  ensureCss();
  const node = el('section', { class: 'rc-deck', 'aria-label': 'Flight deck: practice circuits and the arena' });
  root.append(node);
  function render() {
    const save = store.get();
    const stats = raceStats(save, build(), 'race');
    const stock = raceStats(save, build(), 'classic-race');
    const captain = Boolean(save.character);
    node.replaceChildren(
      el('p', { class: 'rc-eyebrow', text: 'FLIGHT DECK' }),
      el('h2', { text: 'Fly something' }),
      el('p', { class: 'rc-note', text: `Your ship on the circuit: top speed ${pct(stats.topSpeed, stock.topSpeed)}, thrust ${pct(stats.accel, stock.accel)}, grip ${pct(stats.grip, stock.grip)} over stock. Practice laps never go on a board.` }),
      el('div', { class: 'rc-tiles' },
        ...CIRCUITS.map((c) => {
          const best = practiceBest(save, c.id);
          return el('article', { class: 'rc-tile', dataset: { circuit: c.id } },
            el('p', { class: 'rc-eyebrow', text: 'PRACTICE CIRCUIT' }),
            el('h3', { text: c.title }),
            el('p', { class: 'rc-note', text: c.blurb }),
            el('p', { class: 'rc-best', text: best ? `Your best: ${(best / 1000).toFixed(2)} s` : `${c.rival.name} to beat` }),
            el('button', { type: 'button', class: 'primary', disabled: !captain, dataset: { flyCircuit: c.id }, onclick: () => {
              const opened = flyCircuit(c.id, { store, onResult: (r) => {
                if (!r.finished) return;
                toast(r.best ? `New practice best on ${c.title}: ${(r.timeMs / 1000).toFixed(2)} s.` : `${c.title}: ${(r.timeMs / 1000).toFixed(2)} s.`);
              }, onClose: render });
              if (!opened) toast(captain ? 'The circuit is busy. Try again in a moment.' : 'Sign on a captain first.');
            }, text: captain ? 'Fly the circuit' : 'Sign on a captain first' }));
        }),
        el('article', { class: 'rc-tile is-arena', dataset: { arena: '' } },
          el('p', { class: 'rc-eyebrow', text: ARENA.eyebrow }),
          el('h3', { text: ARENA.title }),
          el('p', { class: 'rc-note', text: ARENA.blurb }),
          el('ul', { class: 'rc-modes' }, ...ARENA.modes.map((m) => el('li', { text: m }))),
          el('button', { type: 'button', class: 'primary', id: 'rc-arena', onclick: () => openArena(), text: ARENA.launch })),
      ),
    );
  }
  store.subscribe(() => { if (!open) render(); });
  render();
  return { render, node };
}
