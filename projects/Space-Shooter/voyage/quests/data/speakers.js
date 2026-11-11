// Who can speak a quest line: the story's cast (ROUND2-CONTRACT.md section 1)
// plus the quest extras (raiders, clerks, acolytes...). A voice line's speaker
// is its id's first part. Each extra carries a TTS design sentence for the
// voice lane; the cast's designs live in the story's CAST.md.
// DATA ONLY: the body after "= " is strict JSON so the Stardust Studio (Focus)
// can read and write it. No code, comments or trailing commas inside the JSON.
export const SPEAKERS_DATA = {
  "version": 1,
  "emotions": ["neutral", "warm", "excited", "dry", "grumpy", "sly", "worried", "proud", "deadpan", "playful", "tender", "menacing"],
  "cast": ["chibby", "ralph", "mel", "edna", "hask", "vey", "garrity", "narrator"],
  "extras": {
    "raider": { "name": "Ember raider", "design": "Male, about 30, a cocky nasal tenor over a crackly ship radio, swaggering and quick, a pirate who thinks he is funny; menace that keeps slipping into showing off." },
    "kestrel": { "name": "Red Kestrel", "design": "Female, about 40, a cool husky alto with a clipped officer's diction, unhurried and dangerous, the ace who has never lost; a dry smile you can hear." },
    "clerk": { "name": "Ordnance clerk", "design": "Male or female, about 50, a thin precise nasal voice, utterly unflappable, reading rules aloud with deep love for forms; deadpan bureaucrat." },
    "acolyte": { "name": "Choir acolyte", "design": "Androgynous, about 20, soft breathy voice with a faint choral echo, calm and far too certain, speaks as if finishing a song only they can hear." },
    "traffic": { "name": "Beacon traffic", "design": "Female, about 35, bright clipped traffic-control voice, efficient and a little bored, every sentence ends like a checklist item." },
    "scav": { "name": "Scav boss", "design": "Male, about 45, a rough cheerful growl with a broad frontier drawl, a scrapyard bandit who loves a bargain more than a fight." },
    "nana": { "name": "Nana Opaline", "design": "Female, about 75, a warm creaky voice, chatty and unafraid, a retired mining-rig grandmother on her first big trip who thinks the raiders are rude." },
    "tamsin": { "name": "Courier Tamsin Holt", "design": "Female, about 40, a tired kind mezzo recorded alone in a cold cockpit, steady and brave, a last message; slightly lo-fi, like an old flight recorder." },
    "chef": { "name": "Chef Bontemps", "design": "Male, about 50, a big theatrical tenor, flustered and passionate, a wedding caterer on the edge of tears about frosting." },
    "collector": { "name": "Duchess Orla", "design": "Female, about 55, a plummy, bored, rich drawl, every word a yawn, an art collector who owns too many things." },
    "archivist": { "name": "Archivist Pell", "design": "Male, about 70, a dusty quiet whisper, kind and very slow, a records keeper who has not had a visitor in years." },
    "keeper": { "name": "Beacon keeper Wren", "design": "Female, about 30, a bright quick voice with a stammer when nervous, a lonely lighthouse engineer who talks to her machines." },
    "warden": { "name": "The Warden voice", "design": "Genderless, ageless, a calm low machine voice with a soft metallic ring, patient as stone, very slow; not unkind." },
    "derby": { "name": "Derby announcer", "design": "Male, about 40, a fast booming sports announcer, all exclamation marks, loving every crash." },
    "thief": { "name": "Sable the thief", "design": "Female, about 25, a quick bright voice, cheeky and fast, a pickpocket who is always half a laugh from running." }
  }
};

