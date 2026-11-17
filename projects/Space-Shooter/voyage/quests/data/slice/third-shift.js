// Opening slice, scene 1: Third Shift (the freighter Tin Duchess, holodeck gym).
// Converted from the scene draft scene-1-third-shift.md by lhc-lanes/stardust/launch/slice/tools/convert.mjs; the words are the draft's.
// Every node has a `room` (a Tin Duchess room); `arrive` is how the player gets there ("walk": the tracker marker waits for
// them, "cut": a fade). Steps point at a spot in a room (`where` + `at`). A fight's `arena` lists its enemies in that room.
// DATA ONLY: the body after "export default" is strict JSON so the Stardust Studio (Focus) can read and write it.
export default {
  "id": "third-shift",
  "title": "Third Shift",
  "giver": "tull",
  "summary": "The new janitor is sent to clean a holodeck gym that has turned into a white goo swamp, and finds out why.",
  "steps": [
    {
      "id": "brief",
      "text": "Get the job from Tull",
      "where": "duchess-mess",
      "at": {
        "npc": "tull"
      },
      "nodes": [
        "brief",
        "brief-2",
        "brief-raise",
        "brief-no",
        "brief-hint"
      ]
    },
    {
      "id": "crew",
      "text": "Ask the crew what is really wrong",
      "where": "duchess-holodeck",
      "at": {
        "npc": "nessa"
      },
      "nodes": [
        "goo",
        "nessa",
        "nessa-2",
        "pip",
        "pip-2"
      ]
    },
    {
      "id": "choose",
      "text": "Pick how to clean the gym",
      "where": "duchess-holodeck",
      "at": {
        "zone": "gym-floor"
      },
      "nodes": [
        "choice"
      ]
    },
    {
      "id": "finish",
      "text": "Finish the shift",
      "where": "duchess-holodeck",
      "at": {
        "zone": "gym-floor"
      },
      "nodes": [
        "end-clean",
        "end-source-fixed",
        "end-slimed",
        "end-projector-fried"
      ]
    }
  ],
  "start": "brief",
  "nodes": {
    "brief": {
      "type": "dialogue",
      "room": "duchess-mess",
      "beat": "The mess hall of the Tin Duchess. A crew board hangs by the coffee urn: seven names, six crossed out in red and the last one in pencil.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.1",
      "emotion": "playful",
      "direction": "Big grin, big hands, zero hygiene. He thinks he is charming.",
      "text": "Janitor! Welcome aboard the finest ship in the Drift. Don't look at the board. The board is a metaphor.",
      "choices": [
        {
          "label": "Go on",
          "to": "brief-2"
        }
      ]
    },
    "brief-2": {
      "type": "dialogue",
      "room": "duchess-mess",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.2",
      "emotion": "warm",
      "direction": "Quick and breezy, like he is selling a timeshare.",
      "text": "Jungle Wellness 4 is a little moist. Mop it. Sign here. Do not ask me about the board.",
      "choices": [
        {
          "label": "Where is this gym?",
          "to": "goo"
        },
        {
          "label": "I want more pay for this.",
          "check": {
            "skill": "social",
            "stat": "cha",
            "tag": "social",
            "dc": 10,
            "pass": "brief-raise",
            "fail": "brief-no"
          }
        },
        {
          "label": "What is in the goo?",
          "check": {
            "skill": "repair",
            "stat": "wis",
            "tag": "repair",
            "dc": 8,
            "pass": "brief-hint",
            "fail": "goo"
          }
        }
      ]
    },
    "brief-raise": {
      "type": "dialogue",
      "room": "duchess-mess",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.3",
      "emotion": "grumpy",
      "direction": "Grudging, sour, and enjoying being talked into it a little.",
      "text": "Fine. You talked me into it. Your pay goes up when the floor goes down. Now go away.",
      "choices": [
        {
          "label": "Where is the gym?",
          "to": "goo",
          "reward": {
            "money": 4
          }
        }
      ]
    },
    "brief-hint": {
      "type": "dialogue",
      "room": "duchess-mess",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.6",
      "emotion": "sly",
      "direction": "Lowered voice, a glance over his shoulder, a man leaking secrets to avoid paperwork.",
      "text": "Foam. Wellness foam. Something in the wall is, ah, enthusiastic. Don't tell the engineer I told you. He cries.",
      "choices": [
        {
          "label": "Where is the gym?",
          "to": "goo"
        }
      ]
    },
    "brief-no": {
      "type": "dialogue",
      "room": "duchess-mess",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.4",
      "emotion": "dry",
      "direction": "Flat as a dead battery. He does not even look up.",
      "text": "No. Pay is what I say it is, and I say it is small. Go mop, janitor.",
      "choices": [
        {
          "label": "Fine. Where is the gym?",
          "to": "goo"
        }
      ]
    },
    "goo": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "beat": "The gym doors hiss open on a jungle that is mostly white. Knee-deep goo sloshes around fake vines, and the lights flicker like they are embarrassed.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.1",
      "emotion": "dry",
      "direction": "Leaning on the doorframe, unbothered, wiping goo off her boot with another goo-covered glove.",
      "text": "Welcome to the part of the job nobody mentioned. Mind the sinkholes. The sinkholes are sort of alive.",
      "choices": [
        {
          "label": "Ask what is wrong with this room.",
          "to": "pip"
        },
        {
          "label": "Ask Nessa about the captain.",
          "to": "nessa"
        },
        {
          "label": "Start cleaning.",
          "to": "choice"
        }
      ]
    },
    "nessa": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "beat": "Nessa Calloway, pilot, is still leaning on the doorframe. She has the look of someone who has said this sentence before.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.2",
      "emotion": "grumpy",
      "direction": "Tired and sharp. Not quite as mean as she sounds, and she knows it.",
      "text": "Tull lost seven gunners and calls it bad luck. I am a pilot. I do not do luck. I do math, and the math is bad.",
      "choices": [
        {
          "label": "Go on",
          "to": "nessa-2"
        }
      ]
    },
    "nessa-2": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.3",
      "emotion": "sly",
      "direction": "A wink hidden inside a shrug.",
      "text": "Ask the engineer what is wrong with the gym. He will tell you everything, and then he will cry a bit.",
      "choices": [
        {
          "label": "Find Pip.",
          "to": "pip"
        },
        {
          "label": "Fine. Let's clean it.",
          "to": "choice"
        }
      ]
    },
    "pip": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "beat": "Pip Rourke, engineer, is lying under a wall panel held together with tape and nerves.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s1.1",
      "emotion": "worried",
      "direction": "Fast, anxious, brilliant. Talks with both hands inside the wall.",
      "text": "It is not the program, it is the wall. A foam valve is stuck open and dumping wellness foam. The program just keeps making more of it. I can't reach the valve from here.",
      "choices": [
        {
          "label": "Go on",
          "to": "pip-2"
        }
      ]
    },
    "pip-2": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s1.2",
      "emotion": "tender",
      "direction": "Quiet and earnest. Clearly wants you to do well.",
      "text": "You can fix the valve with a wrench, or you can reset the program from the console. Either one works. Neither one is safe.",
      "choices": [
        {
          "label": "Right. Time to clean.",
          "to": "choice"
        }
      ]
    },
    "choice": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "speaker": null,
      "text": "Three ways out of the goo, and one you would rather not think about. The gym console blinks at you, patient as a cat.",
      "choices": [
        {
          "label": "Scrub it by hand. Slow, dull, and all yours.",
          "to": "end-clean"
        },
        {
          "label": "Fix the leaking valve.",
          "check": {
            "skill": "repair",
            "stat": "wis",
            "tag": "repair",
            "dc": 10,
            "pass": "end-source-fixed",
            "fail": "end-slimed"
          }
        },
        {
          "label": "Improvise a squeegee and an absorber from the supply closet.",
          "check": {
            "skill": "crafting",
            "stat": "wis",
            "tag": "crafting",
            "dc": 10,
            "pass": "end-clean",
            "fail": "end-slimed"
          }
        },
        {
          "label": "Reset the holodeck program from its console.",
          "check": {
            "skill": "hacking",
            "stat": "wis",
            "tag": "hacking",
            "dc": 12,
            "pass": "end-source-fixed",
            "fail": "end-projector-fried"
          }
        }
      ]
    },
    "end-clean": {
      "type": "end",
      "room": "duchess-holodeck",
      "result": "success",
      "outcome": "clean",
      "title": "Floors by hand",
      "reward": {
        "money": 14,
        "flags": {
          "goo-cleared": 1,
          "shift-1-over": 1
        }
      },
      "beat": "By hand or by squeegee, you get the tiles to remember their own color. The foam still drips from the wall, but the floor is clean by the end of the shift.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.4",
      "emotion": "dry",
      "direction": "Crackling over the intercom, bored and not quite bored.",
      "text": "Nice floors, janitor. Tull says the lanes are quiet. Tull is wrong. A toll problem is coming up the lane, and it has a terrible attitude."
    },
    "end-source-fixed": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "beat": "Whether you crack the valve or talk the program down, the foam stops. The goo stops rising, and the room goes quiet for the first time in weeks.",
      "speaker": "Pip Rourke",
      "portrait": "pip",
      "line": "pip.s1.3",
      "emotion": "proud",
      "direction": "Beaming out from under the panel, covered in tape and foam.",
      "text": "You didn't panic and you didn't break anything. I'm impressed. Don't tell anyone, I have a reputation to protect.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-source-fixed-end"
        }
      ]
    },
    "end-source-fixed-end": {
      "type": "end",
      "room": "duchess-holodeck",
      "result": "success",
      "outcome": "source-fixed",
      "title": "Source found",
      "reward": {
        "money": 24,
        "rep": {
          "tull": 3
        },
        "flags": {
          "goo-cleared": 1,
          "goo-source-fixed": 1,
          "pip-impressed": 1,
          "shift-1-over": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.5",
      "emotion": "sly",
      "direction": "Half impressed, half suspicious, all sly.",
      "text": "Huh. The janitor fixed the gym. Tull will take the credit, obviously. Also, a toll problem is coming, and it is bringing friends."
    },
    "end-slimed": {
      "type": "end",
      "room": "duchess-holodeck",
      "result": "failure",
      "outcome": "slimed",
      "title": "Under the goo",
      "reward": {
        "money": 6,
        "flags": {
          "shift-1-over": 1
        }
      },
      "beat": "Your boot hits a slick patch and the foam closes over your head. You come up spitting bubbles. Tull docks most of your pay for the splash damage.",
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.6",
      "emotion": "deadpan",
      "direction": "Flat delivery, with a faint trace of pity she will deny.",
      "text": "We pulled you out with a mop. Tull says you're docked. Good news: a toll problem is coming up the lane, and I didn't even have to look for it."
    },
    "end-projector-fried": {
      "type": "dialogue",
      "room": "duchess-holodeck",
      "beat": "The console beeps, the holodeck projector sparks, and a whole fake waterfall freezes in mid-splash. A thin smoke curls up out of the vines.",
      "speaker": "Captain Tull",
      "portrait": "tull",
      "line": "tull.s1.5",
      "emotion": "grumpy",
      "direction": "Arriving late, looking at the smoke like it has insulted him.",
      "text": "Who let the janitor near a console? Dock the janitor ten. And make sure they know it was their idea.",
      "choices": [
        {
          "label": "Go on",
          "to": "end-projector-fried-end"
        }
      ]
    },
    "end-projector-fried-end": {
      "type": "end",
      "room": "duchess-holodeck",
      "result": "failure",
      "outcome": "projector-fried",
      "title": "Smoke in the jungle",
      "reward": {
        "money": -10,
        "rep": {
          "tull": -2
        },
        "flags": {
          "holo-projector-fried": 1,
          "shift-1-over": 1
        }
      },
      "speaker": "Nessa Calloway",
      "portrait": "nessa",
      "line": "nessa.s1.7",
      "emotion": "menacing",
      "direction": "Crisp and cold over the intercom, ending on a very dry joke.",
      "text": "Janitor, the projector is dead and Tull is sulking. Also, a toll problem is coming up the lane, and it is not the kind we can mop."
    }
  }
};
