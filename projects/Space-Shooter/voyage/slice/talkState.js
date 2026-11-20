// The talk state machine (opening B, outcome 1). Pure: no DOM, no clock. A talk no longer holds the player still;
// instead it watches how far the player walks from the speaker:
//
//   idle --open--> near --(farther than NEAR)--> paused --(back inside NEAR)--> near
//                                                paused --(past FAR, or paused too long)--> ended (-> idle)
//
// A speaker with no body here (an intercom voice, the narrator, someone in another room) is always near: pass distance null.
// step(distTiles | null | Infinity, dtMs) returns events: { type: 'pause' } | { type: 'resume' } | { type: 'end', why: 'far' | 'time' | 'left' }.
export const TALK = Object.freeze({ near: 6, far: 10, back: 5.6, pauseMs: 14000 });

export function createTalkState({ near = TALK.near, far = TALK.far, back = TALK.back, pauseMs = TALK.pauseMs } = {}) {
  let state = 'idle', who = null, pausedMs = 0, engaged = false; // engaged: the player has been within NEAR once; a talk that starts across the room (a beat on entering a room) never pauses before that
  return {
    get state() { return state; },
    get speaker() { return who; },
    /** Choices answer only while the talk is near (or no talk is running). */
    get canChoose() { return state !== 'paused'; },
    get active() { return state !== 'idle'; },
    open(speaker = null) { state = 'near'; who = speaker; pausedMs = 0; engaged = false; return [{ type: 'open', speaker }]; },
    close() { const was = state; state = 'idle'; who = null; pausedMs = 0; return was === 'idle' ? [] : [{ type: 'close' }]; },
    step(dist, dtMs = 100) {
      if (state === 'idle') return [];
      const d = dist == null ? 0 : dist;
      if (!engaged) { if (d <= near) engaged = true; else return []; }
      if (state === 'near') {
        if (d > near) { state = 'paused'; pausedMs = 0; return [{ type: 'pause' }]; }
        return [];
      }
      // paused
      pausedMs += dtMs;
      if (d <= back) { state = 'near'; pausedMs = 0; return [{ type: 'resume' }]; }
      if (d > far) { const speaker = who; state = 'idle'; who = null; return [{ type: 'end', why: 'far', speaker }]; }
      if (pausedMs > pauseMs) { const speaker = who; state = 'idle'; who = null; return [{ type: 'end', why: 'time', speaker }]; }
      return [];
    },
  };
}
