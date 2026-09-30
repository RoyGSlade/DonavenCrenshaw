import { finishCelebration } from '../systems/finishCelebration.js';
import { clock } from './flightHud.js';

let session = null;
let serial = 0;
let animations = [];
const $ = (id) => document.getElementById(id);
const wings = new URL('../art/ui/finish-wings.svg', import.meta.url).href;
const reduced = () => document.body.classList.contains('reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

function cancelAnimations() {
  animations.forEach((a) => a.cancel());
  animations = [];
}
function animate(el, frames, options) {
  if (!reduced() && el?.animate) {
    const animation = el.animate(frames, options);
    animations.push(animation);
    return animation;
  }
}

function build() {
  const overlay = $('starmap-end');
  const panel = overlay?.querySelector('.panel');
  if (!panel || $('finish-hero')) return;
  panel.classList.add('finish-panel');
  panel.querySelector('.eyebrow').classList.add('finish-kicker');
  panel.querySelector('.eyebrow').textContent = 'FLIGHT RECORDER / FINISH CONFIRMED';
  const hero = node('div', 'finish-hero');
  hero.id = 'finish-hero';
  const emblem = node('img', 'finish-wings');
  emblem.src = wings; emblem.alt = ''; emblem.setAttribute('aria-hidden', 'true');
  hero.append(emblem, $('starmap-end-title'), $('starmap-end-lede'));
  const time = node('div', 'finish-timeplate');
  time.innerHTML = '<span class="finish-label">FINISH TIME</span><strong id="finish-time"></strong><div class="finish-comparison"><div><span class="finish-label">PREVIOUS BEST · THIS BROWSER</span><b id="finish-previous">—</b></div><div><span id="finish-delta-label" class="finish-label">TIME GAINED</span><b id="finish-delta">—</b></div></div>';
  hero.append(time);
  const board = node('section', 'finish-board');
  board.id = 'finish-board';
  board.setAttribute('aria-label', 'Leaderboard placement');
  board.innerHTML = '<div class="finish-board-head"><span class="finish-label">LEADERBOARD / YOUR SECTOR</span><span id="finish-board-status">AWAITING RESULT</span></div><div id="finish-rank-callout" class="finish-rank-callout" hidden></div><div id="finish-rows" class="finish-rows"></div><p id="finish-board-note">Your flight is complete. Online placement appears after your time is accepted.</p>';
  board.querySelector('#finish-rank-callout').setAttribute('role', 'status');
  board.querySelector('#finish-rows').setAttribute('role', 'list');
  const grid = node('div', 'finish-grid');
  grid.append(hero, board);
  panel.insertBefore(grid, $('starmap-end-breakdown'));
  $('starmap-again-btn').textContent = 'Fly again →';
  // Existing saving, splits, social actions and controller focus stay intact.
  const breakdown = $('starmap-end-breakdown');
  const details = node('details', 'finish-details');
  details.append(node('summary', '', 'Circuit splits'));
  breakdown.before(details); details.append(breakdown);
  // Hide the wrapper whenever the existing breakdown has no content.
  new MutationObserver(() => { details.hidden = breakdown.hidden; }).observe(breakdown, { attributes: true, attributeFilter: ['hidden'] });
  details.hidden = breakdown.hidden;
}

function paintHero() {
  const model = finishCelebration(session);
  const panel = $('starmap-end')?.querySelector('.panel');
  if (!panel) return model;
  panel.classList.toggle('finish-is-best', model.improved);
  $('starmap-end-title').textContent = model.title;
  $('starmap-end-lede').textContent = session.kind === 'network' ? 'All five circuits. Network complete.' : `${session.title} complete.`;
  $('finish-time').textContent = clock(model.timeMs);
  $('finish-previous').textContent = model.previousMs === null ? 'FIRST RECORDED FINISH' : clock(model.previousMs);
  $('finish-previous').previousElementSibling.textContent = session.hubComparison ? 'PREVIOUS BEST · ONLINE' : 'PREVIOUS BEST · THIS BROWSER';
  $('finish-delta-label').textContent = model.deltaMs !== null ? 'FASTER BY' : model.previousMs !== null ? 'FROM YOUR BEST' : 'THE NEXT TARGET';
  $('finish-delta').textContent = model.deltaMs !== null ? `−${(model.deltaMs / 1000).toFixed(2)}s`
    : model.previousMs !== null ? `+${(Math.max(0, session.timeMs - model.previousMs) / 1000).toFixed(2)}s` : 'BEAT THIS LAP';
  return model;
}

function celebrateBest() {
  if (session.celebrated || !finishCelebration(session).improved) return;
  session.celebrated = true;
  animate(document.querySelector('.finish-timeplate'), [{ filter: 'brightness(1.8)', transform: 'scale(.97)' }, { filter: 'brightness(1)', transform: 'none' }], { duration: 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
  const crest = document.querySelector('.finish-wings');
  animate(crest, [{ transform: 'scale(.65)', filter: 'drop-shadow(0 0 0 #ffd173)' }, { transform: 'scale(1.08)', offset: .55, filter: 'drop-shadow(0 0 24px #ffd173)' }, { transform: 'none', filter: 'drop-shadow(0 0 12px #ffd17322)' }], { duration: 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
}

// Called before the completion event writes browser-local bests.
export function showFinishScreen({ timeMs, kind = 'network', title = 'Custom track', preview = false, previousMs } = {}) {
  build();
  cancelAnimations();
  if (previousMs === undefined && kind !== 'weekly') {
    try { previousMs = JSON.parse(localStorage.getItem('stardust.localBests.v1') || '{}')[kind === 'network' ? 'full' : 'custom'] ?? null; } catch { previousMs = null; }
  }
  session = { id: ++serial, timeMs, previousMs, kind, title, preview, result: null, climbed: false };
  paintHero();
  celebrateBest();
  $('finish-board-status').textContent = preview ? 'LOCAL FLIGHT' : 'AWAITING RESULT';
  $('finish-board-note').textContent = preview ? 'Preview flight. Your browser best counts here; this lap is not submitted to the online board.' : 'Flight complete. Your online placement appears after your time is accepted.';
  $('finish-rank-callout').hidden = true;
  $('finish-rows').replaceChildren();
  $('starmap-end').scrollTop = 0;
  animate($('finish-hero'), [{ opacity: 0, transform: 'translateY(18px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
  return session.id;
}

export const finishScreenToken = () => session?.id;
export const isCurrentFinish = (token) => !!session && token === session.id && !$('starmap-end')?.classList.contains('hidden');

export function setFinishNote(note) {
  if (!isCurrentFinish(finishScreenToken()) || session.result) return;
  $('finish-board-note').textContent = note;
  $('finish-board-status').textContent = /Saving/.test(note) ? 'VERIFYING TIME' : 'LOCAL FLIGHT';
}

export function updateFinishScreen({ result, playerName = 'You', rows = [], previousMs, note } = {}, token = finishScreenToken()) {
  if (!isCurrentFinish(token)) return;
  session.result = result;
  // The pre-launch hub PB can differ from this browser's record. Only use it
  // when no local comparison exists; keep the displayed comparison labelled.
  if (session.previousMs == null && Number.isFinite(previousMs)) {
    session.previousMs = previousMs;
    session.hubComparison = true;
  }
  const model = paintHero();
  celebrateBest();
  if (session.hubComparison) $('finish-previous').previousElementSibling.textContent = 'PREVIOUS BEST · ONLINE';
  else $('finish-previous').previousElementSibling.textContent = 'PREVIOUS BEST · THIS BROWSER';
  $('finish-board-status').textContent = result?.staff ? 'DEV TIME · UNRANKED' : model.accepted ? 'TIME ACCEPTED' : 'LOCAL FLIGHT';
  $('finish-board-note').textContent = note || (model.rank ? 'Your best accepted time sets your position.' : model.accepted ? 'Time accepted. No ranked placement was returned.' : 'Local finish. This lap has no confirmed online placement.');
  const callout = $('finish-rank-callout');
  callout.hidden = !model.rank;
  callout.textContent = model.climbed ? `#${model.rankBefore} → #${model.rank}  /  UP ${model.places} ${model.places === 1 ? 'PLACE' : 'PLACES'}` : model.rank ? `#${model.rank}  /  ${model.rankBefore == null ? 'ON THE BOARD' : 'YOUR BEST POSITION'}` : '';
  const list = $('finish-rows');
  list.replaceChildren();
  if (!model.rank) return;
  // Display actual neighbours only. The accepted verdict alone can still
  // render the player's real position while around-me is offline.
  const actual = rows.filter((r) => Number.isInteger(r.rank) && r.rank > 0 && Math.abs(r.rank - model.rank) <= 1 && !r.isMe);
  actual.push({ rank: model.rank, name: playerName, timeMs: result.best?.timeMs ?? result.timeMs ?? session.timeMs, isMe: true });
  actual.sort((a, b) => a.rank - b.rank);
  let mine;
  for (const row of actual) {
    const el = node('div', `finish-row${row.isMe ? ' is-me' : ''}`);
    el.setAttribute('role', 'listitem');
    el.append(node('b', 'finish-row-rank', `#${row.rank}`), node('span', 'finish-row-name', row.isMe ? `${row.name} · YOU` : row.name), node('span', 'finish-row-time', clock(row.timeMs)));
    if (row.isMe) {
      mine = el;
      const grab = node('span', 'finish-grab');
      grab.setAttribute('aria-hidden', 'true');
      grab.innerHTML = '<svg viewBox="0 0 56 40" fill="none"><path d="M28 0v14M9 14h38M9 14v15l8 8M47 14v15l-8 8" stroke="currentColor" stroke-width="3"/><path d="M20 13h16v8H20z" fill="currentColor"/></svg>';
      el.append(grab);
    }
    list.append(el);
  }
  if (model.climbed && !session.climbed) {
    session.climbed = true;
    const distance = Math.min(3, model.places) * 58;
    mine.style.zIndex = '2';
    const lift = animate(mine, [
      { transform: `translateY(${distance}px) scale(.96)`, opacity: 0, offset: 0 },
      { transform: `translateY(${distance}px) scale(1.04) rotate(-2deg)`, opacity: 1, offset: .18 },
      { transform: 'translateY(-14px) scale(1.07) rotate(1deg)', offset: .68 },
      { transform: 'translateY(5px) scale(.98)', offset: .8 },
      { transform: 'none', offset: 1 },
    ], { duration: 1750, delay: 180, easing: 'cubic-bezier(.2,.75,.25,1)' });
    if (lift) {
      const rankLabel = mine.querySelector('.finish-row-rank');
      rankLabel.textContent = `#${model.rankBefore}`;
      lift.onfinish = () => { rankLabel.textContent = `#${model.rank}`; };
    }
    animate(mine.querySelector('.finish-grab'), [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .65 }, { opacity: 0 }], { duration: 1750, delay: 180 });
    animate($('finish-board'), [{ boxShadow: '0 0 0 0 #ffd17300' }, { boxShadow: '0 0 0 5px #ffd17388', offset: .15 }, { boxShadow: '0 0 40px 0 #ffd17300' }], { duration: 650, delay: 1550 });
    for (const row of list.children) if (row !== mine) animate(row, [{ transform: 'translateY(-10px)', opacity: .45 }, { transform: 'none', opacity: 1 }], { duration: 450, delay: 1400 });
  }
}

export function dismissFinishScreen() { cancelAnimations(); session = null; }
