// The slice director (launch slice lane, 2026-11-16): runs the opening on the Tin Duchess. It does four small things:
//   - starts it: a fresh save opened with ?newgame=1 becomes the janitor in the mess (wantsSlice, startSlice);
//   - hands out the six scenes one after the other (advance), so a failed scene still moves the story on;
//   - wraps the quest presenter so a beat plays in its room: where the story moves you it fades you there (a "cut"), and
//     where a step begins it waits for you to walk there (the tracker marker leads the way);
//   - runs an on-foot fight in the room the fight node names (the live shooter on the Duchess's own floor).
// The rules (which scene, walk or cut) are pure and live in ./rules.js. All words come from the quest data.
import { QUESTS } from '../quests/data/quests/index.js';
import { storyOf } from '../story/progress.js';
import { nextScene, sliceStarted, SLICE_FLAG, START_ROOM, roomOf, arriveMode, activeScene } from './rules.js';
import { placeName } from './places.js';

/** Should this page open the Duchess? A fresh save with the new game on (not a Studio link, not ?start=hangar), or a save that began it. */
export function wantsSlice({ save, params, throwaway = false, newGame = true }) {
  if (!newGame || throwaway || params?.get?.('start') === 'hangar') return false;
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
export function createSliceDirector({ store, jobs, toast = () => {}, world, fightIn }) {
  let pending = null; // a beat waiting for the player to walk into its room: { room, node, play }
  let cutting = null; // a fade in progress: { room, resolve }
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
  function beat(v, play) {
    const quest = QUESTS[v.quest?.id];
    const room = roomOf(quest, v.node);
    if (!room || here() === room) { pending = null; play(); return; }
    if (arriveMode(quest, v.node) === 'cut') { pending = null; cutTo(room).then(() => setTimeout(play, 350)); return; }
    pending = { room, node: v.node, play };
    toast(`Head to ${placeName(room) || room}.`);
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
    if (jobs.playing) jobs.resume(); else advance();
  }

  return { beat, fight, entered, advance, afterCard, boot, get pendingRoom() { return pending?.room || null; } };
}
