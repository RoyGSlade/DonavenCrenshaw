// Quest 4, "Black Lane" (data only). Giver: Hask. Out to Nether Crossing.
// Clear a raider ambush, then deal with the lieutenant flying Warden war-tech:
// fight him, talk him down, or chase him through a race leg.
// Random pieces: the ambush point, the wave raider, the lieutenant (an ace with
// two rolled abilities), the trip events.
export default {
  id: 'black-lane',
  title: 'Black Lane',
  giver: 'hask',
  location: 'alpha',
  summary: 'Clear the raider ambush off the Nether Crossing lane.',
  repeatable: true,
  rolls: {
    point: { pick: ['the gravity wells', 'the old gate pylons', 'the ice shoal'] },
    wave: { enemy: 'raider' },
    lieutenant: { enemy: 'ace' },
  },
  start: 'intro',
  nodes: {
    intro: {
      type: 'dialogue', speaker: 'Stationmaster Hask', portrait: 'hask',
      text: '"Syndicate raiders have shut the Nether lane at {point}. Their lieutenant flies something with an amber eye on the nose that I don\'t like. Clear the lane. Bring me the eye if you can."',
      choices: [{ label: '"Clearing lanes is what I do."', to: 'trip' }],
    },
    trip: { type: 'travel', title: 'Out to the Black Lane', to: 'nether', risk: 0, outcomes: { arrived: 'wave-hail' } },
    'wave-hail': {
      type: 'dialogue', speaker: '{wave.name}',
      text: 'A picket raider peels away from {point} to meet you. "Lane\'s closed, courier."',
      choices: [{ label: 'Open it.', to: 'wave' }],
    },
    wave: { type: 'fight', mode: 'ship', title: 'Picket raider', enemy: '$wave', outcomes: { win: 'lieutenant', parley: 'lieutenant', lose: 'end-towed', flee: 'end-turned-back' } },
    lieutenant: {
      type: 'dialogue', speaker: '{lieutenant.name}',
      text: 'The lieutenant drifts out of {point}. On his nose an amber eye turns to look at you, and your comms click: three taps and a pause. "Turn around, courier. Last time I ask nicely."',
      choices: [
        { label: 'Fight him.', to: 'duel' },
        { label: '"Take a message to your warlord instead." (Charisma)', check: { stat: 'cha', tag: 'talk', dc: 9, pass: 'end-message', fail: 'duel' } },
        { label: 'Read the eye: it is listening, not looking. Answer it.', requires: { stats: { wis: 5 } }, to: 'eye' },
      ],
    },
    eye: {
      type: 'dialogue', speaker: '{lieutenant.name}',
      text: 'You tap the Knock back. The amber eye flares, and the lieutenant\'s ship lurches as if something inside it just woke up. He bolts for the wells.',
      choices: [{ label: 'Chase him.', to: 'chase' }],
    },
    duel: { type: 'fight', mode: 'ship', title: 'The lieutenant', enemy: '$lieutenant', outcomes: { win: 'end-cleared', parley: 'end-message', lose: 'end-towed', flee: 'end-turned-back' } },
    chase: { type: 'race', track: 'abandoned-mall', rival: { name: 'Red Kestrel', pace: { pick: [0.88, 0.92] } }, outcomes: { win: 'end-caught', lose: 'end-cleared' } },
    'end-cleared': {
      type: 'end', result: 'success', outcome: 'cleared', title: 'Lane cleared',
      text: 'The lane is open. In the lieutenant\'s wreck, or where he was, you find a Warden relic: an amber eye, still warm, tuned to the Knock.',
      reward: { money: 90, rep: { hask: 10 }, skillPoints: 1, flags: { 'fragment-4': 1 } },
    },
    'end-caught': {
      type: 'end', result: 'success', outcome: 'caught-him', title: 'Caught him',
      text: 'You run him down in the wells and he surrenders the eye with both hands. "Take it. It never shuts up." It knocks in your palm.',
      reward: { money: 110, rep: { hask: 12 }, skillPoints: 1, flags: { 'fragment-4': 1, 'amber-eye': 1 } },
    },
    'end-message': {
      type: 'end', result: 'success', outcome: 'message', title: 'Sent a message',
      text: 'He goes, and the lane goes with him. Before he jumps he sends you a file: the eye\'s recording. The Knock, and a licence number. Hask, later: "I said clear the lane, not make friends. ...It\'s clear though."',
      reward: { money: 60, rep: { hask: 6 }, skillPoints: 1, flags: { 'fragment-4': 1, 'spared-lieutenant': 1 } },
    },
    'end-towed': {
      type: 'end', result: 'failure', outcome: 'towed', title: 'Towed back',
      text: 'A Guild tug hauls you home with your hull open to the stars. Hask pays for the tow and writes it on the note.',
      reward: { money: -30, rep: { hask: -3 } },
    },
    'end-turned-back': {
      type: 'end', result: 'failure', outcome: 'turned-back', title: 'Turned back',
      text: 'You make it out. The lane stays shut. Hask looks at the map for a long time.',
      reward: { rep: { hask: -2 } },
    },
  },
};
