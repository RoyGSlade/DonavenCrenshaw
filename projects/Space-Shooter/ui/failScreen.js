// The weekly's "attempt over" screen: what destroyed the ship, how far the run
// got, the pilots just above and below you on the board, and Retry / Return
// to hangar. R (or A on a controller) retries. runSaving.js fills the board.
import { state } from '../state.js';
import { clock } from './flightHud.js';

const CAUSES = {
  mine: ['SHIP DESTROYED', 'Mine contact. The hull tore open on a stationary mine.'],
  hull: ['HULL BREACHED', 'Too many hits from rocks and sentry fire.'],
  fuel: ['OUT OF FUEL', 'The tank ran dry. Fly through a fuel dock to refill.'],
};

let el = null;
let handlers = null;

function build() {
  el = document.createElement('section');
  el.className = 'overlay-panel hidden fx-fail';
  el.id = 'weekly-fail';
  el.setAttribute('aria-labelledby', 'fx-fail-title');
  el.innerHTML = `<div class="panel">
    <p class="eyebrow">ATTEMPT OVER</p>
    <h2 id="fx-fail-title"></h2>
    <p class="fx-fail-why"></p>
    <p class="fx-fail-stats"></p>
    <div class="fx-fail-board" aria-live="polite"><p class="fx-fail-board-title">WEEKLY BOARD</p><ol></ol><p class="fx-fail-board-note"></p></div>
    <div class="actions"><button type="button" class="primary" data-fail="retry">Retry <small>(R)</small></button><button type="button" data-fail="hangar">Return to hangar</button></div>
  </div>`;
  document.body.append(el);
  el.addEventListener('click', (event) => {
    const action = event.target.closest('[data-fail]')?.dataset.fail;
    if (action === 'retry') handlers?.retry();
    else if (action === 'hangar') handlers?.hangar();
  });
  window.addEventListener('keydown', (event) => {
    if (!isFailOpen() || event.repeat) return;
    if (event.key === 'r' || event.key === 'R') { event.preventDefault(); handlers?.retry(); }
  });
}

export const isFailOpen = () => !!el && !el.classList.contains('hidden');

/** Show the screen. onRetry / onHangar are called once, after it closes. */
export function showFailScreen({ cause, ms, shards, total, eventTitle, playtest = false }, { onRetry, onHangar }) {
  if (!el) build();
  const [title, why] = CAUSES[cause] || ['SHIP LOST', ''];
  el.querySelector('#fx-fail-title').textContent = title;
  el.querySelector('.fx-fail-why').textContent = why;
  el.querySelector('.fx-fail-stats').textContent = `${eventTitle ? `${eventTitle} · ` : ''}${clock(ms)} into the attempt · ${shards}/${total} shards`;
  setFailBoard(null, '');
  el.querySelector('[data-fail="hangar"]').textContent = playtest ? 'Playtest start' : 'Return to hangar';
  const close = (next) => () => { hideFailScreen(); handlers = null; next?.(); };
  handlers = { retry: close(onRetry), hangar: close(onHangar) };
  el.classList.remove('hidden');
  state.ui.showFailOverlay = true;
  el.querySelector('[data-fail="retry"]').focus({ preventScroll: true });
  window.dispatchEvent(new CustomEvent('stardust:weeklyFailed', { detail: { cause, ms } }));
}

export function hideFailScreen() {
  el?.classList.add('hidden');
  state.ui.showFailOverlay = false;
}

/**
 * rows: [{ rank, name, timeMs, isMe }] (the pilot above you, you, the pilot
 * below), or null with a note ("Sign in to race the board", "Board offline").
 */
export function setFailBoard(rows, note = '') {
  if (!el) return;
  const list = el.querySelector('.fx-fail-board ol');
  list.replaceChildren(...(rows || []).map((r) => {
    const li = document.createElement('li');
    if (r.isMe) li.className = 'is-me';
    const rank = document.createElement('span'); rank.className = 'fx-fb-rank'; rank.textContent = `#${r.rank}`;
    const name = document.createElement('span'); name.className = 'fx-fb-name'; name.textContent = r.isMe ? `${r.name} (you)` : r.name;
    const time = document.createElement('span'); time.className = 'fx-fb-time'; time.textContent = clock(r.timeMs);
    li.append(rank, name, time);
    return li;
  }));
  el.querySelector('.fx-fail-board-note').textContent = note;
  el.querySelector('.fx-fail-board').hidden = !rows?.length && !note;
}
