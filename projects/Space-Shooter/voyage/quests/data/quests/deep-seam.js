// Garrity, "Deep Seam". Mine a tumbling rock: Garrity's stew (a Health roll), crawlers on foot,
// a cave-in, claim-jumpers. Nav Computer 1 and Steady Aim 2 open shortcuts.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "deep-seam",
  "title": "Deep Seam",
  "giver": "garrity",
  "location": "dustfall",
  "summary": "A tumbling rock with a seam of blue ore. Dig it before the claim-jumpers do.",
  "pitch": {
    "line": "garrity.job.deep-seam",
    "emotion": "excited",
    "direction": "Booming greed, rubbing his hands.",
    "text": "Blue ore in a tumbling rock! Dig it before the claim-jumpers do. Eat some stew first."
  },
  "repeatable": true,
  "rolls": {
    "rock": {
      "pick": [
        "Big Gerald",
        "the Grey Potato",
        "Rock 7-and-a-half"
      ]
    },
    "bonus": {
      "range": [
        3,
        6
      ]
    },
    "crawlers": {
      "enemy": "crawlers"
    },
    "jumpers": {
      "enemy": "scav"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.intro",
      "emotion": "excited",
      "direction": "Booming, rubbing his hands.",
      "text": "Rock called {rock} is tumbling past Dustfall with a seam of blue ore you could see from orbit. Lefty can smell it. Go dig, kid. But first, my lucky stew. Everyone eats the stew.",
      "audioText": "There's a rock tumbling past Dustfall with a seam of blue ore you could see from orbit. Lefty can smell it. Go dig, kid. But first, my lucky stew. Everyone eats the stew.",
      "choices": [
        {
          "label": "Eat the stew (Health)",
          "check": {
            "stat": "con",
            "tag": "food",
            "dc": 7,
            "pass": "stew-ok",
            "fail": "stew-bad"
          }
        },
        {
          "label": "\"I've eaten, thanks.\"",
          "to": "kit"
        }
      ]
    },
    "stew-ok": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.stew",
      "emotion": "proud",
      "direction": "Immensely proud of his cooking.",
      "text": "Ha! Iron stomach! That's a digger. Nobody's kept the stew down since the Tuesday incident.",
      "set": {
        "fed": true
      },
      "choices": [
        {
          "label": "\"What was in it?\"",
          "to": "kit"
        }
      ]
    },
    "stew-bad": {
      "type": "dialogue",
      "speaker": null,
      "text": "The stew is lucky for somebody. Not you. You spend a long time in Garrity's washroom reading his safety posters.",
      "hull": -5,
      "choices": [
        {
          "label": "Get on with it, slowly.",
          "to": "kit"
        }
      ]
    },
    "kit": {
      "type": "dialogue",
      "speaker": null,
      "text": "Time to dig. You need something to dig with.",
      "choices": [
        {
          "label": "Use your own drill",
          "to": "land",
          "requires": {
            "items": {
              "mining-drill": 1
            }
          }
        },
        {
          "label": "Borrow one of Garrity's (30 credits)",
          "to": "land",
          "cost": {
            "money": 30
          }
        },
        {
          "label": "Dig with your hands, like a hero (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 8,
            "pass": "land",
            "fail": "end-blisters"
          }
        }
      ]
    },
    "land": {
      "type": "dialogue",
      "speaker": null,
      "text": "You match the rock's tumble and set down. Dust everywhere. Lights on. Under your boots, something skitters.",
      "choices": [
        {
          "label": "Clear the tunnels first.",
          "to": "crawl-fight"
        },
        {
          "label": "Dig fast and ignore the noises (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 7,
            "pass": "dug",
            "fail": "crawl-fight"
          }
        },
        {
          "label": "Read the old survey markers straight to the seam (Salvager)",
          "to": "dug",
          "requires": {
            "skills": {
              "salvager": 1
            }
          }
        }
      ]
    },
    "crawl-fight": {
      "type": "fight",
      "mode": "foot",
      "title": "Rock crawlers",
      "enemy": "$crawlers",
      "dc": 7,
      "outcomes": {
        "win": "dug",
        "lose": "crawl-down",
        "flee": "end-fled"
      }
    },
    "crawl-down": {
      "type": "dialogue",
      "speaker": null,
      "text": "The crawlers chase you back to the ship, nibbling at your boots.",
      "choices": [
        {
          "label": "Patch up and go back in (1 Medkit)",
          "to": "crawl-fight",
          "cost": {
            "items": {
              "medkit": 1
            }
          }
        },
        {
          "label": "Kick them off by hand (Strength)",
          "check": {
            "stat": "str",
            "tag": "brawl",
            "dc": 8,
            "pass": "dug",
            "fail": "end-fled"
          }
        },
        {
          "label": "Leave the rock to them.",
          "to": "end-fled"
        }
      ]
    },
    "dug": {
      "type": "dialogue",
      "speaker": null,
      "text": "The seam opens like a geode. Blue ore, glittering. Your hold starts filling nicely.",
      "onEnter": {
        "items": {
          "ore": 2
        }
      },
      "choices": [
        {
          "label": "Dig deeper for the heart of the seam (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 8,
            "pass": "deep",
            "fail": "cave-in"
          }
        },
        {
          "label": "Read the rock and dig where it is weakest (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "notice",
            "dc": 8,
            "pass": "deep",
            "fail": "cave-in"
          }
        },
        {
          "label": "Take what you have and go.",
          "to": "jumpers"
        }
      ]
    },
    "deep": {
      "type": "dialogue",
      "speaker": null,
      "text": "You hit the heart of it. Ore the size of your head, humming faintly.",
      "set": {
        "deep": true
      },
      "onEnter": {
        "items": {
          "ore": 2
        }
      },
      "choices": [
        {
          "label": "Haul it up.",
          "to": "jumpers"
        }
      ]
    },
    "cave-in": {
      "type": "dialogue",
      "speaker": null,
      "text": "The tunnel sighs, and lies down on you.",
      "choices": [
        {
          "label": "Dig yourself out (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 7,
            "pass": "jumpers",
            "fail": "end-buried"
          }
        },
        {
          "label": "Burn a shield cell to hold the roof (1 Shield cell)",
          "to": "jumpers",
          "cost": {
            "items": {
              "shield-cell": 1
            }
          }
        },
        {
          "label": "Blow the rubble clear with a shaped charge (Demolitions)",
          "to": "jumpers",
          "requires": {
            "skills": {
              "demolitions": 1
            }
          }
        }
      ]
    },
    "jumpers": {
      "type": "dialogue",
      "beat": "A claim-jumper tug drops out of the dust as you lift off.",
      "speaker": "{jumpers.name}",
      "line": "scav.deep-seam.jumpers",
      "emotion": "playful",
      "direction": "A friendly bandit, very attached to a rock.",
      "text": "Lovely rock. Our rock, actually. We named it. We named it Kevin.",
      "choices": [
        {
          "label": "Fight for it.",
          "to": "jump-fight"
        },
        {
          "label": "Share the ore (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "trade",
            "dc": 7,
            "pass": "end-shared",
            "fail": "jump-fight"
          }
        },
        {
          "label": "Outfly them home (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "nav",
            "dc": 8,
            "pass": "haul",
            "fail": "jump-fight"
          }
        },
        {
          "label": "Overcharge your guns into a blinding flash and run (Gunner 2)",
          "to": "haul",
          "requires": {
            "skills": {
              "gunner": 2
            }
          }
        }
      ]
    },
    "jump-fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Claim-jumpers",
      "enemy": "$jumpers",
      "outcomes": {
        "win": "haul",
        "parley": "end-shared",
        "lose": "end-robbed",
        "flee": "end-robbed"
      }
    },
    "haul": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "deep": true
            }
          },
          "to": "end-motherlode"
        }
      ],
      "else": "end-hauled"
    },
    "end-motherlode": {
      "type": "end",
      "result": "success",
      "outcome": "motherlode",
      "title": "Motherlode",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.motherlode",
      "emotion": "excited",
      "direction": "Shouting with joy.",
      "text": "Look at the SIZE of it! Lefty, we're rich! For about a week! Kid, you're a digger. A real one.",
      "reward": {
        "money": 80,
        "items": {
          "ore": "$bonus"
        },
        "rep": {
          "garrity": 10
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:deep-seam"
        ]
      }
    },
    "end-hauled": {
      "type": "end",
      "result": "success",
      "outcome": "hauled",
      "title": "A good haul",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.hauled",
      "emotion": "warm",
      "direction": "Pleased, practical.",
      "text": "Good honest ore. Weigh it, pay it, done. That's the best kind of day.",
      "reward": {
        "money": 50,
        "items": {
          "ore": 3
        },
        "rep": {
          "garrity": 6
        },
        "unlocks": [
          "badge:deep-seam"
        ]
      }
    },
    "end-shared": {
      "type": "end",
      "result": "success",
      "outcome": "shared",
      "title": "Shared with Kevin's people",
      "speaker": "{jumpers.name}",
      "line": "scav.deep-seam.shared",
      "emotion": "warm",
      "direction": "Touched, a bandit with a soft heart.",
      "text": "You'd share Kevin? That's beautiful. Here, half the ore. Come visit him some time.",
      "reward": {
        "money": 20,
        "items": {
          "ore": 2
        },
        "rep": {
          "garrity": 4
        },
        "unlocks": [
          "badge:deep-seam"
        ]
      }
    },
    "end-blisters": {
      "type": "end",
      "result": "failure",
      "outcome": "blisters",
      "title": "Blisters",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.blisters",
      "emotion": "playful",
      "direction": "Laughing, not unkind.",
      "text": "Hands? You tried to dig a rock with your HANDS? Lefty's laughing so hard he's leaking.",
      "reward": {
        "rep": {
          "garrity": -1
        }
      }
    },
    "end-fled": {
      "type": "end",
      "result": "failure",
      "outcome": "fled",
      "title": "Chased off",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.fled",
      "emotion": "warm",
      "direction": "Reassuring.",
      "text": "Crawlers, eh? Nasty little things. Bite like a tax inspector. Next time, eh?",
      "reward": {
        "rep": {
          "garrity": -2
        }
      }
    },
    "end-buried": {
      "type": "end",
      "result": "failure",
      "outcome": "buried",
      "title": "Buried",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.buried",
      "emotion": "tender",
      "direction": "Relief under a fake grumble.",
      "text": "Dug you out myself. Took all afternoon. I'm billing you for the afternoon. ...Glad you're all right, kid.",
      "reward": {
        "money": -20,
        "rep": {
          "garrity": -3
        }
      }
    },
    "end-robbed": {
      "type": "end",
      "result": "failure",
      "outcome": "robbed",
      "title": "Robbed",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.deep-seam.robbed",
      "emotion": "grumpy",
      "direction": "Grumbling at the jumpers, not you.",
      "text": "They took the lot? For a rock called Kevin? This galaxy.",
      "reward": {
        "rep": {
          "garrity": -4
        }
      }
    }
  }
};
