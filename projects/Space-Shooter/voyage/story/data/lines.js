// Stardust story data: every spoken line. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// A line: { id, speaker, emotion, text, direction, audioText? }. speaker = the id's first part.
// {name} = the captain; such lines need audioText (the words to record).
export const LINES_DATA = {
  "version": 1,
  "emotions": [
    "neutral",
    "warm",
    "excited",
    "dry",
    "grumpy",
    "sly",
    "worried",
    "proud",
    "deadpan",
    "playful",
    "tender",
    "menacing"
  ],
  "lines": [
    {
      "id": "narrator.intro.1",
      "speaker": "narrator",
      "emotion": "warm",
      "text": "This is Relay Night, on every lane still listening.",
      "direction": "Late-night radio host, close to the mic, smiling."
    },
    {
      "id": "narrator.intro.2",
      "speaker": "narrator",
      "emotion": "warm",
      "text": "Forty years back, the Wardens lit the lanes. A gate at every star. A road to anywhere.",
      "direction": "Fond, a bedtime story told to grown-ups."
    },
    {
      "id": "narrator.intro.3",
      "speaker": "narrator",
      "emotion": "worried",
      "text": "Then one night, every gate went quiet. No warning. No goodbye.",
      "direction": "Slower. Let the last two beats land."
    },
    {
      "id": "narrator.intro.4",
      "speaker": "narrator",
      "emotion": "proud",
      "text": "Now the lanes are crumbling and the big powers want the pieces. But the couriers still fly. Somebody has to.",
      "direction": "Builds up, pride on \"couriers\"."
    },
    {
      "id": "narrator.intro.5",
      "speaker": "narrator",
      "emotion": "worried",
      "text": "One more thing, night owls. Out on the dead channels, something has started to knock.",
      "direction": "Drops to a hush. Spooky but warm, a campfire tale."
    },
    {
      "id": "chibby.intro.1",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Hey. Hey! You awake? Sweet stars, you sleep like a parked freighter.",
      "direction": "Bursting in, relieved, a laugh under it."
    },
    {
      "id": "chibby.intro.2",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Name's Chibby. I fix ships. Yours, as of today, if you sign.",
      "direction": "Friendly, a bit shy about the gift."
    },
    {
      "id": "chibby.intro.3",
      "speaker": "chibby",
      "emotion": "tender",
      "text": "Last courier licence the old Warden Office ever printed. Twenty years in my drawer. Felt wrong to waste it.",
      "direction": "Soft, almost to himself, then brightens."
    },
    {
      "id": "chibby.create.name",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Name on the line. Big letters. Nobody reads the small ones.",
      "direction": "Tapping the form, helpful."
    },
    {
      "id": "chibby.create.dice",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Now roll for the medical. Don't look at me like that, it's tradition.",
      "direction": "Mock-serious, then grins."
    },
    {
      "id": "chibby.roll.cha",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Ooh, a talker! Edna's going to love you. Or rob you. Both, probably.",
      "direction": "Delighted, quick."
    },
    {
      "id": "chibby.roll.con",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Sturdy! You could headbutt a hull plate. Please never do that.",
      "direction": "Impressed, then a worried aside."
    },
    {
      "id": "chibby.roll.dex",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Quick hands. Mel's going to make you shoot things. Lots of things.",
      "direction": "Admiring, a little nervous about Mel."
    },
    {
      "id": "chibby.roll.wis",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "A thinker, huh? Good. Somebody round here ought to be.",
      "direction": "Warm, a dry joke at his own expense."
    },
    {
      "id": "chibby.roll.low",
      "speaker": "chibby",
      "emotion": "tender",
      "text": "Well. Dice are dice. I've seen worse rolls fly further.",
      "direction": "Kind, means it, pats your shoulder."
    },
    {
      "id": "chibby.create.done",
      "speaker": "chibby",
      "emotion": "proud",
      "text": "Captain {name}. Has a ring to it. Come find me on the pad.",
      "direction": "Proud, trying the title out loud.",
      "audioText": "Captain. Has a ring to it. Come find me on the pad."
    },
    {
      "id": "chibby.walk.1",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Over here, on the pad! Mind the dog.",
      "direction": "Calling across a big hangar, waving."
    },
    {
      "id": "chibby.walk.moving",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "That's it. Left foot, right foot. You're a natural.",
      "direction": "Cheering a toddler, teasing."
    },
    {
      "id": "chibby.ship.1",
      "speaker": "chibby",
      "emotion": "proud",
      "text": "There she is. Patched, polished, and only on fire the once.",
      "direction": "Showing off his baby, a nervous laugh at the end."
    },
    {
      "id": "chibby.ship.2",
      "speaker": "chibby",
      "emotion": "tender",
      "text": "She's yours, {name}. She's not small. She's cozy.",
      "direction": "Choked up, hiding it with a joke.",
      "audioText": "She's yours, Captain. She's not small. She's cozy."
    },
    {
      "id": "chibby.ship.3",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Rule one: you come home. Rule two: you bring her home. Rule three's flexible.",
      "direction": "Counting on fingers, serious then not."
    },
    {
      "id": "chibby.ship.4",
      "speaker": "chibby",
      "emotion": "worried",
      "text": "Uh oh. That's Ralph's found-something noise.",
      "direction": "Freezes, listens, half amused."
    },
    {
      "id": "chibby.ralph.1",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "That's Ralph. He's a dog. Mostly. Go on, say hi.",
      "direction": "Fond, a shrug on \"mostly\"."
    },
    {
      "id": "ralph.ralph.1",
      "speaker": "ralph",
      "emotion": "playful",
      "text": "Wrrroo-oop!",
      "direction": "A small dog bark that wobbles up like a radio being tuned. Happy, about 1 second."
    },
    {
      "id": "chibby.ralph.2",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "He hears radio through his ears. And he digs. He's dug something up behind the scrap pile, hasn't he?",
      "direction": "Translating for the dog, amused."
    },
    {
      "id": "ralph.ralph.2",
      "speaker": "ralph",
      "emotion": "excited",
      "text": "Hrrm-wuf! Wuf!",
      "direction": "Two excited yips with a hum before them, tail-wagging energy."
    },
    {
      "id": "chibby.ralph.3",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Grab the drill, Captain. Let's see what he found.",
      "direction": "Rubbing his hands."
    },
    {
      "id": "ralph.mine.1",
      "speaker": "ralph",
      "emotion": "excited",
      "text": "Arroo! Arroo!",
      "direction": "A proud little howl, twice, bright and silly."
    },
    {
      "id": "chibby.mine.1",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "Ore! Real ore, in my hangar. Ralph, you beautiful weirdo.",
      "direction": "Genuinely thrilled, scruffing the dog."
    },
    {
      "id": "chibby.mine.2",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Hob Garrity out at Dustfall pays good for ore. Well. He pays.",
      "direction": "Fond grumble about an old friend."
    },
    {
      "id": "chibby.mine.3",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Ralph's collar has Dustfall's coordinates on it. Don't ask why. Take the hatch.",
      "direction": "Quick, a wave toward the hatch."
    },
    {
      "id": "chibby.launch.1",
      "speaker": "chibby",
      "emotion": "worried",
      "text": "Easy on the throttle. She bites if you rush her.",
      "direction": "Over comms, fussing like a parent."
    },
    {
      "id": "garrity.arrive.1",
      "speaker": "garrity",
      "emotion": "excited",
      "text": "Ship on my scope! If you're selling, dock at pad nine. If you're stealing, also pad nine. I'll find you.",
      "direction": "Booming over comms, cheerful threat."
    },
    {
      "id": "garrity.meet.1",
      "speaker": "garrity",
      "emotion": "excited",
      "text": "Ore? From Chibby's hangar? Ha! That old wrench owes me a gearbox.",
      "direction": "Big laugh, slaps a crate."
    },
    {
      "id": "garrity.meet.2",
      "speaker": "garrity",
      "emotion": "proud",
      "text": "Hob Garrity. Salvage, scrap and second chances, all sold by weight.",
      "direction": "Salesman voice, chest out."
    },
    {
      "id": "garrity.meet.3",
      "speaker": "garrity",
      "emotion": "warm",
      "text": "This is Lefty. Lefty says you've got honest hands. Lefty's usually wrong, but I like you.",
      "direction": "Holds up his robot arm; warm and sly."
    },
    {
      "id": "garrity.meet.4",
      "speaker": "garrity",
      "emotion": "warm",
      "text": "When I've hauling or digging that needs doing, you're on my list. Go on home, kid.",
      "direction": "Gentle under the loud."
    },
    {
      "id": "chibby.mel.1",
      "speaker": "chibby",
      "emotion": "worried",
      "text": "Welcome back! Mel's at the locker. She's been waiting. She hates waiting.",
      "direction": "Cheerful, then a wince."
    },
    {
      "id": "mel.meet.1",
      "speaker": "mel",
      "emotion": "dry",
      "text": "So you're the licence. Chib said you'd be taller.",
      "direction": "Flat, unimpressed, looking you up and down."
    },
    {
      "id": "mel.meet.2",
      "speaker": "mel",
      "emotion": "grumpy",
      "text": "Mel. I kit people out so they die slower. Arms out.",
      "direction": "Brisk, already measuring you."
    },
    {
      "id": "mel.meet.3",
      "speaker": "mel",
      "emotion": "deadpan",
      "text": "Sidearm. The loud end points away from you. That's most of the course.",
      "direction": "Bone dry, slapping it into your hand."
    },
    {
      "id": "mel.shoot.0",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Range is through there. Hit every target, or I tell everyone you missed.",
      "direction": "A dare, not a joke."
    },
    {
      "id": "mel.shoot.clean",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Hm. Not bad. Don't let it go to your head, there's not much room in there.",
      "direction": "Grudging respect, hidden under an insult."
    },
    {
      "id": "mel.shoot.done",
      "speaker": "mel",
      "emotion": "grumpy",
      "text": "Took you long enough. They don't move, you know. The real ones do.",
      "direction": "Impatient, arms crossed."
    },
    {
      "id": "mel.shoot.2",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Hask at Alpha Relay needs couriers who shoot back. I told him about you. Don't make me a liar.",
      "direction": "Matter of fact, a warning."
    },
    {
      "id": "mel.shoot.3",
      "speaker": "mel",
      "emotion": "tender",
      "text": "And Captain? That's what I call the ones who come back. So come back.",
      "direction": "The one soft line she has. Quiet, quick, then she turns away."
    },
    {
      "id": "hask.arrive.1",
      "speaker": "hask",
      "emotion": "dry",
      "text": "Alpha Relay control. You are cleared for pad two. Pad one is for people I like.",
      "direction": "Tired traffic-control monotone, deadpan joke."
    },
    {
      "id": "hask.meet.1",
      "speaker": "hask",
      "emotion": "dry",
      "text": "Mel sent you. She said you shoot like you mean it. From Mel, that is a hug.",
      "direction": "Gravelly, slow, a tiny smile."
    },
    {
      "id": "hask.meet.2",
      "speaker": "hask",
      "emotion": "deadpan",
      "text": "Orrin Hask, stationmaster. The coffee is terrible. The lanes are worse. I keep both running.",
      "direction": "Weary pride."
    },
    {
      "id": "hask.meet.3",
      "speaker": "hask",
      "emotion": "warm",
      "text": "Say hello to Deputy. He's a cactus. He's the only one on this station who never complains.",
      "direction": "Fond of a plant, completely serious."
    },
    {
      "id": "hask.meet.4",
      "speaker": "hask",
      "emotion": "neutral",
      "text": "I've cargo that needs flying and lanes that need clearing. Come see me when you're ready to earn.",
      "direction": "Businesslike, a nod."
    },
    {
      "id": "chibby.edna.1",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Hear that whistling? That's Edna. She rents the back room. Don't ask what for. Don't drink the tea.",
      "direction": "Low voice, conspiratorial."
    },
    {
      "id": "edna.meet.1",
      "speaker": "edna",
      "emotion": "warm",
      "text": "Come in, duckling, come in. Mind the crates, some of them bite.",
      "direction": "Sweet old lady, slow, a giggle at the end."
    },
    {
      "id": "edna.meet.2",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Edna. I sell things nobody else will. Tea, mostly. And the other things.",
      "direction": "Sugar on top, steel underneath."
    },
    {
      "id": "edna.talk.ask",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Now. Why would a sweet old lady trust a new face like yours?",
      "direction": "Teasing test, peering over spectacles."
    },
    {
      "id": "edna.talk.plain",
      "speaker": "edna",
      "emotion": "warm",
      "text": "Chibby's a darling. Darlings are cheap. Still, you've got manners.",
      "direction": "Amused, softening."
    },
    {
      "id": "edna.talk.cha",
      "speaker": "edna",
      "emotion": "playful",
      "text": "Oh, flattery! Shameless. Keep going, duckling.",
      "direction": "Delighted, a girlish laugh."
    },
    {
      "id": "edna.talk.con",
      "speaker": "edna",
      "emotion": "warm",
      "text": "So you did. Strong back, quiet mouth. I like those.",
      "direction": "Approving, patting your arm."
    },
    {
      "id": "edna.talk.dex",
      "speaker": "edna",
      "emotion": "excited",
      "text": "You caught it! Nobody catches it. Quick, very quick.",
      "direction": "Genuinely surprised, then scheming."
    },
    {
      "id": "edna.talk.wis",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Clever duckling. Too clever. I'll be keeping an eye on you.",
      "direction": "Pleased and wary at once."
    },
    {
      "id": "edna.talk.done",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Right. I've a box I can't open, and a name inside it you'll want.",
      "direction": "Down to business, a whisper."
    },
    {
      "id": "edna.puzzle.0",
      "speaker": "edna",
      "emotion": "warm",
      "text": "My lockbox. Old Warden lock, three dials. My eyes aren't what they were. Yours are.",
      "direction": "Sliding the box across, sweet."
    },
    {
      "id": "edna.puzzle.1",
      "speaker": "edna",
      "emotion": "playful",
      "text": "Oh, well done! A calling card. Lucan Vey. That slippery boy owes me a teapot.",
      "direction": "Thrilled, then indignant."
    },
    {
      "id": "edna.puzzle.2",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Fly to Beacon Prime and tell him Edna says hello. Watch him squirm.",
      "direction": "Wicked little grin."
    },
    {
      "id": "vey.arrive.1",
      "speaker": "vey",
      "emotion": "sly",
      "text": "Beacon Prime welcomes you. Every dock has a price. Yours was paid, by someone curious.",
      "direction": "Silky, amused, over comms."
    },
    {
      "id": "vey.meet.1",
      "speaker": "vey",
      "emotion": "sly",
      "text": "Edna's card. So either you're very lucky, or I'm in very deep trouble.",
      "direction": "Smooth, a flicker of nerves."
    },
    {
      "id": "vey.meet.2",
      "speaker": "vey",
      "emotion": "warm",
      "text": "Lucan Vey. I trade in favours, and you've just been handed one.",
      "direction": "Charming, a little bow in the voice."
    },
    {
      "id": "vey.meet.3",
      "speaker": "vey",
      "emotion": "worried",
      "text": "Tell her the teapot is coming. Tell her nothing else.",
      "direction": "Quick, low, sincere for once."
    },
    {
      "id": "vey.meet.4",
      "speaker": "vey",
      "emotion": "sly",
      "text": "When I need something done quietly, I'll know where to find you. I always know.",
      "direction": "Velvet, a hint of menace, mostly fun."
    },
    {
      "id": "chibby.open.1",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "{name}! All three? Sweet stars, the job board just lit up like a birthday.",
      "direction": "Over comms, overjoyed.",
      "audioText": "Captain! All three? Sweet stars, the job board just lit up like a birthday."
    },
    {
      "id": "chibby.open.2",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Hask, Vey and Garrity have work posted. Pick one, fly it, come home.",
      "direction": "Steady, the rules again."
    },
    {
      "id": "chibby.open.3",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Ralph's proud of you. He told me. Don't ask how.",
      "direction": "Fond nonsense."
    },
    {
      "id": "ralph.open.1",
      "speaker": "ralph",
      "emotion": "worried",
      "text": "Tap. Tap. Tap.",
      "direction": "Not a bark: three soft metal taps from somewhere inside the dog, then a pause. Eerie but tiny."
    },
    {
      "id": "chibby.open.4",
      "speaker": "chibby",
      "emotion": "worried",
      "text": "...Huh. Where'd you hear that, boy?",
      "direction": "Quiet, puzzled, a chill he laughs off."
    },
    {
      "id": "chibby.skip.1",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Know the ropes already? Fair enough. Ship's fuelled, board's open. Go get 'em.",
      "direction": "Easygoing, a thumbs-up."
    },
    {
      "id": "chibby.idle.1",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "She's running sweet today. Don't tell her I said so.",
      "direction": "Under a ship, muffled and happy."
    },
    {
      "id": "chibby.idle.2",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "If it rattles, bring it to me. If it screams, bring it faster.",
      "direction": "Cheerful advice."
    },
    {
      "id": "chibby.idle.3",
      "speaker": "chibby",
      "emotion": "tender",
      "text": "You eating? Captains forget to eat. There are noodles in the toolbox.",
      "direction": "Fussing, sincere."
    },
    {
      "id": "chibby.upgrade.1",
      "speaker": "chibby",
      "emotion": "excited",
      "text": "New parts! Listen to her purr. That's the good purr.",
      "direction": "Ear to the hull, delighted."
    },
    {
      "id": "chibby.upgrade.2",
      "speaker": "chibby",
      "emotion": "proud",
      "text": "Fitted. She'll fly. She'll fly better, I mean. She always flew.",
      "direction": "Defensive of his ship, proud."
    },
    {
      "id": "chibby.death.1",
      "speaker": "chibby",
      "emotion": "tender",
      "text": "You came home. Mostly. That's rule one, and I'll take it.",
      "direction": "Relief, voice catching."
    },
    {
      "id": "chibby.death.2",
      "speaker": "chibby",
      "emotion": "warm",
      "text": "Lost the upgrades, kept the captain. Good trade. I mean it.",
      "direction": "Firm, kind, already planning repairs."
    },
    {
      "id": "chibby.respec.1",
      "speaker": "chibby",
      "emotion": "playful",
      "text": "Changing your mind? Good captains do. So do bad ones, but less often.",
      "direction": "Teasing wisdom."
    },
    {
      "id": "ralph.idle.1",
      "speaker": "ralph",
      "emotion": "playful",
      "text": "Wuf?",
      "direction": "One curious, rising boop of a bark."
    },
    {
      "id": "ralph.idle.2",
      "speaker": "ralph",
      "emotion": "playful",
      "text": "Mrrrp-wuf.",
      "direction": "A sleepy grumble ending in a tiny bark."
    },
    {
      "id": "ralph.idle.3",
      "speaker": "ralph",
      "emotion": "excited",
      "text": "Wrrrooo!",
      "direction": "An excited warble that slides up and down."
    },
    {
      "id": "mel.idle.1",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Locker is open. Touch nothing you cannot afford.",
      "direction": "Not looking up."
    },
    {
      "id": "mel.idle.2",
      "speaker": "mel",
      "emotion": "deadpan",
      "text": "You're still alive. Good. Saves me the paperwork.",
      "direction": "Flat, faintly pleased."
    },
    {
      "id": "mel.idle.3",
      "speaker": "mel",
      "emotion": "grumpy",
      "text": "Chib's humming again. Make him stop. Please.",
      "direction": "Long-suffering."
    },
    {
      "id": "mel.locked.1",
      "speaker": "mel",
      "emotion": "grumpy",
      "text": "Not now, licence. Chib first.",
      "direction": "Waving you off."
    },
    {
      "id": "mel.shop.1",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Pick something. I haven't got all day. I've got most of it, but not all.",
      "direction": "Impatient, tapping the counter."
    },
    {
      "id": "mel.shop.buy",
      "speaker": "mel",
      "emotion": "dry",
      "text": "Good choice. Don't scratch it.",
      "direction": "Curt approval."
    },
    {
      "id": "edna.idle.1",
      "speaker": "edna",
      "emotion": "warm",
      "text": "Tea, duckling? First cup's free. The second costs a secret.",
      "direction": "Sweet, pouring."
    },
    {
      "id": "edna.idle.2",
      "speaker": "edna",
      "emotion": "sly",
      "text": "If anyone asks, I sell knitting.",
      "direction": "Whisper, a wink in the voice."
    },
    {
      "id": "edna.idle.3",
      "speaker": "edna",
      "emotion": "playful",
      "text": "Vey still owes me that teapot. Remind him. Loudly.",
      "direction": "Merry grudge."
    },
    {
      "id": "edna.locked.1",
      "speaker": "edna",
      "emotion": "warm",
      "text": "Come back when Chibby's done fussing over you, duckling.",
      "direction": "Kind, shooing."
    },
    {
      "id": "edna.shop.1",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Browse, duckling. Everything here is legal somewhere.",
      "direction": "Sugary, proud of the stock."
    },
    {
      "id": "edna.shop.buy",
      "speaker": "edna",
      "emotion": "sly",
      "text": "Pleasure doing business. We never met.",
      "direction": "Cheerful conspiracy."
    },
    {
      "id": "hask.greet.1",
      "speaker": "hask",
      "emotion": "dry",
      "text": "Pull up a crate, Captain. The coffee is still terrible.",
      "direction": "Gravel, a weary welcome."
    },
    {
      "id": "hask.greet.2",
      "speaker": "hask",
      "emotion": "deadpan",
      "text": "Deputy says hello. I'm paraphrasing. He's a cactus.",
      "direction": "Deadpan."
    },
    {
      "id": "hask.job.cold-run",
      "speaker": "hask",
      "emotion": "neutral",
      "text": "Sealed data core to Beacon Prime. No questions. If it starts humming, fly faster.",
      "direction": "Calm briefing, a warning tucked in."
    },
    {
      "id": "hask.job.black-lane",
      "speaker": "hask",
      "emotion": "worried",
      "text": "Raiders in the Nether gravity wells. Clear the lane. Fair warning: this one can kill you.",
      "direction": "Grave, honest, slower."
    },
    {
      "id": "hask.done.success",
      "speaker": "hask",
      "emotion": "dry",
      "text": "Job done. Deputy's impressed. I'm adequately pleased.",
      "direction": "Dry praise, secretly warm."
    },
    {
      "id": "hask.done.failure",
      "speaker": "hask",
      "emotion": "warm",
      "text": "It happens. Get some coffee. Not mine.",
      "direction": "Gentle, gruff."
    },
    {
      "id": "vey.greet.1",
      "speaker": "vey",
      "emotion": "sly",
      "text": "Captain. You look like someone with a favour to spend.",
      "direction": "Silky, amused."
    },
    {
      "id": "vey.greet.2",
      "speaker": "vey",
      "emotion": "sly",
      "text": "My ledger has a page for you now. Try to keep it interesting.",
      "direction": "Teasing."
    },
    {
      "id": "vey.job.railgun-paper-trail",
      "speaker": "vey",
      "emotion": "sly",
      "text": "The Guild wants a railgun. Steal one, file for one, or build one. I sell advice on all three.",
      "direction": "Enjoying the options."
    },
    {
      "id": "vey.job.listening-gate",
      "speaker": "vey",
      "emotion": "worried",
      "text": "A key, a gate, and a riddle at the Iron Veil. The Choir will be listening. Say something clever.",
      "direction": "Hushed, for once not smiling."
    },
    {
      "id": "vey.done.success",
      "speaker": "vey",
      "emotion": "proud",
      "text": "Elegant. I'll remember this. So will my ledger.",
      "direction": "Pleased, a soft clap."
    },
    {
      "id": "vey.done.failure",
      "speaker": "vey",
      "emotion": "sly",
      "text": "A setback is just a favour waiting to be called in.",
      "direction": "Unbothered, smooth."
    },
    {
      "id": "garrity.greet.1",
      "speaker": "garrity",
      "emotion": "excited",
      "text": "Kid! Good to see you. Lefty, wave. He's waving.",
      "direction": "Booming, delighted."
    },
    {
      "id": "garrity.greet.2",
      "speaker": "garrity",
      "emotion": "playful",
      "text": "If it floats, I can sell it. If it sinks, I can sell it slower.",
      "direction": "Proud motto, a laugh."
    },
    {
      "id": "garrity.job.dead-weight",
      "speaker": "garrity",
      "emotion": "excited",
      "text": "Dead hulk drifting past Dustfall, fat with parts. Tow it in before the scavengers do. Bring Lefty a souvenir.",
      "direction": "Greedy glee, fast."
    },
    {
      "id": "garrity.done.success",
      "speaker": "garrity",
      "emotion": "excited",
      "text": "Ha! That's a payday! Lefty, thumbs up.",
      "direction": "Huge laugh."
    },
    {
      "id": "garrity.done.failure",
      "speaker": "garrity",
      "emotion": "warm",
      "text": "Lost it, eh? Scrap's scrap. There's always more falling.",
      "direction": "Big-hearted shrug."
    }
  ]
};
