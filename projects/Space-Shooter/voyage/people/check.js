// The person-sheet checker (pure): problems as plain sentences, empty when the sheet is whole. Tests run it over every sheet,
// so adding Tull or Nessa means copying pip.js and fixing what this says. It knows the rules of plan 1.3 and 1.5.
import { VALUES } from '../minigames/persuade.js';

export const APPROACHES = Object.freeze(['empathy', 'anger', 'money']);
export const ABILITIES = Object.freeze(['persuade', 'intimidate', 'bribe']);
export const RESISTS = Object.freeze([8, 10, 12, 14, 18]);
export const EMOTIONS = Object.freeze(['neutral', 'warm', 'excited', 'dry', 'grumpy', 'sly', 'worried', 'proud', 'deadpan', 'playful', 'tender', 'menacing']);
const LINE = /^[a-z0-9][a-z0-9.-]{0,47}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function sheetIssues(sheet, { items = {} } = {}) {
  const out = [];
  const bad = (m) => out.push(`${sheet?.id || '?'}: ${m}`);
  if (!sheet || typeof sheet !== 'object') return ['no sheet'];
  if (!ID.test(sheet.id || '')) bad('needs a short lowercase id');
  if (!sheet.name) bad('needs a name');
  if (!Number.isInteger(sheet.bond) || sheet.bond < 0 || sheet.bond > 5) bad('bond must be 0 to 5');
  const cares = sheet.cares || [];
  if (cares.length !== 3 || new Set(cares).size !== 3 || cares.some((c) => !VALUES.includes(c))) bad(`cares must be 3 different values of ${VALUES.join(' ')}`);
  if (!VALUES.includes(sheet.dislike) || cares.includes(sheet.dislike)) bad('dislike must be one value they do not care about');
  for (const a of APPROACHES) if (![-2, 0, 2].includes(sheet.lean?.[a])) bad(`lean.${a} must be -2, 0 or 2`);
  const lines = sheet.lines || {};
  const lineOk = (id, where, who) => {
    const l = lines[id];
    if (!l) { bad(`${where}: line ${id} is missing`); return; }
    if (who && l.who !== who) bad(`${where}: line ${id} should be spoken by ${who}`);
  };
  const seen = new Map();
  for (const [id, l] of Object.entries(lines)) {
    if (!LINE.test(id)) bad(`line id ${id} is not a valid id (48 characters, lowercase, dots and dashes)`);
    if (!l.text || !String(l.text).trim()) bad(`line ${id} has no words`);
    if (!EMOTIONS.includes(l.emotion)) bad(`line ${id}: emotion ${l.emotion} is not one of ${EMOTIONS.join(' ')}`);
    if (String(l.text || '').split(/\s+/).length > 45) bad(`line ${id} is over 45 words`);
    const key = `${l.who}|${String(l.text).trim().toLowerCase()}`;
    if (seen.has(key)) bad(`lines ${seen.get(key)} and ${id} say the same words`);
    seen.set(key, id);
  }
  const facts = sheet.facts || {};
  const nFacts = Object.keys(facts).length;
  if (nFacts < 4 || nFacts > 6) bad(`needs 4 to 6 facts, has ${nFacts}`);
  for (const [id, f] of Object.entries(facts)) {
    if (!ID.test(id)) bad(`fact id ${id} is not a short lowercase id`);
    if (!f.label) bad(`fact ${id} needs a label`);
    for (const t of f.tells || []) if (!VALUES.includes(t.value) || !['care', 'dislike'].includes(t.kind)) bad(`fact ${id}: bad tell`);
    if (f.named && !VALUES.includes(f.named.value)) bad(`fact ${id}: named card needs a value`);
    if (f.named && !cares.includes(f.named.value)) bad(`fact ${id}: a named card must be on something they care about`);
    if (f.named && !f.named.text) bad(`fact ${id}: named card needs words`);
  }
  const topics = sheet.topics || [];
  if (topics.length < 3 || topics.length > 5) bad(`needs 3 to 5 topics, has ${topics.length}`);
  const topicIds = new Set();
  for (const t of topics) {
    if (topicIds.has(t.id)) bad(`topic ${t.id} twice`); topicIds.add(t.id);
    if (!t.label) bad(`topic ${t.id} needs a label`);
    if (!facts[t.fact]) bad(`topic ${t.id}: fact ${t.fact} does not exist`);
    lineOk(t.say, `topic ${t.id}`, sheet.speaker);
    lineOk(t.ask, `topic ${t.id}`, 'you');
    for (const k of Object.keys(t.gate || {})) if (!['bond', 'fact', 'saw'].includes(k)) bad(`topic ${t.id}: unknown gate ${k}`);
    if (t.gate?.fact && !facts[t.gate.fact]) bad(`topic ${t.id}: gate fact ${t.gate.fact} does not exist`);
    if (t.gate?.saw && !sheet.sees?.[t.gate.saw]) bad(`topic ${t.id}: gate saw ${t.gate.saw} is not a thing to see`);
  }
  if (sheet.workLine) lineOk(sheet.workLine, 'workLine', sheet.speaker); else bad('needs a workLine (what they say after two topics)');
  if (!(sheet.greetings || []).some((g) => !Object.keys(g.when || {}).length)) bad('needs a default greeting (when: {})');
  for (const g of sheet.greetings || []) lineOk(g.line, 'greeting', sheet.speaker);
  const wants = Object.entries(sheet.wants || {});
  if (!wants.length) bad('needs at least one want');
  const sayTexts = new Set();
  for (const [wid, w] of wants) {
    const where = `want ${wid}`;
    if (!RESISTS.includes(w.resist)) bad(`${where}: resist ${w.resist} is not on the ladder ${RESISTS.join(' ')}`);
    if (w.item && !items[w.item] && Object.keys(items).length) bad(`${where}: item ${w.item} is not a known item`);
    if (!facts[w.noFact]) bad(`${where}: noFact ${w.noFact} does not exist`);
    lineOk(w.ask, where, 'you'); lineOk(w.no, where, sheet.speaker); lineOk(w.closed, where, sheet.speaker); lineOk(w.have, where, sheet.speaker);
    if (w.lend) { lineOk(w.lendLine, where, sheet.speaker); lineOk(w.trustedLine, where, sheet.speaker); }
    const pushes = w.pushes || [];
    const ids = new Set(), pairs = new Set();
    for (const p of pushes) {
      const pw = `${where}, push ${p.id}`;
      if (ids.has(p.id)) bad(`${pw}: twice`); ids.add(p.id);
      if (!ABILITIES.includes(p.ability) || !APPROACHES.includes(p.approach)) bad(`${pw}: needs an ability and an approach`);
      if (pairs.has(`${p.ability}-${p.approach}`)) bad(`${pw}: that pair is used twice`); pairs.add(`${p.ability}-${p.approach}`);
      lineOk(p.say, pw, 'you'); lineOk(p.won, pw, sheet.speaker); lineOk(p.lost, pw, sheet.speaker);
      if (new Set([p.say, p.won, p.lost]).size !== 3) bad(`${pw}: say, won and lost must be three different lines`);
      if ((p.needs?.facts?.length || p.needs?.items) && !p.hint) bad(`${pw}: a push with needs shows a hint of what you would need to know (hint)`);
      for (const f of p.needs?.facts || []) if (!facts[f]) bad(`${pw}: needs fact ${f} which does not exist`);
      for (const k of Object.keys(p.gives || {})) if (!['great', 'ok'].includes(k) || !['keep', 'lend'].includes(p.gives[k])) bad(`${pw}: gives must be great/ok: keep/lend`);
      if (p.gives?.ok === 'lend' && !w.lend) bad(`${pw}: lends but the want cannot be lent`);
      if (p.ability === 'bribe') {
        const b = p.bribe;
        if (!b || !(b.max > b.min) || !(b.best > b.min)) bad(`${pw}: a bribe needs bribe { min, max, best } with max above min`);
      }
      sayTexts.add(p.say);
    }
    for (const a of ABILITIES) if (!pushes.some((p) => p.ability === a)) bad(`${where}: needs at least one ${a} push`);
    if (pushes.length < 3) bad(`${where}: needs at least 3 pushes`);
  }
  return out;
}
