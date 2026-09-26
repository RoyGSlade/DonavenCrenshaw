/**
 * Maps DeviceOrientation events to a normalized turn axis value.
 * Applies a deadzone and exponential curve for finer control.
 */

import tiltConfig from './tilt-config.json' with { type: 'json' };
import { state } from '../state.js';

let orientationHandler = null;

export function computeTurnAxis(gammaDeg) {
  if (typeof gammaDeg !== 'number') return 0;
  const normalized = Math.max(-1, Math.min(1, gammaDeg / 90));
  const dz = Math.max(0, Math.min(1, (tiltConfig.DEADZONE_DEG || 0) / 90));
  const abs = Math.abs(normalized);
  if (abs < dz) return 0;
  const sign = Math.sign(normalized);
  const range = (abs - dz) / (1 - dz);
  const curved = Math.pow(range, tiltConfig.EXPONENT || 1);
  return sign * curved;
}

export function enableTiltControls() {
  state.input.touch.useTilt = true;
  if (orientationHandler) return;
  orientationHandler = (e) => {
    state.input.touch.turnAxis = computeTurnAxis(e.gamma);
  };
  window.addEventListener('deviceorientation', orientationHandler);
}

export function disableTiltControls() {
  state.input.touch.useTilt = false;
  state.input.touch.turnAxis = 0;
  if (!orientationHandler) return;
  window.removeEventListener('deviceorientation', orientationHandler);
  orientationHandler = null;
}
