// Dev page for the skill extras. Closed unless ?newgame=1. Everything lives in memory.
// ?newgame=1&skill=repair selects a skill. Buttons stand in for play: earn XP, scan, die.
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { newProgress, addXp, scanSnapshot, reprint } from './progress.js';
import { renderRisk, renderSkills, renderPicker } from './extrasView.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
if (!flag.enabled) $('mg-closed').hidden = false;
else boot();

function boot() {
  $('mg-page').hidden = false;
  const params = new URLSearchParams(location.search);
  // A starting captain who has just been scanned, with Repair already at level 3 and 2 of its points unspent.
  let progress = newProgress();
  progress = addXp(progress, 'repair', 20 + 40 + 5).progress; // level 3
  progress = addXp(progress, 'hacking', 25).progress; // level 2
  progress.points = { repair: { time: 1 } };
  let snap = scanSnapshot(progress);
  let selected = ['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation'].includes(params.get('skill')) ? params.get('skill') : 'repair';
  const log = [];
  const root = $('ex-root');
  const doc = (tag, cls, ...kids) => { const e = document.createElement(tag); e.className = cls; e.append(...kids); return e; };
  const colRisk = doc('section', 'ex-col'), colSkills = doc('section', 'ex-col'), colPick = doc('section', 'ex-col'), colPlay = doc('section', 'ex-col');
  const riskBox = doc('div', 'ex-riskbox'), skillBox = doc('div', ''), pickBox = doc('div', ''), logEl = doc('p', 'rp-help');
  logEl.setAttribute('role', 'status'); logEl.id = 'ex-log';
  colRisk.append(Object.assign(document.createElement('h2'), { textContent: 'What a death costs' }), riskBox);
  colSkills.append(Object.assign(document.createElement('h2'), { textContent: 'Skills' }), skillBox);
  colPick.append(Object.assign(document.createElement('h2'), { textContent: 'Spend points' }), pickBox);
  const play = (label, fn, cls = '') => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: cls }); b.addEventListener('click', () => { fn(); draw(); }); return b; };
  const earn = (skill, xp, what) => () => { const r = addXp(progress, skill, xp); progress = r.progress; logEl.textContent = `${what}: +${xp} ${skill} XP${r.gained ? `, level up (${r.gained})` : ''}.`; };
  colPlay.append(Object.assign(document.createElement('h2'), { textContent: 'Stand-ins for play' }),
    play('Seal a patch (+6 Repair XP)', earn('repair', 6, 'Sealed a patch')),
    play('Open a lock (+5 Hacking XP)', earn('hacking', 5, 'Opened a lock')),
    play('Win a haggle (+4 Social XP)', earn('social', 4, 'Won a haggle')),
    play('Big job (+30 Repair XP)', earn('repair', 30, 'Big job')),
    play('Scan: save here', () => { snap = scanSnapshot(progress); logEl.textContent = 'Scanned. Everything so far is safe.'; }, 'primary'),
    play('Die: reprint from the scan', () => { progress = reprint(progress, snap); logEl.textContent = 'Reprinted from your last scan. Progress since then is gone.'; }),
    logEl);
  root.append(colRisk, colSkills, colPick, colPlay);
  function draw() {
    renderRisk(riskBox, { progress, snap });
    renderSkills(skillBox, { progress, selected }, (id) => { selected = id; draw(); });
    renderPicker(pickBox, { progress, selected }, (skill, pts) => { progress = { ...progress, points: { ...progress.points, [skill]: pts } }; draw(); });
    window.__extras = { progress, snap, selected };
  }
  draw();
}
