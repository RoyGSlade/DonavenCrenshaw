// Quest 1, "Cold Run" (the slice quest). Giver: Hask. Alpha Relay to Beacon Prime.
// Story: STORY-OUTLINE.md "The Knock", quest 1. Lines are drafts for Donaven.
//
// Random pieces: the cargo, the pay, how the raiders play it (setup), the
// raider (hp, movement, ability), the trip's events, the tamper-seal code.
// Two ways to win: quiet (nobody touched you) or loud (you fought).
// Three ways to fail: the core is lost, handed over, or wiped by its seal.
export default {
  id: 'cold-run',
  title: 'Cold Run',
  giver: 'hask',
  location: 'alpha',
  summary: 'Fly a sealed data core from Alpha Relay to Beacon Prime. Raiders can smell it.',
  repeatable: true,
  rolls: {
    cargo: { pick: [
      { label: 'a sealed data core', short: 'core' },
      { label: 'a lead-lined Warden memory core', short: 'memory core' },
      { label: 'a data core in a scorched Guild case', short: 'core' },
    ] },
    pay: { range: [70, 95] },
    setup: { pick: ['waiting', 'tailing', 'decoy'] },
    raider: { enemy: 'raider' },
  },
  start: 'intro',
  nodes: {
    intro: {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask',
      text: 'You\'re the courier with the debt. Good. Debts make people punctual. I need {cargo.label} at Beacon Prime. Don\'t open it, don\'t sell it, and if it starts humming, don\'t hum back. {pay} credits on delivery.',
      choices: [
        { label: '"I\'ll take it."', to: 'depart' },
        { label: '"What\'s really in it?"', check: { stat: 'wis', tag: 'scan', dc: 7, pass: 'intro-knows', fail: 'intro-shrug' } },
        { label: '"Half up front, Stationmaster."', check: { stat: 'cha', tag: 'trade', dc: 8, pass: 'intro-advance', fail: 'intro-no' } },
      ],
    },
    'intro-knows': {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask', set: { knows: true },
      text: 'He looks at you a long second. "Every courier on a dead channel has heard it. Three taps and a pause. This thing does it too. The Beacon wants to know why. So do I."',
      choices: [{ label: '"Three taps and a pause. Got it."', to: 'depart' }],
    },
    'intro-shrug': {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask',
      text: '"It\'s cargo. You\'re a courier. That\'s the whole poem."',
      choices: [{ label: '"Fair enough."', to: 'depart' }],
    },
    'intro-advance': {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask', onEnter: { money: 30 },
      text: 'He slides thirty credits across the desk like they owe him money. "Thirty now. The rest when it gets there. If it gets there."',
      choices: [{ label: 'Pocket it.', to: 'depart' }],
    },
    'intro-no': {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask',
      text: '"Half up front. That\'s funny. Write that one down, I\'ll use it at the next budget meeting."',
      choices: [{ label: '"Worth a try."', to: 'depart' }],
    },
    depart: {
      type: 'dialogue', speaker: null,
      text: 'The core goes into the hold. It is warm to the touch, warmer than it should be. Beacon Prime is one jump if you go straight, two if you go round by the scrapyards.',
      choices: [{ label: 'Plot the jump.', to: 'trip' }],
    },
    trip: { type: 'travel', title: 'The run', to: 'beacon', risk: 0.15, outcomes: { arrived: 'setup' } },
    setup: {
      type: 'branch',
      cases: [
        { when: { roll: { setup: 'waiting' } }, to: 'ambush-waiting' },
        { when: { roll: { setup: 'tailing' } }, to: 'ambush-tailing' },
      ],
      else: 'ambush-decoy',
    },
    'ambush-waiting': {
      type: 'dialogue', speaker: '{raider.name}',
      text: 'Amber running lights wait on the Beacon approach. An open channel crackles: "Courier. Drop the core and you keep the ship. Final offer, first offer."',
      choices: [
        { label: 'Guns hot.', to: 'fight' },
        { label: 'Kill the lights and slip past (Dexterity)', check: { stat: 'dex', tag: 'nav', dc: 8, pass: 'dock-quiet', fail: 'fight' } },
        { label: '"This is Guild cargo. You want the Guild on you?" (Charisma)', check: { stat: 'cha', tag: 'talk', dc: 8, pass: 'dock-quiet', fail: 'fight' } },
        { label: 'Name the debt their boss owes Hask', requires: { stats: { cha: 5 } }, to: 'dock-quiet' },
        { label: 'Tap the Knock back on an open channel', requires: { local: { knows: true } }, lockedHint: 'You would have to know what the cargo does', to: 'spooked' },
        { label: 'Vent two scrap as a decoy', cost: { items: { scrap: 2 } }, to: 'dock-quiet' },
        { label: '"Fine. Take it."', to: 'handover' },
      ],
    },
    'ambush-tailing': {
      type: 'dialogue', speaker: null,
      text: 'A {raider.name} has been on your six since the gate. It is not even trying to hide.',
      choices: [
        { label: 'Turn and fight.', to: 'fight' },
        { label: 'Outrun it to the dock (Dexterity)', check: { stat: 'dex', tag: 'nav', dc: 7, pass: 'dock-quiet', fail: 'fight' } },
        { label: 'Tap the Knock back on an open channel', requires: { local: { knows: true } }, lockedHint: 'You would have to know what the cargo does', to: 'spooked' },
        { label: 'Hail it and hand the core over.', to: 'handover' },
      ],
    },
    'ambush-decoy': {
      type: 'dialogue', speaker: 'Beacon traffic',
      text: '"Courier, hold at pad nineteen." Pad nineteen is at the dark end of the ring, where the lights have been out for a year.',
      choices: [
        { label: '"Something\'s off. Give me another pad." (Wisdom)', check: { stat: 'wis', tag: 'scan', dc: 7, pass: 'dock-quiet', fail: 'fight' } },
        { label: 'Take pad nineteen.', to: 'fight' },
      ],
    },
    spooked: {
      type: 'dialogue', speaker: '{raider.name}',
      text: 'Three taps. A pause. The channel goes very quiet. Then: "...Where did you hear that?" The amber lights drift back and let you pass.',
      choices: [{ label: 'Dock before they change their minds.', to: 'dock-quiet' }],
    },
    fight: { type: 'fight', mode: 'ship', title: 'Raider fight', enemy: '$raider', outcomes: { win: 'dock-loud', lose: 'end-lost', flee: 'fled', parley: 'dock-quiet' } },
    fled: {
      type: 'dialogue', speaker: null, set: { loud: true },
      text: 'You lose them in the Beacon traffic. But the core took a knock when you broke off, and its tamper seal is blinking red.',
      choices: [{ label: 'Re-key the seal before customs scans it.', to: 'seal' }],
    },
    'dock-loud': {
      type: 'dialogue', speaker: null, set: { loud: true },
      text: 'You dock with scorch marks and a {raider.name} drifting in pieces behind you. The fight tripped the core\'s tamper seal: it is blinking red.',
      choices: [{ label: 'Re-key the seal before customs scans it.', to: 'seal' }],
    },
    seal: { type: 'puzzle', kind: 'cipher', title: 'Tamper seal', params: { title: 'Tamper seal', length: 4, symbols: 5, attempts: 6 }, outcomes: { solved: 'end-loud', failed: 'end-wiped' } },
    'dock-quiet': {
      type: 'dialogue', speaker: null,
      text: 'You slide into the Beacon dock without a scratch. As the clamps take the ship, the core in your hold hums: three taps and a pause. Then again.',
      choices: [{ label: 'Hand it to the Beacon\'s receiving clerk.', to: 'end-quiet' }],
    },
    handover: {
      type: 'dialogue', speaker: '{raider.name}',
      text: '"Smart courier." A tractor beam pulls the core out of your hold. A credit chit follows it, spinning. "For your trouble. Tell Hask we said hello."',
      choices: [{ label: 'Take the chit and fly home.', to: 'end-handover' }],
    },
    'end-quiet': {
      type: 'end', result: 'success', outcome: 'quiet', title: 'Delivered quiet',
      text: 'Hask on the relay: "Not a scratch? Who are you and what have you done with my courier?" He pays in full. Before the line drops he adds, "The Beacon says it hummed when you docked. Like it knew the place."',
      reward: { money: '$pay', rep: { hask: 12 }, skillPoints: 1, flags: { 'fragment-1': 1 } },
    },
    'end-loud': {
      type: 'end', result: 'success', outcome: 'loud', title: 'Delivered loud',
      text: 'The seal goes green. The Beacon pays, and Garrity\'s people pay you again for the raider scrap. Hask: "Loud, but there. I\'ll take there." The core hums the Knock all the way into the vault.',
      reward: { money: '$pay', items: { scrap: 2 }, rep: { hask: 6 }, skillPoints: 1, flags: { 'fragment-1': 1 } },
    },
    'end-lost': {
      type: 'end', result: 'failure', outcome: 'core-lost', title: 'Core lost', followUp: 'cold-run',
      text: 'A Guild tug finds you drifting. The raiders have the core. Hask adds it to your note and, after a long silence, offers you the next run anyway. "Cheaper this time. For me."',
      reward: { rep: { hask: -5 } },
    },
    'end-handover': {
      type: 'end', result: 'failure', outcome: 'handed-over', title: 'Handed over',
      text: 'Forty credits richer, one stationmaster poorer. Hask does not shout. Hask writes something down.',
      reward: { money: 40, rep: { hask: -12 }, flags: { 'sold-the-core': 1 } },
    },
    'end-wiped': {
      type: 'end', result: 'failure', outcome: 'core-wiped', title: 'Core wiped',
      text: 'The seal cooks the core with a smell like burnt toast. The Beacon pays nothing. Hask: "At least nobody else has it either."',
      reward: { rep: { hask: -3 } },
    },
  },
};
