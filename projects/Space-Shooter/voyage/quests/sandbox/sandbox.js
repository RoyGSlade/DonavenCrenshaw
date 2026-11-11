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
import { mountShop } from '../../shops/ui.js';
import { SHOPS } from '../../shops/shop.js';

// The Stardust Studio's play links (STUDIO-SCHEMA.md section 5) open
// ?quest=<id>[&node=<dialogue node>][&seed=n]; studio=1 keeps its own save.
const params = new URLSearchParams(location.search);
const SAVE_KEY = `${params.get('studio') === '1' ? 'studio.' : ''}stardust.voyage.quest-sandbox.v1`;
const $ = id => document.getElementById(id);
const main = $('qs-main');

// ---- the sandbox save -----------------------------------------------------
function rollStat() { return 1 + Math.floor(Math.random() * 6); }
const rollStats = () => ({ cha: rollStat(), con: rollStat(), dex: rollStat(), wis: rollStat(), str: rollStat() });
function freshSave() {
  return { ...emptySave(), money: 50, items: { scrap: 2 }, character: testCharacter(rollStats(), 'Captain Vela') };
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

// The sandbox save as a store, for the shop counter (voyage/shops/ui.js).
const listeners = new Set();
const store = {
  get: () => structuredClone(save),
  update(fn) { const next = fn(structuredClone(save)); if (!next) return false; save = next; persist(); renderSide(); for (const f of [...listeners]) f(store.get()); return true; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
let shop = null;
function openShop(id) {
  if (player.active) { status('Finish or leave the job first.'); return; }
  shop?.destroy();
  const back = button('Back to the job board', () => { shop?.destroy(); shop = null; renderBoard(); }, { class: 'primary' });
  const counter = el('div', { class: 'qs-shop' });
  main.replaceChildren(counter, back);
  shop = mountShop({ root: counter, shop: id, store, toast: status });
}

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
    el('div', { class: 'qs-row' }, ...Object.entries(SHOPS).map(([id, sh]) => button(sh.name, () => openShop(id), { dataset: { shop: id } }))),
  );
  const log = player.log;
  $('qs-log').replaceChildren(...log.slice(-10).map(line => el('li', { text: line })));
}

// ---- the board ------------------------------------------------------------
function renderBoard() {
  const seedInput = el('input', { id: 'qs-seed', type: 'number', min: '1', step: '1', placeholder: 'random', 'aria-describedby': 'qs-seed-note' });
  main.replaceChildren(
    el('h2', { class: 'qs-title', text: 'Job board' }),
    el('p', { class: 'qs-lede', text: 'Three quest givers, fifteen jobs. Every job rolls its own enemies, setup and rewards from a seed: the same seed plays the same way. The shops are in the wallet panel.' }),
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
  shop?.destroy(); shop = null;
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
  save = { ...save, character: { ...save.character, stats: rollStats() } };
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
  const linked = QUESTS[params.get('quest')];
  if (linked) {
    if (player.active) player.exit();
    player.start(linked, Number.parseInt(params.get('seed'), 10) > 0 ? Number.parseInt(params.get('seed'), 10) : 1);
    const node = linked.nodes[params.get('node')];
    if (node && (node.type === 'dialogue' || node.type === 'end') && player.run) {
      save = { ...save, quests: { ...save.quests, active: { ...save.quests?.active, [linked.id]: { ...player.run, node: params.get('node'), part: null } } } };
      persist();
      player.exit();
      player.resume();
    }
  } else player.resume();
  render();
} else $('qs-closed').hidden = false;
