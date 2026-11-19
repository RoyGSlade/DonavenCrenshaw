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
import { tierInfo } from './setup.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const BY_GAME = { repair: 'scene5-coolant', hack: 'scene3-airlock', haggle: 'scene4-haggle' };

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
  const game = BY_GAME[params.get('game')] ? params.get('game') : 'repair';
  const hook = SCENE_HOOKS.find((h) => h.id === BY_GAME[game]);
  const { quest, choice } = applyHook(QUESTS[hook.scene], hook);
  const node = quest.nodes[hook.node];
  const roll = Number(params.get('roll')) || 14, level = 3;
  const attempt = { total: roll + level, dc: choice.check.dc, natural: roll === 20 };
  const character = { levels: { repair: level, hacking: level, social: level }, points: {} };
  const start = startHook(choice, attempt, character);
  const seed = Number(params.get('seed')) || 5;
  document.documentElement.dataset.game = game;
  document.body.classList.add('hg-sheet-open'); document.body.dataset.sheetSide = 'right';
  const kindWord = { repair: 'REPAIR', hack: 'BYPASS', haggle: 'HAGGLE' }[game];
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
  window.__skin = { quest, hook, start, attempt, get node() { return node; } };
  playHook($('sk-stage'), { start, seed, reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches }).then((r) => {
    const target = quest.nodes[targetFor(choice, r.result)];
    window.__skin.done = { branch: r.branch, xp: r.xp, skill: r.skill, target: targetFor(choice, r.result) };
    say(target.type === 'end' ? { ...target, text: target.text } : target);
    $('sk-sheet').hidden = false;
  });
}

if (!flag.enabled) $('mg-closed').hidden = false;
else boot();
