// The slice's five quests ("The Knock", STORY-OUTLINE.md). Quest 1 is the
// complete slice quest; 2 to 5 are data only on the same engine.
import coldRun from './cold-run.js';
import railgunPaperTrail from './railgun-paper-trail.js';
import deadWeight from './dead-weight.js';
import blackLane from './black-lane.js';
import listeningGate from './listening-gate.js';

export const QUESTS = Object.freeze(Object.fromEntries(
  [coldRun, railgunPaperTrail, deadWeight, blackLane, listeningGate].map(quest => [quest.id, quest]),
));
export const SLICE_QUEST = 'cold-run';
