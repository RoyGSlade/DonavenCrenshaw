// The Voyage save: one object, kept in this browser first and mirrored to the
// account's `voyage` save slot when signed in (voyage/sync.js). Shape in
// lhc-lanes/stardust/INTERFACES.md section 5.
import { cleanCharacter, ID } from './character.js';
import { UPGRADE_IDS, TOP_TIER, MONEY_MAX, REP_MAX, ITEMS, ITEM_STACK_MAX, UNLOCK_KINDS } from './data.js';

export const SAVE_VERSION = 1;
export const LOCAL_KEY = 'stardust.voyage.v1';
// The hub refuses a slot over 64 KB; a little is kept back for the envelope.
export const MAX_SAVE_BYTES = 64 * 1024 - 512;
export const QUESTS_MAX_BYTES = 32 * 1024;
const MAX_ENTRIES = 64;
const UNLOCK = new RegExp(`^(${UNLOCK_KINDS.join('|')}):[a-z0-9][a-z0-9-]{0,31}$`);
const ITEM_MAX = new Map(ITEMS.map((i) => [i.id, i.max]));
// The keys this file owns; any other top-level key is kept as it came (a newer
// page may have written it).
const OWN = new Set(['v', 'updatedAt', 'character', 'money', 'rep', 'items', 'upgrades', 'flags', 'account', 'quests']);

const int = (v, lo, hi, fallback = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : fallback);
export const itemMax = (id) => ITEM_MAX.get(id) ?? ITEM_STACK_MAX;
const byteLength = (text) => new TextEncoder().encode(text).length;

export function emptyUpgrades() {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0]));
}

export function emptySave() {
  return {
    v: SAVE_VERSION,
    updatedAt: 0,
    character: null,
    money: 0,
    rep: {},
    items: {},
    upgrades: emptyUpgrades(),
    flags: {},
    account: { unlocks: [], maxRep: {}, bank: 0 },
    quests: {},
  };
}

/** id -> whole number map, entries with bad ids or zero values dropped. */
function cleanCounts(input, lo, hiFor) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [id, value] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_ENTRIES) break;
    if (!ID.test(id) || !Number.isFinite(value)) continue;
    const n = int(value, lo, hiFor(id));
    if (n !== 0) out[id] = n;
  }
  return out;
}

/** Any value -> a valid save. Bad fields are repaired or dropped; nothing throws. */
export function cleanSave(input) {
  const s = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = emptySave();
  for (const [key, value] of Object.entries(s)) if (!OWN.has(key) && ID.test(key)) out[key] = value;
  out.updatedAt = int(s.updatedAt, 0, Number.MAX_SAFE_INTEGER);
  out.character = cleanCharacter(s.character);
  out.money = int(s.money, 0, MONEY_MAX);
  out.rep = cleanCounts(s.rep, 0, () => REP_MAX);
  out.items = cleanCounts(s.items, 0, itemMax);
  for (const id of UPGRADE_IDS) out.upgrades[id] = int(s.upgrades?.[id], 0, TOP_TIER);
  out.flags = cleanCounts(s.flags, -1e9, () => 1e9);
  const account = s.account && typeof s.account === 'object' ? s.account : {};
  out.account.unlocks = Array.isArray(account.unlocks)
    ? [...new Set(account.unlocks.filter((u) => typeof u === 'string' && UNLOCK.test(u)))].slice(0, MAX_ENTRIES)
    : [];
  out.account.maxRep = cleanCounts(account.maxRep, 0, () => 1);
  out.account.bank = int(account.bank, 0, 9999);
  out.quests = cleanQuests(s.quests);
  return out;
}

const plainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const QUEST_RESULTS = new Set(['success', 'failure']);
// Runs in progress kept at once (the hangar plays one at a time).
const ACTIVE_MAX = 4;

/**
 * Quest state (INTERFACES.md 1.4, section 5): { active: { questId: run }, done:
 * { questId: { result, outcome, at, times } } }. A run is the quest engine's own
 * JSON and is kept as it came; done entries are repaired. Other keys are kept
 * for newer pages. Over QUESTS_MAX_BYTES the runs in progress are dropped first
 * (a job can be taken again), then everything.
 */
export function cleanQuests(input) {
  if (!plainObject(input)) return {};
  let out = {};
  try {
    for (const [key, value] of Object.entries(input)) if (key !== 'active' && key !== 'done' && ID.test(key)) out[key] = structuredClone(value);
    const active = {};
    for (const [id, run] of Object.entries(plainObject(input.active) ? input.active : {})) {
      if (Object.keys(active).length >= ACTIVE_MAX) break;
      if (ID.test(id) && plainObject(run) && run.quest === id) active[id] = structuredClone(run);
    }
    const done = {};
    for (const [id, d] of Object.entries(plainObject(input.done) ? input.done : {})) {
      if (Object.keys(done).length >= MAX_ENTRIES || !ID.test(id) || !plainObject(d) || !QUEST_RESULTS.has(d.result)) continue;
      done[id] = {
        result: d.result,
        outcome: typeof d.outcome === 'string' ? d.outcome.slice(0, 32) : '',
        at: int(d.at, 0, Number.MAX_SAFE_INTEGER),
        times: int(d.times, 1, 1e6, 1),
      };
    }
    if (Object.keys(active).length) out.active = active;
    if (Object.keys(done).length) out.done = done;
    if (byteLength(JSON.stringify(out)) > QUESTS_MAX_BYTES) delete out.active;
    if (byteLength(JSON.stringify(out)) > QUESTS_MAX_BYTES) out = {};
  } catch { out = {}; }
  return out;
}

/** Has anything happened in this save worth keeping? */
export const hasProgress = (save) => Boolean(save?.character || save?.money || Object.keys(save?.items || {}).length
  || Object.keys(save?.rep || {}).length || Object.values(save?.upgrades || {}).some(Boolean) || save?.account?.unlocks?.length);

/** Text for storage, or null when the save is too big for the account slot. */
export function encodeSave(save) {
  const text = JSON.stringify(cleanSave(save));
  return byteLength(text) <= MAX_SAVE_BYTES ? text : null;
}

/** Stored text -> a save; an empty save for anything unreadable. */
export function decodeSave(text) {
  if (typeof text !== 'string' || !text) return emptySave();
  try { return cleanSave(JSON.parse(text)); } catch { return emptySave(); }
}
