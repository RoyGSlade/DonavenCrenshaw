// Opening slice, scene 3: Hold the Corridor (the freighter Tin Duchess, bridge and corridor).
// Converted from the scene draft scene-3-hold-the-corridor.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "hold-the-corridor",
  "title": "Hold the Corridor",
  "giver": "tull",
  "summary": "Marauders are aboard the Tin Duchess. The janitor takes Reck's gun and holds the corridor, or sneaks, hacks or talks their way out.",
  "steps": [
    {
      "id": "take",
      "text": "Take Reck's rifle from the bridge",
      "where": "duchess-bridge",
      "at": {
        "prop": "gunner-seat"
      },
      "nodes": [
        "bridge",
        "bridge-2"
      ]
    },
    {
      "id": "hold",
      "text": "Hold the corridor against the Reavers",
      "where": "duchess-corridor",
      "at": {
        "zone": "hold-line"
      },
      "nodes": [
        "corridor",
        "cargo-flank",
        "fight-hold",
        "fight-flank",
        "fight-walked",
        "fight-bluff"
      ]
    },
    {
      "id": "finish",
      "text": "End the fight",
      "where": "duchess-corridor",
      "at": {
        "zone": "hold-line"
      },
      "nodes": [
        "end-held",
        "end-sealed",
        "end-overrun",
        "end-ran"
      ]
    }
  ],
  "start": "bridge",
  "nodes": {
    "bridge": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The bridge of the Tin Duchess smells of scorched wiring and cheap coffee. Reck's rifle lies on the deck by the gunner seat, its cheerful sticker peeling off the stock. Nobody has covered the chair.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s3.1",
      "emotion": "worried",
      "direction": "Already folded up behind his captain's chair, voice coming out of the floor.",
      "text": "Nobody panic! Janitor, you have the gun now. You are the gunner. Congratulations. I am going to be over here.",
      "choices": [
        {
          "label": "Go on",
          "to": "bridge-2"
        }
      ]
    },
    "bridge-2": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s3.1",
      "emotion": "worried",
      "direction": "Shouting over the intercom with the calm of someone who has done this before and hates it.",
      "text": "Two of them in the corridor, three more coming. Janitor, be useful now. Tull, stop hiding in the furniture.",
      "choices": [
        {
          "label": "Grab the rifle and head for the corridor.",
          "to": "corridor",
          "reward": {
            "flags": {
              "reck-rifle-taken": 1
            }
          }
        }
      ]
    },
    "corridor": {
      "type": "dialogue",
      "room": "duchess-corridor",
      "beat": "The corridor is a long metal throat between the airlock and the bridge, with scorch marks climbing both walls. Two Cinder Reavers crouch behind a broken cargo crate, scrap clubs in their hands and a cutting torch hissing between them.",
      "speaker": "Cinder Reaver",
      "portrait": "reaver",
      "line": "reaver.s3.1",
      "emotion": "menacing",
      "direction": "Grinning through a soot-black mask, swinging the torch like a bored conductor.",
      "text": "Gunner's dead. Now the cleaner has his gun. Cute. Hand it over and we let the cleaner live. Mostly.",
      "choices": [
        {
          "label": "Hold the corridor and shoot it out.",
          "to": "fight-hold"
        },
        {
          "label": "Slip through the cargo hold and come at them from behind.",
          "check": {
            "skill": "stealth",
            "stat": "dex",
            "tag": "stealth",
            "dc": 12,
            "pass": "cargo-flank",
            "fail": "fight-walked"
          }
        },
        {
          "label": "Hack the inner airlock door shut from the corridor panel.",
          "check": {
            "skill": "hacking",
            "stat": "wis",
            "tag": "hacking",
            "dc": 12,
            "pass": "end-sealed",
            "fail": "fight-hold"
          },
          "minigame": {
            "kind": "hack",
            "lock": 2,
            "title": "Inner airlock door"
          }
        },
        {
          "label": "Bluff them over the ship comm: you are the new gunner with the big gun.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 14,
            "pass": "fight-bluff",
            "fail": "fight-hold"
          }
        }
      ]
    },
    "cargo-flank": {
      "type": "dialogue",
      "room": "duchess-cargo",
      "speaker": null,
      "text": "The cargo hold is dark and full of Tull's crates. From the shadow of a stack you can see the back of one Reaver's head. It has not noticed you yet.",
      "choices": [
        {
          "label": "Jump them from behind.",
          "to": "fight-flank"
        }
      ]
    },
    "fight-hold": {
      "type": "fight",
      "mode": "foot",
      "room": "duchess-corridor",
      "title": "Cinder Reavers with scrap clubs and a cutting torch",
      "enemy": {
        "enemy": "marauders"
      },
      "dc": 12,
      "arena": {
        "map": "duchess-corridor",
        "spawn": "default",
        "enemies": [
          {
            "type": "marauder",
            "at": [
              4,
              4
            ]
          },
          {
            "type": "marauder",
            "at": [
              4,
              6
            ]
          },
          {
            "type": "marauder",
            "at": [
              2,
              5
            ]
          }
        ]
      },
      "outcomes": {
        "win": "end-held",
        "lose": "end-overrun",
        "flee": "end-ran"
      }
    },
    "fight-flank": {
      "type": "fight",
      "mode": "foot",
      "room": "duchess-cargo",
      "title": "two Cinder Reavers with their backs to you, scrap clubs and a cutting torch",
      "enemy": {
        "enemy": "marauders"
      },
      "dc": 10,
      "arena": {
        "map": "duchess-cargo",
        "spawn": "default",
        "enemies": [
          {
            "type": "marauder",
            "at": [
              14,
              4
            ]
          },
          {
            "type": "marauder",
            "at": [
              15,
              6
            ]
          }
        ]
      },
      "outcomes": {
        "win": "end-held",
        "lose": "end-overrun",
        "flee": "end-ran"
      }
    },
    "fight-walked": {
      "type": "fight",
      "mode": "foot",
      "room": "duchess-corridor",
      "title": "Cinder Reavers who came round the corner and found you first, scrap clubs and a cutting torch",
      "enemy": {
        "enemy": "marauders"
      },
      "dc": 14,
      "arena": {
        "map": "duchess-corridor",
        "spawn": "default",
        "enemies": [
          {
            "type": "marauder",
            "at": [
              8,
              3
            ]
          },
          {
            "type": "marauder",
            "at": [
              8,
              7
            ]
          },
          {
            "type": "marauder",
            "at": [
              5,
              5
            ]
          },
          {
            "type": "marauder-boss",
            "at": [
              3,
              5
            ]
          }
        ]
      },
      "outcomes": {
        "win": "end-held",
        "lose": "end-overrun",
        "flee": "end-ran"
      }
    },
    "fight-bluff": {
      "type": "fight",
      "mode": "foot",
      "room": "duchess-corridor",
      "title": "a Cinder Reaver leader who is no longer sure about the big gun, plus two grunts with scrap clubs and a cutting torch",
      "enemy": {
        "enemy": "marauders"
      },
      "dc": 10,
      "arena": {
        "map": "duchess-corridor",
        "spawn": "default",
        "enemies": [
          {
            "type": "marauder-boss",
            "at": [
              5,
              5
            ]
          },
          {
            "type": "marauder",
            "at": [
              4,
              3
            ]
          },
          {
            "type": "marauder",
            "at": [
              4,
              7
            ]
          }
        ]
      },
      "outcomes": {
        "win": "end-held",
        "lose": "end-overrun",
        "flee": "end-ran"
      }
    },
    "end-held": {
      "type": "end",
      "room": "duchess-corridor",
      "result": "success",
      "outcome": "held",
      "title": "The corridor holds",
      "reward": {
        "money": 15,
        "rep": {
          "tull": 3
        },
        "flags": {
          "reavers-repelled": 1
        }
      },
      "beat": "The last Reaver drops the torch and runs for the cargo hatch. Two are down or gone, the walls are scorched black, and nobody says Reck's name out loud, though nobody has forgotten it. The ship is still flying.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s3.2",
      "emotion": "sly",
      "direction": "Creeping out from behind the chair, brushing off his coat like he personally did the fighting.",
      "text": "I knew it would work out. I was watching the whole time. From the chair. Mostly."
    },
    "end-sealed": {
      "type": "dialogue",
      "room": "duchess-airlock",
      "beat": "The inner door slams and locks under your hands. Out past the glass the Reavers pound and shout and find nothing to pound through. Their torch sputters on the outer hatch, then goes quiet.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s3.2",
      "emotion": "dry",
      "direction": "Sounding almost pleased, which for Nessa counts as a parade.",
      "text": "Door's sealed and the Reavers are outside, banging on it like a toddler at a locked fridge. Nice work, janitor.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-sealed-end"
        }
      ]
    },
    "end-sealed-end": {
      "type": "end",
      "room": "duchess-airlock",
      "result": "success",
      "outcome": "sealed",
      "title": "Door shut",
      "reward": {
        "money": 20,
        "rep": {
          "tull": 3
        },
        "flags": {
          "airlock-sealed": 1,
          "reavers-repelled": 1
        }
      },
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s3.3",
      "emotion": "warm",
      "direction": "Popping up at the bridge hatch with a pleased nod, as if he had planned it.",
      "text": "Excellent. I would have sealed it myself, but I was busy being brave from behind a chair."
    },
    "end-overrun": {
      "type": "end",
      "room": "duchess-corridor",
      "result": "failure",
      "outcome": "overrun",
      "title": "Cargo gone",
      "reward": {
        "money": -20,
        "rep": {
          "tull": -1
        },
        "flags": {
          "reavers-repelled": 1
        }
      },
      "beat": "The line breaks. Clubs and torch drive you back until the bulkhead is at your back. Then the Reavers stop fighting, grab Tull's crates from the cargo bay and leave with them. Your ribs ache and your pay is docked.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s3.1",
      "emotion": "worried",
      "direction": "Shouting from the engine hatch, one hand on a valve, very loudly.",
      "text": "Venting the cargo bay now! They can have the crates! Hold on to something bolted down, I am not kidding!"
    },
    "end-ran": {
      "type": "end",
      "room": "duchess-bridge",
      "result": "failure",
      "outcome": "ran",
      "title": "Back to the bridge",
      "reward": {
        "money": -10,
        "flags": {
          "reavers-repelled": 1
        }
      },
      "beat": "You run for the bridge with the rifle banging on your back. Behind you the corridor fills with Reavers. Then Nessa vents the airlock, the Reavers scatter and retreat, and they take a crate of Tull's coffee as a souvenir.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s3.3",
      "emotion": "deadpan",
      "direction": "Flat and unbothered, eyes on the monitors, one finger still on the vent switch.",
      "text": "Running was smart. The vent was smarter. They took Tull's coffee, which is the only thing on this ship worth stealing. Don't tell him I said that."
    }
  }
};
