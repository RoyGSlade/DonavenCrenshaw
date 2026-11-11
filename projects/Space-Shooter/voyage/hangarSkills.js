// The skill tree screen's rules: where each node sits on the tree, which
// connectors join them, what each skill does in plain words, and respec
// (taking points back out). Pure: no DOM. The skills themselves (names,
// trees, ranks, effects, needs) stay in core's data.js.
import { TREES, SKILLS, CURRENCY } from './data.js';
import { treePoints, spentPoints } from './character.js';
import { RESPEC, EFFECT_WORDS, SKILL_TREE_SHAPE } from './hangarData.js';

// --- Respec (Donaven: "unspend skill points if the player didn't read them first") ---
// Every refund is a full refund. Free while the tutorial runs. After it, a
// small credit fee per point taken back (hangarData.js RESPEC; ASSUMPTIONS.md R2-H3).
export { RESPEC };

const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
const TREE_NAME = Object.fromEntries(TREES.map((t) => [t.id, t.name]));

/** Does every learned skill still meet its tree requirement? (own ranks never count toward unlocking it) */
function needsHold(c) {
  for (const [id, rank] of Object.entries(c.skills || {})) {
    if (!rank) continue;
    const skill = SKILL.get(id);
    for (const [tree, need] of Object.entries(skill?.needs || {})) {
      const have = treePoints(c, tree) - (skill.trees.includes(tree) ? rank : 0);
      if (have < need) return { ok: false, blocker: skill };
    }
  }
  return { ok: true, blocker: null };
}

/** Can one rank of this skill be taken back? { ok, reason } in plain words. */
export function canUnlearn(c, skillId) {
  if (!c) return { ok: false, reason: 'Make a captain first.' };
  const rank = c.skills?.[skillId] || 0;
  if (!rank) return { ok: false, reason: 'Not learned yet.' };
  const after = unlearnRaw(c, skillId);
  const held = needsHold(after);
  if (!held.ok) return { ok: false, reason: `${held.blocker.name} needs these points. Take that back first.` };
  return { ok: true, reason: '' };
}

function unlearnRaw(c, skillId) {
  const skills = { ...c.skills };
  const rank = (skills[skillId] || 0) - 1;
  if (rank > 0) skills[skillId] = rank; else delete skills[skillId];
  return { ...c, skills };
}

/** The captain with one rank fewer (a full refund), or the same captain when it can't be done. */
export function unlearn(c, skillId) {
  return canUnlearn(c, skillId).ok ? unlearnRaw(c, skillId) : c;
}

/** Every skill refunded. */
export const respecAll = (c) => (c ? { ...c, skills: {} } : c);

/** What taking `points` back costs for this save: { money } (0 while the tutorial runs). */
export function respecCost(points, { tutorial = false } = {}, rule = RESPEC) {
  if (points <= 0 || (tutorial && rule.freeInTutorial)) return { money: 0 };
  return { money: points * rule.feePerPoint };
}

/** The whole-tree respec for a captain: { points, cost }. */
export function respecQuote(c, opts = {}, rule = RESPEC) {
  const points = spentPoints(c);
  return { points, cost: respecCost(points, opts, rule) };
}

// --- Plain words for effects ---------------------------------------------------------
const pct = (v) => `${Math.round(v * 100)}%`;

/** "+3% top speed" for one tag at one rank; unknown tags read as "+1 tag". */
export function effectWords(tag, value) {
  const words = EFFECT_WORDS[tag];
  return words ? words.replace('{pct}', pct(value)).replace('{v}', String(value)) : `+${value} ${tag}`;
}

/** A skill's effect per rank, and at the given rank, in plain words. */
export function skillWords(skill, rank = 0) {
  const per = Object.entries(skill.effects || {}).map(([tag, v]) => effectWords(tag, v));
  const now = rank ? Object.entries(skill.effects || {}).map(([tag, v]) => effectWords(tag, Math.round(v * rank * 1000) / 1000)) : [];
  const needs = Object.entries(skill.needs || {}).map(([t, n]) => `${n} point${n === 1 ? '' : 's'} in ${TREE_NAME[t] || t}`);
  return {
    perRank: per.join(', '),
    now: now.join(', '),
    needs: needs.length ? `Needs ${needs.join(' and ')} first.` : 'Open from the start.',
    cost: '1 skill point a rank',
    trees: skill.trees.map((t) => TREE_NAME[t] || t),
  };
}

// --- Layout: the tree as seen from straight above -----------------------------------
// The captain sits at the root in the middle. Helm, Guns and Wrench grow out
// as three great branches, 120 degrees apart, so every pair of trees is
// neighbours and a skill shared by two trees sits on the line between them,
// fed by both. Each ring out is one step deeper (a skill that needs 2 points
// in its tree sits on ring 3). Coordinates are in a [-1, 1] square.
export const TREE_ANGLES = SKILL_TREE_SHAPE.angles;

const ring = (skill) => 1 + Math.max(0, ...Object.values(skill.needs || {}));
const rad = (deg) => (deg * Math.PI) / 180;
function midAngle(a, b) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d / 2;
}

/**
 * { nodes: [{ id, x, y, ring, angle, trees }], edges: [{ from, to, trees }], branches: [{ tree, angle, x, y }] }
 * `from` may be 'root'. Pure and stable: the same data always lays out the same.
 */
export function treeLayout(trees = TREES, skills = SKILLS, { r0 = SKILL_TREE_SHAPE.r0, dr = SKILL_TREE_SHAPE.dr, spacing = SKILL_TREE_SHAPE.spacing } = {}) {
  const angles = Object.fromEntries(trees.map((t, i) => [t.id, TREE_ANGLES[t.id] ?? (-90 + (360 / trees.length) * i)]));
  const radius = (r) => r0 + (r - 1) * dr;
  // Group single-tree skills by tree and ring so siblings fan out around the branch.
  const groups = new Map();
  for (const s of skills) {
    const key = s.trees.length === 1 ? `${s.trees[0]}:${ring(s)}` : `shared:${[...s.trees].sort().join('+')}:${ring(s)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const nodes = [];
  for (const list of groups.values()) {
    list.forEach((s, i) => {
      const base = s.trees.length === 1 ? angles[s.trees[0]] : midAngle(angles[s.trees[0]], angles[s.trees[1]]);
      const r = ring(s);
      const R = radius(r);
      // Spread siblings by arc length so nodes keep the same gap on every ring.
      const offset = ((i - (list.length - 1) / 2) * spacing) / R;
      const a = rad(base) + offset;
      nodes.push({ id: s.id, ring: r, angle: (a * 180) / Math.PI, x: Math.cos(a) * R, y: Math.sin(a) * R, trees: [...s.trees] });
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const n of nodes) {
    for (const tree of n.trees) {
      // Feed from the nearest node of the same tree one ring in (single-tree nodes only), else the root.
      const inner = nodes.filter((m) => m.ring === n.ring - 1 && m.trees.length === 1 && m.trees[0] === tree);
      let from = 'root';
      if (inner.length) {
        inner.sort((p, q) => Math.hypot(p.x - n.x, p.y - n.y) - Math.hypot(q.x - n.x, q.y - n.y));
        from = inner[0].id;
      } else if (n.ring > 1) {
        // Deeper than the tree's last ring with nodes: walk inward until one is found.
        for (let r = n.ring - 2; r >= 1 && from === 'root'; r--) {
          const deeper = nodes.filter((m) => m.ring === r && m.trees.length === 1 && m.trees[0] === tree);
          if (deeper.length) {
            deeper.sort((p, q) => Math.hypot(p.x - n.x, p.y - n.y) - Math.hypot(q.x - n.x, q.y - n.y));
            from = deeper[0].id;
          }
        }
      }
      edges.push({ from, to: n.id, trees: [tree] });
    }
  }
  const branches = trees.map((t) => ({ tree: t.id, angle: angles[t.id], x: Math.cos(rad(angles[t.id])) * (radius(4) + 0.15), y: Math.sin(rad(angles[t.id])) * (radius(4) + 0.15) }));
  return { nodes, edges, branches, byId };
}

export { CURRENCY };
