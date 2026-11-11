// Random event cards for trips (and for quest "event" steps).
// A choice either rolls a check ({ check, pass, fail }) or has one outcome.
// An outcome can carry: text, reward (core's reward format, granted at once),
// hull (change to the ship's hull this quest), and fight ({ enemy: template })
// with win / lose / flee / parley outcomes of its own.
export const EVENTS = Object.freeze({
  distress: {
    title: 'A distress beacon',
    text: 'A weak beacon pulses off the lane: a pilot asking for a tow. Stationmaster Hask likes to hear about tows.',
    choices: [
      {
        label: 'Answer it (Wisdom check to spot a trap)',
        check: { stat: 'wis', tag: 'scan', dc: 7 },
        pass: { text: 'Real pilot, real trouble. You tow them to the relay and the Guild hears about it.', reward: { money: 20, rep: { hask: 3 } } },
        fail: {
          text: 'The beacon cuts out. Raiders drop out of the dark around you.',
          fight: { enemy: 'raider' },
          win: { text: 'You drive them off and pick their wreck clean.', reward: { items: { scrap: 2 } } },
          lose: { text: 'They take what they can grab and leave you drifting.', reward: { money: -25 } },
          flee: { text: 'You burn away before they can lock on.' },
          parley: { text: 'You talk your way out. It costs a little pride and nothing else.' },
        },
      },
      { label: 'Fly past', outcome: { text: 'You keep your eyes on the lane.' } },
    ],
  },
  ambush: {
    title: 'Raiders on the lane',
    text: 'Three amber running lights swing in behind you.',
    choices: [
      {
        label: 'Outrun them (Dexterity check)',
        check: { stat: 'dex', tag: 'nav', dc: 8 },
        pass: { text: 'You thread a debris lane they will not follow.' },
        fail: {
          text: 'They are faster than they look.',
          fight: { enemy: 'raider' },
          win: { text: 'The last one peels off, smoking.', reward: { items: { scrap: 2 } } },
          lose: { text: 'They strip your cargo bay and let you go.', reward: { money: -30 } },
          flee: { text: 'You break off and lose them in the wells.' },
          parley: { text: 'A few words on an open channel and they find softer prey.' },
        },
      },
      { label: 'Pay the lane toll (30 credits)', cost: { money: 30 }, outcome: { text: 'They take the credits and wave you on.' } },
      {
        label: 'Turn and fight',
        outcome: {
          text: 'You swing the nose round.',
          fight: { enemy: 'raider' },
          win: { text: 'The last one peels off, smoking.', reward: { money: 15, items: { scrap: 2 } } },
          lose: { text: 'They strip your cargo bay and let you go.', reward: { money: -30 } },
          flee: { text: 'You break off and lose them in the wells.' },
          parley: { text: 'They decide you are not worth it.' },
        },
      },
    ],
  },
  'gate-flicker': {
    title: 'The gate flickers',
    text: 'The jump gate stutters mid-cycle. For a moment you can see two exits.',
    choices: [
      {
        label: 'Ride the flicker (Wisdom check)',
        check: { stat: 'wis', tag: 'nav', dc: 7 },
        pass: { text: 'You come out early, beside a drifting fuel cell nobody has claimed.', reward: { items: { 'fuel-cell': 1 } } },
        fail: { text: 'The gate spits you out sideways. The hull groans.', hull: -10 },
      },
      { label: 'Wait for a clean cycle', outcome: { text: 'Ten slow minutes. A clean jump.' } },
    ],
  },
  pod: {
    title: 'A drifting cargo pod',
    text: 'An unmarked pod tumbles past, its lock still blinking.',
    choices: [
      {
        label: 'Crack it open (Dexterity check)',
        check: { stat: 'dex', tag: 'hack', dc: 6 },
        pass: { text: 'Scrap and a few loose credits.', reward: { money: 15, items: { scrap: 2 } } },
        fail: { text: 'Booby-trapped. It pops against your hull.', hull: -6 },
      },
      { label: 'Leave it', outcome: { text: 'Somebody else can find out what is inside.' } },
    ],
  },
  toll: {
    title: 'Guild checkpoint',
    text: 'A Relay Guild cutter asks you to hold for an inspection.',
    choices: [
      { label: 'Show your permit', requires: { items: { permit: 1 } }, outcome: { text: 'The inspector stamps you through with a nod.' } },
      {
        label: 'Talk your way through (Charisma check)',
        check: { stat: 'cha', tag: 'talk', dc: 7 },
        pass: { text: 'You trade lane gossip until they forget why they stopped you.' },
        fail: { text: 'They find a missing form. Fine paid.', reward: { money: -20 } },
      },
      { label: 'Pay the inspection fee (15 credits)', cost: { money: 15 }, outcome: { text: 'Paid. Waved on.' } },
    ],
  },
  'choir-song': {
    title: 'A song in the static',
    text: 'The comms fill with a slow chord that is not quite music.',
    choices: [
      {
        label: 'Listen (Wisdom check)',
        check: { stat: 'wis', tag: 'scan', dc: 8 },
        pass: { text: 'You hear words in it. Somewhere ahead, the Choir hears you hearing them.', reward: { flags: { 'heard-the-song': 1 } } },
        fail: { text: 'You drift while you listen and scrape a rock.', hull: -8 },
      },
      { label: 'Kill the comms', outcome: { text: 'Silence. Better.' } },
    ],
  },
  'scav-claim': {
    title: 'Claim jumpers',
    text: 'A Driftborn tug says this lane is their claim and you owe them a cut.',
    choices: [
      {
        label: 'Make a deal (Charisma check)',
        check: { stat: 'cha', tag: 'trade', dc: 6 },
        pass: { text: 'You leave with their respect and two crates of ore.', reward: { items: { ore: 2 } } },
        fail: {
          text: 'The deal goes sour and their tug powers up.',
          fight: { enemy: 'scav' },
          win: { text: 'They limp off. Their ore stays behind.', reward: { items: { ore: 2 } } },
          lose: { text: 'They take a cut after all.', reward: { money: -20 } },
          flee: { text: 'You leave them their claim.' },
          parley: { text: 'You agree to disagree.' },
        },
      },
      { label: 'Go round their claim', outcome: { text: 'A longer way, but a quiet one.' } },
    ],
  },
});
