// The quest player: draws a running quest (dialogue, travel, events, fights,
// cipher lock, riddle, race leg, the live Dogfight fight) and turns clicks and
// keys into engine actions. All rules live in ../engine.js and its parts; this
// file only shows them. All text goes in with textContent.
//
// Used by the hangar's job board (voyage/jobs.js) and the quest sandbox. The
// page hands in a session that owns the save:
//   session.get()                        -> the save to play on
//   session.commit(save, events, { run }) -> keep the engine's new save
// The engine pays rewards and takes costs with core's grant/spend, so one
// commit puts a step's costs, rewards and quest state in place together.
import { QUESTS } from '../data/quests/index.js';
import { QUEST_GIVERS } from '../data/givers.js';
import { SECTORS, LANES } from '../data/sectors.js';
import { ITEMS, GIVERS } from '../core.js';
import { startQuest, view, act, shipFor } from '../engine.js';
import { shipRaceBonus } from '../parts/race.js';
import { CIPHER_SYMBOLS } from '../parts/cipher.js';
import { createLiveFight, stepLiveFight, liveFightResult } from '../live/dogfight.js';
import { giverPortrait } from '../../art.js';
import { BADGES_DATA } from '../data/badges.js';
import { UNLOCK_NAMES } from '../../data.js';
import { RULES, NEUTRAL } from '../../../dogfight/simulation.js';
import { drawCustomShip } from '../../../dogfight/shipArt.js';

// ---- tiny DOM helper ------------------------------------------------------
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export const button = (label, onclick, props = {}) => el('button', { type: 'button', onclick, ...props }, label);

// ---- reward lines -----------------------------------------------------------
/** The reward events worth showing a player (story flags other than Knock fragments stay quiet). */
export const shownEvents = events => events.filter(e => (e.type !== 'flag' || (e.id.startsWith('fragment-') && e.value)) && e.amount !== 0);

export function eventText(e) {
  const sign = n => (n > 0 ? `+${n}` : String(n));
  if (e.type === 'money') return `${sign(e.amount)} credits`;
  if (e.type === 'rep') return `${sign(e.amount)} rep with ${GIVERS[e.giver]?.name || e.giver}`;
  if (e.type === 'item') return `${sign(e.amount)} ${ITEMS[e.id]?.name || e.id}`;
  if (e.type === 'skill-points') return `${sign(e.amount)} skill point${e.amount === 1 ? '' : 's'}`;
  if (e.type === 'flag') return 'A Knock fragment';
  if (e.type === 'max-rep') return `Max rep with ${GIVERS[e.giver]?.name || e.giver}`;
  if (e.type === 'unlock') {
    const badge = e.id.startsWith('badge:') ? BADGES_DATA.badges[e.id.slice(6)] : null;
    return badge ? `New badge: ${badge.name}` : `Unlocked ${UNLOCK_NAMES[e.id] || e.id}`;
  }
  return e.type;
}

/** The giver's portrait, or null. */
export function portrait(id, size = 120, cls = 'qs-portrait') {
  const giver = QUEST_GIVERS[id];
  const src = giverPortrait(id);
  return giver && src ? el('img', { class: cls, src, alt: `Portrait of ${giver.name}`, width: String(size), height: String(size) }) : null;
}

/** The ship a quest will fly, in plain numbers: { hull, guns, race }. */
export function shipSummary(save) {
  const ship = shipFor(save);
  return { hull: ship.hp, guns: ship.damage, race: shipRaceBonus(save) };
}

// ---- the player -------------------------------------------------------------
/**
 * root: the element the quest is drawn in. session: see the top of the file.
 * status(text): a one-line note for the page. onEnd(ended, events): the quest
 * just ended (after its save was committed). onExit(): the player pressed
 * "Back to the job board". exitLabel: that button's words. announceEvents:
 * false when the page shows reward events itself (from session.commit).
 * crew(): the crew aboard (voyage/crew/card.js card) or null; crew actions
 * come in through crewAct (P11).
 */
// voice({ line, speaker, text }): a spoken node just came on screen (once per
// visit). The page plays the line's audio (story's voiceUrl / speak) and keeps
// showing `text` from the view; without a voice hook the player is text only.
export function createQuestPlayer({ root, session, status = () => {}, onEnd = () => {}, onExit = () => {}, onChange = () => {}, exitLabel = 'Back to the job board', announceEvents = true, crew = () => null, voice = null }) {
  let current = null; // { quest, run }
  let voiced = '';
  let lastEvents = [];
  let ui = { key: '', cipher: [], riddle: [] };
  let keyHandlers = [];
  let live = null;

  function start(quest, seed) {
    const started = startQuest(quest, session.get(), { seed, now: Date.now() });
    current = { quest, run: started.run };
    lastEvents = started.events;
    session.commit(started.save, started.events, { run: started.run });
    render();
    onChange();
    if (started.run.ended) onEnd(started.run.ended, started.events);
  }

  /** Picks up the quest in progress in the save, if any. */
  function resume() {
    const active = Object.values(session.get().quests?.active || {})[0];
    if (active && QUESTS[active.quest]) { current = { quest: QUESTS[active.quest], run: active }; return true; }
    return false;
  }

  // One engine step; returns the engine's error, or null.
  function apply(action) {
    if (!current) return 'No job running.';
    const result = act(current.quest, current.run, session.get(), action, { now: Date.now(), crew: crew() });
    if (result.error) return result.error;
    current.run = result.run;
    lastEvents = result.events;
    const lines = shownEvents(result.events);
    if (announceEvents && lines.length) status(lines.map(eventText).join(' · '));
    session.commit(result.save, result.events, { run: result.run });
    render();
    if (result.run.ended) onEnd(result.run.ended, result.events);
    return null;
  }

  function doAct(action) {
    const error = apply(action);
    if (error && current) status(error);
  }

  /** A crew action from player two (P11). Returns an error for the crew, or null. */
  function crewAct(action) {
    if (!current) return 'The captain has not taken a job yet.';
    if (live) return 'The captain is flying this fight live. Hold on.';
    if (!crew()) return 'No crew aboard.';
    return apply({ ...action, type: 'crew' });
  }

  function exit() {
    current = null; lastEvents = []; ui = { key: '', cipher: [], riddle: [] };
    onExit();
    onChange();
  }

  // ---- parts ----
  function hullBar(label, value, max, cls = '') {
    const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
    return el('div', { class: `qs-bar ${cls}` },
      el('span', { text: `${label} ${Math.max(0, Math.round(value))}/${Math.round(max)}` }),
      el('div', { class: 'qs-bar-track', role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(max)), 'aria-valuenow': String(Math.max(0, Math.round(value))) }, el('i', { style: `width:${pct}%` })),
    );
  }

  function choiceList(choices, onPick) {
    const list = el('ol', { class: 'qs-choices' });
    choices.forEach((choice, n) => {
      const hint = choice.locked ? choice.reasons.join(', ') : choice.check ? choice.check.text : '';
      list.append(el('li', {}, button(`${n + 1}. ${choice.label}`, () => onPick(choice), { disabled: choice.locked, 'aria-describedby': hint ? `qs-hint-${n}` : null }), hint ? el('small', { id: `qs-hint-${n}`, class: choice.locked ? 'qs-locked' : 'qs-check', text: hint }) : null));
      if (!choice.locked && n < 9) keyHandlers.push({ key: String(n + 1), fn: () => onPick(choice) });
    });
    return list;
  }

  function renderQuest() {
    keyHandlers = [];
    const save = session.get();
    const v = view(current.quest, current.run, save);
    const uiKey = `${v.node}:${current.run.steps}:${v.part?.kind || ''}`;
    if (!ui.key.startsWith(`${v.node}:`) || !v.part) ui = { key: uiKey, cipher: [], riddle: [] };
    ui.key = uiKey;
    const ship = shipSummary(save);
    const said = `${current.quest.id}:${v.node}:${current.run.visits?.[v.node] || 0}`;
    if (v.line && voice && said !== voiced && !v.part) {
      voiced = said;
      try { voice({ line: v.line, speaker: v.speaker, text: v.text }); } catch (error) { console.warn('Stardust: quest voice failed', error); }
    }
    const head = el('div', { class: 'qs-quest-head' },
      el('h2', { class: 'qs-title', text: v.quest.title }),
      el('p', { class: 'qs-where', text: `${v.locationName} · seed ${current.run.seed}` }),
      hullBar('Hull', v.hull, v.hullMax),
      crew() ? el('p', { class: 'qs-where qs-crew', text: `Crew aboard: ${crew().name}, on the turret, repairs, scopes and checks.` }) : null,
      el('p', { class: 'qs-where qs-ship', dataset: { shipHull: String(v.hullMax), shipGuns: String(ship.guns), shipRace: String(ship.race) }, text: `Your ship: hull ${v.hullMax} · guns ${ship.guns} · race +${ship.race}` }),
    );
    let body;
    if (v.ended) body = renderEnd(v);
    else if (v.part) body = renderPart(v);
    else body = renderDialogue(v);
    root.replaceChildren(head, body);
  }

  function renderDialogue(v) {
    return el('section', { class: 'qs-dialogue', 'aria-live': 'polite' },
      v.portrait ? portrait(v.portrait) : null,
      el('div', { class: 'qs-box' },
        v.beat ? el('p', { class: 'qs-beat', text: v.beat }) : null,
        v.speaker ? el('p', { class: 'qs-speaker', text: v.speaker }) : null,
        el('p', { class: v.speaker ? 'qs-text qs-said' : 'qs-text', text: v.text }),
        choiceList(v.choices, choice => doAct({ type: 'choose', index: choice.index })),
      ),
    );
  }

  function renderEnd(v) {
    const win = v.ended.result === 'success';
    const lines = shownEvents(lastEvents);
    return el('section', { class: `qs-end ${win ? 'is-win' : 'is-fail'}` },
      el('p', { class: 'qs-eyebrow', text: win ? 'JOB DONE' : 'JOB FAILED' }),
      el('h3', { text: v.ended.title }),
      v.beat ? el('p', { class: 'qs-beat', text: v.beat }) : null,
      v.speaker ? el('div', { class: 'qs-end-say' },
        v.portrait ? portrait(v.portrait, 72) : null,
        el('div', {}, el('p', { class: 'qs-speaker', text: v.speaker }), el('p', { class: 'qs-text qs-said', text: v.ended.text })),
      ) : el('p', { class: 'qs-text', text: v.ended.text }),
      lines.length ? el('ul', { class: 'qs-rewards' }, ...lines.map(e => el('li', { text: eventText(e) }))) : el('p', { class: 'qs-note', text: 'No reward.' }),
      v.ended.death ? el('p', { class: 'qs-locked qs-death', text: 'Your captain died on this job. Half of their skill points are gone, the rest are refunded to spend again, and their stats were rolled fresh.' }) : null,
      v.ended.followUp ? el('p', { class: 'qs-note', text: `Follow-up: ${QUESTS[v.ended.followUp]?.title || v.ended.followUp} is on the board again.` }) : null,
      button(exitLabel, exit, { class: 'primary' }),
    );
  }

  function renderPart(v) {
    const p = v.part;
    switch (p.kind) {
      case 'trip': return renderTrip(p);
      case 'event': return el('section', { class: 'qs-part' }, el('h3', { text: v.title || 'On the way' }), renderCard(p.card));
      case 'skirmish': return renderFight(p, action => doAct(action));
      case 'foot': return renderFoot(p);
      case 'cipher': return renderCipher(p);
      case 'riddle': return renderRiddle(p);
      case 'race': return renderRace(p);
      default: return el('p', { text: `Unknown step ${p.kind}` });
    }
  }

  // ---- travel ----
  const SVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, val);
    for (const child of children) node.append(child);
    return node;
  }

  function sectorMap(trip) {
    const W = 600, H = 300;
    const at = id => [SECTORS[id].x * W, SECTORS[id].y * H];
    const map = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'qs-map', role: 'img', 'aria-label': `Sector map. You are at ${SECTORS[trip.at].name}. Destination ${SECTORS[trip.to].name}.` });
    const onPath = (a, b, path) => path && path.some((id, i) => i && ((path[i - 1] === a && id === b) || (path[i - 1] === b && id === a)));
    for (const [a, b] of LANES) {
      const [x1, y1] = at(a), [x2, y2] = at(b);
      const planned = onPath(a, b, trip.path);
      const offered = !trip.path && trip.routes.some(r => onPath(a, b, r.path));
      map.append(svg('line', { x1, y1, x2, y2, class: planned ? 'lane is-planned' : offered ? 'lane is-offered' : 'lane' }));
    }
    for (const [id, s] of Object.entries(SECTORS)) {
      const [x, y] = at(id);
      const cls = ['sector', id === trip.at ? 'is-here' : '', id === trip.to ? 'is-dest' : '', `f-${s.faction}`].join(' ');
      const label = svg('text', { x, y: y + 30, 'text-anchor': 'middle' });
      label.textContent = s.name;
      map.append(svg('g', { class: cls }, svg('circle', { cx: x, cy: y, r: id === trip.at ? 13 : 10 }), label));
    }
    return map;
  }

  function renderTrip(p) {
    const box = el('section', { class: 'qs-part qs-trip' }, el('h3', { text: `Travel to ${SECTORS[p.to].name}` }), sectorMap(p));
    if (p.phase === 'plan') {
      box.append(el('p', { class: 'qs-text', text: 'Pick a lane. Each jump can turn up something on the way. Fast is fewer jumps; safe goes round the dangerous sectors.' }));
      const pick = p.crewMark && p.routes.find(r => r.id === p.crewMark);
      if (pick) box.append(el('p', { class: 'qs-note qs-crew', text: `Your navigator recommends: ${pick.label}.` }));
      box.append(choiceList(p.routes.map(r => ({ label: `${r.label}, ${r.risk < 0.3 ? 'quiet' : r.risk < 0.7 ? 'some trouble likely' : 'trouble likely'}`, route: r.id, locked: false, reasons: [] })), choice => doAct({ type: 'route', route: choice.route })));
    } else if (p.phase === 'card') box.append(renderCard(p.card));
    else {
      const text = p.phase === 'arrived' ? `You drop out of the jump at ${SECTORS[p.to].name}.` : `At ${SECTORS[p.at].name}. Next jump: ${SECTORS[p.next].name}.`;
      box.append(el('p', { class: 'qs-text', text }), button(p.phase === 'arrived' ? 'Dock' : 'Jump', () => doAct({ type: 'continue' }), { class: 'primary' }));
      keyHandlers.push({ key: 'Enter', fn: () => doAct({ type: 'continue' }) });
    }
    if (p.log.length) box.append(el('ul', { class: 'qs-minilog' }, ...p.log.slice(-4).map(line => el('li', { text: line }))));
    return box;
  }

  function renderCard(card) {
    if (!card) return el('p', { text: 'Nothing happens.' });
    const box = el('div', { class: 'qs-event' }, el('p', { class: 'qs-eyebrow', text: 'RANDOM EVENT' }), el('h4', { text: card.title }), el('p', { class: 'qs-text', text: card.text }));
    if (card.phase === 'choose') box.append(choiceList(card.choices, choice => doAct({ type: 'choose', index: choice.index })));
    else if (card.phase === 'fight') box.append(renderFight({ kind: 'skirmish', ...card.fight }, action => doAct(action)));
    else {
      box.append(el('p', { class: 'qs-result', text: card.result }), button('Carry on', () => doAct({ type: 'continue' }), { class: 'primary' }));
      keyHandlers.push({ key: 'Enter', fn: () => doAct({ type: 'continue' }) });
    }
    return box;
  }

  // ---- fights ----
  const MOVE_KEYS = { fire: 'f', evade: 'e', hail: 'h', flee: 'b' };
  function renderFight(p, send) {
    const e = p.enemy;
    const box = el('section', { class: 'qs-part qs-fight' },
      el('h3', { text: `Ship fight: ${e.name}` }),
      el('p', { class: 'qs-text', text: `It ${e.movementText}.` }),
      el('ul', { class: 'qs-abilities' }, ...e.abilities.map(a => el('li', { text: a.text }))),
      hullBar(e.name, e.hp, e.hpMax, 'is-enemy'),
      e.shield ? el('p', { class: 'qs-note', text: `Shield: ${e.shield}` }) : null,
      hullBar('Your hull', p.ship.hp, p.ship.hpMax),
      el('p', { class: 'qs-note', text: `Your guns hit for ${p.ship.damage} + d6.` }),
      ...Object.entries(p.systems || {}).filter(([, down]) => down).map(([id]) => el('p', { class: 'qs-locked', dataset: { system: id }, text: id === 'guns' ? 'Guns knocked out: half damage until your crew repairs them.' : 'Engine knocked out: evading and breaking off are harder until your crew repairs it.' })),
      el('ol', { class: 'qs-minilog' }, ...p.log.map(line => el('li', { text: line }))),
    );
    const moves = el('div', { class: 'qs-moves' }, ...p.moves.map(m => button(`${m.label} [${MOVE_KEYS[m.id].toUpperCase()}]`, () => send({ move: m.id }))));
    for (const m of p.moves) keyHandlers.push({ key: MOVE_KEYS[m.id], fn: () => send({ move: m.id }) });
    box.append(moves);
    if (p.live) box.append(el('p', { class: 'qs-live-row' }, button('Fly it live (Dogfight combat)', () => openLiveFight(p.live.setup, e.name, send)), el('small', { text: ' Arrows or WASD to fly, Space to fire, Shift to boost. Touch buttons on phones.' })));
    return box;
  }

  function renderFoot(p) {
    const box = el('section', { class: 'qs-part' }, el('h3', { text: `${p.title}: ${p.enemy.name}` }), el('p', { class: 'qs-note', text: p.note }));
    box.append(el('div', { class: 'qs-moves' }, ...p.moves.map(m => button(m.label, () => doAct({ move: m.id })))));
    return box;
  }

  // ---- cipher lock: keys 1-6, Backspace, Enter, or tap ----
  function renderCipher(p) {
    const entry = ui.cipher;
    const slots = el('div', { class: 'qs-slots', 'aria-label': `Code entry, ${entry.length} of ${p.length}` });
    for (let i = 0; i < p.length; i++) {
      const known = p.reveal && p.reveal.slot === i ? CIPHER_SYMBOLS[p.reveal.symbol] : null;
      const sym = entry[i] != null ? CIPHER_SYMBOLS[entry[i]] : null;
      slots.append(el('span', { class: `qs-slot${known ? ' is-known' : ''}`, text: sym ? sym.symbol : known ? known.symbol : '·', title: sym ? sym.label : known ? `Known: ${known.label}` : 'empty' }));
    }
    const push = id => { if (entry.length < p.length) { entry.push(id); render(); } };
    const pop = () => { entry.pop(); render(); };
    const submit = () => { if (entry.length === p.length) { const code = [...entry]; ui.cipher = []; doAct({ type: 'guess', code }); } else status(`Enter ${p.length} symbols.`); };
    const pad = el('div', { class: 'qs-pad' }, ...p.symbols.map(s => button(`${s.symbol} ${s.label} [${s.key}]`, () => push(s.id))));
    p.symbols.forEach(s => keyHandlers.push({ key: s.key, fn: () => push(s.id) }));
    keyHandlers.push({ key: 'Backspace', fn: pop }, { key: 'Enter', fn: submit });
    const history = el('ol', { class: 'qs-guesses' }, ...p.guesses.map(g => el('li', { text: `${g.code.map(id => CIPHER_SYMBOLS[id].symbol).join(' ')}   ${g.exact} in place, ${g.near} elsewhere` })));
    return el('section', { class: 'qs-part qs-cipher' },
      el('h3', { text: p.title }),
      el('p', { class: 'qs-text', text: p.rules }),
      p.reveal ? el('p', { class: 'qs-note', text: `Your Wisdom reads the wear on the keys: slot ${p.reveal.slot + 1} is ${CIPHER_SYMBOLS[p.reveal.symbol].label}.` }) : null,
      slots, pad,
      el('div', { class: 'qs-moves' }, button('Undo [Backspace]', pop), button('Try the code [Enter]', submit, { class: 'primary' }), button('Give up', () => doAct({ type: 'giveUp' }))),
      el('p', { class: 'qs-note', role: 'status', text: `${p.attemptsLeft} of ${p.attempts} tries left.` }),
      history,
    );
  }

  // ---- riddle: keys 1-4, Backspace, Enter, or tap ----
  function renderRiddle(p) {
    const seq = ui.riddle;
    const add = id => { if (!seq.includes(id) && seq.length < 4) { seq.push(id); render(); } };
    const clear = () => { ui.riddle = []; render(); };
    const submit = () => { if (seq.length === 4) { const order = [...seq]; ui.riddle = []; doAct({ type: 'answer', order }); } else status('Choose all four echoes.'); };
    const pads = el('div', { class: 'glyph-grid' }, ...p.pads.map((g, i) => el('button', { type: 'button', 'aria-pressed': seq.includes(g.id) ? 'true' : 'false', onclick: () => add(g.id) }, el('b', { text: g.symbol }), `${g.label} [${i + 1}]`)));
    p.pads.forEach((g, i) => keyHandlers.push({ key: String(i + 1), fn: () => add(g.id) }));
    keyHandlers.push({ key: 'Backspace', fn: clear }, { key: 'Enter', fn: submit });
    const names = seq.map(id => p.pads.find(g => g.id === id).label);
    return el('section', { class: 'qs-part qs-riddle' },
      el('h3', { text: p.title }),
      el('p', { class: 'riddle', text: p.instruction }),
      el('ul', { class: 'qs-fragments' }, ...p.fragments.map(f => el('li', {}, el('b', { text: f.symbol }), ` ${f.text}`))),
      pads,
      el('p', { class: 'sequence', role: 'status', text: names.length ? `${names.length} of 4: ${names.join(' → ')}` : '0 of 4 entered' }),
      el('div', { class: 'qs-moves' }, button('Clear [Backspace]', clear), button('Return the echoes [Enter]', submit, { class: 'primary' }), button('Give up', () => doAct({ type: 'giveUp' }))),
      p.wrong ? el('p', { class: 'qs-locked', text: 'The seal rejects that order.' }) : null,
      p.hint ? el('p', { class: 'qs-note', text: p.hint }) : null,
      el('p', { class: 'qs-note', text: `${p.attemptsLeft} tries left.` }),
    );
  }

  // ---- race leg ----
  function renderRace(p) {
    const secs = ms => `${(ms / 1000).toFixed(2)} s`;
    return el('section', { class: 'qs-part qs-race' },
      el('h3', { text: p.title }),
      el('p', { class: 'qs-text', text: `${p.rival.name} will run ${p.track.title} in ${secs(p.targetMs)}. Beat it.` }),
      el('p', { class: 'qs-note', text: `Your ship adds +${p.shipBonus || 0} to the roll (engine, thrusters and flying skills). Flying this leg live on today's racing engine comes later; for now it resolves with a Dexterity roll.` }),
      el('div', { class: 'qs-moves' }, ...p.moves.map(m => button(m.label, () => doAct({ type: 'quick', style: m.id })))),
    );
  }

  // ---- live fight on Dogfight's simulation ----
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'thrust', w: 'thrust', W: 'thrust', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'fire', Shift: 'boost' };

  function openLiveFight(setup, name, send) {
    if (live) return;
    const canvas = el('canvas', { class: 'qs-live-canvas', width: '800', height: '480', 'aria-label': `Live fight against ${name}` });
    const held = new Set();
    const touchBtn = (label, key) => el('button', { type: 'button', class: 'qs-touch', onpointerdown: e => { e.preventDefault(); held.add(key); }, onpointerup: () => held.delete(key), onpointerleave: () => held.delete(key), onpointercancel: () => held.delete(key) }, label);
    const overlay = el('div', { class: 'qs-live', role: 'dialog', 'aria-label': `Live fight: ${name}` },
      el('p', { class: 'qs-eyebrow', text: `LIVE FIGHT · ${name}` }),
      canvas,
      el('div', { class: 'qs-touch-row' }, touchBtn('◀', 'left'), touchBtn('▶', 'right'), touchBtn('Thrust', 'thrust'), touchBtn('Boost', 'boost'), touchBtn('Fire', 'fire')),
      button('Stop and fight turn by turn instead', () => close(null)),
    );
    document.body.append(overlay);
    const match = createLiveFight(setup);
    const onKey = down => e => {
      const key = KEYMAP[e.key];
      if (!key) return;
      e.preventDefault();
      if (down) held.add(key); else held.delete(key);
    };
    const kd = onKey(true), ku = onKey(false);
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    let last = performance.now(), acc = 0, raf = 0;
    live = { close };
    function input() {
      if (!held.size) return NEUTRAL;
      return { ...NEUTRAL, turn: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), thrust: held.has('thrust'), brake: held.has('brake'), boost: held.has('boost'), fire: held.has('fire') };
    }
    function frame(now) {
      acc = Math.min(0.25, acc + (now - last) / 1000); last = now;
      while (acc >= RULES.step) { stepLiveFight(match, input(), setup); acc -= RULES.step; }
      draw(canvas, match, setup);
      const result = liveFightResult(match, setup);
      if (result) return close(result);
      raf = requestAnimationFrame(frame);
    }
    function close(result) {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      overlay.remove();
      live = null;
      if (result) send({ type: 'live', outcome: result.outcome, hull: result.hull });
    }
    raf = requestAnimationFrame(frame);
  }

  function draw(canvas, match, setup) {
    const ctx = canvas.getContext('2d');
    const unit = Math.min(canvas.width / RULES.width, canvas.height / RULES.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070d17'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(unit, 0, 0, unit, 0, 0);
    ctx.strokeStyle = '#2a4152'; ctx.lineWidth = 1 / unit; ctx.strokeRect(0, 0, RULES.width, RULES.height);
    for (const o of match.obstacles || []) {
      if (o.hp === 0) continue;
      ctx.fillStyle = '#1b2b3a'; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffe3cf';
    for (const b of match.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 0.09, 0, Math.PI * 2); ctx.fill(); }
    match.ships.forEach((ship, i) => {
      if (ship.hp <= 0) return;
      ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2);
      drawCustomShip(ctx, ship.loadout, ship.hit > 0);
      ctx.restore();
      const pct = ship.hp / setup.hp[i];
      ctx.fillStyle = i ? '#ffad72' : '#81e6df';
      ctx.fillRect(ship.x - 0.6, ship.y - 0.95, 1.2 * pct, 0.12);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#eaf4f5'; ctx.font = '14px Consolas, monospace';
    if (match.phase === 'countdown') ctx.fillText(`Get ready… ${Math.ceil(match.countdown)}`, 16, 24);
    ctx.fillText(`Hull ${Math.round((match.ships[0].hp / RULES.damage) * setup.hitValue[0])}`, 16, canvas.height - 14);
  }

  function render() {
    if (current) renderQuest();
  }

  /** For the page's keydown listener: true when the key was used. */
  function keydown(e) {
    if (!current || live || e.target.closest?.('input, textarea, select')) return false;
    const hit = keyHandlers.find(h => h.key === e.key || h.key === e.key.toLowerCase());
    if (!hit) return false;
    e.preventDefault();
    hit.fn();
    return true;
  }

  return {
    start, resume, render, keydown, exit, crewAct,
    get active() { return Boolean(current); },
    get quest() { return current?.quest || null; },
    get live() { return Boolean(live); },
    get run() { return current?.run || null; },
    get log() { return current?.run.log || []; },
  };
}
