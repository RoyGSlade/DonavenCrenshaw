// The hangar's three shops (ROUND2-CONTRACT.md stations: Mel at the locker, Edna
// in the back room, Chibby at the pad) and what Mel's gear does on foot. Rules:
// voyage/shops/shop.js (prices go through core's priceFor, spend and grant);
// screen: voyage/shops/ui.js. Shape: STUDIO-SCHEMA.md "Shops", plus:
//   stock[].qty (how many one purchase gives), stock[].rep (rep change when
//   bought: Edna's wares annoy the Guild), stock[].note, stock[].blurb;
//   discounts[]: { requires | boon: { stat, at }, off: percent, why };
//   deals[] (risky): { id, name, blurb, price, check: { stat, tag, dc }, pass, fail }
//   where pass/fail are { reward, text, line? }; buys[]: { item, money } (what
//   the keeper pays per item); lines: { open, buy, broke, ... } -> voice line ids
//   (story's own ids, or content's with text/emotion/direction here).
// gear: { itemId: { slot: armour|weapon|tool, text, footHp?, footSpeed?, weapon? } }
// with weapon in the on-foot shooter's shape (voyage/onfoot/tuning.json sidearm).
// DATA ONLY: the body after "= " is strict JSON (STUDIO-SCHEMA.md form D).
export const SHOPS_DATA = {
  "version": 1,
  "shops": {
    "mel": {
      "name": "Mel's locker",
      "keeper": "mel",
      "station": "locker",
      "blurb": "Suits, sidearms and boots that fit. Mel tells you what you need before you ask. She is usually right, which is the annoying part.",
      "lines": {
        "open": { "line": "mel.shop.1" },
        "buy": { "line": "mel.shop.buy" },
        "broke": { "line": "mel.shop.broke", "text": "That's not enough money. That's not even enough for the bag it comes in.", "emotion": "deadpan", "direction": "Flat, not even looking up." },
        "equip": { "line": "mel.shop.equip", "text": "Turn round. Hm. You look slightly less likely to die. Slightly.", "emotion": "dry", "direction": "Grudging approval, tugging a strap tight." },
        "sell": { "line": "mel.shop.sell", "text": "Back already? Fine. I'll give you less than it's worth. That's the deal.", "emotion": "grumpy", "direction": "Taking it back with a sigh, checking for scratches." },
        "locked": { "line": "mel.shop.locked", "text": "Not that one. Not for you. Not yet.", "emotion": "dry", "direction": "Hand flat on the counter, final." }
      },
      "discounts": [],
      "stock": [
        { "item": "medkit", "price": { "money": 35 }, "qty": 1, "blurb": "A jab of the good stuff. Gets you back up once in a job, on foot." },
        { "item": "flak-vest", "price": { "money": 140 }, "limit": 1, "blurb": "Padded, patched, bulletproof-ish. More health on foot." },
        { "item": "scan-goggles", "price": { "money": 120 }, "limit": 1, "blurb": "See what people are hiding in their pockets. Some jobs open up for you." },
        { "item": "mag-boots", "price": { "money": 180 }, "limit": 1, "blurb": "Grip on any deck. Quicker on your feet." },
        { "item": "breach-kit", "price": { "money": 160 }, "limit": 1, "blurb": "Wedges, a drill and a small polite explosive. Opens hatches the Slicer skill would." },
        { "item": "scatter-pistol", "price": { "money": 220 }, "limit": 1, "blurb": "Five pellets a shot. Up close, nobody argues." },
        { "item": "bolt-carbine", "price": { "money": 320 }, "limit": 1, "blurb": "Fast, steady, eats a lot of bolts. The working captain's gun." },
        { "item": "plated-coat", "price": { "money": 300 }, "limit": 1, "requires": { "rep": { "hask": 20 } }, "blurb": "Guild-grade plate under a good coat. Mel only sells it to couriers Hask knows." },
        { "item": "longshot", "price": { "money": 420 }, "limit": 1, "requires": { "skills": { "gunner": 1 } }, "blurb": "One shot, one very surprised raider. Gunners only." },
        { "item": "hardsuit", "price": { "money": 520 }, "limit": 1, "requires": { "rep": { "garrity": 45 } }, "blurb": "Dustfall salvage armour. Heavy, slow, nearly unkillable. Garrity has to vouch for you." }
      ],
      "buys": [
        { "item": "flak-vest", "money": 55 }, { "item": "plated-coat", "money": 120 }, { "item": "hardsuit", "money": 210 },
        { "item": "scatter-pistol", "money": 90 }, { "item": "bolt-carbine", "money": 130 }, { "item": "longshot", "money": 170 },
        { "item": "scan-goggles", "money": 45 }, { "item": "mag-boots", "money": 70 }, { "item": "breach-kit", "money": 60 }
      ],
      "deals": []
    },
    "edna": {
      "name": "Edna's back room",
      "keeper": "edna",
      "station": "backroom",
      "blurb": "Tea, knitting, and a basket of things nobody else will sell you. Everything here is legal somewhere.",
      "lines": {
        "open": { "line": "edna.shop.1" },
        "buy": { "line": "edna.shop.buy" },
        "broke": { "line": "edna.shop.broke", "text": "Oh, duckling. Come back when your pockets jingle.", "emotion": "warm", "direction": "Kind, patting your hand, steel under it." },
        "sell": { "line": "edna.shop.sell", "text": "I'll take that off your hands. Nobody needs to know where it went. Least of all you.", "emotion": "sly", "direction": "Sweet whisper, sliding coins across." },
        "locked": { "line": "edna.shop.locked", "text": "That one's for my special customers, duckling. Learn to haggle and we'll talk.", "emotion": "sly", "direction": "Teasing, tapping the basket lid." },
        "deal-pass": { "line": "edna.shop.lucky", "text": "Ooh, look at you! Lucky duckling. Don't tell anyone where you got it.", "emotion": "playful", "direction": "Delighted giggle." },
        "deal-fail": { "line": "edna.shop.unlucky", "text": "Oh dear. Well. No refunds, duckling. That's what makes it exciting.", "emotion": "sly", "direction": "Sympathetic and not at all sorry." }
      },
      "discounts": [
        { "boon": { "stat": "cha", "at": 6 }, "off": 10, "why": "Edna likes your cheek (Charisma 6)." },
        { "requires": { "flags": { "edna-teapot": 1 } }, "off": 15, "why": "You brought her mother's teapot home." }
      ],
      "stock": [
        { "item": "fuel-cell", "price": { "money": 70 }, "qty": 1, "blurb": "Only slightly radioactive. Engine tier 3 wants two." },
        { "item": "nav-chip", "price": { "money": 280 }, "qty": 1, "blurb": "Pulled from a Warden buoy. Thrusters tier 3 needs one. Don't ask which buoy." },
        { "item": "permit", "price": { "money": 150 }, "limit": 1, "rep": { "hask": -3 }, "note": "Forged. Hask will notice, eventually.", "blurb": "A Guild docking permit. Opens doors. Some of them are offices." },
        { "item": "syndicate-codes", "price": { "money": 200 }, "limit": 1, "rep": { "hask": -2, "vey": 2 }, "note": "Raiders back off when they hear them. The Guild frowns.", "blurb": "Ember Syndicate recognition codes, this month's. Some raiders will wave you through." },
        { "item": "ghost-transponder", "price": { "money": 240 }, "limit": 1, "rep": { "hask": -4 }, "note": "Very illegal. The Guild takes it personally.", "blurb": "Tells traffic control you are someone else. Anyone you like." },
        { "item": "railgun", "price": { "money": 650 }, "limit": 1, "requires": { "skills": { "trader": 1 } }, "rep": { "hask": -6, "vey": 2 }, "note": "Restricted ordnance. Hask will hear.", "blurb": "From the back shelf, for traders. Fell off a Guild requisition. Guns tier 3 needs one." }
      ],
      "buys": [
        { "item": "scrap", "money": 3 }, { "item": "ore", "money": 7 }, { "item": "circuit", "money": 25 },
        { "item": "fuel-cell", "money": 30 }, { "item": "nav-chip", "money": 110 }, { "item": "railgun", "money": 300 },
        { "item": "ghost-transponder", "money": 90 }, { "item": "syndicate-codes", "money": 70 }
      ],
      "deals": [
        {
          "id": "mystery-crate",
          "name": "A mystery crate",
          "blurb": "Sealed, unmarked, and it rattles in an interesting way. Read Edna's face before you pay.",
          "price": { "money": 60 },
          "check": { "stat": "wis", "tag": "notice", "dc": 8 },
          "pass": { "reward": { "items": { "circuit": 2, "fuel-cell": 1 } }, "text": "You spot the crate she keeps not looking at. Circuit boards and a fuel cell, packed in knitting.", "line": "deal-pass" },
          "fail": { "reward": { "items": { "scrap": 3 } }, "text": "Packing straw, three bits of scrap and a very old biscuit.", "line": "deal-fail" }
        },
        {
          "id": "hot-crate",
          "name": "Mind a crate for a week",
          "blurb": "Edna pays you to keep a Guild crate in your hold, no questions. Talk your way past the inspectors if they come.",
          "price": {},
          "check": { "stat": "cha", "tag": "talk", "dc": 8 },
          "pass": { "reward": { "money": 90, "rep": { "hask": -2 } }, "text": "An inspector peers into your hold. You talk about the weather until he leaves. Edna pays up.", "line": "deal-pass" },
          "fail": { "reward": { "money": -40, "rep": { "hask": -6 } }, "text": "The inspector finds the crate. You pay the fine, and Hask gets a report with your name on it.", "line": "deal-fail" }
        },
        {
          "id": "dice-with-edna",
          "name": "A game of knucklebones",
          "blurb": "Edna plays for credits, and she cheats like a grandmother. Twenty a throw.",
          "price": { "money": 20 },
          "check": { "stat": "dex", "tag": "gamble", "dc": 8 },
          "pass": { "reward": { "money": 45 }, "text": "You catch all five bones off the back of your hand. Edna claps, and pays.", "line": "deal-pass" },
          "fail": { "reward": {}, "text": "The bones scatter under the tea trolley. Edna keeps the twenty and gives you a biscuit.", "line": "deal-fail" }
        }
      ]
    },
    "chibby": {
      "name": "Chibby's parts bench",
      "keeper": "chibby",
      "station": "pad",
      "blurb": "Bolts, boards, cells and patches, all sorted into tins with names on. Chibby sells at cost. He says that about everything.",
      "lines": {
        "open": { "line": "chibby.shop.1", "text": "Parts! Need parts? I've got parts. I've got tins of parts. This tin's called Gerald.", "emotion": "excited", "direction": "Bustling, proud of his tins, a laugh in it." },
        "buy": { "line": "chibby.shop.buy", "text": "There you go. Fit it gentle. She likes gentle.", "emotion": "warm", "direction": "Handing it over like a gift." },
        "broke": { "line": "chibby.shop.broke", "text": "Short? Ah, don't worry. Fly a job, come back. The tins aren't going anywhere.", "emotion": "warm", "direction": "Kind, no judgement at all." },
        "sell": { "line": "chibby.shop.sell", "text": "Ooh, good scrap. I'll put it in Gerald.", "emotion": "playful", "direction": "Delighted with a lump of metal." }
      },
      "discounts": [],
      "stock": [
        { "item": "scrap", "price": { "money": 8 }, "qty": 2, "blurb": "Two bits of good scrap. Every tier 1 and 2 upgrade wants some." },
        { "item": "ore", "price": { "money": 18 }, "qty": 1, "blurb": "Refined ore for hull and gun work. Cheaper if you dig it yourself." },
        { "item": "circuit", "price": { "money": 55 }, "qty": 1, "blurb": "A clean circuit board. Tier 2 and 3 upgrades need them." },
        { "item": "fuel-cell", "price": { "money": 85 }, "qty": 1, "blurb": "A legal fuel cell, with a receipt. Edna's are cheaper. Chibby will not say why." },
        { "item": "hull-patch", "price": { "money": 40 }, "qty": 1, "blurb": "Slap it on mid-job and get back into a fight you were losing." },
        { "item": "shield-cell", "price": { "money": 50 }, "qty": 1, "blurb": "A one-shot shield burst. Holds up a roof, a cake or a ship." }
      ],
      "buys": [
        { "item": "scrap", "money": 2 }, { "item": "ore", "money": 6 }, { "item": "circuit", "money": 20 }
      ],
      "deals": []
    }
  },
  "sidearm": { "name": "Sidearm", "damage": 10, "rate": 0.14, "speed": 640, "spread": 0.035, "life": 0.9 },
  "gear": {
    "flak-vest": { "slot": "armour", "footHp": 20, "text": "+20 health on foot" },
    "plated-coat": { "slot": "armour", "footHp": 35, "text": "+35 health on foot" },
    "hardsuit": { "slot": "armour", "footHp": 55, "footSpeed": -0.08, "text": "+55 health on foot, a little slower" },
    "scatter-pistol": { "slot": "weapon", "text": "5 pellets a shot, short range", "weapon": { "name": "Scatter pistol", "damage": 5, "rate": 0.45, "speed": 560, "spread": 0.22, "life": 0.45, "pellets": 5 } },
    "bolt-carbine": { "slot": "weapon", "text": "Fast and steady", "weapon": { "name": "Bolt carbine", "damage": 8, "rate": 0.08, "speed": 720, "spread": 0.05, "life": 0.85 } },
    "longshot": { "slot": "weapon", "text": "Heavy hits, slow to fire", "weapon": { "name": "Longshot rifle", "damage": 28, "rate": 0.7, "speed": 1100, "spread": 0.006, "life": 1.3 } },
    "scan-goggles": { "slot": "tool", "text": "Opens scan options in jobs" },
    "breach-kit": { "slot": "tool", "text": "Opens sealed hatches in jobs" },
    "mag-boots": { "slot": "tool", "footSpeed": 0.06, "text": "+6% speed on foot" }
  }
};
