// The slice director (launch slice lane, 2026-11-16): runs the opening on the Tin Duchess. It does four small things:
//   - starts it: a fresh save opened with ?newgame=1 becomes the janitor in the mess (wantsSlice, startSlice);
//   - hands out the six scenes one after the other (advance), so a failed scene still moves the story on;
//   - wraps the quest presenter so a beat plays in its room: where the story moves you it fades you there (a "cut"), and
//     where a step begins it waits for you to walk there (the tracker marker leads the way);
//   - runs an on-foot fight in the room the fight node names (the live shooter on the Duchess's own floor).
// The rules (which scene, walk or cut) are pure and live in ./rules.js. All words come from the quest data.
import { QUESTS } from '../quests/data/quests/index.js';
import { storyOf } from '../story/progress.js';
import { nextScene, sliceStarted, SLICE_FLAG, START_ROOM, roomOf, arriveMode, activeScene, markerFor } from './rules.js';
import { markerPoint, markerReach } from './places.js';
import { placeName } from './places.js';
import { castFor } from './presenceNames.js';

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
export function createSliceDirector({ store, jobs, toast = () => {}, world, fightIn, presence = null, busy = () => false, handsOn = null }) {
  let pending = null; // a beat waiting for the player to walk into its room: { room, node, play }
  let cutting = null; // a fade in progress: { room, resolve }
  let waitingCast = false; // a beat is waiting for people to walk into its room
  let beatAt = 0; // when the last beat was handed to the director (the auto-resume leaves a beat that is still starting alone)
  const here = () => world()?.map?.id || null;

  /** Fade to a room and resolve once the player is standing in it. */
  function cutTo(room) {
    return new Promise((resolve) => {
      if (here() === room) { resolve(); return; }
      cutting = { room, resolve };
      world().go(room, 'default');
    });
  }

  /** The world entered a map (hooks.entered): finish a cut, or start the beat that was waiting for this room. */
  function entered(map) {
    if (cutting && cutting.room === map.id) { const c = cutting; cutting = null; c.resolve(); return; }
    if (pending && pending.room === map.id) { const p = pending; pending = null; setTimeout(p.play, 450); }
  }

  /** A dialogue beat of a scene: play it here, fade to its room, or wait for the player to walk to it. */
  function beat(v, play0, pick) {
    const quest = QUESTS[v.quest?.id];
    // A hands-on node (scene 1's valve, hose, mop and lever) shows no dialogue: the player does it in the room (slice/handsOnPlay.js).
    const node = quest?.nodes?.[v.node];
    if (node?.handsOn && handsOn && pick) play0 = () => handsOn.begin(v, pick, node); // track C swaps the beat; track A still waits for its cast below
    const room = roomOf(quest, v.node);
    // Opening track A: the people this beat needs walk to its room (through doors, at walking speed); it plays once they are in it.
    beatAt = Date.now();
    const cast = presence ? presence.arrange(quest.id, v.node) : null;
    const play = () => {
      if (!cast?.needs.length || presence.ready(cast.needs, room)) { play0(); return; }
      toast(`${castFor(presence.late(cast.needs, room))} on the way.`);
      waitingCast = true;
      presence.whenReady(cast.needs, room).then(() => setTimeout(() => { waitingCast = false; if (here() === room) play0(); else pending = { room, node: v.node, play: play0 }; }, 500));
    };
    if (!room || here() === room) { pending = null; play(); return; }
    if (arriveMode(quest, v.node) === 'cut') { pending = null; cutTo(room).then(() => setTimeout(play, 350)); return; }
    pending = { room, node: v.node, play };
    toast(`Head to ${placeName(room) || room}.`);
  }

  /** A result card: it shows in the room its ending names (a fade there first when the player is elsewhere). */
  function endCard(v, show) {
    const room = roomOf(QUESTS[v.quest?.id], v.node);
    if (!room || here() === room) { show(); return; }
    cutTo(room).then(() => setTimeout(show, 350));
  }

  /** An on-foot fight node: the shooter runs in the room it names, then its result goes back to the engine. */
  function fight(part, done) {
    const setup = part?.live?.setup;
    if (!setup?.map || !fightIn) { done(null); return; }
    cutTo(setup.map).then(() => setTimeout(async () => {
      try {
        const r = await fightIn(setup);
        done({ outcome: r.outcome, hp: r.hp });
      } catch (error) { console.warn('Stardust: the slice fight failed', error); done(null); }
    }, 500));
  }

  /** Hand out the next scene when none is running. Returns true when one started. */
  function advance() {
    const save = store.get();
    if (!sliceStarted(save) || jobs.playing) return false;
    const id = nextScene(save);
    if (!id) return false;
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
    return jobs.resume();
  }

  return { beat, endCard, fight, entered, advance, afterCard, boot, watch, snooze, handsOn, get pendingRoom() { return pending?.room || null; } };
}
