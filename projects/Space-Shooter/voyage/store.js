// The live Voyage save for a page: reads and writes this browser's storage and
// tells listeners about every change. No DOM; storage and the clock are handed
// in, so tests run it with fakes. Account sync (voyage/sync.js) listens to it.
import { cleanSave, decodeSave, encodeSave, emptySave, emptyUpgrades, LOCAL_KEY } from './save.js';
import { grant, spend, canAfford, meets, missing } from './economy.js';
import { createCharacter, learn, die } from './character.js';
import { upgrade } from './upgrades.js';
import { START_KIT, DEATH } from './data.js';

export const BACKUP_KEY = 'stardust.voyage.backup.v1';

export function createVoyageStore({ storage = globalThis.localStorage, now = Date.now, key = LOCAL_KEY } = {}) {
  const read = () => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  let save = decodeSave(read());
  let stored = true; // did the last write reach storage?
  const listeners = new Set();

  function notify(source) {
    for (const fn of [...listeners]) { try { fn(structuredClone(save), source); } catch (error) { console.warn('Stardust: a Voyage listener failed', error); } }
  }

  /** Puts a new save in place. source 'local' stamps it; 'account' keeps the account copy's stamp. */
  function commit(next, source = 'local') {
    const clean = cleanSave(next);
    if (source === 'local') clean.updatedAt = Math.max(Math.floor(now()), save.updatedAt + 1);
    const text = encodeSave(clean);
    if (!text) return false; // over the account slot's size: refuse rather than lose it later
    save = clean;
    try { storage?.setItem(key, text); stored = true; } catch { stored = false; }
    notify(source);
    return true;
  }

  return {
    /** A copy: changing it changes nothing until it goes back through update(). */
    get: () => structuredClone(save),
    /** Whether the last change reached this browser's storage (false in some private windows). */
    get stored() { return stored; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // --- The INTERFACES.md section 3 wrapper ---
    grant(reward) {
      const out = grant(save, reward);
      if (out.events.length) commit(out.save);
      return out.events;
    },
    spend(cost) {
      const out = spend(save, cost);
      if (out.ok) commit(out.save);
      return { ok: out.ok, reason: out.reason };
    },
    canAfford: (cost) => canAfford(save, cost),
    meets: (req) => meets(save, req),
    missing: (req) => missing(save, req),
    /** fn: save -> save. For quest state and anything else a page owns. */
    update(fn) {
      const next = fn(structuredClone(save));
      return next ? commit(next) : false;
    },

    // --- Hangar actions ---
    createCharacter(form, rng = Math.random) {
      if (save.character) return { ok: false, reason: 'You already have a captain.' };
      const c = createCharacter(form, rng, now);
      if (!c) return { ok: false, reason: 'Give your captain a name.' };
      // Max-rep points earned before there was a captain were banked on the account part.
      const banked = save.account.bank;
      const signed = { ...save, character: { ...c, permanent: c.permanent + banked }, account: { ...save.account, bank: 0 } };
      commit(grant(signed, START_KIT).save);
      return { ok: true, reason: '' };
    },
    learn(skillId) {
      const next = learn(save.character, skillId);
      if (next === save.character) return false;
      return commit({ ...save, character: next });
    },
    die(rng = Math.random) {
      if (!save.character) return null;
      const out = die(save.character, rng);
      commit({ ...save, character: out.character, ...(DEATH.loseUpgrades ? { upgrades: emptyUpgrades() } : {}) });
      return out.lost;
    },
    upgrade(systemId) {
      const out = upgrade(save, systemId);
      if (out.ok) commit(out.save);
      return { ok: out.ok, reason: out.reason };
    },

    // --- Account sync ---
    /** The account's copy replaces this browser's (sync pulled it). */
    replace(next) { return commit(next, 'account'); },
    /** Keeps a copy of this browser's save before an account copy replaces it. */
    backup() {
      try { storage?.setItem(BACKUP_KEY, JSON.stringify(save)); return true; } catch { return false; }
    },
    /** Start over (the hangar's "new save" in dev tools). */
    reset() { return commit(emptySave()); },
  };
}
