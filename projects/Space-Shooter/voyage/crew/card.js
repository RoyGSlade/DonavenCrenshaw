// Who the crew is, and what they earn (P11). Pure; no DOM.
//
// The crew card: the second player's own captain, as much of them as the
// pilot's game needs to roll their checks (S55): name, the four stats and
// their skills. It travels crew -> host and is cleaned on arrival.
//
// The crew's share (S32: each player keeps their own save): whenever a step
// pays the pilot, the crew gets the same credits, rep with that giver, skill
// points and materials, in their own save, at once. Quest keys, parts and
// cargo stay with the pilot, whose job it is. Fines and losses are not shared.
// A share already granted stays if the pilot leaves mid-job (S58).
import { STATS, SKILLS, GIVERS, ITEMS } from '../data.js';
import { cleanName } from '../character.js';

const STAT_IDS = STATS.map((s) => s.id);
const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
const GIVER_IDS = new Set(GIVERS.map((g) => g.id));
const MATERIALS = new Set(ITEMS.filter((i) => i.kind === 'material').map((i) => i.id));

// Bounds on one share, so a confused page can never flood a save.
export const SHARE_LIMITS = Object.freeze({ money: 1000, rep: 50, skillPoints: 3, items: 20 });

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** The card this player sends when they join a crew; null without a captain. */
export function crewCard(character) {
  if (!character) return null;
  return {
    name: character.name,
    stats: Object.fromEntries(STAT_IDS.map((id) => [id, character.stats?.[id] ?? 3])),
    skills: Object.fromEntries(Object.entries(character.skills || {}).filter(([id, rank]) => SKILL.has(id) && rank > 0)),
  };
}

/** A card from the other browser, checked; null when it is not a crew card. */
export function cleanCrewCard(card) {
  if (!card || typeof card !== 'object') return null;
  const name = cleanName(card.name);
  if (!name) return null;
  const stats = {};
  for (const id of STAT_IDS) {
    const v = int(card.stats?.[id], 1, 6);
    if (v == null) return null;
    stats[id] = v;
  }
  const skills = {};
  for (const [id, rank] of Object.entries(card.skills && typeof card.skills === 'object' ? card.skills : {})) {
    const skill = SKILL.get(id);
    const r = skill ? int(rank, 1, skill.max) : null;
    if (r != null) skills[id] = r;
  }
  return { name, stats, skills };
}

/** The crew's share of a step's grant events, or null when there is nothing to share. */
export function crewShare(events = []) {
  const share = { money: 0, rep: {}, items: {}, skillPoints: 0 };
  for (const e of events) {
    if (!(e?.amount > 0)) continue;
    if (e.type === 'money') share.money += e.amount;
    else if (e.type === 'rep' && GIVER_IDS.has(e.giver)) share.rep[e.giver] = (share.rep[e.giver] || 0) + e.amount;
    else if (e.type === 'skill-points') share.skillPoints += e.amount;
    else if (e.type === 'item' && MATERIALS.has(e.id)) share.items[e.id] = (share.items[e.id] || 0) + e.amount;
  }
  return cleanCrewReward(share);
}

/** A share from the pilot's browser, checked and capped; null when empty or not a share. */
export function cleanCrewReward(reward) {
  if (!reward || typeof reward !== 'object') return null;
  const out = {};
  const money = Math.min(SHARE_LIMITS.money, Math.floor(Number(reward.money) || 0));
  if (money > 0) out.money = money;
  const sp = Math.min(SHARE_LIMITS.skillPoints, Math.floor(Number(reward.skillPoints) || 0));
  if (sp > 0) out.skillPoints = sp;
  const rep = {};
  for (const [id, n] of Object.entries(reward.rep && typeof reward.rep === 'object' ? reward.rep : {})) {
    const v = Math.min(SHARE_LIMITS.rep, Math.floor(Number(n) || 0));
    if (GIVER_IDS.has(id) && v > 0) rep[id] = v;
  }
  if (Object.keys(rep).length) out.rep = rep;
  const items = {};
  for (const [id, n] of Object.entries(reward.items && typeof reward.items === 'object' ? reward.items : {})) {
    const v = Math.min(SHARE_LIMITS.items, Math.floor(Number(n) || 0));
    if (MATERIALS.has(id) && v > 0) items[id] = v;
  }
  if (Object.keys(items).length) out.items = items;
  return Object.keys(out).length ? out : null;
}
