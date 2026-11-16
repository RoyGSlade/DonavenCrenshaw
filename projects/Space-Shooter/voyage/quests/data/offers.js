// Where jobs you have not taken are found (round 3, basics lane). Studio-ready
// like the other data files: a comment header, then one export of strict JSON.
// givers: each quest giver's own spot (the map they work on and the person you
// talk to there; `where` is how the datapad says it). boards: job boards by map,
// each listing the givers whose postings hang on it (a giver standing on that
// map offers in person instead). words: the talk flow's lines; {giver}, {title},
// {pay}, {where} are filled in.
export const OFFERS_DATA = {
  "version": 1,
  "givers": {
    "hask": { "map": "hask-office", "npc": "hask", "where": "in his relay office on Alpha Relay" },
    "vey": { "map": "vey-lounge", "npc": "vey", "where": "in his lounge on Beacon Prime" },
    "garrity": { "map": "garrity-office", "npc": "garrity", "where": "in his yard office at Dustfall Station" }
  },
  "boards": {
    "hangar": ["hask", "vey", "garrity"]
  },
  "boardNames": {
    "hangar": "job board in your hangar"
  },
  "words": {
    "boardSpeaker": "Job board",
    "boardIntro": "Postings from people who are not on this station. Pick one to read it.",
    "boardEmpty": "Nothing posted you can take right now.",
    "pickJob": "What've you got?",
    "notNow": "Not now",
    "take": "Take the job",
    "back": "Something else",
    "noJobs": "Nothing for you right now, Captain. Come back when you've finished what you're on.",
    "posting": "Posted by {giver}. Pays {pay}.",
    "postingNoPay": "Posted by {giver}. Pays in parts and favours.",
    "deadly": "Deadly: lose the fight on this job and your captain dies.",
    "deadlyShort": "Deadly: lose the fight and your captain dies",
    "taken": "Job taken: {title}. It's on your datapad (J) and the tracker.",
    "later": "Later",
    "paused": "The job waits for you. Continue it from the tracker or your datapad."
  }
};
