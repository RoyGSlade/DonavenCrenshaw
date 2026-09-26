// Simple time-based animator
export function makeAnimator({ frames = 1, fps = 12, loop = true } = {}) {
  let t = 0, i = 0, done = false;
  const spf = 1 / Math.max(1, fps);
  return {
    update(dt) {
      if (done) return i;
      t += dt;
      while (t >= spf) {
        t -= spf;
        i++;
        if (i >= frames) {
          if (loop) i = 0;
          else { i = frames - 1; done = true; }
        }
      }
      return i;
    },
    index() { return i; },
    reset() { t = 0; i = 0; done = false; },
    done() { return done; }
  };
}
