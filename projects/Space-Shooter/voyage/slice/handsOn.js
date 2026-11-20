// Scene 1 (Third Shift) is a chain of real actions (opening track C). The rules here are pure: no DOM, no clock.
//
//   The scene's engine nodes are the beats, one node each, in this order:  valve -> hose -> mop -> lever  (then a branch picks
//   the ending). A node with `"handsOn": "<beat>"` shows no dialogue box: the player does the beat with their hands in the room
//   (slice/handsOnPlay.js), and the result picks the node's choice (the engine moves on, saves and resumes as for any node).
//   What a beat changes lives in save flags (`s1-*`), so the room's props follow it and a reload keeps it.
//
//   beatOf(node)                 the beat a node is
//   chainOf(flags)               the chain as plain facts: valve, hose, mess, mop, head, mopped
//   whyNot(beat, task, chain)    a hint line when a thing is used out of order (null when it may be used now)
//   after*(flags, result)        the flag patch a finished game makes, and the node choice to pick
//   endingOf(chain, lever)       which ending the chain leads to
export const BEATS = Object.freeze(['valve', 'hose', 'mop', 'lever']);
export const NODE_OF = Object.freeze({ valve: 'work-valve', hose: 'work-hose', mop: 'work-mop', lever: 'work-lever' });
export const START_NODE = 'choice'; // the old pick-a-way-out node: the director picks the hands-on way in for the player

/** The flags the chain keeps. */
export const FLAG = Object.freeze({
  valveFixed: 's1-valve-fixed', valveLost: 's1-valve-lost', valveShut: 's1-valve-shut',
  hoseFixed: 's1-hose-fixed', hoseLost: 's1-hose-lost',
  mess: 's1-mess', held: 's1-mop-held', fromCart: 's1-mop-cart', headLoose: 's1-head-loose', headAbsorber: 's1-head-absorber',
  mopped: 's1-mopped', lever: 's1-lever-done',
});

/** How much floor each loss floods (mess points; a point is two more puddles to mop). */
export const MESS = Object.freeze({ valveLost: 3, valveShut: 1, hoseLost: 2 });

export const beatOf = (node) => (node && typeof node.handsOn === 'string' && BEATS.includes(node.handsOn) ? node.handsOn : null);

/** The chain as plain facts, from the save's flags. */
export function chainOf(flags = {}) {
  const f = (k) => Boolean(flags?.[k]);
  return {
    valve: f(FLAG.valveFixed) ? 'fixed' : f(FLAG.valveShut) ? 'shut' : f(FLAG.valveLost) ? 'lost' : null,
    hose: f(FLAG.hoseFixed) ? 'fixed' : f(FLAG.hoseLost) ? 'lost' : null,
    mess: Math.max(0, Math.trunc(flags?.[FLAG.mess]) || 0),
    held: f(FLAG.held), fromCart: f(FLAG.fromCart),
    head: f(FLAG.headAbsorber) ? 'absorber' : f(FLAG.headLoose) ? 'loose' : 'plain',
    mopped: f(FLAG.mopped), lever: f(FLAG.lever),
  };
}

/** Pip's hints for a thing used out of order, and what a finished beat says about itself. The words are DRAFT lines (opening-c/DESIGN.md). */
export const LINES = Object.freeze({
  start: Object.freeze({
    valve: 'Right, the wheel is the big one on the bottom pipe. Tighten it, fill the tank, do not let it go over.',
    hose: 'The coolant hose on the left wall has a pinhole. Close every open end or it sprays.',
    mop: "Floor next. There's a mop by the cart, or check the cart itself.",
    lever: 'Now the program. The big lever on the panel. Pull it down and hold it. Wait for the hum to die. Then back up.',
  }),
  valve: Object.freeze({
    fixed: "Foam's stopped! You did that with your hands. I'm going to write it down.",
    lost: 'Oh no. Oh, that is a lot of foam. Okay. Okay! More mopping. That is fine. That is a lifestyle.',
    shut: "Shut. It's shut. The wellness foam is offline and so is my pride.",
  }),
  hose: Object.freeze({
    fixed: "Coolant's holding. Don't tell the hose I said nice things.",
    lost: 'It sprayed the whole floor. Silver slick. Mop it.',
  }),
  mop: Object.freeze({
    done: 'That is a floor. A real floor. I forgot it was grey.',
    cartLook: "Supply cart: two mops, a squeegee, a bucket and a box of absorber heads. The label says 'DO NOT'. Nothing else.",
    cartTake: 'You take a mop from the cart.',
    looseTake: 'You pick up the mop that is leaning by the cart.',
    have: 'You already have a mop.',
    need: 'You need something to mop with. A mop by the cart, or check the cart.',
    upgradePrompt: 'Fit an absorber head on the mop? Plain heads just push slime around.',
    upgradeGood: 'The absorber head bites. This will lift slime fast.',
    upgradeLoose: 'The head sits loose, but it is better than plain.',
    upgraded: 'The mop already has an absorber head.',
  }),
  lever: Object.freeze({
    pass: "And she's back! Reset. Clean. Look at that jungle.",
    fried: "You pushed it back too soon, the surge went right through the projector. Well. It's not the jungle's fault.",
    warn: 'Too soon! The lights are going crazy. Again, and hold it longer.',
  }),
  order: Object.freeze({
    valve: 'Valve first. Otherwise you are mopping a waterfall.',
    hose: 'Hose next, before the floor.',
    mop: 'Mop before the lever, please. The lever sparks.',
    done: (what) => `${what} is done.`,
  }),
  before: Object.freeze({
    valve: 'A foam valve, stuck open.',
    hose: 'A coolant hose with a pinhole.',
    cart: 'A janitor cart. Not today.',
    goo: 'Goo.',
    lever: 'A power panel with a big lever.',
  }),
  labels: Object.freeze({
    valve: 'Foam valve: stuck open', hose: 'Coolant hose: leaking', cart: 'Supply cart: mops, squeegee, bucket',
    mop: 'Mop (leaning on the cart)', goo: 'Goo: mop it up', lever: 'Power panel: holodeck lever',
  }),
  steps: Object.freeze({ valve: 'Tighten the foam valve', hose: 'Patch the coolant hose', mop: 'Mop up the goo', lever: 'Reset the holodeck with Pip' }),
});

const WHAT = Object.freeze({ valve: 'The valve', hose: 'The hose', mop: 'The floor', lever: 'The lever' });
const TASK_BEAT = Object.freeze({ valve: 'valve', hose: 'hose', cart: 'mop', 'mop-loose': 'mop', goo: 'mop', lever: 'lever' });
export const beatOfTask = (task) => TASK_BEAT[task] || null;

/**
 * Why a thing cannot be used right now, as one of Pip's lines, or null when it can. `beat` is the beat the scene is on (null when
 * the chain has not begun or is over). Out of order is a hint, never a dead end: nothing is spent.
 */
export function whyNot(beat, task) {
  const want = TASK_BEAT[task];
  if (!want) return null;
  if (!beat) return LINES.before[task === 'mop-loose' ? 'cart' : task] || null;
  if (want === beat) return null;
  const i = BEATS.indexOf(beat), j = BEATS.indexOf(want);
  if (j < i) return LINES.order.done(WHAT[want]);
  return LINES.order[beat] || null;
}

// --- what a finished game does -------------------------------------------------------------------

/** The valve game's result ({ success, valveShut }): the flag patch and the node choice (0 fixed, 1 lost). */
export function afterValve(flags, result) {
  const c = chainOf(flags);
  if (result?.success) return { flags: { [FLAG.valveFixed]: 1 }, choice: 0, line: LINES.valve.fixed, mess: 0 };
  const shut = Boolean(result?.valveShut);
  const add = shut ? MESS.valveShut : MESS.valveLost;
  return { flags: { [FLAG.valveLost]: 1, ...(shut ? { [FLAG.valveShut]: 1 } : {}), [FLAG.mess]: c.mess + add }, choice: 1, line: shut ? LINES.valve.shut : LINES.valve.lost, mess: add };
}

/** The hose game's result ({ success }): the flag patch and the node choice (0 fixed, 1 lost). */
export function afterHose(flags, result) {
  const c = chainOf(flags);
  if (result?.success) return { flags: { [FLAG.hoseFixed]: 1 }, choice: 0, line: LINES.hose.fixed, mess: 0 };
  return { flags: { [FLAG.hoseLost]: 1, [FLAG.mess]: c.mess + MESS.hoseLost }, choice: 1, line: LINES.hose.lost, mess: MESS.hoseLost };
}

/** Taking a mop, from the loose one or from the cart. */
export function takeMop(flags, from) {
  if (chainOf(flags).held) return { flags: {}, line: LINES.mop.have, took: false };
  return { flags: { [FLAG.held]: 1, ...(from === 'cart' ? { [FLAG.fromCart]: 1 } : {}) }, line: from === 'cart' ? LINES.mop.cartTake : LINES.mop.looseTake, took: true };
}

/** The screw game's grade (0..100) at the cart: a snug head is the absorber, a rough one is loose (still better than plain). */
export function afterUpgrade(flags, result) {
  if (chainOf(flags).head === 'absorber') return { flags: {}, line: LINES.mop.upgraded, head: 'absorber' };
  if (result?.success) return { flags: { [FLAG.headAbsorber]: 1 }, line: LINES.mop.upgradeGood, head: 'absorber' };
  if (chainOf(flags).head === 'loose') return { flags: {}, line: LINES.mop.upgradeLoose, head: 'loose' };
  return { flags: { [FLAG.headLoose]: 1 }, line: LINES.mop.upgradeLoose, head: 'loose' };
}

/** The mop game finished: the floor is clean. Choice 0 of the mop node. */
export function afterMop() { return { flags: { [FLAG.mopped]: 1 }, choice: 0, line: LINES.mop.done }; }

/** The lever game's result ({ success }): choice 0 (reset, on to the ending) or 1 (projector fried). */
export function afterLever(result) {
  return result?.success ? { flags: { [FLAG.lever]: 1 }, choice: 0, line: LINES.lever.pass } : { flags: {}, choice: 1, line: LINES.lever.fried };
}

/** Which ending the chain leads to once the lever has worked: the foam valve fixed, or both losses, or the floor by hand. */
export function endingOf(flags, leverOk = true) {
  if (!leverOk) return 'end-projector-fried';
  const c = chainOf(flags);
  if (c.valve === 'fixed') return 'end-source-fixed';
  if (c.valve && c.hose === 'lost') return 'end-slimed';
  return 'end-clean';
}

/** The seeds the games use, steady across a retry (a left game gives the same board again). */
export const seedOf = (run, beat) => (((Number(run?.seed) || 1) * 31 + BEATS.indexOf(beat) * 7919 + 13) >>> 0) || 1;
