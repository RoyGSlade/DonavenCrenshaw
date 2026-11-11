// The crew seat: you and 1 friend (S15). The friends list is the account's
// (the same /api/friends the Dogfight invite uses, shown the same way).
// Sending an invite needs a crew room on the relay, which the two-player
// package (P11) adds; until then `invite` is null and the panel says so.
// Names reach the page through textContent only.
import { pilotName } from '../dogfight/invites.js';

export const CREW_SIZE = 2;

/** Friends from the hub's answer, cleaned and capped (pure, for tests). */
export function cleanFriends(data) {
  return Array.isArray(data?.friends)
    ? data.friends.filter((f) => typeof f?.username === 'string' && f.username.length > 0 && f.username.length <= 64).slice(0, 50)
    : [];
}

/**
 * recorder: systems/hubRuns.js client (api, player);
 * captain(): the captain's name or null;
 * invite(friend) -> Promise<{ ok, message }> | null: the crew room's invite, when it exists.
 */
export function createCrew({ recorder, captain = () => null, invite = null }) {
  let friends = null; // null: not loaded; [] none
  let state = 'idle'; // idle | loading | guest | offline | ready
  let note = '';
  let loadedFor = null;

  async function load() {
    const who = recorder.player?.username || null;
    if (state === 'loading' || (who && loadedFor === who)) return;
    if (!who) { state = recorder.reachable ? 'guest' : 'offline'; return; }
    state = 'loading';
    const res = await recorder.api('/api/friends');
    loadedFor = who;
    if (res.ok) { friends = cleanFriends(res.data); state = 'ready'; }
    else { friends = []; state = res.status === 401 ? 'guest' : 'offline'; }
  }

  function render(pane) {
    const make = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const eyebrow = make('p', 'CREW · 1 FRIEND', 'vy-eyebrow');
    const title = make('h2', 'Invite 1 friend');
    const lede = make('p', 'A second seat for a friend: guns, repairs, navigation and help while docked.');
    const seats = make('ul', null, 'vy-list');
    const you = make('li');
    you.append(make('span', 'Seat 1'), make('b', captain() || 'You'));
    const two = make('li');
    two.append(make('span', 'Seat 2'), make('b', 'Empty'));
    seats.append(you, two);
    const heading = make('h3', 'FRIENDS');
    const status = make('p', '', 'vy-note');
    status.setAttribute('role', 'status');
    const list = make('ul', null, 'vy-list');
    if (state === 'guest') {
      status.textContent = 'Sign in to invite friends from your friends list.';
      const link = make('a', 'Pilot account ↗', 'vy-link');
      link.href = '../../../account/';
      status.append(' ', link);
    } else if (state === 'offline') status.textContent = 'Your friends list could not be reached. Offline play works; try again later.';
    else if (state === 'loading' || state === 'idle') status.textContent = 'Loading your friends…';
    else if (!friends.length) status.textContent = 'No friends yet. Add friends on your account page.';
    else {
      for (const friend of friends) {
        const li = make('li');
        const b = make('button', 'Invite');
        b.type = 'button';
        b.disabled = !invite;
        b.addEventListener('click', async () => {
          if (!invite) return;
          b.disabled = true;
          b.textContent = 'Sending…';
          const r = await invite(friend).catch(() => ({ ok: false, message: 'Invite failed. Try again.' }));
          b.textContent = r.ok ? 'Invited' : 'Invite';
          b.disabled = r.ok;
          note = r.message || '';
          status.textContent = note;
        });
        li.append(make('span', pilotName(friend)), b);
        list.append(li);
      }
      status.textContent = invite ? note : 'Crew rooms open with the two-player update. Your friends are ready here.';
    }
    pane.replaceChildren(eyebrow, title, lede, seats, heading, status, list);
  }

  return {
    async refresh(pane) { await load().catch(() => { state = 'offline'; }); render(pane); },
    render,
    get state() { return state; },
  };
}
