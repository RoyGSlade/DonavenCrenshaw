// Stand-in lines so the on-foot preview plays before the story lane's lines
// land. The story lane owns every real line (say(lineId), ROUND2-CONTRACT.md);
// pages that pass hooks.talk never use these.
export const STAND_IN = Object.freeze({
  chibby: [{ who: 'chibby', text: "There's my captain! Ship's fuelled, coffee's not. Have a walk round, get your legs." }],
  ralph: [{ who: 'ralph', name: 'Ralph', text: '(Ralph sniffs your boots, sneezes, and wags at the ore slab.)' }],
  mel: [{ who: 'mel', text: "You're standing in my light. Range is that way. Shoot the drones, not my crates." }],
  edna: [{ who: 'edna', text: "Power's back, door's open, and you're in my den. Lovely. Touch nothing you can't pay for." }],
  hask: [{ who: 'hask', text: 'Courier. Sit. The tea is terrible and the lane is worse. Let me tell you about both.' }],
  vey: [{ who: 'vey', text: 'You flew all this way for a favour, captain. Good. I collect those.' }],
  garrity: [{ who: 'garrity', text: "Mind the scrap, it bites. You're the new one Chibby keeps going on about." }],
  tea: [{ who: 'captain', name: 'Tea machine', text: 'It dispenses something brown and warm. Hask drinks four of these a shift. That explains a lot.' }],
  jukebox: [{ who: 'captain', name: 'Jukebox', text: 'Every track is a sad freighter ballad. Someone has scratched DO NOT PLAY 7 into the glass.' }],
  vending: [{ who: 'captain', name: 'Vending machine', text: 'Out of everything except Nebula Crunch, which nobody has ever bought on purpose.' }],
  bar: [{ who: 'captain', name: 'The bar', text: "The barkeep slides you a glass of something blue. 'On the house. The house is on fire, but still.'" }],
  galley: [{ who: 'captain', name: 'Galley', text: 'Three ration bars, one hot sauce, and a note from Chibby: EAT SOMETHING GREEN.' }],
  nav: [{ who: 'captain', name: 'Nav console', text: 'The Drift, in blue lines. Alpha, Beacon, Dustfall. Further out, the Veil, which the chart marks: no.' }],
  holo: [{ who: 'captain', name: 'Holo-table', text: "A map of who owes whom across the Drift. Your name is on it. Small. For now." }],
  scrap: [{ who: 'captain', name: 'Scrap pile', text: 'Half a drive coil, a hatch with teeth marks, and a garden gnome. Garrity has filed the gnome as "rare".' }],
  'lane-traffic': [{ who: 'captain', name: 'Lane traffic board', text: 'Forty ships inbound, three flagged amber. The Relay Guild runs on tea and paranoia.' }],
  console: [{ who: 'captain', name: 'You', text: 'Lights blink. Numbers scroll. Nothing here needs you yet.' }],
  repair: [{ who: 'captain', name: 'You', text: 'All green. Your crew patches this mid-fight when something breaks.' }],
});
