// The scene overlay format (social lane, plan 1.9), pure text in, plain problems out. An overlay sits beside an approved scene
// (`scene-4-the-eighth-gunner.talk.md` next to `scene-4-the-eighth-gunner.md`) and carries its own approval; the scene file is never
// edited. It does four things: tag an existing choice by its EXACT label (so it gets the roll modifiers, the pinned want and the
// mini-game), learn a fact or change a bond when a node plays, pin a want, and add new push choices.
//
//   # Talk overlay: the-eighth-gunner
//   - people: tull
//
//   ## Tag
//   - desk | "Haggle for a bigger share." | want bigger-share | push haggle money
//   - ledger | Learn: tull broke
//   - seven | Bond: tull +1
//
//   ## Add
//   ### desk [want]
//   - want bigger-share | tull | A bigger share
//   ### desk, seven, ledger
//   - push persuade empathy (needs know tull seven-gunners) "You liked Reck. Pay the next one like you want them to live." great -> end-hired-well, ok -> end-hired-fair, no -> end-lowballed
//
// Abilities: persuade intimidate bribe, and haggle (the price needle, for tagged haggles). Approaches: empathy anger money.
// Gates: `know <person> <fact>`, `flag <id>`, `item <id>`, joined with " and ". Nothing here is applied to a scene: this module defines the
// format and checks it; `convert.mjs` (later) merges. The scene-lint of the quest lane learns the same four things from this file.
export const OVERLAY_ABILITIES = Object.freeze(['persuade', 'intimidate', 'bribe', 'haggle']);
export const OVERLAY_APPROACHES = Object.freeze(['empathy', 'anger', 'money']);
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SPEAKERS = ['chibby', 'ralph', 'mel', 'edna', 'hask', 'vey', 'garrity', 'narrator', 'tull', 'nessa', 'pip', 'reck', 'reaver'];

/** The scene's nodes and choices, the way the scene lint reads them: { id: { type, choices: [{ label, check, links }] } }. */
export function readScene(text) {
  const body = String(text).split(/^## Nodes\s*$/m)[1] || '';
  const nodes = {};
  for (const b of body.split(/^### /m).slice(1)) {
    const head = b.split('\n')[0];
    const m = head.match(/^([a-z0-9][a-z0-9-]*) \[(talk|fight|end)(?:[ :]([^\]]*))?\]\s*$/);
    if (!m) continue;
    const choices = [];
    for (const l of b.split('\n')) {
      const c = l.match(/^- "(.+?)"(?: \[(\w+) (\d+)\] pass -> ([a-z0-9-]+), fail -> ([a-z0-9-]+)| -> ([a-z0-9-]+))(.*)$/);
      if (c) choices.push({ label: c[1], skill: c[2] ? c[2].toLowerCase() : null, dc: c[3] ? +c[3] : null });
    }
    nodes[m[1]] = { id: m[1], type: m[2], choices };
  }
  return nodes;
}

/** Parse an overlay's text. Returns { overlay, errors }: errors are plain sentences with the line number. */
export function parseOverlay(text) {
  const errors = [];
  const o = { id: null, people: [], tags: [], learns: [], bonds: [], wants: [], adds: [] };
  let section = null, group = null;
  const err = (n, m) => errors.push(`overlay line ${n}: ${m}`);
  String(text).split('\n').forEach((raw, i) => {
    const n = i + 1, line = raw.replace(/\s+$/, '');
    if (!line.trim()) return;
    let m;
    if ((m = line.match(/^# Talk overlay: (\S+)\s*$/))) { o.id = m[1]; return; }
    if ((m = line.match(/^- people: (.+)$/))) { o.people = m[1].split(',').map((s) => s.trim()).filter(Boolean); return; }
    if ((m = line.match(/^## (Tag|Add)\b/))) { section = m[1].toLowerCase(); group = null; return; }
    if ((m = line.match(/^### (.+)$/))) {
      if (section !== 'add') { err(n, 'a ### group belongs under "## Add"'); return; }
      const w = m[1].match(/^(.+?)(?: \[(want)\])?$/);
      group = { nodes: w[1].split(',').map((s) => s.trim()).filter(Boolean), kind: w[2] || 'push', pushes: [], wants: [] };
      o.adds.push(group); return;
    }
    if (!line.startsWith('- ')) { err(n, `cannot read "${line}"`); return; }
    if (section === 'tag') {
      const parts = line.slice(2).split(' | ').map((s) => s.trim());
      const node = parts[0];
      if ((m = (parts[1] || '').match(/^Learn: ([a-z0-9-]+) ([a-z0-9-]+)$/)) && parts.length === 2) { o.learns.push({ node, person: m[1], fact: m[2], line: n }); return; }
      if ((m = (parts[1] || '').match(/^Bond: ([a-z0-9-]+) ([+-]\d+)$/)) && parts.length === 2) { o.bonds.push({ node, person: m[1], delta: +m[2], line: n }); return; }
      const label = (parts[1] || '').match(/^"(.+)"$/)?.[1];
      const want = parts.length === 4 ? (parts[2].match(/^want ([a-z0-9-]+)$/)?.[1] || null) : null;
      const push = (parts[parts.length - 1] || '').match(/^push (\w+) (\w+)$/);
      if (label && push && (parts.length === 3 || (parts.length === 4 && want))) { o.tags.push({ node, label, want, ability: push[1], approach: push[2], line: n }); return; }
      err(n, 'a Tag line is: node | "exact label" | want id | push ability approach   or   node | Learn: person fact   or   node | Bond: person +1');
      return;
    }
    if (section === 'add' && group) {
      if (group.kind === 'want') {
        const p = line.slice(2).split(' | ').map((s) => s.trim());
        if ((m = p[0].match(/^want ([a-z0-9-]+)$/)) && p.length === 3) group.wants.push({ id: m[1], person: p[1], label: p[2], line: n }); else err(n, 'a want line is: want id | person | label');
        return;
      }
      m = line.match(/^- push (\w+) (\w+)(?: \(needs (.+?)\))? "(.+)" great -> ([a-z0-9-]+), ok -> ([a-z0-9-]+), no -> ([a-z0-9-]+)\s*$/);
      if (!m) { err(n, 'a push line is: push ability approach (needs ...) "what you say" great -> node, ok -> node, no -> node'); return; }
      const needs = [];
      for (const part of (m[3] || '').split(' and ').filter(Boolean)) {
        let g;
        if ((g = part.trim().match(/^know ([a-z0-9-]+) ([a-z0-9-]+)$/))) needs.push({ kind: 'know', person: g[1], fact: g[2] });
        else if ((g = part.trim().match(/^(flag|item) ([a-z0-9-]+)$/))) needs.push({ kind: g[1], id: g[2] });
        else err(n, `cannot read the need "${part}" (know person fact, flag id, item id)`);
      }
      group.pushes.push({ ability: m[1], approach: m[2], needs, say: m[4], great: m[5], ok: m[6], no: m[7], line: n });
      return;
    }
    err(n, 'this line is not under a "## Tag" or "## Add" heading');
  });
  if (!o.id) errors.push('overlay needs "# Talk overlay: <scene id>"');
  if (!o.people.length) errors.push('overlay needs "- people: <ids>"');
  return { overlay: o, errors };
}

/**
 * Check an overlay against its scene text by exact labels. `sheets` (optional) is { personId: sheet } so facts can be checked.
 * Returns { errors, overlay }. An empty overlay (no tags, learns, bonds or adds) is valid and changes nothing.
 */
export function validateOverlay(overlayText, sceneText, { sheets = {}, sceneId = null } = {}) {
  const { overlay: o, errors } = parseOverlay(overlayText);
  const nodes = readScene(sceneText);
  const err = (m) => errors.push(m);
  const meta = String(sceneText).match(/^- id: (\S+)/m)?.[1];
  if (o.id && meta && o.id !== meta) err(`overlay is for scene "${o.id}" but this scene is "${meta}"`);
  if (sceneId && meta && sceneId !== meta) err(`expected scene ${sceneId}`);
  for (const p of o.people) if (!SPEAKERS.includes(p)) err(`people: ${p} is not a speaker id`);
  const person = (p, where) => { if (!o.people.includes(p)) err(`${where}: person ${p} is not listed under "- people:"`); };
  const fact = (p, f, where) => { const sh = sheets[p]; if (sh && !sh.facts?.[f]) err(`${where}: ${p} has no fact "${f}" on their sheet (${Object.keys(sh.facts || {}).join(' ')})`); if (!ID.test(f)) err(`${where}: fact id ${f} is not a short lowercase id`); };
  const ability = (a, ap, where) => { if (!OVERLAY_ABILITIES.includes(a)) err(`${where}: ability ${a} is not one of ${OVERLAY_ABILITIES.join(' ')}`); if (!OVERLAY_APPROACHES.includes(ap)) err(`${where}: approach ${ap} is not one of ${OVERLAY_APPROACHES.join(' ')}`); if (a === 'haggle' && ap !== 'money') err(`${where}: a haggle is money`); };
  const node = (id, where) => { if (!nodes[id]) { err(`${where}: the scene has no node "${id}"`); return null; } return nodes[id]; };

  const tagged = new Set();
  for (const t of o.tags) {
    const where = `tag line ${t.line}`;
    ability(t.ability, t.approach, where);
    if (t.want && !ID.test(t.want)) err(`${where}: want id ${t.want} is not a short lowercase id`);
    const n = node(t.node, where); if (!n) continue;
    const matches = n.choices.filter((c) => c.label === t.label);
    if (!matches.length) { err(`${where}: no choice in "${t.node}" has exactly the label "${t.label}" (labels are matched exactly: ${n.choices.map((c) => `"${c.label}"`).join(', ') || 'none'})`); continue; }
    if (matches.length > 1) err(`${where}: "${t.label}" appears more than once in "${t.node}"`);
    if (matches[0].skill !== 'social') err(`${where}: "${t.label}" is not a Social check, so it cannot be tagged as a push`);
    const key = `${t.node}|${t.label}`;
    if (tagged.has(key)) err(`${where}: "${t.label}" in "${t.node}" is tagged twice`); tagged.add(key);
  }
  for (const l of o.learns) { const where = `learn line ${l.line}`; node(l.node, where); person(l.person, where); fact(l.person, l.fact, where); }
  for (const b of o.bonds) { const where = `bond line ${b.line}`; node(b.node, where); person(b.person, where); if (Math.abs(b.delta) > 2) err(`${where}: a bond step is at most 2`); }
  for (const g of o.adds) {
    const gw = `add ${g.nodes.join(', ')}`;
    for (const id of g.nodes) node(id, gw);
    for (const w of g.wants) { person(w.person, `want line ${w.line}`); if (!ID.test(w.id)) err(`want line ${w.line}: want id ${w.id} is not a short lowercase id`); }
    const says = new Set();
    for (const p of g.pushes) {
      const where = `push line ${p.line}`;
      ability(p.ability, p.approach, where);
      if (p.ability === 'haggle') err(`${where}: new pushes are persuade, intimidate or bribe (haggle is only for tagged price choices)`);
      for (const k of ['great', 'ok', 'no']) node(p[k], where);
      for (const nd of p.needs) { if (nd.kind === 'know') { person(nd.person, where); fact(nd.person, nd.fact, where); } }
      if (p.say.split(/\s+/).length > 45) err(`${where}: the line is over 45 words`);
      if (says.has(p.say)) err(`${where}: two pushes say the same words`); says.add(p.say);
    }
  }
  return { errors, overlay: o };
}

/** Is the overlay empty (it would change nothing)? */
export const overlayIsEmpty = (o) => !o.tags.length && !o.learns.length && !o.bonds.length && !o.adds.length;
