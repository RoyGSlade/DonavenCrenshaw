// Every spoken line in the new Stardust's story: the intro, the tutorial, the
// hangar crew's barks and the quest givers' job talk. This file is the source;
// lhc-lanes/stardust/story/LINES.json is exported from it for the voice lane
// (story/export-lines.mjs there). The cast bible is story/CAST.md.
//
// A line: { id, speaker, emotion, text, direction, audioText? }. The speaker is
// the id's first part. `{name}` is the captain's name; such lines carry
// `audioText`, the words to record (TTS cannot know the name). Ralph's lines
// are sounds, not words: his text is the caption, the direction says what to
// make. Emotions: EMOTIONS below. Keep lines short: one breath each.
//
// All names, lines and characters are our own (BRIEF.md S60).

export const EMOTIONS = Object.freeze([
  'neutral', 'warm', 'excited', 'dry', 'grumpy', 'sly', 'worried', 'proud', 'deadpan', 'playful', 'tender', 'menacing',
]);
export const LINE_ID = /^[a-z0-9][a-z0-9.-]{0,47}$/;

const list = [];
/** id, emotion, text, direction, audioText (only for lines with a {placeholder}). */
function L(id, emotion, text, direction, audioText) {
  const line = { id, speaker: id.split('.')[0], emotion, text, direction };
  if (audioText) line.audioText = audioText;
  list.push(line);
}

// --- The intro: "Relay Night" --------------------------------------------------------
L('narrator.intro.1', 'warm', 'This is Relay Night, on every lane still listening.', 'Late-night radio host, close to the mic, smiling.');
L('narrator.intro.2', 'warm', 'Forty years back, the Wardens lit the lanes. A gate at every star. A road to anywhere.', 'Fond, a bedtime story told to grown-ups.');
L('narrator.intro.3', 'worried', 'Then one night, every gate went quiet. No warning. No goodbye.', 'Slower. Let the last two beats land.');
L('narrator.intro.4', 'proud', 'Now the lanes are crumbling and the big powers want the pieces. But the couriers still fly. Somebody has to.', 'Builds up, pride on "couriers".');
L('narrator.intro.5', 'worried', 'One more thing, night owls. Out on the dead channels, something has started to knock.', 'Drops to a hush. Spooky but warm, a campfire tale.');
L('chibby.intro.1', 'excited', 'Hey. Hey! You awake? Sweet stars, you sleep like a parked freighter.', 'Bursting in, relieved, a laugh under it.');
L('chibby.intro.2', 'warm', "Name's Chibby. I fix ships. Yours, as of today, if you sign.", 'Friendly, a bit shy about the gift.');
L('chibby.intro.3', 'tender', "Last courier licence the old Warden Office ever printed. Twenty years in my drawer. Felt wrong to waste it.", 'Soft, almost to himself, then brightens.');

// --- Captain creation --------------------------------------------------------------
L('chibby.create.name', 'playful', 'Name on the line. Big letters. Nobody reads the small ones.', 'Tapping the form, helpful.');
L('chibby.create.dice', 'playful', "Now roll for the medical. Don't look at me like that, it's tradition.", 'Mock-serious, then grins.');
L('chibby.roll.cha', 'excited', "Ooh, a talker! Edna's going to love you. Or rob you. Both, probably.", 'Delighted, quick.');
L('chibby.roll.con', 'excited', 'Sturdy! You could headbutt a hull plate. Please never do that.', 'Impressed, then a worried aside.');
L('chibby.roll.dex', 'excited', "Quick hands. Mel's going to make you shoot things. Lots of things.", 'Admiring, a little nervous about Mel.');
L('chibby.roll.wis', 'warm', 'A thinker, huh? Good. Somebody round here ought to be.', 'Warm, a dry joke at his own expense.');
L('chibby.roll.low', 'tender', "Well. Dice are dice. I've seen worse rolls fly further.", 'Kind, means it, pats your shoulder.');
L('chibby.create.done', 'proud', 'Captain {name}. Has a ring to it. Come find me on the pad.', 'Proud, trying the title out loud.', 'Captain. Has a ring to it. Come find me on the pad.');

// --- Setup: walk to the pad, get the ship ----------------------------------------------
L('chibby.walk.1', 'excited', 'Over here, on the pad! Mind the dog.', 'Calling across a big hangar, waving.');
L('chibby.walk.moving', 'playful', "That's it. Left foot, right foot. You're a natural.", 'Cheering a toddler, teasing.');
L('chibby.ship.1', 'proud', 'There she is. Patched, polished, and only on fire the once.', 'Showing off his baby, a nervous laugh at the end.');
L('chibby.ship.2', 'tender', "She's yours, {name}. She's not small. She's cozy.", 'Choked up, hiding it with a joke.', "She's yours, Captain. She's not small. She's cozy.");
L('chibby.ship.3', 'warm', "Rule one: you come home. Rule two: you bring her home. Rule three's flexible.", 'Counting on fingers, serious then not.');
L('chibby.ship.4', 'worried', "Uh oh. That's Ralph's found-something noise.", 'Freezes, listens, half amused.');

// --- Ralph: mining, then Garrity -------------------------------------------------------
L('chibby.ralph.1', 'warm', "That's Ralph. He's a dog. Mostly. Go on, say hi.", 'Fond, a shrug on "mostly".');
L('ralph.ralph.1', 'playful', 'Wrrroo-oop!', 'A small dog bark that wobbles up like a radio being tuned. Happy, about 1 second.');
L('chibby.ralph.2', 'playful', "He hears radio through his ears. And he digs. He's dug something up behind the scrap pile, hasn't he?", 'Translating for the dog, amused.');
L('ralph.ralph.2', 'excited', 'Hrrm-wuf! Wuf!', 'Two excited yips with a hum before them, tail-wagging energy.');
L('chibby.ralph.3', 'excited', "Grab the drill, Captain. Let's see what he found.", 'Rubbing his hands.');
L('ralph.mine.1', 'excited', 'Arroo! Arroo!', 'A proud little howl, twice, bright and silly.');
L('chibby.mine.1', 'excited', 'Ore! Real ore, in my hangar. Ralph, you beautiful weirdo.', 'Genuinely thrilled, scruffing the dog.');
L('chibby.mine.2', 'playful', 'Hob Garrity out at Dustfall pays good for ore. Well. He pays.', 'Fond grumble about an old friend.');
L('chibby.mine.3', 'warm', "Ralph's collar has Dustfall's coordinates on it. Don't ask why. Take the hatch.", 'Quick, a wave toward the hatch.');
L('chibby.launch.1', 'worried', 'Easy on the throttle. She bites if you rush her.', 'Over comms, fussing like a parent.');
L('garrity.arrive.1', 'excited', "Ship on my scope! If you're selling, dock at pad nine. If you're stealing, also pad nine. I'll find you.", 'Booming over comms, cheerful threat.');
L('garrity.meet.1', 'excited', 'Ore? From Chibby\'s hangar? Ha! That old wrench owes me a gearbox.', 'Big laugh, slaps a crate.');
L('garrity.meet.2', 'proud', 'Hob Garrity. Salvage, scrap and second chances, all sold by weight.', 'Salesman voice, chest out.');
L('garrity.meet.3', 'warm', "This is Lefty. Lefty says you've got honest hands. Lefty's usually wrong, but I like you.", 'Holds up his robot arm; warm and sly.');
L('garrity.meet.4', 'warm', "When I've hauling or digging that needs doing, you're on my list. Go on home, kid.", 'Gentle under the loud.');

// --- Mel: shooting, then Hask -----------------------------------------------------------
L('chibby.mel.1', 'worried', "Welcome back! Mel's at the locker. She's been waiting. She hates waiting.", 'Cheerful, then a wince.');
L('mel.meet.1', 'dry', "So you're the licence. Chib said you'd be taller.", 'Flat, unimpressed, looking you up and down.');
L('mel.meet.2', 'grumpy', 'Mel. I kit people out so they die slower. Arms out.', 'Brisk, already measuring you.');
L('mel.meet.3', 'deadpan', "Sidearm. The loud end points away from you. That's most of the course.", 'Bone dry, slapping it into your hand.');
L('mel.shoot.0', 'dry', 'Range is through there. Hit every target, or I tell everyone you missed.', 'A dare, not a joke.');
L('mel.shoot.clean', 'dry', "Hm. Not bad. Don't let it go to your head, there's not much room in there.", 'Grudging respect, hidden under an insult.');
L('mel.shoot.done', 'grumpy', "Took you long enough. They don't move, you know. The real ones do.", 'Impatient, arms crossed.');
L('mel.shoot.2', 'dry', "Hask at Alpha Relay needs couriers who shoot back. I told him about you. Don't make me a liar.", 'Matter of fact, a warning.');
L('mel.shoot.3', 'tender', "And Captain? That's what I call the ones who come back. So come back.", 'The one soft line she has. Quiet, quick, then she turns away.');
L('hask.arrive.1', 'dry', 'Alpha Relay control. You are cleared for pad two. Pad one is for people I like.', 'Tired traffic-control monotone, deadpan joke.');
L('hask.meet.1', 'dry', 'Mel sent you. She said you shoot like you mean it. From Mel, that is a hug.', 'Gravelly, slow, a tiny smile.');
L('hask.meet.2', 'deadpan', 'Orrin Hask, stationmaster. The coffee is terrible. The lanes are worse. I keep both running.', 'Weary pride.');
L('hask.meet.3', 'warm', "Say hello to Deputy. He's a cactus. He's the only one on this station who never complains.", 'Fond of a plant, completely serious.');
L('hask.meet.4', 'neutral', "I've cargo that needs flying and lanes that need clearing. Come see me when you're ready to earn.", 'Businesslike, a nod.');

// --- Edna: talking and the lockbox, then Vey ----------------------------------------------
L('chibby.edna.1', 'playful', "Hear that whistling? That's Edna. She rents the back room. Don't ask what for. Don't drink the tea.", 'Low voice, conspiratorial.');
L('edna.meet.1', 'warm', 'Come in, duckling, come in. Mind the crates, some of them bite.', 'Sweet old lady, slow, a giggle at the end.');
L('edna.meet.2', 'sly', 'Edna. I sell things nobody else will. Tea, mostly. And the other things.', 'Sugar on top, steel underneath.');
L('edna.talk.ask', 'sly', 'Now. Why would a sweet old lady trust a new face like yours?', 'Teasing test, peering over spectacles.');
L('edna.talk.plain', 'warm', "Chibby's a darling. Darlings are cheap. Still, you've got manners.", 'Amused, softening.');
L('edna.talk.cha', 'playful', 'Oh, flattery! Shameless. Keep going, duckling.', 'Delighted, a girlish laugh.');
L('edna.talk.con', 'warm', 'So you did. Strong back, quiet mouth. I like those.', 'Approving, patting your arm.');
L('edna.talk.dex', 'excited', 'You caught it! Nobody catches it. Quick, very quick.', 'Genuinely surprised, then scheming.');
L('edna.talk.wis', 'sly', "Clever duckling. Too clever. I'll be keeping an eye on you.", 'Pleased and wary at once.');
L('edna.talk.done', 'sly', "Right. I've a box I can't open, and a name inside it you'll want.", 'Down to business, a whisper.');
L('edna.puzzle.0', 'warm', "My lockbox. Old Warden lock, three dials. My eyes aren't what they were. Yours are.", 'Sliding the box across, sweet.');
L('edna.puzzle.1', 'playful', 'Oh, well done! A calling card. Lucan Vey. That slippery boy owes me a teapot.', 'Thrilled, then indignant.');
L('edna.puzzle.2', 'sly', 'Fly to Beacon Prime and tell him Edna says hello. Watch him squirm.', 'Wicked little grin.');
L('vey.arrive.1', 'sly', 'Beacon Prime welcomes you. Every dock has a price. Yours was paid, by someone curious.', 'Silky, amused, over comms.');
L('vey.meet.1', 'sly', "Edna's card. So either you're very lucky, or I'm in very deep trouble.", 'Smooth, a flicker of nerves.');
L('vey.meet.2', 'warm', "Lucan Vey. I trade in favours, and you've just been handed one.", 'Charming, a little bow in the voice.');
L('vey.meet.3', 'worried', 'Tell her the teapot is coming. Tell her nothing else.', 'Quick, low, sincere for once.');
L('vey.meet.4', 'sly', "When I need something done quietly, I'll know where to find you. I always know.", 'Velvet, a hint of menace, mostly fun.');

// --- Wrap: quests open ------------------------------------------------------------------
L('chibby.open.1', 'excited', '{name}! All three? Sweet stars, the job board just lit up like a birthday.', 'Over comms, overjoyed.', 'Captain! All three? Sweet stars, the job board just lit up like a birthday.');
L('chibby.open.2', 'warm', 'Hask, Vey and Garrity have work posted. Pick one, fly it, come home.', 'Steady, the rules again.');
L('chibby.open.3', 'playful', "Ralph's proud of you. He told me. Don't ask how.", 'Fond nonsense.');
L('ralph.open.1', 'worried', 'Tap. Tap. Tap.', 'Not a bark: three soft metal taps from somewhere inside the dog, then a pause. Eerie but tiny.');
L('chibby.open.4', 'worried', "...Huh. Where'd you hear that, boy?", 'Quiet, puzzled, a chill he laughs off.');
L('chibby.skip.1', 'warm', "Know the ropes already? Fair enough. Ship's fuelled, board's open. Go get 'em.", 'Easygoing, a thumbs-up.');

// --- Hangar barks (idle, locked stations, shops, the bunk, death) ---------------------------
L('chibby.idle.1', 'warm', "She's running sweet today. Don't tell her I said so.", 'Under a ship, muffled and happy.');
L('chibby.idle.2', 'playful', 'If it rattles, bring it to me. If it screams, bring it faster.', 'Cheerful advice.');
L('chibby.idle.3', 'tender', 'You eating? Captains forget to eat. There are noodles in the toolbox.', 'Fussing, sincere.');
L('chibby.upgrade.1', 'excited', "New parts! Listen to her purr. That's the good purr.", 'Ear to the hull, delighted.');
L('chibby.upgrade.2', 'proud', "Fitted. She'll fly. She'll fly better, I mean. She always flew.", 'Defensive of his ship, proud.');
L('chibby.death.1', 'tender', "You came home. Mostly. That's rule one, and I'll take it.", 'Relief, voice catching.');
L('chibby.death.2', 'warm', "Lost the upgrades, kept the captain. Good trade. I mean it.", 'Firm, kind, already planning repairs.');
L('chibby.respec.1', 'playful', 'Changing your mind? Good captains do. So do bad ones, but less often.', 'Teasing wisdom.');
L('ralph.idle.1', 'playful', 'Wuf?', 'One curious, rising boop of a bark.');
L('ralph.idle.2', 'playful', 'Mrrrp-wuf.', 'A sleepy grumble ending in a tiny bark.');
L('ralph.idle.3', 'excited', 'Wrrrooo!', 'An excited warble that slides up and down.');
L('mel.idle.1', 'dry', 'Locker is open. Touch nothing you cannot afford.', 'Not looking up.');
L('mel.idle.2', 'deadpan', "You're still alive. Good. Saves me the paperwork.", 'Flat, faintly pleased.');
L('mel.idle.3', 'grumpy', "Chib's humming again. Make him stop. Please.", 'Long-suffering.');
L('mel.locked.1', 'grumpy', 'Not now, licence. Chib first.', 'Waving you off.');
L('mel.shop.1', 'dry', "Pick something. I haven't got all day. I've got most of it, but not all.", 'Impatient, tapping the counter.');
L('mel.shop.buy', 'dry', "Good choice. Don't scratch it.", 'Curt approval.');
L('edna.idle.1', 'warm', "Tea, duckling? First cup's free. The second costs a secret.", 'Sweet, pouring.');
L('edna.idle.2', 'sly', 'If anyone asks, I sell knitting.', 'Whisper, a wink in the voice.');
L('edna.idle.3', 'playful', 'Vey still owes me that teapot. Remind him. Loudly.', 'Merry grudge.');
L('edna.locked.1', 'warm', "Come back when Chibby's done fussing over you, duckling.", 'Kind, shooing.');
L('edna.shop.1', 'sly', "Browse, duckling. Everything here is legal somewhere.", 'Sugary, proud of the stock.');
L('edna.shop.buy', 'sly', 'Pleasure doing business. We never met.', 'Cheerful conspiracy.');

// --- The quest givers: greetings and job talk -------------------------------------------------
L('hask.greet.1', 'dry', 'Pull up a crate, Captain. The coffee is still terrible.', 'Gravel, a weary welcome.');
L('hask.greet.2', 'deadpan', "Deputy says hello. I'm paraphrasing. He's a cactus.", 'Deadpan.');
L('hask.job.cold-run', 'neutral', 'Sealed data core to Beacon Prime. No questions. If it starts humming, fly faster.', 'Calm briefing, a warning tucked in.');
L('hask.job.black-lane', 'worried', 'Raiders in the Nether gravity wells. Clear the lane. Fair warning: this one can kill you.', 'Grave, honest, slower.');
L('hask.done.success', 'dry', "Job done. Deputy's impressed. I'm adequately pleased.", 'Dry praise, secretly warm.');
L('hask.done.failure', 'warm', 'It happens. Get some coffee. Not mine.', 'Gentle, gruff.');
L('vey.greet.1', 'sly', 'Captain. You look like someone with a favour to spend.', 'Silky, amused.');
L('vey.greet.2', 'sly', 'My ledger has a page for you now. Try to keep it interesting.', 'Teasing.');
L('vey.job.railgun-paper-trail', 'sly', 'The Guild wants a railgun. Steal one, file for one, or build one. I sell advice on all three.', 'Enjoying the options.');
L('vey.job.listening-gate', 'worried', 'A key, a gate, and a riddle at the Iron Veil. The Choir will be listening. Say something clever.', 'Hushed, for once not smiling.');
L('vey.done.success', 'proud', "Elegant. I'll remember this. So will my ledger.", 'Pleased, a soft clap.');
L('vey.done.failure', 'sly', 'A setback is just a favour waiting to be called in.', 'Unbothered, smooth.');
L('garrity.greet.1', 'excited', "Kid! Good to see you. Lefty, wave. He's waving.", 'Booming, delighted.');
L('garrity.greet.2', 'playful', 'If it floats, I can sell it. If it sinks, I can sell it slower.', 'Proud motto, a laugh.');
L('garrity.job.dead-weight', 'excited', "Dead hulk drifting past Dustfall, fat with parts. Tow it in before the scavengers do. Bring Lefty a souvenir.", 'Greedy glee, fast.');
L('garrity.done.success', 'excited', "Ha! That's a payday! Lefty, thumbs up.", 'Huge laugh.');
L('garrity.done.failure', 'warm', "Lost it, eh? Scrap's scrap. There's always more falling.", 'Big-hearted shrug.');

export const LINES = Object.freeze(list.map((l) => Object.freeze(l)));
const BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** A line by id, or null. */
export const lineById = (id) => BY_ID.get(id) || null;

/** Fills {name} and other {keys} from vars; an unknown key becomes "Captain". */
export function fillLine(text, vars = {}) {
  return String(text).replace(/\{([a-z]+)\}/g, (_, key) => {
    const v = vars[key];
    return typeof v === 'string' && v.trim() ? v.trim() : 'Captain';
  });
}

/** Lines one speaker has, in order. */
export const linesFor = (speaker) => LINES.filter((l) => l.speaker === speaker);
