// The tutorial director: listens on the story bus for what the player did
// (events from the hangar, on-foot and exploration code), and drives the
// lines, objectives, rewards and unlocks from tutorial.js. Progress is saved in
// save.story through the store after every step, so a reload resumes where the
// player was. ROUND2-CONTRACT.md section 4.
//
// No DOM. Lines go out through say.js ('story:say'); whatever draws them is up
// to the page (caption.js is the default).
import { grant, missing } from '../economy.js';
import { STAT_OPTION_MIN } from '../data.js';
import { storyBus } from './bus.js';
import { createSay } from './say.js';
import { STEPS, STEP_BY_ID, ALL_UNLOCKS, TALKS, PICKS, SKIP_IF, unlockName } from './tutorial.js';
import { storyOf, freshStory, cleanStory, objectiveFor } from './progress.js';
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
 * createDirector({ store, bus, say, audio }) -> { start, skip, replay, state, objective, choose, stop }.
 * store: voyage/store.js (get, update). say: a speak function (default createSay on the bus).
 */
export function createDirector({ store, bus = storyBus, say = null, audio = null } = {}) {
  const speak = say || createSay({ bus, audio });
  let queue = Promise.resolve();
  let offs = [];
  let running = false;
  let pendingTalk = null; // { step, talk, options }
  const seen = new Set(); // `also` lines already played this session

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

  // A talk the director runs: the prompt, the options (stat-gated ones locked
  // with their reason), then choose(i) plays the reply and 'tutorial:talked'
  // completes the step. Waiting for the choice does not hold the line queue.
  async function runTalk(step) {
    const talk = TALKS[step.talk];
    if (!talk || read().step !== step.id) return;
    await speak(talk.prompt, { vars: vars() });
    if (!running || read().step !== step.id) return;
    const save = store.get();
    const options = talk.options.map((o, index) => {
      const reasons = o.stat ? missing(save, { stats: { [o.stat]: STAT_OPTION_MIN } }) : [];
      return { index, label: o.stat ? `${optionTag(o.stat)} ${o.label}` : o.label, locked: reasons.length > 0, reason: reasons[0] || '', stat: o.stat || null };
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
    enqueue(async () => {
      await speak(TALKS[t.talk].options[index].reply, { vars: vars() });
      bus.emit('tutorial:talked', { talk: t.talk, choice: index });
    });
    return true;
  }

  function onEvent(type, detail) {
    if (!running) return;
    if (type === 'tutorial:skip') { api.skip(); return; }
    if (type === 'story:choose') { choose(Number(detail?.index)); return; }
    const s = read();
    if (s.finished) return;
    const step = STEP_BY_ID.get(s.step);
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
      for (const off of offs) off();
      offs = [];
    },
  };
  return api;
}
