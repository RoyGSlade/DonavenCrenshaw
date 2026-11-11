// Every quest, five per giver (Hask: deliveries and lane fights; Vey:
// paperwork, theft and information; Garrity: mining, repair and building).
// Each quest file is data only (STUDIO-SCHEMA.md); this index only lists them.
// Story chain: Dead Channel, The Warden File and Black Box open after Cold Run,
// the Railgun and Dead Weight (their `requires` flags).
import coldRun from './cold-run.js';
import blackLane from './black-lane.js';
import threeTiers from './three-tiers.js';
import slowParade from './slow-parade.js';
import deadChannel from './dead-channel.js';
import railgunPaperTrail from './railgun-paper-trail.js';
import listeningGate from './listening-gate.js';
import missingPage from './missing-page.js';
import teapot from './teapot.js';
import wardenFile from './warden-file.js';
import deadWeight from './dead-weight.js';
import deepSeam from './deep-seam.js';
import lighthouse from './lighthouse.js';
import dustfallDerby from './dustfall-derby.js';
import blackBox from './black-box.js';

export const QUEST_LIST = Object.freeze([
  coldRun, blackLane, threeTiers, slowParade, deadChannel,
  railgunPaperTrail, listeningGate, missingPage, teapot, wardenFile,
  deadWeight, deepSeam, lighthouse, dustfallDerby, blackBox,
]);
export const QUESTS = Object.freeze(Object.fromEntries(QUEST_LIST.map(quest => [quest.id, quest])));
export const SLICE_QUEST = 'cold-run';
