// The unscanned-progress chip and the level-up point picker, drawn from the pure
// modules (progress.js, picker.js). Plain DOM, no art. `ctx` is the owner of the
// state: { get(): { progress, snap, selected }, set(patch) } (the dev page keeps it in memory;
// the game would keep it in the save and the server).
import { ROLL_SKILLS } from '../data.js';
import { unscanned, riskLine, riskTone, xpToNext } from './progress.js';
import { CATEGORIES, describeSkill, unspent, addPoint, removePoint, cleanSkillPoints, spent } from './picker.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };

/** The chip: tone-coloured one-liner, then one row per skill that moved. */
export function renderRisk(root, { progress, snap }) {
  const u = unscanned(progress, snap);
  const chip = h('div', { class: `ex-chip is-${riskTone(u)}`, 'data-tone': riskTone(u), role: 'status' }, h('b', { text: u.safe ? 'SCANNED' : 'UNSCANNED' }), h('span', { text: riskLine(u) }));
  const list = h('ul', { class: 'ex-risk' });
  for (const r of u.rows) list.append(h('li', {}, h('b', { text: r.name }), h('span', { text: r.levelsGained ? `level ${r.fromLevel} to ${r.toLevel}, ${r.xpGained} XP` : `${r.xpGained} XP` })));
  root.replaceChildren(chip, list);
  return u;
}

/** The skill list: level, a bar to the next level, and a badge when points are waiting. */
export function renderSkills(root, { progress, selected }, onSelect) {
  const ul = h('ul', { class: 'ex-skills', role: 'listbox', 'aria-label': 'Skills' });
  for (const s of ROLL_SKILLS) {
    const lvl = progress.levels[s.id], into = progress.xp[s.id], need = xpToNext(lvl, progress.curve);
    const left = CATEGORIES[s.id] ? unspent(s.id, progress.points[s.id], lvl) : 0;
    const li = h('li', {});
    const b = h('button', { type: 'button', role: 'option', 'aria-selected': String(s.id === selected), class: `ex-skill${s.id === selected ? ' is-sel' : ''}`, 'data-skill': s.id },
      h('b', { text: s.name }), h('span', { text: `Lv ${lvl}` }),
      h('i', { class: 'ex-bar' }, h('u', { style: `width:${Number.isFinite(need) ? Math.round((100 * into) / need) : 100}%` })),
      left ? h('em', { class: 'ex-badge', text: `${left} point${left === 1 ? '' : 's'}` }) : null);
    b.addEventListener('click', () => onSelect(s.id));
    li.append(b); ul.append(li);
  }
  root.replaceChildren(ul);
}

/** The picker for one skill: +/- per category, live numbers, and a line saying what is left. */
export function renderPicker(root, { progress, selected, inGym = false, canTakeBack = true }, onPoints) {
  const skill = selected, level = progress.levels[skill], points = cleanSkillPoints(skill, progress.points[skill], level);
  const def = CATEGORIES[skill];
  const left = unspent(skill, points, level);
  const head = h('div', { class: 'ex-pick-head' }, h('h3', { text: ROLL_SKILLS.find((s) => s.id === skill).name }),
    h('p', { class: 'ex-left', 'data-left': left, text: left ? `${left} point${left === 1 ? '' : 's'} to spend` : `All ${spent(points)} point${spent(points) === 1 ? '' : 's'} spent` }));
  const list = h('ul', { class: 'ex-cats' });
  for (const d of describeSkill(skill, points, level)) {
    const minus = h('button', { type: 'button', class: 'ex-step', 'aria-label': `Take a point out of ${d.name}`, text: '−' });
    const plusB = h('button', { type: 'button', class: 'ex-step primary', 'aria-label': `Put a point into ${d.name}`, text: '+', 'data-cat': d.id });
    minus.disabled = d.points === 0 || !canTakeBack; plusB.disabled = !d.canAdd;
    if (!canTakeBack) minus.hidden = true; // spent points stay spent (a respec has its own rules)
    minus.addEventListener('click', () => onPoints(skill, removePoint(skill, points, level, d.id)));
    plusB.addEventListener('click', () => onPoints(skill, addPoint(skill, points, level, d.id)));
    list.append(h('li', { class: 'ex-cat', 'data-cat': d.id },
      h('div', { class: 'ex-cat-top' }, h('b', { text: d.name }), h('span', { class: 'ex-pts', text: `${d.points} / 9` }), minus, plusB),
      h('p', { class: 'ex-now', text: `Now: ${d.now}` }),
      d.next ? h('p', { class: 'ex-next', text: d.nextChange ? `One more: no change yet. Next change at ${d.nextChange.at} points.` : `One more: ${d.next}` }) : h('p', { class: 'ex-next', text: 'At the most.' })));
  }
  root.replaceChildren(head, list, h('p', { class: 'rp-help', text: inGym ? (def?.built ? 'Train with these numbers just below.' : 'This skill\'s minigame is planned; the numbers are the plan\'s.') : def?.built ? 'You can try these numbers now in the minigame preview.' : 'This skill\'s minigame is planned; the numbers are the plan\'s.' }));
}
