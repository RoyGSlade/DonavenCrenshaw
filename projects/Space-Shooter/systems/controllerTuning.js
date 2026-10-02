// Pure, bounded controller preferences. Sensitivity changes the response curve,
// keeping full stick travel at 100% and the default flight response unchanged.
export const CONTROLLER_DEFAULTS = Object.freeze({ stickDeadzone: 0.2, triggerDeadzone: 0.08, sensitivity: 1 });
export const CONTROLLER_LIMITS = Object.freeze({ stickDeadzone: [0, 0.45, 0.01], triggerDeadzone: [0, 0.3, 0.01], sensitivity: [0.5, 2, 0.05] });
export const standardController = pad => !!pad && (pad.mapping == null || pad.mapping === 'standard');
export function normalizeControllerTuning(raw = {}) {
  return Object.fromEntries(Object.entries(CONTROLLER_LIMITS).map(([key, [min, max]]) => [key,
    Number.isFinite(raw?.[key]) ? Math.max(min, Math.min(max, raw[key])) : CONTROLLER_DEFAULTS[key]]));
}
export function controllerAxis(value, tuning = CONTROLLER_DEFAULTS) {
  if (!Number.isFinite(value)) return 0;
  const v = Math.max(-1, Math.min(1, value));
  if (Math.abs(v) <= tuning.stickDeadzone) return 0;
  return Math.sign(v) * Math.pow(Math.abs(v), 1 / tuning.sensitivity);
}
