// Opening slice, scene 5: Gunner's Week (the freighter Tin Duchess, bridge and engine room).
// Converted from the scene draft scene-5-gunners-week.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "gunners-week",
  "title": "Gunner's Week",
  "giver": "tull",
  "summary": "Three short ship jobs on days two to four: a stuck gunner seat, a lane scan, and a spraying coolant line. Nessa and Pip quit while Tull refuses to buy parts.",
  "steps": [
    {
      "id": "turret",
      "text": "Fix the gunner seat's targeting arm",
      "where": "duchess-bridge",
      "at": {
        "prop": "gunner-seat"
      },
      "nodes": [
        "gunner-seat",
        "turret-fixed",
        "turret-limps"
      ]
    },
    {
      "id": "scan",
      "text": "Scan the lane for a toll-free route",
      "where": "duchess-bridge",
      "at": {
        "prop": "nav-console"
      },
      "nodes": [
        "scan-brief",
        "lane-clean",
        "lane-beacon"
      ]
    },
    {
      "id": "nessa",
      "text": "Hear Nessa out before she leaves",
      "where": "duchess-bridge",
      "at": {
        "npc": "nessa"
      },
      "nodes": [
        "nessa-quits",
        "nessa-quits-2"
      ]
    },
    {
      "id": "engine",
      "text": "Stop the coolant spray in the engine room",
      "where": "duchess-engine",
      "at": {
        "npc": "pip"
      },
      "nodes": [
        "engine-brief",
        "engine-brief-2",
        "end-steady",
        "end-scrapped-together",
        "end-spray",
        "end-tull-blames",
        "end-tull-blames-2"
      ]
    }
  ],
  "start": "gunner-seat",
  "nodes": {
    "gunner-seat": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The bridge of the Tin Duchess. The gunner seat sits in the middle of the room with its targeting arm stuck halfway to the ceiling, humming like it is trying its best.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.1",
      "emotion": "playful",
      "direction": "Feet up on the nav console, sipping something that is definitely not coffee.",
      "text": "Gunner! Day two. Your chair's arm is jammed pointing at the ceiling. Make it point at the bad guys. Pay is pending.",
      "onEnter": {
        "flags": {
          "coolant-leaking": 1
        }
      },
      "choices": [
        {
          "label": "Pull the arm housing and fix it.",
          "check": {
            "skill": "repair",
            "stat": "wis",
            "tag": "repair",
            "dc": 10,
            "pass": "turret-fixed",
            "fail": "turret-limps"
          }
        }
      ]
    },
    "turret-fixed": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "You pull the housing, reseat a cracked gear with a wrench, and the arm swings down to aim at the window with a satisfying clunk.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.2",
      "emotion": "playful",
      "direction": "Surprised, then pretending he expected it all along.",
      "text": "It points at things now. Six credits. The chair is still mine, so do not get attached.",
      "choices": [
        {
          "label": "On to the next job.",
          "to": "scan-brief",
          "reward": {
            "money": 6,
            "flags": {
              "turret-repaired": 1
            }
          }
        }
      ]
    },
    "turret-limps": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The arm comes free with a bang, swings wide, and locks at half aim with a bright sparking whine. It will point. It just will not point well.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.3",
      "emotion": "grumpy",
      "direction": "Glares at the chair like it personally failed him.",
      "text": "That is a limp, not a fix. I am docking you three for the sparks. The chair works. Mostly.",
      "choices": [
        {
          "label": "On to the next job.",
          "to": "scan-brief",
          "reward": {
            "money": -3
          }
        }
      ]
    },
    "scan-brief": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The nav console glows with a map of the Drift. Somewhere out there a toll gate is waiting for anyone foolish enough to pay it.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.4",
      "emotion": "sly",
      "direction": "Leans over the console, one finger tapping, pleased with his own scheme.",
      "text": "Scan the lane ahead for a toll-free route. Tolls are for people who lack imagination. Find me a clean lane, gunner.",
      "choices": [
        {
          "label": "Scan the lane carefully.",
          "check": {
            "skill": "navigation",
            "stat": "wis",
            "tag": "navigation",
            "dc": 10,
            "pass": "lane-clean",
            "fail": "lane-beacon"
          }
        }
      ]
    },
    "lane-clean": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The scan paints a clean lane across the map. No gates, no tolls, just empty space and one tidy green line.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.5",
      "emotion": "playful",
      "direction": "Slaps the console, delighted, already planning how to take the credit.",
      "text": "A free road! Five credits. I am in a good mood and I am going to be insufferable about this for a week.",
      "choices": [
        {
          "label": "Back to the bridge console.",
          "to": "nessa-quits",
          "reward": {
            "money": 5
          }
        }
      ]
    },
    "lane-beacon": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "The lane you picked looks clean on the map and sounds loud in real life. A pirate beacon starts pinging across the console like a dinner bell.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.6",
      "emotion": "grumpy",
      "direction": "Pounds the console, then pretends the pounding was meant for the beacon.",
      "text": "That is a beacon. Every pirate in the sector just got an invitation. Dock the gunner four credits.",
      "choices": [
        {
          "label": "Back to the bridge console.",
          "to": "nessa-quits",
          "reward": {
            "money": -4
          }
        }
      ]
    },
    "nessa-quits": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "beat": "Nessa Calloway pulls off her headset and drops it on the console. Her coat is already on.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s5.1",
      "emotion": "grumpy",
      "direction": "Tired and fond, eyes on the floor, then on the gunner, a little softer than her voice.",
      "text": "The engine plating has screamed for a week and you two keep flying like it is a ringtone. I am done, Tull. Janitor, you actually listen. Keep doing that.",
      "choices": [
        {
          "label": "Go on",
          "to": "nessa-quits-2"
        }
      ]
    },
    "nessa-quits-2": {
      "type": "dialogue",
      "room": "duchess-bridge",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s5.2",
      "emotion": "dry",
      "direction": "Already walking, tossing the last words over her shoulder without turning around.",
      "text": "Get Pip a fitting before the coolant line does it for you. I am in the lift. Do not let him fly alone.",
      "choices": [
        {
          "label": "Go find Pip in the engine room.",
          "to": "engine-brief",
          "reward": {
            "flags": {
              "nessa-quit": 1
            }
          }
        }
      ]
    },
    "engine-brief": {
      "type": "dialogue",
      "room": "duchess-engine",
      "beat": "The engine room is a hot metal cave. A coolant line hisses a fine silver mist across the grating, and Pip Rourke lies flat under a panel, holding a broken fitting like evidence.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s5.1",
      "emotion": "worried",
      "direction": "Shaking and polite, holding the broken fitting up toward the gunner.",
      "text": "Gunner! The coolant line is spraying and I need a replacement fitting. I asked Tull for one this morning. He said pending. It has been pending for two days.",
      "choices": [
        {
          "label": "Go on",
          "to": "engine-brief-2"
        }
      ]
    },
    "engine-brief-2": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.7",
      "emotion": "dry",
      "direction": "Crackling over the intercom from somewhere far away, sounding like a man with his feet on a desk.",
      "text": "Pending means pending, Pip. Gunner, you are a gunner now. Improvise, like a gunner would.",
      "choices": [
        {
          "label": "Patch the line with a wrench and tape.",
          "check": {
            "skill": "repair",
            "stat": "wis",
            "tag": "repair",
            "dc": 12,
            "pass": "end-steady",
            "fail": "end-spray"
          },
          "minigame": {
            "kind": "repair",
            "title": "Coolant line"
          }
        },
        {
          "label": "Jury-rig a fitting from the scrap bin.",
          "check": {
            "skill": "crafting",
            "stat": "wis",
            "tag": "crafting",
            "dc": 12,
            "pass": "end-scrapped-together",
            "fail": "end-tull-blames"
          }
        }
      ]
    },
    "end-steady": {
      "type": "dialogue",
      "room": "duchess-engine",
      "beat": "You wrench the line shut and wrap it in tape that Pip swears is load-bearing. The hiss dies, the engine breathes again, and the room goes quiet enough to hear Pip sigh with relief.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s5.2",
      "emotion": "proud",
      "direction": "Sitting on the grating, tape on his hands, smiling and close to tears.",
      "text": "A fitting that was pending for two days, fixed in ten minutes. I am proud of you, and I am done. Take my toolbox. It is all I can give without asking Tull.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-steady-end"
        }
      ]
    },
    "end-steady-end": {
      "type": "end",
      "room": "duchess-engine",
      "result": "success",
      "outcome": "steady",
      "title": "Tape and nerve",
      "reward": {
        "money": 25,
        "rep": {
          "tull": 2
        },
        "flags": {
          "turret-repaired": 1,
          "coolant-fixed": 1,
          "nessa-quit": 1,
          "pip-quit": 1
        },
        "items": {
          "hull-patch": 1
        }
      },
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.8",
      "emotion": "deadpan",
      "direction": "Flat as a dead battery, already looking for a chair to fall into.",
      "text": "Good. No crew left but a janitor-gunner and a captain. I will fly it myself, personally."
    },
    "end-scrapped-together": {
      "type": "dialogue",
      "room": "duchess-engine",
      "beat": "You bend a dead bracket off the scrap bin around the line and clamp it with a cable tie and pure stubbornness. It holds. The spray stops, and the room smells of hot metal and hope.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s5.3",
      "emotion": "proud",
      "direction": "Staring at the bracket like it insulted his mother, then grinning anyway.",
      "text": "A bracket and a cable tie. That is not an engineer's fix, it is a prayer with a clamp. It is brilliant and I hate that it works. I am still done, though. Take the toolbox.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-scrapped-together-end"
        }
      ]
    },
    "end-scrapped-together-end": {
      "type": "end",
      "room": "duchess-engine",
      "result": "success",
      "outcome": "scrapped-together",
      "title": "Scrap and spite",
      "reward": {
        "money": 20,
        "rep": {
          "tull": 2
        },
        "flags": {
          "coolant-fixed": 1,
          "nessa-quit": 1,
          "pip-quit": 1
        },
        "items": {
          "hull-patch": 1
        }
      },
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.9",
      "emotion": "playful",
      "direction": "Taking the credit in advance, one finger in the air.",
      "text": "Brilliant junk, and I saved a fitting. No crew left but a janitor-gunner and a captain. I will fly it myself, personally."
    },
    "end-spray": {
      "type": "dialogue",
      "room": "duchess-engine",
      "beat": "The wrench slips, the tape peels, and the line bursts into a silver spray that fills the room. Pip dives across the grating and shuts the valve by hand, soaked to the knees while the gauges scream.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s5.4",
      "emotion": "deadpan",
      "direction": "Dripping and flat, too tired to be angry and too kind to be cruel.",
      "text": "You had the line, then you did not. I shut the valve by hand. My hands will smell of coolant for a week. I am done. Keep the toolbox, it is wet anyway.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-spray-end"
        }
      ]
    },
    "end-spray-end": {
      "type": "end",
      "room": "duchess-engine",
      "result": "failure",
      "outcome": "spray",
      "title": "Mist everywhere",
      "reward": {
        "money": -15,
        "flags": {
          "nessa-quit": 1,
          "pip-quit": 1
        },
        "items": {
          "hull-patch": 1
        }
      },
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.10",
      "emotion": "grumpy",
      "direction": "Stomps in late, looks at the silver puddle like it owes him rent.",
      "text": "Dock the gunner fifteen. No crew left but a janitor-gunner and a captain. I will fly it myself, personally."
    },
    "end-tull-blames": {
      "type": "dialogue",
      "room": "duchess-engine",
      "beat": "The jury-rigged fitting pops, spits a little coolant across the grating, and the hatch slides open. Tull stands in the doorway with his arms folded, looking at the mess as if you made it on purpose.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.11",
      "emotion": "grumpy",
      "direction": "Points at the puddle without once looking at the puddle.",
      "text": "Gunner, this is your mess, and you made it in front of Pip. Dock ten, and rep too. Do not look at me like that.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-tull-blames-2"
        }
      ]
    },
    "end-tull-blames-2": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s5.5",
      "emotion": "worried",
      "direction": "Sorry in every word, already packing up his tools and not looking back at Tull.",
      "text": "He blamed you in front of me, and I am not staying to watch it again. I am done. Keep the toolbox, I do not want it back.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-tull-blames-end"
        }
      ]
    },
    "end-tull-blames-end": {
      "type": "end",
      "room": "duchess-engine",
      "result": "failure",
      "outcome": "tull-blames",
      "title": "Blame in the engine room",
      "reward": {
        "money": -10,
        "rep": {
          "tull": -2
        },
        "flags": {
          "nessa-quit": 1,
          "pip-quit": 1
        },
        "items": {
          "hull-patch": 1
        }
      },
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s5.12",
      "emotion": "deadpan",
      "direction": "Shrugs, flat and final, already heading for the lift.",
      "text": "Fine. No crew left but a janitor-gunner and a captain. I will fly it myself, personally."
    }
  }
};
