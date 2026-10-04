import { presetAppearance, cleanAppearance } from './shipLivery.js';
import { encodeShipCode } from './shipShare.js';

/** Prepare the promised hull after finalized results; never grants or publishes. */
export function week2WinnerLivery(results) {
  if (results?.id !== 'weekly-02' || results.status !== 'final' || !results.finalizedAt) return null;
  const winners = (results.awards || []).filter((a) => a.rank === 1);
  if (winners.length !== 1 || !/^[A-Za-z0-9_-]{3,20}$/.test(winners[0].username || '')) return null;
  const family = results.rewards?.namedHull?.family;
  if (!['courier', 'needle', 'manta', 'wisp'].includes(family)) return null;
  const appearance = presetAppearance(family);
  // A livery of existing parts; gameplay stats and collision geometry stay native.
  Object.assign(appearance.paint, { hull: '#233047', wings: '#e0ad49', trim: '#ffe7aa', engines: '#72e1ef' });
  return { eventId: 'weekly-02', winner: winners[0].username, name: `${winners[0].username}'s ${family}`,
    appearance: cleanAppearance(appearance), shipCode: encodeShipCode(appearance), delivery: 'prepared' };
}
