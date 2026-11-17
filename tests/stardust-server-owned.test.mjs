// Stardust launch, outcome 2, site side (tech lane plan, lhc-lanes/stardust/launch/tech/PLAN.md):
// the home server owns money, inventory totals, XP and levels; the browser keeps
// them only as a cache a pull replaces, so a local edit never sticks. No new-game
// session starts while the Hub is unreachable: a maintenance screen shows instead.
// Racing, Dogfight, weeklies and boards are not gated (design doc Section 9).
// Written before the build: skips until voyage/session.js and voyage/account.js exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanSave, emptySave } from '../projects/Space-Shooter/voyage/save.js';

const V = new URL('../projects/Space-Shooter/voyage/', import.meta.url);
const session = existsSync(new URL('session.js', V)) ? await import(new URL('session.js', V).href) : null;
const account = existsSync(new URL('account.js', V)) ? await import(new URL('account.js', V).href) : null;
const skip = session && account ? false : 'outcome 2 not built yet (voyage/session.js, voyage/account.js)';

test('session gate: play only when the Hub answers both health and clock', { skip }, () => {
  const { decideSession } = session;
  assert.equal(decideSession({ health: { status: 200, data: { ok: true } }, clock: { status: 200, data: { now: 1, day: 3 } } }).mode, 'play');
  assert.equal(decideSession({ health: { status: 0 }, clock: { status: 0 } }).mode, 'maintenance', 'unreachable');
  assert.equal(decideSession({ health: { status: 503 }, clock: { status: 200, data: { now: 1, day: 3 } } }).mode, 'maintenance', 'database down');
  assert.equal(decideSession({ health: { status: 200, data: { ok: true } }, clock: { status: 500 } }).mode, 'maintenance');
  assert.match(decideSession({ health: { status: 0 }, clock: { status: 0 } }).words, /maintenance|back soon/i);
});

test('account cache: the server\'s numbers replace the save\'s, and a local edit never survives a pull', { skip }, () => {
  const { applyAccount } = account;
  const server = { credits: 80, holdings: { scrap: 4 }, levels: { social: 2 }, upgrades: { hull: 1 } };
  const tampered = cleanSave({ ...emptySave(), money: 999999, items: { scrap: 999, circuit: 50 }, upgrades: { hull: 3 } });
  const out = applyAccount(tampered, server);
  assert.equal(out.money, 80);
  assert.deepEqual(out.items, { scrap: 4 });
  assert.equal(out.upgrades.hull, 1);
  assert.equal(out.character?.levels?.social ?? 2, 2);
  assert.deepEqual(applyAccount(cleanSave({ ...out, money: 5 }), server).money, 80, 'the next pull puts it back');
});

test('only the new game is gated: no racing, Dogfight or weekly code imports the session gate', { skip }, () => {
  const root = new URL('../projects/Space-Shooter/', import.meta.url).pathname;
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) { if (!p.includes('/voyage')) walk(p); } else if (/\.m?js$/.test(name.name) && /voyage\/session\.js/.test(readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

// ---- the economy client with a fake hub --------------------------------------

function fakeHub(account = { credits: 80, holdings: { scrap: 4 }, levels: { social: 1 }, upgrades: {} }) {
  const calls = [];
  const api = async (path, opts) => {
    const body = opts?.body ?? null;
    calls.push([opts?.method || 'GET', path, body]);
    if (path.endsWith('/v1/account')) return { ok: true, status: 200, data: { ok: true, ...account } };
    if (path.endsWith('/v1/jobs')) return { ok: true, status: 200, data: { ok: true, id: '11111111-2222-3333-4444-555555555555', seed: 7 } };
    if (path.includes('/settle')) { account.credits += Math.min(body.credits, 300); return { ok: true, status: 200, data: { ok: true, paid: { credits: Math.min(body.credits, 300) }, flags: [] } }; }
    if (path.endsWith('/v1/roll')) return { ok: true, status: 200, data: { ok: true, attempt: { roll: 17, pass: true }, paid: { credits: 25 } } };
    return { ok: true, status: 200, data: { ok: true } };
  };
  return { api, calls, gamePath: (p) => `/api/games/stardust${p}`, account };
}
function memStore(save) {
  let s = cleanSave(save);
  return { get: () => structuredClone(s), update: (fn) => { s = cleanSave(fn(structuredClone(s))); return true; } };
}

test('economy client: off, it does nothing at all', { skip }, async () => {
  const eco = account.createEconomy();
  assert.equal(eco.on, false);
  eco.jobStarted('cold-run');
  assert.equal(await eco.jobEnded('cold-run', { result: 'success' }), null);
  assert.equal(await eco.spend('stock', 'mel:medkit'), null);
});

test('economy client: a job takes a ticket, settles its net change and its XP, then pulls the hub\'s numbers', { skip }, async () => {
  const hub = fakeHub();
  const store = memStore({ ...emptySave(), money: 80, items: { scrap: 4 } });
  const eco = account.createEconomy();
  eco.enable({ api: hub.api, gamePath: hub.gamePath, store });
  eco.jobStarted('cold-run');
  store.update((s) => ({ ...s, money: s.money + 120, items: { ...s.items, scrap: 2, ore: 3 } }));
  eco.jobRolled('cold-run', [{ pass: true, skill: 'social' }, { pass: false, skill: 'stealth' }, { pass: true, skill: 'social' }]);
  await eco.jobEnded('cold-run', { result: 'success' });
  const settle = hub.calls.find(([, p]) => p.includes('/settle'));
  assert.deepEqual(settle[2], { outcome: 'success', credits: 120, items: { scrap: -2, ore: 3 }, xp: { social: 2 * account.XP_PER_PASS } });
  assert.equal(store.get().money, 200, 'the pull put the hub\'s balance in the save');
  assert.deepEqual(store.get().items, { scrap: 4 }, 'items are the hub\'s holdings');
});

test('economy client: a dice deal uses the hub\'s die', { skip }, async () => {
  const hub = fakeHub();
  const eco = account.createEconomy();
  eco.enable({ api: hub.api, gamePath: hub.gamePath, store: memStore(emptySave()) });
  const out = await eco.roll('dice-with-edna');
  assert.equal(out.attempt.roll, 17);
});

test('server mode: off unless the config says so or a tab asks with ?vserver=1', { skip }, () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(session.serverMode({ config: {}, search: '', storage }), false);
  assert.equal(session.serverMode({ config: { voyageServer: true }, search: '', storage }), true);
  assert.equal(session.serverMode({ config: {}, search: '?vserver=1', storage }), true);
  assert.equal(session.serverMode({ config: {}, search: '', storage }), true, 'remembered for the tab');
  assert.equal(session.serverMode({ config: {}, search: '?vserver=0', storage }), false);
  assert.equal(session.decideSession({ health: { status: 200, data: { ok: true } }, clock: { status: 200, data: { now: 1, day: 1 } }, signedIn: false }).mode, 'guest');
  assert.equal(session.decideSession({ health: { status: 200, data: { ok: true } }, clock: { status: 200, data: { now: 1, enabled: false } } }).mode, 'maintenance', 'the hub economy is switched off');
});
