// The race intro that replaced the 3-2-1 countdown: the track's name on a title
// card and READY / SET / GO, and the first time this device flies a track, a
// quick camera flythrough of the whole lap before it. Tap or any key skips the
// flythrough. It rides the existing countdown (scene.countdownT), so the start
// rules and timing are untouched. The HUD stays hidden until GO.
//
// A voice line (READY... SET... GO) is a later addition: drop the file at
// art/ui/voice-ready-set-go.mp3 and set VOICE below.
import { state, config } from '../state.js';
import { pointOnTrack } from '../engine/track.js';
import { flightSettings, updateFlightSettings } from '../systems/flightSettings.js';
import { artImage } from './uiArt.js';

const VOICE = null; // e.g. new URL('../art/ui/voice-ready-set-go.mp3', import.meta.url).href
const FLY_MIN = 3, FLY_MAX = 6, FLY_CELLS_PER_S = 70;

export function introKey(scene) {
  if (scene?.weekly) return `weekly:${scene.weekly.id}:v${scene.weekly.version}`;
  const title = scene?.levelInfo?.title;
  return title ? `track:${title}` : null;
}

/** What the intro will do for this countdown. Pure apart from reading settings. */
export function planIntro(scene, seconds) {
  const key = introKey(scene);
  const track = scene?.track;
  const fly = !!(track && key && seconds >= 3 && !flightSettings().introSeen[key]);
  const flyDur = fly ? Math.max(FLY_MIN, Math.min(FLY_MAX, track.length / FLY_CELLS_PER_S)) : 0;
  return { key, fly, flyDur, ready: seconds, total: flyDur + seconds };
}

function kicker(scene) {
  if (scene?.weekly) return `WEEKLY TIME TRIAL · WEEK ${scene.weekly.week}`;
  if (state.run?.kind === 'custom') return 'CUSTOM TRACK';
  if (Number.isInteger(scene?.level)) return `CIRCUIT ${String(scene.level).padStart(2, '0')} / 05`;
  return '';
}

let els = null;
export function initRaceIntro(root) {
  const card = document.createElement('div');
  card.className = 'fx-intro';
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div class="fx-intro-card"><p class="fx-intro-kicker"></p><h2 class="fx-intro-title"></h2><p class="fx-intro-sub"></p></div><div class="fx-intro-call"><span></span></div><p class="fx-intro-skip">Tap to skip the flythrough</p>';
  root.append(card);
  artImage('title-card-frame', card.querySelector('.fx-intro-card'));
  els = { card, kicker: card.querySelector('.fx-intro-kicker'), title: card.querySelector('.fx-intro-title'), sub: card.querySelector('.fx-intro-sub'), call: card.querySelector('.fx-intro-call span'), skip: card.querySelector('.fx-intro-skip') };
  const skip = (event) => {
    const scene = currentScene();
    const intro = scene?.intro;
    if (!intro?.fly || !state.ui.countdownActive || scene.countdownT <= intro.ready) return;
    if (event?.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    scene.countdownT = intro.ready;
  };
  window.addEventListener('keydown', skip);
  card.addEventListener('pointerdown', skip);
  return els;
}

const currentScene = () => (state.mode === 'arena' ? state.arena : state.run?.current);

let lastWord = '';
/** Per frame: drive the flythrough camera and the card. Returns whether the intro is showing. */
export function updateRaceIntro() {
  if (!els) return false;
  const scene = currentScene();
  const intro = scene?.intro;
  const showing = !!(scene && state.ui.countdownActive && !state.ui.paused && !state.ui.showStartOverlay && !state.ui.showEndOverlay);
  els.card.classList.toggle('is-on', showing);
  document.body.classList.toggle('fx-intro-on', showing);
  if (!showing) { lastWord = ''; document.body.classList.remove('fx-intro-fly'); releaseCamera(scene); return false; }
  const left = Math.max(0, scene.countdownT);
  const flying = !!(intro?.fly && left > intro.ready);
  els.card.classList.toggle('is-flying', flying);
  document.body.classList.toggle('fx-intro-fly', flying);
  els.skip.hidden = !flying;
  els.kicker.textContent = kicker(scene);
  els.title.textContent = scene.levelInfo?.title || (state.mode === 'arena' ? 'The Arena' : '');
  els.sub.textContent = scene.levelInfo?.landmark || '';
  els.card.querySelector('.fx-intro-card').hidden = !els.title.textContent;
  const cam = state.gfx.camera;
  if (flying) {
    const p = 1 - (left - intro.ready) / intro.flyDur;
    const at = pointOnTrack(scene.track, scene.track.length * Math.min(1, Math.max(0, p)));
    cam._hold = { x: at.x, y: at.y };
    cam._introHold = true;
    cam.zoom = (cam._baseZoom || config.CAMERA_BASE_ZOOM) * 0.7;
    els.call.textContent = '';
  } else {
    if (intro?.fly && intro.key && !flightSettings().introSeen[intro.key]) {
      updateFlightSettings((s) => { s.introSeen[intro.key] = true; });
    }
    releaseCamera(scene);
    const readyLeft = Math.min(left, intro?.ready ?? left);
    const span = intro?.ready || config.COUNTDOWN_DURATION;
    const word = readyLeft > span * 2 / 3 ? 'READY' : readyLeft > span / 3 ? 'SET' : 'GO';
    if (word !== lastWord) {
      lastWord = word;
      els.call.textContent = word;
      els.call.parentElement.dataset.word = word.toLowerCase();
      els.call.parentElement.classList.remove('pop');
      void els.call.parentElement.offsetWidth; // restart the pop animation
      els.call.parentElement.classList.add('pop');
      if (VOICE && word === 'READY') { try { new Audio(VOICE).play().catch(() => {}); } catch { /* no audio */ } }
    }
  }
  return true;
}

function releaseCamera(scene) {
  const cam = state.gfx?.camera;
  if (!cam?._introHold) return;
  cam._introHold = false;
  cam._hold = null;
  cam.zoom = cam._baseZoom || config.CAMERA_BASE_ZOOM;
  const p = scene?.player;
  if (p) { cam.x = p.x; cam.y = p.y; }
}
