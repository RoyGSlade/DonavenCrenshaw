// The hangar's minigame sheet (scenes 3, 4 and 5): a station-style sheet that opens beside the floor while a hooked choice's
// minigame is played, then closes and hands the result back to the quest player. The quest player calls
// presenter.minigame(spec, done) with spec { block, attempt, seed } (quests/ui/player.js); this file is the page's answer.
//   root: #hg-minigame (a .hg-sheet), eyebrow / title / stage: its parts.
//   character(): the captain (levels and points set the setup, the d20 sets the tier).
// The sheet is the frame (the games drop their own, minigames-skin.css), a haggle sizes to its content (is-fit).
import { startHook } from './sceneHook.js';
import { playHook } from './playHook.js';
import { tierInfo } from './setup.js';

const KIND_WORD = { repair: 'REPAIR', hack: 'BYPASS', haggle: 'HAGGLE' };

export function createMinigameSheet({ root, eyebrow, title, stage, character = () => null, reducedMotion = () => false, sound = () => {}, onChange = () => {} }) {
  let open = false;
  function show(on, kind = '') {
    open = on;
    root.hidden = !on;
    root.classList.toggle('is-fit', on && kind === 'haggle');
    document.body.classList.toggle('hg-sheet-open', on);
    if (on) document.body.dataset.sheetSide = 'right'; else delete document.body.dataset.sheetSide;
    onChange(on);
  }
  /** Play the hooked choice's minigame; calls done({ branch, xp, skill, result }) once the player closes its result. */
  async function play(spec, done) {
    const start = startHook({ minigame: spec.block, check: { pass: 'x', fail: 'y' } }, spec.attempt, character());
    eyebrow.textContent = `${KIND_WORD[start.kind] || 'GAME'} · ${tierInfo(start.tier).label.toUpperCase()} ROLL`;
    title.textContent = spec.block.title || spec.block.who || 'Minigame';
    stage.replaceChildren();
    show(true, start.kind);
    let result;
    try { result = await playHook(stage, { start, seed: spec.seed, sound, reducedMotion }); }
    catch (error) {
      // A minigame that cannot run must never trap the scene: fall back to the d20's own tier (rough or better wins).
      console.warn('Stardust: the minigame could not run, the roll stands', error);
      result = { branch: start.tier >= 0 ? 'win' : 'lose', xp: 0, skill: spec.block.kind === 'repair' ? 'repair' : spec.block.kind === 'hack' ? 'hacking' : 'social' };
    }
    stage.replaceChildren();
    show(false);
    done(result);
  }
  return { play, get open() { return open; } };
}
