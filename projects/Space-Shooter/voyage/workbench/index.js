// The workbench room's page controller. boot.js hands it the pieces the page already has (the save, the story bus, the dialogue
// box, the on-foot layer, the minigame sheet's elements) and gets back the hooks to plug into createOnFoot:
//   openStation(id)  a "wb-*" station interact (the nine games, the practice lock, the board, scan, reprint, gym, spar, reset)
//   stationInfo(id)  its name and prompt words for the interact marks
//   talk(who)        Tull, Nessa and Pip's test conversations (a promise), with the social checks
// Everything real is reused: the d20 is character.check() through the dice tray (bus 'roll:attempt'), the games are the
// skinned mini-games through games.js, XP is state.js earnXp (the same cap and curve as the scene hooks), the fight is
// onfoot.fight() with the marauder type. State lives in state.js's own storage key; levels are mirrored into the test
// captain's save so the rest of the page sees them. Nothing here edits quest data, the engine, the player or the maps list.
import { loadState, saveState, characterOf, earnXp, setPoints, scan, die, reset, nextDc, withCredits, freshState } from './state.js';
import { STATIONS, stationOfProp, rollStation, startStation, settleStation, previewLine, loadoutOf } from './stations.js';
import { playGame, resetCraftBank } from './games.js';
import { TALKS, nextAfterCheck } from './talks.js';
import { sparSetup, sparXp, sparSaid } from './spar.js';
import { branchOf } from '../minigames/sceneHook.js';
import { gymGame, trainRun, gymLoadout, gymSetup } from '../minigames/gym.js';
import { checkChance, checkBonusText } from '../character.js';
import { tierInfo } from '../minigames/setup.js';
import { ROLL_SKILLS } from '../data.js';
import { renderHud, renderBoard, renderGymPanel, renderConfirm, renderSparPicker, renderWhere, h } from './ui.js';

const SKILL_NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));
const OTHERS = {
  lock: { name: 'Practice lock', prompt: 'Practice lock: no clock, no XP' },
  board: { name: 'Skills board', prompt: 'Skills board: levels, XP and risk' },
  scan: { name: 'Scan station', prompt: 'Scan station: save your progress' },
  reprint: { name: 'Reprint pod', prompt: 'Reprint pod: die and come back' },
  gym: { name: 'Gym trainer', prompt: 'Gym trainer: spend points, then train' },
  spar: { name: 'Sparring rack', prompt: 'Sparring ring: fight a marauder' },
  reset: { name: 'Reset cart', prompt: 'Reset cart: a fresh test state' },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * { store, bus, onfoot, dialogueBox, sheet: { root, eyebrow, title, stage }, hud (an empty element), toast, reducedMotion(), sound(id),
 *   onBusy(on), storage, rng, seed }. Returns { openStation, stationInfo, talk, get state, rng, ... } (also what the tests drive).
 */
export function createWorkbench({ store, bus, onfoot, dialogueBox, sheet, hud, toast = () => {}, reducedMotion = () => false, sound = () => {}, onBusy = () => {}, storage = globalThis.localStorage, rng = Math.random, seed = null }) {
  let state = loadState(storage);
  let busy = 0;
  let gymSkill = 'repair', boardSkill = null, sparCount = 2;
  let leave = null; // resolves the game in progress when the player leaves it
  let seedCounter = 0;
  const api = { rng, openPanel: null };
  const hold = (on) => { busy = Math.max(0, busy + (on ? 1 : -1)); onBusy(busy > 0); };
  const nextSeed = () => (seed != null ? seed + seedCounter++ : (Date.now() % 100000) + seedCounter++);

  // ---- state ------------------------------------------------------------------------------------------------------
  const mirror = () => { try { store.update((s) => (s.character ? { ...s, character: { ...s.character, levels: { ...state.progress.levels } } } : s)); } catch { /* the page's save is a convenience here */ } };
  function commit(next, { silent = false } = {}) {
    state = next;
    saveState(state, storage);
    mirror();
    renderHud(hud, state);
    api.openPanel?.draw?.();
    if (!silent && state.said) toast(state.said);
  }
  renderHud(hud, state);
  mirror();

  // ---- the sheet ----------------------------------------------------------------------------------------------------
  const body = document.body;
  function showSheet(on, { word = '', titleText = '' } = {}) {
    sheet.root.hidden = !on;
    body.classList.toggle('hg-sheet-open', on);
    if (on) body.dataset.sheetSide = 'right'; else delete body.dataset.sheetSide;
    sheet.root.classList.remove('is-fit');
    hud.hidden = on;
    if (on) { sheet.eyebrow.textContent = word; sheet.title.textContent = titleText; }
  }
  /** A panel in the sheet (board, gym, a question): `draw(pane)` re-renders it whenever the state changes. */
  function openPanel(word, titleText, draw) {
    sheet.stage.replaceChildren();
    const pane = h('div', { class: 'vy-pane wb-pane' });
    sheet.stage.append(pane);
    showSheet(true, { word, titleText });
    hold(true);
    const panel = { pane, draw: () => draw(pane), close() { if (api.openPanel !== panel) return; api.openPanel = null; sheet.stage.replaceChildren(); showSheet(false); hold(false); } };
    api.openPanel = panel;
    panel.draw();
    return panel;
  }
  const closePanel = () => api.openPanel?.close();

  /** The d20 tray shows the roll with the preview line, then the sheet opens the game. Resolves with the game's result (or null when left). */
  async function rollAndPlay(station, { who, what, open, best, lock, titleText, context } = {}) {
    const attemptState = state;
    const attempt = rollStation(attemptState, station, api.rng);
    const start = startStation(attemptState, station, attempt);
    bus.emit('roll:attempt', { ...attempt, who: 'You', label: `${SKILL_NAME[station.skill]} attempt · ${station.id}`, preview: previewLine(start) });
    sound('talk');
    await wait(reducedMotion() ? 500 : 1700);
    return playStart(station, start, { who, what, open, best, lock, titleText, context });
  }
  async function playStart(station, start, { who, what, open, best, lock, titleText, word, context } = {}) {
    sheet.stage.replaceChildren();
    const note = h('p', { class: 'rp-help wb-preview', text: start.preview ? `${start.preview.line} ${start.preview.nextLine}` : '' });
    const stage = h('div', { class: 'wb-stage' });
    const leaveBtn = h('button', { type: 'button', class: 'wb-leave', text: 'Leave this game' });
    sheet.stage.append(note, stage, leaveBtn);
    showSheet(true, { word: word || `${station.word} · ${tierInfo(start.tier).label.toUpperCase()} ROLL`, titleText: titleText || station.title });
    sheet.root.classList.toggle('is-fit', station.id === 'haggle');
    hold(true);
    const left = new Promise((resolve) => { leave = () => resolve(null); leaveBtn.addEventListener('click', leave); });
    let result;
    try { result = await Promise.race([playGame(stage, station.id, { seed: nextSeed(), setup: start.setup, title: titleText || station.title, who: who || station.who, what: what || station.what, open: open ?? station.open, best: best ?? station.best, lock: lock ?? station.lock, context, sound: () => {}, reducedMotion }), left]); }
    catch (error) { console.warn('Stardust workbench: the game could not run', error); result = null; }
    leave = null;
    sheet.stage.replaceChildren();
    showSheet(false);
    hold(false);
    return result;
  }

  // ---- stations -----------------------------------------------------------------------------------------------------
  /** The hacking bench asks where this hack is, because a failure answers by place (terminal locks, port closes, section changes). */
  const chooseWhere = () => new Promise((resolve) => {
    openPanel('HACKING BENCH', 'Where is this hack?', (pane) => renderWhere(pane, { onPick: (w) => { closePanel(); resolve(w); }, onClose: () => { closePanel(); resolve(null); } }));
  });
  async function useStation(station) {
    let context;
    if (station.id === 'hack') { context = await chooseWhere(); if (!context) return; }
    const result = await rollAndPlay(station, { context });
    if (!result) { toast('You left the game. No XP.'); return; }
    commit(settleStation(state, station, result).state);
  }

  async function practice() {
    sheet.stage.replaceChildren();
    const stage = h('div', { class: 'wb-stage' });
    const leaveBtn = h('button', { type: 'button', class: 'wb-leave', text: 'Leave this game' });
    sheet.stage.append(h('p', { class: 'rp-help wb-preview', text: 'A dummy lock: 3 tumblers, no clock, no trace, no XP. It never trips, so try the ring as long as you like.' }), stage, leaveBtn);
    showSheet(true, { word: 'BYPASS · PRACTICE', titleText: 'Practice lock' });
    hold(true);
    const left = new Promise((resolve) => { leave = () => resolve(null); leaveBtn.addEventListener('click', leave); });
    try { await Promise.race([playGame(stage, 'practice', { seed: nextSeed(), sound: () => {}, reducedMotion }), left]); } catch (error) { console.warn('Stardust workbench: the practice lock could not run', error); }
    leave = null; sheet.stage.replaceChildren(); showSheet(false); hold(false);
    commit({ ...state, said: 'Practice lock done. It pays nothing and risks nothing.' }, { silent: true });
  }

  const openBoard = () => openPanel('SKILLS BOARD', 'Levels, XP and risk', (pane) => renderBoard(pane, state, {
    selected: boardSkill, onSelect: (id) => { boardSkill = id; api.openPanel?.draw(); },
    onDc: () => commit(nextDc(state), { silent: true }), onCredits: () => commit(withCredits(state, state.credits + 50, '+50 test credits.'), { silent: true }), onClose: closePanel,
  }));

  async function train(id) {
    const g = gymGame(id);
    const { level, points } = gymLoadout(state.progress, g.skill);
    const setup = gymSetup(id, { level, points });
    closePanel();
    const station = STATIONS.find((s) => s.id === id);
    const start = { station, tier: 0, setup, level, points, preview: null };
    const result = await playStart(station, start, { word: `${station.word} · GYM · STEADY ROLL`, titleText: `Gym: ${g.name}`, lock: id === 'hack' ? 1 : undefined });
    if (result) {
      const r = trainRun(id, { credits: state.credits, log: state.gymLog, now: Date.now(), result });
      let next = { ...state, credits: r.credits, gymLog: r.log };
      next = earnXp(next, g.skill, r.paid).state;
      commit({ ...next, said: r.said });
    } else commit({ ...state, said: 'You left the gym game. No XP, no fee.' }, { silent: true });
    openGym();
  }
  const openGym = () => openPanel('HOLODECK GYM', 'Spend points, then train', (pane) => renderGymPanel(pane, state, {
    selected: gymSkill, now: Date.now(), onSelect: (id) => { gymSkill = id; api.openPanel?.draw(); },
    onPoints: (skill, pts) => commit(setPoints(state, skill, pts), { silent: true }), onTrain: (id) => train(id), onClose: closePanel,
  }));

  function doScan() { commit(scan(state)); }
  const confirmDie = () => openPanel('REPRINT POD', 'Die and reprint?', (pane) => renderConfirm(pane, state, {
    question: 'This is what you would lose. Skills go back to your last scan. Everything earned since is gone.', yes: 'Die and reprint',
    onYes: () => { const r = die(state); closePanel(); commit(r.state); }, onNo: closePanel,
  }));
  const confirmReset = () => openPanel('RESET CART', 'Back to a fresh test state?', (pane) => renderConfirm(pane, state, {
    question: 'Every skill goes back to level 1, points and credits are cleared, and you are scanned at the start.', yes: 'Reset everything', showRisk: false,
    onYes: () => { resetCraftBank(); closePanel(); commit(reset()); }, onNo: closePanel,
  }));

  function openSpar() {
    openPanel('SPARRING RING', 'Fight a marauder', (pane) => renderSparPicker(pane, {
      count: sparCount, onCount: (n) => { sparCount = n; api.openPanel?.draw(); }, onClose: closePanel,
      onStart: async () => {
        closePanel();
        try {
          const r = await onfoot.fight(sparSetup({ count: sparCount, seed: nextSeed() }));
          const xp = sparXp(r);
          let next = earnXp(state, 'shooting', xp).state;
          commit({ ...next, said: sparSaid(r, xp) });
        } catch (error) { console.warn('Stardust workbench: the fight could not run', error); }
      },
    }));
  }

  async function openStation(id) {
    if (api.openPanel) return;
    const key = String(id).replace(/^wb-/, '');
    const station = stationOfProp(`wb-${key}`);
    if (station) return useStation(station);
    switch (key) {
      case 'lock': return practice();
      case 'board': openBoard(); break;
      case 'scan': doScan(); break;
      case 'reprint': confirmDie(); break;
      case 'gym': openGym(); break;
      case 'spar': openSpar(); break;
      case 'reset': confirmReset(); break;
      default: return;
    }
    // A panel keeps the interact busy until it is closed (the floor holds still meanwhile); a scan has no panel and is done.
    if (!api.openPanel) return;
    await new Promise((resolve) => { const t = setInterval(() => { if (!api.openPanel && busy === 0) { clearInterval(t); resolve(); } }, 120); });
  }

  const stationInfo = (id) => {
    const key = String(id).replace(/^wb-/, '');
    const s = STATIONS.find((x) => x.id === key);
    if (s) return { name: s.name, prompt: `${s.name}: roll the d20, play, get XP`, who: null, locked: false };
    return OTHERS[key] ? { ...OTHERS[key], who: null, locked: false } : null;
  };

  // ---- conversations ------------------------------------------------------------------------------------------------
  let asking = null;
  bus.on('story:choose', (d) => { if (!asking) return; const a = asking; asking = null; a(Number(d?.index)); });
  const ask = (options) => new Promise((resolve) => { asking = resolve; dialogueBox.showChoices({ options }); });
  async function talk(who) {
    const tree = TALKS[who];
    if (!tree) return null;
    hold(true);
    try {
      let id = tree.start;
      while (id) {
        const node = tree.nodes[id];
        dialogueBox.show({ seq: `wb-${Date.now()}`, speaker: node.speaker, name: node.name, text: node.text, emotion: node.emotion, durationMs: 60000 });
        const social = { skill: 'social', stat: 'cha', tag: 'talk', dc: state.dc };
        const options = (node.choices || []).map((c, index) => (c.check
          ? { index, label: c.label, kind: 'attempt', roll: checkBonusText(characterOf(state), social), dc: state.dc, chance: checkChance(characterOf(state), social) }
          : { index, label: c.label }));
        const picked = node.choices?.length ? await ask(options) : -1;
        const choice = node.choices?.[picked];
        if (!choice) break;
        if (!choice.check) { id = choice.goto; continue; }
        dialogueBox.hide();
        const station = { ...STATIONS.find((s) => s.id === choice.check.game), ...choice.check, tag: 'talk' };
        const result = await rollAndPlay(station, { who: choice.check.who, what: choice.check.what, open: choice.check.open, best: choice.check.best, titleText: choice.check.who });
        if (!result) { id = tree.start; continue; }
        commit(settleStation(state, station, result).state, { silent: true });
        id = nextAfterCheck(choice, branchOf(station.id, result));
      }
    } finally {
      asking = null;
      dialogueBox.showChoices(null);
      dialogueBox.hide();
      hold(false);
    }
    return null;
  }

  Object.assign(api, { openStation, stationInfo, talk, commit, closePanel, fresh: () => commit(freshState(), { silent: true }), loadout: (skill) => loadoutOf(state, skill) });
  // Getters must be defined, not assigned (Object.assign would copy their first value).
  Object.defineProperties(api, {
    state: { get: () => state, set: (next) => commit(next, { silent: true }), enumerable: true },
    busy: { get: () => busy > 0, enumerable: true },
  });
  return api;
}
