// Static checks for quest data: every link points at a real node, every node can
// be reached from the start, every step has a way on for each outcome it can
// produce, and the quest has more than one way to win and to fail.
import { NODE_TYPES, PART_OUTCOMES, partKind } from './engine.js';
import { ENEMIES } from './data/enemies.js';
import { SECTORS } from './data/sectors.js';
import { EVENTS } from './data/events.js';
import { TRACKS } from './data/tracks.js';
import { GIVERS, ITEMS } from './core.js';

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

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
  return out;
}

function reqIssues(req, where) {
  const out = [];
  if (!req) return out;
  for (const giver of Object.keys(req.rep || {})) if (!GIVERS[giver]) out.push(`${where}: unknown giver ${giver}`);
  for (const item of Object.keys(req.items || {})) if (!ITEMS[item]) out.push(`${where}: unknown item ${item}`);
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
    errors.push(...rewardIssues(node.reward, `${quest.id}: ${id}`), ...rewardIssues(node.onEnter, `${quest.id}: ${id}`));
    if (node.type === 'dialogue') {
      if (!node.choices?.length) err(`${id}: dialogue needs at least one choice`);
      for (const [i, choice] of (node.choices || []).entries()) {
        if (!choice.label) err(`${id}: choice ${i} has no label`);
        if (!choice.to && !choice.check) err(`${id}: choice ${i} goes nowhere`);
        if (choice.check && !['cha', 'con', 'dex', 'wis'].includes(choice.check.stat)) err(`${id}: choice ${i} checks unknown stat`);
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
