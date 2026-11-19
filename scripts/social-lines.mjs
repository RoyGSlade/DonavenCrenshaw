#!/usr/bin/env node
// Writes every person sheet's spoken lines in the voice lane's lines format (social lane, plan 1.10):
//   node scripts/social-lines.mjs OUT.json
// then, in lhc-lanes/stardust/voice:  python3 tools/mkjobs.py OUT.json work/jobs-social.json   and  dadvoice run ...
// Only the people's own lines are voiced here (the player's lines, who "you", get their six player voices later). The text is the
// sheet's `text`; the emotion is the sheet's; the actor note is built from the ability and approach of the push the line belongs to.
import { writeFileSync } from 'node:fs';
import { PEOPLE } from '../projects/Space-Shooter/voyage/people/index.js';

const out = process.argv[2];
if (!out) { console.error('usage: social-lines.mjs OUT.json'); process.exit(2); }
const NOTE = { empathy: 'The quiet, soft way.', anger: 'Loud, hurt, close to cracking.', money: 'Business, no fuss.' };
const lines = [];
for (const sheet of Object.values(PEOPLE)) {
  const push = {};
  for (const w of Object.values(sheet.wants || {})) for (const p of w.pushes) { push[p.won] = p; push[p.lost] = p; }
  for (const [id, l] of Object.entries(sheet.lines)) {
    if (l.who !== sheet.speaker) continue;
    const p = push[id];
    lines.push({ id, speaker: sheet.speaker, text: l.text, emotion: l.emotion, ...(p ? { direction: `${p.won === id ? 'giving in' : 'holding firm'} to a ${p.ability} with ${p.approach}. ${NOTE[p.approach]}` } : {}), sound: false });
  }
}
writeFileSync(out, JSON.stringify({ version: 1, exported: new Date().toISOString(), source: 'projects/Space-Shooter/voyage/people/*.js (social lane, claude/stardust-social)', count: lines.length, lines }, null, 2) + '\n');
console.log(`${out}: ${lines.length} lines, speakers ${[...new Set(lines.map((l) => l.speaker))].join(', ')}`);
