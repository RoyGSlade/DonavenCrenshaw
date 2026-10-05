import { WEEK2_DRAFT, WEEKLY_ROLLOUT } from '../tracks/weeklyRollout.js';
import { studioDraft } from './weeklyStudio.js';

/** Pure, injectable release gate. History remains readable; only new play is gated. */
export function weeklyAccess(board, now = Date.now(), rollout = WEEKLY_ROLLOUT) {
  if (rollout === WEEKLY_ROLLOUT && (WEEK2_DRAFT.enabled === false || !WEEK2_DRAFT.track)) return 'open';
  const t = Number(now);
  if (!rollout?.enabled || t < Date.parse(rollout.opensAt)) return 'open';
  if (rollout.legacyBoards.includes(board)) return 'legacy';
  if (rollout.overlapBoards.includes(board)) return t < Date.parse(rollout.exclusiveAt) ? 'open' : 'retired';
  if (board === rollout.eventId) return t < Date.parse(rollout.closesAt) ? 'open' : 'retired';
  return t < Date.parse(rollout.closesAt) ? 'week2-only' : 'open';
}

export function canLaunchWeeklyMode({ kind = 'network', event = null, preview = false } = {}, now = Date.now()) {
  if (kind === 'weekly' && preview && studioDraft(event)) return true;
  const board = kind === 'weekly' ? event?.id : kind === 'custom' ? 'custom-track' : kind === 'network' ? 'full' : kind;
  if (weeklyAccess(board, now) !== 'open') return false;
  if (kind !== 'weekly') return true;
  if (!event?.track || event.enabled === false) return false;
  return preview || (now >= Date.parse(event.opensAt) && now < Date.parse(event.closesAt));
}
