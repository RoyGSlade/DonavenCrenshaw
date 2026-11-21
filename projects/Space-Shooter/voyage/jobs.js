// Jobs (round 3, basics lane). Donaven: "jobs that are active on a data pad
// while jobs that you havent taken are in the world". Jobs you have not taken
// are found in the world: a giver offers theirs in person where they work
// (datapad/jobTalk.js), and the hangar's job board carries postings from givers
// who are not on this station (renderPostings, the board's panel). A job you
// have taken runs on the shared quest player (quests/ui/player.js) with a
// presenter: its dialogue beats play in the hangar's dialogue box and only its
// travel, fights, puzzles, races, events and result show in the job card
// (#dp-jobcard), so you follow it on the datapad and the tracker. The quest
// engine pays rewards with core's grant and takes costs with spend; each step's
// new save goes back through store.update in one write. A job's death ending
// calls store.die(). All text goes in with textContent.
import { QUESTS } from './quests/data/quests/index.js';
import { QUEST_GIVERS } from './quests/data/givers.js';
import { SECTORS } from './quests/data/sectors.js';
import { offersAt, isDeadly } from './quests/offers.js';
import { OFFERS_DATA } from './quests/data/offers.js';
import { createQuestPlayer, el, button, portrait, shipSummary } from './quests/ui/player.js';
import { DEATH } from './data.js';
import { economy } from './account.js';
import { flyQuestRace, takeReturnedRace } from './races/launch.js';

/**
 * pane: the job card's player pane (#pane-jobs). store: voyage/store.js. say(events): the hangar's
 * reward toast. toast(text). dev: show a seed box (test tools only).
 * onCaptain(): open the Captain tab. onPlaying(active): a job started or ended.
 */
// crew (P11, optional): { aboard() -> crew card | null, step(events), changed() }.
// aboard() is passed to the engine so crew jobs apply; step(events) runs after
// each committed step (the crew's share and screen); changed() when a job
// starts or ends.
// live(frame) (optional): a live fight frame for the crew's turret scope.
const NO_CREW = Object.freeze({ aboard: () => null, step: () => {}, changed: () => {}, live: () => {} });

// voice({ line, speaker, text }): play a spoken node's line. rolled(rolls): show the attempts on the dice.
// presenter: the quest player's (dialogue beats to the dialogue box, card for the rest).
export function createJobs({ pane, store, say, toast, dev = false, onCaptain = () => {}, onPlaying = () => {}, crew = NO_CREW, voice = null, rolled = () => {}, presenter = null }) {
  let seedBox = null;

  const player = createQuestPlayer({
    root: pane,
    crew: () => crew.aboard(),
    session: {
      get: () => store.get(),
      commit: (save, events, info = {}) => {
        store.update(() => save); say(events); crew.step(events);
        // Server mode: a step that paid is a checkpoint, so a pilot who quits still pays everyone up to it (outcome 3).
        if (player.quest?.id && (events || []).some((e) => e.type === 'money' || e.type === 'item')) economy.jobCheckpoint(player.quest.id, info.run?.node || null, crew.hubSeats?.());
      },
    },
    status: toast,
    announceEvents: false,
    onEnd: (ended) => {
      // Server mode (voyage/account.js): the job's net change goes to the hub, which pays what it allows.
      if (player.quest?.id) economy.jobEnded(player.quest.id, ended, crew.hubSeats?.());
      if (!ended.death) return;
      if (economy.on) economy.died();
      const lost = store.die();
      if (lost != null) toast(`Your captain died. ${lost} skill point${lost === 1 ? '' : 's'} lost, stats rolled again, skills refunded${DEATH.loseUpgrades ? ', ship upgrades lost' : ''}.`);
    },
    onExit: () => { presenter?.card(null); render(); crew.changed(); presenter?.exit?.(); },
    exitLabel: 'Done',
    presenter,
    onChange: () => { onPlaying(player.active); crew.changed(); },
    // Race legs fly live on today's racing page, in a frame over the hangar
    // (voyage/races/launch.js); the time comes back as the engine's live action.
    liveRace: () => flyQuestRace({ store, title: player.quest?.title || '', onResult: (r) => player.raceResult(r) }),
    crewLive: (frame) => crew.live?.(frame),
    voice,
    rolled: (rolls) => { if (player.quest?.id) economy.jobRolled(player.quest.id, rolls); rolled(rolls); },
  });

  /** Start a job. opts.toast replaces the "Job taken" toast (the opening's scenes are handed to you, not taken). */
  function take(quest, opts = {}) {
    if (player.active && player.run?.ended) player.exit(); // a finished job left on its result card
    if (player.active) { toast(OFFERS_DATA.words.noJobs); return false; }
    const typed = Number.parseInt(seedBox?.value || '', 10);
    const seed = typed > 0 ? typed : 1 + Math.floor(Math.random() * 1e9);
    toast(opts.toast ?? OFFERS_DATA.words.taken.replace('{title}', quest.title));
    economy.jobStarted(quest.id, crew.hubSeats?.());
    player.start(quest, seed);
    return true;
  }

  /** Opening B (retry): the scene starts again from its first beat on the save the caller just restored. */
  function restart(quest, opts) { player.reset(); return take(quest, opts); }

  // The job board: postings from givers who are not on this station, pinned up
  // like notes. Pick one and take it here; the job then runs in the world.
  let postTarget = null;
  let postTake = (quest) => take(quest);
  function renderPostings(target = postTarget, onTake = postTake) {
    if (!target) return;
    postTarget = target;
    postTake = onTake;
    const save = store.get();
    if (!save.character) {
      target.replaceChildren(
        el('p', { class: 'vy-eyebrow', text: 'JOB BOARD' }),
        el('h2', { text: 'No captain, no contracts.' }),
        el('p', { text: 'The givers want a name to put on the job. Sign on a captain first.' }),
        button('Sign on a captain', onCaptain, { class: 'primary' }),
      );
      return;
    }
    const W = OFFERS_DATA.words;
    const posts = offersAt({ map: 'hangar', board: true }, save);
    const ship = shipSummary(save);
    seedBox = dev ? el('input', { type: 'number', id: 'vy-seed', min: '1', step: '1', placeholder: 'random', 'aria-label': 'Job seed (test tools)' }) : null;
    const running = player.active ? QUESTS[player.quest?.id || ''] : null;
    target.replaceChildren(...[
      el('p', { class: 'vy-eyebrow', text: 'JOB BOARD · POSTINGS' }),
      el('p', { class: 'vy-note', text: W.boardIntro }),
      running ? el('p', { class: 'vy-note vy-why', text: `You're on ${running.title}. Finish it before you take another (it's on your datapad, J).` }) : null,
      el('p', { class: 'vy-note vy-jobship', dataset: { shipHull: String(ship.hull), shipGuns: String(ship.guns), shipRace: String(ship.race) }, text: `Your ship for jobs: hull ${ship.hull} · guns ${ship.guns} · race +${ship.race}` }),
      seedBox ? el('label', { class: 'vy-seed' }, 'Seed (test tools) ', seedBox) : null,
      el('ul', { class: 'vy-postings' }, ...posts.map((o) => {
        const giver = QUEST_GIVERS[o.giver];
        return el('li', { class: `vy-posting${o.ok ? '' : ' is-closed'}`, dataset: { quest: o.id, giver: o.giver } },
          el('div', { class: 'vy-posting-pin', 'aria-hidden': 'true' }),
          el('div', { class: 'vy-posting-who' }, portrait(o.giver, 40, 'vy-posting-face'), el('span', {}, el('b', { text: giver.short }), el('small', { text: SECTORS[giver.sector]?.name || '' }))),
          el('strong', { text: o.quest.title }),
          el('span', { class: 'vy-posting-text', text: o.quest.summary }),
          el('small', { class: 'vy-posting-pay', text: o.pay ? `Pays ${o.pay}` : 'Pays in parts and favours' }),
          o.deadly ? el('small', { class: 'vy-why', text: W.deadly }) : null,
          o.last ? el('small', { text: `Last time: ${o.last.result === 'success' ? 'done' : 'failed'} (${o.last.outcome})${o.last.times > 1 ? `, ${o.last.times} runs` : ''}` }) : null,
          button(o.ok ? 'Take it' : o.reasons[0], () => onTake(o.quest), { disabled: !o.ok, class: o.ok ? 'primary' : null }),
        );
      })),
      posts.length ? null : el('p', { class: 'vy-note', text: W.boardEmpty }),
    ].filter(Boolean));
  }

  function render() {
    // The postings redraw while the board is open; the player draws itself after every step.
    if (postTarget?.isConnected && !postTarget.hidden) renderPostings();
  }

  store.subscribe(() => render());
  // A job saved in progress waits: the tracker and the datapad offer to continue it.
  if (player.resume()) onPlaying(true);
  // A race flown on the racing page opened on its own comes back by link.
  const returned = takeReturnedRace();
  if (returned?.kind === 'quest' && player.active) player.raceResult(returned);

  /**
   * Open a job straight away (the Studio's play link ?quest=<id>&node=<dialogue node>&seed=n).
   * Only for a throwaway save: it drops any job in progress. Returns false for an unknown quest.
   */
  function openLinked(questId, { node = null, seed = 1 } = {}) {
    const quest = QUESTS[questId];
    if (!quest) return false;
    if (player.active) player.exit();
    store.update((s) => ({ ...s, quests: { ...s.quests, active: {} } }));
    player.start(quest, seed > 0 ? seed : 1);
    const target = node && quest.nodes[node];
    if (target?.type === 'dialogue' && player.run && !player.run.ended) {
      const run = { ...player.run, node, part: null };
      player.exit();
      store.update((s) => ({ ...s, quests: { ...s.quests, active: { [quest.id]: run } } }));
      if (player.resume()) player.render();
    }
    onPlaying(player.active);
    return true;
  }

  /** Pick the job in progress back up (the tracker's Continue, the datapad). */
  function resumeJob() {
    if (!player.active && !player.resume()) return false;
    // A job picked up again after a reload gets a fresh ticket: it pays what is earned from here.
    if (player.quest?.id && !economy.hasJob(player.quest.id)) economy.jobStarted(player.quest.id, crew.hubSeats?.());
    player.render();
    return true;
  }

  return {
    render,
    renderPostings,
    take,
    restart,
    resume: resumeJob,
    openLinked,
    keydown: (e) => player.keydown(e),
    get playing() { return player.active; },
    /** The job in progress' title ('' when none). */
    get title() { return player.quest?.title || ''; },
    /** A crew action from player two; an error string for them, or null. */
    crewAct: (action, card) => player.crewAct(action, card),
    /** The job in progress, for the crew's screen: { quest, run, live }. */
    crewView: () => ({ quest: player.quest, run: player.run, live: player.live }),
  };
}
