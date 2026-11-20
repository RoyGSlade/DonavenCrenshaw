// Plain words for Docking: the live HUD words, the end line, the card title and the dockmaster's lines. Pure, no digits, no names from
// the world (the base's and the ship's names come in as records). The voice lines are drafts for Donaven: they show as words on
// screen now, and `id` is what ctx.sound('line:<id>') is asked for so a voice can be dropped in later.
import { OUTCOMES } from './model.js';

const ORDINAL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const berthWord = (n) => ORDINAL[n] || 'next';

/** The dockmaster's four lines. `berth` is the berth number. */
export const LINES = Object.freeze({
  approach: { id: 'dockmaster.approach', who: 'Dockmaster', emotion: 'dry', text: (berth) => `Berth ${berthWord(berth)}'s lit. Bring her in slow.` },
  scrape: { id: 'dockmaster.scrape', who: 'Dockmaster', emotion: 'grumpy', text: () => "That's my paint you're wearing." },
  clean: { id: 'dockmaster.clean', who: 'Dockmaster', emotion: 'warm', text: () => 'Clamps on. Welcome home.' },
  wavedOff: { id: 'dockmaster.waved-off', who: 'Dockmaster', emotion: 'deadpan', text: () => "Kill your engines. I'm sending the tug." },
});

/** What the dockmaster says when the run ends. A scruffy dock gets the scrape line; a clean one gets the warm line. */
export const endLine = (r) => (r.outcome === OUTCOMES.wavedOff ? LINES.wavedOff : r.clean ? LINES.clean : LINES.scrape);

export function endWords(r) {
  if (r.outcome === OUTCOMES.docked) return r.clean ? 'Clamped. A clean dock.' : r.hullLost >= 25 ? 'Clamped, but the hull took a beating.' : 'Clamped, with a few scrapes on the hull.';
  return 'The lights went out. A tug brought you in.';
}
export function tryWords(r) {
  if (r.outcome === OUTCOMES.wavedOff) return 'Get into the lit corridor sooner, and follow it round';
  if (r.hullLost > 0) return 'Stay inside the lit walls and ease off before the berth';
  return '';
}
export const gradeWord = (r) => (r.outcome !== OUTCOMES.docked ? 'waved off' : r.perfect ? 'perfect dock' : r.clean ? 'clean dock' : r.success ? 'scraped in' : 'rough dock');

/** One plain line about the scrape just taken. */
export const scrapeWords = (kind) => (kind === 'wall' ? 'Scraped the wall: stay inside the lit lane.'
  : kind === 'fast' ? 'Too fast at the berth. Ease off and come round again.'
    : kind === 'face' ? 'You hit the hull beside the berth. Line up first.'
      : 'Too fast and off the berth. Line up, then ease off.');

/** Hull as a word. */
export const hullLevel = (lost) => (lost <= 0 ? 'sound' : lost < 25 ? 'scuffed' : 'damaged');

/** The closing speed against the berth, as a gauge fraction (the safe zone is the first third) and a word. */
export const GAUGE_SPAN = 3;
export const safeMark = () => 1 / GAUGE_SPAN;
export const speedFill = (v, safe) => Math.max(0, Math.min(1, Math.max(0, v) / (safe * GAUGE_SPAN)));
export const speedWord = (v, safe) => (v <= safe * 0.5 ? 'gentle' : v <= safe ? 'safe' : 'too fast');
export const speedTone = (v, safe) => (v <= safe ? 'ok' : v <= safe * 2 ? 'warn' : 'bad');
