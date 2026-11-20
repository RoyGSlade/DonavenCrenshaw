// Jobs in the world, spoken (round 3, basics lane). Two things go through the
// hangar's own dialogue box (ui/dialogue.js, on the story bus):
//   - offers: walk up to a giver where they work and talk; they greet you and
//     offer their jobs (what each pays, or why it's closed); pick one, hear the
//     pitch, take it or not.
//   - beats: a job you have taken plays its story in the same box (the speaker,
//     the line, the choices with their odds), wherever you are, so the datapad
//     and the tracker are how you follow a job; no panel runs it.
// Lines go out as 'story:say', choices as 'story:choices' (talk 'job'); answers
// come back as 'story:choose'. All words from data (quests/data/offers.js).
import { OFFERS_DATA } from '../quests/data/offers.js';
import { QUEST_GIVERS } from '../quests/data/givers.js';
import { offersAt } from '../quests/offers.js';
import { lineById, fillLine } from '../story/lines.js';
import { voiceUrl } from '../story/voice.js';
import { beatMode } from '../slice/narration.js';
import { isSliceQuest } from '../slice/rules.js';

const W = OFFERS_DATA.words;
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
/** How long a lone "Go on" waits before it takes itself: the reading time plus a beat. */
export const autoMs = (text) => Math.min(9000, 2200 + 55 * String(text || '').length);
const readMs = (text) => Math.min(7000, 900 + 55 * String(text || '').length);

/** A timeout that stops while the talk is paused ('talk:pause' / 'talk:resume' on the bus). Returns cancel(). */
export function pausableTimer(bus, fn, ms) {
  let left = ms, started = Date.now(), id = setTimeout(done, ms);
  function done() { id = 0; offs.forEach((o) => o?.()); fn(); }
  const offs = [
    bus.on('talk:pause', () => { if (id) { clearTimeout(id); id = 0; left = Math.max(0, left - (Date.now() - started)); } }),
    bus.on('talk:resume', () => { if (!id && left > 0) { started = Date.now(); id = setTimeout(done, left); } }),
  ];
  return () => { clearTimeout(id); id = 0; left = 0; offs.forEach((o) => o?.()); };
}

/**
 * bus: the story bus. store. take(quest): start the job (jobs.js). onBusy(on): the page
 * holds the floor while a talk or a beat is up. name(): the captain's name for {name}.
 */
export function createJobTalk({ bus, store, take = () => {}, onBusy = () => {}, name = () => '' }) {
  let danger = false; // while Reavers are aboard there is no "Later": nobody walks off from a boarding
  bus.on('audio:mood', (d) => { danger = d?.mode === 'danger' || d?.mode === 'combat'; });
  let seq = 0;
  let asking = null; // { token, resolve }
  let busy = 0;
  const hold = (on) => { busy = Math.max(0, busy + (on ? 1 : -1)); onBusy(busy > 0); };

  bus.on('story:choose', (d) => {
    if (!asking) return;
    const a = asking;
    asking = null;
    a.resolve(Number(d?.index));
  });

  /** Say a line (a line id with its voice, or plain words). Resolves when it is read or skipped. */
  function say({ id = null, speaker = null, name: who = '', text = '', emotion = 'neutral' }) {
    const line = id ? lineById(id) : null;
    const words = line ? fillLine(line.text, { name: name() }) : text;
    const s = `job-${++seq}`;
    const audio = id ? voiceUrl(id) : null;
    const durationMs = readMs(words);
    const done = new Promise((resolve) => {
      const off = bus.on('story:said', (d) => { if (d?.seq === s) { off(); resolve(); } });
      setTimeout(() => { off(); resolve(); }, durationMs + 4000);
    });
    bus.emit('story:say', { seq: s, id: id || `job.${seq}`, speaker: line?.speaker || speaker, name: who || line?.name || (QUEST_GIVERS[line?.speaker]?.short ?? ''), text: words, emotion: line?.emotion || emotion, audio, durationMs });
    return done;
  }

  /** Show choices under the current line; resolves with the picked index (-1: later / not now). */
  function ask(options) {
    if (asking) asking.resolve(-2); // a newer question replaces an older one
    return new Promise((resolve) => {
      asking = { resolve };
      bus.emit('story:choices', { talk: 'job', options });
    });
  }

  const giverName = (id) => QUEST_GIVERS[id]?.short || id;
  const optionFor = (o, i) => ({ index: i, label: `${o.quest.title}${o.pay ? ` · ${o.pay}` : ''}${o.deadly ? ' · Deadly' : ''}`, locked: !o.ok, reason: o.ok ? '' : o.reasons[0], kind: 'offer' });

  /** Talk to a giver where they work: greeting, their offers, the pitch, take it or not. */
  async function offerAt(here) {
    const giver = here.npc;
    const list = offersAt(here, store.get());
    if (!list.length) return false;
    hold(true);
    bus.emit('talk:open', { speaker: giver });
    try {
      const greet = [1, 2, 3].map((n) => `${giver}.greet.${n}`).filter((id) => lineById(id));
      const greetId = greet[Math.floor(Math.random() * greet.length)] || null;
      if (!list.some((o) => o.ok)) {
        say({ id: null, speaker: giver, name: giverName(giver), text: W.noJobs });
        await ask([...list.map(optionFor), { index: -1, label: W.notNow, kind: 'later' }]);
        return true;
      }
      say(greetId ? { id: greetId } : { speaker: giver, name: giverName(giver), text: QUEST_GIVERS[giver]?.greeting || '' });
      for (;;) {
        const pick = await ask([...list.map(optionFor), { index: -1, label: W.notNow, kind: 'later' }]);
        if (pick < 0 || !list[pick]?.ok) return true;
        const o = list[pick];
        const pitch = `${giver}.job.${o.quest.id}`;
        say(lineById(pitch) ? { id: pitch } : { speaker: giver, name: giverName(giver), text: o.quest.summary });
        const yes = await ask([
          { index: 0, label: `${W.take}${o.pay ? ` · ${o.pay}` : ''}${o.deadly ? ` · ${W.deadlyShort}` : ''}`, kind: 'take' },
          { index: 1, label: W.back, kind: 'back' },
          { index: -1, label: W.notNow, kind: 'later' },
        ]);
        if (yes === 0) { hold(false); take(o.quest, { from: 'giver', giver }); return true; }
        if (yes < 0) return true;
        say(greetId ? { id: greetId } : { speaker: giver, name: giverName(giver), text: W.pickJob });
      }
    } finally {
      if (busy) hold(false);
      bus.emit('story:choices', null);
      bus.emit('talk:close', { speaker: giver });
    }
  }

  /**
   * One beat of a job you have taken: the engine's dialogue view (v) in the box.
   * Resolves with the picked choice index, or -1 for "Later" (the job waits).
   */
  let walkedOff = false; // the player left mid-line: the beat answers Later as soon as it would ask
  async function beat(v, { choicesOnly = false } = {}) {
    hold(true);
    walkedOff = false;
    const speaker = v.portrait || null;
    bus.emit('talk:open', { speaker: speaker && speaker !== 'narrator' ? speaker : null });
    try {
      // The stage direction first, then the spoken line (its voice plays through jobs.js's voice hook).
      // Stage directions are not dialogue (opening B): a direction the staging performs is not shown; the rest is a small caption that
      // goes by itself, never a box that waits for Next.
      if (v.beat && !choicesOnly && beatMode(v.quest?.id, v.node) === 'caption') bus.emit('talk:caption', { text: v.beat, node: v.node });
      if (walkedOff) return -1;
      if (!choicesOnly) { say({ speaker: speaker || 'narrator', name: v.speaker || '', text: v.text }); if (v.line) bus.emit('talk:line', { id: v.line, speaker }); }
      const options = v.choices.map((c) => ({
        index: c.index,
        label: c.label,
        locked: c.locked,
        reason: c.locked ? (c.reasons || [])[0] || '' : '',
        ...(c.check ? { kind: 'attempt', name: c.check.name, plain: isSliceQuest(v.quest?.id), minigame: Boolean(c.minigame), chance: c.check.chance, dc: c.check.dc, roll: c.check.roll, approach: Boolean(v.approach?.[c.index]), ...(v.approach?.[c.index] ? { verb: v.approach[c.index].verb } : {}) } : { kind: 'choice' }),
      }));
      // Only one plain choice (a lone "Go on"): it takes itself once the line has had time to be read (the clock stops while the talk is paused).
      const lone = options.length === 1 && !options[0].locked && options[0].kind === 'choice' ? options[0] : null;
      const answer = ask(danger ? options : [...options, { index: -1, label: W.later, kind: 'later' }]);
      let stopAuto = () => {};
      if (lone && !choicesOnly) {
        const fire = () => { if (asking) { const a = asking; asking = null; bus.emit('story:choices', null); a.resolve(lone.index); } };
        stopAuto = pausableTimer(bus, fire, autoMs(v.text));
      }
      try { return await answer; } finally { stopAuto(); }
    } finally {
      hold(false);
      bus.emit('talk:close', { speaker });
    }
  }

  /** The talk ended because the player walked off: it counts as "Later" (the scene waits on this person). */
  function leave() { walkedOff = true; if (asking) { const a = asking; asking = null; bus.emit('story:choices', null); a.resolve(-1); } }

  return {
    offerAt,
    beat,
    leave,
    say,
    get busy() { return busy > 0; },
    /** Drop any open question (a station opened, a map changed). */
    cancel() { if (asking) { const a = asking; asking = null; a.resolve(-2); } bus.emit('story:choices', null); },
  };
}
