// Hask, "Black Lane". Out to Nether Crossing. Story fragment 4. DEADLY: losing a fight kills the captain (S25).
// Random: the blockade point, the picket raider, the lieutenant (an ace with two rolled abilities), trip events.
// Wins: cleared, caught her in a race, sent a message. Fails: towed back (death), turned back.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "black-lane",
  "title": "Black Lane",
  "giver": "hask",
  "location": "alpha",
  "summary": "Clear the raider blockade off the Nether Crossing lane. Deadly.",
  "repeatable": true,
  "rolls": {
    "point": {
      "pick": [
        "the gravity wells",
        "the old gate pylons",
        "the ice shoal"
      ]
    },
    "wave": {
      "enemy": "raider"
    },
    "lieutenant": {
      "enemy": "ace"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "beat": "Hask taps the map at {point}. Even Deputy looks worried, and Deputy is a cactus.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.black-lane.intro",
      "emotion": "worried",
      "direction": "Grave and slow, the honest giver telling you the price.",
      "text": "Raiders have shut the Nether lane. Their lieutenant flies something with an amber eye on the nose. Clear the lane. And this one can kill you, so come home.",
      "choices": [
        {
          "label": "\"Clearing lanes is what I do.\"",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "Out to the Black Lane",
      "to": "nether",
      "risk": 0,
      "outcomes": {
        "arrived": "wave-hail"
      }
    },
    "wave-hail": {
      "type": "dialogue",
      "beat": "A picket raider peels away from {point} to meet you.",
      "speaker": "{wave.name}",
      "line": "raider.black-lane.hail",
      "emotion": "menacing",
      "direction": "A bored picket guard on a toll booth, chewing something.",
      "text": "Lane's closed, courier. Closed closed. Says so on the sign. We made a sign.",
      "choices": [
        {
          "label": "Open it.",
          "to": "wave"
        }
      ]
    },
    "wave": {
      "type": "fight",
      "mode": "ship",
      "title": "Picket raider",
      "enemy": "$wave",
      "outcomes": {
        "win": "lieutenant",
        "parley": "lieutenant",
        "lose": "end-towed",
        "flee": "end-turned-back"
      }
    },
    "lieutenant": {
      "type": "dialogue",
      "beat": "The lieutenant drifts out of {point}. On her nose an amber eye turns to look at you, and your comms click: three taps and a pause.",
      "speaker": "{lieutenant.name}",
      "line": "kestrel.black-lane.warning",
      "emotion": "menacing",
      "direction": "Cool and unhurried, the ace who has never lost. A smile you can hear.",
      "text": "Nice flying, courier. Truly. Now turn around. I only ask nicely once, and that was it.",
      "choices": [
        {
          "label": "Fight her.",
          "to": "duel"
        },
        {
          "label": "\"Take a message to your warlord instead.\" (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 9,
            "pass": "end-message",
            "fail": "duel"
          }
        },
        {
          "label": "Hack the relic's feed: it is listening, not looking. Answer it. (Hacker)",
          "to": "eye",
          "requires": {
            "skills": {
              "hacker": 1
            }
          }
        },
        {
          "label": "Broadcast Edna's Syndicate codes",
          "to": "codes",
          "requires": {
            "items": {
              "syndicate-codes": 1
            }
          },
          "hideLocked": true
        }
      ]
    },
    "eye": {
      "type": "dialogue",
      "beat": "You tap the Knock back. The amber eye flares, and her ship lurches as if something inside it just woke up. She bolts for the wells.",
      "speaker": "{lieutenant.name}",
      "line": "kestrel.black-lane.eye",
      "emotion": "worried",
      "direction": "Rattled for the first time in her life, covering it with speed.",
      "text": "What did you just do? It's never done that. It's never done that!",
      "choices": [
        {
          "label": "Chase her.",
          "to": "chase"
        }
      ]
    },
    "codes": {
      "type": "dialogue",
      "speaker": "{lieutenant.name}",
      "line": "kestrel.black-lane.codes",
      "emotion": "dry",
      "direction": "Amused, a little impressed, packing up.",
      "text": "Edna's codes. Of course they are. Tell the old girl I said hello. Lane's yours.",
      "choices": [
        {
          "label": "Watch her go.",
          "to": "end-message"
        }
      ]
    },
    "duel": {
      "type": "fight",
      "mode": "ship",
      "title": "Red Kestrel",
      "enemy": "$lieutenant",
      "outcomes": {
        "win": "end-cleared",
        "parley": "end-message",
        "lose": "end-towed",
        "flee": "end-turned-back"
      }
    },
    "chase": {
      "type": "race",
      "track": "abandoned-mall",
      "rival": {
        "name": "Red Kestrel",
        "pace": {
          "pick": [
            0.88,
            0.92
          ]
        }
      },
      "outcomes": {
        "win": "end-caught",
        "lose": "end-cleared"
      }
    },
    "end-cleared": {
      "type": "end",
      "result": "success",
      "outcome": "cleared",
      "title": "Lane cleared",
      "beat": "Where the lieutenant was, a Warden relic tumbles in the dust: an amber eye, still warm, tuned to the Knock.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.black-lane.cleared",
      "emotion": "proud",
      "direction": "Pride he will deny later, kept very short.",
      "text": "Lane's open. Haulers are moving. You did that. Don't let it go to your head, Deputy's already insufferable.",
      "reward": {
        "money": 90,
        "rep": {
          "hask": 10
        },
        "skillPoints": 1,
        "flags": {
          "fragment-4": 1
        },
        "unlocks": [
          "badge:black-lane"
        ]
      }
    },
    "end-caught": {
      "type": "end",
      "result": "success",
      "outcome": "caught-her",
      "title": "Caught her",
      "beat": "You run her down in the wells. She surrenders the eye with both hands. It knocks in your palm.",
      "speaker": "{lieutenant.name}",
      "line": "kestrel.black-lane.caught",
      "emotion": "dry",
      "direction": "A good loser, handing over the prize, relieved to be rid of it.",
      "text": "Fine. Take the eye. Take it! It never shuts up. It knocks in my sleep.",
      "reward": {
        "money": 110,
        "rep": {
          "hask": 12
        },
        "skillPoints": 1,
        "flags": {
          "fragment-4": 1,
          "amber-eye": 1
        },
        "unlocks": [
          "badge:black-lane"
        ]
      }
    },
    "end-message": {
      "type": "end",
      "result": "success",
      "outcome": "message",
      "title": "Sent a message",
      "beat": "She goes, and the blockade goes with her. Before she jumps she sends you a file: the eye's recording. The Knock, and a licence number.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.black-lane.message",
      "emotion": "dry",
      "direction": "Mock stern, secretly pleased.",
      "text": "I said clear the lane, not make friends. ...It's clear, though. Fine. Good. Go away.",
      "reward": {
        "money": 60,
        "rep": {
          "hask": 6
        },
        "skillPoints": 1,
        "flags": {
          "fragment-4": 1,
          "spared-lieutenant": 1
        },
        "unlocks": [
          "badge:black-lane"
        ]
      }
    },
    "end-towed": {
      "type": "end",
      "result": "failure",
      "outcome": "towed",
      "title": "Towed back",
      "beat": "A Guild tug hauls your ship home with the hull open to the stars and you not breathing.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.black-lane.towed",
      "emotion": "tender",
      "direction": "Very quiet. The gruffness cracks right down the middle.",
      "text": "Med bay says you're breathing again. Good. I told you this one could kill you. Next time, believe me sooner.",
      "death": true,
      "reward": {
        "money": -30,
        "rep": {
          "hask": -3
        }
      }
    },
    "end-turned-back": {
      "type": "end",
      "result": "failure",
      "outcome": "turned-back",
      "title": "Turned back",
      "beat": "You make it out. Hask looks at the map for a long time.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.black-lane.turned",
      "emotion": "neutral",
      "direction": "Tired, fair, already planning.",
      "text": "Alive and back. That's not nothing. The lane stays shut. We'll try again.",
      "reward": {
        "rep": {
          "hask": -2
        }
      }
    }
  }
};
