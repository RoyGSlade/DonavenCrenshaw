// Hask, "Cold Run" (the slice quest). Alpha Relay to Beacon Prime. Story fragment 1.
// Random: the cargo, the pay, how the raiders play it, the raider, trip events, the seal code.
// Wins: quiet or loud. Fails: the core lost, handed over, or wiped by its seal.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "cold-run",
  "title": "Cold Run",
  "giver": "hask",
  "location": "alpha",
  "summary": "Fly a sealed data core to Beacon Prime. It hums. Raiders can hear it.",
  "repeatable": true,
  "rolls": {
    "cargo": {
      "pick": [
        {
          "label": "a sealed data core",
          "short": "core"
        },
        {
          "label": "a lead-lined Warden memory core",
          "short": "memory core"
        },
        {
          "label": "a data core in a scorched Guild case",
          "short": "core"
        }
      ]
    },
    "pay": {
      "range": [
        70,
        95
      ]
    },
    "setup": {
      "pick": [
        "waiting",
        "tailing",
        "decoy"
      ]
    },
    "raider": {
      "enemy": "raider"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "beat": "Hask pushes {cargo.label} across the desk, carefully around Deputy the cactus.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.intro",
      "emotion": "dry",
      "direction": "Weather-report calm, sliding the job across the desk.",
      "text": "Beacon Prime, {pay} credits. Don't open it. Don't sell it. If it starts humming, do not hum back.",
      "audioText": "Beacon Prime. Good money. Don't open it. Don't sell it. If it starts humming, do not hum back.",
      "choices": [
        {
          "label": "\"I'll take it.\"",
          "to": "depart"
        },
        {
          "label": "\"What's really in it?\"",
          "check": {
            "stat": "wis",
            "tag": "scan",
            "dc": 7,
            "pass": "intro-knows",
            "fail": "intro-shrug"
          }
        },
        {
          "label": "\"Half up front, Stationmaster.\"",
          "check": {
            "stat": "cha",
            "tag": "trade",
            "dc": 8,
            "pass": "intro-advance",
            "fail": "intro-no"
          }
        }
      ]
    },
    "intro-knows": {
      "type": "dialogue",
      "beat": "He looks at you for a long second, then at Deputy, as if checking with him.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.knows",
      "emotion": "worried",
      "direction": "Lower, slower, the joke drained out for once.",
      "text": "Every courier on a dead channel has heard it. Three taps and a pause. This thing does it too. The Beacon wants to know why. So do I.",
      "set": {
        "knows": true
      },
      "choices": [
        {
          "label": "\"Three taps and a pause. Got it.\"",
          "to": "depart"
        }
      ]
    },
    "intro-shrug": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.shrug",
      "emotion": "deadpan",
      "direction": "Flat as a landing pad.",
      "text": "It's cargo. You're a courier. That's the whole poem.",
      "choices": [
        {
          "label": "\"Fair enough.\"",
          "to": "depart"
        }
      ]
    },
    "intro-advance": {
      "type": "dialogue",
      "beat": "Thirty credits slide across the desk like they owe him money.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.advance",
      "emotion": "dry",
      "direction": "Grudging, counting the coins like each one hurts.",
      "text": "Thirty now. The rest when it gets there. Deputy is watching you.",
      "onEnter": {
        "money": 30
      },
      "choices": [
        {
          "label": "Pocket it.",
          "to": "depart"
        }
      ]
    },
    "intro-no": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.no",
      "emotion": "deadpan",
      "direction": "Not a flicker of a smile, which is the joke.",
      "text": "Half up front. That's funny. I'm using that at the next budget meeting.",
      "choices": [
        {
          "label": "\"Worth a try.\"",
          "to": "depart"
        }
      ]
    },
    "depart": {
      "type": "dialogue",
      "speaker": null,
      "text": "The core goes into the hold, warm as fresh bread and humming to itself. Beacon Prime is one jump straight, or two round by the scrapyards.",
      "choices": [
        {
          "label": "Plot the jump.",
          "to": "trip"
        },
        {
          "label": "Take the old courier cut through the scrapyards (Pilot 2)",
          "to": "shortcut",
          "requires": {
            "skills": {
              "pilot": 2
            }
          }
        }
      ]
    },
    "shortcut": {
      "type": "dialogue",
      "speaker": null,
      "text": "Your charts show a courier cut nobody has flown in twenty years: a gap in the scrap so tight the paint squeaks. You pop out at the Beacon's back door while the raiders are still watching the front.",
      "choices": [
        {
          "label": "Dock before anyone notices.",
          "to": "dock-quiet"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "The run",
      "to": "beacon",
      "risk": 0.15,
      "outcomes": {
        "arrived": "setup"
      }
    },
    "setup": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "roll": {
              "setup": "waiting"
            }
          },
          "to": "ambush-waiting"
        },
        {
          "when": {
            "roll": {
              "setup": "tailing"
            }
          },
          "to": "ambush-tailing"
        }
      ],
      "else": "ambush-decoy"
    },
    "ambush-waiting": {
      "type": "dialogue",
      "beat": "Amber running lights wait on the Beacon approach, blinking in a pattern somebody thinks is scary.",
      "speaker": "{raider.name}",
      "line": "raider.cold-run.waiting",
      "emotion": "menacing",
      "direction": "Swaggering pirate on an open channel, trying very hard to sound scary.",
      "text": "Courier! Drop the core and keep your ship. Final offer. Also first offer. We're new at this.",
      "choices": [
        {
          "label": "Guns hot.",
          "to": "fight"
        },
        {
          "label": "Kill the lights and slip past (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "nav",
            "dc": 8,
            "pass": "dock-quiet",
            "fail": "fight"
          }
        },
        {
          "label": "\"This is Guild cargo. You want the Guild on you?\" (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "dock-quiet",
            "fail": "fight"
          }
        },
        {
          "label": "Name the debt their boss owes Hask (Hard Stare)",
          "to": "dock-quiet",
          "requires": {
            "skills": {
              "hard-stare": 1
            }
          }
        },
        {
          "label": "Tap the Knock back on an open channel",
          "to": "spooked",
          "requires": {
            "local": {
              "knows": true
            }
          },
          "lockedHint": "You would have to know what the cargo does"
        },
        {
          "label": "Vent two scrap as a decoy",
          "to": "dock-quiet",
          "cost": {
            "items": {
              "scrap": 2
            }
          }
        },
        {
          "label": "\"Fine. Take it.\"",
          "to": "handover"
        },
        {
          "label": "Squawk the Syndicate codes Edna sold you",
          "to": "codes",
          "requires": {
            "items": {
              "syndicate-codes": 1
            }
          },
          "hideLocked": true
        }
      ]
    },
    "ambush-tailing": {
      "type": "dialogue",
      "speaker": null,
      "text": "A {raider.name} has been on your tail since the gate, close enough to read your paint job. It is not even trying to hide. It waves.",
      "choices": [
        {
          "label": "Turn and fight.",
          "to": "fight"
        },
        {
          "label": "Outrun it to the dock (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "nav",
            "dc": 7,
            "pass": "dock-quiet",
            "fail": "fight"
          }
        },
        {
          "label": "Tap the Knock back on an open channel",
          "to": "spooked",
          "requires": {
            "local": {
              "knows": true
            }
          },
          "lockedHint": "You would have to know what the cargo does"
        },
        {
          "label": "Hail it and hand the core over.",
          "to": "handover"
        }
      ]
    },
    "ambush-decoy": {
      "type": "dialogue",
      "beat": "Pad nineteen is at the dark end of the ring, where the lights have been out for a year.",
      "speaker": "Beacon traffic",
      "line": "traffic.cold-run.decoy",
      "emotion": "neutral",
      "direction": "Bright, bored traffic control reading off a list.",
      "text": "Courier, hold at pad nineteen. Pad one-nine. Thank you for flying Beacon Prime.",
      "choices": [
        {
          "label": "\"Something's off. Give me another pad.\" (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "scan",
            "dc": 7,
            "pass": "dock-quiet",
            "fail": "fight"
          }
        },
        {
          "label": "Take pad nineteen.",
          "to": "fight"
        },
        {
          "label": "Squawk your ghost transponder and pick any pad you like",
          "to": "dock-quiet",
          "requires": {
            "items": {
              "ghost-transponder": 1
            }
          },
          "hideLocked": true
        }
      ]
    },
    "spooked": {
      "type": "dialogue",
      "beat": "Three taps. A pause. The channel goes very quiet. The amber lights drift back to let you pass.",
      "speaker": "{raider.name}",
      "line": "raider.cold-run.spooked",
      "emotion": "worried",
      "direction": "All the swagger gone, a whisper, then a too-bright recovery.",
      "text": "Where did you hear that? ...You know what, never mind. Have a lovely day. Bye.",
      "choices": [
        {
          "label": "Dock before they change their minds.",
          "to": "dock-quiet"
        }
      ]
    },
    "codes": {
      "type": "dialogue",
      "speaker": "{raider.name}",
      "line": "raider.cold-run.codes",
      "emotion": "worried",
      "direction": "Suddenly very polite, like a kid caught by the principal.",
      "text": "Those are Syndicate codes. Whose codes are those? Don't tell me. Lane's all yours, friend.",
      "choices": [
        {
          "label": "Dock with a wave.",
          "to": "dock-quiet"
        }
      ]
    },
    "fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Raider fight",
      "enemy": "$raider",
      "outcomes": {
        "win": "dock-loud",
        "lose": "end-lost",
        "flee": "fled",
        "parley": "dock-quiet"
      }
    },
    "fled": {
      "type": "dialogue",
      "speaker": null,
      "text": "You lose them in the Beacon traffic. But the core took a knock when you broke off, and its tamper seal is blinking red at you. Accusingly.",
      "set": {
        "loud": true
      },
      "choices": [
        {
          "label": "Re-key the seal before customs scans it.",
          "to": "seal"
        }
      ]
    },
    "dock-loud": {
      "type": "dialogue",
      "speaker": null,
      "text": "You dock with scorch marks and a {raider.name} drifting in pieces behind you. The fight tripped the core's tamper seal. It blinks red, and somehow it looks disappointed in you.",
      "set": {
        "loud": true
      },
      "choices": [
        {
          "label": "Re-key the seal before customs scans it.",
          "to": "seal"
        }
      ]
    },
    "seal": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Tamper seal",
      "params": {
        "title": "Tamper seal",
        "length": 4,
        "symbols": 5,
        "attempts": 6
      },
      "outcomes": {
        "solved": "end-loud",
        "failed": "end-wiped"
      }
    },
    "dock-quiet": {
      "type": "dialogue",
      "speaker": null,
      "text": "You slide into the Beacon dock without a scratch. The clamps take the ship, and the core in your hold hums: three taps and a pause. Then again.",
      "choices": [
        {
          "label": "Hand it to the Beacon's receiving clerk.",
          "to": "end-quiet"
        }
      ]
    },
    "handover": {
      "type": "dialogue",
      "beat": "A tractor beam plucks the core out of your hold. A credit chit follows it, spinning.",
      "speaker": "{raider.name}",
      "line": "raider.cold-run.handover",
      "emotion": "playful",
      "direction": "Delighted with himself, tossing a coin.",
      "text": "Smart courier. That's for your trouble. Tell Hask we said hello. Tell the cactus nothing.",
      "choices": [
        {
          "label": "Take the chit and fly home.",
          "to": "end-handover"
        }
      ]
    },
    "end-quiet": {
      "type": "end",
      "result": "success",
      "outcome": "quiet",
      "title": "Delivered quiet",
      "beat": "Hask on the relay, Deputy in the corner of the screen. The pay lands before he finishes talking.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.quiet",
      "emotion": "dry",
      "direction": "Deadpan, but the warmth leaks through on the last line.",
      "text": "Not a scratch? Who are you and what have you done with my courier? Paid in full. The Beacon says it hummed when you docked. Like it knew the place.",
      "reward": {
        "money": "$pay",
        "rep": {
          "hask": 12
        },
        "skillPoints": 1,
        "flags": {
          "fragment-1": 1
        },
        "unlocks": [
          "badge:cold-run"
        ]
      }
    },
    "end-loud": {
      "type": "end",
      "result": "success",
      "outcome": "loud",
      "title": "Delivered loud",
      "beat": "The seal goes green. The Beacon pays, and Garrity's people pay you again for the wreck. The core hums all the way into the vault.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.loud",
      "emotion": "deadpan",
      "direction": "Unimpressed and impressed at the same time.",
      "text": "Loud, but there. I'll take there. Garrity says thanks for the raider scrap. He says it like a threat.",
      "reward": {
        "money": "$pay",
        "items": {
          "scrap": 2
        },
        "rep": {
          "hask": 6
        },
        "skillPoints": 1,
        "flags": {
          "fragment-1": 1
        },
        "unlocks": [
          "badge:cold-run"
        ]
      }
    },
    "end-lost": {
      "type": "end",
      "result": "failure",
      "outcome": "core-lost",
      "title": "Core lost",
      "beat": "A Guild tug finds you drifting with the hold open. The raiders have the core.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.lost",
      "emotion": "tender",
      "direction": "Quiet, almost kind, then back to business.",
      "text": "You're alive. That's the part I care about. The core goes on your note. Next run's cheaper. For me.",
      "followUp": "cold-run",
      "reward": {
        "rep": {
          "hask": -5
        }
      }
    },
    "end-handover": {
      "type": "end",
      "result": "failure",
      "outcome": "handed-over",
      "title": "Handed over",
      "beat": "Forty credits richer, one stationmaster poorer.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.handover",
      "emotion": "grumpy",
      "direction": "No shouting. The silence is worse. Then one dry line.",
      "text": "Deputy and I have discussed this. We're not angry. We're writing it down.",
      "reward": {
        "money": 40,
        "rep": {
          "hask": -12
        },
        "flags": {
          "sold-the-core": 1
        }
      }
    },
    "end-wiped": {
      "type": "end",
      "result": "failure",
      "outcome": "core-wiped",
      "title": "Core wiped",
      "beat": "The seal cooks the core with a soft pop. The Beacon pays nothing.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.cold-run.wiped",
      "emotion": "deadpan",
      "direction": "Bone dry, a sigh under it.",
      "text": "Smells like burnt toast, they tell me. Well. At least nobody else has it either.",
      "reward": {
        "rep": {
          "hask": -3
        }
      }
    }
  }
};
