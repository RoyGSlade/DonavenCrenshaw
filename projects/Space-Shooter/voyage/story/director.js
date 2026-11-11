// The tutorial director: listens on the story bus for what the player did
// (events from the hangar, on-foot and exploration code), and drives the
// lines, objectives, rewards and unlocks from tutorial.js. Progress is saved in
// save.story through the store after every step, so a reload resumes where the
// player was. ROUND2-CONTRACT.md section 4.
//
// No DOM. Lines go out through say.js ('story:say'); whatever draws them is up
// to the page (caption.js is the default).
import { grant, missing } from '../economy.js';
import { check, checkChance, skillById } from '../character.js';
import { storyBus } from './bus.js';
import { createSay } from './say.js';
import { STEPS, STEP_BY_ID, ALL_UNLOCKS, TALKS, PICKS, SKIP_IF, NUDGE_MS, unlockName } from './tutorial.js';
import { storyOf, freshStory, cleanStory, objectiveFor, idleLine } from './progress.js';
import { optionTag } from './stats.js';

/** Adds rewards together: money, items and rep summed, flags and unlocks merged. */
export function mergeRewards(list) {
  const out = {};
  for (const r of list) {
    if (!r) continue;
    if (r.money) out.money = (out.money || 0) + r.money;
    if (r.skillPoints) out.skillPoints = (out.skillPoints || 0) + r.skillPoints;
    for (const key of ['items', 'rep']) {
      for (const [id, v] of Object.entries(r[key] || {})) out[key] = { ...(out[key] || {}), [id]: ((out[key] || {})[id] || 0) + v };
    }
    if (r.flags) out.flags = { ...(out.flags || {}), ...r.flags };
    if (r.unlocks) out.unlocks = [...new Set([...(out.unlocks || []), ...r.unlocks])];
  }
  return out;
}

const matches = (wait, type, detail) => wait && wait.type === type
  && Object.entries(wait.match || {}).every(([k, v]) => detail?.[k] === v);

/**
 * createDirector({ store, bus, say, audio, timer, nudgeMs }) -> { start, skip, replay, state, objective, choose, stop }.
 * store: voyage/store.js (get, update). say: a speak function (default createSay on the bus).
 * timer: { set(fn, ms) -> handle, clear(handle) } for the nudges (tests pass a fake).
 * rng: () => [0, 1) for talk attempts (tests pass a seeded one).
 */
export function createDirector({
  store, bus = storyBus, say = null, audio = null, nudgeMs = NUDGE_MS, rng = Math.random,
  timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
} = {}) {
  const speak = say || createSay({ bus, audio });
  let queue = Promise.resolve();
  let offs = [];
  let running = false;
  let pendingTalk = null; // { step, talk, options }
  const seen = new Set(); // `also` lines already played this session
  const talks = new Map(); // castId -> idle talks so far (picks the next idle line)
  let nudgeTimer = null;
  let nudged = { step: null, n: 0 }; // which nudge line plays next on this step

  // Nudges: when the player has done nothing on a step for nudgeMs, the step's
  // helper says where to go. Any event from the game (not the story's own)
  // restarts the wait; each nudge line plays once.
  function armNudge() {
    if (nudgeTimer !== null) timer.clear(nudgeTimer);
    nudgeTimer = null;
    const s = read();
    const step = !s.finished && STEP_BY_ID.get(s.step);
    if (!running || !step?.nudge?.length || !(nudgeMs > 0)) return;
    if (nudged.step !== step.id) nudged = { step: step.id, n: 0 };
    if (nudged.n >= step.nudge.length) return;
    nudgeTimer = timer.set(() => {
      nudgeTimer = null;
      if (!running || read().step !== step.id || pendingTalk) return;
      const id = step.nudge[nudged.n++];
      playLines([id]).then(armNudge);
    }, nudgeMs);
  }

  const read = () => storyOf(store.get());
  const vars = () => ({ name: store.get().character?.name || '' });
  const enqueue = (fn) => {
    queue = queue.then(() => (running ? fn() : null)).catch((error) => console.warn('Stardust story: a step failed', error));
    return queue;
  };
  const playLines = (ids) => enqueue(async () => { for (const id of ids) if (running) await speak(id, { vars: vars() }); });

  /** Writes a story block (and pays a reward) in one save. Returns the grant events. */
  function write(story, reward = null) {
    let events = [];
    store.update((s) => {
      let save = s;
      if (reward) { const g = grant(save, reward); save = g.save; events = g.events; }
      return { ...save, story: cleanStory(story) };
    });
    if (events.length) bus.emit('story:reward', { events });
    return events;
  }

  function announceUnlocks(before, after) {
    const fresh = after.filter((id) => !before.includes(id));
    for (const id of fresh) bus.emit('story:unlock', { id, name: unlockName(id) });
    if (fresh.length) bus.emit('story:cue', { cue: 'unlock' });
  }

  function enterStep(step) {
    if (!running || read().step !== step.id) return; // already passed (the player was quick)
    if (step.skipIf && SKIP_IF[step.skipIf]?.(store.get())) { complete(step, {}, { silent: true }); return; }
    const index = STEPS.indexOf(step);
    bus.emit('story:step', { id: step.id, leg: step.leg, index, total: STEPS.length });
    bus.emit('story:objective', objectiveFor(step));
    if (step.objective) bus.emit('story:cue', { cue: 'objective' });
    if (step.enter?.length) playLines(step.enter);
    if (step.talk) enqueue(() => runTalk(step));
    if (!step.wait) enqueue(() => complete(step, {}));
    else enqueue(armNudge);
  }

  function complete(step, detail, { silent = false } = {}) {
    const s = read();
    if (!running || s.finished || s.step !== step.id) return false;
    const i = STEPS.indexOf(step);
    const next = STEPS[i + 1] || null;
    const pay = step.reward && !s.paid.includes(step.id);
    const unlocks = [...new Set([...s.unlocks, ...(step.unlocks || [])])];
    const story = {
      ...s,
      done: [...new Set([...s.done, step.id])],
      paid: pay ? [...s.paid, step.id] : s.paid,
      unlocks,
      step: next ? next.id : null,
      finished: !next,
    };
    if (detail?.talk && Number.isInteger(detail.choice)) story.choices = { ...s.choices, [detail.talk]: detail.choice };
    write(story, pay ? step.reward : null);
    announceUnlocks(s.unlocks, unlocks);
    bus.emit('story:objective', null);
    if (!silent) {
      const after = (step.after || []).map((x) => (typeof x === 'string' ? x : PICKS[x.pick]?.(detail, store.get()))).filter(Boolean);
      if (after.length) playLines(after);
    }
    if (next) enqueue(() => enterStep(next));
    else enqueue(() => { bus.emit('story:cue', { cue: 'done' }); bus.emit('story:done', { skipped: false }); });
    return true;
  }

  // A talk the director runs: the prompt, then the options. A plain option just
  // answers; a stat attempt is a fresh 2d6 roll plus the stat bonus (anyone may
  // try; the odds are shown); a skill-gated option is locked, with its reason,
  // until the captain has the skill. choose(i) plays the reply (the pass or
  // fail line for an attempt, and 'roll:attempt' for the die), then
  // 'tutorial:talked' completes the step. In the tutorial both outcomes move on.
  async function runTalk(step) {
    const talk = TALKS[step.talk];
    if (!talk || read().step !== step.id) return;
    await speak(talk.prompt, { vars: vars() });
    if (!running || read().step !== step.id) return;
    const save = store.get();
    const options = talk.options.map((o, index) => {
      if (o.stat) {
        const p = checkChance(save.character, { stat: o.stat, dc: o.dc });
        return { index, kind: 'attempt', label: `${optionTag(o.stat)} ${o.label}`, stat: o.stat, dc: o.dc, chance: p, locked: false, reason: '' };
      }
      if (o.requires) {
        const reasons = missing(save, o.requires);
        const skill = Object.keys(o.requires.skills || {})[0];
        const name = skillById(skill)?.name || skill;
        return { index, kind: 'skill', label: `[${name}] ${o.label}`, skill: skill || null, locked: reasons.length > 0, reason: reasons[0] || '' };
      }
      return { index, kind: 'say', label: o.label, locked: false, reason: '' };
    });
    pendingTalk = { step: step.id, talk: step.talk, options };
    bus.emit('story:choices', { talk: step.talk, options });
  }

  /** Answers the open talk; false when the option is locked or no talk is open. */
  function choose(index) {
    const t = pendingTalk;
    if (!running || !t || !Number.isInteger(index) || !t.options[index] || t.options[index].locked) return false;
    if (read().step !== t.step) { pendingTalk = null; return false; }
    pendingTalk = null;
    bus.emit('story:choices', null);
    const o = TALKS[t.talk].options[index];
    let reply = o.reply;
    let attempt = null;
    if (o.stat) {
      attempt = { ...check(store.get().character, { stat: o.stat, dc: o.dc }, rng), who: store.get().character?.name || null, label: o.label };
      bus.emit('roll:attempt', attempt);
      reply = attempt.pass ? o.pass : o.fail;
    }
    enqueue(async () => {
      await speak(reply, { vars: vars() });
      bus.emit('tutorial:talked', { talk: t.talk, choice: index, pass: attempt ? attempt.pass : null });
    });
    return true;
  }

  function onEvent(type, detail) {
    if (!running) return;
    if (type === 'tutorial:skip') { api.skip(); return; }
    if (type === 'story:choose') { choose(Number(detail?.index)); return; }
    if (!type.startsWith('story:') && nudgeTimer !== null) armNudge();
    const s = read();
    const step = s.finished ? null : STEP_BY_ID.get(s.step);
    // Talking to someone the tutorial is not waiting on: they say one of their idle lines
    // (onfoot's ask, contract 1.2), so every page gets the same behaviour.
    if (type.startsWith('met:') && !matches(step?.wait, type, detail)) {
      const who = type.slice(4);
      const n = talks.get(who) || 0;
      const line = idleLine(who, store.get(), n);
      if (line) { talks.set(who, n + 1); playLines([line]); }
      return;
    }
    if (!step) return;
    for (const also of step.also || []) {
      const key = also.once || `${step.id}:${also.type}`;
      if (!seen.has(key) && matches(also, type, detail)) { seen.add(key); playLines(also.lines); }
    }
    if (matches(step.wait, type, detail)) complete(step, detail);
  }

  const api = {
    /** Starts listening and resumes from the save. */
    start() {
      if (running) return api;
      running = true;
      offs.push(bus.on('*', onEvent));
      const save = store.get();
      // A brand-new save gets its block now, so the captain made during the tutorial is not taken for an old one.
      if (!save.story && !save.character) write(freshStory());
      const step = STEP_BY_ID.get(read().step);
      if (step && !read().finished) enterStep(step);
      // An old captain meets a new stat (Strength): Chibby asks for one roll; the hangar rolls the die.
      const missingStats = store.get().character?.toRoll || [];
      if (missingStats.length) {
        playLines(['chibby.roll.late']);
        bus.emit('story:roll-missing', { stats: [...missingStats] });
      }
      return api;
    },
    /** Ends the tutorial now: unpaid rewards are paid, everything unlocks. */
    skip() {
      const s = read();
      if (s.finished) return false;
      if (pendingTalk) { pendingTalk = null; bus.emit('story:choices', null); }
      const unpaid = STEPS.filter((st) => st.reward && !s.paid.includes(st.id));
      const story = {
        ...s, step: null, finished: true, skipped: true,
        done: STEPS.map((st) => st.id),
        paid: [...s.paid, ...unpaid.map((st) => st.id)],
        unlocks: [...new Set([...s.unlocks, ...ALL_UNLOCKS])],
      };
      write(story, unpaid.length ? mergeRewards(unpaid.map((st) => st.reward)) : null);
      announceUnlocks(s.unlocks, story.unlocks);
      bus.emit('story:objective', null);
      playLines(['chibby.skip.1']);
      bus.emit('story:done', { skipped: true });
      return true;
    },
    /** Plays the tutorial again from the intro. The captain stays; rewards already paid are not paid again. */
    replay() {
      const s = read();
      pendingTalk = null;
      seen.clear();
      write({ ...freshStory(), paid: s.paid, unlocks: s.unlocks });
      if (running) enterStep(STEPS[0]);
      return true;
    },
    /**
     * Jumps to a step as if the earlier ones were played: their rewards are paid
     * (once) and their unlocks given. For the Studio's "play this step" link on a
     * throwaway save (`?step=<id>`). False for an unknown step.
     */
    jumpTo(stepId) {
      const target = STEP_BY_ID.get(stepId);
      if (!target) return false;
      const s = read();
      const before = STEPS.slice(0, STEPS.indexOf(target));
      const unpaid = before.filter((st) => st.reward && !s.paid.includes(st.id));
      pendingTalk = null;
      const story = {
        ...s, step: target.id, finished: false, skipped: false,
        done: before.map((st) => st.id),
        paid: [...s.paid, ...unpaid.map((st) => st.id)],
        unlocks: [...new Set([...s.unlocks, ...before.flatMap((st) => st.unlocks || [])])],
      };
      write(story, unpaid.length ? mergeRewards(unpaid.map((st) => st.reward)) : null);
      if (running) enterStep(target);
      return true;
    },
    state: () => read(),
    objective: () => (read().finished ? null : objectiveFor(STEP_BY_ID.get(read().step))),
    choose,
    /** Waits for every queued line (tests, and pages that want to know when it is quiet). */
    async idle() {
      let q;
      do { q = queue; await q; } while (q !== queue);
    },
    stop() {
      running = false;
      pendingTalk = null;
      if (nudgeTimer !== null) timer.clear(nudgeTimer);
      nudgeTimer = null;
      for (const off of offs) off();
      offs = [];
    },
  };
  return api;
}
