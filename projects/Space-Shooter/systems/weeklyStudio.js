// Private Track Studio drafts use the normal weekly simulation and SDW replays.
// The marker cannot come from JSON: only a successfully loaded draft gets it.
import { createWeeklyLayout, WEEKLY_RULES } from '../engine/weekly/layout.js';

const STUDIO = Symbol('weekly studio draft');
export const studioDraft = (event) => event?.[STUDIO] || null;

/** A canonical root-relative path only. No URLs, traversal, encoding or queries. */
export function validateDraftPath(path) {
  if (typeof path !== 'string' || !path.endsWith('.json') || !/^\/studio\/drafts\/[A-Za-z0-9_./-]+\.json$/.test(path)) return null;
  const parts = path.slice('/studio/drafts/'.length).split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return path;
}

export function parseStudioQuery(search) {
  const params = new URLSearchParams(search || '');
  const requested = params.get('preview') === 'weekly' && params.has('draft');
  return { requested, path: requested && params.getAll('draft').length === 1 ? validateDraftPath(params.get('draft')) : null };
}

const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const text = (value) => typeof value === 'string' && !!value.trim();

/** No runtime validator exists for shipped weeklies; check the layout inputs. */
export function validateDraftEvent(event) {
  if (!object(event) || typeof event.id !== 'string' || !event.id || /[^A-Za-z0-9_-]/.test(event.id)
      || !Number.isSafeInteger(event.week) || event.week < 1
      || !Number.isSafeInteger(event.version) || event.version < 1 || !text(event.title)) {
    throw new Error('Draft needs an id, week, positive version and title.');
  }
  for (const key of ['tagline', 'music']) {
    if (event[key] != null && typeof event[key] !== 'string') throw new Error(`Invalid draft ${key}.`);
  }
  if (event.ships != null && event.ships !== 'builds') throw new Error('Invalid draft ships.');
  if (event.enabled != null && typeof event.enabled !== 'boolean') throw new Error('Invalid draft enabled.');
  // A private unpublished draft may omit its release window entirely.
  if (event.opensAt != null || event.closesAt != null) {
    if (!text(event.opensAt) || !text(event.closesAt) || !Number.isFinite(Date.parse(event.opensAt))
        || !(Date.parse(event.closesAt) > Date.parse(event.opensAt))) throw new Error('Invalid draft release window.');
  }
  const track = event.track;
  if (!object(track) || !text(track.title) || !finite(track.width)
      || track.width < WEEKLY_RULES.MIN_WIDTH || track.width > WEEKLY_RULES.MAX_WIDTH
      || !Array.isArray(track.points) || track.points.length < 3
      || !track.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(finite))) {
    throw new Error('Invalid draft track title, width or points.');
  }
  const index = (v) => Number.isInteger(v) && v >= 0 && v < track.points.length;
  for (const key of ['shards', 'mines', 'bouncers', 'sentries', 'stations']) {
    if (key === 'stations' && track[key] == null) continue;
    if (!Array.isArray(track[key])) throw new Error(`Invalid draft ${key}.`);
    for (const item of track[key]) {
      if (!object(item)) throw new Error(`Invalid draft ${key} item.`);
      if (key === 'sentries') {
        if (!index(item.point) || !['inside', 'outside'].includes(item.side)) throw new Error('Invalid draft sentry.');
      } else {
        if (!index(item.seg) || !finite(item.t) || item.t < 0 || item.t > 1
            || (item.off != null && !finite(item.off))) throw new Error(`Invalid draft ${key} placement.`);
        if (key === 'bouncers' && (!finite(item.radius) || item.radius <= 0 || item.radius >= track.width / 2 - 0.05
            || !finite(item.speed) || item.speed <= 0
            || (item.phase != null && (!finite(item.phase) || item.phase < 0 || item.phase > 1)))) {
          throw new Error('Invalid draft bouncer.');
        }
      }
    }
  }
  if (track.shards.length < WEEKLY_RULES.MIN_SHARDS) throw new Error('Draft needs at least three shards.');
  const layout = createWeeklyLayout(event); // Also rejects zero-length segments.
  if (!finite(layout.track.length) || layout.track.length <= WEEKLY_RULES.MIN_LENGTH) throw new Error('Draft lap is too short.');
  return event;
}

export async function loadStudioDraft(path, fetcher = globalThis.fetch) {
  if (!validateDraftPath(path)) throw new Error('Draft must be a /studio/drafts/*.json path.');
  // Redirects are rejected as well: a local path must never fetch a foreign URL.
  const response = await fetcher(path, { mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error('Draft could not be loaded.');
  const event = validateDraftEvent(await response.json());
  Object.defineProperty(event, STUDIO, { value: { path, draftId: path.slice('/studio/drafts/'.length, -'.json'.length) } });
  return event;
}

export const studioLabel = (event) => `PLAYTEST: ${event.title} v${event.version} — not ranked`;

/** Shape shared with the private server. log is the existing SDW1/2/3 string. */
export function studioRunPayload(event, { ms, finished, log, build = null, reason = 'abort' }) {
  const draft = studioDraft(event);
  if (!draft || !finite(ms) || ms < 0 || typeof finished !== 'boolean') return null;
  const base = { draftId: draft.draftId, version: event.version, ms: Math.round(ms), finished };
  if (finished) return typeof log === 'string' ? { ...base, log, build } : null;
  return { ...base, reason };
}

export function postStudioRun(event, result, fetcher = globalThis.fetch) {
  const payload = studioRunPayload(event, result);
  if (!payload) return;
  try {
    const body = JSON.stringify(payload);
    Promise.resolve(fetcher('/studio/api/runs', {
      method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
      // Browsers cap keepalive bodies at 64 KiB. Large SDW logs still post normally.
      headers: { 'Content-Type': 'application/json' }, body, keepalive: new TextEncoder().encode(body).length < 60000,
    })).catch(() => {});
  } catch { /* The private server is optional; never interrupt a flight. */ }
}
