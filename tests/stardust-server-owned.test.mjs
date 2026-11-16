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
