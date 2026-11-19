// The bench board and the holodeck gym, drawn from the pure modules (bench.js, gym.js). Plain DOM, no art.
import { benchBoard, standing, crewBest, overPar } from './bench.js';
import { GYM, GYM_GAMES, gymSetup, gymXp, leftThisHour } from './gym.js';
import { playRepair } from './repairView.js';
import { BENCH_SETUP } from './bench.js';
import { benchSeed } from './bench.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };

/** The crew board for the day: today's par, where you stand, the ranked list, and a Play button. */
export function renderBench(root, { bench, name, onPlay }) {
  const best = crewBest(bench);
  const list = h('ol', { class: 'bn-list', 'aria-label': 'Crew board' },
    ...bench.entries.map((e) => h('li', { class: e.name === name ? 'is-you' : '' }, h('b', { text: e.name }), h('span', { text: `${e.moves} turns · ${e.time} s · ${overPar(e.moves, bench.par)}` }))));
  const play = h('button', { type: 'button', class: 'primary bn-play', text: "Play today's board" });
  play.addEventListener('click', () => onPlay());
  root.replaceChildren(
    h('p', { class: 'bn-day', text: `Bench board for day ${bench.day}: a 5 x 5 board, 50 seconds, par ${bench.par} turns. Same board for everyone.` }),
    h('p', { class: 'bn-stand', role: 'status', text: standing(bench, name) }),
    best ? h('p', { class: 'bn-best', text: `Crew best: ${best.name} with ${best.moves} turns.` }) : h('p', { class: 'bn-best', text: 'Nobody has sealed it yet.' }),
    list, play);
}

/** Open today's board in a stage; resolves with the repair result. */
export const playBench = (stage, day, reducedMotion) => playRepair(stage, { seed: benchSeed(day), setup: { ...BENCH_SETUP, label: 'Bench' }, title: 'Bench board', reducedMotion });

// Which URL ids carry each category's points on the minigames dev page.
const URL_ID = { time: 'time', size: 'size', quality: 'quality', retries: 'retries', persuade: 'persuade', intimidate: 'intimidate', haggle: 'haggle', speed: 'speed', material: 'material', fuel: 'fuel', warning: 'warning', quiet: 'quiet', range: 'range', decay: 'decay', handling: 'handling', boost: 'boost', landing: 'landing' };

/** The gym: one card per game with the cost, the quarter-XP pay, what is left this hour, and a Train link at a Steady roll. */
export function renderGym(root, { wallet, log, now, level, onResult }) {
  const cards = GYM_GAMES.map((g) => {
    const points = Object.fromEntries(g.cats.map((c, i) => [c, i === 0 ? level : 0]));
    const setup = gymSetup(g.id, { level, points });
    const left = leftThisHour(log, g.skill, now);
    const q = new URLSearchParams({ newgame: '1', mini: g.id, roll: '10', dc: String(10 + level), level: String(level), auto: '1' });
    for (const c of g.cats) if (points[c] && URL_ID[c]) q.set(URL_ID[c], String(points[c]));
    const train = h('a', { class: `gm-train${wallet < GYM.cost ? ' is-off' : ''}`, href: `./index.html?${q}`, text: `Train (${GYM.cost} credits)` });
    if (wallet < GYM.cost) train.setAttribute('aria-disabled', 'true');
    const win = h('button', { type: 'button', text: 'Stand-in: I won' }), lose = h('button', { type: 'button', text: 'Stand-in: I lost' });
    win.addEventListener('click', () => onResult(g.id, { success: true, xp: 8 })); lose.addEventListener('click', () => onResult(g.id, { success: false, xp: 0 }));
    return h('li', { class: 'gm-card', 'data-game': g.id },
      h('b', { text: g.name }), h('span', { class: 'gm-skill', text: `${g.skill}, always a ${setup.label} roll` }),
      h('span', { text: `A win pays a quarter of the field XP (a job that pays 8 pays ${gymXp(8)}). ${left} of ${GYM.capXp} XP left this hour.` }),
      h('div', { class: 'gm-row' }, train, win, lose));
  });
  root.replaceChildren(h('p', { class: 'bn-day', role: 'status', id: 'gm-wallet', text: `You have ${wallet} credits. Training at your level ${level} with its first category maxed. No job is at risk.` }), h('ul', { class: 'gm-list' }, ...cards));
}
