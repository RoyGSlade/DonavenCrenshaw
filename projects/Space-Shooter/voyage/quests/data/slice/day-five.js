// Opening slice, scene 6: Day Five (the freighter Tin Duchess, landing pad and engine room).
// Converted from the scene draft scene-6-day-five.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "day-five",
  "title": "Day Five",
  "giver": "tull",
  "summary": "ASSUMPTION for Donaven: the busted ship is the Duchess itself. Tull piloted once, badly, and retires, handing the Captain the ship, its papers, a monthly docking fee and a parts bill the size of a planet.",
  "steps": [
    {
      "id": "handover",
      "text": "Take the ship and its papers from Tull",
      "where": "duchess-pad",
      "at": {
        "npc": "tull"
      },
      "nodes": [
        "handover",
        "handover-2",
        "fee-paid",
        "fee-paid-2",
        "fee-no",
        "fee-no-2"
      ]
    },
    {
      "id": "engine",
      "text": "Get the reactor and hull working",
      "where": "duchess-engine",
      "at": {
        "prop": "reactor"
      },
      "nodes": [
        "engine-walk",
        "reactor-up",
        "reactor-jury",
        "hull-job",
        "power-job"
      ]
    },
    {
      "id": "finish",
      "text": "Find out if she flies",
      "where": "duchess-pad",
      "at": {
        "prop": "duchess-hull"
      },
      "nodes": [
        "flying",
        "limping",
        "bill-due",
        "towed"
      ]
    }
  ],
  "start": "handover",
  "nodes": {
    "handover": {
      "type": "dialogue",
      "room": "duchess-pad",
      "beat": "The landing pad has a dent in the concrete the exact shape of a freighter. The Tin Duchess sits crooked on her struts, one engine still ticking as it cools. Tull leans on a deck chair with a clipboard and no shame.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.1",
      "emotion": "playful",
      "direction": "Big cheerful grin, hands wide, like he is announcing a birthday nobody asked for.",
      "text": "Congratulations, Captain. I piloted her today. Badly. I docked like the pad owed me money, and now I am retired.",
      "onEnter": {
        "flags": {
          "duchess-busted": 1
        }
      },
      "choices": [
        {
          "label": "Go on",
          "to": "handover-2"
        }
      ]
    },
    "handover-2": {
      "type": "dialogue",
      "room": "duchess-pad",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.2",
      "emotion": "deadpan",
      "direction": "Holds out the clipboard with two fingers, as if it might bite.",
      "text": "Papers, debts, and a docking fee every month. The reactor is dead and a hull plate is blown off. She is yours now, busted and all.",
      "choices": [
        {
          "label": "Ask Tull to cover the first month of docking.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 12,
            "pass": "fee-paid",
            "fail": "fee-no"
          },
          "reward": {
            "flags": {
              "duchess-busted": 1
            }
          }
        },
        {
          "label": "Go look at the ship.",
          "to": "engine-walk",
          "reward": {
            "flags": {
              "duchess-busted": 1
            }
          }
        }
      ]
    },
    "fee-paid": {
      "type": "dialogue",
      "room": "duchess-pad",
      "beat": "Tull counts six credits out of a pocket that has clearly never been counted before.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.3",
      "emotion": "sly",
      "direction": "Presses the coins into your palm and closes your fingers over them, like a magician.",
      "text": "Six credits. That is an advance, not a gift. Pay me back when she flies, Captain. If she flies.",
      "choices": [
        {
          "label": "Go on",
          "to": "fee-paid-2"
        }
      ]
    },
    "fee-paid-2": {
      "type": "dialogue",
      "room": "duchess-pad",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.4",
      "emotion": "playful",
      "direction": "Hoists the deck chair under one arm and strolls toward the lift without looking back.",
      "text": "Sorry about the reactor? No. I do not do sorry. I do deck chairs. Take the ship, Captain. I am taking the chair.",
      "choices": [
        {
          "label": "Walk on to the engine room.",
          "to": "engine-walk",
          "reward": {
            "money": 6
          }
        }
      ]
    },
    "fee-no": {
      "type": "dialogue",
      "room": "duchess-pad",
      "beat": "Tull looks at the clipboard, then at the pad, then at the clipboard again, as if the number might shrink if he waits.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.5",
      "emotion": "dry",
      "direction": "Flat and unbothered, already halfway to the lift.",
      "text": "No. The fee is the fee, and it is a rude little number. Pay it like everybody else, and pay it on time.",
      "choices": [
        {
          "label": "Go on",
          "to": "fee-no-2"
        }
      ]
    },
    "fee-no-2": {
      "type": "dialogue",
      "room": "duchess-pad",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s6.6",
      "emotion": "playful",
      "direction": "Tucks the deck chair under one arm and waves with the other.",
      "text": "Sorry? Nope. I am retired, Captain. Retired men do not apologise. They take the good chair.",
      "choices": [
        {
          "label": "Walk on to the engine room.",
          "to": "engine-walk"
        }
      ]
    },
    "engine-walk": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": null,
      "text": "The engine room is cold, which is the worst thing an engine room can be. The reactor is a dead grey drum. A hull plate is missing from the wall, and the lights stutter like they are trying to remember a joke.",
      "choices": [
        {
          "label": "Bring the reactor back the proper way.",
          "check": {
            "skill": "repair",
            "stat": "wis",
            "tag": "repair",
            "dc": 12,
            "pass": "reactor-up",
            "fail": "towed"
          }
        },
        {
          "label": "Rig a bypass from the spare parts.",
          "check": {
            "skill": "crafting",
            "stat": "wis",
            "tag": "crafting",
            "dc": 8,
            "pass": "reactor-jury",
            "fail": "bill-due"
          }
        }
      ]
    },
    "reactor-up": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": null,
      "text": "The reactor coughs, groans, and then hums like it has decided to forgive everybody. The lights steady. The blown hull plate is still a hole, and cold air pours through it.",
      "onEnter": {
        "flags": {
          "reactor-fixed": 1
        }
      },
      "choices": [
        {
          "label": "Go and look at the blown hull plate.",
          "to": "hull-job"
        }
      ]
    },
    "reactor-jury": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": null,
      "text": "The bypass holds on a strip of electrical tape, a prayer, and one loose bolt you have decided not to think about. The reactor runs. The power still flickers through the walls like a bad nightlight.",
      "onEnter": {
        "flags": {
          "reactor-fixed": 1
        }
      },
      "choices": [
        {
          "label": "Find the power fault at the console.",
          "to": "power-job"
        }
      ]
    },
    "hull-job": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": null,
      "text": "The hull plate lies on the deck where it fell. The gap in the wall breathes cold air in and out. Welding it shut is a job for steady hands and a steady nerve.",
      "choices": [
        {
          "label": "Weld the blown plate back on.",
          "check": {
            "skill": "crafting",
            "stat": "wis",
            "tag": "crafting",
            "dc": 10,
            "pass": "flying",
            "fail": "bill-due"
          }
        }
      ]
    },
    "power-job": {
      "type": "dialogue",
      "room": "duchess-engine",
      "speaker": null,
      "text": "The power panel is a grey box with a cracked screen, a sticker reading DO NOT TOUCH, and wires that have clearly been touched by everyone.",
      "choices": [
        {
          "label": "Reroute the power through the console.",
          "check": {
            "skill": "hacking",
            "stat": "wis",
            "tag": "hacking",
            "dc": 12,
            "pass": "limping",
            "fail": "bill-due"
          }
        }
      ]
    },
    "towed": {
      "type": "end",
      "room": "duchess-pad",
      "result": "failure",
      "outcome": "towed",
      "title": "Towed home",
      "reward": {
        "money": -40,
        "flags": {
          "duchess-busted": 1,
          "day-five-over": 1
        }
      },
      "text": "The restart trips every breaker in the ship at once. The lights die, the reactor stops with a sad little clunk, and a dock tug hooks the Tin Duchess by the nose and drags her onto the pad. The docking office sends a bill for the tow. The Captain stands on the Duchess's deck in the dark, squints at the job board through the airlock window, and counts the credits left. Enough for one job. The board is still the way forward."
    },
    "bill-due": {
      "type": "end",
      "room": "duchess-pad",
      "result": "failure",
      "outcome": "bill-due",
      "title": "Fee day",
      "reward": {
        "money": -30,
        "flags": {
          "duchess-busted": 1,
          "day-five-over": 1
        }
      },
      "text": "The clock beats the ship. The docking office stamps the fee due, and the Tin Duchess sits on the pad unfinished, humming in a way nobody likes. The Captain stands on the Duchess's deck, listens to the hum, and reads the job board through the airlock window. Every job on that board pays a fee, and the fee pays nobody's feelings. Pick the first one. The board is still the way forward."
    },
    "flying": {
      "type": "end",
      "room": "duchess-pad",
      "result": "success",
      "outcome": "flying",
      "title": "Wheels up",
      "reward": {
        "money": 30,
        "rep": {
          "tull": 3
        },
        "flags": {
          "duchess-busted": 1,
          "reactor-fixed": 1,
          "hull-patched": 1,
          "duchess-repaired": 1,
          "day-five-over": 1
        }
      },
      "text": "The reactor hums, the hull plate sits tight behind a seam you could spot from orbit, and the Tin Duchess lifts off her struts for the first time in days. The Captain stands on the Duchess's deck and grins. Tull would have docked her hard. The Captain sets her down like an egg. The job board is the next stop, and this time the ship is coming with you."
    },
    "limping": {
      "type": "end",
      "room": "duchess-engine",
      "result": "success",
      "outcome": "limping",
      "title": "Limping, not dead",
      "reward": {
        "money": 15,
        "rep": {
          "tull": 1
        },
        "flags": {
          "duchess-busted": 1,
          "power-fixed": 1,
          "reactor-fixed": 1,
          "day-five-over": 1
        }
      },
      "text": "The power runs steady through the grid, and the reactor is held together with a bypass, a prayer, and enough tape to wrap a small moon. A hole the size of a dinner tray stays open to the air. The Captain stands on the Duchess's deck, cold and proud, and the job board says the jobs are still out there. So is the ship."
    }
  }
};
