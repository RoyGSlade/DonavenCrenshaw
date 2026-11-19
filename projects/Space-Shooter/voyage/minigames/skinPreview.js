// Dev page: a scene's minigame inside a station sheet, beside the real dialogue box and the quest tracker, all in the
// game's own UI kit. ?newgame=1&game=repair|hack|haggle&roll=14. The scene is the real slice scene with its proposed hook
// applied to an in-memory copy (sceneHookData.js); the dialogue box is ui/dialogue.js; the tracker is drawn with the
// datapad's own classes and frame. Nothing is saved.
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { QUESTS } from '../quests/data/quests/index.js';
import { QUEST_GIVERS } from '../quests/data/givers.js';
import { createDialogueBox } from '../ui/dialogue.js';
import { hudArt } from '../ui/assets.js';
import { SCENE_HOOKS, applyHook } from './sceneHookData.js';
import { startHook, targetFor } from './sceneHook.js';
import { playHook } from './playHook.js';
import { tierInfo, tierOf, setupCraft, setupNav, setupStealth, setupPersuade, setupIntimidate, setupPilot } from './setup.js';
import { createCraft } from './craft.js'; import { playCraft } from './craftView.js';
import { createNav } from './nav.js'; import { playNav } from './navView.js';
import { createStealth } from './stealth.js'; import { playStealth } from './stealthView.js';
import { createPersuade } from './persuade.js'; import { playPersuade } from './persuadeView.js';
import { createIntimidate } from './intimidate.js'; import { playIntimidate } from './intimidateView.js';
import { createPilot } from './pilot.js'; import { playPilot } from './pilotView.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const BY_GAME = { repair: 'scene5-coolant', hack: 'scene3-airlock', haggle: 'scene4-haggle' };
// The other six games, each on a real slice choice with the skill's check (their hooks are not proposed yet: SCENE-HOOKS.md
// lists the first three). Piloting has no slice check, so it borrows the scan node with a stand-in choice. In memory only.
const MORE = {
  craft: { scene: 'gunners-week', node: 'engine-brief-2', label: 'Jury-rig a fitting from the scrap bin.', word: 'CRAFT', title: 'Fitting', setup: setupCraft,
    make: (seed, setup) => createCraft({ seed, recipe: { materials: 4, build: 30 }, setup }), play: (root, o) => playCraft(root, { state: o.state, what: 'fitting', unit: 'scrap', reducedMotion: o.reducedMotion }) },
  nav: { scene: 'gunners-week', node: 'scan-brief', label: 'Scan the lane carefully.', word: 'NAVIGATE', title: 'Lane run', setup: setupNav,
    make: (seed, setup) => createNav({ seed, setup }), play: (root, o) => playNav(root, { state: o.state, title: 'Lane run', reducedMotion: o.reducedMotion }) },
  stealth: { scene: 'hold-the-corridor', node: 'corridor', label: 'Slip through the cargo hold and come at them from behind.', word: 'SLIP PAST', title: 'Cargo hold', setup: setupStealth,
    make: (seed, setup) => createStealth({ seed, setup }), play: (root, o) => playStealth(root, { state: o.state, title: 'Cargo hold', reducedMotion: o.reducedMotion }) },
  persuade: { scene: 'visitors', node: 'reck-chat', label: 'Talk Reck out of his gunner seat.', word: 'PERSUADE', title: 'Tobin Reck', setup: setupPersuade,
    make: (seed, setup) => createPersuade({ seed, setup }), play: (root, o) => playPersuade(root, { state: o.state, who: 'Tobin Reck', what: 'give up the gunner seat', reducedMotion: o.reducedMotion }) },
  intimidate: { scene: 'hold-the-corridor', node: 'corridor', label: 'Bluff them over the ship comm: you are the new gunner with the big gun.', word: 'INTIMIDATE', title: 'Cinder Reaver', setup: setupIntimidate,
    make: (seed, setup) => createIntimidate({ seed, setup }), play: (root, o) => playIntimidate(root, { state: o.state, who: 'Cinder Reaver', what: 'stand down', reducedMotion: o.reducedMotion }) },
  pilot: { scene: 'gunners-week', node: 'scan-brief', label: 'Bring her down on the pad by hand.', word: 'TOUCHDOWN', title: 'Hangar pad', setup: setupPilot,
    stand: { skill: 'piloting', stat: 'dex', tag: 'nav', dc: 12, pass: 'lane-clean', fail: 'lane-beacon' },
    make: (seed, setup) => createPilot({ seed, setup }), play: (root, o) => playPilot(root, { state: o.state, where: 'the hangar pad', reducedMotion: o.reducedMotion }) },
};

function drawTracker(root, quest, nodeId) {
  const steps = quest.steps || [], at = Math.max(0, steps.findIndex((s) => (s.nodes || []).includes(nodeId)));
  root.className = 'dp-tracker';
  const frame = hudArt('tracker-frame'), notch = hudArt('tracker-notch');
  if (frame) { root.classList.add('has-art'); root.style.setProperty('--dp-tracker-art', `url("${frame}")`); }
  if (notch) root.style.setProperty('--dp-tracker-notch', `url("${notch}")`);
  const head = el('button', 'dp-tracker-head'); head.type = 'button';
  head.append(el('span', 'dp-tracker-eyebrow', `JOB · ${(QUEST_GIVERS[quest.giver]?.short || '').toUpperCase()}`), el('span', 'dp-tracker-title', quest.title), el('span', 'dp-tracker-fold', '▾'));
  const phone = innerWidth < 700; root.classList.toggle('is-collapsed', phone); // phones start with the tracker folded, as in the game
  const now = el('p', 'dp-tracker-now'); now.append(el('b', '', 'NEXT'), el('span', '', steps[at]?.text || ''));
  const next = el('ol', 'dp-tracker-next');
  if (!phone) for (const s of steps.slice(at + 1, at + 3)) { const li = el('li'); li.append(el('i'), el('span', '', s.text)); next.append(li); }
  root.replaceChildren(head, now, next);
}

function boot() {
  $('sk-page').hidden = false;
  const params = new URLSearchParams(location.search);
  const game = BY_GAME[params.get('game')] || MORE[params.get('game')] ? params.get('game') : 'repair';
  const more = MORE[game];
  let hook = more ? { id: `skin-${game}`, scene: more.scene, node: more.node, label: more.label, minigame: { kind: game, title: more.title } } : SCENE_HOOKS.find((h) => h.id === BY_GAME[game]);
  let base = QUESTS[hook.scene];
  if (more?.stand) { base = structuredClone(base); base.nodes[more.node].choices.push({ label: more.label, check: { ...more.stand } }); }
  const { quest, choice } = applyHook(base, hook);
  const node = quest.nodes[hook.node];
  const roll = Number(params.get('roll')) || 14, level = 3;
  const attempt = { total: roll + level, dc: choice.check.dc, natural: roll === 20 };
  const character = { levels: { repair: level, hacking: level, social: level }, points: {} };
  const start = more ? { kind: game, tier: tierOf(attempt), setup: more.setup({ tier: tierOf(attempt), level, points: {} }) } : startHook(choice, attempt, character);
  const seed = Number(params.get('seed')) || 5;
  document.documentElement.dataset.game = game;
  $('sk-sheet').classList.toggle('is-fit', game === 'haggle'); // the game's sheet helper does the same for kind haggle
  document.body.classList.add('hg-sheet-open'); document.body.dataset.sheetSide = 'right';
  const kindWord = more ? more.word : { repair: 'REPAIR', hack: 'HACK', haggle: 'HAGGLE' }[game];
  $('sk-eyebrow').textContent = `${kindWord} · ${tierInfo(start.tier).label.toUpperCase()} ROLL`;
  $('sk-title').textContent = choice.minigame.title || choice.minigame.who || quest.title;
  drawTracker($('sk-tracker'), quest, hook.node);

  const dlg = createDialogueBox({ root: $('sk-dialogue'), bus: null, audio: null, reducedMotion: () => true });
  const say = (n, options = null) => {
    dlg.show({ speaker: n.portrait || 'narrator', name: n.speaker || '', text: n.text || n.beat || '', emotion: n.emotion });
    if (options) dlg.showChoices({ options });
  };
  // The beat as the game shows it: the speaker's line and the hooked choice with its d20 odds.
  const pct = Math.round(Math.max(0, Math.min(1, (21 - (choice.check.dc - attempt.total + roll)) / 20)) * 100);
  say(node, node.choices.map((c, index) => (c === choice ? { index, label: c.label, kind: 'attempt', roll: `d20 ${roll}`, dc: c.check.dc, chance: pct / 100 } : { index, label: c.label, locked: true, reason: '' })).filter((o) => o.label === choice.label || !o.locked));
  window.__skin = { quest, hook, start, attempt, pass: choice.check.pass, get node() { return node; } };
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const played = more ? more.play($('sk-stage'), { state: more.make(seed, start.setup), reducedMotion }).then((result) => ({ branch: result?.success ? 'win' : 'lose', xp: result?.xp || 0, skill: choice.check.skill, result }))
    : playHook($('sk-stage'), { start, seed, reducedMotion });
  played.then((r) => {
    const to = more ? (r.branch === 'win' ? choice.check.pass : choice.check.fail) : targetFor(choice, r.result), target = quest.nodes[to];
    window.__skin.done = { branch: r.branch, xp: r.xp, skill: r.skill, target: to };
    say(target.type === 'end' ? { ...target, text: target.text } : target);
    $('sk-sheet').hidden = false;
  });
}

if (!flag.enabled) $('mg-closed').hidden = false;
else boot();
