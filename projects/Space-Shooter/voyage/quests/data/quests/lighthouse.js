// Garrity, "The Lighthouse". Repair the old debris-field lighthouse for its keeper, Wren.
// Rewire it, buy parts, bodge it, or (Patch Kit 3) rebuild it properly. Warden drones answer the light.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "lighthouse",
  "title": "The Lighthouse",
  "giver": "garrity",
  "location": "dustfall",
  "summary": "The old lighthouse in the debris field has gone dark. Haulers keep hitting rocks.",
  "repeatable": true,
  "rolls": {
    "fault": {
      "pick": [
        {
          "label": "a cracked lens"
        },
        {
          "label": "a burnt-out coil"
        },
        {
          "label": "a nest of space moths"
        }
      ]
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.lighthouse.intro",
      "emotion": "worried",
      "direction": "Worried for once, the big voice gone soft.",
      "text": "Old lighthouse in the field's gone dark. Three haulers bumped rocks this week, and one was mine. Fix it, kid. And be nice to Wren out there. She's shy.",
      "choices": [
        {
          "label": "\"On my way.\"",
          "to": "out"
        }
      ]
    },
    "out": {
      "type": "event",
      "title": "Into the dark field",
      "deck": [
        "pod",
        "scav-claim"
      ],
      "chance": 0.5,
      "next": "wren"
    },
    "wren": {
      "type": "dialogue",
      "speaker": "Wren",
      "line": "keeper.lighthouse.wren",
      "emotion": "excited",
      "direction": "Bright and quick, stammering a little, thrilled to see a person.",
      "text": "Oh! A person! Hello! Sorry. I talk to the lamp, mostly. The lamp doesn't talk back. It's got {fault.label}. I think it's sad about it.",
      "audioText": "Oh! A person! Hello! Sorry. I talk to the lamp, mostly. The lamp doesn't talk back. It's broken. I think it's sad about it.",
      "choices": [
        {
          "label": "\"Let's have a look.\"",
          "to": "look"
        },
        {
          "label": "\"Is it always this lonely out here?\" (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 6,
            "pass": "wren-warm",
            "fail": "look"
          }
        }
      ]
    },
    "wren-warm": {
      "type": "dialogue",
      "speaker": "Wren",
      "line": "keeper.lighthouse.warm",
      "emotion": "tender",
      "direction": "Shy, honest, a small smile.",
      "text": "It's lonelier without the light. The lamp's my friend. You could be my second friend. If you want. No pressure.",
      "set": {
        "friend": true
      },
      "choices": [
        {
          "label": "\"Second friend reporting for duty.\"",
          "to": "look"
        }
      ]
    },
    "look": {
      "type": "dialogue",
      "speaker": null,
      "text": "Up the ladder, the lamp housing is a tangle of {fault.label} and old Warden wiring that hums when you touch it.",
      "choices": [
        {
          "label": "Rewire it by hand.",
          "to": "rewire"
        },
        {
          "label": "Swap in new parts (2 circuit boards)",
          "to": "lit",
          "cost": {
            "items": {
              "circuit": 2
            }
          }
        },
        {
          "label": "Bodge it with scrap and elbow grease (4 scrap) (Strength)",
          "check": {
            "stat": "str",
            "tag": "repair",
            "dc": 7,
            "pass": "dim",
            "fail": "end-boom"
          },
          "cost": {
            "items": {
              "scrap": 4
            }
          }
        },
        {
          "label": "Ask Wren where the spare parts are hidden",
          "to": "lit",
          "requires": {
            "local": {
              "friend": true
            }
          },
          "lockedHint": "Wren would have to trust you first"
        },
        {
          "label": "Rebuild the lens housing properly (Mechanic 3)",
          "to": "lit-bright",
          "requires": {
            "skills": {
              "mechanic": 3
            }
          }
        }
      ]
    },
    "rewire": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Lamp wiring",
      "params": {
        "title": "Lamp wiring",
        "length": 4,
        "symbols": 5,
        "attempts": 6
      },
      "outcomes": {
        "solved": "lit",
        "failed": "end-boom"
      }
    },
    "lit-bright": {
      "type": "dialogue",
      "speaker": null,
      "text": "You rebuild it the way the Wardens meant it. The lamp does not just light: it sings, and every rock in the field throws a long clean shadow.",
      "set": {
        "bright": true
      },
      "choices": [
        {
          "label": "Watch the light.",
          "to": "drones"
        }
      ]
    },
    "lit": {
      "type": "dialogue",
      "speaker": null,
      "text": "The lamp coughs, then blazes. Every rock in the field throws a shadow. And the light starts to flash: three, and a pause.",
      "choices": [
        {
          "label": "Watch the light.",
          "to": "drones"
        }
      ]
    },
    "dim": {
      "type": "dialogue",
      "speaker": null,
      "text": "The lamp glows. A bit sulky, but it glows. It flashes too, slow and dim: three, and a pause.",
      "set": {
        "dim": true
      },
      "choices": [
        {
          "label": "Watch the light.",
          "to": "drones"
        }
      ]
    },
    "drones": {
      "type": "dialogue",
      "speaker": null,
      "text": "Something in the dark answers the light. Two Warden drones come drifting in, curious as cats.",
      "choices": [
        {
          "label": "Shoot them down.",
          "to": "drone-fight"
        },
        {
          "label": "Let them look (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "notice",
            "dc": 7,
            "pass": "end-watched",
            "fail": "drone-fight"
          }
        }
      ]
    },
    "drone-fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Warden drones",
      "enemy": {
        "enemy": "drone"
      },
      "outcomes": {
        "win": "shine",
        "parley": "shine",
        "lose": "end-smashed",
        "flee": "end-left"
      }
    },
    "shine": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "bright": true
            }
          },
          "to": "end-bright"
        },
        {
          "when": {
            "local": {
              "dim": true
            }
          },
          "to": "end-dim"
        }
      ],
      "else": "end-lit"
    },
    "end-bright": {
      "type": "end",
      "result": "success",
      "outcome": "bright",
      "title": "Brightest in the Drift",
      "speaker": "Wren",
      "line": "keeper.lighthouse.bright",
      "emotion": "excited",
      "direction": "Overjoyed, laughing and crying a bit.",
      "text": "It's never been this bright! Not even when it was new! You can see it from Alpha Relay! Thank you, thank you!",
      "reward": {
        "money": 120,
        "rep": {
          "garrity": 12
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:lighthouse"
        ]
      }
    },
    "end-lit": {
      "type": "end",
      "result": "success",
      "outcome": "lit",
      "title": "Lit up",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.lighthouse.lit",
      "emotion": "proud",
      "direction": "Big pride, a laugh.",
      "text": "The field's lit up like a birthday! Haulers are singing about you. Badly. Lefty's singing too. Worse.",
      "reward": {
        "money": 90,
        "rep": {
          "garrity": 10
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:lighthouse"
        ]
      }
    },
    "end-dim": {
      "type": "end",
      "result": "success",
      "outcome": "dim",
      "title": "Dim, but lit",
      "speaker": "Wren",
      "line": "keeper.lighthouse.dim",
      "emotion": "warm",
      "direction": "Grateful, a little apologetic for the lamp.",
      "text": "It's a bit sulky. But it's on. That's the main thing. Come back and visit it? It likes you.",
      "reward": {
        "money": 50,
        "rep": {
          "garrity": 5
        },
        "unlocks": [
          "badge:lighthouse"
        ]
      }
    },
    "end-watched": {
      "type": "end",
      "result": "success",
      "outcome": "watched",
      "title": "They only wanted to look",
      "speaker": "Wren",
      "line": "keeper.lighthouse.watched",
      "emotion": "worried",
      "direction": "Hushed, a little spooked, a little awed.",
      "text": "They watched it knock, and they knocked back, and they left. Like they were checking someone was home. Were they checking on you?",
      "reward": {
        "money": 70,
        "rep": {
          "garrity": 6
        },
        "flags": {
          "drones-listened": 1
        },
        "unlocks": [
          "badge:lighthouse"
        ]
      }
    },
    "end-boom": {
      "type": "end",
      "result": "failure",
      "outcome": "boom",
      "title": "Boom",
      "beat": "The lamp goes up with a soft whump and a shower of very pretty sparks.",
      "speaker": "Wren",
      "line": "keeper.lighthouse.boom",
      "emotion": "worried",
      "direction": "Trying very hard to be understanding.",
      "text": "That's... fine! That's fine. It was old. I'll just sit in the dark a bit. It's fine.",
      "reward": {
        "rep": {
          "garrity": -3
        }
      }
    },
    "end-smashed": {
      "type": "end",
      "result": "failure",
      "outcome": "smashed",
      "title": "Smashed",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.lighthouse.smashed",
      "emotion": "grumpy",
      "direction": "Grumbling, already calculating the cost.",
      "text": "The drones smashed the lamp AND your ship? We'll be fishing haulers out of the rocks all week.",
      "reward": {
        "rep": {
          "garrity": -4
        }
      }
    },
    "end-left": {
      "type": "end",
      "result": "failure",
      "outcome": "left",
      "title": "Left it",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.lighthouse.left",
      "emotion": "warm",
      "direction": "Understanding.",
      "text": "You ran from the drones? Smart. Shame about the lamp, though. Wren's on her own out there again.",
      "reward": {
        "rep": {
          "garrity": -2
        }
      }
    }
  }
};
