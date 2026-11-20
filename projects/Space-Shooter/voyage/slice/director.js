// The slice director (launch slice lane, 2026-11-16): runs the opening on the Tin Duchess. It does four small things:
//   - starts it: a fresh save opened with ?newgame=1 becomes the janitor in the mess (wantsSlice, startSlice);
//   - hands out the six scenes one after the other (advance), so a failed scene still moves the story on;
//   - wraps the quest presenter so a beat plays in its room: where a step begins it waits for you to walk there (the tracker
//     marker leads the way); any other beat plays where you stand. There are no hard cuts (opening B): nothing fades or teleports
//     the player, except the time skips between days (slice/cuts.js TIME_SKIPS);
//   - runs an on-foot fight where the player is (the live shooter on the Duchess's own floor), the enemies coming in by a door
//     when the fight's own room is another one.
// The rules (which scene, walk or cut) are pure and live in ./rules.js. All words come from the quest data.
import { QUESTS } from '../quests/data/quests/index.js';
import { storyOf } from '../story/progress.js';
import { nextScene, sliceStarted, SLICE_FLAG, START_ROOM, roomOf, arriveMode, activeScene } from './rules.js';
import { placeName } from './places.js';
import { skipLine, fightHere, spawnAt } from './cuts.js';
import { approachSpec, approachKey } from './staging.js';
import { approachFor, verdictWords } from './assist.js';
import { createRetry } from './retry.js';
import { SWITCHES } from './switches.js';

const CHECKPOINT_KEY = 'stardust.opening.checkpoint.v1';

/** Should this page open the Duchess? A fresh save with the new game on (not a Studio link, not ?start=hangar), or a save that began it. */
export function wantsSlice({ save, params, throwaway = false, newGame = true }) {
  if (!newGame || throwaway || params?.get?.('start') === 'hangar' || params?.get?.('crew')) return false; // a crew invite link is the hangar's crew seat, not the opening
  return sliceStarted(save) || !save?.character;
}

/** Begin the opening on this save: the janitor (a name, a captain look, stats rolled quietly), no credits, no tutorial. */
export function startSlice(store) {
  if (sliceStarted(store.get())) return;
  if (!store.get().character) store.createCharacter({ name: 'Janitor', look: { portrait: 'p1', color: '#81e6df' } });
  store.update((s) => ({ ...s, money: 0, items: {}, flags: { ...s.flags, [SLICE_FLAG]: 1 }, story: { ...storyOf(s), step: null, finished: true, skipped: true } }));
}

/** The room to open in: where the scene in progress is, else where the next scene begins, else the pad. */
export function startRoom(save) {
  const id = activeScene(save) || nextScene(save);
  if (!id) return 'duchess-pad';
  const quest = QUESTS[id];
  const run = save?.quests?.active?.[id];
  return roomOf(quest, run?.node || quest.start) || START_ROOM;
}

/**
 * store, jobs (voyage/jobs.js), toast(text). world(): the on-foot world. fightIn(setup): the live shooter in the current
 * room (onfoot.fight). Returns { beat, fight, entered, advance, boot, pendingRoom }.
 */
export function createSliceDirector({ store, jobs, toast = () => {}, world, fightIn, stager = null, runner = null, retryScreen: retryIn }) {
  const snapshots = new Map(); // scene id -> the save as it was when the scene began (the retry point)
  const retryScreen = !SWITCHES.retryOnDeath ? null : retryIn !== undefined ? retryIn : typeof document !== 'undefined' ? createRetry({ onRetry: () => retryScene() }) : null;
  let reopen = null;
  let leftover = null; // after live stealth: where the guards stood { map, guards: [{ x, y, down }], quiet, aware } // a beat whose approach was given up: it comes back as its choices only, not the whole line again
  let starting = false; // a time skip is fading through black before the next scene starts
  let pending = null; // a beat waiting for the player to walk into its room: { room, node, play }
  const here = () => world()?.map?.id || null;

  /** The world entered a map (hooks.entered): start the beat that was waiting for this room. */
  function entered(map) {
    if (pending && pending.room === map.id) { const p = pending; pending = null; setTimeout(p.play, 450); }
  }

  /** A dialogue beat of a scene: where a step begins it waits for the player to walk there; every other beat plays where they stand. */
  function beat(v, play) {
    const quest = QUESTS[v.quest?.id];
    const room = roomOf(quest, v.node);
    const again = reopen === approachKey(v.quest?.id, v.node, '');
    if (again) reopen = null;
    const playIt = (opts) => play({ ...(opts || {}), ...(again ? { choicesOnly: true } : {}) });
    const go = stager?.stagerOf(v, playIt) || playIt;
    if (!room || here() === room) { pending = null; go(); return; }
    if (arriveMode(quest, v.node) === 'walk') {
      pending = { room, node: v.node, play: go };
      toast(`Head to ${placeName(room) || room}.`);
      return;
    }
    pending = null;
    go(); // used to fade and teleport here; the beat now plays where the player is
  }

  // ---- approaches (outcome 3): a rolled choice that is something you do ----
  /** Which choices of this beat are approaches: { [index]: spec }. Minigame choices keep their game (the roll sets its tier already). */
  function approachSpecs(v) {
    const out = {};
    if (!SWITCHES.approaches) return out;
    for (const c of v.choices || []) if (c.check && !c.minigame) { const spec = approachSpec(v.quest?.id, v.node, c.index); if (spec) out[c.index] = spec; }
    return out;
  }
  const wantsApproach = (v, index) => Boolean(SWITCHES.approaches && runner && approachSpec(v.quest?.id, v.node, index) && v.choices?.find((c) => c.index === index && c.check && !c.minigame));
  /** Words under the die for a roll that is waiting to be played out. */
  function assistVerdict(questId, node, assist) {
    const spec = approachSpec(questId, node, assist.index) || {};
    return verdictWords(approachFor(assist.attempt, spec));
  }
  /** Play an approach: the roll's help and time, a bar, a target. done({ branch }). */
  function approach(v, done) {
    const spec = approachSpec(v.quest?.id, v.node, v.assist.index) || {};
    const a = approachFor(v.assist.attempt, spec);
    runner.run({ spec, approach: a, label: v.choices.find((c) => c.index === v.assist.index)?.label || '', key: approachKey(v.quest?.id, v.node, v.assist.index) }, (r) => {
      if (r.branch === 'abandon') reopen = approachKey(v.quest?.id, v.node, '');
      leftover = r.stealth && r.branch !== 'abandon' ? { ...r.stealth, aware: r.branch === 'fail' } : null;
      done(r);
    });
  }

  /** A result card: it shows where the player stands (it used to fade them to the ending's room first). */
  function endCard(v, show) { if (!stager?.endHook(v, show)) show(); }

  /** The door the enemies come in by: the one toward the fight's own room, else the first door. */
  function doorFor(w, target) {
    const doors = w.map.doors || [];
    const d = doors.find((x) => x.to === target) || doors[0] || null;
    return d ? { x: d.x, y: d.y, w: d.w, h: d.h } : null;
  }

  /** The setup a fight runs with: where the player stands, never a yank to a spawn point; another room's fight comes in by the door. */
  function setupFor(setup) {
    const w = world();
    if (!w) return setup;
    const p = w.position();
    const angle = w.player?.angle ?? 0;
    const base = w.map.id === setup.map ? { ...setup, spawn: spawnAt(p, angle) } : null;
    if (leftover && leftover.map === w.map.id) {
      // After live stealth the same Reavers fight: where the guards stood, awake if they caught you, with their backs turned if you got round.
      const alive = leftover.guards.filter((g) => !g.down);
      const here = fightHere({ ...setup, enemies: setup.enemies }, { map: w.map, player: { x: p.x, y: p.y, angle }, doorBox: doorFor(w, setup.map) });
      const enemies = here.enemies.map((e, i) => (alive[i] ? { ...e, x: alive[i].x, y: alive[i].y, angle: alive[i].angle, awake: leftover.aware } : e)).slice(0, Math.max(alive.length, 0) || here.enemies.length);
      leftover = null;
      return { ...here, enemies };
    }
    if (base) return base;
    return fightHere(setup, { map: w.map, player: { x: p.x, y: p.y, angle }, doorBox: doorFor(w, setup.map) });
  }

  /** An on-foot fight node: the shooter runs where the player is, then its result goes back to the engine. Going down ends the run: retry. */
  function fight(part, done) {
    const setup = part?.live?.setup;
    if (!setup?.map || !fightIn) { done(null); return; }
    if (leftover?.quiet && world()?.map?.id === leftover.map) { leftover = null; toast('Both Reavers are down and quiet.'); done({ outcome: 'win', hp: null }); return; }
    setTimeout(async () => {
      try {
        stager?.mood('combat');
        const r = await fightIn(setupFor(setup));
        if (r.outcome === 'lose' && retryScreen) { stager?.mood('danger'); retryScreen.show(); return; }
        stager?.mood('danger');
        done({ outcome: r.outcome, hp: r.hp });
      } catch (error) { console.warn('Stardust: the slice fight failed', error); done(null); }
    }, 350);
  }

  // ---- retry: death ends the run; the scene starts again from its first beat ----
  /** Remember the save as the scene begins (in memory and in this browser, so a reload keeps the retry point). */
  function checkpoint(id) {
    const snap = structuredClone(store.get());
    snapshots.set(id, snap);
    try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ scene: id, save: snap })); } catch { /* private window: in-memory only */ }
  }
  function checkpointOf(id) {
    if (snapshots.has(id)) return snapshots.get(id);
    try { const c = JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); if (c?.scene === id && c.save) return c.save; } catch { /* none */ }
    return null;
  }
  /** Restore the scene's start and play it again, through a fade (a restart is a time skip). */
  function retryScene() {
    const id = activeScene(store.get());
    const snap = id && checkpointOf(id);
    const w = world();
    if (!id || !snap) { toast('Nothing to retry from.'); return; }
    stager?.reset();
    const again = () => { store.update(() => snap); jobs.restart(QUESTS[id]); };
    if (w?.skip) w.skip({ room: roomOf(QUESTS[id], QUESTS[id].start) || START_ROOM, caption: '', holdMs: 500 }).then(again); else again();
  }

  /** Hand out the next scene when none is running. Returns true when one started. A scene that opens a new day fades through black first. */
  function advance() {
    const save = store.get();
    if (!sliceStarted(save) || jobs.playing) return false;
    if (starting) return true;
    const id = nextScene(save);
    if (!id) return false;
    stager?.reset();
    const line = skipLine(id);
    const w = world();
    if (line && w?.skip) {
      starting = true;
      w.skip({ room: startRoom(save), caption: line }).then(() => { starting = false; checkpoint(id); jobs.take(QUESTS[id]); });
      return true;
    }
    checkpoint(id);
    return jobs.take(QUESTS[id]);
  }

  /** A result card was closed: the next scene starts, or the opening is over. */
  function afterCard() {
    if (advance()) return;
    const save = store.get();
    if (sliceStarted(save) && !nextScene(save) && !jobs.playing) toast("That's the opening. Berth 7 leads on to Chibby's hangar.");
  }

  /** On page load: pick the scene in progress back up, else start the next one. */
  function boot() {
    if (!sliceStarted(store.get())) return;
    if (jobs.playing) jobs.resume(); else advance();
  }

  return { runner, stager, retryScene, retryScreen, beat, endCard, fight, approachSpecs, wantsApproach, assistVerdict, approach, entered, advance, afterCard, boot, get pendingRoom() { return pending?.room || null; } };
}
