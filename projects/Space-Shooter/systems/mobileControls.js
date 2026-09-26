/** Shared phone sensors and fullscreen, independent of either game simulation. */
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const angleDelta = (value, origin) => ((value - origin + 540) % 360) - 180;

export function computeTurnAxis(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  const amount = Math.max(0, Math.abs(degrees) - 2.5) / (24 - 2.5);
  return Math.sign(degrees) * Math.pow(clamp(amount, 0, 1), 1.35);
}

export function screenTiltDegrees(event, screenAngle = 0) {
  if (!Number.isFinite(event?.beta) || !Number.isFinite(event?.gamma)) return null;
  const radians = screenAngle * Math.PI / 180;
  return event.gamma * Math.cos(radians) + event.beta * Math.sin(radians);
}

export function createTiltController({ onChange = () => {}, windowTarget = globalThis.window } = {}) {
  const win = windowTarget;
  let state = { enabled: false, status: "idle", message: "Tilt steering is off." };
  let axis = 0, neutral = null, lastSample = 0, lastAngle = null;
  let generation = 0, listening = false, timer = null, resolveEnable = null;
  const now = () => win?.performance?.now?.() ?? Date.now();
  const announce = (status, message, enabled = false) => {
    state = { status, message, enabled };
    onChange({ ...state });
  };
  function finishPending(result) {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    const finish = resolveEnable;
    resolveEnable = null;
    finish?.(result);
  }
  function removeListeners() {
    if (!listening) return;
    win.removeEventListener("deviceorientation", sample);
    win.removeEventListener("blur", suspend);
    win.document?.removeEventListener("visibilitychange", visibility);
    listening = false;
  }
  function suspend() {
    axis = 0;
    neutral = null;
    lastSample = 0;
  }
  function visibility() {
    if (win.document?.hidden) suspend();
  }
  function sample(event) {
    if (win.document?.hidden) return;
    const screenAngle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const value = screenTiltDegrees(event, screenAngle);
    if (value === null) return;
    const time = now();
    if (neutral === null || screenAngle !== lastAngle) {
      neutral = value;
      axis = 0;
    } else {
      const target = computeTurnAxis(angleDelta(value, neutral));
      const dt = clamp((time - lastSample) / 1000, 1 / 120, 0.1);
      axis += (target - axis) * (1 - Math.exp(-dt / 0.065));
    }
    lastAngle = screenAngle;
    lastSample = time;
    if (!state.enabled) {
      announce("enabled", "Tilt on. Hold comfortably; Recenter sets straight ahead.", true);
      finishPending(true);
    }
  }
  function disable() {
    generation++;
    removeListeners();
    finishPending(false);
    suspend();
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
    if (!win.DeviceOrientationEvent) {
      announce("unavailable", "This browser has no motion sensors. Use the steering buttons.");
      return false;
    }
    announce("requesting", "Allow motion access to steer by tilting your phone.");
    try {
      // Call from the button gesture before any asynchronous work: required on iOS.
      if (typeof win.DeviceOrientationEvent.requestPermission === "function") {
        const permission = await win.DeviceOrientationEvent.requestPermission();
        if (current !== generation) return false;
        if (permission !== "granted") {
          announce("denied", "Motion access was denied. Steering buttons remain available.");
          return false;
        }
      }
    } catch {
      if (current === generation) announce("denied", "Motion access failed. Tap Enable tilt to try again.");
      return false;
    }
    if (current !== generation) return false;
    announce("calibrating", "Hold the phone comfortably while tilt calibrates…");
    const ready = new Promise(resolve => { resolveEnable = resolve; });
    listening = true;
    win.addEventListener("deviceorientation", sample);
    win.addEventListener("blur", suspend);
    win.document?.addEventListener("visibilitychange", visibility);
    timer = win.setTimeout(() => {
      removeListeners();
      suspend();
      announce("unavailable", "No motion readings arrived. Check motion permission or use steering buttons.");
      finishPending(false);
    }, 2500);
    return ready;
  }
  return {
    enable, disable, suspend,
    calibrate() {
      if (!state.enabled) return false;
      suspend();
      announce("enabled", "Hold the phone comfortably; straight ahead resets on the next reading.", true);
      return true;
    },
    getAxis() {
      return state.enabled && !win.document?.hidden && now() - lastSample <= 350 ? axis : 0;
    },
    getState: () => ({ ...state }),
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
