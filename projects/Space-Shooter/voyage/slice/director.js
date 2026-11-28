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
import { nextScene, sliceStarted, SLICE_FLAG, START_ROOM, roomOf, arriveMode, activeScene, markerFor } from './rules.js';
import { markerPoint, markerReach } from './places.js';
import { placeName } from './places.js';
import { castFor } from './presenceNames.js';
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
 * room (onfoot.fight). presence (optional, slice/presenceRun.js): the crew ledger; a beat waits for the people it needs to walk in.
 * busy(): a dialogue, card or full screen is up (the auto-resume stays out of its way). Returns { beat, fight, entered, advance, boot, pendingRoom, watch, snooze }.
 */
/** The toast when a scene of the opening starts: its title and its first goal, the same words the tracker shows. */
export function sceneToast(quest) {
  const goal = quest?.steps?.[0]?.text;
  return goal ? `${quest.title}: ${goal}` : quest?.title || '';
}

export function createSliceDirector({ store, jobs, toast = () => {}, world, fightIn, presence = null, busy = () => false, handsOn = null, stager = null, runner = null, retryScreen: retryIn }) {
  const snapshots = new Map(); // scene id -> the save as it was when the scene began (the retry point)
  const retryScreen = !SWITCHES.retryOnDeath ? null : retryIn !== undefined ? retryIn : typeof document !== 'undefined' ? createRetry({ onRetry: () => retryScene() }) : null;
  let reopen = null;
  let leftover = null; // after live stealth: where the guards stood { map, guards: [{ x, y, down }], quiet, aware } // a beat whose approach was given up: it comes back as its choices only, not the whole line again
  let starting = false; // a time skip is fading through black before the next scene starts
  let pending = null; // a beat waiting for the player to walk into its room: { room, node, play }
  let cutting = null; // a fade in progress: { room, resolve }
  let waitingCast = false; // a beat is waiting for people to walk into its room
  let beatAt = 0; // when the last beat was handed to the director (the auto-resume leaves a beat that is still starting alone)
  const here = () => world()?.map?.id || null;

  /** The world entered a map (hooks.entered): start the beat that was waiting for this room. */
  function entered(map) {
    if (pending && pending.room === map.id) { const p = pending; pending = null; setTimeout(p.play, 450); }
  }

  /** A dialogue beat of a scene: where a step begins it waits for the player to walk there; a beat that needs people waits for them in its room (track A); any other beat plays where the player stands (track B). */
  function beat(v, play0, pick) {
    const quest = QUESTS[v.quest?.id];
    // A hands-on node (scene 1's valve, hose, mop and lever) shows no dialogue: the player does it in the room (slice/handsOnPlay.js).
    const node = quest?.nodes?.[v.node];
    if (node?.handsOn && handsOn && pick) play0 = () => handsOn.begin(v, pick, node); // track C swaps the beat; track A still waits for its cast below
    const room = roomOf(quest, v.node);
    // Track B: a beat whose approach was given up comes back as its choices only; a staged beat runs its stager.
    const again = reopen === approachKey(v.quest?.id, v.node, '');
    if (again) reopen = null;
    const playIt = (opts) => play0({ ...(opts || {}), ...(again ? { choicesOnly: true } : {}) });
    const staged = stager?.stagerOf(v, playIt) || playIt;
    // Track A: the people this beat needs walk to its room (through doors, at walking speed); it plays once they are in it.
    beatAt = Date.now();
    const cast = presence ? presence.arrange(quest.id, v.node) : null;
    const go = (opts) => {
      if (!cast?.needs.length || presence.ready(cast.needs, room)) { staged(opts); return; }
      toast(`${castFor(presence.late(cast.needs, room))} on the way.`);
      waitingCast = true;
      presence.whenReady(cast.needs, room).then(() => setTimeout(() => { waitingCast = false; if (here() === room) staged(); else pending = { room, node: v.node, play: staged }; }, 500));
    };
    if (!room || here() === room) { pending = null; go(); return; }
    // Nobody teleports (track B). A beat that begins a step, or needs people who are in its room, waits for the player to walk there.
    if (arriveMode(quest, v.node) === 'walk' || cast?.needs.length) {
      pending = { room, node: v.node, play: go };
      toast(`Head to ${placeName(room) || room}.`);
      return;
    }
    pending = null;
    go(); // needs nobody elsewhere: it plays where the player is
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
    const again = () => { store.update(() => snap); jobs.restart(QUESTS[id], { toast: sceneToast(QUESTS[id]) }); };
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
      w.skip({ room: startRoom(save), caption: line }).then(() => { starting = false; checkpoint(id); jobs.take(QUESTS[id], { toast: sceneToast(QUESTS[id]) }); });
      return true;
    }
    checkpoint(id);
    return jobs.take(QUESTS[id], { toast: sceneToast(QUESTS[id]) });
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
    presence?.restore(store.get());
    if (jobs.playing) jobs.resume(); else advance();
  }

  // Opening track A, outcome 5: a scene never waits for a button. A beat the player stepped away from ("Later") picks itself up when they
  // walk back to its marker (a person: talk to them, as before; a zone or a thing: step up to it), and the tracker has no Continue.
  let snoozed = null; // { room, away } set when the player said Later: wait until they have left the marker's reach, then come back
  function snooze() { beatAt = Date.now(); const save = store.get(); const id = activeScene(save); const quest = id && QUESTS[id]; snoozed = quest ? { away: false } : null; }
  let lastWatch = 0;
  /** Call about 4 times a second. Resumes a paused scene when the player is standing at its marker. */
  function watch(now = Date.now()) {
    if (now - lastWatch < 250) return false;
    lastWatch = now;
    const w = world();
    if (!w || !jobs.playing || pending || cutting || waitingCast || busy() || w.mode !== 'walk' || w.held) return false;
    const save = store.get();
    const id = activeScene(save);
    const run = id && save.quests.active[id];
    const m = run && markerFor(QUESTS[id], run);
    if (!m || w.map.id !== m.map) { if (snoozed) snoozed.away = true; return false; }
    const at = m.npc ? w.npcAt(m.npc) : markerPoint(w.map, m);
    if (!at) return false;
    const p = w.position();
    const near = Math.hypot(at.x - p.x, at.y - p.y) <= markerReach(w.map, m) * (m.npc ? 1.5 : 1.8);
    if (snoozed) { if (!near) snoozed.away = true; if (!snoozed.away || !near) return false; snoozed = null; }
    else if (!near) return false;
    if (now - beatAt < 4000) return false; // a beat that has only just been handed over is still starting
    lastWatch = now + 2500; // give the beat time to start before looking again
    return resumeOnce(now);
  }
  // One resume for both ways back into a paused scene (track A's marker watch, track B's talk range): a second call within 3 s is ignored,
  // so the same beat is never shown twice.
  let lastResume = 0;
  function resumeOnce(now = Date.now()) { if (now - lastResume < 3000) return false; lastResume = now; snoozed = null; return jobs.resume(); }

  return { runner, stager, retryScene, retryScreen, beat, endCard, fight, approachSpecs, wantsApproach, assistVerdict, approach, entered, advance, afterCard, boot, watch, snooze, resumeOnce, handsOn, get pendingRoom() { return pending?.room || null; } };
}
