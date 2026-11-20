// Staging data for the opening (opening B lane): what to DO for each rolled choice, and how the marauder scene plays out.
// Kept apart from the approved quest files (quests/data/slice/*.js) so the scene text is never touched; every word below that a
// player can see is a DRAFT for Donaven (READY lists them). Easy to change: it is all data.
//
// APPROACH[`${questId}/${nodeId}/${choiceIndex}`] = a rolled choice that is not a minigame, made into something you do:
//   where   the target in the node's room: { npc } | { prop } | { interact } | { zone } | { tile: [x, y] } (tile coordinates)
//   verb    the words on the button and the bar ("Check the readout")
//   baseMs  the time at a Steady roll (the roll's tier scales it: slice/assist.js)
//   tool    what a Good roll puts in your hand (words only)
//   hint    the line a hint shows ("The readout is on the nav console")
//   hand    who steps in on a Smooth roll and what they say: { who, line }
//   forces  who forces the next thing when time runs out and what they say: { who, line }
//   workScale  (optional) 0.4 = a quick job (ducking behind a console)
//   map     (optional) the room the target is in when it is not the node's own room
//   kind    (optional) 'stealth': the live stealth section (opening B outcome 5)
export const APPROACH = Object.freeze({
  // Scene 1, Third Shift
  'third-shift/brief-2/1': { where: { npc: 'tull' }, verb: 'Make your case to Tull', baseMs: 20000, tool: 'last week\'s pay slip', hint: 'Stay by Tull and keep at it.', hand: { who: 'tull', line: 'Fine, fine. Go on.' }, forces: { who: 'tull', line: 'Not now, janitor. The gym.' } },
  'third-shift/brief-2/2': { where: { zone: 'crew-board' }, verb: 'Read the crew board', baseMs: 20000, tool: 'the board\'s old notes', hint: 'The crew board is on the wall.', hand: { who: 'tull', line: 'Read the bottom row.' }, forces: { who: 'tull', line: 'Stop reading. Go and mop.' } },
  'third-shift/choice/1': { where: { interact: 'valve' }, verb: 'Fix the valve', baseMs: 26000, tool: 'a wrench from the cart', hint: 'The stuck valve is by the far wall.', hand: { who: 'pip', line: 'Hold still, I have it.' }, forces: { who: 'pip', line: 'Leave it! It is making it worse!' } },
  'third-shift/choice/2': { where: { interact: 'supply-cart' }, verb: 'Rig a squeegee', baseMs: 26000, tool: 'a roll of tape', hint: 'The supply cart has what you need.', hand: { who: 'pip', line: 'Take this. It sort of works.' }, forces: { who: 'nessa', line: 'Janitor. The floor is not drying itself.' } },
  'third-shift/choice/3': { where: { interact: 'holo-console' }, verb: 'Reset the program', baseMs: 26000, tool: 'the maintenance code', hint: 'The gym console is by the door.', hand: { who: 'pip', line: 'Code is on the back. Go.' }, forces: { who: 'pip', line: 'Do not touch that, it is warm!' } },
  // Scene 2, Visitors (the bridge)
  'visitors/bridge-3/0': { where: { interact: 'nav-console' }, verb: 'Check the readout', baseMs: 24000, tool: 'the scanner overlay', hint: 'The cutter\'s readout is on the nav console.', hand: { who: 'nessa', line: 'Patching it through to you.' }, forces: { who: 'nessa', line: 'Too slow. Eyes up, janitor.' } },
  'visitors/bridge-3/1': { where: { npc: 'tull' }, verb: 'Talk Tull down', baseMs: 20000, tool: 'a quiet word', hint: 'Stand by Tull and keep talking.', hand: { who: 'nessa', line: 'Captain. Listen to the janitor.' }, forces: { who: 'tull', line: 'No. Not listening. Mop.' } },
  'visitors/reck-chat/0': { where: { npc: 'reck' }, verb: 'Talk Reck out of the seat', baseMs: 20000, tool: 'the crew board', hint: 'Stay by Reck and keep at it.', hand: { who: 'tull', line: 'Reck, the janitor has a point. Possibly.' }, forces: { who: 'reck', line: 'Ha. No. The seat is mine.' } },
  'visitors/reck-falls/0': { where: { tile: [8.4, 1.9] }, verb: 'Get down behind the console', baseMs: 8000, workScale: 0.4, tool: 'a clear path', hint: 'The console by the window. Go, go.', hand: { who: 'nessa', line: 'Here! Behind me!' }, forces: { who: 'nessa', line: 'Down! Get down!' } },
  // Scene 3, Hold the Corridor
  'hold-the-corridor/corridor/1': { kind: 'stealth', map: 'duchess-cargo', where: { zone: 'flank-route' }, verb: 'Slip round behind them', baseMs: 45000, tool: 'a quiet route', hint: 'Keep to the crates and stay out of their cones.', hand: { who: 'nessa', line: 'I will keep them looking at the door.' }, forces: { who: 'reaver', line: 'Found you, cleaner!' } },
  'hold-the-corridor/corridor/3': { where: { zone: 'hold-line' }, verb: 'Hail them on the comm', baseMs: 20000, tool: 'the ship comm', hint: 'Hold the line and keep the channel open.', hand: { who: 'nessa', line: 'Opening the channel for you.' }, forces: { who: 'reaver', line: 'Nice try, cleaner.' } },
  // Scene 4, The Eighth Gunner
  'the-eighth-gunner/desk-2/1': { where: { interact: 'captain-desk' }, verb: 'Read the ledger', baseMs: 22000, tool: 'the desk lamp', hint: 'The ledger is on Tull\'s desk.', hand: { who: 'tull', line: 'Page four. Do not read page five.' }, forces: { who: 'tull', line: 'Hands off the ledger.' } },
  // Scene 5, Gunner's Week
  'gunners-week/gunner-seat/0': { where: { prop: 'gunner-seat' }, verb: 'Pull the arm housing', baseMs: 26000, tool: 'a wrench from the chest', hint: 'The housing is under the gunner seat.', hand: { who: 'nessa', line: 'Pass me the other end.' }, forces: { who: 'nessa', line: 'It is not fixing itself.' } },
  'gunners-week/scan-brief/0': { where: { interact: 'nav-console' }, verb: 'Scan the lane', baseMs: 24000, tool: 'a longer scan', hint: 'The scan runs from the nav console.', hand: { who: 'nessa', line: 'Widening the scan for you.' }, forces: { who: 'nessa', line: 'Lane is moving. Just look.' } },
  'gunners-week/engine-brief-2/1': { where: { interact: 'coolant' }, verb: 'Jury-rig the fitting', baseMs: 26000, tool: 'a scrap fitting', hint: 'The leaking line is by the pipes.', hand: { who: 'pip', line: 'I will hold, you screw.' }, forces: { who: 'pip', line: 'Leave it! Just leave it!' } },
  // Scene 6, Day Five
  'day-five/handover-2/0': { where: { npc: 'tull' }, verb: 'Ask Tull', baseMs: 20000, tool: 'the docking bill', hint: 'Stay by Tull and keep asking.', hand: { who: 'tull', line: 'Oh, very well.' }, forces: { who: 'tull', line: 'No. Absolutely not.' } },
  'day-five/engine-walk/0': { where: { interact: 'engine' }, verb: 'Restart the reactor', baseMs: 30000, tool: 'the restart manual', hint: 'The reactor core is in the middle of the room.', hand: { who: 'pip', line: 'Sequence is one, three, two.' }, forces: { who: 'pip', line: 'Stop! Do it my way!' } },
  'day-five/engine-walk/1': { where: { interact: 'power' }, verb: 'Rig the bypass', baseMs: 24000, tool: 'spare cable', hint: 'The conduit panel is on the right wall.', hand: { who: 'pip', line: 'Red to red. Trust me.' }, forces: { who: 'pip', line: 'That is not a bypass!' } },
  'day-five/hull-job/0': { where: { interact: 'hull' }, verb: 'Weld the plate', baseMs: 28000, tool: 'the welding torch', hint: 'The blown plate is on the left.', hand: { who: 'pip', line: 'I will hold the plate.' }, forces: { who: 'pip', line: 'Do not weld that, it is live!' } },
  'day-five/power-job/0': { where: { interact: 'engine-console' }, verb: 'Reroute the power', baseMs: 26000, tool: 'the access code', hint: 'The engine console is at the top.', hand: { who: 'pip', line: 'Code is four-four-one.' }, forces: { who: 'pip', line: 'Not that panel!' } },
});

export const approachKey = (questId, nodeId, index) => `${questId}/${nodeId}/${index}`;
export const approachSpec = (questId, nodeId, index) => APPROACH[approachKey(questId, nodeId, index)] || null;

/** The default forcing line when a spec names none. */
export const FORCED_DEFAULT = Object.freeze({ who: null, line: 'Too slow. Try something else.' });

/**
 * A spot in a compiled map for an approach target: { x, y, reach, box? } in world px, or null.
 * where: { npc } | { prop } | { interact } | { zone } | { tile: [tx, ty] }.
 */
export function targetPoint(map, where, { npcs = null } = {}) {
  if (!map || !where) return null;
  const T = map.tile || 48;
  if (where.npc) {
    const live = (npcs || map.npcs || []).find((n) => n.id === where.npc);
    return live ? { x: live.x, y: live.y, reach: T * 1.9 } : null;
  }
  if (where.prop) {
    const p = (map.props || []).find((x) => x.name === where.prop);
    return p ? { x: p.cx ?? p.x + p.w / 2, y: p.cy ?? p.y + p.h / 2, reach: T * 1.5, slack: T * 0.9, box: { x: p.x, y: p.y, w: p.w, h: p.h } } : null;
  }
  if (where.interact) {
    const i = (map.interacts || []).find((x) => x.id === where.interact);
    return i ? { x: i.x, y: i.y, reach: Math.max(T * 1.5, i.reach || 0) } : null;
  }
  if (where.zone) {
    const z = (map.zones || []).find((x) => x.id === where.zone);
    return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2, reach: 0, slack: 0, box: { x: z.x, y: z.y, w: z.w, h: z.h } } : null;
  }
  if (where.tile) return { x: (where.tile[0] + 0.5) * T, y: (where.tile[1] + 0.5) * T, reach: T * 1.1 };
  return null;
}

/** How far a point is from a target: to the edge of a prop or a zone, else to its centre. */
export function targetDistance(t, x, y) {
  if (t.box) return Math.hypot(Math.max(t.box.x - x, 0, x - (t.box.x + t.box.w)), Math.max(t.box.y - y, 0, y - (t.box.y + t.box.h)));
  return Math.hypot(t.x - x, t.y - y);
}
/** Is a point close enough to work on the target? A zone means standing in it; a prop, a step from its edge; a person or spot, arm's length. */
export const targetReached = (t, x, y) => targetDistance(t, x, y) <= (t.box ? t.slack : t.reach);

// ---- live stealth, a short taste (opening B, outcome 5) ----
// STEALTH[approachKey] = the room, the guards (rules/stealth.js: tile coordinates; path of one point + sweep = stands and looks about;
// two or more points = walks them) and the goal. The roll buys the help: a hint rings the goal, a tool shortens their cones, a hand
// calls the second Reaver away. Reach the goal unseen, or take both down from behind, in the time; an alarm or a catch fails it.
export const STEALTH = Object.freeze({
  'hold-the-corridor/corridor/1': {
    map: 'duchess-cargo',
    guards: [
      { id: 'reaver-a', path: [[10, 8], [10, 12]], mode: 'pingpong', pause: 1.6 },
      { id: 'reaver-b', path: [[15, 10]], face: 'left', sweep: 0.9 },
    ],
    goal: { tile: [10.5, 14.5], reach: 2.1, label: 'Behind them' },
  },
});
export const stealthDef = (questId, nodeId, index) => STEALTH[approachKey(questId, nodeId, index)] || null;
