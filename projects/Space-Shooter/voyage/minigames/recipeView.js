// The recipe runner on screen: the steps of the craft as chips (done with their grade, now, waiting), the roll's and every skill
// point's effect in plain words, the game itself, a grade card after each game (pass, or redo on a fresh sheet and what it spoiled),
// and the result card at the end (grades, spoils, material with the bank line, stars, XP). The pure rules are craftChain.js.
import { current, submit, partLine, KIND_NAME, MAX_REDOS } from './craftChain.js';
import { createCut, cutWhy } from './cut.js';
import { createScrew, screwWhy } from './screw.js';
import { createBend, bendWhy } from './bend.js';
import { playCut } from './cutView.js';
import { playScrew } from './screwView.js';
import { playBend } from './bendView.js';
import { h, ensureStyle, effectChips, chipList, gradeCard } from './craftChainView.js';

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * `state` is a craftChain recipe state (createRecipe). Plays every game of it in `root`; `onProgress(state)` is called after each
 * game is handed in (the bench keeps the part-made item between steps from it). Resolves with the craft's result.
 */
export async function playRecipe(root, { state, unit = 'scrap', onProgress = () => {}, reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const steps = h('ol', { class: 'cc-steps', 'aria-label': 'Steps of this craft' });
  const spoil = h('p', { class: 'cc-spoil', 'data-spoils': '0' });
  const chips = h('div', { class: 'cc-chipbox' });
  const stage = h('div', { class: 'cc-stage' });
  const head = h('p', { class: 'rp-eyebrow ui-nameplate', text: `${s.recipe.name.toUpperCase()} · ${s.label.toUpperCase()} ROLL` });
  const wrap = h('section', { class: 'cc-recipe', 'data-recipe': s.recipe.id }, head, steps, spoil, stage, chips);
  root.append(wrap);

  const drawHeader = () => {
    steps.replaceChildren(...s.list.map((g, i) => {
      const done = s.grades.find((x, k) => k === i);
      const now = i === s.i && !s.done;
      return h('li', { class: `cc-step${done ? ' is-done' : ''}${now ? ' is-now' : ''}`, 'data-kind': g.kind, 'data-state': done ? 'done' : now ? 'now' : 'wait' },
        h('b', { text: `${i + 1}. ${KIND_NAME[g.kind]}` }), h('span', { text: done ? `${Math.round(done.grade)}${done.attempts > 1 ? ` (try ${done.attempts})` : ''}` : now ? (s.attempt ? `redo ${s.attempt}` : 'now') : 'waiting' }));
    }));
    const exact = r2(s.recipe.materials * s.materialFactor * (1 + 0.1 * s.spoils));
    spoil.dataset.spoils = String(s.spoils);
    spoil.textContent = `${s.spoils ? `${s.spoils} spoiled (+${s.spoils * 10}% scrap)` : 'Nothing spoiled yet'} · scrap so far ${exact}${s.materialFactor < 1 ? ' (your Material points help)' : ''} · two redos a game, a third fail ruins it`;
  };

  while (!s.done) {
    drawHeader();
    const cur = current(s);
    chips.replaceChildren(chipList(effectChips(cur.kind, cur.setup)));
    const what = cur.kind === 'cut' ? 'plate' : cur.kind === 'bend' ? s.recipe.what : 'bolt';
    const game = cur.kind === 'cut' ? createCut({ seed: cur.seed, setup: cur.setup }) : cur.kind === 'bend' ? createBend({ seed: cur.seed, setup: cur.setup }) : createScrew({ setup: cur.setup });
    stage.replaceChildren();
    const result = await (cur.kind === 'cut' ? playCut : cur.kind === 'bend' ? playBend : playScrew)(stage, { state: game, what, reducedMotion });
    const outcome = submit(s, result.grade);
    onProgress(s);
    drawHeader();
    const why = cur.kind === 'cut' ? cutWhy(result) : cur.kind === 'bend' ? bendWhy(result) : screwWhy(result);
    await new Promise((resolve) => {
      const { card } = gradeCard({ kind: cur.kind, grade: result.grade, why, passed: outcome === 'passed', redoNo: s.attempt, redosAllowed: MAX_REDOS, last: outcome === 'ruined', onGo: resolve,
        goText: outcome === 'passed' ? (s.done ? 'See the result' : `Next: ${KIND_NAME[s.list[s.i].kind]}`) : outcome === 'ruined' ? 'See the result' : 'Redo on a fresh sheet' });
      stage.append(card); card.scrollIntoView?.({ block: 'nearest' }); card.querySelector('button')?.focus({ preventScroll: true });
    });
  }

  drawHeader();
  stage.replaceChildren(); chips.replaceChildren();
  const r = s.result;
  const stars = r.success ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : 'RUINED';
  const go = h('button', { type: 'button', class: 'primary ui-btn cc-go', text: r.success ? 'Continue' : 'Step back' });
  const gradesLine = r.grades.map((g) => `${KIND_NAME[g.kind]} ${Math.round(g.grade)}${g.attempts > 1 ? ` (try ${g.attempts})` : ''}`).join(' · ');
  const card = h('div', { class: `rp-result ui-card cc-final ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'made' : 'ruined', 'data-stars': String(r.stars) },
    h('b', { class: 'rp-stars', text: stars }),
    h('span', { class: 'cc-line', 'data-line': 'grades', text: r.success ? `${gradesLine} · average ${r2(r.average)}` : `${gradesLine || 'No game passed'} · the ${r.what} is ruined, no part and no XP.` }),
    r.success ? h('span', { class: 'cc-line', 'data-line': 'quality', text: `Quality ${r.quality}: the average ${r2(r.average)}${r.qualityBonus ? ` + ${r.qualityBonus} from your Quality points` : ''}${r.quality >= 100 ? ' (100 at most)' : ''}. Stars at 65 and 90.` }) : null,
    h('span', { class: 'cc-line', 'data-line': 'spoils', text: r.spoils ? `Spoils: ${r.spoils}, each +10% material (${r.history.filter((x) => x.grade < 70).map((x) => `${KIND_NAME[x.kind]} ${Math.round(x.grade)}`).join(', ')})` : 'No spoils: not a scrap wasted.' }),
    h('span', { class: 'cc-line cc-mat', 'data-line': 'material', text: `${unit}: ${r.materials} used (${r2(r.materialsExact)} exact), ${r2(r.bank)} banked for the next craft${r.materialFactor < 1 ? `; your Material points cut the recipe's ${r.recipeMaterials} by ${Math.round((1 - r.materialFactor) * 100)}%` : ''}` }),
    r.success ? h('span', { class: 'cc-line', 'data-line': 'time', text: `${r.buildSeconds}s build · +${r.xp} Crafting XP (placeholder: 2, +1 a game, +1 a star over the first)` }) : null, go);
  await new Promise((resolve) => { go.addEventListener('click', resolve); stage.append(card); go.focus({ preventScroll: true }); card.scrollIntoView?.({ block: 'nearest' }); });
  onProgress(s);
  wrap.remove();
  return r;
}

export { partLine };
