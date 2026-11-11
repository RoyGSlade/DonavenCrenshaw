// Stardust story data: the intro beats. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// A beat: { line, scene, sound? }. Scenes are drawn in code (story/intro.js).
export const INTRO_DATA = {
  "version": 1,
  "beats": [
    {
      "line": "narrator.intro.1",
      "scene": "stars"
    },
    {
      "line": "narrator.intro.2",
      "scene": "gates"
    },
    {
      "line": "narrator.intro.3",
      "scene": "dark"
    },
    {
      "line": "narrator.intro.4",
      "scene": "courier"
    },
    {
      "line": "narrator.intro.5",
      "scene": "knock",
      "sound": "knock"
    },
    {
      "line": "chibby.intro.1",
      "scene": "hangar"
    },
    {
      "line": "chibby.intro.2",
      "scene": "hangar"
    },
    {
      "line": "chibby.intro.3",
      "scene": "licence"
    }
  ],
  "scenes": [
    "stars",
    "gates",
    "dark",
    "courier",
    "knock",
    "hangar",
    "licence"
  ]
};
