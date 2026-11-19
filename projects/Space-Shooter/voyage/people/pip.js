// Pip's person sheet (social lane, plan 1.3 and 1.7): data only, strict JSON body, every word he or you say is in `lines`.
// A draft for Donaven to read and edit. No code reads a word from anywhere else. The line id is also the voice line id
// (`voice/voices.json` has "pip"; scratch voices are rendered per id).
//
//   bond      0..5 where they start with you.   cares / dislike   the persuade values (3 cares, 1 dislike, 1 neutral).
//   lean      how each approach sits: -2 fits, 0 neutral, +2 misfit.   boss   who hears about it when anger fails.
//   facts     what can be learned (label, head start in a push built on it).   topics   small talk, one voiced answer each.
//   wants     what they hold that can be asked for, with the pushes written for it.   greetings   variants picked by marks and bond.
export default {
  "id": "pip",
  "name": "Pip",
  "speaker": "pip",
  "bond": 2,
  "boss": "tull",
  "cares": ["safety", "honor", "family"],
  "dislike": "speed",
  "lean": { "empathy": -2, "money": 0, "anger": 2 },
  "sees": {
    "hook": { "label": "Pip's cutter hook", "note": "Pip's. Not on the ship's list.", "fact": null }
  },
  "facts": {
    "projector": { "label": "The projector needs one clean circuit board", "headStart": "You know what he is stuck on" },
    "safety": { "label": "He has kept the ship flying two years on tape", "headStart": "You know what he guards: the ship", "tells": [{ "value": "safety", "kind": "care" }], "named": { "value": "safety", "text": "\"She holds, people live.\"" } },
    "nan": { "label": "His nan taught him never to lend a blade to a hurry", "headStart": "You know who taught him", "tells": [{ "value": "speed", "kind": "dislike" }], "named": { "value": "honor", "text": "\"Measure it, cut it once. My name on the tape.\"" } },
    "off-books": { "label": "The cutter is not on Tull's list; he bought it himself", "headStart": "You know what he is hiding" },
    "lost-cutter": { "label": "Gunner four lost his last good cutter", "headStart": "You know why he says no" }
  },
  "topics": [
    { "id": "projector", "label": "What are you working on?", "gate": {}, "say": "pip.topic.projector", "ask": "pip.p.projector", "fact": "projector", "lit": "projector" },
    { "id": "safety", "label": "How long have you kept her flying?", "gate": { "bond": 2 }, "say": "pip.topic.safety", "ask": "pip.p.safety", "fact": "safety" },
    { "id": "nan", "label": "Who taught you?", "gate": { "bond": 3 }, "say": "pip.topic.nan", "ask": "pip.p.nan", "fact": "nan" },
    { "id": "tag", "label": "Why is the cutter not on Tull's list?", "gate": { "saw": "hook" }, "say": "pip.topic.tag", "ask": "pip.p.tag", "fact": "off-books" }
  ],
  "greetings": [
    { "when": { "mark": "owed" }, "line": "pip.hello.owed" },
    { "when": { "mark": "scared" }, "line": "pip.hello.scared" },
    { "when": { "bondMax": 1 }, "line": "pip.hello.cold" },
    { "when": { "bondMin": 4 }, "line": "pip.hello.trusted" },
    { "when": {}, "line": "pip.wb.hello" }
  ],
  "workLine": "pip.topic.work",
  "wants": {
    "good-cutter": {
      "label": "the good cutter",
      "item": "good-cutter",
      "resist": 12,
      "lend": true,
      "give": false,
      "lit": "good cutter",
      "ask": "pip.p.ask",
      "no": "pip.cutter.no",
      "noFact": "lost-cutter",
      "closed": "pip.cutter.closed",
      "have": "pip.cutter.have",
      "lendLine": "pip.cutter.lend",
      "trustedLine": "pip.cutter.trusted",
      "pushes": [
        { "id": "p-emp", "ability": "persuade", "approach": "empathy", "needs": { "facts": ["lost-cutter"] }, "say": "pip.p.p-emp", "won": "pip.cutter.p-emp.win", "lost": "pip.cutter.p-emp.no", "gives": { "great": "keep", "ok": "lend" } },
        { "id": "p-ang", "ability": "persuade", "approach": "anger", "needs": {}, "say": "pip.p.p-ang", "won": "pip.cutter.p-ang.win", "lost": "pip.cutter.p-ang.no", "gives": { "great": "keep", "ok": "lend" } },
        { "id": "i-ang", "ability": "intimidate", "approach": "anger", "needs": {}, "say": "pip.p.i-ang", "won": "pip.cutter.i-ang.win", "lost": "pip.cutter.i-ang.no", "gives": { "great": "keep", "ok": "keep" } },
        { "id": "i-mon", "ability": "intimidate", "approach": "money", "needs": { "facts": ["off-books"] }, "say": "pip.p.i-mon", "won": "pip.cutter.i-mon.win", "lost": "pip.cutter.i-mon.no", "gives": { "great": "keep", "ok": "keep" } },
        { "id": "b-mon", "ability": "bribe", "approach": "money", "needs": {}, "say": "pip.p.b-mon", "won": "pip.cutter.b-mon.win", "lost": "pip.cutter.b-mon.no", "gives": { "great": "keep", "ok": "keep" }, "bribe": { "min": 10, "max": 40, "best": 33 } },
        { "id": "b-emp", "ability": "bribe", "approach": "empathy", "needs": { "facts": ["projector"], "items": { "circuit-board": 1 } }, "say": "pip.p.b-emp", "won": "pip.cutter.b-emp.win", "lost": "pip.cutter.b-emp.no", "gives": { "great": "keep", "ok": "keep" }, "bribe": { "min": 0, "max": 15, "best": 12, "gift": { "circuit-board": 1 } } }
      ]
    }
  },
  "lines": {
    "pip.wb.hello": { "who": "pip", "emotion": "worried", "text": "Oh. Hi. I have the good cutter, and I am not giving it to you, because you will lose it. Sorry. Not sorry. Sorry." },
    "pip.hello.cold": { "who": "pip", "emotion": "worried", "text": "Hi. I am busy. I am always busy. Be quick, please, and be quiet." },
    "pip.hello.scared": { "who": "pip", "emotion": "worried", "text": "Oh. It is you. I have soldering. Over there. Away from the face. Please." },
    "pip.hello.trusted": { "who": "pip", "emotion": "warm", "text": "Oh good, it is you. Come in, mind the tape. What do you need?" },
    "pip.hello.owed": { "who": "pip", "emotion": "dry", "text": "You have my cutter. I am not watching the clock. I am watching the clock." },
    "pip.topic.projector": { "who": "pip", "emotion": "worried", "text": "The projector. It fries when you look at it wrong. It needs one clean circuit board. Tull says pending." },
    "pip.topic.safety": { "who": "pip", "emotion": "proud", "text": "Two years. On tape. If I stop, she stops, and people are standing in her." },
    "pip.topic.nan": { "who": "pip", "emotion": "tender", "text": "My nan. Shipwright. Measure it, cut it once, and never lend a blade to a hurry." },
    "pip.topic.tag": { "who": "pip", "emotion": "worried", "text": "Because Tull sells anything with a serial number. I bought it. With my money. Please stop reading tags." },
    "pip.topic.work": { "who": "pip", "emotion": "worried", "text": "I have work. The projector will not fix itself. It will not even try." },
    "pip.cutter.no": { "who": "pip", "emotion": "worried", "text": "No. Gunner four borrowed my last good cutter. Gunner four was reassigned to a planet. The cutter went too." },
    "pip.cutter.closed": { "who": "pip", "emotion": "dry", "text": "We have done the cutter. The cutter is done. Ask me tomorrow, or ask me something new." },
    "pip.cutter.have": { "who": "pip", "emotion": "dry", "text": "You have it. That is the cutter, in your hand. Cut once." },
    "pip.cutter.lend": { "who": "pip", "emotion": "warm", "text": "One shift. I am writing your name on the tape. In pen." },
    "pip.cutter.trusted": { "who": "pip", "emotion": "tender", "text": "You? Yes. Hook is on the left. Bring it back warm." },
    "pip.cutter.p-emp.win": { "who": "pip", "emotion": "tender", "text": "You said \"this hook\". Nobody ever says which hook. Take it. Cut once." },
    "pip.cutter.p-emp.no": { "who": "pip", "emotion": "worried", "text": "That is what gunner four said. Almost word for word. No." },
    "pip.cutter.p-ang.win": { "who": "pip", "emotion": "grumpy", "text": "It is not right. None of it is right! Fine. Take it and fix something he called pending." },
    "pip.cutter.p-ang.no": { "who": "pip", "emotion": "dry", "text": "Do not be angry at me about Tull. I am angry about Tull full time. No." },
    "pip.cutter.i-ang.win": { "who": "pip", "emotion": "worried", "text": "OKAY. Okay! Take it! Please stop doing the face." },
    "pip.cutter.i-ang.no": { "who": "pip", "emotion": "proud", "text": "No. I have been shouted at by a reactor. You are not even close." },
    "pip.cutter.i-mon.win": { "who": "pip", "emotion": "worried", "text": "You would not. You would. Take it. And do not sit with me at lunch." },
    "pip.cutter.i-mon.no": { "who": "pip", "emotion": "deadpan", "text": "Tell him. Then neither of us has a cutter. Think about that with your whole head." },
    "pip.cutter.b-mon.win": { "who": "pip", "emotion": "sly", "text": "That is more than I paid. Sold. Do not tell me what you do with it." },
    "pip.cutter.b-mon.no": { "who": "pip", "emotion": "grumpy", "text": "It is not for sale at that. It is barely for sale at all. Put your money away." },
    "pip.cutter.b-emp.win": { "who": "pip", "emotion": "tender", "text": "You brought me a part. Nobody brings me parts. Take the cutter. I am fine. I am not crying." },
    "pip.cutter.b-emp.no": { "who": "pip", "emotion": "worried", "text": "It is a lovely board. It is still my only cutter. Ask me when I have stopped shaking." },
    "pip.p.ask": { "who": "you", "emotion": "neutral", "text": "Can I use the cutter? Just for the bench." },
    "pip.p.projector": { "who": "you", "emotion": "warm", "text": "What are you working on?" },
    "pip.p.safety": { "who": "you", "emotion": "warm", "text": "How long have you kept her flying?" },
    "pip.p.nan": { "who": "you", "emotion": "warm", "text": "Who taught you?" },
    "pip.p.tag": { "who": "you", "emotion": "dry", "text": "Why is the cutter not on Tull's list?" },
    "pip.p.p-emp": { "who": "you", "emotion": "tender", "text": "I am not gunner four. I sign for it, and it is back on this hook before the shift ends." },
    "pip.p.p-ang": { "who": "you", "emotion": "grumpy", "text": "Tull lets this ship rot and the one good tool on it hangs on a hook. That is not right, Pip." },
    "pip.p.i-ang": { "who": "you", "emotion": "menacing", "text": "Give me the cutter, Pip. I am done asking." },
    "pip.p.i-mon": { "who": "you", "emotion": "menacing", "text": "Tull sells anything with a serial number. Be a shame if he heard there was one more." },
    "pip.p.b-mon": { "who": "you", "emotion": "sly", "text": "Name a price. Credits, on the bench, right now." },
    "pip.p.b-emp": { "who": "you", "emotion": "tender", "text": "Here. A clean board for the projector. No pending. Now, the cutter?" }
  }
};
