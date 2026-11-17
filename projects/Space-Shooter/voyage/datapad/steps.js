// What the player is doing right now, as steps: the tutorial leg or the job in
// progress, broken down for the HUD tracker and the datapad's Jobs page. Pure:
// no DOM. A job's steps come from its quest data (`steps`, added round 3 without
// touching the story): each step names the nodes that belong to it and where it
// happens. A quest without `steps` gets a plain list made from its nodes.
//
//   tutorialTrack(save) -> null | { kind: 'tutorial', id, title, steps, target }
//   jobTrack(save)      -> null | { kind: 'job', id, title, giver, steps, target }
//   currentTrack(save)  -> the tutorial while it runs, else the job, else null
// steps: [{ id, text, where, state: 'done' | 'skipped' | 'now' | 'next' }]
// target: what the objective marker points at: { station } | { npc } | null.
import { STEPS, LEGS, STEP_BY_ID } from '../story/tutorial.js';
import { storyOf } from '../story/progress.js';
import { QUESTS } from '../quests/data/quests/index.js';
import { SECTORS } from '../quests/data/sectors.js';
import { QUEST_GIVERS } from '../quests/data/givers.js';
import { GIVER_PLACE } from '../explore/rules.js';
import { placeName as roomName } from '../slice/places.js';
import { markerFor } from '../slice/rules.js';

const LEG = new Map(LEGS.map((l) => [l.id, l]));
const PLACE_GIVER = Object.fromEntries(Object.entries(GIVER_PLACE).map(([giver, place]) => [place, giver]));
// A place is a sector or (launch slice) a Tin Duchess room: "the mess hall" reads "The mess hall".
const placeName = (id) => SECTORS[id]?.name || (roomName(id) ? roomName(id).replace(/^./, (c) => c.toUpperCase()) : null);

/** The tutorial leg in progress, with its steps ticked off. */
export function tutorialTrack(save) {
  const story = storyOf(save);
  if (story.finished || story.skipped || !story.step) return null;
  const step = STEP_BY_ID.get(story.step);
  if (!step?.objective) return null;
  const done = new Set(story.done || []);
  const leg = LEG.get(step.leg);
  const steps = STEPS.filter((s) => s.leg === step.leg && s.objective).map((s) => ({
    id: s.id,
    text: s.objective,
    where: s.target ? placeName(s.target) : null,
    state: s.id === step.id ? 'now' : done.has(s.id) ? 'done' : 'next',
  }));
  return { kind: 'tutorial', id: step.leg, title: leg?.name || 'Getting started', steps, target: targetFor(step) };
}

// A tutorial step's marker: its station, or the quest giver met at its target place.
function targetFor(step) {
  if (step.station) return { station: step.station };
  const giver = step.target ? PLACE_GIVER[step.target] : null;
  return giver ? { npc: giver } : null;
}

/** The steps a quest is broken into: its own `steps`, or a plain list from its nodes. */
export function questSteps(quest) {
  if (Array.isArray(quest?.steps) && quest.steps.length) return quest.steps;
  return deriveSteps(quest);
}

// Plain steps for a quest without authored ones: hear the giver out, then each
// trip, fight, puzzle and race in the order the file lists them, then get paid.
export function deriveSteps(quest) {
  const giver = QUEST_GIVERS[quest.giver]?.name?.split(' ').pop() || 'the giver';
  const out = [{ id: 'brief', text: `Hear ${giver} out`, where: quest.location || null, nodes: [quest.start] }];
  for (const [id, node] of Object.entries(quest.nodes || {})) {
    if (node.type === 'travel') out.push({ id, text: `Fly to ${placeName(node.to) || node.to}`, where: node.to, nodes: [id] });
    else if (node.type === 'fight') out.push({ id, text: node.title ? `Fight: ${node.title}` : 'Win the fight', where: null, nodes: [id] });
    else if (node.type === 'puzzle' || node.type === 'riddle') out.push({ id, text: node.title ? `Crack it: ${node.title}` : 'Crack the puzzle', where: null, nodes: [id] });
    else if (node.type === 'race') out.push({ id, text: node.title ? `Race: ${node.title}` : 'Win the race', where: null, nodes: [id] });
  }
  out.push({ id: 'paid', text: 'Finish the job and get paid', where: null, nodes: Object.keys(quest.nodes || {}).filter((id) => quest.nodes[id].type === 'end') });
  return out;
}

/**
 * A quest's steps against a run: a step is reached when the run has visited any of its nodes.
 * The furthest reached step is now; reached steps before it are done, steps it jumped past are skipped.
 */
export function stepStates(quest, run) {
  const steps = questSteps(quest);
  const visited = run?.visits || {};
  const reached = steps.map((s) => (s.nodes || []).some((n) => visited[n] || run?.node === n));
  let now = -1;
  reached.forEach((r, i) => { if (r) now = i; });
  if (now < 0) now = 0;
  if (run?.ended) now = steps.length; // every step is behind you
  return steps.map((s, i) => ({
    id: s.id,
    text: s.text,
    where: s.where ? placeName(s.where) || s.where : null,
    state: i === now ? 'now' : i < now ? (reached[i] ? 'done' : 'skipped') : 'next',
  }));
}

/** The job in progress (the first active run), broken into steps. */
export function jobTrack(save, quests = QUESTS) {
  const active = save?.quests?.active || {};
  for (const [id, run] of Object.entries(active)) {
    const quest = quests[id];
    if (!quest || run?.ended) continue;
    // A job you have taken plays wherever you are (round 3), from the tracker's Continue. Only a step with a spot in a room
    // (the opening slice: `where` + `at`) carries a floor marker: { map, npc | zone | prop }.
    return { kind: 'job', id, title: quest.title, giver: quest.giver, steps: stepStates(quest, run), target: markerFor(quest, run) };
  }
  return null;
}

/** The tracker's subject: the tutorial while it runs, else the job in progress. */
export const currentTrack = (save) => tutorialTrack(save) || jobTrack(save);

/**
 * The lines the HUD tracker shows: the current step first, then up to (max - 1) next steps.
 * (Done steps live on the datapad's Jobs page, not on the HUD.)
 */
export function trackerLines(track, max = 4) {
  if (!track) return [];
  const now = track.steps.findIndex((s) => s.state === 'now');
  if (now < 0) return [];
  return track.steps.slice(now, now + Math.max(1, max));
}

export { mapsHolding, doorToward } from './route.js';
