// A tiny timeline for staged scenes (opening B, outcome 4). Pure: no DOM, no clock; the caller feeds it elapsed time.
//
// A shot is a list of steps: { op, dt?, await?, timeout?, ...args }.
//   dt        ms after the previous step fired (default 0)
//   await     hold here until signal(name) is called (or `timeout` ms pass, default 12000); dt counts from then
// step(dtMs) fires every step that is due, calling api[step.op](step). Each fired step is logged by name, so a test can check
// the ORDER the scene plays in (the alarm and the hatch before any Reaver, the stand before the fall).
export function createTimeline(shot, api, { defaultTimeout = 12000 } = {}) {
  const steps = shot.map((s) => ({ ...s })); // the shot is data: never edited
  let i = 0, timer = 0, waiting = null, waited = 0;
  const log = [];
  const signals = new Set();
  const nameOf = (s) => (s.name ? `${s.op}:${s.name}` : s.op);
  const gate = () => {
    const s = steps[i];
    if (s && s.await && !waiting && !signals.has(s.await)) waiting = s.await;
  };
  gate();

  function fire() {
    const s = steps[i++];
    log.push(nameOf(s));
    try { api[s.op]?.(s); } catch (error) { api.error?.(error, s); }
    waiting = null; waited = 0;
    gate();
  }

  return {
    /** Advance by dtMs; returns how many steps fired. */
    step(dtMs) {
      let fired = 0;
      if (i >= steps.length) return 0;
      if (waiting) {
        waited += dtMs;
        if (!signals.has(waiting) && waited < (steps[i].timeout ?? defaultTimeout)) return 0;
        timer = 0; // released: dt counts from now
        waiting = null; steps[i].await = null;
      }
      timer += dtMs;
      while (i < steps.length && timer >= (steps[i].dt || 0)) {
        timer -= steps[i].dt || 0;
        fire(); fired++;
        if (waiting) break;
      }
      return fired;
    },
    signal(name) { signals.add(name); },
    get done() { return i >= steps.length; },
    get log() { return [...log]; },
    get position() { return i; },
    get waiting() { return waiting; },
  };
}

/** Run a whole shot with a fake clock (tests): returns the log. */
export function runAll(steps, api, { stepMs = 50, max = 600000 } = {}) {
  const t = createTimeline(steps, api);
  for (let ms = 0; ms < max && !t.done; ms += stepMs) t.step(stepMs);
  return t.log;
}
