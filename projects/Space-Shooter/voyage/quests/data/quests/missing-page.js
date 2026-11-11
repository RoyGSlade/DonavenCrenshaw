// Vey, "The Missing Page". Find a pickpocket in the Beacon market: ask, notice, or gamble for
// gossip at the cantina dice table; an on-foot scuffle, and a brawl when your sidearm runs dry.
// Wins: returned, read, bought back, hired the thief. Fails: lost the trail, robbed, burned it.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "missing-page",
  "title": "The Missing Page",
  "giver": "vey",
  "location": "beacon",
  "summary": "A pickpocket lifted one page from Vey's ledger. The page with everyone's secrets on it.",
  "repeatable": true,
  "rolls": {
    "hideout": {
      "pick": [
        "the noodle stalls",
        "the scrap bazaar",
        "the old customs hall"
      ]
    },
    "crew": {
      "enemy": "guards"
    },
    "tip": {
      "range": [
        15,
        30
      ]
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.intro",
      "emotion": "worried",
      "direction": "Trying to sound casual and failing by a hair.",
      "text": "Someone lifted a page from my ledger. One page. The page with everybody's secrets on it. I would like it back before lunch.",
      "choices": [
        {
          "label": "\"Who took it?\"",
          "to": "market"
        },
        {
          "label": "\"What's on it?\" (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "notice",
            "dc": 8,
            "pass": "peek",
            "fail": "market"
          }
        }
      ]
    },
    "peek": {
      "type": "dialogue",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.peek",
      "emotion": "sly",
      "direction": "A confession dressed as a joke.",
      "text": "Favours owed, and who owes them. And one entry about you, which I wrote this morning and slightly regret.",
      "set": {
        "knows-page": true
      },
      "choices": [
        {
          "label": "\"We'll talk about that later.\"",
          "to": "market"
        }
      ]
    },
    "market": {
      "type": "dialogue",
      "speaker": null,
      "text": "Beacon Prime's market is a thousand stalls and one long argument. Somebody here sold a pickpocket a getaway ticket. There is also a dice table in the cantina with a lot of loud dockhands round it.",
      "choices": [
        {
          "label": "Ask around the stalls (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 7,
            "pass": "found",
            "fail": "cold-trail"
          }
        },
        {
          "label": "Watch for who is watching you (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "notice",
            "dc": 7,
            "pass": "found",
            "fail": "cold-trail"
          }
        },
        {
          "label": "Sit in on the dockhands' dice game for gossip (stake {tip} credits)",
          "to": "dice",
          "cost": {
            "money": "$tip"
          }
        },
        {
          "label": "Pull the market's camera feeds from a terminal (Hacker)",
          "to": "found",
          "requires": {
            "skills": {
              "hacker": 1
            }
          }
        },
        {
          "label": "Scan the crowd with your goggles",
          "to": "found",
          "requires": {
            "items": {
              "scan-goggles": 1
            }
          },
          "hideLocked": true
        }
      ]
    },
    "dice": {
      "type": "dialogue",
      "speaker": null,
      "text": "Bone dice, a tin cup and six dockhands who all claim to be the best at this. The pot is small. The gossip is the real prize.",
      "choices": [
        {
          "label": "Roll and bluff (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "gamble",
            "dc": 8,
            "pass": "dice-won",
            "fail": "dice-lost"
          }
        },
        {
          "label": "Count the dice and play the odds (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "gamble",
            "dc": 8,
            "pass": "dice-won",
            "fail": "dice-lost"
          }
        }
      ]
    },
    "dice-won": {
      "type": "dialogue",
      "speaker": null,
      "text": "Double sixes. The table groans, then pays up, then tells you everything: a thin girl in a borrowed coat bought a ticket out with a ledger page as a deposit.",
      "onEnter": {
        "money": 40
      },
      "choices": [
        {
          "label": "Scoop the pot and go.",
          "to": "found"
        }
      ]
    },
    "dice-lost": {
      "type": "dialogue",
      "speaker": null,
      "text": "Snake eyes. The dockhands cheer your money into the cup. One of them takes pity on you: \"Try the noodle seller. She knows everyone.\"",
      "choices": [
        {
          "label": "Thank him and go.",
          "to": "cold-trail"
        }
      ]
    },
    "cold-trail": {
      "type": "dialogue",
      "speaker": null,
      "text": "Nobody saw anything. Everybody saw it twice. You lose an hour and a sandwich.",
      "choices": [
        {
          "label": "Pay the noodle seller for a name (20 credits)",
          "to": "found",
          "cost": {
            "money": 20
          }
        },
        {
          "label": "Give up and tell Vey.",
          "to": "end-lost-trail"
        }
      ]
    },
    "found": {
      "type": "dialogue",
      "speaker": null,
      "text": "The trail ends at {hideout}. A thin figure in a borrowed coat is counting your secrets by lamplight, with two large friends on the door.",
      "choices": [
        {
          "label": "Corner her.",
          "to": "sable"
        }
      ]
    },
    "sable": {
      "type": "dialogue",
      "speaker": "Sable",
      "line": "thief.missing-page.cornered",
      "emotion": "playful",
      "direction": "Quick, bright, cheeky, a pickpocket half a laugh from running.",
      "text": "Ooh, the courier! Hi! Big fan. Want to buy a page? It's got your name on it. Literally.",
      "choices": [
        {
          "label": "\"Hand it over, or else.\"",
          "to": "scuffle"
        },
        {
          "label": "Buy it back (60 credits)",
          "to": "end-bought",
          "cost": {
            "money": 60
          }
        },
        {
          "label": "Offer her a job instead (Charisma)",
          "check": {
            "stat": "cha",
            "tag": "talk",
            "dc": 9,
            "pass": "end-recruited",
            "fail": "scuffle"
          }
        },
        {
          "label": "Stare her friends down until they sit (Hard Stare 2)",
          "to": "page",
          "requires": {
            "skills": {
              "hard-stare": 2
            }
          }
        }
      ]
    },
    "scuffle": {
      "type": "fight",
      "mode": "foot",
      "title": "Sable's friends",
      "enemy": "$crew",
      "dc": 7,
      "outcomes": {
        "win": "page",
        "lose": "empty-gun",
        "flee": "end-lost-trail"
      }
    },
    "empty-gun": {
      "type": "dialogue",
      "speaker": null,
      "text": "Your sidearm clicks empty. The bigger friend grins and cracks his knuckles. So do you.",
      "choices": [
        {
          "label": "Punch him (Strength)",
          "check": {
            "stat": "str",
            "tag": "brawl",
            "dc": 8,
            "pass": "page",
            "fail": "end-robbed"
          }
        },
        {
          "label": "Duck out the back.",
          "to": "end-lost-trail"
        }
      ]
    },
    "page": {
      "type": "dialogue",
      "speaker": null,
      "text": "Sable's friends are on the floor and Sable is out of the window, waving. The page is still on the table, warm from the lamp.",
      "choices": [
        {
          "label": "Bring it straight back to Vey.",
          "to": "end-returned"
        },
        {
          "label": "Read it first.",
          "to": "end-read"
        },
        {
          "label": "Burn it. Nobody should have that much on anyone.",
          "to": "end-burned"
        }
      ]
    },
    "end-returned": {
      "type": "end",
      "result": "success",
      "outcome": "returned",
      "title": "Returned unread",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.returned",
      "emotion": "proud",
      "direction": "Suspicious and delighted in equal parts.",
      "text": "Not a smudge. You're the first person to return something to me without reading it. I'm suspicious, and I'm delighted.",
      "reward": {
        "money": 90,
        "rep": {
          "vey": 10
        },
        "skillPoints": 1,
        "unlocks": [
          "badge:missing-page"
        ]
      }
    },
    "end-read": {
      "type": "end",
      "result": "success",
      "outcome": "read",
      "title": "Read it first",
      "beat": "Three lines down: Courier licence, Alpha Relay. Last of its kind. Ask Chibby.",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.read",
      "emotion": "sly",
      "direction": "Amused, not fooled for a second.",
      "text": "You read it. Everyone reads it. The bit about Garrity is a lie, by the way. The bit about you is not.",
      "reward": {
        "money": 70,
        "rep": {
          "vey": 4
        },
        "skillPoints": 1,
        "flags": {
          "read-the-ledger": 1
        },
        "unlocks": [
          "badge:missing-page"
        ]
      }
    },
    "end-bought": {
      "type": "end",
      "result": "success",
      "outcome": "bought",
      "title": "Bought back",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.bought",
      "emotion": "dry",
      "direction": "Mildly pained by the economics.",
      "text": "You paid a thief to return my property. Very civilised. I'll take it out of your fee, of course.",
      "reward": {
        "money": 30,
        "rep": {
          "vey": 6
        },
        "unlocks": [
          "badge:missing-page"
        ]
      }
    },
    "end-recruited": {
      "type": "end",
      "result": "success",
      "outcome": "recruited",
      "title": "Hired the thief",
      "speaker": "Sable",
      "line": "thief.missing-page.recruited",
      "emotion": "excited",
      "direction": "Thrilled, talking too fast.",
      "text": "A job? A real one? With a ship? I'll give Vey his page. Call me any time, Captain. I'm very good at doors.",
      "reward": {
        "money": 60,
        "rep": {
          "vey": 8
        },
        "flags": {
          "sable-owes-you": 1
        },
        "unlocks": [
          "badge:missing-page"
        ]
      }
    },
    "end-lost-trail": {
      "type": "end",
      "result": "failure",
      "outcome": "lost-trail",
      "title": "Lost the trail",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.lost",
      "emotion": "worried",
      "direction": "Smooth on top, a crack underneath.",
      "text": "Gone. Somewhere out there, my secrets are being sold by the gram. Never mind. I'll start a new ledger. With better locks.",
      "reward": {
        "rep": {
          "vey": -3
        }
      }
    },
    "end-robbed": {
      "type": "end",
      "result": "failure",
      "outcome": "robbed",
      "title": "Robbed",
      "beat": "You wake up on the hideout floor, lighter by one wallet.",
      "speaker": "Sable",
      "line": "thief.missing-page.robbed",
      "emotion": "playful",
      "direction": "Cheerful and sorry, mostly cheerful.",
      "text": "Sorry, Captain! Nothing personal. I've taken your wallet too. Also nothing personal.",
      "reward": {
        "money": -20,
        "rep": {
          "vey": -4
        }
      }
    },
    "end-burned": {
      "type": "end",
      "result": "failure",
      "outcome": "burned",
      "title": "Burned it",
      "speaker": "Lucan Vey",
      "portrait": "vey",
      "line": "vey.missing-page.burned",
      "emotion": "grumpy",
      "direction": "Genuinely cross, the velvet gone for a moment.",
      "text": "You burned it. Ten years of favours. Hask sent me a note saying well done. I'm framing it, and then I'm burning that too.",
      "reward": {
        "rep": {
          "vey": -8,
          "hask": 3
        }
      }
    }
  }
};
