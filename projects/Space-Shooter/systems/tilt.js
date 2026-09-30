import { state } from '../state.js';
import { createTiltController } from './mobileControls.js';
export { computeTurnAxis } from './mobileControls.js';

const listeners = new Set();
const controller = createTiltController({ onChange(status) {
  state.input.touch.useTilt = status.enabled;
  state.input.touch.turnAxis = 0;
  for (const listener of listeners) listener(status);
} });
export const enableTiltControls = () => controller.enable();
export const disableTiltControls = () => controller.disable();
/** Recenter (Recenter button today; meant to be called at the start line too). Safe mid-race. */
export const calibrateTiltControls = () => controller.calibrate();
export const getTiltState = () => controller.getState();
/** Live roll/neutral/confidence/source for on-phone tuning (see docs/stardust/TILT.md). */
export const getTiltDebug = () => controller.getDebug();
export function getTiltAxis() {
  state.input.touch.turnAxis = controller.getAxis();
  return state.input.touch.turnAxis;
}
export function subscribeTilt(listener) {
  listeners.add(listener);
  listener(controller.getState());
  return () => listeners.delete(listener);
}
