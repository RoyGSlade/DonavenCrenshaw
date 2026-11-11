// The content lane's voice lines: every spoken quest node and the shopkeepers'
// own lines, in the story's line shape, so a page can register them with the
// story's speaker (ROUND2-CONTRACT.md section 2):
//
//   import { addLines } from '../story/lines.js';
//   import { contentLines } from './quests/lines.js';
//   addLines(contentLines());     // then speak(lineId) / voiceUrl(lineId) work
//
// Quest text with rolled {fills} carries audioText (the words to record); the
// quest player shows the engine's filled text and plays the audio for its line.
// lhc-lanes/stardust/content/LINES-quests.json is exported from this for the
// voice lane (content/export-lines.mjs).
import { QUEST_LIST } from './data/quests/index.js';
import { SHOPS_DATA } from './data/shops.js';
import { SPEAKERS_DATA } from './data/speakers.js';
import { questLines } from './validate.js';

/** { version, lines: [{ id, speaker, name?, emotion, text, direction, audioText?, quest?, node? }] } */
export function contentLines() {
  const lines = [];
  for (const l of questLines(QUEST_LIST).lines) {
    const extra = SPEAKERS_DATA.extras[l.speaker];
    lines.push({
      id: l.id, speaker: l.speaker, ...(extra ? { name: extra.name } : {}), emotion: l.emotion, text: l.text, direction: l.direction,
      ...(l.audioText ? { audioText: l.audioText } : {}), quest: l.quest, node: l.node,
    });
  }
  for (const [shop, s] of Object.entries(SHOPS_DATA.shops)) {
    for (const [key, l] of Object.entries(s.lines || {})) {
      if (!l.text) continue; // the story lane owns this id and its words
      lines.push({ id: l.line, speaker: l.line.split('.')[0], emotion: l.emotion, text: l.text, direction: l.direction, shop, node: key });
    }
  }
  return { version: 1, lines };
}
