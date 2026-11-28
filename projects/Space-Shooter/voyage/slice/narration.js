// What to do with a scene's narration (stage directions) when it is presented (opening B, presentation only: no words change).
// The approved text stays in the quest data untouched. A node's `beat` is a screenplay direction. Three calls:
//   performed  the staging now does it (the camera move, the red light, the Reaver coming in), so the words are NOT shown at all;
//   caption    descriptive narration that nothing performs: a small subtitle strip that goes by itself after its reading time;
//   (never)    a big box with Next during movement or danger, and never camera language ("Cut to ...") in front of the player.
// A node's speakerless `text` is narration too (it keeps its italic box, and shrinks to subtitles in danger: ui/dialogue.js).
import { SLICE_LIST } from '../quests/data/slice/index.js';

/** Nodes whose `beat` the staging performs: hidden. */
export const PERFORMED = Object.freeze(['visitors/breach', 'visitors/last', 'visitors/reck-falls']);

/** Camera and cut language that must never reach the player's screen. */
export const CAMERA_WORDS = /\b(cut to|cuts to|camera|pans? (to|across|over)|zoom(s|ing)? (in|out|on)|fades? (in|out|to)|close-?up|wide shot|POV)\b/i;
export const isCameraLanguage = (text) => CAMERA_WORDS.test(String(text || ''));

export const beatMode = (questId, nodeId) => (PERFORMED.includes(`${questId}/${nodeId}`) ? 'performed' : 'caption');

/** How long a caption stays: its reading time, a little more than the box's. */
export const captionMs = (text) => Math.max(2400, Math.min(8000, 1200 + 50 * String(text || '').length));

/** The audit: every node with a direction (or speakerless narration) in scenes 1 to 6 and the call made for it. */
export function audit() {
  const out = [];
  for (const q of SLICE_LIST) {
    for (const [id, n] of Object.entries(q.nodes)) {
      if (n.beat) out.push({ key: `${q.id}/${id}`, type: n.type, call: n.type === 'end' ? 'result card text (shown on the card, not as dialogue)' : beatMode(q.id, id), text: n.beat });
      else if (n.type === 'dialogue' && !n.speaker) out.push({ key: `${q.id}/${id}`, type: n.type, call: 'narration box (subtitle in danger)', text: n.text });
    }
  }
  return out;
}
