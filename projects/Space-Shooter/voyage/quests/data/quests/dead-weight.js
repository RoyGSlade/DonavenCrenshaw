// Quest 3, "Dead Weight" (data only). Giver: Garrity, Dustfall Station.
// Haul in or strip a derelict before a scavenger gang does.
// Random pieces: the hulk, its loot value, the gang, the trip event, the
// breaker-panel code. Wins: salvaged parts, sold whole, shared, scraps.
// Fails: ceded, beaten, tow line snapped.
export default {
  id: 'dead-weight',
  title: 'Dead Weight',
  giver: 'garrity',
  location: 'dustfall',
  summary: 'A derelict hulk in the debris field. Strip it or tow it before the scavengers do.',
  repeatable: true,
  rolls: {
    hulk: { pick: [
      { label: 'a Guild ore freighter, gutted by something with teeth' },
      { label: 'a Warden picket ship, dark for three years' },
      { label: 'a Choir pilgrim barge, every seat still strapped' },
    ] },
    loot: { range: [70, 120] },
    gang: { enemy: 'scav' },
  },
  start: 'intro',
  nodes: {
    intro: {
      type: 'dialogue', speaker: 'Hob Garrity', portrait: 'garrity',
      text: '"Found a beauty in the field. {hulk.label}. Strip it for me or tow it in whole, I don\'t care which, but do it before every scav in the Drift smells it."',
      choices: [{ label: '"On my way."', to: 'out' }, { label: '"What\'s my cut?"', to: 'cut' }],
    },
    cut: {
      type: 'dialogue', speaker: 'Hob Garrity', portrait: 'garrity',
      text: '"Your cut is my eternal friendship and whatever doesn\'t fit in my pockets. Fine. Parts if you strip it, credits if you tow it."',
      choices: [{ label: '"Deal."', to: 'out' }],
    },
    out: { type: 'event', title: 'Into the debris field', deck: ['scav-claim', 'pod', 'distress'], chance: 0.6, next: 'hulk' },
    hulk: {
      type: 'dialogue', speaker: null,
      text: 'The hulk turns slowly in the dust: {hulk.label}. Something inside still has power. Your comms click: three taps and a pause.',
      choices: [
        { label: 'Strip it: crack the breaker panel', set: { stripping: true }, to: 'panel' },
        { label: 'Tow it whole (Constitution)', check: { stat: 'con', tag: 'repair', dc: 7, pass: 'towed', fail: 'end-snapped' } },
      ],
    },
    panel: { type: 'puzzle', kind: 'cipher', params: { title: 'Breaker panel', length: 3, symbols: 5, attempts: 5 }, outcomes: { solved: 'stripped', failed: 'botched' } },
    stripped: { type: 'dialogue', speaker: null, set: { stripped: true }, text: 'The panel clunks open. Circuits, clean scrap, and a log drive that will not stop knocking.', choices: [{ label: 'Load up.', to: 'gang' }] },
    botched: { type: 'dialogue', speaker: null, set: { botched: true }, text: 'The panel fuses. You pry out what you can with a crowbar and feelings.', choices: [{ label: 'Load what you have.', to: 'gang' }] },
    towed: { type: 'dialogue', speaker: null, set: { towed: true }, text: 'The tow line takes. The hulk follows you like a very large, very dead dog.', choices: [{ label: 'Head for the yard.', to: 'gang' }] },
    gang: {
      type: 'dialogue', speaker: '{gang.name}',
      text: '"That\'s our find, courier. We saw it first. We saw it in a dream, even."',
      choices: [
        { label: 'Fight for it.', to: 'fight' },
        { label: 'Offer them a share (Charisma)', check: { stat: 'cha', tag: 'trade', dc: 7, pass: 'end-shared', fail: 'fight' } },
        { label: 'Let them have it.', to: 'end-ceded' },
      ],
    },
    fight: { type: 'fight', mode: 'ship', title: 'Scav gang', enemy: '$gang', outcomes: { win: 'haul', parley: 'end-shared', lose: 'end-beaten', flee: 'end-ceded' } },
    haul: {
      type: 'branch',
      cases: [
        { when: { local: { towed: true } }, to: 'end-sold' },
        { when: { local: { stripped: true } }, to: 'end-salvaged' },
      ],
      else: 'end-scraps',
    },
    'end-salvaged': {
      type: 'end', result: 'success', outcome: 'salvaged', title: 'Stripped clean',
      text: 'Garrity sorts your haul like a kid at a birthday. Then he plays the log drive. The Knock, and under it a licence number. "Isn\'t that yours?"',
      reward: { items: { circuit: 2, scrap: 4 }, rep: { garrity: 10 }, skillPoints: 1, flags: { 'fragment-3': 1 } },
    },
    'end-sold': {
      type: 'end', result: 'success', outcome: 'sold-whole', title: 'Sold whole',
      text: 'Garrity pays for the hulk in actual credits, which is how you know it is valuable. Its log replays the Knock, and names the sender\'s licence. Yours.',
      reward: { money: '$loot', rep: { garrity: 8 }, skillPoints: 1, flags: { 'fragment-3': 1 } },
    },
    'end-shared': {
      type: 'end', result: 'success', outcome: 'shared', title: 'Shared',
      text: 'Half for them, half for you, and nobody gets shot. The gang boss tosses you the log drive: "Keeps knocking. Gives me the creeps."',
      reward: { money: 30, items: { scrap: 2 }, rep: { garrity: 4 }, skillPoints: 1, flags: { 'fragment-3': 1 } },
    },
    'end-scraps': {
      type: 'end', result: 'success', outcome: 'scraps', title: 'Scraps',
      text: 'It is not much, but it is yours, and the log drive is in there somewhere. It knocks.',
      reward: { items: { scrap: 2 }, rep: { garrity: 3 }, flags: { 'fragment-3': 1 } },
    },
    'end-ceded': {
      type: 'end', result: 'failure', outcome: 'ceded', title: 'Ceded',
      text: 'You watch the gang tow away Garrity\'s beauty. He takes the news well, by which we mean he only throws one wrench.',
      reward: { rep: { garrity: -4 } },
    },
    'end-beaten': {
      type: 'end', result: 'failure', outcome: 'beaten', title: 'Beaten',
      text: 'The gang leaves you drifting and takes the hulk. Garrity tows you in himself and does not charge you, which is worse.',
      reward: { rep: { garrity: -6 } },
    },
    'end-snapped': {
      type: 'end', result: 'failure', outcome: 'snapped', title: 'Tow line snapped',
      text: 'The line parts with a twang you feel in your teeth. The hulk drifts off into the dust, still knocking.',
      reward: { rep: { garrity: -2 } },
    },
  },
};
