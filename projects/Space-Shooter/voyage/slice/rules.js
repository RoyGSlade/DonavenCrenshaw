// The opening slice's rules (launch slice lane), pure: no DOM, no clock. Which scene is next, where a beat plays and how
// the player gets there, and where a step's marker points. The director (slice/director.js) and the tests both read these.
//
//   nextScene(save)              the id of the next scene to hand out, or null when all six are played
//   sliceStarted(save)           has this save begun the opening
//   roomOf(quest, nodeId)        the Duchess room a node plays in
//   arriveMode(quest, nodeId)    'walk' (the marker waits for the player) or 'cut' (a fade moves them)
//   stepOf(quest, nodeId)        the step a node belongs to
//   markerFor(quest, run)        { map, npc | zone | prop } for the step the run is on, or null
import { SLICE_ORDER } from '../quests/data/slice/index.js';
import { QUESTS } from '../quests/data/quests/index.js';

export { SLICE_ORDER };
export const SLICE_FLAG = 'slice-started';
export const START_ROOM = 'duchess-mess';

export const sliceStarted = (save) => Boolean(save?.flags?.[SLICE_FLAG]);
export const isSliceQuest = (id) => SLICE_ORDER.includes(id);

/** The first scene with no record (active or done), in order. A failed scene is a record too: the story goes on. */
export function nextScene(save) {
  const active = save?.quests?.active || {};
  const done = save?.quests?.done || {};
  return SLICE_ORDER.find((id) => !active[id] && !done[id]) || null;
}

/** The slice scene the save is in the middle of, or null. */
export const activeScene = (save) => SLICE_ORDER.find((id) => save?.quests?.active?.[id]) || null;

export const roomOf = (quest, nodeId) => quest?.nodes?.[nodeId]?.room || null;
export const stepOf = (quest, nodeId) => (quest?.steps || []).find((s) => (s.nodes || []).includes(nodeId)) || null;

/**
 * How the player reaches a beat's room: a node says so (`arrive`), else the first node of a step waits for them to
 * walk there (the tracker marker leads the way) and every other beat, and every ending, is a cut.
 */
export function arriveMode(quest, nodeId) {
  const node = quest?.nodes?.[nodeId];
  if (!node) return 'cut';
  if (node.arrive) return node.arrive;
  if (node.type === 'end') return 'cut';
  const step = stepOf(quest, nodeId);
  return step && step.nodes[0] === nodeId ? 'walk' : 'cut';
}

/** The marker for the step a run is on (its `where` room and `at` spot), or null (no marker, or the quest is over). */
export function markerFor(quest, run) {
  if (!quest || !run || run.ended) return null;
  const step = stepOf(quest, run.node);
  if (!step?.at || !step.where) return null;
  return { map: step.where, ...step.at };
}

export const questById = (id) => QUESTS[id] || null;

/**
 * Is the scene in progress waiting on this person here? True when the step the run is on has its marker on `who` in `mapId`
 * (the captain after a "Later", say): talking to them must pick the scene back up, never fall through to a stock line.
 */
export function waitingOn(save, who, mapId) {
  const id = activeScene(save);
  if (!id) return false;
  const quest = QUESTS[id];
  const run = save.quests.active[id];
  const m = markerFor(quest, run);
  return Boolean(m && m.npc === who && m.map === mapId && quest.nodes[run.node]?.type === 'dialogue');
}
