// What the crew's screen shows (P11): the pilot's browser builds this from the
// running job and sends it over the crew room. Pure, plain data, inside the
// relay's limits (voyage/crew/protocol.js): short strings, short lists.
//
// Besides what the pilot sees, the crew's station sees what their jobs need:
// the enemy's position for the turret, which systems are knocked out, and the
// navigator's odds of trouble on each lane and on the next jump (S56).
import { view } from '../quests/engine.js';
import { crewFight, crewTrip } from '../quests/parts/crew.js';
import { eventChance, routeOdds, SCAN_FACTOR } from '../quests/parts/travel.js';
import { SECTORS } from '../quests/data/sectors.js';
import { STAT_NAMES } from '../quests/core.js';

const cut = (text, n = 380) => {
  const s = String(text ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const sector = (id) => (id ? SECTORS[id]?.name || id : null);

function fightState(fight, live) {
  const e = fight.enemy;
  return {
    name: cut(e.name, 60),
    hp: e.hp,
    hpMax: e.hpMax,
    shield: e.shield || 0,
    movement: e.movement || 'hold',
    cloaked: Boolean(e.cloaked),
    round: fight.round,
    hull: fight.ship.hp,
    hullMax: fight.ship.hpMax,
    systems: { guns: Boolean(fight.systems?.guns), engine: Boolean(fight.systems?.engine) },
    turretReady: fight.crew?.turret !== fight.round,
    repairReady: fight.crew?.repair !== fight.round,
    live: Boolean(live),
    log: fight.log.slice(-5).map((l) => cut(l, 160)),
  };
}

function tripState(trip, ctx) {
  const next = trip.path && trip.leg < trip.path.length - 1 ? trip.path[trip.leg + 1] : null;
  const target = trip.leg + 1;
  const scanned = trip.scanned === target;
  const nextOdds = next ? Math.round(eventChance(next, trip, ctx) * (scanned ? SCAN_FACTOR : 1) * 100) : null;
  return {
    phase: trip.phase,
    at: sector(trip.path ? trip.path[trip.leg] : trip.from),
    to: sector(trip.to),
    next: sector(next),
    nextOdds,
    routes: trip.phase === 'plan' ? trip.routes.slice(0, 4).map((r) => ({ id: r.id, label: cut(r.label, 60), odds: routeOdds(r, trip, ctx) })) : [],
    mark: trip.crewMark || null,
    scanned,
    canScan: !(trip.scans || []).includes(target),
  };
}

function puzzleState(part) {
  const p = part.state;
  if (part.kind === 'cipher') {
    return {
      kind: 'cipher', length: p.length, attemptsLeft: p.attemptsLeft, symbols: p.symbols,
      guesses: p.guesses.slice(-8).map((g) => ({ code: [...g.code], exact: g.exact, near: g.near })),
      reveal: p.reveal ? { slot: p.reveal.slot, symbol: p.reveal.symbol } : null,
    };
  }
  return {
    kind: 'riddle', attemptsLeft: p.attemptsLeft, instruction: cut(p.instruction, 300),
    fragments: p.fragments.slice(0, 6).map((f) => ({ symbol: f.symbol, text: cut(f.text, 160) })),
    wrong: Boolean(p.wrong), hint: p.hint ? cut(p.hint, 200) : null,
  };
}

/**
 * The crew's screen. quest/run: the job in progress (or null on the job
 * board); save: the pilot's save; live: the pilot is flying this fight live.
 */
export function crewState({ quest = null, run = null, save, live = false }) {
  const captain = cut(save.character?.name || 'The captain', 40);
  const base = { kind: 'state', v: 1, captain, job: null, step: 'board', text: '', speaker: null, checks: [], fight: null, trip: null, puzzle: null, ended: null, hull: null, hullMax: null, log: [] };
  if (!quest || !run) return base;
  const v = view(quest, run, save);
  const out = {
    ...base,
    job: { id: quest.id, title: cut(quest.title, 80), where: cut(v.locationName, 60) },
    hull: v.hull,
    hullMax: v.hullMax,
    log: run.log.slice(-5).map((l) => cut(l, 160)),
  };
  if (run.ended) return { ...out, step: 'end', ended: { result: run.ended.result, title: cut(run.ended.title, 80) }, text: cut(v.ended?.text) };
  const ctx = { run, save };
  const on = crewFight(run);
  if (on) return { ...out, step: 'fight', fight: fightState(on.fight, live), text: cut(v.part?.card?.title || v.title) };
  const part = run.part;
  if (part?.kind === 'cipher' || part?.kind === 'riddle') return { ...out, step: 'puzzle', text: cut(v.title), puzzle: puzzleState(part) };
  const trip = crewTrip(run);
  if (trip) return { ...out, step: 'trip', trip: tripState(trip, ctx) };
  if (part) {
    const card = v.part?.card;
    return { ...out, step: part.kind === 'trip' || part.kind === 'event' ? 'event' : part.kind, text: cut(card ? `${card.title}: ${card.result || card.text}` : v.title) };
  }
  // Dialogue: the crew can take any open choice that has a check.
  return {
    ...out,
    step: 'talk',
    speaker: v.speaker ? cut(v.speaker, 40) : null,
    text: cut(v.text),
    checks: (v.choices || []).filter((c) => c.check && !c.locked).slice(0, 9).map((c) => ({
      index: c.index, label: cut(c.label, 120), stat: c.check.stat, statName: STAT_NAMES[c.check.stat] || c.check.stat, dc: c.check.dc,
    })),
  };
}
