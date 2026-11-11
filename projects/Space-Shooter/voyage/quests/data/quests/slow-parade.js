// Hask, "The Slow Parade". Escort a pilgrim convoy from Alpha Relay to Dustfall: a ship fight,
// then an on-foot fight in a hauler's galley. Hull patches and medkits from the hangar shops help.
// Wins: all six home, most of them, Nana handled it. Fails: scattered, left one behind.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "slow-parade",
  "title": "The Slow Parade",
  "giver": "hask",
  "location": "alpha",
  "summary": "Escort six pilgrim haulers to Dustfall. Slow ships, sweet grandmothers, rude raiders.",
  "repeatable": true,
  "rolls": {
    "pay": {
      "range": [
        80,
        110
      ]
    },
    "raider": {
      "enemy": "raider"
    },
    "boarders": {
      "enemy": "boarders"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.slow-parade.intro",
      "emotion": "neutral",
      "direction": "Flat briefing voice, one dry joke tucked in.",
      "text": "Pilgrim convoy to Dustfall. Six old haulers and the slowest grandmothers in the Drift. Raiders love a slow target. Keep them together. All of them.",
      "choices": [
        {
          "label": "\"Wagons out.\"",
          "to": "meet"
        }
      ]
    },
    "meet": {
      "type": "dialogue",
      "beat": "The lead hauler is painted with flowers. So are the other five.",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.meet",
      "emotion": "warm",
      "direction": "A chatty grandmother on her first big trip, offering snacks.",
      "text": "Oh, you're the escort? You're very young. Have a biscuit. Have two. We're right behind you, dear. Quite far behind you.",
      "choices": [
        {
          "label": "\"Thank you, ma'am.\"",
          "to": "trip"
        },
        {
          "label": "\"Could the convoy go any faster?\" (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 7,
            "pass": "faster",
            "fail": "trip"
          }
        },
        {
          "label": "Eat the grey biscuit, to be polite (Health)",
          "check": {
            "stat": "con",
            "tag": "food",
            "dc": 7,
            "pass": "biscuit-ok",
            "fail": "biscuit-bad"
          }
        }
      ]
    },
    "faster": {
      "type": "dialogue",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.faster",
      "emotion": "playful",
      "direction": "Delighted to be asked, a little cackle.",
      "text": "Faster? Ooh. Girls! Take the knitting off the throttles!",
      "set": {
        "quick": true
      },
      "choices": [
        {
          "label": "Plot the jump.",
          "to": "trip"
        }
      ]
    },
    "biscuit-ok": {
      "type": "dialogue",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.biscuit",
      "emotion": "proud",
      "direction": "Thrilled, a grandmother whose cooking was finally appreciated.",
      "text": "You ate it! Nobody eats the grey ones. You're a good one, dear. I'll tell the girls.",
      "set": {
        "friend": true
      },
      "choices": [
        {
          "label": "Plot the jump.",
          "to": "trip"
        }
      ]
    },
    "biscuit-bad": {
      "type": "dialogue",
      "speaker": null,
      "text": "The grey biscuit fights back. You spend the first jump sitting very still with the airlock door open.",
      "hull": -5,
      "choices": [
        {
          "label": "Plot the jump. Slowly.",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "The parade",
      "to": "dustfall",
      "risk": 0.2,
      "outcomes": {
        "arrived": "raid"
      }
    },
    "raid": {
      "type": "dialogue",
      "beat": "Halfway to Dustfall a raider drops out of the dust right in front of the lead hauler.",
      "speaker": "{raider.name}",
      "line": "raider.slow-parade.raid",
      "emotion": "playful",
      "direction": "A raider having the best day of his life, mocking.",
      "text": "Lovely parade! We'll take the last float. And the biscuits. Mostly the biscuits.",
      "choices": [
        {
          "label": "Guns hot.",
          "to": "fight"
        },
        {
          "label": "Herd the convoy into the debris where he can't follow (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "nav",
            "dc": 8,
            "pass": "end-all-home",
            "fail": "fight"
          }
        },
        {
          "label": "Barrel-roll round the convoy so he can never line up a shot (Pilot 3)",
          "to": "end-all-home",
          "requires": {
            "skills": {
              "pilot": 3
            }
          }
        },
        {
          "label": "Broadcast Edna's Syndicate codes",
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
    "codes": {
      "type": "dialogue",
      "speaker": "{raider.name}",
      "line": "raider.slow-parade.codes",
      "emotion": "worried",
      "direction": "Instantly polite, backing away.",
      "text": "Syndicate codes. On a biscuit convoy. I'm not asking. Enjoy your parade, ladies.",
      "choices": [
        {
          "label": "Wave him off.",
          "to": "end-all-home"
        }
      ]
    },
    "fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Convoy raider",
      "enemy": "$raider",
      "outcomes": {
        "win": "boarded",
        "parley": "boarded",
        "lose": "patch",
        "flee": "end-scattered"
      }
    },
    "patch": {
      "type": "dialogue",
      "speaker": null,
      "text": "Your hull is open to the stars and the raider is swinging round for another pass at the haulers.",
      "choices": [
        {
          "label": "Slap on a hull patch and get back in (1 Hull patch)",
          "to": "patched",
          "cost": {
            "items": {
              "hull-patch": 1
            }
          }
        },
        {
          "label": "Cut and run.",
          "to": "end-scattered"
        },
        {
          "label": "Let him have the last hauler.",
          "to": "end-abandoned"
        }
      ]
    },
    "patched": {
      "type": "dialogue",
      "speaker": null,
      "text": "The patch hisses into place. Good as new. Well. Good as old.",
      "hull": 40,
      "choices": [
        {
          "label": "Back in.",
          "to": "fight"
        }
      ]
    },
    "boarded": {
      "type": "dialogue",
      "beat": "The raider limps off. Then the last hauler's comms crackle.",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.boarded",
      "emotion": "worried",
      "direction": "More cross than scared, banging in the background.",
      "text": "Escort, dear? Two of his friends got aboard before you shot his ship. They're in the galley. They're eating the biscuits!",
      "choices": [
        {
          "label": "Dock and go in after them.",
          "to": "galley"
        },
        {
          "label": "Walk into the galley cracking your knuckles (Brawler)",
          "to": "end-all-home",
          "requires": {
            "skills": {
              "brawler": 1
            }
          }
        },
        {
          "label": "Talk them out over the hauler's speakers (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "end-all-home",
            "fail": "galley"
          }
        }
      ]
    },
    "galley": {
      "type": "fight",
      "mode": "foot",
      "title": "Galley boarders",
      "enemy": "$boarders",
      "dc": 7,
      "outcomes": {
        "win": "end-all-home",
        "lose": "galley-down",
        "flee": "end-most-home"
      }
    },
    "galley-down": {
      "type": "dialogue",
      "speaker": null,
      "text": "They put you on the galley floor. A grandmother steps over you, holding a rolling pin.",
      "choices": [
        {
          "label": "Jab a medkit and get back up (1 Medkit)",
          "to": "galley",
          "cost": {
            "items": {
              "medkit": 1
            }
          }
        },
        {
          "label": "Your sidearm is empty. Get up and punch him (Strength)",
          "check": {
            "stat": "str",
            "tag": "brawl",
            "dc": 8,
            "pass": "end-all-home",
            "fail": "end-nana"
          }
        },
        {
          "label": "Let Nana handle it.",
          "to": "end-nana"
        }
      ]
    },
    "end-all-home": {
      "type": "end",
      "result": "success",
      "outcome": "all-home",
      "title": "All six home",
      "beat": "The parade rolls into Dustfall to cheers, horns and a brass band that is mostly one tuba.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.slow-parade.home",
      "emotion": "warm",
      "direction": "As warm as Hask gets, which is lukewarm and sincere.",
      "text": "Six haulers out, six haulers in. The grandmothers knitted Deputy a scarf. He looks ridiculous. He loves it.",
      "reward": {
        "money": "$pay",
        "rep": {
          "hask": 10
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:slow-parade"
        ]
      }
    },
    "end-most-home": {
      "type": "end",
      "result": "success",
      "outcome": "most-home",
      "title": "Most of the parade",
      "beat": "You back out of the galley. The boarders keep the snacks and ride the last hauler in like guests.",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.most",
      "emotion": "grumpy",
      "direction": "Cross, then forgiving, a grandmother scolding.",
      "text": "They got away with every biscuit. Every one! ...Still. You brought us home, dear. That's the main thing.",
      "reward": {
        "money": 50,
        "rep": {
          "hask": 4
        },
        "unlocks": [
          "badge:slow-parade"
        ]
      }
    },
    "end-nana": {
      "type": "end",
      "result": "success",
      "outcome": "nana",
      "title": "Nana handled it",
      "beat": "When you come round, both boarders are tied up with knitting wool.",
      "speaker": "Nana Opaline",
      "line": "nana.slow-parade.nana",
      "emotion": "proud",
      "direction": "Breathless and very pleased with herself.",
      "text": "Forty years on a mining rig, dear. Nobody touches my biscuits. Up you get. Have one, you've earned it.",
      "reward": {
        "money": 60,
        "rep": {
          "hask": 6
        },
        "unlocks": [
          "badge:slow-parade"
        ]
      }
    },
    "end-scattered": {
      "type": "end",
      "result": "failure",
      "outcome": "scattered",
      "title": "Scattered",
      "beat": "The convoy breaks and scatters into the dust. Guild tugs spend all night rounding them up.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.slow-parade.scattered",
      "emotion": "worried",
      "direction": "Tired worry, reading tow reports.",
      "text": "The haulers are in pieces all over the lane. The grandmothers are fine. They're furious. They've written to me.",
      "reward": {
        "rep": {
          "hask": -5
        }
      }
    },
    "end-abandoned": {
      "type": "end",
      "result": "failure",
      "outcome": "abandoned",
      "title": "Left one behind",
      "beat": "Five haulers make it to Dustfall. The sixth is towed away into the dark, still waving.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.slow-parade.abandoned",
      "emotion": "grumpy",
      "direction": "Very quiet, very disappointed.",
      "text": "You left a hauler. With a grandmother on it. We'll get her back. You'll be paying for the ransom biscuits.",
      "reward": {
        "money": 30,
        "rep": {
          "hask": -8
        }
      }
    }
  }
};
