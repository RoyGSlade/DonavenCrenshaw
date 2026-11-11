// Vey, "The Teapot Job". Steal Edna's mother's teapot back from a duchess's yacht for Vey.
// A party (bad food, a card game), a laundry chute, a swan safe, a brawl. Delivering it makes
// Edna like you (flag edna-teapot: a discount in her back room).
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "teapot",
  "title": "The Teapot Job",
  "giver": "vey",
  "location": "beacon",
  "summary": "Vey owes Edna a teapot. It is on a duchess's yacht. Go and get it.",
  "pitch": {
    "line": "vey.job.teapot",
    "emotion": "sly",
    "direction": "Charming, and quietly terrified of Edna.",
    "text": "A duchess has a teapot that belongs to Edna. I owe Edna. You see my problem."
  },
  "rolls": {
    "yacht": {
      "pick": [
        "the Gilded Yawn",
        "the Lady Overture",
        "the Very Expensive"
      ]
    },
    "guards": {
      "enemy": "guards"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.intro",
      "emotion": "worried",
      "direction": "The one job he is nervous about, played as charm.",
      "text": "I owe Edna a teapot. A very particular teapot, on a very particular yacht, owned by a very particular duchess. I'm a broker, not a burglar. You have the face for it.",
      "choices": [
        {
          "label": "\"Why not just buy her a new one?\"",
          "to": "why"
        },
        {
          "label": "\"I'm in.\"",
          "to": "yacht"
        }
      ]
    },
    "why": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.why",
      "emotion": "deadpan",
      "direction": "Absolutely serious.",
      "text": "You've met Edna. Would you hand her a new teapot? Would you explain it?",
      "choices": [
        {
          "label": "\"Fair point.\"",
          "to": "yacht"
        }
      ]
    },
    "yacht": {
      "type": "dialogue",
      "speaker": null,
      "text": "The {yacht} glitters at the Beacon's rich dock: gold trim, four guards, a string quartet. The duchess is hosting tea. The canapes look suspicious.",
      "choices": [
        {
          "label": "Crash the party as a guest (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "party",
            "fail": "guards"
          }
        },
        {
          "label": "Come in through the laundry chute (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 7,
            "pass": "galley",
            "fail": "guards"
          }
        },
        {
          "label": "Pick the service lock (Lockpick, or a breach kit)",
          "to": "galley",
          "requires": {
            "anyOf": [
              {
                "skills": {
                  "lockpick": 1
                }
              },
              {
                "items": {
                  "breach-kit": 1
                }
              }
            ]
          }
        }
      ]
    },
    "guards": {
      "type": "fight",
      "mode": "foot",
      "title": "Yacht guards",
      "enemy": "$guards",
      "dc": 8,
      "outcomes": {
        "win": "galley",
        "lose": "out-of-ammo",
        "flee": "end-empty"
      }
    },
    "out-of-ammo": {
      "type": "dialogue",
      "speaker": null,
      "text": "Your last shot pings off a golden swan. The biggest guard rolls up his very nice sleeves.",
      "choices": [
        {
          "label": "Swing for him (Strength)",
          "check": {
            "stat": "str",
            "tag": "brawl",
            "dc": 8,
            "pass": "galley",
            "fail": "end-thrown"
          }
        },
        {
          "label": "Surrender politely.",
          "to": "end-thrown"
        }
      ]
    },
    "party": {
      "type": "dialogue",
      "speaker": "Duchess Orla",
      "line": "collector.teapot.party",
      "emotion": "deadpan",
      "direction": "A plummy bored drawl, every word a yawn.",
      "text": "Oh. A courier. How rustic. Do try a prawn. They're a week old, it's a delicacy. And then cards. We play for teapots.",
      "choices": [
        {
          "label": "Eat the prawn, to fit in (Health)",
          "check": {
            "stat": "con",
            "tag": "food",
            "dc": 8,
            "pass": "cards",
            "fail": "end-prawn"
          }
        },
        {
          "label": "Decline the prawn and sit down to cards.",
          "to": "cards"
        }
      ]
    },
    "cards": {
      "type": "dialogue",
      "speaker": null,
      "text": "The duchess deals. She cheats, beautifully. The teapot sits in the middle of the table as the stake.",
      "choices": [
        {
          "label": "Play her straight (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "gamble",
            "dc": 8,
            "pass": "won",
            "fail": "end-lost-hand"
          }
        },
        {
          "label": "Swap the pot while she shuffles (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 8,
            "pass": "swapped",
            "fail": "guards"
          }
        },
        {
          "label": "Swap in a marked deck of your own (Trader 2)",
          "to": "won",
          "requires": {
            "skills": {
              "trader": 2
            }
          }
        }
      ]
    },
    "won": {
      "type": "dialogue",
      "speaker": "Duchess Orla",
      "line": "collector.teapot.won",
      "emotion": "dry",
      "direction": "Bored even by losing.",
      "text": "Beaten by a courier. How novel. Take the silly pot. I have nine.",
      "choices": [
        {
          "label": "Bow and leave.",
          "to": "swapped"
        }
      ]
    },
    "galley": {
      "type": "dialogue",
      "speaker": null,
      "text": "Below decks: silver, steam and a safe shaped like a swan. The teapot is inside. Of course it is.",
      "choices": [
        {
          "label": "Crack the swan.",
          "to": "swan"
        }
      ]
    },
    "swan": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Swan safe",
      "params": {
        "title": "Swan safe",
        "length": 4,
        "symbols": 5,
        "attempts": 6
      },
      "outcomes": {
        "solved": "swapped",
        "failed": "alarm"
      }
    },
    "alarm": {
      "type": "dialogue",
      "speaker": null,
      "text": "The swan honks. Loudly. It is an alarm, and it has been waiting its whole life for this.",
      "choices": [
        {
          "label": "Run for it (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 7,
            "pass": "end-empty",
            "fail": "end-thrown"
          }
        }
      ]
    },
    "swapped": {
      "type": "dialogue",
      "speaker": null,
      "text": "The teapot is in your coat. It is warm. It still has tea in it.",
      "choices": [
        {
          "label": "Take it to Edna.",
          "to": "edna"
        },
        {
          "label": "Keep it. It is a really nice teapot.",
          "to": "end-kept"
        }
      ]
    },
    "edna": {
      "type": "dialogue",
      "beat": "Edna lifts the lid, sniffs, and goes very still.",
      "speaker": "Edna",
      "line": "edna.teapot.home",
      "emotion": "tender",
      "direction": "Very quiet, the sweetness turned real, a catch in her voice.",
      "text": "My mother's teapot. Lucan swore it was lost. Oh, duckling. You'll not pay full price in my back room again.",
      "choices": [
        {
          "label": "Tell Vey it's done.",
          "to": "end-delivered"
        }
      ]
    },
    "end-delivered": {
      "type": "end",
      "result": "success",
      "outcome": "delivered",
      "title": "Teapot home",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.delivered",
      "emotion": "worried",
      "direction": "Trying to stay cool, desperate to know.",
      "text": "She cried? Edna cried? ...Did she say anything about me? No. Don't tell me. Here's your fee. Tell me later.",
      "reward": {
        "money": 100,
        "rep": {
          "vey": 12
        },
        "skillPoints": 1,
        "flags": {
          "edna-teapot": 1
        },
        "unlocks": [
          "badge:teapot"
        ]
      }
    },
    "end-kept": {
      "type": "end",
      "result": "success",
      "outcome": "kept",
      "title": "Kept it",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.kept",
      "emotion": "sly",
      "direction": "Disbelief, then admiration, then panic.",
      "text": "You kept it. You kept Edna's teapot. I admire that. I also want to be nowhere near you when she finds out.",
      "reward": {
        "money": 20,
        "rep": {
          "vey": -5
        },
        "flags": {
          "kept-teapot": 1
        },
        "unlocks": [
          "badge:teapot"
        ]
      }
    },
    "end-thrown": {
      "type": "end",
      "result": "failure",
      "outcome": "thrown-overboard",
      "title": "Thrown off the yacht",
      "beat": "Four guards carry you down the gangway and drop you on the dock, gently, like rubbish.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.thrown",
      "emotion": "dry",
      "direction": "Dry, reading a complaint letter.",
      "text": "The duchess has sent me a bill for one swan and one quartet's emotional damages. You're paying half.",
      "reward": {
        "money": -30,
        "rep": {
          "vey": -3
        }
      }
    },
    "end-empty": {
      "type": "end",
      "result": "failure",
      "outcome": "empty-handed",
      "title": "Empty-handed",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.empty",
      "emotion": "worried",
      "direction": "Genuine dread.",
      "text": "No teapot. So I still owe her. Do you know what Edna does to people who owe her? Neither do I. Nobody has ever come back to say.",
      "reward": {
        "rep": {
          "vey": -2
        }
      }
    },
    "end-lost-hand": {
      "type": "end",
      "result": "failure",
      "outcome": "lost-hand",
      "title": "Lost at cards",
      "speaker": "Duchess Orla",
      "line": "collector.teapot.lostcards",
      "emotion": "deadpan",
      "direction": "Perfectly bored triumph.",
      "text": "Your docking fee is mine now. Do come again. You're terrible. It's refreshing.",
      "reward": {
        "money": -40,
        "rep": {
          "vey": -2
        }
      }
    },
    "end-prawn": {
      "type": "end",
      "result": "failure",
      "outcome": "prawn",
      "title": "The prawn",
      "beat": "The prawn has opinions. You spend the rest of the party in the duchess's very fancy washroom.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.teapot.prawn",
      "emotion": "playful",
      "direction": "Trying very hard not to laugh.",
      "text": "You ate the week-old prawn. At a duchess's party. In front of the quartet. Go lie down, darling. We'll try again when you're less green.",
      "reward": {
        "rep": {
          "vey": -1
        }
      }
    }
  }
};
