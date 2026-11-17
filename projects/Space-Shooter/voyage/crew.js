// The crew (P11; launch outcome 3): up to four aboard the same ship (S15, S52).
// The pilot opens a crew room on the Stardust relay and invites friends from
// the account's friends list (a crew invite on the hub, `game: 'crew'`) or with
// a link or the room code. The pilot's browser runs the job, as Dogfight's host
// runs the fight; each crew browser shows their station (crew/station.js) and
// sends back what they do. The pilot can hire AI crew into empty seats (tiers
// 1-3: low skill, mistakes from the job's seeded roller, paid 10/15/25% of the
// job); a friend coming aboard mid-job takes the lowest AI seat (crew/seats.js).
// Each player keeps their own save (S32): with the home server off the crew's
// share of each reward goes straight into theirs; with it on, the hub pays
// everyone at the end of the job (AI wages first, the rest split evenly) or, if
// the pilot quits, at the last checkpoint. Names reach the page through textContent.
import { pilotName } from '../dogfight/invites.js';
import { openCrewLink, CODE } from './crew/room.js';
import { crewCard, cleanCrewCard, crewShare, cleanCrewReward } from './crew/card.js';
import { crewState } from './crew/state.js';
import { createStation } from './crew/station.js';
import { CREW_SEATS } from './crew/protocol.js';
import { createSeats, crewSeats, join as joinSeat, hire, release, aiAct, aiTiers } from './crew/seats.js';
import { hashSeed, roller } from './quests/rng.js';
import { economy } from './account.js';
import { ROLL_SKILLS } from './data.js';

export const CREW_SIZE = CREW_SEATS;

/** What an AI crewmate may do right now, from the crew's view of the job (never a dialogue check: that is the captain's call). */
export function aiOptions(state) {
  if (state?.step === 'fight' && state.fight && !state.fight.live) {
    const out = [];
    if (state.fight.turretReady) out.push({ job: 'turret', hit: true });
    if (state.fight.repairReady) {
      for (const [id, broken] of Object.entries(state.fight.systems || {})) if (broken) out.push({ job: 'repair', system: id });
      if (state.fight.hull < state.fight.hullMax) out.push({ job: 'repair', system: 'hull' });
    }
    return out;
  }
  if (state?.step === 'trip' && state.trip?.canScan && state.trip.next) return [{ job: 'scan' }];
  return [];
}

/** The seats the hub pays (voyage/account.js): host, friends (username when signed in), AI by tier. */
export function hubSeats(table) {
  return table.filter((s) => s.kind !== 'open').map((s) => (s.kind === 'ai' ? { kind: 'ai', tier: s.tier } : s.kind === 'human' ? { kind: 'human', ...(s.card?.username ? { username: s.card.username } : {}) } : { kind: 'host' }));
}

/** Friends from the hub's answer, cleaned and capped (pure, for tests). */
export function cleanFriends(data) {
  return Array.isArray(data?.friends)
    ? data.friends.filter((f) => typeof f?.username === 'string' && f.username.length > 0 && f.username.length <= 64).slice(0, 50)
    : [];
}

/** Crew invites from the hub's answer: only ones marked as crew, with a valid code (pure, for tests). */
export function cleanCrewInvites(data) {
  return Array.isArray(data?.invites)
    ? data.invites.filter((i) => i?.game === 'crew' && typeof i.code === 'string' && CODE.test(i.code) && typeof i.id === 'string' && /^[\w-]{1,64}$/.test(i.id)).slice(0, 5)
    : [];
}

/** Is a state from the pilot's browser drawable? (light shape check; the station reads it defensively) */
export function drawableState(d) {
  if (!d || d.kind !== 'state' || typeof d.captain !== 'string' || typeof d.step !== 'string' || !Array.isArray(d.checks) || !Array.isArray(d.log)) return false;
  if (d.step === 'fight') return Boolean(d.fight && typeof d.fight.name === 'string' && d.fight.systems && Array.isArray(d.fight.log));
  if (d.step === 'trip') return Boolean(d.trip && Array.isArray(d.trip.routes));
  if (d.step === 'puzzle') return Boolean(d.puzzle && ['cipher', 'riddle'].includes(d.puzzle.kind));
  return true;
}

const SEAT_KEY = 'stardust.crew.seat'; // this tab's crew seat { code, token }, so a reload takes it back
const INVITE_ERRORS = {
  bad_code: "That room code isn't valid anymore.",
  bad_username: "That pilot name isn't valid.",
  bad_game: 'The account service does not know crew invites yet. Share the link instead.',
  self: "You can't invite yourself.",
  no_user: 'No pilot has that name.',
  not_friends: 'You can only invite pilots on your friends list.',
  too_many_requests: 'Too many invites at once. Wait a minute and try again.',
};
const POLL_MS = 15000;
const TICK_MS = 1500;
const KEEPALIVE_MS = 20000;
// What a crewmate brings to a roll: their best skill levels (the d20 adds levels, not stats).
const statLine = (card) => {
  const best = ROLL_SKILLS.map((k) => [k.name, card.levels?.[k.id] || 1]).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return best.length ? best.map(([n, v]) => `${n} ${v}`).join(' · ') : 'every skill level 1';
};

const readSeat = () => { try { const v = JSON.parse(sessionStorage.getItem(SEAT_KEY)); return v && CODE.test(v.code) && typeof v.token === 'string' ? v : null; } catch { return null; } };
const writeSeat = (v) => { try { if (v) sessionStorage.setItem(SEAT_KEY, JSON.stringify(v)); else sessionStorage.removeItem(SEAT_KEY); } catch { /* storage blocked: no reload rejoin */ } };

/**
 * pane: the Crew tab panel. recorder: systems/hubRuns.js client. store: the
 * Voyage store. toast(text); say(events): the hangar's reward toast.
 * inviteLink(code): the link a friend opens. onAboard(): show the Crew tab.
 * joinCode: a room code from the page's link (?crew=CODE), asked about first.
 * Call attach(jobs) once the job board exists.
 */
export function createCrew({ pane, recorder, store, toast = () => {}, say = () => {}, inviteLink = (code) => `?crew=${code}`, onAboard = () => {}, reducedMotion = () => false, joinCode = null }) {
  let jobs = null;
  let mode = 'solo'; // solo | connecting | host | guest
  let message = '';
  let friends = null;
  let friendsState = 'idle'; // idle | loading | guest | offline | ready
  let loadedFor = null;
  let pending = CODE.test(joinCode || '') ? joinCode : null;
  let typed = '';
  let invites = [];
  const seenInvites = new Set();
  const sentInvites = new Map();
  // Pilot side: the seat table (host, friends, AI), and which relay seat each friend sits in.
  let link = null;
  let code = null;
  let table = createSeats({ size: CREW_SEATS, host: null });
  let hubTiers = null;
  const aiSeen = new Map(); // seat -> the job moment it last acted on
  let lastSent = '';
  let lastSentAt = 0;
  const tiers = () => aiTiers(hubTiers);
  const humans = () => table.filter((s) => s.kind === 'human');
  const byRelay = (r) => table.find((s) => s.kind === 'human' && s.relay === r) || null;
  const checkpointsSoFar = () => economy.checkpointCount?.(jobs?.crewView()?.quest?.id) || 0;
  // Crew side.
  let seat = null;
  let retried = false;
  let earned = false;
  let station = null;
  let stationRoot = null;

  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const btn = (text, onClick, cls) => { const b = make('button', text, cls); b.type = 'button'; b.addEventListener('click', onClick); return b; };
  const captain = () => store.get().character;

  // ---- friends (as before: the account's list) ----
  async function loadFriends() {
    const who = recorder.player?.username || null;
    if (friendsState === 'loading' || (who && loadedFor === who)) return;
    if (!who) { friendsState = recorder.reachable ? 'guest' : 'offline'; return; }
    friendsState = 'loading';
    const res = await recorder.api('/api/friends');
    loadedFor = who;
    if (res.ok) { friends = cleanFriends(res.data); friendsState = 'ready'; } else { friends = []; friendsState = res.status === 401 ? 'guest' : 'offline'; }
  }

  async function invite(friend) {
    if (!code) return { ok: false, message: 'Open a crew room first.' };
    const res = await recorder.api('/api/dogfight/invites', { method: 'POST', body: { to: friend.username, code, game: 'crew' } });
    if (res.status === 201 && res.data?.invite?.game === 'crew') return { ok: true, message: `Invite sent to ${pilotName(res.data.invite.to || friend)}. It lasts 10 minutes.` };
    if (res.status === 201) return { ok: true, message: 'Sent, but the account service is older and may show it as a Dogfight invite. Share the link too.' };
    return { ok: false, message: INVITE_ERRORS[res.data?.error] || 'Invite failed. Try again.' };
  }

  // ---- crew invites waiting for this player ----
  async function poll() {
    if (mode !== 'solo' || !recorder.player || document.visibilityState !== 'visible') return;
    const res = await recorder.api('/api/dogfight/invites?game=crew');
    if (!res.ok) return;
    invites = cleanCrewInvites(res.data);
    const fresh = invites.filter((i) => !seenInvites.has(i.id));
    for (const i of fresh) seenInvites.add(i.id);
    if (fresh.length) toast(`${pilotName(fresh[0].from)} invited you aboard. Walk to the launch hatch and open Crew to join.`);
    if (mode === 'solo') render();
  }
  const dismiss = (id) => recorder.api(`/api/dogfight/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });

  // ---- pilot side ----
  // Who the job sees as crew: a friend at their station, else an AI (the engine takes each act with the actor's own card).
  const aboard = () => {
    const crew = crewSeats(table);
    const s = crew.find((x) => x.kind === 'human' && x.presence === 'here') || crew.find((x) => x.kind === 'ai');
    return s ? s.card : null;
  };
  // The roster every station shows.
  const rosterView = () => table.map((s) => ({ seat: s.seat, kind: s.kind, name: s.kind === 'host' ? (captain()?.name || 'The captain').slice(0, 40) : s.card?.name?.slice(0, 40) || null, tier: s.tier || null, presence: s.kind === 'human' ? s.presence || 'here' : s.kind === 'open' ? 'open' : 'here' }));
  function sendState(force = false) {
    if (mode !== 'host' || !link || !humans().some((h) => h.presence === 'here')) return;
    const view = jobs?.crewView() || {};
    const state = { ...crewState({ quest: view.quest, run: view.run, live: view.live, save: store.get() }), seats: rosterView() };
    const text = JSON.stringify(state);
    if (!force && text === lastSent && Date.now() - lastSentAt < KEEPALIVE_MS) return;
    lastSent = text;
    lastSentAt = Date.now();
    link.send(state);
  }
  // AI crew take a turn when the job moves on (a new round, a new leg), with the job's seeded roller.
  function aiTurns() {
    const view = jobs?.crewView();
    if (!view?.run || view.run.ended || view.live || !jobs) return;
    const state = crewState({ quest: view.quest, run: view.run, live: view.live, save: store.get() });
    const moment = `${view.run.seed}:${view.run.steps}:${state.step}:${state.fight?.round ?? ''}:${state.trip?.next ?? ''}`;
    for (const s of crewSeats(table).filter((x) => x.kind === 'ai')) {
      if (aiSeen.get(s.seat) === moment) continue;
      aiSeen.set(s.seat, moment);
      const options = aiOptions(crewState({ quest: view.quest, run: jobs.crewView().run, save: store.get() }));
      if (!options.length) continue;
      const rng = roller({ rng: hashSeed('ai-crew', view.run.seed, s.seat, view.run.steps, state.fight?.round ?? 0) }).next;
      const turn = aiAct(s, options, rng, tiers());
      if (turn.mistake && turn.action.job === 'repair') { toast(`${s.card.name} fumbles the repair.`); continue; }
      const action = turn.mistake && turn.action.job === 'turret' ? { job: 'turret', hit: false } : turn.mistake ? null : turn.action;
      if (!action) { toast(`${s.card.name} fumbles the scan.`); continue; }
      jobs.crewAct(action, s.card);
    }
  }
  const ticker = setInterval(() => { sendState(false); aiTurns(); }, TICK_MS);
  void ticker;

  // ---- AI crew (the pilot hires; works solo or with friends) ----
  function hireAi(tier) {
    const before = table;
    table = hire(table, { tier, tiers: tiers(), from: checkpointsSoFar() });
    if (table === before) { message = 'No empty seat to hire into.'; render(); return; }
    const s = table.filter((x) => x.kind === 'ai').at(-1);
    toast(`${s.card.name} signs on (tier ${s.tier}: ${Math.round(tiers()[s.tier].wage * 100)}% of each job).`);
    sendState(true); render(); jobs?.render();
  }
  function letGo(seat) {
    const s = table.find((x) => x.seat === seat);
    table = release(table, seat);
    if (s?.card) toast(`${s.card.name} leaves the ship.`);
    sendState(true); render(); jobs?.render();
  }

  function openRoom() {
    if (!captain()) { message = 'Sign on a captain first.'; render(); return; }
    mode = 'connecting';
    message = 'Opening a crew room…';
    render();
    link = openCrewLink({ role: 'host', on: hostEvent });
  }

  function hostEvent(e) {
    if (e.type === 'room') {
      mode = 'host'; code = e.code; message = '';
      // A protocol-1 relay seats two: keep the pilot's first seats (an AI hired solo may have to go).
      if (e.capacity < table.length) table = table.slice(0, e.capacity);
      render();
      return;
    }
    if (e.type === 'roster') {
      e.seats.forEach((r, relay) => {
        if (relay === 0) return;
        const s = byRelay(relay);
        if (!s) return;
        if (r.presence === 'open') { toast(`${s.card.name} left the crew.`); table = release(table, s.seat); return; }
        if (r.presence === 'away' && s.presence !== 'away') toast(`${s.card.name}'s connection dropped. Their seat is held.`);
        if (r.presence === 'here' && s.presence === 'away') { toast(`${s.card.name} is back aboard.`); sendState(true); }
        table = table.map((x) => (x === s ? { ...x, presence: r.presence } : x));
      });
      render();
      return;
    }
    if (e.type === 'data') {
      const d = e.data;
      const from = Number.isInteger(e.from) ? e.from : 1;
      if (d.kind === 'card') {
        const next = cleanCrewCard(d);
        if (!next) return;
        const had = byRelay(from);
        if (had) { table = table.map((x) => (x === had ? { ...x, card: next, presence: 'here' } : x)); sendState(true); render(); return; }
        const taken = joinSeat(table, next, { at: checkpointsSoFar() });
        if (taken.seat == null) { link.send({ kind: 'note', text: 'The crew is full.' }, from); return; }
        table = taken.table.map((x) => (x.seat === taken.seat ? { ...x, relay: from, presence: 'here' } : x));
        toast(taken.replaced ? `${next.name} came aboard and takes over from ${taken.replaced.card.name}.` : `${next.name} came aboard.`);
        sendState(true);
        render();
        jobs?.render();
        return;
      }
      if (d.kind === 'act') {
        const { kind: _kind, ...action } = d;
        const s = byRelay(from);
        const error = !s ? 'Your seat is not aboard yet.' : jobs ? jobs.crewAct(action, s.card) : 'The captain has not taken a job yet.';
        if (error) link.send({ kind: 'note', text: String(error).slice(0, 200) }, from);
        else sendState(true);
      }
      return;
    }
    if (e.type === 'error') { if (e.fatal) { mode = 'solo'; link = null; } message = e.message; render(); return; }
    if (e.type === 'closed') { mode = 'solo'; link = null; code = null; dropFriends(); message = e.reason; render(); jobs?.render(); }
  }

  // The room is gone: friends' seats open; AI crew stay aboard.
  function dropFriends() { for (const h of humans()) table = release(table, h.seat); }

  function closeRoom() {
    link?.leave();
    link = null; mode = 'solo'; code = null; dropFriends();
    message = 'You closed the crew room.';
    render();
    jobs?.render();
  }

  // ---- crew side ----
  function join(roomCode, token = null) {
    if (!captain()) { message = 'Sign on a captain first: your crew rolls with their own stats.'; render(); return; }
    if (!CODE.test(roomCode)) { message = 'Use the eight-character room code.'; render(); return; }
    mode = 'connecting';
    pending = null;
    message = token ? 'Taking your seat back…' : `Joining crew room ${roomCode}…`;
    render();
    link = openCrewLink({ role: 'guest', code: roomCode, token, on: (e) => guestEvent(e, roomCode) });
  }

  function showStation() {
    stationRoot = make('div', null, 'cw-station');
    station = createStation({ root: stationRoot, reducedMotion, me: () => crewCard(captain()), send: (action) => link?.send({ kind: 'act', ...action }) });
    const leave = btn('Leave the crew', leaveCrew);
    leave.id = 'cw-leave';
    pane.replaceChildren(stationRoot, make('p', 'Your share of every reward goes into your own save as it is paid.', 'vy-note'), leave);
    station.update({ kind: 'state', captain: 'The captain', step: 'board', checks: [], log: [], job: null });
  }

  function guestEvent(e, roomCode) {
    if (e.type === 'room') {
      const back = mode === 'guest';
      mode = 'guest';
      seat = { code: roomCode, token: e.seatToken };
      writeSeat(seat);
      retried = false;
      if (!back) { showStation(); onAboard(); toast(e.rejoined ? 'Back aboard.' : 'You are aboard. Wait for the captain to take a job.'); }
      const mine = crewCard(captain());
      // The username lets the hub pay this seat's share into this account (server mode).
      if (mine) link.send({ kind: 'card', ...mine, ...(recorder.player?.username ? { username: String(recorder.player.username).slice(0, 20) } : {}) });
      return;
    }
    if (e.type === 'data') {
      const d = e.data;
      // A live fight frame (races lane): the scope draws it; no full redraw.
      if (d.kind === 'state' && d.step === 'live' && d.frame && typeof d.frame === 'object') station?.liveFrame(d.frame);
      else if (d.kind === 'state' && drawableState(d)) station?.update(d);
      else if (d.kind === 'reward') {
        const reward = cleanCrewReward(d.reward);
        if (!reward) return;
        const events = store.grant(reward);
        earned = true;
        say(events);
        station?.note('Crew share paid into your save.');
      } else if (d.kind === 'note' && typeof d.text === 'string') station?.note(d.text);
      return;
    }
    if (e.type === 'error') {
      if (!e.fatal) { station?.note(e.message); return; }
      endGuest(e.message);
      return;
    }
    if (e.type === 'closed') {
      if (e.dropped && seat && !retried) {
        retried = true;
        station?.note('Connection dropped. Taking your seat back…');
        setTimeout(() => { if (mode === 'guest') { link = openCrewLink({ role: 'guest', code: seat.code, token: seat.token, on: (ev) => guestEvent(ev, seat.code) }); } }, 800);
        return;
      }
      const captainLeft = /captain/i.test(e.reason || '');
      endGuest(`${e.reason}${captainLeft && economy.on ? ' The job is kept at its last checkpoint; the Guild bank pays your share up to there.' : ''}${earned ? ' Your crew rewards are in your Ledger.' : ''}`);
    }
  }

  function endGuest(text) {
    station?.stop();
    station = null;
    writeSeat(null);
    seat = null;
    mode = 'solo';
    link = null;
    message = text;
    render();
  }

  function leaveCrew() {
    link?.leave();
    endGuest(`You left the crew.${earned ? ' Your crew rewards are in your Ledger.' : ''}`);
  }

  // ---- drawing (solo and pilot; the crew's station draws itself) ----
  function friendList(status) {
    const list = make('ul', null, 'vy-list cw-friends');
    if (friendsState === 'guest') {
      status.textContent = 'Sign in to invite friends from your friends list, or share the link.';
      const a = make('a', 'Pilot account ↗', 'vy-link');
      a.href = '../../../account/';
      status.append(' ', a);
    } else if (friendsState === 'offline') status.textContent = 'Your friends list could not be reached. Share the link instead.';
    else if (friendsState !== 'ready') status.textContent = 'Loading your friends…';
    else if (!friends.length) status.textContent = 'No friends yet. Add friends on your account page, or share the link.';
    for (const friend of friendsState === 'ready' ? friends : []) {
      const li = make('li');
      const b = make('button', sentInvites.get(friend.username) ? 'Invited' : 'Invite');
      b.type = 'button';
      b.dataset.invite = friend.username;
      b.disabled = mode !== 'host' || Boolean(sentInvites.get(friend.username));
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Sending…';
        const r = await invite(friend).catch(() => ({ ok: false, message: 'Invite failed. Try again.' }));
        if (r.ok) sentInvites.set(friend.username, code);
        b.textContent = r.ok ? 'Invited' : 'Invite';
        b.disabled = r.ok;
        status.textContent = r.message;
      });
      li.append(make('span', pilotName(friend)), b);
      list.append(li);
    }
    return list;
  }

  // The seat roster (pilot side): who sits where, what an AI costs, and the hire buttons.
  function seatList(c) {
    const list = make('ul', null, 'vy-list cw-seats');
    for (const st of table) {
      const li = make('li');
      li.dataset.seat = st.kind === 'human' ? st.presence || 'here' : st.kind;
      li.dataset.kind = st.kind;
      const label = `Seat ${st.seat + 1} · ${st.kind === 'host' ? 'pilot' : st.kind === 'ai' ? `AI crew, tier ${st.tier}` : 'crew'}`;
      let who = 'Empty';
      if (st.kind === 'host') who = c?.name || 'You';
      else if (st.kind === 'ai') who = `${st.card.name} · level ${tiers()[st.tier].level} · ${Math.round(tiers()[st.tier].wage * 100)}% of each job`;
      else if (st.kind === 'human') who = st.presence === 'away' ? `${st.card.name}: connection lost, seat held` : `${st.card.name} (${statLine(st.card)})`;
      li.append(make('span', label), make('b', who));
      if (st.kind === 'ai') { const go = btn('Let go', () => letGo(st.seat)); go.dataset.letGo = String(st.seat); li.append(go); }
      list.append(li);
    }
    return list;
  }
  function hireRow() {
    const open = table.some((x) => x.kind === 'open');
    const row = make('div', null, 'cw-hire');
    row.append(make('span', open ? 'Hire AI crew for an empty seat:' : 'Every seat is taken.'));
    for (const t of [1, 2, 3]) {
      const b = btn(`Tier ${t} · ${Math.round(tiers()[t].wage * 100)}%`, () => hireAi(t));
      b.dataset.hire = String(t);
      b.disabled = !open;
      b.title = `Skill level ${tiers()[t].level}, a mistake on ${Math.round(tiers()[t].mistake * 100)}% of its turns, paid ${Math.round(tiers()[t].wage * 100)}% of each job.`;
      row.append(b);
    }
    return row;
  }

  function renderHost(c) {
    const seats = seatList(c);
    const url = inviteLink(code);
    const linkBox = make('input');
    linkBox.type = 'text';
    linkBox.readOnly = true;
    linkBox.value = url;
    linkBox.id = 'cw-link';
    linkBox.setAttribute('aria-label', 'Crew invite link');
    const status = make('p', message, 'vy-note');
    status.setAttribute('role', 'status');
    const copy = btn('Copy invite link', async () => {
      try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied. Send it to your friend.'; } catch { linkBox.select(); status.textContent = 'Select the link and copy it.'; }
    });
    const close = btn('Close the crew room', closeRoom);
    close.id = 'cw-close';
    const code_ = make('p', null, 'cw-code');
    code_.append('Room code ', make('b', code));
    code_.dataset.code = code;
    const friendStatus = make('p', '', 'vy-note');
    pane.replaceChildren(
      make('p', `CREW ROOM · ${code}`, 'vy-eyebrow'),
      make('h2', `Your ship, ${table.length} seats`),
      make('p', 'Take a job at the job board. Your crew sees it on their station: they man the turret, repair the ship, read the scopes and take checks with their own skills. A friend who joins mid-job takes over the lowest AI seat.'),
      seats, hireRow(), code_, linkBox, copy, status,
      make('h3', 'INVITE A FRIEND'), friendStatus, friendList(friendStatus),
      close,
    );
  }

  function renderSolo(c) {
    const status = make('p', message, 'vy-note');
    status.setAttribute('role', 'status');
    const parts = [
      make('p', 'CREW · UP TO 3 FRIENDS OR AI', 'vy-eyebrow'),
      make('h2', 'Fly with a crew'),
      make('p', 'Four seats, one ship. The pilot flies and runs the job; the crew mans a turret, repairs the ship, reads the scopes and takes checks with their own skills. Each of you keeps your own save. Empty seats can take AI crew: cheap ones fumble more.'),
      status,
    ];
    if (crewSeats(table).length || c) parts.push(make('h3', 'YOUR SEATS'), seatList(c), hireRow());
    if (pending) {
      const box = make('div', null, 'cw-ask');
      box.append(make('p', `Join crew room ${pending}?`), btn('Join', () => join(pending), 'primary'), btn('Not now', () => { pending = null; render(); }));
      parts.push(box);
    }
    if (invites.length) {
      const list = make('ul', null, 'vy-list cw-invites');
      for (const i of invites) {
        const li = make('li');
        li.dataset.crewInvite = i.code;
        li.append(make('span', `${pilotName(i.from)} invited you aboard`),
          btn('Join', () => { dismiss(i.id); invites = invites.filter((x) => x.id !== i.id); join(i.code); }, 'primary'),
          btn('Dismiss', () => { dismiss(i.id); invites = invites.filter((x) => x.id !== i.id); render(); }));
        list.append(li);
      }
      parts.push(make('h3', 'INVITES'), list);
    }
    const open = btn(mode === 'connecting' ? 'Connecting…' : 'Open a crew room', openRoom, 'primary');
    open.id = 'cw-open';
    open.disabled = mode === 'connecting' || !c;
    const input = make('input');
    input.type = 'text';
    input.id = 'cw-code';
    input.maxLength = 8;
    input.autocomplete = 'off';
    input.placeholder = 'ROOM CODE';
    input.value = typed;
    input.setAttribute('aria-label', 'Crew room code');
    input.addEventListener('input', () => { typed = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); });
    const joinBtn = btn('Join a crew', () => join(typed));
    joinBtn.id = 'cw-join';
    joinBtn.disabled = mode === 'connecting' || !c;
    const row = make('div', null, 'cw-join-row');
    row.append(input, joinBtn);
    parts.push(
      make('h3', 'FLY, WITH A FRIEND AS CREW'), open,
      make('h3', 'CREW FOR A FRIEND'), row,
      c ? null : make('p', 'Sign on a captain first: the crew seat rolls with your own stats.', 'vy-note'),
    );
    pane.replaceChildren(...parts.filter(Boolean));
  }

  function render() {
    if (mode === 'guest') return; // the station draws itself
    const c = captain();
    if (mode === 'host') renderHost(c); else renderSolo(c);
  }

  // A seat this tab held before a reload: take it back.
  const held = readSeat();
  setTimeout(() => { if (held && mode === 'solo') join(held.code, held.token); }, 0);
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });

  return {
    attach(board) { jobs = board; },
    async refresh() {
      await loadFriends().catch(() => { friendsState = 'offline'; });
      poll().catch(() => {});
      render();
    },
    render,
    /** What the job board needs (voyage/jobs.js `crew`). */
    hooks: {
      aboard,
      /** The seats for the hub's job ticket, checkpoints and settle (server mode). */
      hubSeats: () => hubSeats(table),
      /** The hub's AI tiers and wages, when it sent them (/v1/clock). */
      setTiers(t) { hubTiers = t; render(); },
      step(events) {
        if (!aboard()) return;
        // Server mode: the hub pays every friend's share at the end of the job; with it off, each friend's share goes into their save now.
        const share = economy.on ? null : crewShare(events);
        if (share && link) for (const h of humans()) if (h.presence === 'here') link.send({ kind: 'reward', reward: share }, h.relay);
        sendState(true);
      },
      changed() { sendState(true); },
      /** A live fight frame for the crew's scope (races lane), sent as a crew-room 'state'. */
      live(frame) {
        if (!humans().length || !link) return;
        link.send({ kind: 'state', v: 1, step: 'live', captain: (captain()?.name || 'The captain').slice(0, 40), checks: [], log: [], frame });
      },
    },
    keydown: (e) => (mode === 'guest' && station ? station.keydown(e) : false),
    keyup: (e) => { if (mode === 'guest') station?.keyup(e); },
    get mode() { return mode; },
    get pending() { return pending; },
  };
}
