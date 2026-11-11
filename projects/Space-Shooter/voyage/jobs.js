// The hangar's job board: talk to the quest givers (Hask, Vey, Garrity), take a
// job and play it right here in the pane with the shared quest player
// (quests/ui/player.js). The quest engine pays rewards with core's grant and
// takes costs with spend; each step's new save goes back through
// store.update in one write, so the Ledger, the Ship tab and the account sync
// see it at once. A job's death ending calls store.die(). All text goes in with
// textContent.
import { QUESTS } from './quests/data/quests/index.js';
import { QUEST_GIVERS } from './quests/data/givers.js';
import { SECTORS } from './quests/data/sectors.js';
import { availability } from './quests/engine.js';
import { createQuestPlayer, el, button, portrait, shipSummary } from './quests/ui/player.js';
import { REP_MAX } from './data.js';
import { repBand } from './economy.js';

/**
 * pane: the Jobs tab panel. store: voyage/store.js. say(events): the hangar's
 * reward toast. toast(text). dev: show a seed box (test tools only).
 * onCaptain(): open the Captain tab. onPlaying(active): a job started or ended.
 */
export function createJobs({ pane, store, say, toast, dev = false, onCaptain = () => {}, onPlaying = () => {} }) {
  let seedBox = null;

  const player = createQuestPlayer({
    root: pane,
    session: {
      get: () => store.get(),
      commit: (save, events) => { store.update(() => save); say(events); },
    },
    status: toast,
    announceEvents: false,
    onEnd: (ended) => {
      if (!ended.death) return;
      const lost = store.die();
      if (lost != null) toast(`Your captain died. ${lost} skill point${lost === 1 ? '' : 's'} lost, stats rolled again, skills refunded.`);
    },
    onExit: () => render(),
    onChange: () => onPlaying(player.active),
  });

  function take(quest) {
    const typed = Number.parseInt(seedBox?.value || '', 10);
    const seed = typed > 0 ? typed : 1 + Math.floor(Math.random() * 1e9);
    player.start(quest, seed);
  }

  function renderBoard(save) {
    if (!save.character) {
      pane.replaceChildren(
        el('p', { class: 'vy-eyebrow', text: 'JOBS' }),
        el('h2', { text: 'No captain, no contracts.' }),
        el('p', { text: 'The givers want a name to put on the job. Sign on a captain first.' }),
        button('Sign on a captain', onCaptain, { class: 'primary' }),
      );
      return;
    }
    const ship = shipSummary(save);
    seedBox = dev ? el('input', { type: 'number', id: 'vy-seed', min: '1', step: '1', placeholder: 'random', 'aria-label': 'Job seed (test tools)' }) : null;
    const fragments = Object.keys(save.flags || {}).filter((id) => id.startsWith('fragment-')).length;
    // replaceChildren would print a null as the word "null"; leave such parts out.
    pane.replaceChildren(...[
      el('p', { class: 'vy-eyebrow', text: 'JOBS' }),
      el('h2', { text: 'Who is hiring' }),
      el('p', { text: 'Take a job, fly it, get paid. Credits and parts buy upgrades in the Ship tab, and a better ship takes the next job further.' }),
      el('p', { class: 'vy-note vy-jobship', dataset: { shipHull: String(ship.hull), shipGuns: String(ship.guns), shipRace: String(ship.race) }, text: `Your ship for jobs: hull ${ship.hull} · guns ${ship.guns} · race +${ship.race}` }),
      fragments ? el('p', { class: 'vy-note', text: `The Knock: ${fragments} of 5 pieces found.` }) : null,
      seedBox ? el('label', { class: 'vy-seed' }, 'Seed (test tools) ', seedBox) : null,
      ...Object.entries(QUEST_GIVERS).map(([id, giver]) => {
        const rep = save.rep[id] || 0;
        return el('article', { class: 'vy-giver', dataset: { giver: id } },
          portrait(id, 72, 'vy-portrait'),
          el('div', {},
            el('h3', { text: giver.name }),
            el('p', { class: 'vy-role', text: `${giver.role} · ${SECTORS[giver.sector].name}` }),
            el('p', { class: 'vy-rep', dataset: { giverRep: id }, text: `Rep ${rep} / ${REP_MAX} · ${repBand(rep)}` }),
            el('p', { class: 'vy-greet', text: `"${giver.greeting}"` }),
          ),
          el('ul', { class: 'vy-jobs' }, ...giver.quests.map((qid) => {
            const q = QUESTS[qid];
            const can = availability(q, save);
            const done = save.quests?.done?.[qid];
            return el('li', { dataset: { quest: qid } },
              el('strong', { text: q.title }),
              el('span', { text: q.summary }),
              done ? el('small', { text: `Last time: ${done.result === 'success' ? 'done' : 'failed'} (${done.outcome})${done.times > 1 ? `, ${done.times} runs` : ''}` }) : null,
              button(can.ok ? 'Take the job' : can.reasons[0], () => take(q), { disabled: !can.ok, class: can.ok ? 'primary' : null }),
            );
          })),
        );
      }),
    ].filter(Boolean));
  }

  function render(save = store.get()) {
    if (player.active) return; // the player draws itself after every step
    renderBoard(save);
  }

  store.subscribe((save) => render(save));
  if (player.resume()) { player.render(); onPlaying(true); } else render();

  return {
    render,
    keydown: (e) => player.keydown(e),
    get playing() { return player.active; },
  };
}
