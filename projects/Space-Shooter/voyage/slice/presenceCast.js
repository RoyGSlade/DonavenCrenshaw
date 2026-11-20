// Who is where for a beat, and who a beat needs in the room (opening track A). Pure.
//
//   castAt({ scene, node, flags })     { tull: room | 'away' | 'down', nessa: ..., pip: ..., reck: ... } for that moment
//   needsIn({ scene, node, flags })    the people who must be standing in the node's room before it plays
//   startCast(save)                    the cast to settle on a page load: the scene in progress, else the next one to start
import { QUESTS } from '../quests/data/quests/index.js';
import { SCHEDULE, FLAG_RULES, INTERCOM, NPC_IDS } from './presenceData.js';
import { activeScene, nextScene } from './rules.js';

const stepIdOf = (quest, node) => (quest?.steps || []).find((s) => (s.nodes || []).includes(node))?.id || null;

/** The cast for one node of one scene, flags applied. Unknown scenes have no cast. */
export function castAt({ scene, node, flags = {} }) {
  const plan = SCHEDULE[scene];
  if (!plan) return {};
  const quest = QUESTS[scene];
  const step = stepIdOf(quest, node || quest?.start);
  const cast = { ...plan.default, ...(step ? plan.steps?.[step] : null), ...(node ? plan.nodes?.[node] : null) };
  for (const r of FLAG_RULES) if (flags?.[r.flag]) cast[r.npc] = r.to;
  return cast;
}

/** The people a dialogue node needs in its room: everyone the cast puts in that room, plus its speaker. A voice on the intercom needs nobody. */
export function needsIn({ scene, node, flags = {} }) {
  const quest = QUESTS[scene];
  const n = quest?.nodes?.[node];
  if (!n?.room || n.type === 'end' || INTERCOM.includes(`${scene}:${node}`)) return [];
  const cast = castAt({ scene, node, flags });
  const here = NPC_IDS.filter((id) => cast[id] === n.room);
  const speaker = NPC_IDS.includes(n.portrait) ? n.portrait : null;
  return [...new Set([...here, ...(speaker && cast[speaker] === n.room ? [speaker] : [])])];
}

/** The scene and node a page load stands in: the scene in progress at its node, else the next scene at its start. */
export function startPoint(save) {
  const id = activeScene(save) || nextScene(save);
  if (!id) return { scene: 'day-five', node: null };
  const quest = QUESTS[id];
  return { scene: id, node: save?.quests?.active?.[id]?.node || quest.start };
}
