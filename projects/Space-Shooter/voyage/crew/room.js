// The crew room connection for a page (P11): the pilot opens a room, the crew
// joins it by code, both talk through the Stardust relay the way Dogfight
// does (../../dogfight/transport.js). Browser only; the rules are in
// protocol.js, card.js, state.js and the quest engine.
import { connectRelay, defaultRelay } from '../../dogfight/transport.js';
import { CREW_MODE, CREW_PROTOCOL } from './protocol.js';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const LOBBY_PROTOCOL = 3; // the relay's seat-holding rooms (rejoin by token)
export const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/**
 * Where the crew relay is. The published site uses the hub's relay; a page
 * served by the local relay itself (npm run dev:dogfight, the test kit) uses
 * that same server; the preview server on :4173 uses the relay on :4174.
 */
export function crewRelay(location = globalThis.location) {
  if (location.protocol === 'http:' && LOOPBACK.includes(location.hostname) && location.port && location.port !== '4173') return `ws://${location.host}/relay`;
  return defaultRelay(location);
}

/**
 * role: 'host' opens a room; 'guest' joins `code` (or takes its seat back with `token`).
 * on(event), with event one of:
 *   { type: 'room', code, role, seatToken, rejoined }   in the room
 *   { type: 'roster', seats: [{ presence }] }           'here' | 'away' | 'open' per seat
 *   { type: 'data', data }                              a crew message from the other seat
 *   { type: 'error', message, fatal }                   the relay said no (fatal: before getting in)
 *   { type: 'closed', reason, dropped }                 the room is gone (dropped: the connection broke)
 */
export function openCrewLink({ role, code = null, token = null, address = crewRelay(), on }) {
  let link = null;
  let closed = false;
  let inside = false;
  const end = (event) => {
    if (closed) return;
    closed = true;
    on(event);
  };
  function receive(m) {
    if (closed) return;
    if (m.type === 'hello') {
      if (m.crew !== CREW_PROTOCOL) {
        end({ type: 'error', message: 'The relay has not been updated for crew rooms yet.', fatal: true });
        link.close();
        return;
      }
      if (role === 'host') link.send({ type: 'create', mode: CREW_MODE, protocol: LOBBY_PROTOCOL });
      else if (token) link.send({ type: 'rejoin', code, token, protocol: LOBBY_PROTOCOL });
      else link.send({ type: 'join', code, mode: CREW_MODE, protocol: LOBBY_PROTOCOL });
      return;
    }
    if (m.type === 'room' && m.mode === CREW_MODE && CODE.test(m.code)) {
      inside = true;
      on({ type: 'room', code: m.code, role: m.role === 'host' ? 'host' : 'guest', seatToken: typeof m.seatToken === 'string' ? m.seatToken : token, rejoined: Boolean(m.rejoined) });
      return;
    }
    if (m.type === 'crew-roster' && Array.isArray(m.seats)) {
      on({ type: 'roster', seats: m.seats.slice(0, 2).map((s) => ({ presence: ['here', 'away', 'open'].includes(s?.presence) ? s.presence : 'open' })) });
      return;
    }
    if (m.type === 'crew' && m.data && typeof m.data === 'object') { on({ type: 'data', data: m.data }); return; }
    if (m.type === 'error') {
      const message = typeof m.message === 'string' ? m.message.slice(0, 200) : 'The relay said no.';
      if (inside) on({ type: 'error', message, fatal: false });
      else { end({ type: 'error', message, fatal: true }); link.close(); }
      return;
    }
    if (m.type === 'closed') {
      end({ type: 'closed', reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : 'The crew room closed.', dropped: false });
      link.close();
    }
  }
  try {
    if (!address) throw new Error('no relay');
    link = connectRelay(address, receive, () => end({ type: 'closed', reason: inside ? 'The connection to the crew room dropped.' : 'Could not reach the crew relay.', dropped: inside }));
    link.ready.catch(() => end({ type: 'error', message: 'Could not reach the crew relay. Try again in a minute.', fatal: true }));
  } catch {
    queueMicrotask(() => end({ type: 'error', message: 'Crew rooms need the online relay, which this page cannot reach.', fatal: true }));
  }
  return {
    get inside() { return inside && !closed; },
    send(data) { return Boolean(link && !closed && link.send({ type: 'crew', data })); },
    leave() {
      if (link && !closed) link.send({ type: 'leave' });
      closed = true;
      link?.close();
    },
  };
}
