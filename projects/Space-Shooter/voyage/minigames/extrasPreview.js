// Dev page for the skill extras. Closed unless ?newgame=1. Everything lives in memory.
// ?newgame=1&skill=repair selects a skill. Buttons stand in for play: earn XP, scan, die.
// ?save=1 keeps it all in a preview save instead (reload and it is still there); the point
// picker, the XP claims, the scan and the death go through voyage/skillSave.js, so they use
// the same rules the hub holds. Add &vserver=1 (and &hub=http://localhost:3100) to use the hub.
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { newProgress, addXp, scanSnapshot, reprint } from './progress.js';
import { renderRisk, renderSkills, renderPicker } from './extrasView.js';
import { dayNumber, createBench, submit } from './bench.js';
import { renderBench, playBench, renderGym } from './extras2View.js';
import { trainRun, newGymLog } from './gym.js';
import { createVoyageStore } from '../store.js';
import { createSkillSave, scan as scanChar } from '../skillSave.js';
import { economy } from '../account.js';
import { serverMode, probeSession } from '../session.js';
import { createRunRecorder } from '../../systems/hubRuns.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
if (!flag.enabled) $('mg-closed').hidden = false;
else boot();

// ?save=1: the preview save, the economy client when the home server is on, and one skill-save facade over both.
async function setupSave(params) {
  const store = createVoyageStore({ key: 'preview.stardust.voyage.skillsave.v1' });
  if (!store.get().character) {
    store.createCharacter({ name: 'Preview Captain', look: { portrait: 'p1', color: '#81e6df' } });
    // A captain mid-career: Repair 3, Hacking 2, one Repair point spent, then scanned.
    store.update((s) => ({ ...s, character: scanChar({ ...s.character, levels: { ...s.character.levels, repair: 3, hacking: 2 }, xp: { repair: 250, hacking: 100 }, points: { repair: { time: 1 } } }) }));
  }
  let hub = false;
  if (serverMode({ config: runtimeConfig, search: location.search })) {
    const recorder = createRunRecorder();
    await recorder.connect();
    const session = await probeSession({ api: recorder.api, gamePath: recorder.gamePath, signedIn: Boolean(recorder.player) });
    if (session.mode === 'play') { economy.enable({ api: recorder.api, gamePath: recorder.gamePath, store, toast: () => {} }); await economy.pull(); hub = true; }
  }
  return { store, sk: createSkillSave({ store, economy }), hub };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const saved = params.get('save') === '1' ? await setupSave(params) : null; // the page opens once the save (and the hub, if on) has answered
  $('mg-page').hidden = false;
  const sk = saved?.sk || null;
  // A starting captain who has just been scanned, with Repair already at level 3 and 2 of its points unspent.
  let progress = newProgress();
  progress = addXp(progress, 'repair', 20 + 40 + 5).progress; // level 3
  progress = addXp(progress, 'hacking', 25).progress; // level 2
  progress.points = { repair: { time: 1 } };
  let snap = scanSnapshot(progress);
  const reread = () => { if (sk) { const v = sk.view(); progress = v.progress; snap = v.scan; } };
  reread();
  let selected = ['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation'].includes(params.get('skill')) ? params.get('skill') : 'repair';
  const log = [];
  const root = $('ex-root');
  const doc = (tag, cls, ...kids) => { const e = document.createElement(tag); e.className = cls; e.append(...kids); return e; };
  const colRisk = doc('section', 'ex-col'), colPlay = doc('section', 'ex-col');
  const riskBox = doc('div', 'ex-riskbox'), logEl = doc('p', 'rp-help');
  logEl.setAttribute('role', 'status'); logEl.id = 'ex-log';
  colRisk.append(Object.assign(document.createElement('h2'), { textContent: 'What a death costs' }), riskBox);
  const play = (label, fn, cls = '') => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: cls }); b.addEventListener('click', () => { fn(); draw(); }); return b; };
  const playAsync = (label, fn, cls = '') => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: cls }); b.addEventListener('click', () => { fn(); }); return b; };
  const say = (r, ok) => { logEl.textContent = r.ok ? ok : r.words; };
  const claim = (game, xp, what) => async () => { const r = await sk.claim(game, xp); reread(); say(r, `${what}: +${Object.values(r.paid?.xp || r.paid || {})[0] ?? xp} XP.`); draw(); };
  const earn = (skill, xp, what) => () => { const r = addXp(progress, skill, xp); progress = r.progress; logEl.textContent = `${what}: +${xp} ${skill} XP${r.gained ? `, level up (${r.gained})` : ''}.`; };
  const modeLine = doc('p', 'rp-help'); modeLine.id = 'ex-mode';
  modeLine.textContent = sk ? (saved.hub ? 'Saved on the Guild bank. The home server checks every spend and every XP claim.' : 'Saved in this browser. Reload and it is still here.') : 'Nothing is saved: this page keeps it in memory.';
  colPlay.append(Object.assign(document.createElement('h2'), { textContent: 'Stand-ins for play' }), modeLine,
    ...(sk ? [
      playAsync('Win a repair (+6 Repair XP)', claim('repair', 6, 'Won a repair')),
      playAsync('Win a hack (+5 Hacking XP)', claim('hack', 5, 'Won a hack')),
      playAsync('Win a haggle (+4 Social XP)', claim('haggle', 4, 'Won a haggle')),
      playAsync('Claim 30 Repair XP in one win', claim('repair', 30, 'Claimed 30')),
      playAsync('Scan: save here', async () => { const r = await sk.scan(); reread(); say(r, 'Scanned. Everything so far is safe.'); draw(); }, 'primary'),
      playAsync('Die: reprint from the scan', async () => { const r = await sk.restore(); reread(); say(r, 'Reprinted from your last scan. Progress since then is gone.'); draw(); }),
    ] : [
    play('Seal a patch (+6 Repair XP)', earn('repair', 6, 'Sealed a patch')),
    play('Open a lock (+5 Hacking XP)', earn('hacking', 5, 'Opened a lock')),
    play('Win a haggle (+4 Social XP)', earn('social', 4, 'Won a haggle')),
    play('Big job (+30 Repair XP)', earn('repair', 30, 'Big job')),
    play('Scan: save here', () => { snap = scanSnapshot(progress); logEl.textContent = 'Scanned. Everything so far is safe.'; }, 'primary'),
    play('Die: reprint from the scan', () => { progress = reprint(progress, snap); logEl.textContent = 'Reprinted from your last scan. Progress since then is gone.'; }),
    ]), logEl);
  // The bench board: today's board for everyone; a crew with a few names already on it.
  const day = Number(params.get('day')) || dayNumber(Date.now());
  const bench = createBench(day), me = 'You';
  [['Mae', 1, 31], ['Tull', 4, 27], ['Ode', 7, 44]].forEach(([n, over, t]) => submit(bench, { name: n, success: true, moves: bench.par + over, time: t }));
  const colBench = doc('section', 'ex-col'), benchBox = doc('div', '');
  colBench.append(Object.assign(document.createElement('h2'), { textContent: 'Bench board' }), benchBox, doc('div', 'bn-stage'));
  const benchStage = colBench.lastChild;
  const drawBench = () => renderBench(benchBox, { bench, name: me, onPlay: async () => { benchStage.replaceChildren(); const r = await playBench(benchStage, day, () => matchMedia('(prefers-reduced-motion: reduce)').matches); submit(bench, { name: me, success: r.success, moves: r.moves, time: r.time }); drawBench(); } });
  // The holodeck gym.
  let wallet = Number(params.get('credits') ?? 60), gymLog = newGymLog();
  const colGym = doc('section', 'ex-col ex-gym'), gymBox = doc('div', '');
  colGym.append(Object.assign(document.createElement('h2'), { textContent: 'Holodeck gym' }), gymBox);
  const drawGym = () => renderGym(gymBox, { progress, selected, wallet, log: gymLog, now: Date.now(), onSelect: (id) => { selected = id; draw(); }, canTakeBack: !sk, onPoints: sk
      ? async (skill, pts) => { const r = await sk.spend(skill, pts); reread(); if (!r.ok) logEl.textContent = r.words; draw(); }
      : (skill, pts) => { progress = { ...progress, points: { ...progress.points, [skill]: pts } }; draw(); },
    onResult: async (id, result) => { const r = trainRun(id, { credits: wallet, log: gymLog, now: Date.now(), result }); wallet = r.credits; gymLog = r.log; logEl.textContent = r.said; if (sk && r.paid > 0) { const c = await sk.claim(id, r.paid); reread(); if (!c.ok) logEl.textContent = c.words; draw(); } else drawGym(); } });
  window.__skillsave = sk ? { sk, store: saved.store } : null;
  window.__bench = { bench, get wallet() { return wallet; }, get gymLog() { return gymLog; } };
  root.append(colRisk, colGym, colPlay, colBench);
  drawBench();
  function draw() {
    renderRisk(riskBox, { progress, snap });
    drawGym();
    window.__extras = { progress, snap, selected };
  }
  draw();
}
