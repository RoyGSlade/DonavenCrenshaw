// Opening slice, scene 2: Visitors (the freighter Tin Duchess, bridge and outer airlock).
// Converted from the scene draft scene-2-visitors.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "visitors",
  "title": "Visitors",
  "giver": "tull",
  "summary": "The janitor is called to the bridge over a toll argument, the cutter outside clamps on, and the gunner they just met is shot in his seat.",
  "steps": [
    {
      "id": "summon",
      "text": "Mop the bridge and deal with the toll",
      "where": "duchess-bridge",
      "at": {
        "npc": "nessa"
      },
      "nodes": [
        "bridge",
        "bridge-2",
        "bridge-3",
        "clamps",
        "tull-calm"
      ]
    },
    {
      "id": "wait",
      "text": "Keep watch while the cutter closes in",
      "where": "duchess-bridge",
      "at": {
        "npc": "reck"
      },
      "nodes": [
        "reck-chat",
        "reck-kind",
        "breach"
      ]
    },
    {
      "id": "boarding",
      "text": "Survive the boarding",
      "where": "duchess-bridge",
      "at": {
        "npc": "reck"
      },
      "nodes": [
        "last",
        "reck-falls"
      ]
    },
    {
      "id": "finish",
      "text": "Pick yourself up",
      "where": "duchess-bridge",
      "at": {
        "prop": "gunner-seat"
      },
      "nodes": [
        "end-hidden",
        "end-warned",
        "end-frozen",
        "end-knocked-out"
      ]
    }
  ],
  "start": "bridge",
  "nodes": {
    "bridge": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The bridge of the Tin Duchess. Coffee has spilled across the helm console, and a cold brown puddle is creeping toward the buttons. Nessa sits in the pilot seat, arguing into a comm link. Reck lounges in the gunner seat, humming. Tull leans back in his big chair like it owes him money.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s2.1",
      "emotion": "playful",
      "direction": "Feet up on the console edge, mug in hand, not helping at all.",
      "text": "Janitor! Mop my console. Mind the buttons. Some of them open airlocks, and one of them is a toilet. Nobody knows which.",
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
      "line": "nessa.s2.1",
      "emotion": "grumpy",
      "direction": "Flat and tired, one hand on the comm, one hand on the stick.",
      "text": "Captain, a cutter with orange-black paint has matched our speed and wants a docking toll. Tell me you are not paying it.",
      "choices": [
        {
          "label": "Go on",
          "to": "bridge-3"
        }
      ]
    },
    "bridge-3": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s2.2",
      "emotion": "dry",
      "direction": "A lazy grin, refusing to look at the screen.",
      "text": "I am not paying a toll on principle. My principle is no. Mop, janitor. The coffee is my principle too.",
      "choices": [
        {
          "label": "Check the cutter's readout.",
          "check": {
            "skill": "navigation",
            "stat": "wis",
            "tag": "navigation",
            "dc": 10,
            "pass": "clamps",
            "fail": "reck-chat"
          }
        },
        {
          "label": "Try to calm Tull down.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 10,
            "pass": "tull-calm",
            "fail": "reck-chat"
          }
        },
        {
          "label": "Go and talk to Reck.",
          "to": "reck-chat"
        }
      ]
    },
    "clamps": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The cutter's readout shows up in the corner of the screen. Its docking clamps are out, long and hooked, reaching for the outer airlock. Nobody reaches for an airlock by accident.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s2.2",
      "emotion": "worried",
      "direction": "Hands flying across the helm, voice sharp for once, no jokes.",
      "text": "Those are clamps, not a toll. Cinder Reavers do not ask twice, Captain. They shop. Bracing the helm now. Everybody hold on to something.",
      "choices": [
        {
          "label": "Keep your eyes on the cutter.",
          "to": "reck-chat",
          "reward": {
            "flags": {
              "saw-clamps": 1
            }
          }
        }
      ]
    },
    "tull-calm": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s2.3",
      "emotion": "warm",
      "direction": "He sits up for once, quieter than he has ever been on screen.",
      "text": "Seven gunners, janitor. The last person who paid one of these tolls never came back to the ship. Okay? Don't tell Nessa. She'll make it a whole thing.",
      "choices": [
        {
          "label": "Go back to the mop.",
          "to": "reck-chat"
        }
      ]
    },
    "reck-chat": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "Reck swings his boots in the gunner seat, cheerful as a kettle. Out the window, the cutter's orange-black hull hangs there, smug as paint.",
      "speaker": "Tobin Reck",
      "portrait": "reck",
      "line": "reck.s2.1",
      "emotion": "excited",
      "direction": "A big happy grin, the grin of a man who has not read the crew board.",
      "text": "Seventh time's the charm, janitor. I've got a good feeling about this one. Also, I like your mop. It has a future.",
      "choices": [
        {
          "label": "Talk Reck out of his gunner seat.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 12,
            "pass": "reck-kind",
            "fail": "breach"
          }
        },
        {
          "label": "Keep your eyes on the cutter.",
          "to": "breach"
        }
      ]
    },
    "reck-kind": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "Reck laughs so hard he has to hold on to the console. Then he looks at you, serious for one second.",
      "speaker": "Tobin Reck",
      "portrait": "reck",
      "line": "reck.s2.2",
      "emotion": "tender",
      "direction": "Laughing it off first, then quieter, meaning every word of the thanks.",
      "text": "Ha. Nice try. Nobody has ever asked me to move out of this chair before. Thanks, though. The seat is still mine.",
      "choices": [
        {
          "label": "Shake his hand.",
          "to": "breach"
        }
      ]
    },
    "breach": {
      "type": "dialogue",
      "room": "duchess-airlock",
      "beat": "Cut to the outer airlock: the light turns red and stays red. A cutting torch bites through the door, and metal groans against metal. On the bridge, the intercom crackles.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s2.3",
      "emotion": "worried",
      "direction": "Low and fast over the intercom, all the jokes gone.",
      "text": "They're in the outer airlock and they're cutting the door. Everybody off the hatch line now. That door is not going to hold.",
      "onEnter": {
        "flags": {
          "reavers-docked": 1
        }
      },
      "choices": [
        {
          "label": "Hold on to the console.",
          "to": "last"
        }
      ]
    },
    "last": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "arrive": "cut",
      "beat": "The outer door gives way with a bang. Boots hit the corridor and rush for the bridge hatch. Reck turns toward the sound with his grin still on.",
      "speaker": "Tobin Reck",
      "portrait": "reck",
      "line": "reck.s2.3",
      "emotion": "tender",
      "direction": "Easy and kind, the voice of a man who thinks he has this one.",
      "text": "Hey, janitor. Get down, okay? Stay behind me.",
      "onEnter": {
        "flags": {
          "reavers-boarded": 1
        }
      },
      "choices": [
        {
          "label": "Watch the hatch.",
          "to": "reck-falls"
        }
      ]
    },
    "reck-falls": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The first Reaver comes through the hatch, torch-masked and already firing. Two shots hit Reck in the chest. He gets one wild burst off from the gunner seat, and the Reaver ducks back. It buys you one second. Then Reck settles back into his chair like a man deciding to take a nap.",
      "speaker": "Tobin Reck",
      "portrait": "reck",
      "line": "reck.s2.4",
      "emotion": "tender",
      "direction": "Barely a breath, still smiling. Then silence. No blood on camera, just the chair and the quiet.",
      "text": "Seventh time... Keep the mop. It's got a future.",
      "onEnter": {
        "flags": {
          "reck-down": 1
        }
      },
      "choices": [
        {
          "label": "Duck behind the console.",
          "check": {
            "skill": "stealth",
            "stat": "dex",
            "tag": "stealth",
            "dc": 8,
            "pass": "end-hidden",
            "fail": "end-knocked-out"
          }
        },
        {
          "label": "Grab the helm rail next to Nessa.",
          "to": "end-warned",
          "requires": {
            "flags": {
              "saw-clamps": 1
            }
          },
          "hideLocked": true
        },
        {
          "label": "Stand where you are and hope.",
          "to": "end-frozen"
        }
      ]
    },
    "end-hidden": {
      "type": "end",
      "room": "duchess-bridge",
      "result": "success",
      "outcome": "hidden",
      "title": "Behind the console",
      "reward": {
        "money": 6,
        "flags": {
          "reavers-docked": 1,
          "reavers-boarded": 1,
          "reck-down": 1
        }
      },
      "beat": "You are wedged behind the console with the coffee-soaked mop. The boots thump past the bridge and on into the ship. On the floor by Reck's chair lies his rifle, where it fell.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s2.6",
      "emotion": "tender",
      "direction": "Barely above a whisper, the first time she has ever sounded scared.",
      "text": "Janitor, stay down. I think they're going further in. Don't breathe loud."
    },
    "end-warned": {
      "type": "end",
      "room": "duchess-bridge",
      "result": "success",
      "outcome": "warned",
      "title": "Heads-up",
      "reward": {
        "money": 8,
        "rep": {
          "tull": 1
        },
        "flags": {
          "reavers-docked": 1,
          "reavers-boarded": 1,
          "reck-down": 1
        }
      },
      "beat": "The clamps had been braced for, and your hand is on the helm rail next to Nessa's. The boarding party's boots are in the corridor, and the rifle is on the floor by Reck's chair.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s2.4",
      "emotion": "proud",
      "direction": "Quiet, not sly for once, and she does not look at the empty gunner seat.",
      "text": "Good eyes, janitor. You saw the clamps first. Reck was still smiling when they came through the hatch."
    },
    "end-frozen": {
      "type": "end",
      "room": "duchess-bridge",
      "result": "failure",
      "outcome": "frozen",
      "title": "Frozen in the open",
      "reward": {
        "money": -5,
        "flags": {
          "reavers-docked": 1,
          "reavers-boarded": 1,
          "reck-down": 1
        }
      },
      "beat": "You stand in the open with the mop in both hands, and your feet refuse to move. A Reaver shoves you down onto the deck, hard. The boarding party's boots are in the corridor, and the rifle is on the floor by Reck's chair.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s2.5",
      "emotion": "worried",
      "direction": "Tight and urgent, voice cracking on the last word.",
      "text": "Janitor? Stay down. Stay down and breathe. Lying on the floor is the smartest thing you have done all day."
    },
    "end-knocked-out": {
      "type": "end",
      "room": "duchess-bridge",
      "result": "failure",
      "outcome": "knocked-out",
      "title": "Lights out",
      "reward": {
        "money": -8,
        "flags": {
          "reavers-docked": 1,
          "reavers-boarded": 1,
          "reck-down": 1
        }
      },
      "beat": "Your duck goes wrong, and a Reaver's gun butt catches you on the side of the head. The bridge goes dark. When you wake, Reck's rifle lies on the floor by the chair, close enough to reach. The boarding party's boots are already in the corridor.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s2.4",
      "emotion": "grumpy",
      "direction": "The grumble goes out of him halfway through, and he looks at the chair.",
      "text": "Janitor. Get up. We do not have time to be unconscious on my bridge. Also, I'm sorry about Reck. I really am."
    }
  }
};
