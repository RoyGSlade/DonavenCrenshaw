// Playtest links that start at a later scene of the opening: ?newgame=1&chapter=4 plays scenes 1 to 3 through the real quest engine
// (good-path picks, each mini-game a win) and starts the game at scene 4, so Donaven can test one chunk without replaying the start.
// Pure: no DOM. boot.js applies it once and drops the parameter from the address.
import { startQuest, act, view } from '../quests/engine.js';
import { SLICE_LIST } from '../quests/data/slice/index.js';

/** Each scene's picks (label starts, or { mini: 'win' }) and the ending node they must reach. */
export const CHAPTER_PLANS = Object.freeze({
  'third-shift': [['Where is this gym?', 'Start cleaning.', 'Fix the leaking valve.'], 'end-source-fixed-end'],
  visitors: [["Check the cutter's readout.", 'Keep your eyes on the cutter.', 'Grab the helm rail'], 'end-warned'],
  'hold-the-corridor': [['Hack the inner airlock door', { mini: 'win' }], 'end-sealed-end'],
  'the-eighth-gunner': [['Haggle for a bigger share.', { mini: 'win' }], 'end-hired-well-end'],
  'gunners-week': [['Patch the line', { mini: 'win' }], 'end-steady-end'],
});

/** The chapter number from a link (2 to 6), or null. */
export function chapterOf(value) {
  const n = Number.parseInt(value, 10);
  return n >= 2 && n <= SLICE_LIST.length ? n : null;
}

/** One scene played to its planned ending; the new save, or null when no seed reaches it. */
function playOne(quest, save, [picks, end]) {
  for (let seed = 1; seed < 300; seed++) {
    let { run, save: sv } = startQuest(quest, save, { seed, now: 1 });
    const queue = [...picks];
    let ok = true;
    for (let g = 0; g < 80 && !run.ended; g++) {
      const v = view(quest, run, sv);
      let a;
      if (v.minigame) { queue.shift(); a = { type: 'minigame', branch: 'win', xp: 0, skill: v.choices[v.minigame.index].check.skill }; }
      else {
        const open = v.choices.filter((c) => !c.locked);
        const p = open.length === 1 ? open[0] : open.find((c) => typeof queue[0] === 'string' && c.label.startsWith(queue[0]));
        if (!p) { ok = false; break; }
        if (open.length > 1) queue.shift();
        a = { type: 'choose', index: p.index };
      }
      const n = act(quest, run, sv, a, { now: 1 });
      if (n.error) { ok = false; break; }
      run = n.run; sv = n.save;
    }
    if (ok && run.ended && run.node === end) return sv;
  }
  return null;
}

/** The save with every scene before `chapter` played; throws when a plan no longer reaches its ending (the quest text changed). */
export function playedTo(save, chapter) {
  let out = { ...save, quests: { ...(save.quests || {}), active: {} } };
  for (const quest of SLICE_LIST.slice(0, chapter - 1)) {
    const plan = CHAPTER_PLANS[quest.id];
    const next = plan && playOne(quest, out, plan);
    if (!next) throw new Error(`chapter start: could not play ${quest.id}`);
    out = next;
  }
  return out;
}
