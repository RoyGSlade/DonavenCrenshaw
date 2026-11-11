// Quest sandbox: a test bench for the quest engine with its own save (the real
// game plays quests from the hangar's job board, voyage/jobs.js). The quest
// screen is the shared player (../ui/player.js); this file draws the board and
// the side panel. All text goes in with textContent.
import { runtimeConfig } from '../../../runtime-config.js';
import { newGameFlag } from '../../flag.js';
import { QUESTS, SLICE_QUEST } from '../data/quests/index.js';
import { QUEST_GIVERS } from '../data/givers.js';
import { SECTORS } from '../data/sectors.js';
import { availability } from '../engine.js';
import { emptySave, testCharacter, ITEMS, STAT_NAMES } from '../core.js';
import { createQuestPlayer, el, button, portrait } from '../ui/player.js';

const SAVE_KEY = 'stardust.voyage.quest-sandbox.v1';
const $ = id => document.getElementById(id);
const main = $('qs-main');

// ---- the sandbox save -----------------------------------------------------
function rollStat() { return 1 + Math.floor(Math.random() * 6); }
function freshSave() {
  return { ...emptySave(), money: 50, items: { scrap: 2 }, character: testCharacter({ cha: rollStat(), con: rollStat(), dex: rollStat(), wis: rollStat() }, 'Captain Vela') };
}
function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && raw.v === 1 && raw.character) return raw;
  } catch { /* private window or bad data: start fresh */ }
  return freshSave();
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage off: play on */ }
}

let save = loadSave();

function status(text) { $('qs-status').textContent = text; }

const player = createQuestPlayer({
  root: main,
  session: { get: () => save, commit: (next) => { save = next; persist(); renderSide(); } },
  status,
  onExit: () => render(),
});

// ---- side panel -----------------------------------------------------------
function renderSide() {
  const c = save.character;
  $('qs-captain').replaceChildren(
    el('p', { class: 'qs-name', text: c.name }),
    el('dl', { class: 'qs-stats' }, ...['cha', 'con', 'dex', 'wis'].flatMap(id => [el('dt', { text: STAT_NAMES[id] }), el('dd', { text: String(c.stats[id]) })])),
    el('p', { class: 'qs-note', text: `Skill points earned: ${c.earned || 0}` }),
  );
  const items = Object.entries(save.items || {}).map(([id, n]) => `${ITEMS[id]?.name || id} × ${n}`);
  const fragments = Object.keys(save.flags || {}).filter(id => id.startsWith('fragment-')).length;
  $('qs-wallet').replaceChildren(
    el('p', { class: 'qs-money', text: `${save.money || 0} credits` }),
    el('p', { text: items.length ? items.join(', ') : 'No items' }),
    el('ul', { class: 'qs-rep' }, ...Object.keys(QUEST_GIVERS).map(id => el('li', { text: `${QUEST_GIVERS[id].short}: ${save.rep?.[id] || 0} rep` }))),
    el('p', { text: `Knock fragments: ${fragments} of 5` }),
  );
  const log = player.log;
  $('qs-log').replaceChildren(...log.slice(-10).map(line => el('li', { text: line })));
}

// ---- the board ------------------------------------------------------------
function renderBoard() {
  const seedInput = el('input', { id: 'qs-seed', type: 'number', min: '1', step: '1', placeholder: 'random', 'aria-describedby': 'qs-seed-note' });
  main.replaceChildren(
    el('h2', { class: 'qs-title', text: 'Job board' }),
    el('p', { class: 'qs-lede', text: 'Three quest givers, five jobs. Cold Run is the slice quest. Every job rolls its own enemies, setup and rewards from a seed: the same seed plays the same way.' }),
    el('div', { class: 'qs-seed' }, el('label', { for: 'qs-seed', text: 'Seed' }), seedInput, el('small', { id: 'qs-seed-note', text: 'Leave empty for a fresh roll.' })),
    el('div', { class: 'qs-givers' }, ...Object.entries(QUEST_GIVERS).map(([id, giver]) => el('article', { class: 'qs-giver' },
      portrait(id, 96, null),
      el('div', {},
        el('h3', { text: giver.name }),
        el('p', { class: 'qs-role', text: `${giver.role}, ${SECTORS[giver.sector].name}` }),
        el('p', { class: 'qs-greet', text: `"${giver.greeting}"` }),
        el('ul', { class: 'qs-jobs' }, ...giver.quests.map(qid => {
          const q = QUESTS[qid];
          const can = availability(q, save);
          const done = save.quests?.done?.[qid];
          return el('li', {},
            el('strong', { text: q.title + (qid === SLICE_QUEST ? ' (slice)' : '') }),
            el('span', { text: q.summary }),
            done ? el('small', { text: `Last time: ${done.result === 'success' ? 'success' : 'failed'} (${done.outcome})` }) : null,
            button(can.ok ? 'Take the job' : can.reasons[0], () => takeJob(q, seedInput.value), { disabled: !can.ok }),
          );
        })),
      ),
    ))),
  );
}

function takeJob(quest, seedText) {
  const seed = Number.parseInt(seedText, 10) > 0 ? Number.parseInt(seedText, 10) : 1 + Math.floor(Math.random() * 1e9);
  status(`Took ${quest.title}, seed ${seed}.`);
  player.start(quest, seed);
  renderSide();
}

// ---- wiring -----------------------------------------------------------------
function render() {
  renderSide();
  if (player.active) player.render(); else renderBoard();
}

addEventListener('keydown', e => { player.keydown(e); });

$('qs-roll').addEventListener('click', () => {
  save = { ...save, character: { ...save.character, stats: { cha: rollStat(), con: rollStat(), dex: rollStat(), wis: rollStat() } } };
  persist(); render(); status('New stats rolled.');
});
$('qs-gift').addEventListener('click', () => {
  save = { ...save, money: (save.money || 0) + 200, items: { ...save.items, scrap: (save.items.scrap || 0) + 2, permit: 1 } };
  persist(); render(); status('Test kit added.');
});
$('qs-reset').addEventListener('click', () => {
  save = freshSave(); if (player.active) player.exit(); persist(); render(); status('Sandbox save reset.');
});

if (newGameFlag({ config: runtimeConfig, search: location.search }).enabled) {
  $('qs-app').hidden = false;
  player.resume();
  render();
} else $('qs-closed').hidden = false;
