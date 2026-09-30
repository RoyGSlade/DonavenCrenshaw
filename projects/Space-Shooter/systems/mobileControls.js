/** Shared phone sensors and fullscreen, independent of either game simulation. */
import {
  DEFAULT_TILT_CONFIG,
  createGravitySignResolver,
  createSteeringProcessor,
  gravityFromOrientation,
  normalizeScreenAngle,
  steeringFromGravity,
  steeringResponse,
} from "./tiltSteering.js";

// Tuning lives in tilt-config.json (see docs/stardust/TILT.md); defaults mirror it.
const TILT_CONFIG_URL = new URL("./tilt-config.json", import.meta.url);
const SOURCE_FRESH_MS = 250;   // a sensor stream older than this is not "live"
const STALE_AXIS_MS = 350;     // no readings for this long → steering returns to 0
const FIRST_READING_MS = 2500; // no readings at all after permission → report unavailable

/** Degrees away from neutral → steering in [-1, 1] (dead zone, expo curve, full lock). */
export function computeTurnAxis(degrees, config = DEFAULT_TILT_CONFIG) {
  return steeringResponse(degrees, config);
}

/**
 * Steering roll (degrees, + = right) of the screen relative to gravity for a
 * DeviceOrientationEvent-like {alpha, beta, gamma}. Independent of how far back the
 * phone is held; null for incomplete readings.
 */
export function screenTiltDegrees(event, screenAngle = 0) {
  const up = gravityFromOrientation(event?.alpha, event?.beta, event?.gamma);
  return up ? steeringFromGravity(up, screenAngle).roll : null;
}

export function createTiltController({ onChange = () => {}, windowTarget = globalThis.window, config } = {}) {
  const win = windowTarget;
  const processor = createSteeringProcessor(config ?? DEFAULT_TILT_CONFIG);
  const gravitySign = createGravitySignResolver();
  let state = { enabled: false, status: "idle", message: "Tilt steering is off." };
  let lastSample = 0, lastMotion = -Infinity, lastOrientation = -Infinity;
  let orientationUp = null, source = null, wasCalibrating = false;
  let generation = 0, listening = false, timer = null, resolveEnable = null;
  const now = () => win?.performance?.now?.() ?? Date.now();
  const screenAngle = () => normalizeScreenAngle(win?.screen?.orientation?.angle ?? win?.orientation ?? 0);
  const announce = (status, message, enabled = false) => {
    state = { status, message, enabled };
    onChange({ ...state });
  };
  // Hand-tuned values from tilt-config.json, fetched without blocking the permission gesture.
  if (config === undefined && typeof win?.fetch === "function") {
    Promise.resolve()
      .then(() => win.fetch(TILT_CONFIG_URL))
      .then(response => (response?.ok ? response.json() : null))
      .then(json => { if (json) processor.setConfig(json); })
      .catch(() => {});
  }
  function finishPending(result) {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    const finish = resolveEnable;
    resolveEnable = null;
    finish?.(result);
  }
  function removeListeners() {
    if (!listening) return;
    win.removeEventListener("devicemotion", onMotion);
    win.removeEventListener("deviceorientation", onOrientation);
    win.removeEventListener("blur", suspend);
    win.document?.removeEventListener("visibilitychange", visibility);
    listening = false;
  }
  /** Blur, hidden tab or game pause: steering to 0 and filter history dropped; neutral kept. */
  function suspend() {
    processor.reset();
    lastSample = 0;
  }
  function visibility() {
    if (win.document?.hidden) suspend();
  }
  function accept(up, kind, time) {
    source = kind;
    processor.update(up, screenAngle(), time);
    lastSample = time;
    if (!state.enabled) {
      announce("enabled", "Tilt on. Hold steady a moment while straight ahead is set.", true);
      finishPending(true);
    } else if (wasCalibrating && !processor.calibrating) {
      announce("enabled", "Tilt on. Turn the phone like a wheel; Recenter sets straight ahead.", true);
    }
    wasCalibrating = processor.calibrating;
  }
  const motionIsLive = time => gravitySign.sign !== 0 && time - lastMotion <= SOURCE_FRESH_MS;
  const orientationIsLive = time => time - lastOrientation <= SOURCE_FRESH_MS;
  function onOrientation(event) {
    if (win.document?.hidden) return;
    const up = gravityFromOrientation(event?.alpha, event?.beta, event?.gamma);
    if (!up) return;
    const time = now();
    orientationUp = up;
    lastOrientation = time;
    // Orientation is the fallback unless the config prefers it or motion is not flowing.
    if (processor.config.PREFERRED_SOURCE === "motion" && motionIsLive(time)) return;
    accept(up, "orientation", time);
  }
  function onMotion(event) {
    if (win.document?.hidden) return;
    const g = event?.accelerationIncludingGravity;
    if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.z)) return;
    const length = Math.hypot(g.x, g.y, g.z);
    if (!(length > 1e-3)) return;
    const unit = { x: g.x / length, y: g.y / length, z: g.z / length };
    const time = now();
    // Platforms disagree on this vector's sign; resolve it before trusting it.
    const sign = gravitySign.push(unit, orientationIsLive(time) ? orientationUp : null, screenAngle());
    if (!sign) return;
    lastMotion = time;
    if (processor.config.PREFERRED_SOURCE === "orientation" && orientationIsLive(time)) return;
    accept({ x: unit.x * sign, y: unit.y * sign, z: unit.z * sign }, "motion", time);
  }
  function disable() {
    generation++;
    removeListeners();
    finishPending(false);
    processor.hardReset();
    gravitySign.reset();
    lastSample = 0; lastMotion = -Infinity; lastOrientation = -Infinity;
    orientationUp = null; source = null; wasCalibrating = false;
    announce("idle", "Tilt steering is off.");
  }
  async function enable() {
    if (state.enabled) return true;
    disable();
    const current = generation;
    if (!win?.isSecureContext) {
      announce("unavailable", "Tilt needs a trusted HTTPS game link. Use the steering buttons on this Wi-Fi link.");
      return false;
    }
    if (!win.DeviceOrientationEvent && !win.DeviceMotionEvent) {
      announce("unavailable", "This browser has no motion sensors. Use the steering buttons.");
      return false;
    }
    announce("requesting", "Allow motion access to steer by tilting your phone.");
    // iOS 13+: both prompts must start synchronously inside the button gesture, before any await.
    const requests = [win.DeviceOrientationEvent, win.DeviceMotionEvent]
      .filter(api => typeof api?.requestPermission === "function")
      .map(api => {
        try { return Promise.resolve(api.requestPermission()); }
        catch (error) { return Promise.reject(error); }
      });
    if (requests.length) {
      const results = await Promise.allSettled(requests);
      if (current !== generation) return false;
      if (!results.some(r => r.status === "fulfilled" && r.value === "granted")) {
        announce("denied", results.every(r => r.status === "rejected")
          ? "Motion access failed. Tap Enable tilt to try again."
          : "Motion access was denied. Steering buttons remain available.");
        return false;
      }
    }
    if (current !== generation) return false;
    announce("calibrating", "Hold the phone comfortably while tilt calibrates…");
    const ready = new Promise(resolve => { resolveEnable = resolve; });
    listening = true;
    win.addEventListener("devicemotion", onMotion);
    win.addEventListener("deviceorientation", onOrientation);
    win.addEventListener("blur", suspend);
    win.document?.addEventListener("visibilitychange", visibility);
    processor.calibrate(now());
    wasCalibrating = true;
    timer = win.setTimeout(() => {
      removeListeners();
      suspend();
      announce("unavailable", "No motion readings arrived. Check motion permission or use steering buttons.");
      finishPending(false);
    }, FIRST_READING_MS);
    return ready;
  }
  return {
    enable, disable, suspend,
    /** Average the next ~0.3 s of steady readings into straight ahead (clamped to ±25°). */
    calibrate() {
      if (!state.enabled) return false;
      processor.calibrate(now());
      wasCalibrating = true;
      announce("enabled", "Recentering: hold the phone where straight ahead should be.", true);
      return true;
    },
    getAxis() {
      return state.enabled && !win.document?.hidden && now() - lastSample <= STALE_AXIS_MS ? processor.axis : 0;
    },
    getState: () => ({ ...state }),
    /** Live numbers for on-device tuning; not used by gameplay. */
    getDebug: () => ({
      source,
      screenAngle: screenAngle(),
      roll: processor.roll,
      neutral: processor.neutral,
      confidence: processor.confidence,
      axis: processor.axis,
      calibrating: processor.calibrating,
      motionSign: gravitySign.sign,
    }),
  };
}

export function isFullscreen(doc = globalThis.document) {
  return !!(doc?.fullscreenElement || doc?.webkitFullscreenElement ||
    doc?.defaultView?.navigator?.standalone ||
    doc?.defaultView?.matchMedia?.("(display-mode: standalone)").matches);
}

export async function toggleMobileFullscreen(doc = globalThis.document) {
  if (!doc) return { ok: false, message: "Fullscreen is unavailable." };
  const win = doc.defaultView;
  const activeElement = doc.fullscreenElement || doc.webkitFullscreenElement;
  if (isFullscreen(doc) && !activeElement)
    return { ok: true, message: "Running fullscreen from your Home Screen." };
  try {
    if (activeElement) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (!exit) return { ok: false, message: "Use your browser's fullscreen exit control." };
      await exit.call(doc);
      try { win?.screen?.orientation?.unlock?.(); } catch {}
      return { ok: true, message: "Fullscreen off." };
    }
    const root = doc.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return {
      ok: false,
      message: "This browser cannot enter fullscreen. Add Stardust to your Home Screen and open it there.",
    };
    // Fullscreen the entire page, so the HUD and thumb controls remain usable.
    await request.call(root);
    try { await win?.screen?.orientation?.lock?.("landscape"); } catch {}
    return { ok: true, message: "Fullscreen on." };
  } catch {
    return { ok: false, message: "Fullscreen was blocked. Tap Fullscreen again, or add the game to your Home Screen." };
  }
}

export function watchFullscreen(callback, doc = globalThis.document) {
  const update = () => callback(isFullscreen(doc));
  doc?.addEventListener("fullscreenchange", update);
  doc?.addEventListener("webkitfullscreenchange", update);
  const mode = doc?.defaultView?.matchMedia?.("(display-mode: standalone)");
  mode?.addEventListener?.("change", update);
  update();
  return () => {
    doc?.removeEventListener("fullscreenchange", update);
    doc?.removeEventListener("webkitfullscreenchange", update);
    mode?.removeEventListener?.("change", update);
  };
}
