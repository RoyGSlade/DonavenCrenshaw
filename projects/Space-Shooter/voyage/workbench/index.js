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
import { playGame, resetCraftBank, loadPart } from './games.js';
import { partLine } from '../minigames/craftChain.js';
import { TALKS, nextAfterCheck } from './talks.js';
import { sparSetup, sparXp, sparSaid } from './spar.js';
import { yardXp, yardSaid } from './yard.js';
import { branchOf } from '../minigames/sceneHook.js';
import { gymGame, trainRun, gymLoadout, gymSetup } from '../minigames/gym.js';
import { trainingOf, gallerySetup, settleGallery, answerPage, galleryLeft, settleSector } from '../minigames/trainer.js';
import { setupNavTrainer, playNavTrainer } from '../minigames/perihelionEntry.js';
import { nextPage, shuffledOrder } from '../minigames/books.js';
import { createGallery, rangeHeight } from '../minigames/gallery.js';
import { playGallery } from '../minigames/galleryView.js';
import { renderTrainer } from '../minigames/trainerView.js';
import { checkChance, checkBonusText } from '../character.js';
import { tierInfo } from '../minigames/setup.js';
import { ROLL_SKILLS } from '../data.js';
import { openFullScreen } from './fullScreen.js';
import { renderHud, renderBoard, renderConfirm, renderSparPicker, renderWhere, renderCraftMenu, h } from './ui.js';
import { PEOPLE, personSheet } from '../people/index.js';
import * as C from '../talk/convo.js';
import { talkModel } from '../talk/model.js';
import { renderTalk } from '../talk/view.js';
import { rollPreview } from '../minigames/rollPreview.js';
import { cutStation } from './cut.js';
import { voiceUrl } from '../story/voice.js';

const SKILL_NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));
const OTHERS = {
  cut: { name: 'Cut station', prompt: 'Cut station: how wide is the line?' },
  hook: { name: "Pip's hook", prompt: 'Pip\'s hook: whose is it?' },
  lock: { name: 'Practice lock', prompt: 'Practice lock: no clock, no XP' },
  board: { name: 'Skills board', prompt: 'Skills board: levels, XP and risk' },
  scan: { name: 'Scan station', prompt: 'Scan station: save your progress' },
  reprint: { name: 'Reprint pod', prompt: 'Reprint pod: die and come back' },
  gym: { name: 'Gym trainer', prompt: 'Gym trainer: gallery, books and replays for XP' },
  spar: { name: 'Sparring rack', prompt: 'Sparring ring: fight a marauder' },
  reset: { name: 'Reset cart', prompt: 'Reset cart: a fresh test state' },
  'yard-goal': { name: 'Vault console', prompt: 'Vault console: open it to finish the run' },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * { store, bus, onfoot, dialogueBox, sheet: { root, eyebrow, title, stage }, hud (an empty element), toast, reducedMotion(), sound(id),
 *   onBusy(on), storage, rng, seed }. Returns { openStation, stationInfo, talk, get state, rng, ... } (also what the tests drive).
 */
export function createWorkbench({ store, bus, onfoot, dialogueBox, sheet, hud, toast = () => {}, reducedMotion = () => false, sound = () => {}, onBusy = () => {}, storage = globalThis.localStorage, rng = Math.random, seed = null, clock = () => Date.now(), audio = null }) {
  let state = loadState(storage);
  let busy = 0;
  let gymSkill = 'shooting', boardSkill = null, sparCount = 2, gymLesson = 1, pointsOpen = false, cutter = 'shop';
  let bookCur = { skill: null, page: null, order: [], answered: null, lastId: null };
  let leave = null; // resolves the game in progress when the player leaves it
  let seedCounter = 0;
  const api = { rng, clock, openPanel: null, voiced: [] }; // `voiced`: the lines the talk tried to speak, { id, url } (tests read it)
  const debugVoice = (() => { try { return new URLSearchParams(location.search).get('voiceids') === '1'; } catch { return false; } })();
  let voiceRun = 0;
  /** Speak a person's lines one after the other with the scratch (or real) voice when a file exists; text always shows. */
  async function speak(ids) {
    const run = ++voiceRun;
    for (const id of ids) {
      if (run !== voiceRun) return;
      const url = voiceUrl(id);
      api.voiced.push({ id, url });
      if (url && audio) { try { await audio.playLine(url); } catch { /* text is enough */ } }
    }
  }
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
  async function rollAndPlay(station, { who, what, open, best, lock, titleText, context, tool } = {}) {
    const attemptState = state;
    const attempt = rollStation(attemptState, station, api.rng);
    const start = startStation(attemptState, station, attempt, { tool });
    bus.emit('roll:attempt', { ...attempt, who: 'You', label: `${SKILL_NAME[station.skill]} attempt · ${station.id}`, preview: previewLine(start) });
    sound('talk');
    await wait(reducedMotion() ? 500 : 1700);
    return playStart(station, start, { who, what, open, best, lock, titleText, context, tool });
  }
  /** Games that own the whole screen (the house rule): every station and mini-game view. The side sheet is for menus and panels only. */
  const FULL_SCREEN = new Set(['repair', 'hack', 'craft', 'nav', 'pilot', 'stealth', 'persuade', 'intimidate', 'haggle', 'cut', 'screw', 'bend', 'bolt-plate']);
  const BARE = new Set(['nav']); // Perihelion draws its own top bar and Leave
  async function playStart(station, start, { who, what, open, best, lock, titleText, word, context, tool, resume } = {}) {
    sheet.stage.replaceChildren();
    const noteText = start.preview ? `${start.preview.line} ${start.preview.nextLine}` : '';
    const wordText = word || `${station.word} · ${tierInfo(start.tier).label.toUpperCase()} ROLL`, title = titleText || station.title;
    let stage, fs = null, leaveBtn = null;
    const left = new Promise((resolve) => { leave = () => resolve(null); });
    if (FULL_SCREEN.has(station.id)) {
      fs = openFullScreen({ word: wordText, title, note: noteText, onLeave: () => leave?.(), bare: BARE.has(station.id) });
      stage = fs.stage;
    } else {
      const note = h('p', { class: 'rp-help wb-preview', text: noteText });
      stage = h('div', { class: 'wb-stage' });
      leaveBtn = h('button', { type: 'button', class: 'wb-leave', text: 'Leave this game' });
      leaveBtn.addEventListener('click', () => leave?.());
      sheet.stage.append(note, stage, leaveBtn);
      showSheet(true, { word: wordText, titleText: title });
      sheet.root.classList.toggle('is-fit', station.id === 'haggle');
    }
    hold(true);
    let result;
    try { result = await Promise.race([playGame(stage, station.game || station.id, { seed: nextSeed(), setup: start.setup, title, who: who || station.who, what: what || station.what, open: open ?? station.open, best: best ?? station.best, lock: lock ?? station.lock, context, tool, resume, embedded: Boolean(fs?.bare), onLeave: fs?.bare ? () => leave?.() : null, sound: () => {}, reducedMotion }), left]); }
    catch (error) { console.warn('Stardust workbench: the game could not run', error); result = null; }
    leave = null;
    if (fs) fs.close(); else { sheet.stage.replaceChildren(); showSheet(false); }
    hold(false);
    return result;
  }

  // ---- stations -----------------------------------------------------------------------------------------------------
  /** The hacking bench asks where this hack is, because a failure answers by place (terminal locks, port closes, section changes). */
  const chooseWhere = () => new Promise((resolve) => {
    openPanel('HACKING BENCH', 'Where is this hack?', (pane) => renderWhere(pane, { onPick: (w) => { closePanel(); resolve(w); }, onClose: () => { closePanel(); resolve(null); } }));
  });
  /** The crafting bench: Cut, Screw, the two-game recipe, the older heat-and-shape game, or a part left in hand. */
  const chooseCraft = () => new Promise((resolve) => {
    const part = loadPart();
    openPanel('CRAFTING BENCH', 'What are you making?', (pane) => renderCraftMenu(pane, { part, partWords: partLine(part), tool: cutter, onTool: (t) => { cutter = t; api.openPanel?.draw(); }, onPick: (id) => { closePanel(); resolve(id); }, onClose: () => { closePanel(); resolve(null); } }));
  });
  const CRAFT_LABEL = { cut: ['CUT', 'Cut a plate', 'Cut'], screw: ['SCREW', 'Drive a bolt', 'Screw'], bend: ['BEND', 'Bend a bracket', 'Bend'], 'bolt-plate': ['BOLT PLATE', 'Bolt plate', 'Bolt plate'] };
  const cutterNow = () => (state.items?.['good-cutter'] ? 'good' : cutter); // the cutter you earned from Pip beats the test picker
  async function useCraft(base, forced = null) {
    const pick = forced || await chooseCraft();
    if (!pick) return;
    if (pick === 'heat') return useStation(base, { direct: true });
    let id = pick, part = null;
    if (pick === 'resume') { part = loadPart(); if (!part) { toast('No part in hand.'); return; } id = part.recipe.id; }
    const [word, title, label] = CRAFT_LABEL[id];
    const station = { ...base, id, word, title, label };
    let result;
    if (part) {
      const start = { station, tier: part.tier, setup: { tier: part.tier, points: part.points, label: part.label }, level: part.level, points: part.points, preview: null };
      result = await playStart(station, start, { word: `${word} · PART IN HAND · ${String(part.label).toUpperCase()} ROLL`, titleText: title, tool: part.tool, resume: part });
    } else result = await rollAndPlay(station, { titleText: title, tool: forced === 'cut' ? (state.items?.['good-cutter'] ? 'good' : 'worn') : cutterNow() });
    if (!result) { toast('You left the game. Your part is kept if a game was done.'); return; }
    commit(settleStation(state, station, result).state);
  }
  async function useStation(station, { direct = false } = {}) {
    if (station.id === 'craft' && !direct) return useCraft(station);
    let context;
    if (station.id === 'hack') { context = await chooseWhere(); if (!context) return; }
    const result = await rollAndPlay(station, { context });
    if (!result) { toast('You left the game. No XP.'); return; }
    commit(settleStation(state, station, result).state);
  }

  async function practice() {
    const left = new Promise((resolve) => { leave = () => resolve(null); });
    const fs = openFullScreen({ word: 'BYPASS · PRACTICE', title: 'Practice lock', note: 'A dummy lock: no clock, no trace, no XP. It never trips, so try it as long as you like.', onLeave: () => leave?.() });
    hold(true);
    try { await Promise.race([playGame(fs.stage, 'practice', { seed: nextSeed(), sound: () => {}, reducedMotion }), left]); } catch (error) { console.warn('Stardust workbench: the practice lock could not run', error); }
    leave = null; fs.close(); hold(false);
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
  // ---- the trainer: a gallery, a book or a replay for each skill --------------------------------------------------------
  function bookFor(skill) {
    if (trainingOf(skill) !== 'book') return { page: null, order: [], answered: null };
    if (bookCur.skill !== skill) bookCur = { skill, page: null, order: [], answered: null, lastId: null };
    if (!bookCur.page && !bookCur.answered) {
      const page = nextPage(skill, state.progress.levels[skill], state.learned, bookCur.lastId);
      if (page) bookCur = { ...bookCur, page, order: shuffledOrder(page, api.rng), answered: null };
    }
    return bookCur;
  }
  function answer(position) {
    const page = bookCur.page;
    if (!page || bookCur.answered) return;
    const r = answerPage({ pageId: page.id, order: bookCur.order, position, credits: state.credits, log: state.gymLog, learned: state.learned });
    if (!r.ok) { commit({ ...state, said: r.said }, { silent: true }); return; }
    bookCur = { ...bookCur, answered: { position, right: r.right, said: r.said, reread: r.reread } };
    const next = earnXp({ ...state, credits: r.credits, gymLog: r.log, learned: r.learned }, page.skill, r.paid).state;
    commit({ ...next, said: r.said });
  }
  async function playRange() {
    const skill = 'shooting';
    const { level, points } = gymLoadout(state.progress, skill);
    const setup = gallerySetup({ level, points, lesson: gymLesson });
    const left = galleryLeft(state.gymLog, Date.now());
    const height = rangeHeight((innerWidth || 1) / Math.max(200, (innerHeight || 600) - 150)); // a tall phone gets a tall range
    closePanel();
    hold(true);
    hud.hidden = true;
    const fs = openFullScreen({ bare: true, title: 'Shooting gallery' });
    let result = null;
    try { result = await playGallery(fs.stage, { state: createGallery({ seed: nextSeed(), lesson: setup.lesson, setup, height }), xpLeft: left, sound: () => {}, reducedMotion }); }
    catch (error) { console.warn('Stardust workbench: the gallery could not run', error); }
    fs.close();
    hud.hidden = false;
    hold(false);
    if (result) {
      const r = settleGallery({ credits: state.credits, log: state.gymLog, now: Date.now(), result });
      const next = earnXp({ ...state, credits: r.credits, gymLog: r.log }, skill, r.paid).state;
      commit({ ...next, said: r.said });
    } else commit({ ...state, said: 'You left the range. No XP, no fee.' }, { silent: true });
    openGym();
  }
  /** Fly one Perihelion trainer sector: stars pay XP once (free, uncapped), and the result card says what it really paid. */
  async function flySector(index) {
    const { level, points } = gymLoadout(state.progress, 'navigation');
    const setup = setupNavTrainer({ points, level });
    closePanel();
    const fs = openFullScreen({ bare: true, title: 'Plot a burn' });
    hold(true);
    let result = null;
    try { result = await playNavTrainer(fs.stage, { index, setup, sound: () => {}, reducedMotion, progress: state.navProgress, embedded: true }); }
    catch (error) { console.warn('Stardust workbench: Perihelion could not run', error); }
    fs.close(); hold(false);
    if (result) {
      const r = settleSector({ navProgress: state.navProgress, result });
      const next = earnXp({ ...state, navProgress: r.navProgress }, 'navigation', r.paid).state;
      commit({ ...next, said: r.said });
    } else commit({ ...state, said: 'You left the sector. No XP.' }, { silent: true });
    openGym();
  }
  const openGym = () => openPanel('HOLODECK GYM', 'Train a skill', (pane) => renderTrainer(pane, {
    state, selected: gymSkill, now: Date.now(), lesson: gymLesson, book: bookFor(gymSkill), pointsOpen,
  }, {
    onSelect: (id) => { gymSkill = id; api.openPanel?.draw(); }, onLesson: (n) => { gymLesson = n; api.openPanel?.draw(); },
    onStart: () => playRange(), onAnswer: answer, onNext: () => { bookCur = { ...bookCur, lastId: bookCur.page?.id ?? bookCur.lastId, page: null, answered: null }; api.openPanel?.draw(); },
    onReplay: (id) => train(id), onSector: (i) => flySector(i), onPoints: (skill, pts) => commit(setPoints(state, skill, pts), { silent: true }),
    onPointsToggle: (on) => { pointsOpen = on; }, onClose: closePanel,
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

  // ---- the patrol yard (live stealth) -------------------------------------------------------------------------------------
  const SAID = { inspect: 'A guard spotted you for a moment and goes to look.', alarm: 'Alarm! Every guard is looking for you.', takedown: 'Silent takedown.', 'body-found': 'A guard found a body.', 'stand-down': 'The guards stand down.', caught: 'Caught. Back to the door.' };
  function stealthEvent(e) { if (SAID[e.type]) toast(SAID[e.type]); }
  /** The vault console: the run is won. Real Stealth XP by how quietly you did it, then the yard resets. */
  function reachGoal() {
    const layer = onfoot.world?.stealth;
    if (!layer) return;
    const run = { outcome: 'goal', ...layer.stats() };
    const xp = yardXp(run);
    const earned = earnXp(state, 'stealth', xp);
    const level = earned.gained ? ` Stealth is now level ${earned.state.progress.levels.stealth}.` : '';
    commit({ ...earned.state, said: `${yardSaid(run, xp)}${level}` });
    onfoot.world.restartStealth();
  }

  async function openStation(id) {
    if (api.openPanel) return;
    const key = String(id).replace(/^wb-/, '');
    const station = stationOfProp(`wb-${key}`);
    if (station) return useStation(station);
    switch (key) {
      case 'lock': return practice();
      case 'cut': openCut(); break;
      case 'hook': openHook(); break;
      case 'board': openBoard(); break;
      case 'scan': doScan(); break;
      case 'reprint': confirmDie(); break;
      case 'gym': openGym(); break;
      case 'spar': openSpar(); break;
      case 'reset': confirmReset(); break;
      case 'yard-goal': reachGoal(); return;
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
    if (personSheet(who)) return socialTalk(personSheet(who));
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

  // ---- social: the Cut station, the hook, and the full conversation with a person (people/*.js, talk/*) -------------------------------
  const people = () => Object.values(PEOPLE);
  const dayTick = () => { const r = C.tickDay(state, api.clock(), people()); if (r.state !== state) commit({ ...r.state, said: r.said.join(' ') || state.said }, { silent: !r.said.length }); };
  function openCut() {
    dayTick();
    const cut = cutStation(state);
    if (cut.pin && !(state.wants || []).includes(cut.pin)) commit(C.pinWant(state, cut.pin), { silent: true });
    openPanel('CUT STATION', 'The cut line', (pane) => {
      const c = cutStation(state);
      const bar = h('div', { class: 'wb-cutbar', 'data-width': c.width, role: 'img', 'aria-label': `The cut line is ${c.width} wide` }, h('i', { style: `width:${Math.round((100 * c.width) / 15)}%` }), h('b', { text: `${c.width} wide` }));
      pane.replaceChildren(bar, ...c.lines.map((l) => h('p', { class: 'rp-help wb-said', text: l })), ...(c.pin ? [h('p', { class: 'wb-want-pin', role: 'status', text: 'You want: the good cutter' })] : []), h('div', { class: 'gm-row' }, h('button', { type: 'button', class: 'primary', text: 'Close' }), h('button', { type: 'button', class: 'wb-cut-play', text: 'Cut a plate with it' })));
      pane.querySelector('button.primary').addEventListener('click', closePanel);
      // The real Cut game (crafting chain), with the cutter you hold: the good one once Pip has given it, else the worn bench one.
      pane.querySelector('.wb-cut-play').addEventListener('click', () => { closePanel(); useCraft(stationOfProp('wb-craft'), 'cut'); });
    });
  }
  function openHook() {
    const sheet = personSheet('pip');
    const seen = C.seeThing(state, sheet, 'hook');
    commit(seen.state, { silent: true });
    openPanel('LOOK CLOSER', sheet.sees.hook.label, (pane) => {
      pane.replaceChildren(h('p', { class: 'rp-help wb-said wb-hook-note', text: seen.note }), h('p', { class: 'rp-help', text: 'You could ask Pip about this.' }), h('div', { class: 'gm-row' }, h('button', { type: 'button', class: 'primary', text: 'Close' })));
      pane.querySelector('button').addEventListener('click', closePanel);
    });
  }

  /** The d20 tray, then the push's mini-game in the sheet. Resolves with the game's result, or null when the player leaves it. */
  async function playPush(at, person, who) {
    const station = { id: at.game === 'bribe' ? 'haggle' : at.game, skill: 'social', word: at.game.toUpperCase(), title: who };
    const pv = rollPreview(at.game === 'bribe' ? 'haggle' : at.game, at.attempt, { level: at.level, points: at.points });
    bus.emit('roll:attempt', { ...at.attempt, who: 'You', label: `Social attempt · ${at.opt.push.ability} with ${at.opt.push.approach}`, preview: [pv?.line, ...at.head.lines].filter(Boolean).join(' ') });
    sound('talk');
    await wait(reducedMotion() ? 500 : 1700);
    const left = new Promise((resolve) => { leave = () => resolve(null); });
    const fs = openFullScreen({ word: `${at.opt.push.ability.toUpperCase()} · ${at.opt.push.approach.toUpperCase()} · ${at.label.toUpperCase()} ROLL`, title: who, note: [pv?.line, pv?.nextLine, ...at.head.lines].filter(Boolean).join(' '), onLeave: () => leave?.() });
    const stage = fs.stage;
    fs.leave.textContent = 'Back off (no cost)';
    hold(true);
    const o = at.opt.push;
    const range = o.bribe ? C.bribeRange(state, o) : null;
    let result;
    try { result = await Promise.race([playGame(stage, at.game, { seed: nextSeed(), setup: at.setup, opening: at.opening, range, gift: o.bribe?.gift ? Object.entries(o.bribe.gift).map(([i, n]) => `${n} ${i.replace(/-/g, ' ')}`).join(' and ') : null, who, what: person.wants[at.opt.push.want || 'good-cutter']?.label, sound: () => {}, reducedMotion }), left]); }
    catch (error) { console.warn('Stardust workbench: the push could not run', error); result = null; }
    leave = null; fs.close(); hold(false);
    void station;
    return result;
  }

  async function socialTalk(person) {
    dayTick();
    hold(true);
    let talk = C.newTalk(person);
    const greeting = C.greetingOf(state, person);
    const ui = { greeting, lines: [greeting], notes: [], learned: [], push: null };
    const root = h('section', { class: 'tk-panel ui-dialogue', id: 'wb-talk', role: 'dialog', 'aria-label': `Talk with ${person.name}`, 'data-person': person.id });
    document.body.append(root);
    document.body.classList.add('is-talking');
    let done;
    const finished = new Promise((r) => { done = r; });
    const draw = () => renderTalk(root, talkModel(state, person, talk, ui, api.clock()), on, { debug: debugVoice });
    const voice = (ids) => speak((ids || []).filter((id) => person.lines[id]?.who === person.speaker));
    const setReply = (r, extra = {}) => { Object.assign(ui, { lines: r.lines || [], learned: r.learned ? [r.learned] : [], notes: [], push: null, ...extra }); voice(r.lines); };
    const on = {
      leave: () => done(),
      word: (lit) => {
        if (lit.kind === 'want') { commit(C.pinWant(state, lit.id), { silent: true }); ui.notes = [`You want: ${C.wantsShown(state).find((w) => w.id === lit.id)?.label || lit.id}. Ask for it when you are ready.`]; draw(); } else on.topic(lit.id);
      },
      want: (wantId) => {
        const r = C.askWant(state, person, talk, wantId, api.clock());
        state = { ...r.state }; talk = r.talk; commit(state, { silent: true });
        const notes = r.kind === 'lent' ? [`You borrowed the ${person.wants[wantId].label.replace(/^the /, '')} until the game day ends.`] : r.kind === 'given' ? [`${person.name} gives you ${person.wants[wantId].label}.`] : [];
        setReply(r, { notes }); draw();
      },
      topic: (id) => {
        const r = C.askTopic(state, person, talk, id);
        if (r.blocked && r.blocked !== 'work') { ui.notes = [r.blocked]; draw(); return; }
        talk = r.talk; commit(r.state, { silent: true });
        setReply(r, { notes: r.bondDelta ? [`${person.name}'s bond up 1: ${talkBond()}.`] : [] }); draw();
      },
      push: (id) => { ui.push = ui.push === id ? null : id; draw(); },
      giveBack: (wantId) => { const r = C.returnBorrowed(state, person, wantId); if (r.ok) { commit(r.state, { silent: true }); setReply({ lines: [] }, { notes: [`You gave the ${person.wants[wantId].label.replace(/^the /, '')} back before the day ended.`] }); draw(); } },
      say: async () => {
        const sel = talkModel(state, person, talk, ui, api.clock()).push?.selected;
        if (!sel) return;
        const wantId = talkModel(state, person, talk, ui, api.clock()).push.want;
        const at = C.attemptPush(state, person, talk, wantId, sel.id, api.clock(), api.rng);
        if (!at) return;
        at.opt.push = { ...at.opt.push, want: wantId };
        root.hidden = true;
        const result = await playPush(at, person, person.name);
        root.hidden = false;
        if (!result) { ui.notes = ['You backed off. Nothing was spent.']; ui.push = null; ui.lines = []; draw(); return; }
        const r = C.settlePush(state, person, talk, wantId, sel.id, result, api.clock());
        talk = r.talk; commit(r.state, { silent: true });
        Object.assign(ui, { lines: [sel.say, ...r.lines], learned: [], notes: r.notes, push: null });
        draw(); voice(r.lines);
      },
    };
    const talkBond = () => C.personOf(state, person).bond + ' ' + 'of 5';
    draw(); voice([greeting]);
    root.querySelector('.tk-leave')?.focus?.({ preventScroll: true });
    await finished;
    voiceRun++; audio?.stopLine?.();
    root.remove();
    document.body.classList.remove('is-talking');
    hold(false);
    return null;
  }

  Object.assign(api, { openStation, stationInfo, talk, stealthEvent, stealthSetup: () => loadoutOf(state, 'stealth'), commit, closePanel, fresh: () => commit(freshState(), { silent: true }), loadout: (skill) => loadoutOf(state, skill) });
  // Getters must be defined, not assigned (Object.assign would copy their first value).
  Object.defineProperties(api, {
    state: { get: () => state, set: (next) => commit(next, { silent: true }), enumerable: true },
    busy: { get: () => busy > 0, enumerable: true },
  });
  return api;
}
