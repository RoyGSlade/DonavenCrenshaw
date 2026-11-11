// The crew seat (P11): you and 1 friend aboard the same ship (S15, S52). The
// pilot opens a crew room on the Stardust relay and invites a friend from the
// account's friends list (a crew invite on the hub, `game: 'crew'`) or with a
// link. The pilot's browser runs the job, as Dogfight's host runs the fight;
// the crew's browser shows their station (crew/station.js) and sends back what
// they do. Each player keeps their own save (S32): the crew's share of each
// reward goes straight into theirs. Names reach the page through textContent.
import { pilotName } from '../dogfight/invites.js';
import { openCrewLink, CODE } from './crew/room.js';
import { crewCard, cleanCrewCard, crewShare, cleanCrewReward } from './crew/card.js';
import { crewState } from './crew/state.js';
import { createStation } from './crew/station.js';
import { STATS } from './data.js';

export const CREW_SIZE = 2;

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
const statLine = (card) => STATS.map((s) => `${s.name.slice(0, 3)} ${card.stats[s.id]}`).join(' · ');

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
  // Pilot side.
  let link = null;
  let code = null;
  let presence = 'open';
  let card = null;
  let lastSent = '';
  let lastSentAt = 0;
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
    if (fresh.length) toast(`${pilotName(fresh[0].from)} invited you aboard. Open the Crew tab to join.`);
    if (mode === 'solo') render();
  }
  const dismiss = (id) => recorder.api(`/api/dogfight/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });

  // ---- pilot side ----
  const aboard = () => (mode === 'host' && presence === 'here' && card ? card : null);
  function sendState(force = false) {
    if (mode !== 'host' || presence !== 'here' || !link) return;
    const view = jobs?.crewView() || {};
    const state = crewState({ quest: view.quest, run: view.run, live: view.live, save: store.get() });
    const text = JSON.stringify(state);
    if (!force && text === lastSent && Date.now() - lastSentAt < KEEPALIVE_MS) return;
    lastSent = text;
    lastSentAt = Date.now();
    link.send(state);
  }
  const ticker = setInterval(() => sendState(false), TICK_MS);
  void ticker;

  function openRoom() {
    if (!captain()) { message = 'Sign on a captain first.'; render(); return; }
    mode = 'connecting';
    message = 'Opening a crew room…';
    render();
    link = openCrewLink({ role: 'host', on: hostEvent });
  }

  function hostEvent(e) {
    if (e.type === 'room') { mode = 'host'; code = e.code; presence = 'open'; message = ''; render(); return; }
    if (e.type === 'roster') {
      const was = presence;
      presence = e.seats[1]?.presence || 'open';
      if (presence === 'open') { if (card && was !== 'open') toast(`${card.name} left the crew. You fly on alone.`); card = null; }
      if (presence === 'away' && was === 'here' && card) toast(`${card.name}'s connection dropped. Their seat is held.`);
      if (presence === 'here' && was !== 'here') sendState(true);
      render();
      return;
    }
    if (e.type === 'data') {
      const d = e.data;
      if (d.kind === 'card') {
        const next = cleanCrewCard(d);
        if (!next) return;
        const first = !card;
        card = next;
        if (first) toast(`${card.name} came aboard.`);
        sendState(true);
        render();
        jobs?.render();
        return;
      }
      if (d.kind === 'act') {
        const { kind: _kind, ...action } = d;
        const error = jobs ? jobs.crewAct(action) : 'The captain has not taken a job yet.';
        if (error) link.send({ kind: 'note', text: String(error).slice(0, 200) });
        else sendState(true);
      }
      return;
    }
    if (e.type === 'error') { if (e.fatal) { mode = 'solo'; link = null; } message = e.message; render(); return; }
    if (e.type === 'closed') { mode = 'solo'; link = null; code = null; card = null; presence = 'open'; message = e.reason; render(); jobs?.render(); }
  }

  function closeRoom() {
    link?.leave();
    link = null; mode = 'solo'; code = null; card = null; presence = 'open';
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
      if (mine) link.send({ kind: 'card', ...mine });
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
      endGuest(`${e.reason}${earned ? ' Your crew rewards are in your Ledger.' : ''}`);
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

  function renderHost(c) {
    const seats = make('ul', null, 'vy-list cw-seats');
    const one = make('li');
    one.append(make('span', 'Seat 1 · pilot'), make('b', c?.name || 'You'));
    const two = make('li');
    two.dataset.seat = presence;
    const who = presence === 'here' && card ? `${card.name} (${statLine(card)})` : presence === 'away' && card ? `${card.name}: connection lost, seat held` : presence === 'here' ? 'Coming aboard…' : 'Empty';
    two.append(make('span', 'Seat 2 · crew'), make('b', who));
    seats.append(one, two);
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
      make('h2', 'Your ship, two seats'),
      make('p', 'Take a job in the Jobs tab. Your crew sees it on their station: they man the turret, repair the ship, read the scopes and take checks with their own stats.'),
      seats, code_, linkBox, copy, status,
      make('h3', 'INVITE A FRIEND'), friendStatus, friendList(friendStatus),
      close,
    );
  }

  function renderSolo(c) {
    const status = make('p', message, 'vy-note');
    status.setAttribute('role', 'status');
    const parts = [
      make('p', 'CREW · 1 FRIEND', 'vy-eyebrow'),
      make('h2', 'Fly with a friend'),
      make('p', 'Two seats, one ship. The pilot flies and runs the job; the crew mans a turret, repairs the ship, reads the scopes and takes checks with their own stats. Each of you keeps your own save, and the crew gets a share of every reward.'),
      status,
    ];
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
      step(events) {
        if (!aboard()) return;
        const share = crewShare(events);
        if (share) link.send({ kind: 'reward', reward: share });
        sendState(true);
      },
      changed() { sendState(true); },
      /** A live fight frame for the crew's scope (races lane), sent as a crew-room 'state'. */
      live(frame) {
        if (!aboard() || !link) return;
        link.send({ kind: 'state', v: 1, step: 'live', captain: (captain()?.name || 'The captain').slice(0, 40), checks: [], log: [], frame });
      },
    },
    keydown: (e) => (mode === 'guest' && station ? station.keydown(e) : false),
    keyup: (e) => { if (mode === 'guest') station?.keyup(e); },
    get mode() { return mode; },
    get pending() { return pending; },
  };
}
