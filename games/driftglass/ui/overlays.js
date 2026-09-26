/**
 * @fileoverview Manages DOM overlays for the Starmap game (start, pause, end).
 * LOCAL-ONLY version — no server API calls.
 */
import { playMusic, setMusicVolume, setSfxVolume } from '../audio.js';
import { state } from '../state.js';
import { startNewRun, retryRun, quitRun } from '../engine/index.js';
import { toast } from './hud.js';
import { enterFullscreen, exitFullscreen } from './graphics.js';
import { enableTiltControls, disableTiltControls } from '../systems/tilt.js';
import { isMobileViewport } from '../utils/view.js';


// --- ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const startOverlay = getEl('starmap-start');
const pauseOverlay = getEl('starmap-pause');
const endOverlay = getEl('starmap-end');
const settingsOverlay = getEl('starmap-settings');

// Victory overlay element refs
const victoryOverlay = getEl('starmap-victory');
const victoryTitle = getEl('victory-title');
const victoryMessage = getEl('victory-message');
const victoryContinueBtn = getEl('victory-continue-btn');

// Defeat overlay refs
const defeatOverlay = getEl('starmap-defeat');
const defeatMsg = getEl('defeat-message');
const defeatCountdown = getEl('defeat-countdown');
const defeatCloseBtn = getEl('defeat-close-btn');

const startBtn = getEl('starmap-start-btn');
const resumeBtn = getEl('starmap-resume-btn');
const retryBtn = getEl('starmap-retry-btn');
const quitBtn = getEl('starmap-quit-btn');
const againBtn = getEl('starmap-again-btn');
const settingsBtnStart = getEl('starmap-settings-btn-start');
const settingsBtnPause = getEl('starmap-settings-btn-pause');
const settingsSaveBtn = getEl('settings-save-btn');
const settingsCancelBtn = getEl('settings-cancel-btn');
const endTitle = getEl('starmap-end-title');
const tiltToggle = getEl('starmap-tilt-toggle');

// Settings form elements
const musicVolSlider = getEl('setting-music-vol');
const musicVolValue = getEl('setting-music-val');
const sfxVolSlider = getEl('setting-sfx-vol');
const sfxVolValue = getEl('setting-sfx-val');
const invertThrustCheckbox = getEl('setting-invert-thrust');


let overlaysInitialized = false;


function enableTouchControls() {
  const container = getEl('starmap-touch-controls');
  if (container) container.style.display = 'flex';
  state.input.touch.active = true;
}

function disableTouchControls() {
  const container = getEl('starmap-touch-controls');
  if (container) container.style.display = 'none';
  state.input.touch.active = false;
}

// Request fullscreen and attempt to lock orientation.
async function requestFullscreenAndOrientation() {
  const rootElement = document.documentElement;
  if (rootElement?.requestFullscreen) {
    rootElement.requestFullscreen().catch((err) => {
      console.log('Could not enter fullscreen mode:', err);
    });
  }

  if (screen?.orientation?.lock) {
    try {
      await screen.orientation.lock('landscape');
    } catch (err) {
      console.log('Orientation lock failed:', err);
      toast('Rotate your device for landscape play.');
    }
  } else {
    toast('Rotate your device for landscape play.');
  }
}


export function initOverlays() {
  if (overlaysInitialized) return;

  // Main game flow buttons
  startBtn?.addEventListener('click', () => {
    enterFullscreen();

    requestFullscreenAndOrientation();
    if (isMobileViewport()) {
      sessionStorage.setItem('mobileMode', '1');
      enableTouchControls();
    }

    closeStartOverlay();
    playMusic('background');
    startNewRun();
  });
  resumeBtn?.addEventListener('click', closePauseOverlay);
  retryBtn?.addEventListener('click', retryRun);
  quitBtn?.addEventListener('click', quitRun);
  againBtn?.addEventListener('click', () => {
    closeEndOverlay();
    startNewRun();
  });

  if (tiltToggle) {
    tiltToggle.checked = state.input.touch.useTilt;
    tiltToggle.addEventListener('change', () => {
      if (tiltToggle.checked) {
        enableTiltControls();
      } else {
        disableTiltControls();
      }
    });
  }

  // Settings buttons
  settingsBtnStart?.addEventListener('click', openSettingsOverlay);
  settingsBtnPause?.addEventListener('click', openSettingsOverlay);
  settingsSaveBtn?.addEventListener('click', () => {
    const newSettings = {
      musicVolume: parseFloat(musicVolSlider.value),
      sfxVolume: parseFloat(sfxVolSlider.value),
      invertThrustAxis: !!invertThrustCheckbox?.checked,
    };
    saveUserSettings(newSettings);
    closeSettingsOverlay();
  });
  settingsCancelBtn?.addEventListener('click', closeSettingsOverlay);

  // Victory overlay listener
  victoryContinueBtn?.addEventListener('click', () => {
    if (victoryOverlay) victoryOverlay.classList.add('hidden');
    // Return to start screen
    openStartOverlay();
  });

  // Defeat overlay close
  defeatCloseBtn?.addEventListener('click', () => {
    if (defeatOverlay) defeatOverlay.classList.add('hidden');
  });

  // Settings slider value displays
  musicVolSlider?.addEventListener('input', () => {
    musicVolValue.textContent = `${Math.round(musicVolSlider.value * 100)}%`;
    setMusicVolume(parseFloat(musicVolSlider.value));
  });
  sfxVolSlider?.addEventListener('input', () => {
    sfxVolValue.textContent = `${Math.round(sfxVolSlider.value * 100)}%`;
    setSfxVolume(parseFloat(sfxVolSlider.value));
  });

  // Load settings from localStorage
  loadUserSettings();

  overlaysInitialized = true;
}

// --- VICTORY OVERLAY ---
export function openVictoryOverlay(data) {
  const event = new CustomEvent('gateVictory', { detail: data });
  window.dispatchEvent(event);
  if (document.fullscreenElement) {
    try { document.exitFullscreen().catch(() => { }); } catch { }
  }
  if (victoryOverlay) victoryOverlay.classList.remove('hidden');
  if (victoryTitle) victoryTitle.textContent = 'Victory';
  if (victoryMessage) victoryMessage.textContent = data?.message || 'You defeated the Warden.';
}

// --- START ---
export async function openStartOverlay() {
  if (startOverlay) startOverlay.classList.remove('hidden');
  state.ui.showStartOverlay = true;

  sessionStorage.removeItem('mobileMode');
  disableTouchControls();
}

function closeStartOverlay() {
  if (startOverlay) startOverlay.classList.add('hidden');
  state.ui.showStartOverlay = false;
}

// --- PAUSE ---
export function openPauseOverlay() {
  exitFullscreen();
  if (pauseOverlay) pauseOverlay.classList.remove('hidden');
  state.ui.paused = true;
}
export function closePauseOverlay() {
  if (pauseOverlay) pauseOverlay.classList.add('hidden');
  state.ui.paused = false;
  // Resume timer if paused
  const lv = state.run?.current;
  if (lv && !lv.timerRunning) {
    lv.t0 = performance.now();
    lv.timerRunning = true;
  }
}

// --- END ---
export function openEndOverlay(formattedTime) {
  // Do not show roadmap end overlay if currently in arena mode
  if (state.mode === 'arena') return;
  if (endTitle) endTitle.textContent = `Run Complete! Time: ${formattedTime}`;
  if (endOverlay) endOverlay.classList.remove('hidden');
  state.ui.showEndOverlay = true;
  state.ui.paused = true;
}
export function closeEndOverlay() {
  if (endOverlay) endOverlay.classList.add('hidden');
  state.ui.showEndOverlay = false;
}

// --- SETTINGS ---
export function openSettingsOverlay(e) {
  e?.preventDefault?.();

  const overlay = document.getElementById('starmap-settings');
  if (!overlay) return;

  const mSlider = overlay.querySelector('#setting-music-vol');
  const mValue = overlay.querySelector('#setting-music-val');
  const sSlider = overlay.querySelector('#setting-sfx-vol');
  const sValue = overlay.querySelector('#setting-sfx-val');
  const invert = overlay.querySelector('#setting-invert-thrust');

  if (mSlider) mSlider.value = state.settings.musicVolume;
  if (mValue) mValue.textContent = `${Math.round(state.settings.musicVolume * 100)}%`;
  if (sSlider) sSlider.value = state.settings.sfxVolume;
  if (sValue) sValue.textContent = `${Math.round(state.settings.sfxVolume * 100)}%`;
  if (invert) invert.checked = !!state.settings.invertThrustAxis;

  overlay.classList.remove('hidden');
  state.ui.showSettingsOverlay = true;
  state.ui.paused = true;
}

export function closeSettingsOverlay() {
  if (settingsOverlay) settingsOverlay.classList.add('hidden');
  state.ui.showSettingsOverlay = false;
  if (!state.ui.showStartOverlay) {
    state.ui.paused = false;
  }
}

// --- SETTINGS DATA (localStorage only) ---
function loadUserSettings() {
  try {
    const raw = localStorage.getItem('starmap.settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      applySettings({
        musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : state.settings.musicVolume,
        sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : state.settings.sfxVolume,
        invertThrustAxis: typeof parsed.invertThrustAxis === 'boolean' ? parsed.invertThrustAxis : state.settings.invertThrustAxis,
      });
    }
  } catch (e) {
    // ignore
  }
}

function saveUserSettings(newSettings) {
  applySettings(newSettings);
  try { localStorage.setItem('starmap.settings', JSON.stringify(newSettings)); } catch (e) { }
  toast('Settings saved!');
}

// Helper to apply settings to the game state and audio systems
function applySettings(settings) {
  if (typeof settings.musicVolume === 'number') {
    state.settings.musicVolume = settings.musicVolume;
    setMusicVolume(settings.musicVolume);
  }
  if (typeof settings.sfxVolume === 'number') {
    state.settings.sfxVolume = settings.sfxVolume;
    setSfxVolume(settings.sfxVolume);
  }
  if (typeof settings.invertThrustAxis === 'boolean') {
    state.settings.invertThrustAxis = settings.invertThrustAxis;
  }
}


// --- DEFEAT ---
export function openDefeatOverlay(data) {
  if (!defeatOverlay) return;
  // Local-only: no lockout timer
  if (defeatMsg) defeatMsg.textContent = 'You were defeated. Try again anytime.';
  if (defeatCountdown) defeatCountdown.textContent = '';
  defeatOverlay.classList.remove('hidden');
}