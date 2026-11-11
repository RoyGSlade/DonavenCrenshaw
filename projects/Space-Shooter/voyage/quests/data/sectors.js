// The Drift sector map: Stardust's five circuits as places (Driftwake concept).
// x/y are 0..1 positions for drawing the map. danger is the chance of a random
// event when you arrive in that sector on a trip. deck names the event cards
// that can show up there (./events.js).
export const SECTORS = Object.freeze({
  alpha: { name: 'Alpha Relay', faction: 'relay-guild', blurb: 'Guild heartland. Busy lanes, checkpoints, tea.', danger: 0.15, x: 0.12, y: 0.66, deck: ['toll', 'distress', 'pod'] },
  beacon: { name: 'Beacon Prime', faction: 'relay-guild', blurb: 'The market beacon. Bounty board, brokers, the richest contracts.', danger: 0.25, x: 0.34, y: 0.3, deck: ['toll', 'pod', 'distress', 'ambush'] },
  dustfall: { name: 'Dustfall Station', faction: 'driftborn', blurb: 'Driftborn scrapyards in a debris field.', danger: 0.4, x: 0.55, y: 0.74, deck: ['scav-claim', 'pod', 'ambush', 'distress'] },
  nether: { name: 'Nether Crossing', faction: 'ember-syndicate', blurb: 'Syndicate gravity wells and ambush lanes.', danger: 0.6, x: 0.66, y: 0.28, deck: ['ambush', 'gate-flicker', 'distress'] },
  veil: { name: 'Iron Veil', faction: 'hollow-choir', blurb: 'The dead Warden gate, where the Choir listens.', danger: 0.5, x: 0.88, y: 0.56, deck: ['choir-song', 'gate-flicker', 'ambush'] },
});

// Two-way jump lanes.
export const LANES = Object.freeze([
  ['alpha', 'beacon'], ['alpha', 'dustfall'], ['beacon', 'dustfall'], ['beacon', 'nether'],
  ['dustfall', 'nether'], ['dustfall', 'veil'], ['nether', 'veil'],
]);
