import { playMusic, stopMusic, playGateMotif, setMusicVolume, setSfxVolume } from '../audio.js';
import { state } from '../state.js';
import { startNewRun, retryRun, quitRun } from '../engine/index.js';
import { exitArena } from '../engine/modeManager.js';
import { pauseTimer } from '../engine/modes/roadmap.js';
import { decryptShard, abandonSeal } from '../engine/api.js';
import { GLYPHS, sealRemaining, readDiscoveries } from '../systems/progression.js';
import { toast } from './hud.js';
import { enableTiltControls, disableTiltControls, calibrateTiltControls, getTiltState, subscribeTilt } from '../systems/tilt.js';
import { toggleFullscreen } from './graphics.js';
import { watchFullscreen } from '../systems/mobileControls.js';
import { isMobileViewport } from '../utils/view.js';
import { showFinishScreen, dismissFinishScreen } from './finishScreen.js';
const el = id => document.getElementById(id);
const show = id => el(id)?.classList.remove('hidden');
const hide = id => el(id)?.classList.add('hidden');
let initialized = false;
let settingsReturnPaused = false;
let settingsOpener = null;
let seal = null;
let sealInterval = 0;
let sequence = [];
let lastSealSecond = -1;

function focusFlight() {
  const canvas = el('starmap-canvas');
  if (!canvas) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}
function setTouchControls(enabled) {
  if (!enabled) window.dispatchEvent(new Event('stardust:clear-input'));
  state.input.touch.active = enabled;
  el('starmap-touch-controls')?.classList.toggle('hidden', !enabled);
}
function wantsTouchControls() {
  return isMobileViewport() || !!window.matchMedia?.('(any-pointer: coarse)').matches;
}
function syncTouchControls() {
  setTouchControls(wantsTouchControls() && !!state.run && !state.ui.paused && !state.ui.showStartOverlay && !state.ui.showEndOverlay && !state.ui.showDefeatOverlay && !state.arena?.victoryPresented);
}
function renderTiltControls(tilt) {
  const busy = tilt.status === 'requesting' || tilt.status === 'calibrating';
  for (const button of document.querySelectorAll('[data-tilt-enable]')) {
    button.textContent = tilt.enabled ? 'Disable tilt' : busy ? 'Enabling…' : 'Enable tilt';
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(tilt.enabled));
  }
  for (const button of document.querySelectorAll('[data-tilt-recenter]')) button.disabled = !tilt.enabled;
  for (const status of document.querySelectorAll('[data-mobile-status]')) status.textContent = tilt.message || 'Tilt is off. Use ◀ / ▶ to steer.';
  el('touch-steering-fallback')?.classList.toggle('hidden', tilt.enabled);
}
function leaveChallenge() {
  clearInterval(sealInterval);
  sealInterval = 0;
  seal = null;
  abandonSeal();
  hide('starmap-victory');
  hide('starmap-defeat');
  state.ui.showDefeatOverlay = false;
  if (state.mode === 'arena') exitArena('quit');
  quitRun();
}
// The last launch, so "Fly again" repeats it: the network or the custom track.
let lastLaunch = { kind: 'network', preview: false };
/** Leave the hangar and fly: { kind: 'network' | 'custom' | 'weekly', preview, event, ship }. ship: 'equipped' flies a weekly preview as the equipped garage build. */
export function launchRun(options = {}) {
  // The first activation hides the launch screen; queued taps must not start another run.
  if (!state.ui.showStartOverlay && !state.ui.showEndOverlay) return;
  dismissFinishScreen();
  const kind = ['custom', 'weekly'].includes(options.kind) ? options.kind : 'network';
  lastLaunch = { kind, preview: !!options.preview, event: kind === 'weekly' ? options.event : null, ship: kind === 'weekly' && options.preview ? options.ship || null : null };
  hide('starmap-start');
  hide('starmap-end');
  state.ui.showStartOverlay = false;
  state.ui.showEndOverlay = false;
  state.ui.paused = false;
  setTouchControls(wantsTouchControls());
  startNewRun(lastLaunch);
  focusFlight();
}
export function initOverlays() {
  if (initialized) return;
  initialized = true;
  el('starmap-start-btn')?.addEventListener('click', () => launchRun({ kind: 'network' }));
  el('starmap-resume-btn')?.addEventListener('click', closePauseOverlay);
  el('starmap-retry-btn')?.addEventListener('click', () => { retryRun(); syncTouchControls(); focusFlight(); });
  el('starmap-quit-btn')?.addEventListener('click', leaveChallenge);
  el('starmap-again-btn')?.addEventListener('click', () => launchRun(lastLaunch));
  el('starmap-end-menu-btn')?.addEventListener('click', leaveChallenge);
  el('victory-continue-btn')?.addEventListener('click', leaveChallenge);
  el('defeat-close-btn')?.addEventListener('click', leaveChallenge);
  for (const id of ['starmap-settings-btn-start', 'starmap-settings-btn-pause']) el(id)?.addEventListener('click', openSettingsOverlay);
  el('settings-save-btn')?.addEventListener('click', () => {
    const settings = {
      musicVolume: Number(el('setting-music-vol').value), sfxVolume: Number(el('setting-sfx-vol').value),
      invertThrustAxis: el('setting-invert-thrust').checked, reducedMotion: el('setting-reduced-motion').checked,
    };
    applySettings(settings);
    try { localStorage.setItem('starmap.settings', JSON.stringify(settings)); } catch { toast('Settings apply for this session; browser storage is unavailable.'); }
    closeSettingsOverlay();
  });
  el('settings-cancel-btn')?.addEventListener('click', () => {
    setMusicVolume(state.settings.musicVolume); setSfxVolume(state.settings.sfxVolume); closeSettingsOverlay();
  });
  for (const [id, label, setter] of [['setting-music-vol','setting-music-val',setMusicVolume], ['setting-sfx-vol','setting-sfx-val',setSfxVolume]]) {
    el(id)?.addEventListener('input', () => { el(label).textContent = `${Math.round(el(id).value * 100)}%`; setter(Number(el(id).value)); });
  }
  for (const button of document.querySelectorAll('[data-tilt-enable]')) button.addEventListener('click', () => {
    // Keep permission request directly on the user gesture for iOS.
    if (getTiltState().enabled) { disableTiltControls(); if (!state.ui.paused) focusFlight(); }
    else enableTiltControls().then(() => { if (!state.ui.paused) focusFlight(); });
  });
  for (const button of document.querySelectorAll('[data-tilt-recenter]')) button.addEventListener('click', () => { calibrateTiltControls(); if (!state.ui.paused) focusFlight(); });
  for (const button of document.querySelectorAll('[data-fullscreen]')) button.addEventListener('click', async () => {
    const result = await toggleFullscreen();
    if (result?.message) {
      for (const status of document.querySelectorAll('[data-mobile-status]')) status.textContent = result.message;
      if (!result.ok) toast(result.message, 5000);
    }
    if (!state.ui.paused) focusFlight();
  });
  el('touch-pause')?.addEventListener('click', () => {
    if (state.mode !== 'arena') openPauseOverlay();
  });
  el('touch-map')?.addEventListener('click', () => {
    if (state.mode !== 'arena') state.ui.showMinimap = !state.ui.showMinimap;
  });
  subscribeTilt(renderTiltControls);
  renderTiltControls(getTiltState());
  watchFullscreen(active => {
    for (const button of document.querySelectorAll('[data-fullscreen]')) {
      button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
      button.setAttribute('aria-pressed', String(active));
    }
  });
  window.addEventListener('resize', syncTouchControls, { passive: true });
  window.matchMedia?.('(any-pointer: coarse)')?.addEventListener?.('change', syncTouchControls);
  el('seal-reset')?.addEventListener('click', resetSequence);
  el('seal-submit')?.addEventListener('click', submitSequence);
  window.addEventListener('blur', () => {
    if (state.run && state.mode === 'roadmap' && !state.ui.showStartOverlay && !state.ui.showEndOverlay && !state.ui.showSettingsOverlay) openPauseOverlay();
  });
  document.addEventListener('keydown', trapOverlayFocus);
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  applySettings({ reducedMotion: motion });
  try { const saved = JSON.parse(localStorage.getItem('starmap.settings') || '{}'); if (saved && typeof saved === 'object') applySettings(saved); } catch { }
}
function trapOverlayFocus(event) {
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && state.ui.showSettingsOverlay && !document.querySelector('[data-bind-key].is-waiting, [data-bind-pad].is-waiting')) {
    event.preventDefault();
    el('settings-cancel-btn')?.click();
    return;
  }
  if (event.key !== 'Tab') return;
  const panel = [...document.querySelectorAll('.overlay-panel:not(.hidden)')].at(-1);
  if (!panel) return;
  const targets = [...panel.querySelectorAll('button:not(:disabled), a[href], input, summary')].filter(node => node.getClientRects().length && node.tabIndex >= 0);
  if (!targets.length) return;
  const first = targets[0], last = targets.at(-1);
  if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { last.focus(); event.preventDefault(); }
  else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { first.focus(); event.preventDefault(); }
}
export async function openStartOverlay() {
  playMusic('menu');
  hide('starmap-pause'); hide('starmap-end');
  show('starmap-start');
  state.ui.showStartOverlay = true;
  state.ui.showEndOverlay = false;
  state.ui.paused = true;
  setTouchControls(false);
  hide('flight-briefing'); hide('flight-controls'); hide('mission-tracker');
  el('starmap-start-btn')?.focus({ preventScroll: true });
  const discoveries = readDiscoveries();
  const remembered = discoveries['Stardust Remembers'];
  if (el('local-discoveries')) el('local-discoveries').textContent = remembered ? '✦ Stardust Remembers — discovered on this browser.' : '';
}
export function openPauseOverlay() {
  if (state.mode === 'arena' || state.ui.showStartOverlay || state.ui.showEndOverlay || state.ui.showSettingsOverlay || state.ui.showDefeatOverlay) return;
  pauseTimer(); state.ui.paused = true; setTouchControls(false);
  show('starmap-pause');
  el('starmap-resume-btn')?.focus();
}
export function closePauseOverlay() {
  if (state.ui.showDefeatOverlay) return;
  hide('starmap-pause'); state.ui.paused = false; syncTouchControls(); focusFlight();
}
export function openEndOverlay(formattedTime, { kind = 'network', title = 'Custom track', preview = false, previousMs } = {}) {
  if (state.mode === 'arena') return;
  playMusic('victory'); setTouchControls(false);
  showFinishScreen({ timeMs: state.run?.totalActiveMs, kind, title, preview, previousMs });
  show('starmap-end'); state.ui.showEndOverlay = true; state.ui.paused = true;
  el('starmap-again-btn')?.focus({ preventScroll: true });
}
export function closeEndOverlay() { dismissFinishScreen(); hide('starmap-end'); state.ui.showEndOverlay = false; }
export function openSettingsOverlay(event) {
  event?.preventDefault?.();
  if (state.ui.showSettingsOverlay) return;
  settingsOpener = event?.currentTarget || document.activeElement;
  settingsReturnPaused = state.ui.paused;
  pauseTimer(); state.ui.paused = true; state.ui.showSettingsOverlay = true; setTouchControls(false);
  for (const [id, label, value] of [['setting-music-vol','setting-music-val',state.settings.musicVolume], ['setting-sfx-vol','setting-sfx-val',state.settings.sfxVolume]]) {
    el(id).value = value; el(label).textContent = `${Math.round(value*100)}%`;
  }
  el('setting-invert-thrust').checked = !!state.settings.invertThrustAxis;
  el('setting-reduced-motion').checked = !!state.settings.reducedMotion;
  show('starmap-settings');
  el('starmap-settings')?.querySelector('.fx-tabs button, #settings-save-btn')?.focus();
}
export function closeSettingsOverlay() {
  hide('starmap-settings'); state.ui.showSettingsOverlay = false; state.ui.paused = settingsReturnPaused; syncTouchControls();
  if (settingsOpener?.isConnected && settingsOpener.getClientRects().length) settingsOpener.focus({ preventScroll: true });
  else if (state.ui.showStartOverlay) el('starmap-start-btn').focus();
  else if (state.ui.paused) el('starmap-resume-btn').focus();
  else focusFlight();
}
function applySettings(settings) {
  for (const key of ['musicVolume','sfxVolume']) if (Number.isFinite(settings[key])) state.settings[key] = Math.min(1, Math.max(0, settings[key]));
  for (const key of ['invertThrustAxis','reducedMotion']) if (typeof settings[key] === 'boolean') state.settings[key] = settings[key];
  document.body.classList.toggle('reduced-motion', !!state.settings.reducedMotion);
  setMusicVolume(state.settings.musicVolume); setSfxVolume(state.settings.sfxVolume);
}
export function openVictoryOverlay(data) {
  if (!data?.ok || !data.seal) return;
  seal = data.seal; sequence = []; lastSealSecond = -1;
  playMusic('riddle'); playGateMotif(true); setTouchControls(false);
  show('starmap-victory'); show('seal-content');
  el('victory-title').textContent = 'The gate remembers.';
  el('victory-message').textContent = 'The Warden falls. Its memory will hold for two minutes.';
  el('seal-feedback').textContent = '';
  el('seal-clues').replaceChildren(...GLYPHS.map(glyph => {
    const li = document.createElement('li'); li.textContent = `${glyph.symbol} ${glyph.clue}`; return li;
  }));
  const buttons = GLYPHS.map(glyph => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.glyph = glyph.id; button.setAttribute('aria-pressed','false');
    const symbol = document.createElement('b'); symbol.textContent = glyph.symbol; symbol.setAttribute('aria-hidden','true');
    button.append(symbol, document.createTextNode(glyph.label));
    button.addEventListener('click', () => {
      if (seal?.status !== 'active' || sequence.includes(glyph.id) || sequence.length >= 4) return;
      sequence.push(glyph.id); renderSequence();
    });
    return button;
  });
  el('seal-glyphs').replaceChildren(...buttons);
  renderSequence(); tickSeal();
  clearInterval(sealInterval); sealInterval = setInterval(tickSeal, 200);
  buttons[0].focus();
}
function renderSequence() {
  el('seal-sequence').textContent = sequence.length ? sequence.map(id => GLYPHS.find(g => g.id === id).label).join(' → ') : 'Choose all four signs.';
  for (const button of el('seal-glyphs').querySelectorAll('button')) button.setAttribute('aria-pressed', String(sequence.includes(button.dataset.glyph)));
  el('seal-submit').disabled = sequence.length !== 4 || seal?.status !== 'active';
}
function resetSequence() { if (seal?.status === 'active') { sequence = []; renderSequence(); } }
function tickSeal() {
  if (!seal || seal.status === 'solved') return;
  const remaining = Math.ceil(sealRemaining(seal) / 1000);
  if (remaining !== lastSealSecond) {
    el('seal-clock').textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
    lastSealSecond = remaining;
  }
  if (remaining <= 0) {
    stopMusic();
    seal.status = 'expired'; clearInterval(sealInterval); hide('seal-content');
    el('victory-title').textContent = 'The seal fractures.';
    el('seal-feedback').textContent = 'Your knowledge remains. Defeat the Warden again to recover another shard.';
    el('victory-continue-btn').focus();
  }
}
async function submitSequence() {
  if (!seal) return;
  const result = await decryptShard(seal.id, [...sequence]);
  if (result.ok) {
    playMusic('victory'); setTouchControls(false);
    clearInterval(sealInterval); hide('seal-content');
    el('victory-title').textContent = 'Stardust Remembers';
    el('victory-message').textContent = 'You returned the memory to its beginning.';
    el('seal-feedback').textContent = result.persisted ? 'Discovery saved on this browser. Local achievement unlocked.' : 'Achievement unlocked for this session. Browser storage is unavailable.';
    el('victory-continue-btn').focus();
  } else if (result.reason === 'expired') tickSeal();
  else { el('seal-feedback').textContent = 'The signs do not align. Read the return path again.'; resetSequence(); }
}
export function openDefeatOverlay() {
  state.ui.showDefeatOverlay = true;
  setTouchControls(false); state.ui.paused = true;
  el('defeat-message').textContent = 'Your ship was lost. The route and its clues are still yours to learn.';
  el('defeat-countdown').textContent = '';
  show('starmap-defeat'); el('defeat-close-btn').focus();
}
