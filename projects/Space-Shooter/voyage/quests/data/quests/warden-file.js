// Vey, "The Warden File". STORY CHAIN: opens after the Railgun (fragment 2). Get your own
// licence file from the Guild Records Hall before the purge: forms, the stacks, a race with the purge
// drone. Wins: delivered, kept. Fails: rejected, purged. Sets lead-file.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "warden-file",
  "title": "The Warden File",
  "giver": "vey",
  "location": "beacon",
  "summary": "The Guild purges its old Warden records tonight. One of them is your licence file.",
  "requires": {
    "flags": {
      "fragment-2": 1
    }
  },
  "rolls": {
    "fee": {
      "range": [
        30,
        50
      ]
    },
    "drone": {
      "name": "the purge drone",
      "pace": {
        "pick": [
          0.9,
          0.93,
          0.96
        ]
      }
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.warden-file.intro",
      "emotion": "sly",
      "direction": "Excited and hiding it under velvet, the broker on a real secret.",
      "text": "That railgun's paperwork had your licence on it, so I went looking. The Guild has a file on that licence, and tonight they purge every old Warden record. I want that file. You want it more.",
      "choices": [
        {
          "label": "\"Where's the hall?\"",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "To the Records Hall",
      "to": "alpha",
      "risk": 0.1,
      "outcomes": {
        "arrived": "hall"
      }
    },
    "hall": {
      "type": "dialogue",
      "beat": "The Records Hall is one long dark room, one bulb, and one tiny old man.",
      "speaker": "Archivist Pell",
      "line": "archivist.warden-file.hall",
      "emotion": "excited",
      "direction": "A dusty whisper, thrilled to have a visitor.",
      "text": "Visitors! Oh my. Nobody visits. Do you have a form? Everybody needs a form. I do love a form.",
      "choices": [
        {
          "label": "Fill in a records request properly (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "puzzle",
            "dc": 7,
            "pass": "stamped",
            "fail": "wrong"
          }
        },
        {
          "label": "Slide {fee} credits under the blotter",
          "to": "sad",
          "cost": {
            "money": "$fee"
          }
        },
        {
          "label": "Show your Guild permit",
          "to": "stamped",
          "requires": {
            "items": {
              "permit": 1
            }
          }
        },
        {
          "label": "Bring him a flask of Edna's tea",
          "to": "stamped",
          "requires": {
            "flags": {
              "edna-teapot": 1
            }
          },
          "lockedHint": "Somebody's grandmother would have to like you first"
        }
      ]
    },
    "sad": {
      "type": "dialogue",
      "speaker": "Archivist Pell",
      "line": "archivist.warden-file.sad",
      "emotion": "worried",
      "direction": "Hurt, kind, embarrassed for you.",
      "text": "Oh. Oh dear. Put that away. I'll pretend I didn't see. Let's try the form, shall we?",
      "onEnter": {
        "money": 10
      },
      "choices": [
        {
          "label": "\"Sorry. The form.\"",
          "to": "wrong"
        }
      ]
    },
    "wrong": {
      "type": "dialogue",
      "speaker": "Archivist Pell",
      "line": "archivist.warden-file.wrong",
      "emotion": "worried",
      "direction": "Apologetic fussing over paper.",
      "text": "Oh, that's a 7-F. You want a 7-G. Or a 12. It's so hard to tell in this light.",
      "choices": [
        {
          "label": "Ask him to help you fill it in (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 7,
            "pass": "stamped",
            "fail": "end-rejected"
          }
        },
        {
          "label": "Find the file yourself in the stacks",
          "to": "stacks"
        },
        {
          "label": "Query the hall's old index terminal (Hacker)",
          "to": "found-file",
          "requires": {
            "skills": {
              "hacker": 1
            }
          }
        }
      ]
    },
    "stacks": {
      "type": "dialogue",
      "speaker": null,
      "text": "The stacks go up forever, lit by one bulb. Somewhere far off, the purge drone starts its rounds with a soft vacuum hum.",
      "choices": [
        {
          "label": "Work out the filing system.",
          "to": "index"
        }
      ]
    },
    "index": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Archive index",
      "params": {
        "title": "Archive index",
        "length": 3,
        "symbols": 6,
        "attempts": 5
      },
      "outcomes": {
        "solved": "found-file",
        "failed": "end-purged"
      }
    },
    "stamped": {
      "type": "dialogue",
      "speaker": "Archivist Pell",
      "line": "archivist.warden-file.stamped",
      "emotion": "warm",
      "direction": "Gleeful, then urgent.",
      "text": "Approved! Aisle nine, top shelf. Do hurry, dear. The purge drone starts at the far end, and it is very thorough.",
      "choices": [
        {
          "label": "Run for it.",
          "to": "race"
        },
        {
          "label": "Pick the lock on the restricted stacks (Lockpick 2)",
          "to": "found-file",
          "requires": {
            "skills": {
              "lockpick": 2
            }
          }
        }
      ]
    },
    "race": {
      "type": "race",
      "track": "abandoned-mall",
      "rival": "$drone",
      "outcomes": {
        "win": "found-file",
        "lose": "end-purged"
      }
    },
    "found-file": {
      "type": "dialogue",
      "speaker": null,
      "text": "The file is thin. Inside: one courier licence, issued the night the gates went dark, never flown. Countersigned by the courier yard at Alpha Relay. Chibby's yard.",
      "choices": [
        {
          "label": "Take it to Vey.",
          "to": "end-delivered"
        },
        {
          "label": "Keep it. It's yours.",
          "to": "end-kept"
        }
      ]
    },
    "end-delivered": {
      "type": "end",
      "result": "success",
      "outcome": "delivered",
      "title": "The file",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.warden-file.delivered",
      "emotion": "worried",
      "direction": "The velvet slips; he is genuinely moved and a bit worried.",
      "text": "Chibby's yard. Our sweet mechanic signed for the last courier the Wardens ever made. Go home and ask him. Nicely. He'll have been dreading it for twenty years.",
      "reward": {
        "money": 110,
        "rep": {
          "vey": 10
        },
        "skillPoints": 1,
        "flags": {
          "lead-file": 1
        },
        "unlocks": [
          "badge:warden-file"
        ]
      }
    },
    "end-kept": {
      "type": "end",
      "result": "success",
      "outcome": "kept",
      "title": "Kept your own file",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.warden-file.kept",
      "emotion": "sly",
      "direction": "Approving, a little proud of you.",
      "text": "You kept it. I'd have done the same. I'd have charged me for it, too. Good. You're learning.",
      "reward": {
        "rep": {
          "vey": 3
        },
        "skillPoints": 1,
        "flags": {
          "lead-file": 1
        },
        "unlocks": [
          "badge:warden-file"
        ]
      }
    },
    "end-rejected": {
      "type": "end",
      "result": "failure",
      "outcome": "rejected",
      "title": "Wrong form",
      "speaker": "Archivist Pell",
      "line": "archivist.warden-file.rejected",
      "emotion": "tender",
      "direction": "Truly sorry, patting your hand.",
      "text": "I'm so sorry, dear. Rules are rules. Come back tomorrow. Oh. There won't be a tomorrow, for those files. Oh dear.",
      "reward": {
        "rep": {
          "vey": -2
        }
      }
    },
    "end-purged": {
      "type": "end",
      "result": "failure",
      "outcome": "purged",
      "title": "Purged",
      "beat": "The purge drone hums past aisle nine and swallows the top shelf whole.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.warden-file.purged",
      "emotion": "grumpy",
      "direction": "Cross with the Guild, not with you.",
      "text": "Gone. Twenty years of Warden records, vacuumed into a drone. The Guild calls it tidying. I call it a crime. A boring one.",
      "reward": {
        "rep": {
          "vey": -4
        }
      }
    }
  }
};
