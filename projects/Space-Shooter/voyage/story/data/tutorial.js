// Stardust story data: the tutorial (legs, steps, talks). DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// A step's lines are line ids, or { "pick": name } (a line chosen in code: story/tutorial.js PICKS).
// skipIf names a condition in story/tutorial.js SKIP_IF.
export const TUTORIAL_DATA = {
  "version": 1,
  "legs": [
    {
      "id": "setup",
      "who": "chibby",
      "name": "Signing on"
    },
    {
      "id": "ralph",
      "who": "ralph",
      "giver": "garrity",
      "name": "Ralph's find"
    },
    {
      "id": "mel",
      "who": "mel",
      "giver": "hask",
      "name": "Mel's range"
    },
    {
      "id": "edna",
      "who": "edna",
      "giver": "vey",
      "name": "Edna's lockbox"
    },
    {
      "id": "wrap",
      "who": "chibby",
      "name": "Open for business"
    }
  ],
  "steps": [
    {
      "id": "intro",
      "leg": "setup",
      "wait": {
        "type": "intro:done"
      }
    },
    {
      "id": "create",
      "leg": "setup",
      "objective": "Sign your licence.",
      "station": "quarters",
      "enter": [
        "chibby.create.name",
        "chibby.create.dice"
      ],
      "wait": {
        "type": "captain:created"
      },
      "after": [
        {
          "pick": "roll"
        },
        "chibby.create.done"
      ],
      "unlocks": [
        "station:quarters"
      ],
      "skipIf": "hasCaptain"
    },
    {
      "id": "walk",
      "leg": "setup",
      "objective": "Walk to Chibby at the pad.",
      "station": "pad",
      "enter": [
        "chibby.walk.1"
      ],
      "also": [
        {
          "type": "tutorial:moved",
          "lines": [
            "chibby.walk.moving"
          ]
        }
      ],
      "wait": {
        "type": "tutorial:arrived",
        "match": {
          "station": "pad"
        }
      }
    },
    {
      "id": "ship",
      "leg": "setup",
      "objective": "Talk to Chibby.",
      "station": "pad",
      "wait": {
        "type": "met:chibby"
      },
      "after": [
        "chibby.ship.1",
        "chibby.ship.2",
        "chibby.ship.3",
        "chibby.ship.4"
      ],
      "unlocks": [
        "ship",
        "station:pad"
      ]
    },
    {
      "id": "ralph",
      "leg": "ralph",
      "objective": "Ralph found something. Follow him.",
      "station": "kennel",
      "enter": [
        "chibby.ralph.1"
      ],
      "wait": {
        "type": "met:ralph"
      },
      "after": [
        "ralph.ralph.1",
        "chibby.ralph.2",
        "ralph.ralph.2",
        "chibby.ralph.3"
      ],
      "unlocks": [
        "station:scrap"
      ]
    },
    {
      "id": "mine",
      "leg": "ralph",
      "objective": "Mine the seam Ralph dug up.",
      "station": "scrap",
      "wait": {
        "type": "tutorial:mined"
      },
      "after": [
        "ralph.mine.1",
        "chibby.mine.1",
        "chibby.mine.2",
        "chibby.mine.3"
      ],
      "reward": {
        "items": {
          "ore": 3
        }
      },
      "unlocks": [
        "explore:dustfall",
        "station:hatch"
      ]
    },
    {
      "id": "hop-garrity",
      "leg": "ralph",
      "objective": "Fly to Dustfall Station.",
      "station": "hatch",
      "target": "dustfall",
      "also": [
        {
          "type": "explore:launched",
          "lines": [
            "chibby.launch.1"
          ],
          "once": "first-launch"
        }
      ],
      "wait": {
        "type": "explore:arrived",
        "match": {
          "target": "dustfall"
        }
      },
      "after": [
        "garrity.arrive.1"
      ]
    },
    {
      "id": "garrity",
      "leg": "ralph",
      "objective": "Find Hob Garrity.",
      "target": "dustfall",
      "wait": {
        "type": "met:garrity"
      },
      "after": [
        "garrity.meet.1",
        "garrity.meet.2",
        "garrity.meet.3",
        "garrity.meet.4"
      ],
      "reward": {
        "rep": {
          "garrity": 5
        },
        "flags": {
          "met-garrity": 1
        }
      },
      "unlocks": [
        "giver:garrity"
      ]
    },
    {
      "id": "mel",
      "leg": "mel",
      "objective": "Mel wants a word at the locker.",
      "station": "locker",
      "enter": [
        "chibby.mel.1"
      ],
      "wait": {
        "type": "met:mel"
      },
      "after": [
        "mel.meet.1",
        "mel.meet.2",
        "mel.meet.3"
      ],
      "reward": {
        "flags": {
          "kit-sidearm": 1
        }
      },
      "unlocks": [
        "station:locker"
      ]
    },
    {
      "id": "shoot",
      "leg": "mel",
      "objective": "Knock down every target on Mel's range.",
      "station": "range",
      "enter": [
        "mel.shoot.0"
      ],
      "wait": {
        "type": "tutorial:shot"
      },
      "after": [
        {
          "pick": "shot"
        },
        "mel.shoot.2",
        "mel.shoot.3"
      ],
      "unlocks": [
        "station:range",
        "explore:alpha"
      ]
    },
    {
      "id": "hop-hask",
      "leg": "mel",
      "objective": "Fly to Alpha Relay.",
      "station": "hatch",
      "target": "alpha",
      "also": [
        {
          "type": "explore:launched",
          "lines": [
            "chibby.launch.1"
          ],
          "once": "first-launch"
        }
      ],
      "wait": {
        "type": "explore:arrived",
        "match": {
          "target": "alpha"
        }
      },
      "after": [
        "hask.arrive.1"
      ]
    },
    {
      "id": "hask",
      "leg": "mel",
      "objective": "Find Stationmaster Hask.",
      "target": "alpha",
      "wait": {
        "type": "met:hask"
      },
      "after": [
        "hask.meet.1",
        "hask.meet.2",
        "hask.meet.3",
        "hask.meet.4"
      ],
      "reward": {
        "rep": {
          "hask": 5
        },
        "flags": {
          "met-hask": 1
        }
      },
      "unlocks": [
        "giver:hask"
      ]
    },
    {
      "id": "edna",
      "leg": "edna",
      "objective": "Someone is whistling in the back room.",
      "station": "backroom",
      "enter": [
        "chibby.edna.1"
      ],
      "wait": {
        "type": "met:edna"
      },
      "after": [
        "edna.meet.1",
        "edna.meet.2"
      ],
      "unlocks": [
        "station:backroom"
      ]
    },
    {
      "id": "talk",
      "leg": "edna",
      "objective": "Talk your way into Edna's good books.",
      "station": "backroom",
      "talk": "edna",
      "wait": {
        "type": "tutorial:talked",
        "match": {
          "talk": "edna"
        }
      },
      "after": [
        "edna.talk.done"
      ]
    },
    {
      "id": "puzzle",
      "leg": "edna",
      "objective": "Open Edna's lockbox.",
      "station": "backroom",
      "enter": [
        "edna.puzzle.0"
      ],
      "wait": {
        "type": "tutorial:solved",
        "match": {
          "puzzle": "lockbox"
        }
      },
      "after": [
        "edna.puzzle.1",
        "edna.puzzle.2"
      ],
      "unlocks": [
        "explore:beacon"
      ]
    },
    {
      "id": "hop-vey",
      "leg": "edna",
      "objective": "Fly to Beacon Prime.",
      "station": "hatch",
      "target": "beacon",
      "also": [
        {
          "type": "explore:launched",
          "lines": [
            "chibby.launch.1"
          ],
          "once": "first-launch"
        }
      ],
      "wait": {
        "type": "explore:arrived",
        "match": {
          "target": "beacon"
        }
      },
      "after": [
        "vey.arrive.1"
      ]
    },
    {
      "id": "vey",
      "leg": "edna",
      "objective": "Find Lucan Vey.",
      "target": "beacon",
      "wait": {
        "type": "met:vey"
      },
      "after": [
        "vey.meet.1",
        "vey.meet.2",
        "vey.meet.3",
        "vey.meet.4"
      ],
      "reward": {
        "rep": {
          "vey": 5
        },
        "flags": {
          "met-vey": 1
        }
      },
      "unlocks": [
        "giver:vey"
      ]
    },
    {
      "id": "open",
      "leg": "wrap",
      "enter": [
        "chibby.open.1",
        "chibby.open.2",
        "chibby.open.3",
        "ralph.open.1",
        "chibby.open.4"
      ],
      "unlocks": [
        "jobs",
        "station:board"
      ]
    }
  ],
  "talks": {
    "edna": {
      "who": "edna",
      "prompt": "edna.talk.ask",
      "options": [
        {
          "label": "\"I'm Chibby's captain. That should count.\"",
          "reply": "edna.talk.plain"
        },
        {
          "stat": "cha",
          "label": "\"Because you clearly have the best taste on this station.\"",
          "reply": "edna.talk.cha"
        },
        {
          "stat": "con",
          "label": "Carry her crates in without being asked.",
          "reply": "edna.talk.con"
        },
        {
          "stat": "dex",
          "label": "Catch the teacup she \"accidentally\" knocks off the table.",
          "reply": "edna.talk.dex"
        },
        {
          "stat": "wis",
          "label": "\"You don't trust anyone. That's why you're still in business.\"",
          "reply": "edna.talk.wis"
        }
      ]
    }
  },
  "unlockNames": {
    "ship": "Your ship. She's cozy.",
    "jobs": "The job board is open",
    "station:quarters": "Your bunk: stats and skills",
    "station:pad": "Chibby's pad: upgrades",
    "station:scrap": "The scrap pile",
    "station:hatch": "The launch hatch",
    "station:locker": "Mel's fitting bay",
    "station:range": "Mel's range",
    "station:backroom": "Edna's back room",
    "station:board": "The job board",
    "explore:dustfall": "Course laid in: Dustfall Station",
    "explore:alpha": "Course laid in: Alpha Relay",
    "explore:beacon": "Course laid in: Beacon Prime",
    "giver:garrity": "Hob Garrity will hire you",
    "giver:hask": "Stationmaster Hask will hire you",
    "giver:vey": "Lucan Vey will hire you"
  }
};
