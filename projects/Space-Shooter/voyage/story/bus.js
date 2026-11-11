// The story bus: how the hangar, on-foot, exploration and story code talk
// without importing each other. Event names and details are in
// lhc-lanes/stardust/ROUND2-CONTRACT.md section 3-4. No DOM; details are plain
// JSON. Pages share `storyBus`; tests make their own with createBus().

export function createBus() {
  const handlers = new Map();
  const list = (type) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    return handlers.get(type);
  };
  return {
    /** Tells every listener of `type` (and of '*', which gets (type, detail)). A failing listener never stops the rest. */
    emit(type, detail = {}) {
      for (const fn of [...list(type)]) { try { fn(detail, type); } catch (error) { console.warn(`Stardust story: a listener for ${type} failed`, error); } }
      for (const fn of [...list('*')]) { try { fn(type, detail); } catch (error) { console.warn('Stardust story: a * listener failed', error); } }
    },
    /** fn(detail, type); returns an off() function. */
    on(type, fn) {
      list(type).add(fn);
      return () => list(type).delete(fn);
    },
    /** fn runs for the next `type` only. */
    once(type, fn) {
      const off = this.on(type, (detail, t) => { off(); fn(detail, t); });
      return off;
    },
  };
}

export const storyBus = createBus();
