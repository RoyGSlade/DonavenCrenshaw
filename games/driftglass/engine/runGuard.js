import { state } from '../state.js';

export function withRun(fn) {
  const run = state.run?.current;
  if (!run) return false;
  fn(run);
  return true;
}

export function hasRun() {
  return !!state.run?.current;
}
