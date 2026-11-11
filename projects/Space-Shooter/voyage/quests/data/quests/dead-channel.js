// Hask, "Dead Channel". STORY CHAIN: opens after Cold Run (fragment 1). A Warden relay buoy is
// reading out the captain's licence. Ship fight, an on-foot fight in its crawlspace, a cipher, a choice.
// Wins: silenced, recorded, answered. Fails: driven off, thrown out, fried. Sets lead-relay.
// DATA ONLY (STUDIO-SCHEMA.md, quests): the body after "export default" is strict
// JSON so the Stardust Studio (Focus) can read and write it. No code, comments or
// trailing commas inside. Spoken nodes carry a voice line id (content/LINES-quests.json).
export default {
  "id": "dead-channel",
  "title": "Dead Channel",
  "giver": "hask",
  "location": "alpha",
  "summary": "An old Warden relay buoy is reading out a licence number. Yours. Hask wants it quiet.",
  "pitch": {
    "line": "hask.job.dead-channel",
    "emotion": "worried",
    "direction": "Low and careful, he does not like this one.",
    "text": "The old relay buoy is knocking. And it's reading out your licence. Go and make it stop."
  },
  "requires": {
    "flags": {
      "fragment-1": 1
    }
  },
  "rolls": {
    "sentries": {
      "enemy": "sentries"
    }
  },
  "start": "intro",
  "nodes": {
    "intro": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.intro",
      "emotion": "worried",
      "direction": "Low and careful, a man who does not like mysteries on his lanes.",
      "text": "That core you ran? The old relay buoy on the Beacon lane has started knocking too. And it reads out a licence number. Yours. I'd like that to stop before the Guild asks me why.",
      "choices": [
        {
          "label": "\"I'll go and have a word with it.\"",
          "to": "trip"
        },
        {
          "label": "\"Why is it my number, Hask?\" (Wisdom)",
          "check": {
            "stat": "wis",
            "tag": "talk",
            "dc": 7,
            "pass": "hask-knows",
            "fail": "trip"
          }
        }
      ]
    },
    "hask-knows": {
      "type": "dialogue",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.knows",
      "emotion": "tender",
      "direction": "Careful, almost gentle, choosing every word.",
      "text": "I don't know. Chibby might. He kept a drawer of old Warden paperwork for twenty years. Be kind when you ask him.",
      "set": {
        "asked": true
      },
      "choices": [
        {
          "label": "\"I will.\"",
          "to": "trip"
        }
      ]
    },
    "trip": {
      "type": "travel",
      "title": "To the buoy",
      "to": "beacon",
      "risk": 0.15,
      "outcomes": {
        "arrived": "buoy"
      }
    },
    "buoy": {
      "type": "dialogue",
      "speaker": null,
      "text": "The buoy hangs in the lane like a lost lantern, its dish turning to follow you. Two Warden sentries wake up around it and blink their lights at you.",
      "choices": [
        {
          "label": "Clear the sentries.",
          "to": "guards"
        },
        {
          "label": "Fly in under their scan (Dexterity)",
          "check": {
            "stat": "dex",
            "tag": "dodge",
            "dc": 8,
            "pass": "crawl",
            "fail": "guards"
          }
        }
      ]
    },
    "guards": {
      "type": "fight",
      "mode": "ship",
      "title": "Warden sentries",
      "enemy": {
        "enemy": "drone"
      },
      "outcomes": {
        "win": "crawl",
        "parley": "crawl",
        "lose": "end-driven",
        "flee": "end-driven"
      }
    },
    "crawl": {
      "type": "dialogue",
      "speaker": null,
      "text": "You clamp on and squeeze into the buoy's crawlspace. It smells of old dust and warm wiring. Up ahead, something whirs.",
      "choices": [
        {
          "label": "Go in.",
          "to": "inside"
        },
        {
          "label": "Hack the sealed inner hatch (Hacker 2, or a breach kit)",
          "to": "panel",
          "requires": {
            "anyOf": [
              {
                "skills": {
                  "hacker": 2
                }
              },
              {
                "items": {
                  "breach-kit": 1
                }
              }
            ]
          },
          "lockedHint": "Needs Hacker rank 2, or a breach kit from Mel"
        }
      ]
    },
    "inside": {
      "type": "fight",
      "mode": "foot",
      "title": "Crawlspace sentries",
      "enemy": "$sentries",
      "dc": 7,
      "outcomes": {
        "win": "panel",
        "lose": "end-thrown-out",
        "flee": "end-driven"
      }
    },
    "panel": {
      "type": "puzzle",
      "kind": "cipher",
      "title": "Relay core",
      "params": {
        "title": "Relay core",
        "length": 4,
        "symbols": 5,
        "attempts": 6
      },
      "outcomes": {
        "solved": "voice",
        "failed": "end-fried"
      }
    },
    "voice": {
      "type": "dialogue",
      "beat": "The panel opens on a bank of warm crystal. The voice inside is calm and very, very old.",
      "speaker": "The Warden voice",
      "line": "warden.dead-channel.voice",
      "emotion": "neutral",
      "direction": "Very slow, calm, a soft ring on every word. Not unkind.",
      "text": "Courier. Licence confirmed. Report to the Iron Veil. You are expected.",
      "choices": [
        {
          "label": "Shut it down, like Hask asked.",
          "to": "end-silenced"
        },
        {
          "label": "Record everything first, then shut it down.",
          "to": "end-recorded"
        },
        {
          "label": "Answer it: \"Courier acknowledges.\"",
          "to": "end-answered"
        }
      ]
    },
    "end-silenced": {
      "type": "end",
      "result": "success",
      "outcome": "silenced",
      "title": "Quiet lane",
      "beat": "The buoy's light goes out. The lane is quiet for the first time in weeks.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.silenced",
      "emotion": "dry",
      "direction": "Relief dressed up as nothing much.",
      "text": "Quiet lane. Lovely. Deputy and I thank you. Now go and talk to Chibby. I mean it.",
      "reward": {
        "money": 100,
        "rep": {
          "hask": 10
        },
        "skillPoints": 1,
        "flags": {
          "lead-relay": 1
        },
        "unlocks": [
          "badge:dead-channel"
        ]
      }
    },
    "end-recorded": {
      "type": "end",
      "result": "success",
      "outcome": "recorded",
      "title": "On the record",
      "beat": "You copy every word, then put the buoy to sleep.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.recorded",
      "emotion": "deadpan",
      "direction": "Knows exactly where that recording is going and has decided not to care.",
      "text": "You recorded it. Fine. Vey will pay a fortune for that. Don't tell me how much. Deputy gets jealous.",
      "reward": {
        "money": 80,
        "rep": {
          "hask": 5,
          "vey": 5
        },
        "skillPoints": 1,
        "flags": {
          "lead-relay": 1
        },
        "unlocks": [
          "badge:dead-channel"
        ]
      }
    },
    "end-answered": {
      "type": "end",
      "result": "success",
      "outcome": "answered",
      "title": "Answered",
      "beat": "The buoy stops knocking. It does not go dark. It just goes quiet, like someone who has finally been heard.",
      "speaker": "The Warden voice",
      "line": "warden.dead-channel.answered",
      "emotion": "tender",
      "direction": "Slow, warm for a machine, as if it had waited a very long time.",
      "text": "Acknowledged. Thank you, courier. Safe lanes.",
      "reward": {
        "rep": {
          "hask": 3
        },
        "skillPoints": 2,
        "flags": {
          "lead-relay": 1,
          "answered-the-knock": 1
        },
        "unlocks": [
          "badge:dead-channel"
        ]
      }
    },
    "end-driven": {
      "type": "end",
      "result": "failure",
      "outcome": "driven-off",
      "title": "Driven off",
      "beat": "The sentries herd you out of the lane. Behind you, the buoy keeps knocking.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.driven",
      "emotion": "neutral",
      "direction": "Matter of fact, no blame.",
      "text": "Sentries chased you off? They're forty years old. ...So am I. Try again when you're patched.",
      "reward": {
        "rep": {
          "hask": -3
        }
      }
    },
    "end-thrown-out": {
      "type": "end",
      "result": "failure",
      "outcome": "thrown-out",
      "title": "Thrown out",
      "beat": "The crawlspace sentries bundle you out of the hatch and lock it behind you.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.thrown",
      "emotion": "dry",
      "direction": "Dry concern.",
      "text": "Thrown out of a buoy by a buoy. Get a medkit from Mel. Get two.",
      "reward": {
        "rep": {
          "hask": -2
        }
      }
    },
    "end-fried": {
      "type": "end",
      "result": "failure",
      "outcome": "fried",
      "title": "Fried",
      "beat": "The crystal bank flashes white and smells of burnt hair. The knocking gets louder.",
      "speaker": "Stationmaster Hask",
      "portrait": "hask",
      "line": "hask.dead-channel.fried",
      "emotion": "grumpy",
      "direction": "Grumbling at the bill, not at you.",
      "text": "Fried the relay core. It's still knocking. Louder. The Guild has noticed. Thank you.",
      "reward": {
        "rep": {
          "hask": -4
        }
      }
    }
  }
};
