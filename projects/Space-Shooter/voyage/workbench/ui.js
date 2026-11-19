// The workbench room's panels, plain DOM drawn from the pure modules (state.js, the minigames' progress, picker and gym).
// Each render* fills an element and calls the handlers it is given; nothing here keeps state of its own.
import { renderRisk, renderSkills, renderPicker } from '../minigames/extrasView.js';
import { riskLine, unscanned } from '../minigames/progress.js';
import { GYM, gymGamesFor, gymLoadout, gymSetup, gymXp, leftThisHour, canTrain } from '../minigames/gym.js';
import { DCS } from './state.js';

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};
const button = (text, onClick, { primary = false, ...attrs } = {}) => { const b = h('button', { type: 'button', class: primary ? 'primary' : '', ...attrs, text }); b.addEventListener('click', onClick); return b; };

/** The always-on chip: what a death costs right now, and the test credits. Returns the tone for tests. */
export function renderHud(root, state) {
  const u = unscanned(state.progress, state.snap);
  root.dataset.tone = u.safe ? 'safe' : u.points > 0 ? 'high' : 'low';
  root.replaceChildren(h('b', { text: u.safe ? 'SCANNED' : 'UNSCANNED' }), h('span', { text: riskLine(u) }), h('i', { text: `${state.credits} credits · check ${state.dc} · ${state.items?.['good-cutter'] ? 'good cutter: 15 wide' : 'worn cutter: 9 wide'}` }));
  return u;
}

/** The skills board on the wall: the live risk chip, every skill with its level and XP bar, and the test dials. */
export function renderBoard(root, state, { onDc, onCredits, onClose, selected = null, onSelect = () => {} }) {
  const riskBox = h('div', { class: 'wb-risk' }), skillBox = h('div', { class: 'wb-skills' });
  renderRisk(riskBox, { progress: state.progress, snap: state.snap });
  renderSkills(skillBox, { progress: state.progress, selected }, onSelect);
  const xpLine = (id) => `${state.progress.xp[id]} XP into level ${state.progress.levels[id]}`;
  skillBox.querySelectorAll('.ex-skill').forEach((b) => b.setAttribute('title', xpLine(b.dataset.skill)));
  root.replaceChildren(
    h('p', { class: 'rp-help wb-said', role: 'status', text: state.said }),
    riskBox,
    h('h3', { class: 'gm-h', text: 'Skills' }), skillBox,
    h('p', { class: 'rp-help', text: `Died ${state.deaths} time${state.deaths === 1 ? '' : 's'} · scanned ${state.scans} time${state.scans === 1 ? '' : 's'} · ${state.xpPaid} XP paid in all.` }),
    h('div', { class: 'gm-row wb-dials' },
      button(`Check difficulty: ${state.dc}`, onDc, { class: 'wb-dc', 'data-dc': state.dc, 'aria-label': `Check difficulty ${state.dc}. Tap to change to ${DCS[(DCS.indexOf(state.dc) + 1) % DCS.length]}.` }),
      button('+50 test credits', onCredits, { class: 'wb-credits' }),
      button('Close', onClose)));
}

/** The holodeck gym trainer: pick a skill, spend its points, then train its games at a Steady roll for credits. */
export function renderGymPanel(root, state, { selected, now, onSelect, onPoints, onTrain, onClose }) {
  const skillBox = h('div', { class: 'gm-skills' }), pickBox = h('div', { class: 'gm-pick' });
  renderSkills(skillBox, { progress: state.progress, selected }, onSelect);
  renderPicker(pickBox, { progress: state.progress, selected, inGym: true }, onPoints);
  const { level, points } = gymLoadout(state.progress, selected);
  const games = gymGamesFor(selected);
  const cards = games.map((g) => {
    const setup = gymSetup(g.id, { level, points });
    const left = leftThisHour(state.gymLog, g.skill, now);
    const can = canTrain(g.id, { credits: state.credits });
    return h('li', { class: 'gm-card', 'data-game': g.id },
      h('b', { text: g.name }),
      h('span', { class: 'gm-skill', text: `${g.skill}, always a ${setup.label} roll, with the points you have spent` }),
      h('span', { text: `A win pays a quarter of the field XP (a job that pays 8 pays ${gymXp(8)}). ${left} of ${GYM.capXp} XP left this hour.` }),
      h('div', { class: 'gm-row' }, button(`Train (${GYM.cost} credits)`, () => onTrain(g.id), { class: 'wb-train', 'data-game': g.id, disabled: !can.ok, title: can.reason })));
  });
  root.replaceChildren(
    h('p', { class: 'bn-day', role: 'status', id: 'gm-wallet', text: `You have ${state.credits} credits. Spend your points here, then train with them. No job is at risk.` }),
    skillBox, pickBox,
    h('h3', { class: 'gm-h', text: `Train ${selected}` }),
    cards.length ? h('ul', { class: 'gm-list' }, ...cards) : h('p', { class: 'rp-help', text: `${selected[0].toUpperCase()}${selected.slice(1)} has no mini-game, so there is nothing to train. You can still spend its points.` }),
    h('p', { class: 'rp-help wb-said', role: 'status', text: state.said }),
    h('div', { class: 'gm-row' }, button('Close', onClose)));
}

/** A yes/no sheet that shows what is at stake (the risk chip) before a destructive test button. */
export function renderConfirm(root, state, { question, yes, onYes, onNo, showRisk = true }) {
  const box = h('div', { class: 'wb-risk' });
  if (showRisk) renderRisk(box, { progress: state.progress, snap: state.snap });
  root.replaceChildren(
    h('p', { class: 'bn-day', text: question }), box,
    h('div', { class: 'gm-row' }, button(yes, onYes, { primary: true, class: 'wb-yes primary' }), button('Not now', onNo, { class: 'wb-no' })));
}

/** The hacking bench's place picker: a failed hack answers by where you were. */
export function renderWhere(root, { onPick, onClose }) {
  const rows = [['foot', 'On foot, at a terminal', 'A failed hack locks the terminal: find a new one.'], ['ship', "A ship's port", 'A failed hack closes the port: find another way in.'], ['combat', 'Ship to ship combat', 'A failed hack seals that section: target a new one.']];
  root.replaceChildren(
    h('p', { class: 'bn-day', text: 'Pick where this hack happens. Win and nothing changes. Lose every retry and security is alerted, then the place answers:' }),
    ...rows.map(([id, name, what]) => h('div', { class: 'gm-row wb-where' }, button(name, () => onPick(id), { class: id === 'foot' ? 'primary wb-w' : 'wb-w', 'data-where': id, primary: id === 'foot' }), h('span', { class: 'rp-help', text: what }))),
    h('div', { class: 'gm-row' }, button('Not now', onClose)));
}

/** The sparring picker: how many marauders, then start. */
export function renderSparPicker(root, { count, onCount, onStart, onClose }) {
  root.replaceChildren(
    h('p', { class: 'bn-day', text: 'A sparring ring with Cinder Reavers, the same fighters and rules as the corridor fight. Clear the ring, or walk out by the marked lane. Shooting has no mini-game, so its XP comes from here: 2 a kill, 2 more for a clear ring.' }),
    h('div', { class: 'gm-row wb-count' }, ...[1, 2, 3, 4].map((n) => button(`${n} marauder${n === 1 ? '' : 's'}`, () => onCount(n), { class: n === count ? 'primary wb-n is-on' : 'wb-n', 'data-n': n, 'aria-pressed': String(n === count) }))),
    h('div', { class: 'gm-row' }, button('Start the fight', onStart, { class: 'primary wb-start', primary: true }), button('Not now', onClose)));
}

/** The repair bench's menu: the coolant line, or the assembly job (rebuild a broken unit piece by piece and bolt it down). */
export function renderRepairMenu(root, { onPick, onClose }) {
  const items = [
    ['coolant', 'Coolant line', 'Turn the pipes so the coolant reaches the valve with no open ends. No clock, only leaks.'],
    ['assembly', 'Assembly: rebuild a unit', 'Fit each part to its socket, turn it right, bolt it down with the screwdriver. Beat the clock or the unit stays broken.'],
  ];
  root.replaceChildren(
    h('p', { class: 'bn-day', text: 'One d20 roll sets how rough or smooth the job is. Your Repair points work in both.' }),
    ...items.map(([id, name, what]) => h('div', { class: 'wb-craftrow' }, button(name, () => onPick(id), { class: 'wb-c wb-r', 'data-repair': id }), h('span', { class: 'rp-help', text: what }))),
    h('div', { class: 'gm-row' }, button('Not now', onClose, { class: 'wb-no' })));
}

/** The crafting bench's menu: the chain's games and recipe, the older heat-and-shape game, the cutter's grade, and a part left in hand. */
export function renderCraftMenu(root, { part = null, partWords = '', tool = 'shop', onPick, onTool, onClose }) {
  const items = [
    ['cut', 'Cut a plate', 'Cut: drag the blade round the outline. One game, about 20 seconds.'],
    ['screw', 'Drive a bolt', 'Screw: circle the bolt head, stop in the green. One game, about 15 seconds.'],
    ['bolt-plate', 'Bolt plate', 'Cut the plate, then bolt it down. Two games, one roll, a part kept between them.'],
    ['heat', 'Old: heat and shape', 'The older game: heat the stock, then tap the tools in order.'],
  ];
  root.replaceChildren(
    h('p', { class: 'bn-day', text: 'One d20 roll sets how rough or smooth the whole craft is.' }),
    ...(part ? [ h('div', { class: 'wb-part' }, button(`Pick up your part`, () => onPick('resume'), { class: 'primary wb-c', 'data-craft': 'resume', primary: true }), h('span', { class: 'rp-help', text: partWords }))] : []),
    ...items.map(([id, name, what]) => h('div', { class: 'wb-craftrow' }, button(name, () => onPick(id), { class: 'wb-c', 'data-craft': id }), h('span', { class: 'rp-help', text: what }))),
    h('h3', { class: 'gm-h', text: 'Your cutter' }),
    h('div', { class: 'gm-row wb-tools' }, ...['worn', 'shop', 'good'].map((t) => button(`${t[0].toUpperCase()}${t.slice(1)} cutter: ${({ worn: 'thin', shop: 'normal', good: 'wide' })[t]} line`, () => onTool(t), { class: t === tool ? 'primary wb-t is-on' : 'wb-t', 'data-tool': t, 'aria-pressed': String(t === tool) }))),
    h('p', { class: 'rp-help', text: 'A wider line is easier to stay inside. The good cutter is the one you earn, not the shop one.' }),
    h('div', { class: 'gm-row' }, button('Not now', onClose, { class: 'wb-no' })));
}
