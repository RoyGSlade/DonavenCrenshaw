// Opening slice, scene 4: The Eighth Gunner (the freighter Tin Duchess, Tull's quarters and the janitor's bunk).
// Converted from the scene draft scene-4-the-eighth-gunner.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "the-eighth-gunner",
  "title": "The Eighth Gunner",
  "giver": "tull",
  "summary": "The morning after the Reavers, Tull offers the janitor the gunner's seat, with a share, a seat and a hat, eventually.",
  "steps": [
    {
      "id": "offer",
      "text": "Hear Tull's offer and ask about the job",
      "where": "duchess-quarters",
      "at": {
        "npc": "tull"
      },
      "nodes": [
        "desk",
        "desk-2",
        "seven",
        "ledger"
      ]
    },
    {
      "id": "decide",
      "text": "Decide whether to take the seat",
      "where": "duchess-quarters",
      "at": {
        "prop": "your-bunk"
      },
      "nodes": [
        "bunk",
        "breakfast"
      ]
    },
    {
      "id": "finish",
      "text": "Take the seat",
      "where": "duchess-quarters",
      "at": {
        "npc": "tull"
      },
      "nodes": [
        "end-hired-well",
        "end-hired-fair",
        "end-lowballed",
        "end-refused"
      ]
    }
  ],
  "start": "desk",
  "nodes": {
    "desk": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "Tull's quarters, morning. He has made the bed, which is the most alarming thing that has happened on this ship. His desk screen is angled away from you.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.1",
      "emotion": "playful",
      "direction": "Best behaviour, which is worse. He beams like a man who has rehearsed this in the mirror.",
      "text": "Good morning, janitor! Sit down, make yourself at home. I have a job for you. A real one, with a seat, a share of every job, and a hat, eventually.",
      "choices": [
        {
          "label": "Go on",
          "to": "desk-2"
        }
      ]
    },
    "desk-2": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.2",
      "emotion": "warm",
      "direction": "Hands folded, reasonable tone, a little too reasonable.",
      "text": "The gunner's seat. Best view on the ship. Stand next to a cannon, look brave, and you get a cut of everything we fly.",
      "choices": [
        {
          "label": "What happened to the other seven gunners?",
          "to": "seven"
        },
        {
          "label": "Read the ledger on the desk.",
          "check": {
            "skill": "hacking",
            "stat": "wis",
            "tag": "hacking",
            "dc": 10,
            "pass": "ledger",
            "fail": "seven"
          }
        },
        {
          "label": "Haggle for a bigger share.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 10,
            "pass": "end-hired-well",
            "fail": "end-lowballed"
          },
          "minigame": {
            "kind": "haggle",
            "who": "Captain Tull",
            "what": "your share",
            "open": 20,
            "best": 30,
            "mid": "end-hired-fair"
          }
        },
        {
          "label": "Take the standard share.",
          "to": "end-hired-fair"
        },
        {
          "label": "No thanks. I'll think about it in my bunk.",
          "to": "bunk"
        }
      ]
    },
    "seven": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "Tull pulls a crew board off the wall and turns it toward you. Seven names, six crossed out in red and the last one, Reck, still in pencil. He reads them out with the cheer of a man reading a menu, and slows down at the end.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.3",
      "emotion": "playful",
      "direction": "Cheerful as a man reading out a cemetery map. He points at the board like it is a sales chart.",
      "text": "Seven gunners before you. One quit. One was reassigned to a planet. One is technically on leave. Three are not the subject of this meeting. And Reck, who you met. I liked Reck.",
      "choices": [
        {
          "label": "Haggle for a bigger share.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 12,
            "pass": "end-hired-well",
            "fail": "end-lowballed"
          },
          "minigame": {
            "kind": "haggle",
            "who": "Captain Tull",
            "what": "your share",
            "open": 20,
            "best": 30,
            "mid": "end-hired-fair"
          }
        },
        {
          "label": "Take the standard share.",
          "to": "end-hired-fair"
        },
        {
          "label": "No thanks. I'll think about it in my bunk.",
          "to": "bunk"
        }
      ]
    },
    "ledger": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "The desk screen wakes up under your hand. Balance: red. Repairs: a long column of entries, each one marked \"next quarter.\" The same entry has been marked \"next quarter\" for a while.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.4",
      "emotion": "worried",
      "direction": "Quick grab for the screen, then a laugh that does not reach his eyes.",
      "text": "Those are just numbers. Repairs are pending. Pending is a lovely word, janitor. Let's keep it between us.",
      "choices": [
        {
          "label": "Haggle, now that you know he is broke.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 10,
            "pass": "end-hired-well",
            "fail": "end-lowballed"
          },
          "minigame": {
            "kind": "haggle",
            "who": "Captain Tull",
            "what": "your share",
            "open": 20,
            "best": 30,
            "mid": "end-hired-fair"
          }
        },
        {
          "label": "Take the standard share.",
          "to": "end-hired-fair"
        },
        {
          "label": "No thanks. I'll think about it in my bunk.",
          "to": "bunk"
        }
      ]
    },
    "bunk": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "The janitor's bunk is a shelf with a blanket and ambition. The intercom clicks on by itself, the way it always seems to.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s4.1",
      "emotion": "dry",
      "direction": "Over the speaker, bored, with the faint hum of someone who has seen this movie before.",
      "text": "Heard Tull offered you the gunner seat. Say no if you like. He will ask again at breakfast, and he will be much sweeter about it.",
      "choices": [
        {
          "label": "Change my mind. Take the standard share.",
          "to": "end-hired-fair"
        },
        {
          "label": "Hold out. Sleep on it.",
          "to": "breakfast"
        }
      ]
    },
    "breakfast": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "Next morning. Tull is at the bunk door with a tray balanced on one hand and a seat assignment on the other. The tray has eggs. The assignment has a smaller number on it.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.5",
      "emotion": "warm",
      "direction": "Sunny and entirely unbothered, as if this was the plan all along.",
      "text": "Morning! Breakfast, your seat by the turret, and your share is a bit smaller now. Smaller is what happens when you say no. Eat up.",
      "choices": [
        {
          "label": "Eat the eggs and take the seat.",
          "to": "end-refused"
        }
      ]
    },
    "end-hired-well": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "You name your number. Tull groans, rubs his face, and meets it to the credit, then tries to take a bit back for the hat.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.6",
      "emotion": "grumpy",
      "direction": "Grudging and sour, with a bit of pride he will deny in front of the crew.",
      "text": "Fine. A bigger share and a seat. Don't make me regret it. I already regret it, so we're even.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-hired-well-end"
        }
      ]
    },
    "end-hired-well-end": {
      "type": "end",
      "room": "duchess-quarters",
      "result": "success",
      "outcome": "hired-well",
      "title": "Better terms",
      "reward": {
        "money": 30,
        "rep": {
          "tull": 3
        },
        "flags": {
          "gunner-hired": 1,
          "pay-raised": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s4.2",
      "emotion": "dry",
      "direction": "Muttered to nobody, from the far end of the corridor.",
      "text": "Welcome to number eight."
    },
    "end-hired-fair": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "You take the standard share, seat and all. Tull shakes your hand like he is closing a deal on a used dog.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.7",
      "emotion": "warm",
      "direction": "Relieved and a little soft about it, then immediately back to bluster.",
      "text": "Standard share. Good. Welcome to the crew, janitor. Now stop looking at the board.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-hired-fair-end"
        }
      ]
    },
    "end-hired-fair-end": {
      "type": "end",
      "room": "duchess-quarters",
      "result": "success",
      "outcome": "hired-fair",
      "title": "Standard share",
      "reward": {
        "money": 20,
        "rep": {
          "tull": 2
        },
        "flags": {
          "gunner-hired": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s4.3",
      "emotion": "deadpan",
      "direction": "Flat as a mop bucket, with no hint of a smile.",
      "text": "Welcome to number eight."
    },
    "end-lowballed": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "Tull hears your number, cuts the offer in half, then trims the other half for attitude. The seat is yours anyway, and so is the smaller share.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.8",
      "emotion": "grumpy",
      "direction": "Flushed and stubborn, jabbing a finger at the desk like it started the argument.",
      "text": "Half of that. And a bit off for attitude. Take it, or stand in the corridor and think about your choices.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-lowballed-end"
        }
      ]
    },
    "end-lowballed-end": {
      "type": "end",
      "room": "duchess-quarters",
      "result": "failure",
      "outcome": "lowballed",
      "title": "Cut short",
      "reward": {
        "money": 10,
        "rep": {
          "tull": -1
        },
        "flags": {
          "gunner-hired": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s4.4",
      "emotion": "deadpan",
      "direction": "Dry as the bottom of a biscuit tin, with a sympathetic glance she will deny.",
      "text": "Welcome to number eight."
    },
    "end-refused": {
      "type": "dialogue",
      "room": "duchess-quarters",
      "beat": "You say no, and Tull does not even pause. He leaves the tray, the seat and the smaller share at the bunk door, and walks off whistling, sure that you will come round.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s4.9",
      "emotion": "sly",
      "direction": "Pleased with himself, a wink to nobody, already halfway down the corridor.",
      "text": "No is a fine opening offer. A learning experience, janitor. Enjoy the eggs.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-refused-end"
        }
      ]
    },
    "end-refused-end": {
      "type": "end",
      "room": "duchess-quarters",
      "result": "failure",
      "outcome": "refused",
      "title": "Breakfast terms",
      "reward": {
        "money": 5,
        "flags": {
          "gunner-hired": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s4.5",
      "emotion": "deadpan",
      "direction": "Over the intercom, with the faint tone of someone collecting a bet.",
      "text": "Welcome to number eight."
    }
  }
};
