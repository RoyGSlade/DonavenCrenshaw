// Vey, "The Railgun Paper Trail". Donaven's item-quest example: steal it, file for it, or build it
// with Garrity (mining and assembly). Story fragment 2. Random: warehouse, guards, clerk (and whether a
// bribe works), fee, the missing part, the race rival.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "railgun-paper-trail",
  "title": "The Railgun Paper Trail",
  "giver": "vey",
  "location": "beacon",
  "summary": "The lanes need railguns. Steal one, file for one, or build one with Garrity.",
  "rolls": {
    "warehouse": {
      "pick": [
        "Bonded Warehouse 9",
        "the Tollgate Annex",
        "Depot Kappa"
      ]
    },
    "guards": {
      "enemy": "guards"
    },
    "clerk": {
      "pick": [
        {
          "name": "Clerk Pellam",
          "kind": "by-the-book",
          "tell": "has three pens, all aligned"
        },
        {
          "name": "Clerk Osei",
          "kind": "bribable",
          "tell": "keeps glancing at your credit chit"
        },
        {
          "name": "Clerk Brannagh",
          "kind": "bored",
          "tell": "is building a tower out of rejected forms"
        }
      ]
    },
    "fee": {
      "range": [
        35,
        60
      ]
    },
    "part": {
      "pick": [
        {
          "label": "a coil stack"
        },
        {
          "label": "a barrel liner"
        },
        {
          "label": "a capacitor bank"
        }
      ]
    },
    "rival": {
      "name": {
        "pick": [
          "Guild Express",
          "a Syndicate runner",
          "the Beacon mail drone"
        ]
      },
      "pace": {
        "pick": [
          0.86,
          0.9,
          0.94
        ]
      }
    },
    "scav": {
      "enemy": "scav"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.intro",
      "emotion": "sly",
      "direction": "Enjoying the options like dessert, silky and amused.",
      "text": "The Guild wants railguns and can't buy one, because the Guild wrote the rule that says nobody can. You, darling, are nobody. Three ways in. Pick the one that suits your conscience.",
      "choices": [
        {
          "label": "\"Where is one kept?\" (steal it)",
          "to": "steal-plan"
        },
        {
          "label": "\"Who signs for one?\" (file the paperwork)",
          "to": "office"
        },
        {
          "label": "\"What is one made of?\" (build it)",
          "to": "build-travel"
        }
      ]
    },
    "steal-plan": {
      "type": "dialogue",
      "beat": "Vey draws {warehouse} on a napkin. It is a very good napkin drawing.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.steal",
      "emotion": "sly",
      "direction": "Conspiratorial, enjoying it far too much.",
      "text": "One railgun, crated, waiting for a requisition that will never come. Guards on the door. Bored ones, if we're lucky.",
      "choices": [
        {
          "label": "Go in through the vents (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 8,
            "pass": "vault",
            "fail": "guards"
          }
        },
        {
          "label": "Walk in with a forged manifest (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "vault",
            "fail": "guards"
          }
        },
        {
          "label": "Wave your Guild permit at them",
          "to": "vault",
          "requires": {
            "items": {
              "permit": 1
            }
          }
        },
        {
          "label": "Hack the sealed loading-bay door and skip the lock (Hacker 2)",
          "to": "vault-open",
          "requires": {
            "skills": {
              "hacker": 2
            }
          }
        }
      ]
    },
    "guards": {
      "type": "fight",
      "mode": "foot",
      "title": "Warehouse guards",
      "enemy": "$guards",
      "dc": 7,
      "outcomes": {
        "win": "vault",
        "lose": "end-caught",
        "flee": "end-empty"
      }
    },
    "vault": {
      "type": "puzzle",
      "kind": "cipher",
      "params": {
        "title": "Warehouse lock",
        "length": 4,
        "symbols": 5,
        "attempts": 5
      },
      "outcomes": {
        "solved": "end-stolen",
        "failed": "alarm"
      }
    },
    "vault-open": {
      "type": "dialogue",
      "speaker": null,
      "text": "The bay door sighs open for you like it has been waiting years for someone to ask nicely. The crate is right there, stencilled DO NOT.",
      "choices": [
        {
          "label": "Do.",
          "to": "end-stolen"
        }
      ]
    },
    "alarm": {
      "type": "dialogue",
      "speaker": null,
      "text": "The lock buzzes. Somewhere above you, a klaxon clears its throat.",
      "choices": [
        {
          "label": "Run for it (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 7,
            "pass": "end-empty",
            "fail": "end-caught"
          }
        }
      ]
    },
    "office": {
      "type": "dialogue",
      "beat": "The Ordnance Office is a queue, a counter, and {clerk.name}, who {clerk.tell}.",
      "speaker": "{clerk.name}",
      "line": "clerk.railgun.office",
      "emotion": "deadpan",
      "direction": "Reading the rules aloud with deep and genuine love for them.",
      "text": "Lane-defence ordnance is form 27-B. With a 9-C if the ordnance is kinetic. Unless it is Tuesday. Is it Tuesday?",
      "choices": [
        {
          "label": "Fill in the forms properly (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "puzzle",
            "dc": 7,
            "pass": "stamped",
            "fail": "wrong-form"
          }
        },
        {
          "label": "Slide {fee} credits under the blotter",
          "to": "bribe",
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
        }
      ]
    },
    "bribe": {
      "type": "branch",
      "cases": [
        {
          "when": {
            "roll": {
              "clerk.kind": "bribable"
            }
          },
          "to": "stamped"
        }
      ],
      "else": "end-reported"
    },
    "wrong-form": {
      "type": "dialogue",
      "beat": "The stamp hovers, and does not fall.",
      "speaker": "{clerk.name}",
      "line": "clerk.railgun.wrong",
      "emotion": "deadpan",
      "direction": "Gently tragic, a teacher with a disappointing pupil.",
      "text": "This is a 27-A. A 27-A requisitions decorative ordnance. Do you want a decorative railgun?",
      "choices": [
        {
          "label": "Ask nicely, and mean it (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 8,
            "pass": "stamped",
            "fail": "end-rejected"
          }
        },
        {
          "label": "Give up on paperwork",
          "to": "end-rejected"
        }
      ]
    },
    "stamped": {
      "type": "dialogue",
      "beat": "Thunk. Out of the window, {rival.name} is already lining up for the same armoury run.",
      "speaker": "{clerk.name}",
      "line": "clerk.railgun.stamped",
      "emotion": "neutral",
      "direction": "Brisk and almost cheerful, the joy of a completed form.",
      "text": "Approved. It expires at shift change, which is in four minutes. The armoury is across the ring. Good luck. I mean that procedurally.",
      "choices": [
        {
          "label": "Race it there.",
          "to": "armoury-race"
        }
      ]
    },
    "armoury-race": {
      "type": "race",
      "track": "gantry-drop",
      "rival": "$rival",
      "outcomes": {
        "win": "end-filed",
        "lose": "end-expired"
      }
    },
    "build-travel": {
      "type": "travel",
      "title": "To Garrity's yard",
      "to": "dustfall",
      "outcomes": {
        "arrived": "garrity"
      }
    },
    "garrity": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.yard",
      "emotion": "excited",
      "direction": "Huge laugh, delighted by the idea.",
      "text": "You want to BUILD a railgun? Adorable. You need ore, which is in the rocks, a drill, which you don't have, and {part.label}, which nobody has. Lefty, she wants to build one!",
      "audioText": "You want to BUILD a railgun? Adorable. You need ore, which is in the rocks, a drill, which you don't have, and a part nobody has. Lefty, she wants to build one!",
      "choices": [
        {
          "label": "Buy a drill (60 credits)",
          "to": "mine",
          "cost": {
            "money": 60
          },
          "reward": {
            "items": {
              "mining-drill": 1
            }
          }
        },
        {
          "label": "Use your own drill",
          "to": "mine",
          "requires": {
            "items": {
              "mining-drill": 1
            }
          }
        },
        {
          "label": "Earn the loan of one: shift scrap all morning (Strength)",
          "check": {
            "stat": "str",
            "tag": "lift",
            "dc": 7,
            "pass": "mine",
            "fail": "no-drill"
          }
        }
      ]
    },
    "no-drill": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.nodrill",
      "emotion": "playful",
      "direction": "Teasing, fond, a big man being gentle.",
      "text": "You lifted three crates and had a little lie down. No drill for you, kid.",
      "choices": [
        {
          "label": "Buy one after all (60 credits)",
          "to": "mine",
          "cost": {
            "money": 60
          },
          "reward": {
            "items": {
              "mining-drill": 1
            }
          }
        },
        {
          "label": "Walk away",
          "to": "end-no-gun"
        }
      ]
    },
    "mine": {
      "type": "event",
      "title": "Out to the rocks",
      "deck": [
        "scav-claim",
        "pod"
      ],
      "chance": 0.6,
      "next": "dig"
    },
    "dig": {
      "type": "dialogue",
      "speaker": null,
      "text": "The seam glitters under your lights. The drill bucks like it has opinions about you.",
      "choices": [
        {
          "label": "Dig deep (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 7,
            "pass": "ore",
            "fail": "collapse"
          }
        }
      ]
    },
    "collapse": {
      "type": "dialogue",
      "speaker": null,
      "text": "The seam collapses in a slow grey cloud. There is more ore behind it. Probably.",
      "choices": [
        {
          "label": "Dig again, harder (Strength)",
          "check": {
            "stat": "str",
            "tag": "dig",
            "dc": 9,
            "pass": "ore",
            "fail": "end-no-gun"
          }
        },
        {
          "label": "Call it",
          "to": "end-no-gun"
        }
      ]
    },
    "ore": {
      "type": "dialogue",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.ore",
      "emotion": "excited",
      "direction": "Salesman voice, rubbing his hands.",
      "text": "Good ore! Now. The part. I've got one. You could buy it. Or a claim-jumper out by the wreck field has one bolted to his tug. Your call, kid.",
      "onEnter": {
        "items": {
          "ore": 3
        }
      },
      "choices": [
        {
          "label": "Buy Garrity's (90 credits)",
          "to": "assemble",
          "cost": {
            "money": 90
          }
        },
        {
          "label": "Take it off the claim-jumper",
          "to": "part-fight"
        }
      ]
    },
    "part-fight": {
      "type": "fight",
      "mode": "ship",
      "title": "Claim-jumper",
      "enemy": "$scav",
      "outcomes": {
        "win": "assemble",
        "parley": "assemble",
        "lose": "end-no-gun",
        "flee": "end-no-gun"
      }
    },
    "assemble": {
      "type": "puzzle",
      "kind": "cipher",
      "params": {
        "title": "Coil alignment",
        "length": 4,
        "symbols": 6,
        "attempts": 7
      },
      "outcomes": {
        "solved": "end-built",
        "failed": "end-scrapped"
      }
    },
    "end-stolen": {
      "type": "end",
      "result": "success",
      "outcome": "stolen",
      "title": "Stolen",
      "beat": "You leave {warehouse} with a crate under your arm and nobody behind you.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.stolen",
      "emotion": "sly",
      "direction": "Delighted, then a little too interested.",
      "text": "Lovely work. And look at the requisition slip in the crate. Signed by the old Warden Office. To your ship's licence. Isn't that interesting?",
      "reward": {
        "items": {
          "railgun": 1
        },
        "rep": {
          "vey": 8,
          "hask": -3
        },
        "skillPoints": 1,
        "flags": {
          "fragment-2": 1,
          "stole-railgun": 1
        },
        "unlocks": [
          "badge:railgun"
        ]
      }
    },
    "end-filed": {
      "type": "end",
      "result": "success",
      "outcome": "filed",
      "title": "Filed in triplicate",
      "beat": "You slap the stamped form on the armoury counter with seconds to spare.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.filed",
      "emotion": "proud",
      "direction": "Genuinely impressed, a soft clap.",
      "text": "Legally. You got a railgun legally. Nobody does that. And the only railgun on the books was signed out years ago, against your licence number. Curious.",
      "reward": {
        "items": {
          "railgun": 1
        },
        "rep": {
          "vey": 5,
          "hask": 4
        },
        "skillPoints": 1,
        "flags": {
          "fragment-2": 1
        },
        "unlocks": [
          "badge:railgun"
        ]
      }
    },
    "end-built": {
      "type": "end",
      "result": "success",
      "outcome": "built",
      "title": "Built by hand",
      "beat": "The coils sing when they line up. Garrity wipes his eyes with Lefty.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.built",
      "emotion": "tender",
      "direction": "Choked up, pretending it is dust.",
      "text": "It's dust. It's just dust. ...Look there, kid. A Warden serial in the liner. That's your licence number. Now how did that get there?",
      "reward": {
        "items": {
          "railgun": 1
        },
        "rep": {
          "garrity": 10,
          "vey": 2
        },
        "skillPoints": 1,
        "flags": {
          "fragment-2": 1
        },
        "unlocks": [
          "badge:railgun"
        ]
      }
    },
    "end-caught": {
      "type": "end",
      "result": "failure",
      "outcome": "caught",
      "title": "Caught",
      "beat": "The guards are not bored any more. You pay the fine.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.caught",
      "emotion": "sly",
      "direction": "Unbothered, already billing you.",
      "text": "Caught. Never mind. I made the report disappear. For a fee. It's always for a fee.",
      "reward": {
        "money": -50,
        "rep": {
          "vey": -2
        }
      }
    },
    "end-empty": {
      "type": "end",
      "result": "failure",
      "outcome": "empty-handed",
      "title": "Empty-handed",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.empty",
      "emotion": "playful",
      "direction": "Light, teasing, selling you something on the way out.",
      "text": "Out clean and empty. Half a win. I'll sell you the next idea for twenty credits. That one was free.",
      "reward": {
        "money": -20
      }
    },
    "end-reported": {
      "type": "end",
      "result": "failure",
      "outcome": "reported",
      "title": "Reported",
      "beat": "Your credits are not coming back.",
      "speaker": "{clerk.name}",
      "line": "clerk.railgun.reported",
      "emotion": "deadpan",
      "direction": "Calmly filing your crime, pleased to have a new form to use.",
      "text": "Attempted bribery is form 40. I have three copies. You may keep one.",
      "reward": {
        "rep": {
          "hask": -4
        }
      }
    },
    "end-rejected": {
      "type": "end",
      "result": "failure",
      "outcome": "rejected",
      "title": "Rejected",
      "speaker": "{clerk.name}",
      "line": "clerk.railgun.rejected",
      "emotion": "deadpan",
      "direction": "Stamping with great feeling.",
      "text": "Rejected. Please take a ticket and queue again. The queue is seven years.",
      "reward": {}
    },
    "end-expired": {
      "type": "end",
      "result": "failure",
      "outcome": "expired",
      "title": "Expired",
      "beat": "You arrive as the armoury shutter comes down.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.railgun.expired",
      "emotion": "warm",
      "direction": "Kind for once, finding the silver lining.",
      "text": "Shutter came down on your nose? Keep the permit they gave you. A permit is a door, darling. Doors are worth money.",
      "reward": {
        "items": {
          "permit": 1
        }
      }
    },
    "end-no-gun": {
      "type": "end",
      "result": "failure",
      "outcome": "no-gun",
      "title": "No gun",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.nogun",
      "emotion": "warm",
      "direction": "Big-hearted, a pat on the back.",
      "text": "Not everyone's a builder, kid. Some people are customers. You can be my favourite customer.",
      "reward": {
        "rep": {
          "garrity": 1
        }
      }
    },
    "end-scrapped": {
      "type": "end",
      "result": "failure",
      "outcome": "scrapped",
      "title": "Scrapped",
      "beat": "The coils fight each other, and everybody loses.",
      "speaker": "Hob Garrity",
      "portrait": "garrity",
      "line": "garrity.railgun.scrapped",
      "emotion": "playful",
      "direction": "Laughing at the disaster, not at you.",
      "text": "Well. That's the most expensive scrap pile in Dustfall. I'm proud of it, honestly.",
      "reward": {
        "items": {
          "scrap": 3
        }
      }
    }
  }
};
