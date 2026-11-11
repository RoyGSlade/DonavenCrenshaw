// Hangar design data (hangar lane, round 2): the stations (where they stand,
// who works there, what they open and the words on their panels), respec
// pricing, the skill tree's shape, plain words for skill effects and the
// captain's licence. Studio-ready like story's data files: a comment header,
// then one export of strict JSON (no comments, code or trailing commas inside),
// "version": 1. Code only reads it (hangarStations.js, hangarSkills.js,
// ui/skillTree.js, ui/licence.js). Rename a name or retune a number freely; an
// id is what saves and other lanes use.
//
// stations[]: id (ROUND2-CONTRACT.md section 5), name, who (cast id or null),
//   panel (what it opens), unlock (story unlock id that opens it, or null),
//   art (prop picture key in ui/assets.js), blurb, at {x,y} (where its person
//   stands / talk ring centre, metres, x right, y down), ring (talk radius, m),
//   box {x,y,w,h} (the prop's footprint, m), copy {...} (panel words; locked is
//   shown while the station is not open yet).
// respec: feePerPoint credits per point taken back after the tutorial (free
//   during it when freeInTutorial). skillTree: branch angles (degrees, -90 is
//   up), ring radii and node spacing in a [-1, 1] square, tree colours.
// effectWords: {v} is the number, {pct} the number as a percentage.
// licence: the captain's licence words; checkDc is the normal check the odds quote.
export const HANGAR_DATA = {
  "version": 1,
  "floor": {
    "width": 24,
    "height": 20,
    "unit": "m"
  },
  "cast": {
    "chibby": "Chibby",
    "ralph": "Ralph",
    "mel": "Mel",
    "edna": "Edna"
  },
  "stations": [
    {
      "id": "pad",
      "name": "The pad",
      "who": "chibby",
      "panel": "ship",
      "unlock": "station:pad",
      "art": "workbench",
      "blurb": "Your ship, and the bench where Chibby makes her better.",
      "at": {
        "x": 8.6,
        "y": 12.2
      },
      "ring": 2.2,
      "box": {
        "x": 7.5,
        "y": 4.5,
        "w": 9,
        "h": 9
      },
      "copy": {
        "locked": "Chibby waves a spanner at you: \"Paperwork first, Captain. Then she's yours.\""
      }
    },
    {
      "id": "kennel",
      "name": "Ralph's kennel",
      "who": "ralph",
      "panel": "kennel",
      "unlock": null,
      "art": "kennel",
      "blurb": "A crate lined with a flight jacket nobody admits to losing.",
      "at": {
        "x": 7,
        "y": 17.2
      },
      "ring": 1.8,
      "box": {
        "x": 5.6,
        "y": 16.4,
        "w": 2.8,
        "h": 2.2
      },
      "copy": {
        "title": "Ralph's kennel",
        "body": "One crate, one flight jacket (stolen), one dented bowl, and a chewed bolt Ralph will not discuss. Chibby says he is a dog. Ralph has not confirmed it.",
        "empty": "Ralph is out. Somewhere in the hangar, something is being dug up.",
        "pet": "Scratch behind the ears",
        "petted": [
          "Ralph leans into it like a docking clamp.",
          "His tail goes like a nav beacon. That's a good sign. Probably.",
          "Ralph sneezes a small spark. He seems pleased about it.",
          "He rolls over. His belly is warm as an engine block."
        ]
      }
    },
    {
      "id": "scrap",
      "name": "The scrap pile",
      "who": null,
      "panel": "scrap",
      "unlock": "station:scrap",
      "art": "scrap",
      "blurb": "Scrap and ore at the back wall. Ralph digs here.",
      "at": {
        "x": 20,
        "y": 3.8
      },
      "ring": 2,
      "box": {
        "x": 17.8,
        "y": 0.8,
        "w": 4.6,
        "h": 2.8
      },
      "copy": {
        "title": "The scrap pile",
        "body": "Every hangar has one. Ours has a seam of real ore under it, which Ralph found before the surveyors did. Bring a pick and a strong back.",
        "locked": "Just a heap of junk, for now. Ralph keeps sniffing at it.",
        "mine": "Dig the seam",
        "holdTitle": "IN THE HOLD"
      }
    },
    {
      "id": "locker",
      "name": "Mel's locker",
      "who": "mel",
      "panel": "locker",
      "unlock": "station:locker",
      "art": "fitting",
      "blurb": "The gear wall. Mel fits you out, and lets you know about it.",
      "at": {
        "x": 20.6,
        "y": 9.6
      },
      "ring": 2,
      "box": {
        "x": 21,
        "y": 7,
        "w": 2.6,
        "h": 5.2
      },
      "copy": {
        "title": "Mel's locker",
        "body": "Suits, sidearms, boots that fit and boots that don't. Mel says what you need before you ask, and she is usually right, which is the annoying part.",
        "locked": "Mel looks you up and down, then back at her rifle. \"Not today.\"",
        "kitTitle": "YOUR KIT",
        "noKit": "Nothing issued yet. Mel hands out gear to people she has seen shoot.",
        "shopSoon": "Her stock is on the Gear tab: armour, sidearms and kit, priced in chalk."
      }
    },
    {
      "id": "range",
      "name": "The range",
      "who": "mel",
      "panel": "range",
      "unlock": "station:range",
      "art": "range",
      "blurb": "Mel's shooting lane. Mind the line.",
      "at": {
        "x": 15.4,
        "y": 16.6
      },
      "ring": 1.8,
      "box": {
        "x": 14.6,
        "y": 17.2,
        "w": 9,
        "h": 2.3
      },
      "copy": {
        "title": "The range",
        "body": "Three targets, one line, and Mel's voice behind you counting your misses out loud.",
        "locked": "The range lights are off. Mel has the key on a cord round her neck.",
        "shoot": "Step up to the line"
      }
    },
    {
      "id": "backroom",
      "name": "The back room",
      "who": "edna",
      "panel": "backroom",
      "unlock": "station:backroom",
      "art": "market",
      "blurb": "Edna's corner. Ask no questions; she will ask them for you.",
      "at": {
        "x": 3.4,
        "y": 15.6
      },
      "ring": 2,
      "box": {
        "x": 0.4,
        "y": 15.4,
        "w": 3.6,
        "h": 4.2
      },
      "copy": {
        "title": "The back room",
        "body": "Crates under a tarp, a lantern that runs on something it shouldn't, and Edna, humming, pricing you up from the doorway.",
        "locked": "Someone is whistling behind the tarp. The tune stops when you get close.",
        "lockbox": "Try Edna's lockbox",
        "shopSoon": "Her wares are on the Wares tab, under the tarp. \"When you're ready, love.\""
      }
    },
    {
      "id": "board",
      "name": "The job board",
      "who": null,
      "panel": "jobs",
      "unlock": "jobs",
      "art": "comms",
      "blurb": "Who is hiring, and how much they will pay to not do it themselves.",
      "at": {
        "x": 3.6,
        "y": 3.6
      },
      "ring": 2,
      "box": {
        "x": 1.2,
        "y": 0.6,
        "w": 4.4,
        "h": 2.6
      },
      "copy": {
        "locked": "The board flickers: NO CONTRACTS FOR UNKNOWNS. Get your name around the Drift first: meet Garrity, Hask and Vey."
      }
    },
    {
      "id": "quarters",
      "name": "Your bunk",
      "who": null,
      "panel": "captain",
      "unlock": "station:quarters",
      "art": "bunk",
      "blurb": "Where you plan, sleep and second-guess your skill points.",
      "at": {
        "x": 2.8,
        "y": 9.4
      },
      "ring": 2,
      "box": {
        "x": 0.4,
        "y": 7.4,
        "w": 2.4,
        "h": 4.2
      },
      "copy": {
        "locked": "The bunk has a sign on it: RESERVED FOR A CAPTAIN WITH A LICENCE."
      }
    },
    {
      "id": "hatch",
      "name": "The launch hatch",
      "who": null,
      "panel": "hatch",
      "unlock": "station:hatch",
      "art": "hatch",
      "blurb": "Out to the Drift, with or without crew.",
      "at": {
        "x": 12,
        "y": 2.6
      },
      "ring": 2,
      "box": {
        "x": 9.4,
        "y": 0,
        "w": 5.2,
        "h": 1.6
      },
      "copy": {
        "title": "The launch hatch",
        "body": "Two blast doors and a lot of open sky. Where you go from here is up to you, the fuel gauge and whoever is paying.",
        "locked": "The hatch is sealed. Chibby has a list of checks first, and she reads every one of them out.",
        "launchTitle": "WHERE TO",
        "noLaunch": "Nowhere to fly yet. The hatch opens when somebody out there wants you."
      }
    }
  ],
  "respec": {
    "feePerPoint": 10,
    "freeInTutorial": true
  },
  "skillTree": {
    "angles": {
      "helm": -90,
      "guns": 30,
      "wrench": 150
    },
    "r0": 0.3,
    "dr": 0.24,
    "spacing": 0.27,
    "colours": {
      "helm": "#81e6df",
      "guns": "#ffad72",
      "wrench": "#d6e2ec"
    }
  },
  "effectWords": {
    "ship.hp": "+{v} hull",
    "ship.speed": "+{pct} top speed",
    "ship.turn": "+{pct} turning",
    "ship.damage": "+{v} gun damage",
    "ship.heat": "+{v} gun heat before it overheats",
    "ship.cargo": "+{v} cargo space",
    "price": "{v}% off upgrade prices",
    "rep": "+{v}% rep from jobs",
    "talk": "+{v} to talking rolls",
    "fight": "+{v} to on-foot fight rolls",
    "foot.hp": "+{v} health on foot",
    "repair": "+{v} to repair rolls",
    "hack": "+{v} to hacking rolls",
    "nav": "+{v} to navigation rolls",
    "scan": "+{v} to scanning rolls",
    "puzzle": "+{v} to puzzle rolls",
    "trade": "+{v} to trading rolls",
    "dodge": "+{v} to dodge rolls"
  },
  "licence": {
    "eyebrow": "CAPTAIN'S LICENCE · DRIFTWAKE REGISTRY",
    "title": "Who flies this ship?",
    "body": "Pick a face, name your captain, then roll the die once for each stat. Whatever lands face up is yours. A 3 is average; each stat is the bonus on every attempt, but only the dice decide, and a double six always works.",
    "sign": "Sign the licence",
    "rolledAll": "All five rolled. Sign the licence when you're ready.",
    "hint": "Flick the tray or press Roll. Whatever lands face up is your {stat}.",
    "hintDone": "Five stats, rolled once. Each one is the bonus on every attempt you make. They stay until your captain dies.",
    "checkDc": 7
  }
};
