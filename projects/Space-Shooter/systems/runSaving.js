// Connects the flight events to the hub's leaderboards and tells the player
// what happened to each time. Guests see why their times aren't saved.
// Challenge links (?challenge=<id>), circuit splits and the finish breakdown
// live here too; their wording comes from challenges.js.
import { createRunRecorder, describeResult, clock, LEVEL_BOARDS } from './hubRuns.js';
import {
  CIRCUITS, parseChallengeId, classifyChallenge, challengeNote, pilotName, splitLine, runningLine, referenceSoFar,
  breakdownRows, formatDelta, finishSummary, challengeOutcome, refusalText, refusalState, createErrorText,
  challengeLink, challengeMessage,
} from './challenges.js';
import { toast } from '../ui/hud.js';
import { CUSTOM_BOARD, activeCustomTrack } from './customTrack.js';
import { setWeeklyGhost, currentWeeklySession } from '../engine/modes/weekly.js';
import { setFailBoard } from '../ui/failScreen.js';
import { finishScreenToken, isCurrentFinish, updateFinishScreen, setFinishNote } from '../ui/finishScreen.js';

const ACCOUNT_URL = new URL('../../account/', document.baseURI).href;
const BOARDS_URL = new URL('../../stardust/#fastest-runs', document.baseURI).href;
const CUSTOM_URL = new URL('../../stardust/#custom-track', document.baseURI).href;
const WEEKLY_URL = new URL('../../stardust/weekly/', document.baseURI).href;
// The hub stores up to 256 KB of input log; a longer one is sent without it.
const MAX_LOG = 250000;
const CIRCUIT_NAME = Object.fromEntries(CIRCUITS);

const recorder = createRunRecorder();
const byId = (id) => document.getElementById(id);

// The challenge link this page was opened with, and what the hub said about it.
const challengeId = parseChallengeId(location.search);
let challengeInfo = null;
let challengeLoad = null;

// The signed-in player's full-run best before this launch: { timeMs, splits }.
let personalBest = null;

// This launch: circuit times so far and what they're compared with.
let flight = null;
let launches = 0;

function name(user) {
  return user?.displayName || user?.username || '';
}

function link(text, href) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, onClick, className) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// The start screen line and the status chip.
function paintPlayer() {
  const note = byId('leaderboard-note');
  const chip = byId('connection-status');
  const user = recorder.player;
  const reachable = recorder.reachable;
  if (note) {
    note.replaceChildren();
    if (user) note.append(`Signed in as ${name(user)}. Finished circuits go to the `, link('leaderboard', BOARDS_URL), '.');
    else if (reachable) note.append('Guest flight: times aren’t saved. ', link('Sign in or create an account', ACCOUNT_URL), ' to race the leaderboard.');
    else note.append('The leaderboard is offline right now. You can still fly; times won’t be saved until it’s back.');
    note.hidden = false;
  }
  if (chip) chip.textContent = user ? `SIGNED IN · ${name(user).toUpperCase()}` : reachable ? 'GUEST · TIMES NOT SAVED' : 'LEADERBOARD OFFLINE · TIMES NOT SAVED';
  // A hub that answers but has no custom-track board yet (an older hub):
  // the track still flies, and the card says plainly that its times won't save.
  const save = byId('custom-track-save');
  if (save) {
    save.textContent = customBoardMissing() ? 'The leaderboard doesn’t have this track yet, so its times won’t be saved.' : '';
    save.hidden = !save.textContent;
  }
}

function customBoardMissing() {
  return recorder.reachable && recorder.boardsKnown && recorder.version(CUSTOM_BOARD) == null;
}

// The hangar's challenge line.
function paintChallenge() {
  const note = byId('challenge-note');
  if (!note || !challengeId || !challengeInfo) return;
  const { text, signIn } = challengeNote(challengeInfo, { signedIn: Boolean(recorder.player) });
  note.replaceChildren(text);
  if (signIn) note.append(' ', link('Sign in', ACCOUNT_URL), ' for this attempt to count.');
  note.dataset.state = challengeInfo.state;
  note.hidden = false;
}

async function loadChallenge() {
  if (!challengeId) return;
  const { status, data } = await recorder.loadChallenge(challengeId);
  challengeInfo = classifyChallenge(status, data);
  recorder.useChallenge(challengeInfo.state === 'active' ? challengeId : null);
  paintChallenge();
}

async function loadProfile() {
  const me = await recorder.profile();
  const best = me?.bests?.full;
  const current = recorder.version('full');
  // Only a best on the board version being raced is comparable.
  personalBest = best && Number.isFinite(best.timeMs) && (best.version == null || current == null || best.version === current)
    ? { timeMs: best.timeMs, splits: best.splits && typeof best.splits === 'object' ? best.splits : null }
    : null;
}

// What the running launch is compared with: the hub's challenge answer at
// start when there is one, else the challenge as loaded in the hangar.
function challengeTarget(started) {
  if (!challengeInfo || challengeInfo.state !== 'active') return null;
  const t = challengeInfo.challenge.target;
  const fromStart = started?.challenge;
  return {
    name: pilotName(t.pilot),
    pilot: t.pilot,
    timeMs: Number.isFinite(fromStart?.targetMs) ? fromStart.targetMs : t.timeMs,
    splits: fromStart?.splits || t.splits || null,
  };
}

function paintEnd(content) {
  const out = byId('starmap-end-save');
  if (!out) return;
  if (content == null) { out.replaceChildren(); out.hidden = true; return; }
  const head = el('p');
  head.append(...[].concat(content.headline ?? content));
  out.replaceChildren(head);
  if (content.lines?.length) {
    const list = el('ul', 'end-lines');
    list.append(...content.lines.map((line) => el('li', null, line)));
    out.append(list);
  }
  out.hidden = false;
  setFinishNote(head.textContent);
}

async function paintFinishPlacement(result, board, token, previousMs = null) {
  if (!isCurrentFinish(token)) return;
  const playerName = name(recorder.player) || 'You';
  // Fetch neighbours before the animation so a late fetch cannot replace the
  // nameplate halfway through its climb. The accepted rank still works offline.
  const around = !result.staff && result.best?.rank ? await recorder.around(board, 1).catch(() => null) : null;
  if (!isCurrentFinish(token)) return;
  const rows = around?.me?.rank === result.best?.rank ? (around.entries || []).map((e) => ({ rank: e.rank, name: name(e), timeMs: e.timeMs, isMe: !!e.isMe })) : [];
  updateFinishScreen({ result, playerName, rows, previousMs }, token);
}

function paintBreakdown(totalMs) {
  const box = byId('starmap-end-breakdown');
  if (!box) return;
  if (!flight || !Object.keys(flight.splits).length) { box.replaceChildren(); box.hidden = true; return; }
  const table = breakdownRows({ splits: flight.splits, totalMs, pb: flight.pb, target: flight.target });
  const heads = ['Circuit', 'Time'];
  if (table.columns.pb) heads.push('Δ PB');
  if (table.columns.target) heads.push(`Δ ${table.targetName}`);
  const row = (cells, cellTag) => {
    const tr = el('tr');
    cells.forEach((text, i) => tr.append(el(i === 0 && cellTag === 'td' ? 'th' : cellTag, null, text)));
    return tr;
  };
  const cells = (r) => {
    const out = [r.name, clock(r.timeMs)];
    if (table.columns.pb) out.push(r.pb === null ? '—' : formatDelta(r.pb));
    if (table.columns.target) out.push(r.target === null ? '—' : formatDelta(r.target));
    return out;
  };
  const t = el('table', 'end-table');
  const thead = el('thead');
  thead.append(row(heads, 'th'));
  const tbody = el('tbody');
  tbody.append(...table.rows.map((r) => row(cells(r), 'td')));
  const tfoot = el('tfoot');
  tfoot.append(row(cells(table.total), 'td'));
  t.append(el('caption', null, 'Finish breakdown'), thead, tbody, tfoot);
  box.replaceChildren(t);
  box.hidden = false;
}

function paintSocial(nodes) {
  const box = byId('starmap-end-social');
  if (!box) return;
  box.replaceChildren(...[].concat(nodes ?? []));
  box.hidden = nodes == null;
}

async function copyText(text, input, status) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied.';
    return;
  } catch { /* fall back to selecting the text */ }
  input.focus();
  input.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  status.textContent = copied ? 'Copied.' : 'Select the link and copy it.';
}

// A made challenge: the link, a prepared message, and ways to pass it on.
function linkPanel(challenge, timeMs, label) {
  const url = challengeLink(challenge.id, document.baseURI);
  const message = challengeMessage(timeMs, url);
  const wrap = el('div', 'challenge-link');
  wrap.append(el('p', 'challenge-link-label', label));
  const input = el('input');
  input.type = 'text';
  input.readOnly = true;
  input.value = url;
  input.setAttribute('aria-label', 'Challenge link');
  input.addEventListener('focus', () => input.select());
  const status = el('span', 'challenge-copy-status');
  status.setAttribute('role', 'status');
  const actions = el('div', 'challenge-actions');
  actions.append(
    button('Copy link', () => copyText(url, input, status)),
    button('Copy message', () => copyText(message, input, status)),
  );
  if (typeof navigator.share === 'function') {
    actions.append(button('Share…', () => {
      navigator.share({ title: 'Stardust challenge', text: `Beat my Stardust time: ${clock(timeMs)} on the full network`, url }).catch(() => {});
    }));
  }
  actions.append(status);
  wrap.append(input, el('p', 'challenge-message', message), actions);
  return wrap;
}

// "Challenge a friend", and "Send it back" after beating a challenge.
function paintChallengeActions(result) {
  const run = recorder.lastRun;
  if (!recorder.player || !run) { paintSocial(null); return; }
  const out = el('div', 'challenge-out');
  const offer = (label, request, linkLabel) => {
    const b = button(label, async () => {
      b.disabled = true;
      const note = el('p', 'challenge-error', 'Making a link…');
      b.after(note);
      const made = await recorder.createChallenge(request).catch(() => ({ error: 'offline' }));
      if (made.challenge) {
        note.replaceWith(linkPanel(made.challenge, run.timeMs, linkLabel));
        b.remove();
      } else {
        note.textContent = createErrorText(made.error);
        b.disabled = false;
      }
    });
    return b;
  };
  const buttons = el('div', 'challenge-actions');
  const c = result.challenge;
  if (c?.beaten && c.canRechallenge && c.from?.username) {
    buttons.append(offer(`Send it back to ${pilotName(c.from)}`, { runId: run.runId, to: c.from.username, parent: c.id },
      `Challenge for ${pilotName(c.from)}. It also shows up in their challenge inbox.`));
  }
  buttons.append(offer('Challenge a friend', { runId: run.runId }, 'Anyone with this link can race your time.'));
  out.append(buttons);
  paintSocial(out);
}

async function paintBoard() {
  const panel = byId('hangar-board');
  const list = byId('hangar-board-list');
  if (!panel || !list) return;
  const rows = await recorder.board('full', 5);
  if (!rows) return;
  list.replaceChildren(...rows.map((row) => {
    const li = document.createElement('li');
    if (recorder.player && row.username === recorder.player.username) li.className = 'is-me';
    for (const [cls, text] of [['rank', String(row.rank).padStart(2, '0')], ['name', row.displayName || row.username], ['time', clock(row.timeMs)]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.append(span);
    }
    return li;
  }));
  byId('hangar-board-empty').hidden = rows.length > 0;
  panel.hidden = false;
}

// Runs even when the hub looked down at boot: every launch reconnects, so a hub
// that wakes up mid-session starts saving from the next run, and the player is
// told plainly while it can't.
export async function initRunSaving() {
  if (!recorder.enabled) return;
  const refresh = async () => {
    await recorder.connect();
    paintPlayer();
    challengeLoad = loadChallenge().catch(() => {});
    await Promise.all([
      recorder.reachable ? paintBoard() : null,
      loadProfile(),
      challengeLoad,
    ].map((p) => Promise.resolve(p).catch(() => {})));
  };
  await refresh().catch(() => {});
  // Signing in happens on another page; pick it up when the player comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh().catch(() => {});
  });

  window.addEventListener('stardust:runStart', async () => {
    const mine = ++launches;
    paintEnd(null);
    paintBreakdown(null);
    paintSocial(null);
    flight = { splits: {}, pb: personalBest, target: challengeTarget(null) };
    // A challenge link still loading gets a moment to land; the countdown covers it.
    if (challengeLoad) await challengeLoad;
    if (mine !== launches) return;
    flight.target = challengeTarget(null);
    const started = await recorder.startRun().catch(() => null);
    if (mine !== launches) return;
    paintPlayer();
    if (started?.challengeRefused) {
      flight.target = null;
      recorder.useChallenge(null);
      challengeInfo = { state: refusalState(started.challengeRefused), challenge: challengeInfo?.challenge ?? null };
      paintChallenge();
      toast(refusalText(started.challengeRefused), 5200);
    } else if (started?.challenge) {
      flight.target = challengeTarget(started);
    }
  });
  // The custom track: one lap, one board ('custom-track'), none of the network's
  // splits, challenges or medals. A preview is never sent to the hub.
  window.addEventListener('stardust:customRunStart', async (event) => {
    launches += 1;
    flight = null;
    paintEnd(null);
    paintBreakdown(null);
    paintSocial(null);
    if (event.detail?.preview) { recorder.abandon(); return; }
    await recorder.startBoardRun(CUSTOM_BOARD, { version: activeCustomTrack().version }).catch(() => null);
    paintPlayer();
  });
  window.addEventListener('stardust:customRunComplete', async (event) => {
    const token = finishScreenToken();
    const { totalMs, title = 'Custom track', preview } = event.detail || {};
    paintBreakdown(null);
    paintSocial(null);
    if (preview) { paintEnd(`Preview — not saved. Your time: ${clock(totalMs)}.`); return; }
    if (customBoardMissing()) { paintEnd(`Your time: ${clock(totalMs)}. This track isn’t on the leaderboard yet, so it wasn’t saved.`); return; }
    if (!recorder.player) {
      if (!recorder.reachable) paintEnd(`Your time: ${clock(totalMs)}. The leaderboard was offline, so it wasn’t saved.`);
      else paintEnd([`Guest run: ${clock(totalMs)} isn’t on the leaderboard. `, link('Create an account', `${ACCOUNT_URL}#create`), ' and your next run counts.']);
      return;
    }
    paintEnd('Saving your time…');
    const result = await recorder.finishBoardRun(totalMs);
    if (!isCurrentFinish(token)) return;
    if (!result) { paintEnd('This run started before you signed in, so it wasn’t saved. The next one will be.'); return; }
    if (result.status === 'unsaved' || result.status === 'error') { paintEnd(`Your time: ${clock(totalMs)}. ${describeResult(result, title)}`); return; }
    if (result.status === 'accepted') {
      paintEnd([`${describeResult(result, title)} `, link('See the leaderboard', CUSTOM_URL)]);
      paintFinishPlacement(result, CUSTOM_BOARD, token);
    }
    else paintEnd(describeResult(result, title));
  });

  // The weekly time trial: every attempt (the grid, after a launch or a
  // crash) opens a fresh run on the event's board; a preview never touches the
  // hub. The leaderboard's #1 flies along as a ghost once it's been fetched.
  let ghostFor = null;
  window.addEventListener('stardust:weeklyAttempt', async (event) => {
    const { eventId, version, preview } = event.detail || {};
    launches += 1;
    flight = null;
    paintEnd(null);
    paintBreakdown(null);
    paintSocial(null);
    if (ghostFor !== `${eventId}.${version}`) {
      ghostFor = `${eventId}.${version}`;
      recorder.ghost(eventId, { rank: 1 }).then((top) => {
        if (!top || currentWeeklySession()?.event?.id !== eventId) return;
        setWeeklyGhost('top', { log: top.inputLog, label: `#1 ${top.displayName || top.username} ${clock(top.timeMs)}`, color: '#ffd166' });
      }).catch(() => {});
    }
    if (preview) { recorder.abandon(); return; }
    await recorder.startBoardRun(eventId, { version }).catch(() => null);
    paintPlayer();
  });
  window.addEventListener('stardust:weeklyRunComplete', async (event) => {
    const token = finishScreenToken();
    const { eventId, totalMs, inputLog, preview, personalBest, previousMs, title = 'Weekly track' } = event.detail || {};
    paintBreakdown(null);
    paintSocial(null);
    const local = personalBest && previousMs != null ? ` New best on this browser (was ${clock(previousMs)}).` : '';
    if (preview) { paintEnd(`Preview flight — not submitted to the leaderboard.${local}`); return; }
    if (recorder.reachable && recorder.boardsKnown && recorder.version(eventId) == null) { paintEnd(`Your time: ${clock(totalMs)}. This week’s board isn’t on the leaderboard yet, so it wasn’t saved.${local}`); return; }
    if (!recorder.player) {
      if (!recorder.reachable) paintEnd(`Your time: ${clock(totalMs)}. The leaderboard was offline, so it wasn’t saved.${local}`);
      else paintEnd([`Guest run: ${clock(totalMs)} isn’t on the weekly board. `, link('Create an account', `${ACCOUNT_URL}#create`), ' and your next run counts.']);
      return;
    }
    paintEnd('Saving your time…');
    const extra = typeof inputLog === 'string' && inputLog.length <= MAX_LOG ? { inputLog } : {};
    const result = await recorder.finishBoardRun(totalMs, extra);
    if (!isCurrentFinish(token)) return;
    if (!result) { paintEnd('This attempt started before you signed in, so it wasn’t saved. The next one will be.'); return; }
    if (result.status === 'unsaved' || result.status === 'error') { paintEnd(`Your time: ${clock(totalMs)}. ${describeResult(result, title)}`); return; }
    if (result.status === 'accepted') {
      const line = result.staff ? `${title}: ${clock(result.timeMs ?? totalMs)} saved as a dev time (not ranked).` : describeResult(result, title);
      paintEnd([`${line} `, link('Weekly leaderboard', WEEKLY_URL)]);
      paintFinishPlacement(result, eventId, token);
    } else paintEnd(describeResult(result, title));
  });

  // The attempt-over screen's board: the pilot above you, you, the pilot below.
  window.addEventListener('stardust:weeklyFailed', async () => {
    const board = currentWeeklySession()?.event?.id;
    if (!board) return;
    const name = (e) => e.displayName || e.username;
    if (recorder.player) {
      const around = await recorder.around(board, 1).catch(() => null);
      if (around?.me) {
        const rows = around.entries.filter((e) => Math.abs(e.rank - around.me.rank) <= 1).map((e) => ({ rank: e.rank, name: name(e), timeMs: e.timeMs, isMe: !!e.isMe }));
        setFailBoard(rows, around.next ? `${clock(around.next.gapMs)} to catch #${around.next.rank} ${around.next.displayName}.` : 'You lead the board.');
        return;
      }
    }
    const top = await recorder.board(board, 3).catch(() => null);
    const rows = (top || []).map((e) => ({ rank: e.rank, name: name(e), timeMs: e.timeMs }));
    const note = !recorder.reachable ? 'The board is offline right now.'
      : !recorder.player ? 'Guest flight: sign in and your finished laps go on the board.'
        : rows.length ? 'No time on the board yet: finish a lap to place.' : 'Nobody on the board yet. Finish a lap and it’s yours.';
    setFailBoard(rows, note);
  });

  window.addEventListener('stardust:levelStart', (event) => recorder.startLevel(event.detail?.level));
  window.addEventListener('stardust:runQuit', () => { launches += 1; flight = null; recorder.abandon(); });

  window.addEventListener('stardust:levelComplete', async (event) => {
    const { level, elapsedMs } = event.detail || {};
    const board = LEVEL_BOARDS[level - 1];
    const lines = [];
    // The last circuit's split goes in the finish breakdown instead.
    const last = level >= LEVEL_BOARDS.length;
    if (board && flight && Number.isFinite(elapsedMs)) {
      const timeMs = Math.max(0, Math.round(elapsedMs));
      flight.splits[board] = timeMs;
      const target = flight.target;
      lines.push(splitLine({ board, timeMs, pbMs: flight.pb?.splits?.[board], targetMs: target?.splits?.[board], targetName: target?.name }));
      const soFar = Object.values(flight.splits).reduce((a, b) => a + b, 0);
      const running = level > 1 ? runningLine({ totalMs: soFar, targetMs: referenceSoFar(flight.splits, target?.splits), targetName: target?.name }) : null;
      if (running) lines.push(running);
      if (last) lines.length = 0;
      // After the game's own "complete" toast, which is shown right after this event.
      else setTimeout(() => toast(lines.join('\n'), 4200), 0);
    }
    const result = await recorder.finishLevel(level, elapsedMs);
    const line = describeResult(result, CIRCUIT_NAME[board] || 'Circuit');
    if (line) toast([...lines, line].join('\n'), 4200);
  });

  window.addEventListener('roadmap:runComplete', async (event) => {
    const token = finishScreenToken();
    const previousMs = flight?.pb?.timeMs;
    const totalMs = event.detail?.totalMs;
    paintBreakdown(totalMs);
    paintSocial(null);
    const target = flight?.target;
    if (!recorder.player) {
      const lines = [];
      const outcome = target ? challengeOutcome({ timeMs: totalMs, targetMs: target.timeMs, pilot: target.pilot }) : null;
      if (outcome) lines.push(`${outcome} Not counted: sign in to make challenge attempts count.`);
      if (!recorder.reachable) paintEnd({ headline: `Your time: ${clock(totalMs)}. The leaderboard was offline, so it wasn’t saved.`, lines });
      else paintEnd({ headline: [`Guest run: ${clock(totalMs)} isn’t on the leaderboard. `, link('Create an account', `${ACCOUNT_URL}#create`), ' and your next run counts.'], lines });
      return;
    }
    paintEnd('Saving your time…');
    const result = await recorder.finishRun(totalMs);
    if (!isCurrentFinish(token)) return;
    if (!result) { paintEnd('This run started before you signed in, so it wasn’t saved. The next one will be.'); return; }
    if (result.status === 'unsaved' || result.status === 'error') { paintEnd(`Your time: ${clock(totalMs)}. ${describeResult(result, 'Full network')}`); return; }
    paintBoard().catch(() => {});
    if (result.status === 'accepted') {
      const summary = finishSummary(result);
      paintEnd({ headline: [`${summary.headline} `, link('See the leaderboard', BOARDS_URL)], lines: summary.lines });
      paintChallengeActions(result);
      paintFinishPlacement(result, 'full', token, previousMs);
      // The next launch compares against the new best.
      loadProfile().catch(() => {});
    } else {
      paintEnd(describeResult(result, 'Full network'));
    }
  });
}
