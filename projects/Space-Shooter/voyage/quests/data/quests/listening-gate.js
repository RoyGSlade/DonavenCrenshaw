// Quest 5, "The Listening Gate" (data only). Giver: Vey. Out to Iron Veil.
// Carry a gate key to the dead Warden gate. The four-glyph riddle guards it
// (the parked seal riddle, with a rolled order and a rolled rule). The Choir
// is there: talk past them, fight them, or let them open it for you.
export default {
  id: 'listening-gate',
  title: 'The Listening Gate',
  giver: 'vey',
  location: 'beacon',
  summary: 'Carry a gate key to the old fortress-gate at Iron Veil and open it.',
  rolls: {
    riddle: { mode: { pick: ['reverse', 'same'] } },
    choir: { enemy: 'choir' },
    mood: { pick: ['singing', 'silent'] },
  },
  start: 'intro',
  nodes: {
    intro: {
      type: 'dialogue', speaker: 'Lucan Vey', portrait: 'vey',
      text: '"A gate key. Warden make. A buyer wants the Iron Veil gate opened and does not want to be seen opening it. You, however, love being seen." He smiles. "The Choir will be there. They always are."',
      choices: [{ label: 'Take the key.', to: 'trip' }],
    },
    trip: { type: 'travel', title: 'To the Iron Veil', to: 'veil', risk: 0.1, outcomes: { arrived: 'choir' } },
    choir: {
      type: 'branch',
      cases: [{ when: { roll: { mood: 'singing' } }, to: 'choir-singing' }],
      else: 'choir-silent',
    },
    'choir-singing': {
      type: 'dialogue', speaker: 'A Choir acolyte',
      text: 'Violet lanterns ring the gate. The Choir is singing, one slow chord, and it stops when you arrive. "Courier. We wondered when."',
      choices: [
        { label: '"Let me through. I\'m expected, apparently." (Wisdom)', check: { stat: 'wis', tag: 'talk', dc: 7, pass: 'gate', fail: 'choir-fight' } },
        { label: 'Push past them.', to: 'choir-fight' },
        { label: '"You open it, then."', to: 'end-choir-opened' },
      ],
    },
    'choir-silent': {
      type: 'dialogue', speaker: 'A Choir acolyte',
      text: 'The Choir watches you dock in perfect silence. Nobody blocks the gate. Nobody needs to: the lanterns are aimed at your ship.',
      choices: [
        { label: 'Walk to the gate as if you own it (Charisma)', check: { stat: 'cha', tag: 'talk', dc: 8, pass: 'gate', fail: 'choir-fight' } },
        { label: 'Hum the Knock as you pass', requires: { flags: { 'fragment-1': 1 } }, to: 'gate' },
        { label: '"You open it, then."', to: 'end-choir-opened' },
      ],
    },
    'choir-fight': { type: 'fight', mode: 'ship', title: 'Choir lanterns', enemy: '$choir', outcomes: { win: 'gate', parley: 'gate', lose: 'end-driven-off', flee: 'end-driven-off' } },
    gate: { type: 'riddle', params: { title: 'The Iron Veil seal', mode: '$riddle.mode', attempts: 3 }, outcomes: { solved: 'end-opened', failed: 'end-locked' } },
    'end-opened': {
      type: 'end', result: 'success', outcome: 'opened', title: 'The gate answers',
      text: 'The seal turns. Beyond it is not a lane but a voice, patient as stone: three taps, a pause, and then your licence number, read out loud. "Courier, you are expected."',
      reward: { money: 120, rep: { vey: 10 }, skillPoints: 1, flags: { 'fragment-5': 1 } },
    },
    'end-choir-opened': {
      type: 'end', result: 'success', outcome: 'choir-opened', title: 'The Choir opens it',
      text: 'The Choir sings the seal open in one breath. Vey\'s buyer will not be pleased that it was seen. The voice beyond says your number anyway.',
      reward: { money: 60, rep: { vey: -5 }, skillPoints: 1, flags: { 'fragment-5': 1, 'choir-opened': 1 } },
    },
    'end-locked': {
      type: 'end', result: 'failure', outcome: 'locked', title: 'Locked out',
      text: 'The seal goes dark and stays dark. The key goes back to Vey, who refunds nothing and remembers everything.',
      reward: { rep: { vey: -3 } },
    },
    'end-driven-off': {
      type: 'end', result: 'failure', outcome: 'driven-off', title: 'Driven off',
      text: 'The lanterns burn you off the gate. The key is still in your hold, cold now.',
      reward: { rep: { vey: -2 } },
    },
  },
};
