// Static checks for quest data: every link points at a real node, every node can
// be reached from the start, every step has a way on for each outcome it can
// produce, and the quest has more than one way to win and to fail.
import { NODE_TYPES, PART_OUTCOMES, partKind } from './engine.js';
import { ENEMIES } from './data/enemies.js';
import { SECTORS } from './data/sectors.js';
import { EVENTS } from './data/events.js';
import { TRACKS } from './data/tracks.js';
import { GIVERS, ITEMS, STAT_NAMES } from './core.js';
import { SKILLS as SKILL_LIST } from '../data.js';

const SKILLS = Object.fromEntries(SKILL_LIST.map((s) => [s.id, s]));
import { SPEAKERS_DATA } from './data/speakers.js';
import { BADGES_DATA } from './data/badges.js';
const BADGES = BADGES_DATA.badges;

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Voice line ids: ROUND2-CONTRACT.md section 2 (<speaker>.<scene>.<n>).
export const LINE_ID = /^[a-z0-9][a-z0-9.-]{0,47}$/;
export const EMOTIONS = Object.freeze([...SPEAKERS_DATA.emotions]);
/** Who may speak a quest line: the story's cast plus the quest extras. */
export const SPEAKERS = Object.freeze(Object.fromEntries([
  ...SPEAKERS_DATA.cast.map((id) => [id, { id, cast: true }]),
  ...Object.entries(SPEAKERS_DATA.extras).map(([id, x]) => [id, { id, cast: false, ...x }]),
]));

// Every node id a node can lead to.
export function links(node) {
  const out = [];
  if (node.next) out.push(node.next);
  for (const target of Object.values(node.outcomes || {})) out.push(target);
  for (const choice of node.choices || []) {
    for (const c of [choice, ...(choice.variants || [])]) {
      if (c.to) out.push(c.to);
      if (c.check) out.push(c.check.pass, c.check.fail);
    }
  }
  for (const c of node.cases || []) out.push(c.to);
  if (node.else) out.push(node.else);
  return out.filter(Boolean);
}

function rewardIssues(reward, where) {
  const out = [];
  if (!reward) return out;
  for (const giver of Object.keys(reward.rep || {})) if (!GIVERS[giver]) out.push(`${where}: unknown giver ${giver}`);
  for (const item of Object.keys(reward.items || {})) if (!ITEMS[item]) out.push(`${where}: unknown item ${item}`);
  for (const unlock of reward.unlocks || []) if (unlock.startsWith('badge:') && !BADGES[unlock.slice(6)]) out.push(`${where}: unknown badge ${unlock}`);
  return out;
}

// A node somebody speaks needs a voice line id; its speaker (the id's first
// part) must be a cast member or a known extra; a rolled {placeholder} in the
// words needs audioText, the words to record.
function lineIssues(node, where) {
  const out = [];
  const spoken = (node.type === 'dialogue' || node.type === 'end') && node.speaker;
  if (!spoken) {
    if (node.line) out.push(`${where}: a line id on a node nobody speaks`);
    return out;
  }
  if (!LINE_ID.test(node.line || '')) { out.push(`${where}: spoken node needs a line id`); return out; }
  if (!SPEAKERS[node.line.split('.')[0]]) out.push(`${where}: line ${node.line} has an unknown speaker`);
  if (/\{[^}]+\}/.test(node.text || '') && !node.audioText) out.push(`${where}: line ${node.line} has a placeholder and no audioText`);
  if (/[{}]/.test(node.audioText || '')) out.push(`${where}: audioText must be plain words`);
  if (!String(node.text || '').trim()) out.push(`${where}: spoken node has no words`);
  if (!EMOTIONS.includes(node.emotion)) out.push(`${where}: line ${node.line} needs an emotion (${EMOTIONS.join(' ')})`);
  if (!String(node.direction || '').trim()) out.push(`${where}: line ${node.line} needs a direction for the actor`);
  return out;
}

function reqIssues(req, where) {
  const out = [];
  if (!req) return out;
  for (const giver of Object.keys(req.rep || {})) if (!GIVERS[giver]) out.push(`${where}: unknown giver ${giver}`);
  for (const item of Object.keys(req.items || {})) if (!ITEMS[item]) out.push(`${where}: unknown item ${item}`);
  // Skill gates name a level the skill can reach (Donaven: "needs Hacker 2").
  for (const [skill, level] of Object.entries(req.skills || {})) {
    if (!SKILLS[skill]) out.push(`${where}: unknown skill ${skill}`);
    else if (!(level >= 1 && level <= SKILLS[skill].max)) out.push(`${where}: ${skill} only goes to level ${SKILLS[skill].max}`);
  }
  // Stats never gate an option (Donaven's dice rule): they only add to a roll.
  if (req.stats) out.push(`${where}: a stat gate; use a check (a roll) or a skill gate`);
  for (const sub of req.anyOf || []) out.push(...reqIssues(sub, where));
  return out;
}

export function validateQuest(quest) {
  const errors = [];
  const err = msg => errors.push(`${quest.id || '?'}: ${msg}`);
  if (!ID.test(quest.id || '')) err('id must be a short lowercase id');
  if (!quest.title) err('missing title');
  if (!GIVERS[quest.giver]) err(`unknown giver ${quest.giver}`);
  if (quest.location && !SECTORS[quest.location]) err(`unknown location ${quest.location}`);
  if (!quest.nodes?.[quest.start]) err(`start node ${quest.start} is missing`);
  errors.push(...reqIssues(quest.requires, `${quest.id}: requires`));

  for (const [id, node] of Object.entries(quest.nodes || {})) {
    if (!NODE_TYPES.includes(node.type)) { err(`${id}: unknown type ${node.type}`); continue; }
    for (const target of links(node)) if (!quest.nodes[target]) err(`${id}: links to missing node ${target}`);
    errors.push(...rewardIssues(node.reward, `${quest.id}: ${id}`), ...rewardIssues(node.onEnter, `${quest.id}: ${id}`), ...lineIssues(node, `${quest.id}: ${id}`));
    if (node.type === 'dialogue') {
      if (!node.choices?.length) err(`${id}: dialogue needs at least one choice`);
      for (const [i, choice] of (node.choices || []).entries()) {
        if (!choice.label) err(`${id}: choice ${i} has no label`);
        if (!choice.to && !choice.check) err(`${id}: choice ${i} goes nowhere`);
        if (choice.check && !STAT_NAMES[choice.check.stat]) err(`${id}: choice ${i} checks unknown stat`);
        errors.push(...reqIssues(choice.requires, `${quest.id}: ${id}[${i}]`), ...rewardIssues(choice.reward, `${quest.id}: ${id}[${i}]`));
      }
    }
    if (node.type === 'branch' && !node.else) err(`${id}: branch needs an else`);
    if (node.type === 'end') {
      if (!['success', 'failure'].includes(node.result)) err(`${id}: end result must be success or failure`);
    }
    const kind = partKind(node);
    if (kind) {
      const needed = kind === 'skirmish' ? ['win', 'lose'] : kind === 'foot' ? ['win', 'lose'] : PART_OUTCOMES[kind];
      for (const outcome of needed) if (!node.outcomes?.[outcome] && !node.next) err(`${id}: no way on after ${outcome}`);
      if (node.type === 'fight') {
        const spec = node.enemy;
        if (typeof spec === 'string') { if (!spec.startsWith('$')) err(`${id}: enemy must be $roll or a spec`); }
        else if (!ENEMIES[spec?.enemy]) err(`${id}: unknown enemy template ${spec?.enemy}`);
      }
      if (node.type === 'travel' && !SECTORS[node.to]) err(`${id}: unknown destination ${node.to}`);
      if (node.type === 'race' && !String(node.track).startsWith('$') && !TRACKS[node.track]) err(`${id}: unknown track ${node.track}`);
      if (node.type === 'event') for (const card of node.deck || []) if (!EVENTS[card]) err(`${id}: unknown event card ${card}`);
    }
  }

  // Reachability from the start node.
  const seen = new Set();
  const queue = quest.nodes?.[quest.start] ? [quest.start] : [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !quest.nodes[id]) continue;
    seen.add(id);
    queue.push(...links(quest.nodes[id]));
  }
  for (const id of Object.keys(quest.nodes || {})) if (!seen.has(id)) err(`${id}: cannot be reached from the start`);

  const ends = Object.entries(quest.nodes || {}).filter(([, n]) => n.type === 'end');
  const outcomesOf = result => new Set(ends.filter(([, n]) => n.result === result).map(([id, n]) => n.outcome || id));
  if (outcomesOf('success').size < 2) err('needs at least two different successes');
  if (outcomesOf('failure').size < 2) err('needs at least two different failures');
  return errors;
}

/** Every voice line in a set of quests: { lines: [{ id, quest, node, ... }], errors }. */
export function questLines(quests) {
  const lines = [];
  const errors = [];
  const seen = new Map();
  for (const quest of quests) {
    // pitch: the giver's one-breath sell of the job on the board (<giver>.job.<questId>).
    const p = quest.pitch;
    if (p) {
      if (p.line !== `${quest.giver}.job.${quest.id}` || !p.text || !EMOTIONS.includes(p.emotion) || !p.direction) errors.push(`${quest.id}: pitch needs line ${quest.giver}.job.${quest.id}, text, emotion and direction`);
      seen.set(p.line, `${quest.id}: pitch`);
      lines.push({ id: p.line, quest: quest.id, node: 'pitch', speaker: quest.giver, name: null, text: p.text, emotion: p.emotion, direction: p.direction });
    }
    for (const [node, n] of Object.entries(quest.nodes || {})) {
      if (!n.line) continue;
      if (seen.has(n.line)) errors.push(`line ${n.line} is used by ${seen.get(n.line)} and ${quest.id}: ${node}`);
      seen.set(n.line, `${quest.id}: ${node}`);
      lines.push({ id: n.line, quest: quest.id, node, speaker: n.line.split('.')[0], name: n.speaker, text: n.text, audioText: n.audioText, emotion: n.emotion, direction: n.direction });
    }
  }
  return { lines, errors };
}

export function validateEvents() {
  const errors = [];
  for (const [id, card] of Object.entries(EVENTS)) {
    if (!card.title || !card.choices?.length) errors.push(`event ${id}: needs a title and choices`);
    for (const choice of card.choices || []) {
      const outcomes = choice.check ? [choice.pass, choice.fail] : [choice.outcome];
      if (outcomes.some(o => !o)) errors.push(`event ${id}: "${choice.label}" is missing an outcome`);
      for (const o of outcomes.filter(Boolean)) {
        errors.push(...rewardIssues(o.reward, `event ${id}`));
        if (o.fight) {
          if (!ENEMIES[o.fight.enemy]) errors.push(`event ${id}: unknown enemy ${o.fight.enemy}`);
          for (const k of ['win', 'lose']) if (!o[k]) errors.push(`event ${id}: fight has no ${k} outcome`);
          for (const k of ['win', 'lose', 'flee', 'parley']) errors.push(...rewardIssues(o[k]?.reward, `event ${id}`));
        }
      }
    }
  }
  for (const [id, sector] of Object.entries(SECTORS)) for (const card of sector.deck) if (!EVENTS[card]) errors.push(`sector ${id}: unknown event ${card}`);
  return errors;
}
