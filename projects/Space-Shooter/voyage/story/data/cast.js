// Stardust story data: the cast. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// Bible and voice direction: lhc-lanes/stardust/story/CAST.md.
// portraits: castId -> { neutral, happy, annoyed } file names under voyage/art/cast/ (filled when
// the cast lane's files are copied in; empty = initials). expressions: which portrait each emotion uses.
export const CAST_DATA = {
  "version": 1,
  "cast": {
    "chibby": {
      "name": "Chibby",
      "role": "Your mechanic",
      "station": "pad",
      "color": "#ffc46b"
    },
    "ralph": {
      "name": "Ralph",
      "role": "Chibby's dog (mostly)",
      "station": "kennel",
      "color": "#9fe870",
      "sound": true
    },
    "mel": {
      "name": "Mel",
      "role": "Outfitter",
      "station": "locker",
      "color": "#ff8fa3"
    },
    "edna": {
      "name": "Edna",
      "role": "Tea, knitting, other things",
      "station": "backroom",
      "color": "#b9a4ff"
    },
    "hask": {
      "name": "Hask",
      "role": "Stationmaster, Alpha Relay",
      "sector": "alpha",
      "color": "#81e6df",
      "giver": true
    },
    "vey": {
      "name": "Vey",
      "role": "Broker, Beacon Prime",
      "sector": "beacon",
      "color": "#f4d35e",
      "giver": true
    },
    "garrity": {
      "name": "Garrity",
      "role": "Salvage boss, Dustfall",
      "sector": "dustfall",
      "color": "#ffad72",
      "giver": true
    },
    "narrator": {
      "name": "Relay Night",
      "role": "Late-night lane radio",
      "color": "#cfe8ff"
    }
  },
  "expressions": {
    "happy": [
      "warm",
      "proud",
      "tender",
      "excited",
      "playful"
    ],
    "annoyed": [
      "grumpy",
      "dry",
      "deadpan",
      "menacing"
    ],
    "neutral": [
      "neutral",
      "sly",
      "worried"
    ]
  },
  "portraits": {}
};
