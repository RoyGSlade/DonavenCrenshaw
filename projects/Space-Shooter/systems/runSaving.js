// Connects the flight events to the hub's leaderboards and tells the player
// what happened to each time. Guests see why their times aren't saved.
import { createRunRecorder, describeResult, clock } from './hubRuns.js';
import { toast } from '../ui/hud.js';

const CIRCUITS = ['Alpha Relay', 'Beacon Prime', 'Dustfall Station', 'Nether Crossing', 'Iron Veil'];
const ACCOUNT_URL = new URL('../../account/', document.baseURI).href;
const BOARDS_URL = new URL('../../stardust/#fastest-runs', document.baseURI).href;

const recorder = createRunRecorder();
const byId = (id) => document.getElementById(id);

function name(user) {
  return user?.displayName || user?.username || '';
}

function link(text, href) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

// The start screen line and the status chip.
function paintPlayer(reachable) {
  const note = byId('leaderboard-note');
  const chip = byId('connection-status');
  const user = recorder.player;
  if (note) {
    note.replaceChildren();
    if (user) note.append(`Signed in as ${name(user)}. Finished circuits go to the `, link('leaderboard', BOARDS_URL), '.');
    else if (reachable) note.append('Guest flight: times aren’t saved. ', link('Sign in or create an account', ACCOUNT_URL), ' to race the leaderboard.');
    note.hidden = !user && !reachable;
  }
  if (chip && reachable) chip.textContent = user ? `SIGNED IN · ${name(user).toUpperCase()}` : 'GUEST · TIMES NOT SAVED';
}

function paintEnd(content) {
  const out = byId('starmap-end-save');
  if (!out) return;
  out.replaceChildren(...[].concat(content ?? []));
  out.hidden = content == null;
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

export async function initRunSaving() {
  if (!recorder.enabled) return;
  let reachable = false;
  const refresh = async () => {
    await recorder.connect();
    // A session check that answers at all means the hub is up, even for guests.
    reachable = true;
    paintPlayer(reachable);
    await paintBoard();
  };
  await refresh().catch(() => {});
  // Signing in happens on another page; pick it up when the player comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh().catch(() => {});
  });

  window.addEventListener('stardust:runStart', () => {
    paintEnd(null);
    recorder.startRun().then(() => paintPlayer(reachable)).catch(() => {});
  });
  window.addEventListener('stardust:levelStart', (event) => recorder.startLevel(event.detail?.level));
  window.addEventListener('stardust:runQuit', () => recorder.abandon());

  window.addEventListener('stardust:levelComplete', async (event) => {
    const { level, elapsedMs } = event.detail || {};
    const result = await recorder.finishLevel(level, elapsedMs);
    const line = describeResult(result, CIRCUITS[level - 1] || 'Circuit');
    if (line) toast(line, 4200);
  });

  window.addEventListener('roadmap:runComplete', async (event) => {
    const totalMs = event.detail?.totalMs;
    if (!recorder.player) {
      paintEnd([`Guest run: ${clock(totalMs)} isn’t on the leaderboard. `, link('Create an account', `${ACCOUNT_URL}#create`), ' and your next run counts.']);
      return;
    }
    paintEnd('Saving your time…');
    const result = await recorder.finishRun(totalMs);
    if (!result) { paintEnd('This run started before you signed in, so it wasn’t saved. The next one will be.'); return; }
    paintBoard().catch(() => {});
    if (result.status === 'accepted') {
      const rank = result.best?.rank ? `#${result.best.rank} on the full network` : 'Saved to the full-network board';
      paintEnd([`${result.personalBest ? 'New personal best. ' : 'Saved. '}${rank}. `, link('See the leaderboard', BOARDS_URL)]);
    } else {
      paintEnd(describeResult(result, 'Full network'));
    }
  });
}
