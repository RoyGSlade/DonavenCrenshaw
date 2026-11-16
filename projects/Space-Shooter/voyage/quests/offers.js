// Jobs you have not taken yet live in the world (round 3, Donaven: "jobs that are
// active on a data pad while jobs that you havent taken are in the world"). A giver
// offers their own jobs in person, where they work; the hangar's job board carries
// postings from givers who are not on this station. Pure: no DOM.
//
//   offersAt({ map, npc? }, save)  -> the offers to show here: [{ quest, giver, ok, reasons, pay, deadly, last }]
//   offerSpots(save)               -> where each giver's offers are found: { giver: { map, npc } | { map, board } }
//   payText(quest)                 -> "70-95 credits" from the quest's success endings
//   whereText(giverId)             -> "Hask, at his office on Alpha Relay (or the hangar job board)"
import { QUESTS } from './data/quests/index.js';
import { QUEST_GIVERS } from './data/givers.js';
import { SECTORS } from './data/sectors.js';
import { availability } from './engine.js';
import { OFFERS_DATA } from './data/offers.js';

const lookup = (scope, path) => path.split('.').reduce((n, k) => (n == null ? undefined : n[k]), scope);

/** Does a job end in death if it goes wrong? (S25: only jobs marked Deadly.) */
export const isDeadly = (quest) => Object.values(quest.nodes || {}).some((n) => n.type === 'end' && n.death);

/** What a job pays on success, in words: "70-95 credits", "120 credits", or '' when it pays in other things. */
export function payText(quest) {
  const amounts = [];
  for (const n of Object.values(quest.nodes || {})) {
    if (n.type !== 'end' || n.result !== 'success') continue;
    const m = n.reward?.money;
    if (typeof m === 'number') amounts.push(m, m);
    else if (typeof m === 'string' && m.startsWith('$')) {
      const spec = lookup(quest.rolls || {}, m.slice(1));
      if (Array.isArray(spec?.range)) amounts.push(spec.range[0], spec.range[1]);
    }
  }
  if (!amounts.length) return '';
  const lo = Math.min(...amounts), hi = Math.max(...amounts);
  return lo === hi ? `${lo} credits` : `${lo}-${hi} credits`;
}

function offer(quest, giver, save) {
  const can = save?.character ? availability(quest, save) : { ok: false, reasons: ['Sign on a captain first.'] };
  const busy = Object.keys(save?.quests?.active || {}).length > 0;
  const reasons = busy ? ['Finish the job you are on first.', ...can.reasons] : can.reasons;
  return { quest, id: quest.id, giver, ok: !busy && can.ok, reasons, pay: payText(quest), deadly: isDeadly(quest), last: save?.quests?.done?.[quest.id] || null };
}

/** Every job a giver hands out, as offers for this save (closed ones carry why). */
export function giverOffers(giverId, save) {
  return (QUEST_GIVERS[giverId]?.quests || []).map((id) => QUESTS[id]).filter(Boolean).map((q) => offer(q, giverId, save));
}

/**
 * The offers at a spot. here: { map, npc } (talking to someone) or { map, board: true } (the job board).
 * A giver offers in person on the map they work on; the board posts for every giver who
 * is not standing on that map (data: offers.js boards).
 */
export function offersAt(here, save) {
  if (here.npc) {
    const spot = OFFERS_DATA.givers[here.npc];
    return spot && spot.map === here.map ? giverOffers(here.npc, save) : [];
  }
  if (here.board) {
    const posts = OFFERS_DATA.boards[here.map] || [];
    return posts.flatMap((g) => (OFFERS_DATA.givers[g]?.map === here.map ? [] : giverOffers(g, save)));
  }
  return [];
}

/** How many offers here could be taken right now (the "job here" mark's count). */
export const openCount = (here, save) => offersAt(here, save).filter((o) => o.ok).length;

/** Where to find a giver's jobs, in words (for the datapad's Jobs page). */
export function whereText(giverId) {
  const g = QUEST_GIVERS[giverId];
  const spot = OFFERS_DATA.givers[giverId];
  const place = SECTORS[g?.sector]?.name || g?.sector || '';
  const boards = Object.entries(OFFERS_DATA.boards).filter(([, list]) => list.includes(giverId)).map(([map]) => OFFERS_DATA.boardNames[map] || map);
  const inPerson = spot ? `${g.short}, ${spot.where || `on ${place}`}` : '';
  return [inPerson, boards.length ? `the ${boards.join(' or the ')}` : ''].filter(Boolean).join(', or ');
}
