// Quest 2, "The Railgun Paper Trail" (data only). Giver: Vey, Beacon Prime.
// Donaven's item-quest example: get a railgun by stealing it, by bureaucracy,
// or by building it from mined ore and procured tools (Garrity's yard).
// Random pieces: the warehouse, the guards, the clerk (and whether a bribe
// works), the fee, the missing part, the courier rival in the race.
export default {
  id: 'railgun-paper-trail',
  title: 'The Railgun Paper Trail',
  giver: 'vey',
  location: 'beacon',
  summary: 'The lanes need railguns. Steal one, file for one, or build one.',
  rolls: {
    warehouse: { pick: ['Bonded Warehouse 9', 'the Tollgate Annex', 'Depot Kappa'] },
    guards: { enemy: 'guards' },
    clerk: { pick: [
      { name: 'Clerk Pellam', kind: 'by-the-book', tell: 'has three pens, all aligned' },
      { name: 'Clerk Osei', kind: 'bribable', tell: 'keeps glancing at your credit chit' },
      { name: 'Clerk Brannagh', kind: 'bored', tell: 'is building a tower out of rejected forms' },
    ] },
    fee: { range: [35, 60] },
    part: { pick: [{ label: 'a coil stack' }, { label: 'a barrel liner' }, { label: 'a capacitor bank' }] },
    rival: { name: { pick: ['Guild Express', 'a Syndicate runner', 'the Beacon mail drone'] }, pace: { pick: [0.86, 0.9, 0.94] } },
    scav: { enemy: 'scav' },
  },
  start: 'intro',
  nodes: {
    intro: {
      type: 'dialogue', speaker: 'Lucan Vey', portrait: 'vey',
      text: '"The Guild wants railguns for lane defence and cannot buy one, because the Guild wrote the rule that says nobody can buy one. You, however, are nobody. Three ways in, captain. Pick the one that suits your conscience."',
      choices: [
        { label: '"Where is one kept?" (steal it)', to: 'steal-plan' },
        { label: '"Who signs for one?" (file the paperwork)', to: 'office' },
        { label: '"What is one made of?" (build it)', to: 'build-travel' },
      ],
    },

    // Route 1: steal it.
    'steal-plan': {
      type: 'dialogue', speaker: 'Lucan Vey', portrait: 'vey',
      text: '"{warehouse}. One railgun, crated, waiting for a requisition that will never come. {guards.name} on the door."',
      choices: [
        { label: 'Go in through the vents (Dexterity)', check: { stat: 'dex', tag: 'dodge', dc: 8, pass: 'vault', fail: 'guards' } },
        { label: 'Walk in with a forged manifest (Charisma)', check: { stat: 'cha', tag: 'talk', dc: 8, pass: 'vault', fail: 'guards' } },
        { label: 'Wave your Guild permit at them', requires: { items: { permit: 1 } }, to: 'vault' },
      ],
    },
    guards: { type: 'fight', mode: 'foot', title: 'Warehouse guards', enemy: '$guards', dc: 7, outcomes: { win: 'vault', lose: 'end-caught', flee: 'end-empty' } },
    vault: { type: 'puzzle', kind: 'cipher', params: { title: 'Warehouse lock', length: 4, symbols: 5, attempts: 5 }, outcomes: { solved: 'end-stolen', failed: 'alarm' } },
    alarm: {
      type: 'dialogue', speaker: null,
      text: 'The lock buzzes. Somewhere above you, a klaxon clears its throat.',
      choices: [{ label: 'Run for it (Dexterity)', check: { stat: 'dex', tag: 'dodge', dc: 7, pass: 'end-empty', fail: 'end-caught' } }],
    },

    // Route 2: bureaucracy.
    office: {
      type: 'dialogue', speaker: '{clerk.name}',
      text: 'The Ordnance Office is a queue, a counter, and {clerk.name}, who {clerk.tell}. "Requisition of lane-defence ordnance is form 27-B, with a 9-C if the ordnance is kinetic, unless it is Tuesday."',
      choices: [
        { label: 'Fill in the forms properly (Wisdom)', check: { stat: 'wis', tag: 'puzzle', dc: 7, pass: 'stamped', fail: 'wrong-form' } },
        { label: 'Slide {fee} credits under the blotter', cost: { money: '$fee' }, to: 'bribe' },
        { label: 'Show your Guild permit', requires: { items: { permit: 1 } }, to: 'stamped' },
      ],
    },
    bribe: {
      type: 'branch',
      cases: [{ when: { roll: { 'clerk.kind': 'bribable' } }, to: 'stamped' }],
      else: 'end-reported',
    },
    'wrong-form': {
      type: 'dialogue', speaker: '{clerk.name}',
      text: '"This is a 27-A. A 27-A requisitions decorative ordnance." The stamp hovers, and does not fall.',
      choices: [
        { label: 'Ask nicely, and mean it (Charisma)', check: { stat: 'cha', tag: 'talk', dc: 8, pass: 'stamped', fail: 'end-rejected' } },
        { label: 'Give up on paperwork', to: 'end-rejected' },
      ],
    },
    stamped: {
      type: 'dialogue', speaker: '{clerk.name}',
      text: 'Thunk. "Requisition approved. It expires at shift change, which is in four minutes. The armoury is across the ring." Out of the window, {rival.name} is already lining up for the same armoury run.',
      choices: [{ label: 'Race it there.', to: 'armoury-race' }],
    },
    'armoury-race': { type: 'race', track: 'gantry-drop', rival: '$rival', outcomes: { win: 'end-filed', lose: 'end-expired' } },

    // Route 3: build it.
    'build-travel': { type: 'travel', title: 'To Garrity\'s yard', to: 'dustfall', outcomes: { arrived: 'garrity' } },
    garrity: {
      type: 'dialogue', speaker: 'Hob Garrity', portrait: 'garrity',
      text: '"You want to BUILD a railgun. Adorable. You need ore, which is in the rocks, a drill, which you don\'t have, and {part.label}, which nobody has."',
      choices: [
        { label: 'Buy a drill (60 credits)', cost: { money: 60 }, reward: { items: { 'mining-drill': 1 } }, to: 'mine' },
        { label: 'Use your own drill', requires: { items: { 'mining-drill': 1 } }, to: 'mine' },
        { label: 'Earn the loan of one: shift scrap all morning (Constitution)', check: { stat: 'con', tag: 'repair', dc: 7, pass: 'mine', fail: 'no-drill' } },
      ],
    },
    'no-drill': {
      type: 'dialogue', speaker: 'Hob Garrity', portrait: 'garrity',
      text: '"You lifted three crates and had a little lie down. No drill for you."',
      choices: [
        { label: 'Buy one after all (60 credits)', cost: { money: 60 }, reward: { items: { 'mining-drill': 1 } }, to: 'mine' },
        { label: 'Walk away', to: 'end-no-gun' },
      ],
    },
    mine: { type: 'event', title: 'Out to the rocks', deck: ['scav-claim', 'pod'], chance: 0.6, next: 'dig' },
    dig: {
      type: 'dialogue', speaker: null,
      text: 'The seam glitters under your lights. The drill bucks like it has opinions.',
      choices: [{ label: 'Dig deep (Constitution)', check: { stat: 'con', tag: 'repair', dc: 7, pass: 'ore', fail: 'collapse' } }],
    },
    collapse: {
      type: 'dialogue', speaker: null,
      text: 'The seam collapses in a slow grey cloud. There is more ore behind it, probably.',
      choices: [
        { label: 'Dig again, harder (Constitution)', check: { stat: 'con', tag: 'repair', dc: 9, pass: 'ore', fail: 'end-no-gun' } },
        { label: 'Call it', to: 'end-no-gun' },
      ],
    },
    ore: {
      type: 'dialogue', speaker: 'Hob Garrity', portrait: 'garrity', onEnter: { items: { ore: 3 } },
      text: '"Good ore. Now. {part.label}. I have one. You could buy it. Or a claim-jumper out by the wreck field has one bolted to his tug."',
      choices: [
        { label: 'Buy Garrity\'s (90 credits)', cost: { money: 90 }, to: 'assemble' },
        { label: 'Take it off the claim-jumper', to: 'part-fight' },
      ],
    },
    'part-fight': { type: 'fight', mode: 'ship', title: 'Claim-jumper', enemy: '$scav', outcomes: { win: 'assemble', parley: 'assemble', lose: 'end-no-gun', flee: 'end-no-gun' } },
    assemble: { type: 'puzzle', kind: 'cipher', params: { title: 'Coil alignment', length: 4, symbols: 6, attempts: 7 }, outcomes: { solved: 'end-built', failed: 'end-scrapped' } },

    // Ends.
    'end-stolen': {
      type: 'end', result: 'success', outcome: 'stolen', title: 'Stolen',
      text: 'You leave {warehouse} with a crate under your arm and nobody behind you. Vey: "The requisition slip in the crate is signed by the old Warden Office. To your ship\'s licence. Isn\'t that interesting."',
      reward: { items: { railgun: 1 }, rep: { vey: 8, hask: -3 }, skillPoints: 1, flags: { 'fragment-2': 1, 'stole-railgun': 1 } },
    },
    'end-filed': {
      type: 'end', result: 'success', outcome: 'filed', title: 'Filed in triplicate',
      text: 'You slap the stamped form on the armoury counter with seconds to spare. The quartermaster frowns at it: the only railgun on the books was requisitioned years ago by the Warden Office, against your licence number.',
      reward: { items: { railgun: 1 }, rep: { vey: 5, hask: 4 }, skillPoints: 1, flags: { 'fragment-2': 1 } },
    },
    'end-built': {
      type: 'end', result: 'success', outcome: 'built', title: 'Built by hand',
      text: 'The coils sing when they line up. Garrity wipes his eyes and claims it is dust. Stamped inside the barrel liner, under the rust, is a Warden Office serial: your licence number.',
      reward: { items: { railgun: 1 }, rep: { garrity: 10, vey: 2 }, skillPoints: 1, flags: { 'fragment-2': 1 } },
    },
    'end-caught': {
      type: 'end', result: 'failure', outcome: 'caught', title: 'Caught',
      text: 'The guards are not bored any more. You pay the fine and Vey, for a fee, makes the report disappear.',
      reward: { money: -50, rep: { vey: -2 } },
    },
    'end-empty': {
      type: 'end', result: 'failure', outcome: 'empty-handed', title: 'Empty-handed',
      text: 'You get out clean, and with nothing. Vey sells you the next idea for twenty credits.',
      reward: { money: -20 },
    },
    'end-reported': {
      type: 'end', result: 'failure', outcome: 'reported', title: 'Reported',
      text: '{clerk.name} files your bribe, in triplicate, under "attempted". The credits are not coming back.',
      reward: { rep: { hask: -4 } },
    },
    'end-rejected': {
      type: 'end', result: 'failure', outcome: 'rejected', title: 'Rejected',
      text: 'REJECTED, says the stamp, with feeling.',
      reward: {},
    },
    'end-expired': {
      type: 'end', result: 'failure', outcome: 'expired', title: 'Expired',
      text: 'You arrive as the shutter comes down. The requisition is void. The clerk lets you keep the permit, though, which is something.',
      reward: { items: { permit: 1 } },
    },
    'end-no-gun': {
      type: 'end', result: 'failure', outcome: 'no-gun', title: 'No gun',
      text: 'Garrity pats your shoulder with the heavy arm. "Not everyone is a builder. Some people are customers."',
      reward: { rep: { garrity: 1 } },
    },
    'end-scrapped': {
      type: 'end', result: 'failure', outcome: 'scrapped', title: 'Scrapped',
      text: 'The coils fight each other and lose. You get a very expensive pile of scrap.',
      reward: { items: { scrap: 3 } },
    },
  },
};
