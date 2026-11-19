// The Cut station's stand-in game (social lane): the real Cut mini-game is the crafting chain's (v2 plan, section 4.2). Until it
// lands this station only says how wide the line is, and pins the want when you do not have the good cutter. Pure.
import { WORN_CUT, GOOD_CUT, ITEMS } from '../people/index.js';

/** How wide the cut line is: 15 with the good cutter, 9 with the worn bench cutter. */
export const cutWidth = (state) => (state.items?.['good-cutter'] ? GOOD_CUT : WORN_CUT);

/** What the station says, and the want it pins. { lines, pin, width }. */
export function cutStation(state) {
  const width = cutWidth(state);
  const holding = Boolean(state.items?.['good-cutter']);
  return {
    width, pin: holding ? null : 'good-cutter',
    lines: holding
      ? [`${ITEMS['good-cutter'].name}: ${GOOD_CUT} wide.`, 'The line is easy to follow. (Stand-in: the real Cut game comes with crafting.)']
      : [`Worn cutter: ${WORN_CUT} wide. The good cutter cuts ${GOOD_CUT} wide.`, 'Pip has a good one.', '(Stand-in: the real Cut game comes with crafting.)'],
  };
}
