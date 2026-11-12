// Basics design data (round 3, basics lane): the keys, the bag and datapad,
// the quest tracker, the interact marks, the bunk nap, the controls card and
// the pause sheet. Studio-ready like the other data files: a comment header,
// then one export of strict JSON (no comments, code or trailing commas
// inside), "version": 1. Code only reads it (datapad/*.js, onfoot/world.js).
//
// keys: KeyboardEvent.code lists per action. pages[]: the datapad pages in
//   order (id, name, key: the shortcut code, icon: an icon id in icons.js).
// pad: openMs (the slide out of the bag), closeMs.
// tracker: maxLines (current step plus what comes next), collapsed text.
// marks: the interact system. kinds: the icon and accent per interact kind;
//   stations: the icon and accent per hangar station id (wins over the kind);
//   nameNear (tiles): people show their name inside this range; facing: px a
//   thing you face counts as nearer when two are in reach; doorVerbs: door
//   labels starting with these read as they are (no "Go to" in front);
//   ring: ground ring pulse seconds and alpha; reachRing: alpha in reach.
//   objective: the colour of the objective marker and the edge arrow.
// nap: the respec at the bunk. fadeMs, holdMs, the words (cost from
//   hangarData.js respec, the existing rule).
// controls: the first-time card (desktop and touch rows), seenKey: the
//   localStorage key that remembers it was shown.
// pause: the Esc sheet words.
export const BASICS_DATA = {
  "version": 1,
  "keys": {
    "pad": ["Tab"],
    "close": ["Escape"],
    "prevPage": ["KeyQ", "BracketLeft"],
    "nextPage": ["KeyE", "BracketRight"],
    "tracker": ["KeyT"]
  },
  "pages": [
    { "id": "captain", "name": "Captain", "key": "KeyK", "keyLabel": "K", "icon": "captain" },
    { "id": "pack", "name": "Pack", "key": "KeyI", "keyLabel": "I", "icon": "pack" },
    { "id": "jobs", "name": "Jobs", "key": "KeyJ", "keyLabel": "J", "icon": "jobs" },
    { "id": "map", "name": "Map", "key": "KeyM", "keyLabel": "M", "icon": "map" }
  ],
  "pad": {
    "openMs": 360,
    "closeMs": 220,
    "title": "DATAPAD",
    "bagLabel": "Bag",
    "bagHint": "Your bag: captain, pack, jobs and map"
  },
  "tracker": {
    "maxLines": 4,
    "tutorialEyebrow": "GETTING STARTED",
    "jobEyebrow": "JOB",
    "resume": "Pick it up at the job board.",
    "hide": "Hide",
    "show": "Show"
  },
  "marks": {
    "nameNear": 4.5,
    "facing": 40,
    "doorVerbs": ["Back", "Board", "Down", "Up", "Out", "Into", "Through", "Go"],
    "ring": { "pulse": 2.6, "alpha": 0.32, "reachAlpha": 0.9 },
    "objective": "#f4d35e",
    "kinds": {
      "npc": { "icon": "talk", "accent": "#81e6df", "verb": "Talk to" },
      "station": { "icon": "use", "accent": "#ffad72", "verb": "Use" },
      "door": { "icon": "door", "accent": "#b9a4ff", "verb": "Go to" },
      "mine": { "icon": "mine", "accent": "#ffad72", "verb": "Drill" },
      "puzzle": { "icon": "use", "accent": "#f4d35e", "verb": "Fix" },
      "hack": { "icon": "hack", "accent": "#9fe870", "verb": "Hack" },
      "range": { "icon": "range", "accent": "#ff7b6b", "verb": "Practice" },
      "repair": { "icon": "use", "accent": "#ffad72", "verb": "Repair" },
      "console": { "icon": "look", "accent": "#8fb8d0", "verb": "Look at" },
      "ship": { "icon": "fly", "accent": "#81e6df", "verb": "Fly" }
    },
    "stations": {
      "pad": { "icon": "wrench", "accent": "#81e6df" },
      "kennel": { "icon": "paw", "accent": "#f4d35e" },
      "scrap": { "icon": "mine", "accent": "#ffad72" },
      "locker": { "icon": "shop", "accent": "#ff7b6b" },
      "range": { "icon": "range", "accent": "#ff7b6b" },
      "backroom": { "icon": "shop", "accent": "#c98bff" },
      "board": { "icon": "jobs", "accent": "#f4d35e" },
      "quarters": { "icon": "bunk", "accent": "#9fe870" },
      "hatch": { "icon": "fly", "accent": "#81e6df" }
    }
  },
  "nap": {
    "fadeMs": 700,
    "holdMs": 1400,
    "title": "Your bunk",
    "body": "A lumpy mattress, a porthole full of stars and a pillow that smells of engine grease. Sleep on it and wake up with a different plan.",
    "button": "Take a nap and rethink",
    "free": "Free while Chibby is still showing you around.",
    "costLine": "Costs {cost} credits ({fee} a point for {points} points). Every skill point comes back to spend.",
    "nothing": "Nothing to rethink: you haven't spent a skill point yet.",
    "broke": "A nap costs {cost} credits and you have {money}. Take a job first.",
    "dream": "You sleep like a dropped spanner.",
    "woke": "You wake up with every skill point back to spend.",
    "padLine": "Want your points back? Take a nap at your bunk: {cost}.",
    "padFree": "free during the tutorial",
    "openPad": "Open your datapad"
  },
  "controls": {
    "seenKey": "stardust.voyage.controls.v1",
    "title": "How to play",
    "desktop": [
      { "keys": ["W", "A", "S", "D"], "text": "Walk (or the arrow keys)" },
      { "keys": ["E"], "text": "Use, talk, open: whatever is marked in reach" },
      { "keys": ["Tab"], "text": "Your bag and datapad" },
      { "keys": ["K", "I", "J", "M"], "text": "Captain, Pack, Jobs and Map pages" },
      { "keys": ["T"], "text": "Show or hide the job tracker" },
      { "keys": ["Esc"], "text": "Close, or pause" }
    ],
    "touch": [
      { "keys": ["Stick"], "text": "Drag the stick to walk" },
      { "keys": ["Use"], "text": "Tap Use when something is marked in reach" },
      { "keys": ["Bag"], "text": "Your bag and datapad" },
      { "keys": ["II"], "text": "Pause and settings" }
    ],
    "dismiss": "Got it"
  },
  "pause": {
    "title": "Paused",
    "resume": "Back to it",
    "controls": "How to play",
    "settings": "Sound and display",
    "classic": "Classic Stardust",
    "note": "The Drift waits for you. Mostly."
  }
};
