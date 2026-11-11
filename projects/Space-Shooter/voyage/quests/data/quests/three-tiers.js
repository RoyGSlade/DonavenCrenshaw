// Hask, "Three Tiers, No Waiting". Deliver a wedding cake to Beacon Prime against a rival caterer.
// Random: the flavour, the pay, the rival caterer and their pace, trip events.
// Wins: perfect, modern art, saved the party. Fails: squashed, late.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "three-tiers",
  "title": "Three Tiers, No Waiting",
  "giver": "hask",
  "location": "alpha",
  "summary": "A Guild wedding cake for Beacon Prime. On time, in one piece, tiers all upright.",
  "repeatable": true,
  "rolls": {
    "flavour": {
      "pick": [
        "lemon starfruit",
        "black-hole chocolate",
        "triple vanilla nebula"
      ]
    },
    "pay": {
      "range": [
        60,
        85
      ]
    },
    "rival": {
      "name": {
        "pick": [
          "Glimmer Catering",
          "the Big Spoon van",
          "Madame Fourchette's cake barge"
        ]
      },
      "pace": {
        "pick": [
          0.9,
          0.93,
          0.95
        ]
      }
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.three-tiers.intro",
      "emotion": "deadpan",
      "direction": "Delivered like a security briefing, which it is, to him.",
      "text": "Guild wedding at Beacon Prime. Three-tier cake. The chef says if it's late, the marriage is cursed. I don't believe in curses. I do believe in the chef.",
      "choices": [
        {
          "label": "\"Cake. Got it.\"",
          "to": "kitchen"
        },
        {
          "label": "\"Do I get a slice?\" (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 7,
            "pass": "slice",
            "fail": "kitchen"
          }
        }
      ]
    },
    "slice": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.three-tiers.slice",
      "emotion": "dry",
      "direction": "Pretending this is a big concession.",
      "text": "If it arrives perfect, there's a slice in it for you. If it arrives late, there's a slice of you in it. Chef's words.",
      "set": {
        "promised": true
      },
      "choices": [
        {
          "label": "\"Deal.\"",
          "to": "kitchen"
        }
      ]
    },
    "kitchen": {
      "type": "dialogue",
      "beat": "A small sweating man in a very tall hat hovers over a cake the size of a cargo pod.",
      "speaker": "Chef Bontemps",
      "line": "chef.three-tiers.kitchen",
      "emotion": "worried",
      "direction": "A theatrical tenor on the edge of tears about frosting.",
      "text": "Gently! Gently! It is {flavour}, with sugar stars! If one star falls, I fall. Into the sea. There is no sea. I will find one!",
      "audioText": "Gently! Gently! It is my finest cake, with sugar stars! If one star falls, I fall. Into the sea. There is no sea. I will find one!",
      "choices": [
        {
          "label": "Strap it down properly (Constitution)",
          "check": {
            "stat": "con",
            "tag": "repair",
            "dc": 7,
            "pass": "strapped",
            "fail": "wobbly"
          }
        },
        {
          "label": "Run a shield cell as a cold field around it (1 Shield cell)",
          "to": "strapped",
          "cost": {
            "items": {
              "shield-cell": 1
            }
          }
        },
        {
          "label": "Just fly very, very carefully.",
          "to": "wobbly"
        }
      ]
    },
    "strapped": {
      "type": "dialogue",
      "speaker": null,
      "text": "Strapped, braced and humming in a cold field, the cake sits in your hold like royalty. It looks smug.",
      "set": {
        "safe": true
      },
      "choices": [
        {
          "label": "Plot the jump.",
          "to": "trip"
        }
      ]
    },
    "wobbly": {
      "type": "dialogue",
      "speaker": null,
      "text": "The cake goes in. The top tier leans a degree to the left. You both pretend not to notice.",
      "set": {
        "wobbly": true
      },
      "choices": [
        {
          "label": "Plot the jump.",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "Cake run",
      "to": "beacon",
      "risk": 0.1,
      "outcomes": {
        "arrived": "rival"
      }
    },
    "rival": {
      "type": "dialogue",
      "speaker": null,
      "text": "On the Beacon approach a second caterer pulls alongside: {rival.name}, with a cake twice as tall and half as tasteful. Beacon traffic has one wedding pad. First to land gets the wedding.",
      "choices": [
        {
          "label": "Race them to the pad.",
          "to": "race"
        },
        {
          "label": "Let them go. Slow and steady keeps the stars on.",
          "to": "late"
        },
        {
          "label": "Slip in by the ring's back door, lights off (Running Dark 2)",
          "to": "landed",
          "requires": {
            "skills": {
              "smuggler": 2
            }
          }
        }
      ]
    },
    "race": {
      "type": "race",
      "track": "gantry-drop",
      "rival": "$rival",
      "outcomes": {
        "win": "landed",
        "lose": "late"
      }
    },
    "landed": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "wobbly": true
            }
          },
          "to": "cake-check"
        }
      ],
      "else": "end-perfect"
    },
    "cake-check": {
      "type": "dialogue",
      "speaker": null,
      "text": "You landed first. In the hold, the top tier is leaning like a tired dancer, and three sugar stars are making a break for it.",
      "choices": [
        {
          "label": "Fix the frosting with a steady hand (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 7,
            "pass": "end-perfect",
            "fail": "end-squashed"
          }
        },
        {
          "label": "Deliver it as it is. It's art now.",
          "to": "end-modern"
        }
      ]
    },
    "late": {
      "type": "dialogue",
      "beat": "The other caterer got the pad. You land in the overflow bay and carry the cake in by hand.",
      "speaker": "Chef Bontemps",
      "line": "chef.three-tiers.late",
      "emotion": "excited",
      "direction": "Starts in despair, ends in rapture, all in one breath.",
      "text": "Late! LATE! The guests are eating crackers! ...But the cake. The cake is beautiful. I forgive you. Nobody else will.",
      "choices": [
        {
          "label": "Charm the wedding party (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "end-saved",
            "fail": "end-late"
          }
        },
        {
          "label": "Hand it over and back away slowly.",
          "to": "end-late"
        }
      ]
    },
    "end-perfect": {
      "type": "end",
      "result": "success",
      "outcome": "perfect",
      "title": "Perfect delivery",
      "beat": "Every tier upright, every star in place. The bride cries. The chef cries harder.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.three-tiers.perfect",
      "emotion": "dry",
      "direction": "Deadpan, then the tiniest crack of joy.",
      "text": "Chef sent me a slice. I gave it to Deputy. He's thriving. Well flown.",
      "reward": {
        "money": "$pay",
        "rep": {
          "hask": 8
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:three-tiers"
        ]
      }
    },
    "end-modern": {
      "type": "end",
      "result": "success",
      "outcome": "modern",
      "title": "Modern art",
      "beat": "The guests think the lean is on purpose. By dessert, so does the chef.",
      "speaker": "Chef Bontemps",
      "line": "chef.three-tiers.modern",
      "emotion": "excited",
      "direction": "Seized by sudden artistic inspiration, overjoyed.",
      "text": "It leans! Like a tower of love! I will call it a new style. The Leaning Wedding! Genius! Mine, of course.",
      "reward": {
        "money": 50,
        "rep": {
          "hask": 5
        },
        "unlocks": [
          "badge:three-tiers"
        ]
      }
    },
    "end-saved": {
      "type": "end",
      "result": "success",
      "outcome": "saved",
      "title": "Saved the party",
      "beat": "You tell the crowd the delay was for luck. It is now a Guild wedding tradition.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.three-tiers.saved",
      "emotion": "deadpan",
      "direction": "Reading a report he cannot quite believe.",
      "text": "I'm told you gave a speech. And the groom's mother kissed you. Late, but nobody's cursed. I'll allow it.",
      "reward": {
        "money": 40,
        "rep": {
          "hask": 4
        },
        "unlocks": [
          "badge:three-tiers"
        ]
      }
    },
    "end-squashed": {
      "type": "end",
      "result": "failure",
      "outcome": "squashed",
      "title": "Squashed",
      "beat": "Your thumb goes through the second tier. Then the second tier goes through the first.",
      "speaker": "Chef Bontemps",
      "line": "chef.three-tiers.squashed",
      "emotion": "worried",
      "direction": "Grief, operatic and total.",
      "text": "My stars. My beautiful stars. I am going to go and find that sea now.",
      "reward": {
        "rep": {
          "hask": -3
        }
      }
    },
    "end-late": {
      "type": "end",
      "result": "failure",
      "outcome": "late",
      "title": "Late to the wedding",
      "beat": "The cake is eaten, eventually. Nobody says thank you.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.three-tiers.late",
      "emotion": "dry",
      "direction": "Weary, reporting the damage.",
      "text": "They had crackers. At a wedding. The Guild is sending me a strongly worded card.",
      "reward": {
        "rep": {
          "hask": -4
        }
      }
    }
  }
};
