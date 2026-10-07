// Track Studio v2 game check, off the main thread: the real converter and the
// game's scripted autopilot (the same code the server runs on Make track).
import { sketchToWeekly } from '/projects/Space-Shooter/studio/sketchToWeekly.js';

self.onmessage = (e) => {
  const { id, doc } = e.data || {};
  const t0 = performance.now();
  try {
    const { event, report, intent } = sketchToWeekly(doc);
    self.postMessage({ id, ok: true, event, report, intent: intent || [], ms: Math.round(performance.now() - t0) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message || error) });
  }
};
self.postMessage({ ready: true });
