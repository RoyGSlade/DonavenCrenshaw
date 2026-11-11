// Garrity, "Black Box". STORY CHAIN: opens after Dead Weight (fragment 3). A sealed Warden courier
// ship, the Choir, an on-foot fight with its sentries. DEADLY: going down on foot can kill the captain.
// Star Charts 2 and Slicer 2 open other ways in. Sets lead-nightjar.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "black-box",
  "title": "Black Box",
  "giver": "garrity",
  "location": "dustfall",
  "summary": "The hulk's log points to a sealed Warden courier ship deep in the field. Deadly.",
  "requires": {
    "flags": {
      "fragment-3": 1
    }
  },
  "rolls": {
    "choir": {
      "enemy": "choir"
    },
    "sentries": {
      "enemy": "sentries"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.intro",
      "emotion": "worried",
      "direction": "For once he is not laughing. Slow, careful, a warning.",
      "text": "That hulk's log had coordinates. A Warden courier ship, deep in the field, sealed twenty years. Another courier, kid. Before you. Careful in there. Things that've waited that long don't like visitors.",
      "choices": [
        {
          "label": "\"I'll be careful.\"",
          "to": "out"
        }
      ]
    },
    "out": {
      "type": "event",
      "title": "Deep into the field",
      "deck": [
        "scav-claim",
        "distress"
      ],
      "chance": 0.4,
      "next": "wreck"
    },
    "wreck": {
      "type": "dialogue",
      "speaker": null,
      "text": "The courier ship sits in the dust as if it is asleep. Its name is still on the hull: NIGHTJAR. A violet lantern hangs beside it. The Choir got here first.",
      "choices": [
        {
          "label": "Hail the Choir.",
          "to": "acolyte"
        },
        {
          "label": "Slip past them to the airlock (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 8,
            "pass": "airlock",
            "fail": "acolyte"
          }
        },
        {
          "label": "Thread the dark rocks to Nightjar's cargo hatch (Navigator 2)",
          "to": "airlock",
          "requires": {
            "skills": {
              "navigator": 2
            }
          }
        }
      ]
    },
    "acolyte": {
      "type": "dialogue",
      "speaker": "A Choir acolyte",
      "line": "acolyte.black-box.wait",
      "emotion": "tender",
      "direction": "Soft and sure, almost kind.",
      "text": "Courier. You came to read her last words. We came to listen. Go in. We'll wait. We are very good at waiting.",
      "choices": [
        {
          "label": "\"Thanks. I think.\"",
          "to": "airlock"
        },
        {
          "label": "\"Back off. This is Garrity's find.\"",
          "to": "choir-fight"
        }
      ]
    },
    "choir-fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Choir lanterns",
      "enemy": "$choir",
      "outcomes": {
        "win": "airlock",
        "parley": "airlock",
        "lose": "end-driven",
        "flee": "end-driven"
      }
    },
    "airlock": {
      "type": "dialogue",
      "speaker": null,
      "text": "Inside it is cold, dark and very tidy. Somebody left a mug on the console twenty years ago. Then the sentries wake up.",
      "choices": [
        {
          "label": "Fight through.",
          "to": "sentry-fight"
        },
        {
          "label": "Hack the sentries from the airlock's sealed panel (Hacker 2)",
          "to": "console",
          "requires": {
            "skills": {
              "hacker": 2
            }
          }
        },
        {
          "label": "Jam them with a breach kit",
          "to": "console",
          "requires": {
            "items": {
              "breach-kit": 1
            }
          },
          "hideLocked": true
        }
      ]
    },
    "sentry-fight": {
      "type": "fight",
      "mode": "foot",
      "title": "Nightjar sentries",
      "enemy": "$sentries",
      "dc": 8,
      "outcomes": {
        "win": "console",
        "lose": "down",
        "flee": "end-ran"
      }
    },
    "down": {
      "type": "dialogue",
      "speaker": null,
      "text": "A sentry's shot puts you on the deck. The cold creeps in fast.",
      "choices": [
        {
          "label": "Jab a medkit and get up (1 Medkit)",
          "to": "sentry-fight",
          "cost": {
            "items": {
              "medkit": 1
            }
          }
        },
        {
          "label": "Crawl for the airlock (Health)",
          "check": {
            "stat": "con",
            "tag": "endure",
            "dc": 8,
            "pass": "end-ran",
            "fail": "end-lost"
          }
        }
      ]
    },
    "console": {
      "type": "dialogue",
      "speaker": null,
      "text": "The black box is still warm. It plays one message: a woman's voice, tired and kind.",
      "choices": [
        {
          "label": "Listen.",
          "to": "message"
        }
      ]
    },
    "message": {
      "type": "dialogue",
      "speaker": "Courier Tamsin Holt",
      "line": "tamsin.black-box.message",
      "emotion": "tender",
      "direction": "Tired and kind, a last message recorded alone, steady to the end.",
      "text": "This is Nightjar, Warden courier, signing off. The gates are going dark. If you're hearing this, you're the next licence on the list. Go to the Veil. Tell them I tried.",
      "choices": [
        {
          "label": "Copy the box for Garrity.",
          "to": "end-copied"
        },
        {
          "label": "Take the box itself.",
          "to": "end-taken"
        },
        {
          "label": "Leave her be. Let the Choir sing for her.",
          "to": "end-left"
        }
      ]
    },
    "end-copied": {
      "type": "end",
      "result": "success",
      "outcome": "copied",
      "title": "Her last words",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.copied",
      "emotion": "tender",
      "direction": "Very quiet, the big man shaken, gentle.",
      "text": "The next licence on the list. That's you, kid. Go and see Chibby. Take the long way home. Have a think.",
      "reward": {
        "money": 100,
        "rep": {
          "garrity": 10
        },
        "skillPoints": 1,
        "flags": {
          "lead-nightjar": 1
        },
        "unlocks": [
          "badge:black-box"
        ]
      }
    },
    "end-taken": {
      "type": "end",
      "result": "success",
      "outcome": "taken",
      "title": "Brought her home",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.taken",
      "emotion": "tender",
      "direction": "Soft, meaning every word.",
      "text": "I'll put her somewhere safe. Somewhere nobody sells. I've never had one of those before.",
      "reward": {
        "items": {
          "circuit": 2
        },
        "rep": {
          "garrity": 8
        },
        "skillPoints": 1,
        "flags": {
          "lead-nightjar": 1
        },
        "unlocks": [
          "badge:black-box"
        ]
      }
    },
    "end-left": {
      "type": "end",
      "result": "success",
      "outcome": "left",
      "title": "Let her rest",
      "beat": "Outside, the lanterns brighten, and the Choir begins a slow song.",
      "speaker": "A Choir acolyte",
      "line": "acolyte.black-box.left",
      "emotion": "tender",
      "direction": "Grateful, a whisper, as the song begins.",
      "text": "Thank you, courier. We will sing her home. When it is your turn, we will sing for you too.",
      "reward": {
        "rep": {
          "garrity": 2
        },
        "skillPoints": 1,
        "flags": {
          "lead-nightjar": 1,
          "choir-favour": 1
        },
        "unlocks": [
          "badge:black-box"
        ]
      }
    },
    "end-driven": {
      "type": "end",
      "result": "failure",
      "outcome": "driven-off",
      "title": "Driven off",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.driven",
      "emotion": "warm",
      "direction": "Relieved you are back at all.",
      "text": "The Choir chased you off? Then they're guarding something. Get patched up, kid. She's waited twenty years. She'll wait.",
      "reward": {
        "rep": {
          "garrity": -3
        }
      }
    },
    "end-ran": {
      "type": "end",
      "result": "failure",
      "outcome": "ran",
      "title": "Got out",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.ran",
      "emotion": "worried",
      "direction": "Shaken, glad, gruff to cover it.",
      "text": "You crawled out of a dead ship with sentries on your heels. Good. Alive is the job. The box can wait.",
      "reward": {
        "rep": {
          "garrity": -2
        }
      }
    },
    "end-lost": {
      "type": "end",
      "result": "failure",
      "outcome": "lost",
      "title": "Lost in the cold",
      "beat": "The cold wins. Garrity tows you home himself.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.black-box.lost",
      "emotion": "tender",
      "direction": "Barely holding together, very soft.",
      "text": "Found you on her deck, not breathing. The med bay brought you back. Mostly. I told you, kid. I told you.",
      "death": true,
      "reward": {
        "money": -30,
        "rep": {
          "garrity": -2
        }
      }
    }
  }
};
