// Vey, "The Listening Gate". Out to Iron Veil. Story fragment 5. The four-glyph seal riddle
// (the parked seal's glyphs, rolled order and rule) guards the gate; the Choir is there.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "listening-gate",
  "title": "The Listening Gate",
  "giver": "vey",
  "location": "beacon",
  "summary": "Carry a Warden gate key to the Iron Veil and open the old gate. The Choir is listening.",
  "rolls": {
    "riddle": {
      "mode": {
        "pick": [
          "reverse",
          "same"
        ]
      }
    },
    "choir": {
      "enemy": "choir"
    },
    "mood": {
      "pick": [
        "singing",
        "silent"
      ]
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.listening-gate.intro",
      "emotion": "worried",
      "direction": "Hushed, for once not smiling.",
      "text": "A gate key. Warden make. A buyer wants the Iron Veil gate opened and doesn't want to be seen opening it. You, however, love being seen. The Choir will be there. They always are.",
      "choices": [
        {
          "label": "Take the key.",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "To the Iron Veil",
      "to": "veil",
      "risk": 0.1,
      "outcomes": {
        "arrived": "choir"
      }
    },
    "choir": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "roll": {
              "mood": "singing"
            }
          },
          "to": "choir-singing"
        }
      ],
      "else": "choir-silent"
    },
    "choir-singing": {
      "type": "dialogue",
      "beat": "Violet lanterns ring the gate. The Choir is singing one slow chord, and it stops when you arrive.",
      "speaker": "A Choir acolyte",
      "line": "acolyte.listening-gate.singing",
      "emotion": "tender",
      "direction": "Soft, certain, finishing a song only they can hear.",
      "text": "Courier. We wondered when. The gate has been humming your name all week.",
      "choices": [
        {
          "label": "\"Let me through. I'm expected, apparently.\" (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "talk",
            "dc": 7,
            "pass": "gate",
            "fail": "choir-fight"
          }
        },
        {
          "label": "Push past them.",
          "to": "choir-fight"
        },
        {
          "label": "\"You open it, then.\"",
          "to": "end-choir-opened"
        }
      ]
    },
    "choir-silent": {
      "type": "dialogue",
      "speaker": null,
      "text": "The Choir watches you dock in perfect silence. Nobody blocks the gate. Nobody needs to: every lantern is pointed at your ship.",
      "choices": [
        {
          "label": "Walk to the gate like you own it (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "gate",
            "fail": "choir-fight"
          }
        },
        {
          "label": "Hum the Knock as you pass",
          "to": "gate",
          "requires": {
            "flags": {
              "fragment-1": 1
            }
          },
          "lockedHint": "You would have to have heard the Knock first (Cold Run)"
        },
        {
          "label": "Run dark through the lanterns' blind spot to the gate (Running Dark)",
          "to": "gate",
          "requires": {
            "skills": {
              "smuggler": 1
            }
          }
        },
        {
          "label": "\"You open it, then.\"",
          "to": "end-choir-opened"
        }
      ]
    },
    "choir-fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Choir lanterns",
      "enemy": "$choir",
      "outcomes": {
        "win": "gate",
        "parley": "gate",
        "lose": "end-driven-off",
        "flee": "end-driven-off"
      }
    },
    "gate": {
      "type": "riddle",
      "params": {
        "title": "The Iron Veil seal",
        "mode": "$riddle.mode",
        "attempts": 3
      },
      "outcomes": {
        "solved": "end-opened",
        "failed": "end-locked"
      }
    },
    "end-opened": {
      "type": "end",
      "result": "success",
      "outcome": "opened",
      "title": "The gate answers",
      "beat": "The seal turns. Beyond it is not a lane but a voice: three taps, a pause, and then your licence number, read out loud.",
      "speaker": "The Warden voice",
      "line": "warden.listening-gate.opened",
      "emotion": "neutral",
      "direction": "Patient as stone, very slow, a soft ring on every word.",
      "text": "Courier. Licence confirmed. You are expected.",
      "reward": {
        "money": 120,
        "rep": {
          "vey": 10
        },
        "skillPoints": 1,
        "flags": {
          "fragment-5": 1
        },
        "unlocks": [
          "badge:listening-gate"
        ]
      }
    },
    "end-choir-opened": {
      "type": "end",
      "result": "success",
      "outcome": "choir-opened",
      "title": "The Choir opens it",
      "beat": "The Choir sings the seal open in one breath. Vey's buyer will not be pleased that it was seen.",
      "speaker": "A Choir acolyte",
      "line": "acolyte.listening-gate.opened",
      "emotion": "tender",
      "direction": "Gentle, a little pitying, very sure.",
      "text": "There. It only wanted to be sung to. It will say your number anyway. It always has.",
      "reward": {
        "money": 60,
        "rep": {
          "vey": -5
        },
        "skillPoints": 1,
        "flags": {
          "fragment-5": 1,
          "choir-opened": 1
        },
        "unlocks": [
          "badge:listening-gate"
        ]
      }
    },
    "end-locked": {
      "type": "end",
      "result": "failure",
      "outcome": "locked",
      "title": "Locked out",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.listening-gate.locked",
      "emotion": "sly",
      "direction": "Smooth, remembering everything.",
      "text": "Dark and staying dark. I'll take the key back. I refund nothing, darling. I remember everything.",
      "reward": {
        "rep": {
          "vey": -3
        }
      }
    },
    "end-driven-off": {
      "type": "end",
      "result": "failure",
      "outcome": "driven-off",
      "title": "Driven off",
      "beat": "The lanterns burn you off the gate.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.listening-gate.driven",
      "emotion": "worried",
      "direction": "Relieved you are alive, hiding it badly.",
      "text": "Burned off the gate by a lantern choir. Still breathing? Good. Keep the key in your hold. It's cold now. Don't ask me why that worries me.",
      "reward": {
        "rep": {
          "vey": -2
        }
      }
    }
  }
};
