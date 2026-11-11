// Garrity, "Dead Weight". Strip or tow a derelict before a scav gang does. Story fragment 3.
// A Patch Kit 2 captain can cut into the sealed engine room. Random: the hulk, loot, the gang.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "dead-weight",
  "title": "Dead Weight",
  "giver": "garrity",
  "location": "dustfall",
  "summary": "A derelict hulk in the debris field. Strip it or tow it before the scavengers do.",
  "repeatable": true,
  "rolls": {
    "hulk": {
      "pick": [
        {
          "label": "a Guild ore freighter, gutted by something with teeth"
        },
        {
          "label": "a Warden picket ship, dark for twenty years"
        },
        {
          "label": "a Choir pilgrim barge, every seat still strapped"
        }
      ]
    },
    "loot": {
      "range": [
        70,
        120
      ]
    },
    "gang": {
      "enemy": "scav"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "beat": "Garrity spreads a scanner print across a crate: {hulk.label}.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.intro",
      "emotion": "excited",
      "direction": "Greedy glee, talking fast.",
      "text": "Found a beauty in the field, kid! Strip it or tow it in whole, I don't care which. Just do it before every scav in the Drift smells it. Lefty can already smell it.",
      "choices": [
        {
          "label": "\"On my way.\"",
          "to": "out"
        },
        {
          "label": "\"What's my cut?\"",
          "to": "cut"
        }
      ]
    },
    "cut": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.cut",
      "emotion": "playful",
      "direction": "Haggling for fun, then giving in all at once.",
      "text": "Your cut is my eternal friendship and whatever doesn't fit in my pockets. Fine! Parts if you strip it, credits if you tow it.",
      "choices": [
        {
          "label": "\"Deal.\"",
          "to": "out"
        }
      ]
    },
    "out": {
      "type": "event",
      "title": "Into the debris field",
      "deck": [
        "scav-claim",
        "pod",
        "distress"
      ],
      "chance": 0.6,
      "next": "hulk"
    },
    "hulk": {
      "type": "dialogue",
      "speaker": null,
      "text": "The hulk turns slowly in the dust: {hulk.label}. Something inside still has power. Your comms click: three taps and a pause.",
      "choices": [
        {
          "label": "Strip it: crack the breaker panel",
          "to": "panel",
          "set": {
            "stripping": true
          }
        },
        {
          "label": "Tow it whole (Strength)",
          "check": {
            "stat": "str",
            "tag": "lift",
            "dc": 7,
            "pass": "towed",
            "fail": "end-snapped"
          }
        },
        {
          "label": "Cut into the sealed engine room (Mechanic 2)",
          "to": "engine-room",
          "requires": {
            "skills": {
              "mechanic": 2
            }
          }
        }
      ]
    },
    "engine-room": {
      "type": "dialogue",
      "speaker": null,
      "text": "You cut exactly where a mechanic would. Behind the bulkhead: an untouched engine room, warm, packed with parts nobody has priced in twenty years.",
      "set": {
        "stripped": true,
        "engine": true
      },
      "choices": [
        {
          "label": "Load it all.",
          "to": "gang"
        }
      ]
    },
    "panel": {
      "type": "puzzle",
      "kind": "cipher",
      "params": {
        "title": "Breaker panel",
        "length": 3,
        "symbols": 5,
        "attempts": 5
      },
      "outcomes": {
        "solved": "stripped",
        "failed": "botched"
      }
    },
    "stripped": {
      "type": "dialogue",
      "speaker": null,
      "text": "The panel clunks open. Circuits, clean scrap, and a log drive that will not stop knocking.",
      "set": {
        "stripped": true
      },
      "choices": [
        {
          "label": "Load up.",
          "to": "gang"
        }
      ]
    },
    "botched": {
      "type": "dialogue",
      "speaker": null,
      "text": "The panel fuses. You pry out what you can with a crowbar and feelings.",
      "set": {
        "botched": true
      },
      "choices": [
        {
          "label": "Load what you have.",
          "to": "gang"
        }
      ]
    },
    "towed": {
      "type": "dialogue",
      "speaker": null,
      "text": "The tow line takes. The hulk follows you home like a very large, very dead dog.",
      "set": {
        "towed": true
      },
      "choices": [
        {
          "label": "Head for the yard.",
          "to": "gang"
        }
      ]
    },
    "gang": {
      "type": "dialogue",
      "speaker": "{gang.name}",
      "line": "scav.dead-weight.claim",
      "emotion": "playful",
      "direction": "A cheerful bandit who would much rather bargain than fight.",
      "text": "That's our find, courier. We saw it first. We saw it in a dream, even. Very moving dream.",
      "choices": [
        {
          "label": "Fight for it.",
          "to": "fight"
        },
        {
          "label": "Offer them a share (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "trade",
            "dc": 7,
            "pass": "end-shared",
            "fail": "fight"
          }
        },
        {
          "label": "Let them have it.",
          "to": "end-ceded"
        }
      ]
    },
    "fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Scav gang",
      "enemy": "$gang",
      "outcomes": {
        "win": "haul",
        "parley": "end-shared",
        "lose": "end-beaten",
        "flee": "end-ceded"
      }
    },
    "haul": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "engine": true
            }
          },
          "to": "end-engine"
        },
        {
          "when": {
            "local": {
              "towed": true
            }
          },
          "to": "end-sold"
        },
        {
          "when": {
            "local": {
              "stripped": true
            }
          },
          "to": "end-salvaged"
        }
      ],
      "else": "end-scraps"
    },
    "end-engine": {
      "type": "end",
      "result": "success",
      "outcome": "engine-room",
      "title": "The engine room",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.engine",
      "emotion": "excited",
      "direction": "Overjoyed, almost singing.",
      "text": "You opened the ENGINE ROOM? Kid. Kid! Lefty, we're eating real food tonight! ...And play me that log drive. That knocking. That's your licence it's reading out.",
      "reward": {
        "items": {
          "circuit": 3,
          "fuel-cell": 1,
          "scrap": 6
        },
        "rep": {
          "garrity": 12
        },
        "skillPoints": 1,
        "flags": {
          "fragment-3": 1
        },
        "unlocks": [
          "badge:dead-weight"
        ]
      }
    },
    "end-salvaged": {
      "type": "end",
      "result": "success",
      "outcome": "salvaged",
      "title": "Stripped clean",
      "beat": "Garrity sorts your haul like a kid with presents, then plays the log drive.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.salvaged",
      "emotion": "warm",
      "direction": "Delighted, then quiet and puzzled.",
      "text": "Look at all this! Like birthday. Now, the log drive. Three taps, and a licence number. Kid. Isn't that yours?",
      "reward": {
        "items": {
          "circuit": 2,
          "scrap": 4
        },
        "rep": {
          "garrity": 10
        },
        "skillPoints": 1,
        "flags": {
          "fragment-3": 1
        },
        "unlocks": [
          "badge:dead-weight"
        ]
      }
    },
    "end-sold": {
      "type": "end",
      "result": "success",
      "outcome": "sold-whole",
      "title": "Sold whole",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.sold",
      "emotion": "proud",
      "direction": "Paying in real credits and making a show of how much it hurts.",
      "text": "Actual credits. That's how you know it's good. The log says the Knock came from your licence. Funny old universe.",
      "reward": {
        "money": "$loot",
        "rep": {
          "garrity": 8
        },
        "skillPoints": 1,
        "flags": {
          "fragment-3": 1
        },
        "unlocks": [
          "badge:dead-weight"
        ]
      }
    },
    "end-shared": {
      "type": "end",
      "result": "success",
      "outcome": "shared",
      "title": "Shared",
      "speaker": "{gang.name}",
      "line": "scav.dead-weight.shared",
      "emotion": "warm",
      "direction": "Friendly, relieved, tossing something over.",
      "text": "Half each and nobody shot. Lovely. Here, take the log drive. Keeps knocking. Gives me the creeps.",
      "reward": {
        "money": 30,
        "items": {
          "scrap": 2
        },
        "rep": {
          "garrity": 4
        },
        "skillPoints": 1,
        "flags": {
          "fragment-3": 1
        },
        "unlocks": [
          "badge:dead-weight"
        ]
      }
    },
    "end-scraps": {
      "type": "end",
      "result": "success",
      "outcome": "scraps",
      "title": "Scraps",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.scraps",
      "emotion": "warm",
      "direction": "Kind about a small haul.",
      "text": "Not much, but it's yours, and the log drive's in there somewhere. Hear it? Knocking.",
      "reward": {
        "items": {
          "scrap": 2
        },
        "rep": {
          "garrity": 3
        },
        "flags": {
          "fragment-3": 1
        },
        "unlocks": [
          "badge:dead-weight"
        ]
      }
    },
    "end-ceded": {
      "type": "end",
      "result": "failure",
      "outcome": "ceded",
      "title": "Ceded",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.ceded",
      "emotion": "grumpy",
      "direction": "Taking it well. Mostly.",
      "text": "You let them tow my beauty. I'm fine. I only threw one wrench. Lefty threw two.",
      "reward": {
        "rep": {
          "garrity": -4
        }
      }
    },
    "end-beaten": {
      "type": "end",
      "result": "failure",
      "outcome": "beaten",
      "title": "Beaten",
      "beat": "The gang leaves you drifting and takes the hulk.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.beaten",
      "emotion": "tender",
      "direction": "Gentle, which somehow stings more.",
      "text": "Towed you in myself. No charge. Don't argue. Go and get patched up, kid.",
      "reward": {
        "rep": {
          "garrity": -6
        }
      }
    },
    "end-snapped": {
      "type": "end",
      "result": "failure",
      "outcome": "snapped",
      "title": "Tow line snapped",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.dead-weight.snapped",
      "emotion": "playful",
      "direction": "A big shrug of a laugh.",
      "text": "Heard the twang from here! Off it goes, into the dust, still knocking. Scrap's scrap.",
      "reward": {
        "rep": {
          "garrity": -2
        }
      }
    }
  }
};
