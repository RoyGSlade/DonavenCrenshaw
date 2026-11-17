// The opening slice: six scenes, played in this order (launch slice lane, 2026-11-16). The slice director
// (voyage/slice/director.js) hands them out one after the other; none is on a job board and no giver lists them.
// Each file is converted from a scene draft (lhc-lanes/stardust/launch/slice/tools/convert.mjs); the words are Donaven's to change.
import thirdShift from './third-shift.js';
import visitors from './visitors.js';
import holdTheCorridor from './hold-the-corridor.js';
import theEighthGunner from './the-eighth-gunner.js';
import gunnersWeek from './gunners-week.js';
import dayFive from './day-five.js';

export const SLICE_LIST = Object.freeze([thirdShift, visitors, holdTheCorridor, theEighthGunner, gunnersWeek, dayFive]);
export const SLICE_ORDER = Object.freeze(SLICE_LIST.map((q) => q.id));
