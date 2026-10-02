import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_W, CARD_H, CARD_URL_TEXT, fitName, cardModel, shareMessage, shareLink, cardFileName, fitFontSize, drawCard,
  assembleShare, sendShare,
} from '../projects/Space-Shooter/systems/shareCard.js';
import { parseVsQuery, weeklyGameUrl, WEEKLY_EVENTS } from '../projects/Space-Shooter/systems/weekly.js';
import { createRunRecorder } from '../projects/Space-Shooter/systems/hubRuns.js';

const HUB = 'https://api.example.test';
const SITE_WEEKLY = 'https://donavencrenshaw.com/stardust/weekly/';
const SITE_GAME = 'https://donavencrenshaw.com/games/stardust/';

// ---- Wording -----------------------------------------------------------------------------

test('names are tidied and cut with an ellipsis; control characters and runs of space go', () => {
  assert.equal(fitName('  Crispy   Nacho '), 'Crispy Nacho');
  assert.equal(fitName('A Very Long Pilot Display Name Here', 12), 'A Very Long…');
  assert.equal(fitName('a\u0000b\nc'), 'a b c');
  assert.equal(fitName(null), '');
  assert.equal(fitName('<b>x</b>'), '<b>x</b>', 'text is drawn on a canvas, never as markup');
});

test('the card prints a time like the boards, the track, the pilot, the ship class and the rank', () => {
  const m = cardModel({ kind: 'weekly', timeMs: 112500, trackName: 'Gantry Drop', kicker: 'Weekly time trial · Week 1', rank: 3, pilotName: 'CrispyNacho', family: 'Needle' });
  assert.deepEqual(m, {
    kind: 'weekly', time: '1:52.50', track: 'GANTRY DROP', kicker: 'WEEKLY TIME TRIAL · WEEK 1', pilot: 'CrispyNacho',
    ship: 'NEEDLE CLASS', rankLabel: '#3 ON THE WEEKLY', rank: 3,
  });
});

test('a guest on the standard ship: "Guest", STANDARD SHIP and no rank pill; the network has a fixed name', () => {
  const m = cardModel({ kind: 'network', timeMs: 754321, trackName: 'ignored', pilotName: null, rank: null });
  assert.equal(m.pilot, 'Guest');
  assert.equal(m.ship, 'STANDARD SHIP');
  assert.equal(m.rankLabel, '');
  assert.equal(m.track, 'FULL NETWORK');
  assert.equal(m.time, '12:34.32');
  assert.equal(cardModel({ kind: 'network', timeMs: 1, rank: 4 }).rankLabel, '#4 ON THE LEADERBOARD');
  for (const bad of [0, -1, 1.5, '3', NaN]) assert.equal(cardModel({ timeMs: 1, rank: bad }).rank, null, String(bad));
});

test('the message names the time and the track, and says "ghost" only for a ghost link', () => {
  assert.equal(shareMessage({ kind: 'weekly', timeMs: 112500, trackName: 'Gantry Drop', rank: 3, ghost: true }), 'I flew 1:52.50 on Gantry Drop in Stardust (#3). Race my ghost.');
  assert.equal(shareMessage({ kind: 'weekly', timeMs: 112500, trackName: 'Gantry Drop' }), 'I flew 1:52.50 on Gantry Drop in Stardust. Beat it.');
  assert.equal(shareMessage({ kind: 'network', timeMs: 754321 }), 'I flew 12:34.32 on the full network in Stardust. Beat it.');
});

test('the file is named after the track and time', () => {
  assert.equal(cardFileName({ track: 'GANTRY DROP', time: '1:52.50' }), 'stardust-gantry-drop-1-52-50.png');
  assert.equal(cardFileName({ track: '<<>>', time: '0:00.00' }), 'stardust-0-00-00.png');
});

// ---- Links ---------------------------------------------------------------------------------

test('a ranked weekly run shares the hub /s/w link, which unfurls and lands on the run', () => {
  assert.deepEqual(shareLink({ kind: 'weekly', eventId: 'weekly-01', username: 'crispy_nacho', hubOrigin: HUB, weeklyUrl: SITE_WEEKLY, gameUrl: SITE_GAME, ranked: true }),
    { url: `${HUB}/s/w/weekly-01/crispy_nacho`, via: 'hub-weekly' });
  assert.equal(shareLink({ kind: 'weekly', eventId: 'weekly-01', username: 'a b/c', hubOrigin: `${HUB}/`, ranked: true }).url, `${HUB}/s/w/weekly-01/a%20b%2Fc`, 'encoded, no double slash');
});

test('guests, unsaved times and a missing hub fall back to the site weekly page or the game', () => {
  const base = { kind: 'weekly', eventId: 'weekly-01', hubOrigin: HUB, weeklyUrl: SITE_WEEKLY, gameUrl: SITE_GAME };
  assert.deepEqual(shareLink({ ...base, username: null, ranked: false }), { url: SITE_WEEKLY, via: 'weekly' });
  assert.deepEqual(shareLink({ ...base, username: 'x1x', ranked: false }), { url: SITE_WEEKLY, via: 'weekly' });
  assert.deepEqual(shareLink({ ...base, username: 'x1x', ranked: true, hubOrigin: null }), { url: SITE_WEEKLY, via: 'weekly' });
  assert.deepEqual(shareLink({ kind: 'weekly', gameUrl: SITE_GAME }), { url: SITE_GAME, via: 'game' });
});

test('a circuit run shares its challenge via the hub /s/c link, else the game', () => {
  assert.deepEqual(shareLink({ kind: 'network', challengeId: '5f8a2c3e-1b2d-4e5f-8a9b-0c1d2e3f4a5b', hubOrigin: HUB, gameUrl: SITE_GAME }),
    { url: `${HUB}/s/c/5f8a2c3e-1b2d-4e5f-8a9b-0c1d2e3f4a5b`, via: 'hub-challenge' });
  assert.deepEqual(shareLink({ kind: 'network', challengeId: null, hubOrigin: HUB, gameUrl: SITE_GAME }), { url: SITE_GAME, via: 'game' });
  assert.deepEqual(shareLink({ kind: 'network', challengeId: 'x', hubOrigin: null, gameUrl: SITE_GAME }), { url: SITE_GAME, via: 'game' });
});

test('?vs= accepts exact usernames only, and the game link can carry one', () => {
  assert.equal(parseVsQuery('?weekly=weekly-01&vs=CrispyNacho'), 'CrispyNacho');
  assert.equal(parseVsQuery('?vs=a_b-9'), 'a_b-9');
  assert.equal(parseVsQuery('?vs=%20spaced%20'), 'spaced', 'surrounding space is trimmed');
  for (const bad of ['?vs=ab', `?vs=${'x'.repeat(21)}`, '?vs=<script>', '?vs=../x', '?vs=a%20b%20c', '?vs=', '', '?x=1', undefined]) assert.equal(parseVsQuery(bad), null, String(bad));
  const event = WEEKLY_EVENTS[0];
  assert.equal(weeklyGameUrl(event), `games/stardust/?weekly=${event.id}`);
  assert.equal(weeklyGameUrl(event, 'crispy nacho'), `games/stardust/?weekly=${event.id}&vs=crispy%20nacho`);
});

// ---- The ghost request -----------------------------------------------------------------------------

test('the recorder asks the hub for a pilot ghost with user=, and exposes the hub origin for share links', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ inputLog: 'L', username: 'nova', timeMs: 1 }) }; };
  const rec = createRunRecorder({ config: { backendBaseUrl: `${HUB}/api/games/stardust`, requestTimeoutMs: 500, build: 't' }, fetchImpl });
  assert.equal(rec.hubOrigin, HUB);
  assert.ok((await rec.ghost('weekly-01', { user: 'nova_ace' })).inputLog);
  await rec.ghost('weekly-01', { rank: 2 });
  await rec.ghost('weekly-01', { me: true });
  assert.deepEqual(urls, [
    `${HUB}/api/games/stardust/boards/weekly-01/ghost?user=nova_ace`,
    `${HUB}/api/games/stardust/boards/weekly-01/ghost?rank=2`,
    `${HUB}/api/games/stardust/boards/weekly-01/ghost?me=1`,
  ]);
});

// ---- Drawing, against a recording stand-in for a canvas context --------------------------------------

function recorder() {
  const calls = [];
  const target = { calls, font: '', fillStyle: '', measureText: (text) => ({ width: text.length * (Number(/(\d+)px/.exec(target.font)?.[1]) || 10) * 0.612 }) };
  const gradient = { addColorStop() {} };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return (...args) => { calls.push({ op: String(key), args, font: t.font }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
}
const texts = (ctx) => ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);

test('drawCard paints every line of the card, once, at 1200x630', () => {
  const ctx = recorder();
  const model = cardModel({ kind: 'weekly', timeMs: 112500, trackName: 'Gantry Drop', kicker: 'Week 1', rank: 3, pilotName: 'CrispyNacho', family: 'Needle' });
  drawCard(ctx, model, { ship: { fake: 'ship' } });
  assert.deepEqual(texts(ctx), ['STARDUST', 'WEEK 1', 'FINISH TIME', '1:52.50', 'GANTRY DROP', 'CrispyNacho', 'NEEDLE CLASS', '#3 ON THE WEEKLY', 'BEAT IT', CARD_URL_TEXT]);
  const ship = ctx.calls.find((c) => c.op === 'drawImage');
  assert.deepEqual(ship.args[0], { fake: 'ship' });
  assert.equal(CARD_W, 1200);
  assert.equal(CARD_H, 630);
});

test('drawCard without a ship or a rank draws neither; the guest card still reads', () => {
  const ctx = recorder();
  drawCard(ctx, cardModel({ kind: 'weekly', timeMs: 99000, trackName: 'Gantry Drop', pilotName: null }));
  assert.ok(!ctx.calls.some((c) => c.op === 'drawImage'));
  assert.ok(texts(ctx).includes('Guest'));
  assert.ok(texts(ctx).includes('STANDARD SHIP'));
  assert.ok(!texts(ctx).some((t) => t.startsWith('#')));
});

test('a long time or track is sized down to fit its column; a short one keeps the full size', () => {
  const ctx = recorder();
  const font = (size) => `700 ${size}px mono`;
  assert.equal(fitFontSize(ctx, '1:52.50', 690, 150, font), 150);
  const long = fitFontSize(ctx, '12:34.32', 690, 150, font);
  assert.ok(long < 150 && long * 8 * 0.612 <= 690, String(long));
  assert.ok(fitFontSize(ctx, 'A'.repeat(80), 690, 50, font) >= 12);
});

// ---- Sharing -------------------------------------------------------------------------------------------

const prepared = () => ({ file: { name: 'card.png' }, blob: { size: 1 }, text: 'I flew it https://x.test/s/1', link: 'https://x.test/s/1', title: 'Stardust', filename: 'card.png' });
function env({ share, canShare = true, clipboard = true } = {}) {
  const log = [];
  return {
    log,
    navigator: {
      ...(canShare ? { canShare: ({ files }) => Array.isArray(files) && files.length > 0 } : {}),
      ...(share ? { share } : {}),
      clipboard: { writeText: async (text) => { if (!clipboard) throw new Error('refused'); log.push(`copied:${text}`); } },
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: {
      createElement: () => ({ click() { log.push('click'); }, remove() {}, set href(v) {}, set download(v) { log.push(`download:${v}`); } }),
      body: { append() {} },
    },
  };
}

test('share: a browser that can share files gets the picture, the text with the link, and no separate url', async () => {
  const sent = [];
  const e = env({ share: async (data) => { sent.push(data); } });
  assert.deepEqual(await sendShare(prepared(), e), { outcome: 'shared', copied: false });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].files, [{ name: 'card.png' }]);
  assert.match(sent[0].text, /https:\/\/x\.test\/s\/1$/);
  assert.equal(Object.hasOwn(sent[0], 'url'), false);
  assert.deepEqual(e.log, [], 'no download when the sheet worked');
});

test('share: closing the sheet is a quiet cancel; a stale tap is "blocked", with nothing downloaded', async () => {
  assert.equal((await sendShare(prepared(), env({ share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } }))).outcome, 'cancelled');
  const blocked = env({ share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
  assert.equal((await sendShare(prepared(), blocked)).outcome, 'blocked');
  assert.deepEqual(blocked.log, []);
});

test('share: no file sharing (desktop) downloads the PNG and copies message and link; a refused clipboard says so', async () => {
  const desktop = env({ canShare: false });
  assert.deepEqual(await sendShare(prepared(), desktop), { outcome: 'downloaded', copied: true });
  assert.deepEqual(desktop.log, ['download:card.png', 'click', 'copied:I flew it https://x.test/s/1']);
  const noClipboard = env({ canShare: false, clipboard: false });
  assert.deepEqual(await sendShare(prepared(), noClipboard), { outcome: 'downloaded', copied: false });
  // A share that fails for another reason also falls back to the download.
  const broken = env({ share: async () => { throw new Error('boom'); } });
  assert.equal((await sendShare(prepared(), broken)).outcome, 'downloaded');
});

test('assembleShare: weekly card for a ranked pilot (ghost link) and a circuit card that makes its challenge on demand', async () => {
  const seen = [];
  const deps = {
    loadShip: async (appearance) => ({ image: { ship: appearance?.family || 'standard' }, family: 'Needle' }),
    prepare: async (input) => { seen.push(input); return { ...input }; },
  };
  const weekly = await assembleShare({ kind: 'weekly', eventId: 'weekly-01', trackName: 'Gantry Drop', kicker: 'Weekly time trial · Week 1', timeMs: 112500, rank: 3, pilotName: 'CrispyNacho', username: 'crispynacho', ranked: true, hubOrigin: HUB, weeklyUrl: SITE_WEEKLY, gameUrl: SITE_GAME, appearance: { family: 'needle' } }, deps);
  assert.equal(weekly.via, 'hub-weekly');
  assert.equal(seen[0].link, `${HUB}/s/w/weekly-01/crispynacho`);
  assert.equal(seen[0].message, 'I flew 1:52.50 on Gantry Drop in Stardust (#3). Race my ghost.');
  assert.equal(seen[0].model.ship, 'NEEDLE CLASS');
  assert.deepEqual(seen[0].ship, { ship: 'needle' });

  let made = 0;
  const circuit = await assembleShare({ kind: 'network', timeMs: 754321, rank: 9, pilotName: 'Ada', username: 'ada', ranked: true, hubOrigin: HUB, gameUrl: SITE_GAME, challenge: async () => { made += 1; return 'c-1'; } }, deps);
  assert.equal(circuit.via, 'hub-challenge');
  assert.equal(made, 1);
  assert.equal(seen[1].link, `${HUB}/s/c/c-1`);

  // A challenge that cannot be made, and a guest, still produce a card that links to the game or weekly page.
  const failed = await assembleShare({ kind: 'network', timeMs: 754321, hubOrigin: HUB, gameUrl: SITE_GAME, challenge: async () => { throw new Error('offline'); } }, deps);
  assert.equal(failed.via, 'game');
  const guest = await assembleShare({ kind: 'weekly', timeMs: 99000, trackName: 'Gantry Drop', eventId: 'weekly-01', pilotName: null, ranked: false, hubOrigin: HUB, weeklyUrl: SITE_WEEKLY, gameUrl: SITE_GAME }, deps);
  assert.equal(guest.via, 'weekly');
  assert.equal(seen[3].message, 'I flew 1:39.00 on Gantry Drop in Stardust. Beat it.');
  assert.equal(seen[3].model.pilot, 'Guest');
});
