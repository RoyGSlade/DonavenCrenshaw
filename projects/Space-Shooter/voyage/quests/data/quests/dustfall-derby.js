// Garrity, "The Dustfall Derby". Build a racer from junk (buy, salvage or tune an engine; bolt it
// together) then race it. Smooth Burn 2 opens a tuned engine. Wins: champion, on a booster, second place.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "dustfall-derby",
  "title": "The Dustfall Derby",
  "giver": "garrity",
  "location": "dustfall",
  "summary": "Build a racer out of junk and win Garrity the Derby trophy. He has never won it.",
  "pitch": {
    "line": "garrity.job.dustfall-derby",
    "emotion": "excited",
    "direction": "A kid on his birthday.",
    "text": "Derby day! Build a racer out of my junk and win me a trophy. Thirty years I've waited."
  },
  "repeatable": true,
  "rolls": {
    "rival": {
      "name": {
        "pick": [
          "Mad Mags and the Rustbucket",
          "the Tully Twins",
          "Old Spanner Joe"
        ]
      },
      "pace": {
        "pick": [
          0.88,
          0.9,
          0.93
        ]
      }
    },
    "prize": {
      "range": [
        90,
        140
      ]
    },
    "scav": {
      "enemy": "scav"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.derby.intro",
      "emotion": "excited",
      "direction": "Over the moon, a kid on his birthday.",
      "text": "Derby day! Every year Dustfall races junk through the field. Every year Lefty and I lose. This year we've got you! Build a racer, kid. Win me a trophy!",
      "choices": [
        {
          "label": "\"Let's build.\"",
          "to": "yard"
        }
      ]
    },
    "yard": {
      "type": "dialogue",
      "speaker": null,
      "text": "Garrity's yard: a mountain of parts and a sign that says NO REFUNDS, NO QUESTIONS, NO LEFTY.",
      "choices": [
        {
          "label": "Buy a proper engine (60 credits)",
          "to": "frame",
          "cost": {
            "money": 60
          },
          "set": {
            "engine": true
          }
        },
        {
          "label": "Bolt on the fuel cells you carry (2 fuel cells)",
          "to": "frame",
          "cost": {
            "items": {
              "fuel-cell": 2
            }
          },
          "set": {
            "engine": true
          }
        },
        {
          "label": "Salvage an engine off a scav tug in the field",
          "to": "salvage"
        },
        {
          "label": "Tune a junk engine into a monster (Mechanic)",
          "to": "frame",
          "requires": {
            "skills": {
              "mechanic": 1
            }
          },
          "set": {
            "engine": true
          }
        }
      ]
    },
    "salvage": {
      "type": "fight",
      "mode": "ship",
      "title": "Scav tug",
      "enemy": "$scav",
      "outcomes": {
        "win": "salvaged",
        "parley": "salvaged",
        "lose": "junk",
        "flee": "junk"
      }
    },
    "salvaged": {
      "type": "dialogue",
      "speaker": null,
      "text": "The tug's engine comes out still warm and still swearing at you in machine code. Perfect.",
      "set": {
        "engine": true
      },
      "choices": [
        {
          "label": "Haul it back to the yard.",
          "to": "frame"
        }
      ]
    },
    "junk": {
      "type": "dialogue",
      "speaker": null,
      "text": "No engine worth the name. Garrity straps on his emergency booster and says a small prayer to it.",
      "choices": [
        {
          "label": "Build anyway.",
          "to": "frame"
        }
      ]
    },
    "frame": {
      "type": "dialogue",
      "speaker": null,
      "text": "Engine in. Wheels? No wheels, it's space. Fins? Fins. Now it all needs bolting together before the horn.",
      "choices": [
        {
          "label": "Bolt it together.",
          "to": "bolts"
        }
      ]
    },
    "bolts": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Bolt pattern",
      "params": {
        "title": "Bolt pattern",
        "length": 3,
        "symbols": 5,
        "attempts": 5
      },
      "outcomes": {
        "solved": "grid",
        "failed": "wobbly"
      }
    },
    "wobbly": {
      "type": "dialogue",
      "speaker": null,
      "text": "It holds together. Mostly. A fin falls off as you look at it. You glue it back on with optimism.",
      "choices": [
        {
          "label": "Roll it to the grid.",
          "to": "grid"
        }
      ]
    },
    "grid": {
      "type": "dialogue",
      "speaker": "Derby announcer",
      "line": "derby.derby.grid",
      "emotion": "excited",
      "direction": "Fast booming sports announcer, all exclamation marks, loving every crash.",
      "text": "Welcome to the Dustfall Derby! On the grid: {rival.name}, the favourites! And some courier in a thing Garrity built! Engines!",
      "audioText": "Welcome to the Dustfall Derby! On the grid: the favourites! And some courier in a thing Garrity built! Engines!",
      "choices": [
        {
          "label": "Race!",
          "to": "race"
        },
        {
          "label": "Back out. This thing will kill you.",
          "to": "end-scratched"
        }
      ]
    },
    "race": {
      "type": "race",
      "track": "abandoned-mall",
      "rival": "$rival",
      "outcomes": {
        "win": "won",
        "lose": "lost"
      }
    },
    "won": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "engine": true
            }
          },
          "to": "end-won"
        }
      ],
      "else": "end-booster"
    },
    "lost": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "local": {
              "engine": true
            }
          },
          "to": "end-second"
        }
      ],
      "else": "end-wrecked"
    },
    "end-won": {
      "type": "end",
      "result": "success",
      "outcome": "won",
      "title": "Derby champion",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.derby.won",
      "emotion": "excited",
      "direction": "Screaming with joy, then choked up.",
      "text": "We WON! Lefty, we won! Put it on the shelf! We don't have a shelf! Build a shelf! ...Thirty years, kid. Thirty years.",
      "reward": {
        "money": "$prize",
        "rep": {
          "garrity": 12
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:dustfall-derby"
        ]
      }
    },
    "end-booster": {
      "type": "end",
      "result": "success",
      "outcome": "booster",
      "title": "On a booster and a prayer",
      "speaker": "Derby announcer",
      "line": "derby.derby.booster",
      "emotion": "excited",
      "direction": "Losing his mind on air.",
      "text": "On an emergency booster! Held together with glue! The courier takes the Derby! I have never seen anything so stupid and so beautiful!",
      "reward": {
        "money": "$prize",
        "rep": {
          "garrity": 10
        },
        "unlocks": [
          "badge:dustfall-derby"
        ]
      }
    },
    "end-second": {
      "type": "end",
      "result": "success",
      "outcome": "second",
      "title": "Second place",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.derby.second",
      "emotion": "proud",
      "direction": "Happy anyway, generous.",
      "text": "Second! That's our best ever! Lefty's crying. I'm not crying. It's the dust.",
      "reward": {
        "money": 40,
        "rep": {
          "garrity": 5
        },
        "unlocks": [
          "badge:dustfall-derby"
        ]
      }
    },
    "end-wrecked": {
      "type": "end",
      "result": "failure",
      "outcome": "wrecked",
      "title": "Wrecked",
      "speaker": "Derby announcer",
      "line": "derby.derby.wrecked",
      "emotion": "excited",
      "direction": "Gleefully reporting a disaster.",
      "text": "And Garrity's racer crosses the line in four pieces! Separately! Not technically a finish, folks!",
      "reward": {
        "rep": {
          "garrity": -2
        }
      }
    },
    "end-scratched": {
      "type": "end",
      "result": "failure",
      "outcome": "scratched",
      "title": "Scratched",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.derby.scratched",
      "emotion": "grumpy",
      "direction": "Disappointed but fair, a big sigh.",
      "text": "Scratched before the horn. Well. It probably would have killed you. Next year, eh, Lefty? Next year.",
      "reward": {
        "rep": {
          "garrity": -3
        }
      }
    }
  }
};
