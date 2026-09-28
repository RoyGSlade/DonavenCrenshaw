// The custom track's release timer, launch links and track data handling.
// Pure: no DOM, no clock of its own (callers pass `now`), so the hangar, the
// Stardust landing page, the editor and node tests all share it.
import { CUSTOM_TRACK } from '../tracks/custom-track.js';

export const CUSTOM_BOARD = 'custom-track';
// Where the editor leaves a layout for ?preview=custom&draft=1 to fly.
export const DRAFT_KEY = 'stardust.customTrack.draft';
export const MUSIC_CUES = Object.freeze(['level1', 'level2', 'level3', 'level4', 'level5']);

const DAY = 86400000;
const two = (n) => String(n).padStart(2, '0');

/**
 * Time left until releaseAt. `label` reads "1d 04:12:33", or "04:12:33" under
 * a day. Seconds round up, so the label never shows 00:00:00 before release.
 * An unparseable releaseAt is never released: { valid: false }.
 */
export function releaseCountdown(releaseAt, now = Date.now()) {
  const at = typeof releaseAt === 'string' && releaseAt.trim() ? Date.parse(releaseAt) : NaN;
  const time = typeof now === 'number' ? now : Number(now);
  if (!Number.isFinite(at) || !Number.isFinite(time)) return { valid: false, released: false, remainingMs: null, label: '' };
  const remainingMs = Math.max(0, at - time);
  if (remainingMs === 0) return { valid: true, released: true, remainingMs: 0, label: '00:00:00' };
  const seconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(seconds / 86400);
  const rest = seconds % 86400;
  const clock = `${two(Math.floor(rest / 3600))}:${two(Math.floor(rest / 60) % 60)}:${two(rest % 60)}`;
  return { valid: true, released: false, remainingMs, label: days ? `${days}d ${clock}` : clock };
}

/** "Tue 29 Sep 2026, 19:00 UTC-7" style text for no-JS fallbacks and notes. */
export function releaseText(releaseAt) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(String(releaseAt || '').trim());
  if (!match || !Number.isFinite(Date.parse(releaseAt))) return '';
  const [, y, mo, d, h, mi, zone] = match;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const offset = zone === 'Z' || zone === '+00:00' ? 'UTC' : `UTC${zone[0]}${Number(zone.slice(1, 3))}${zone.slice(4) === '00' ? '' : `:${zone.slice(4)}`}`;
  return `${Number(d)} ${months[Number(mo) - 1]} ${y}, ${h}:${mi} ${offset}`;
}

/**
 * The launch flags on a game URL:
 *   ?track=custom            open the hangar on the custom track card
 *   ?preview=custom          fly it before release, never saved
 *   ?preview=custom&draft=1  fly the editor's draft instead of the shipped file
 */
export function parseCustomQuery(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { params = new URLSearchParams(); }
  const preview = params.get('preview') === 'custom';
  return {
    preview,
    draft: preview && params.get('draft') === '1',
    focus: preview || params.get('track') === 'custom',
  };
}

/**
 * What the hangar card shows. `valid` is whether the track passed its checks.
 *   locked   before releaseAt: disabled, live countdown
 *   pending  after releaseAt but still the placeholder: disabled, "coming soon"
 *   open     released real track: "Fly the custom track"
 *   preview  ?preview=custom: flyable any time, never saved
 *   invalid  the data failed its checks: disabled
 */
export function customTrackView({ track = CUSTOM_TRACK, now = Date.now(), preview = false, valid = true } = {}) {
  const countdown = releaseCountdown(track?.releaseAt, now);
  if (!valid) return { state: 'invalid', enabled: false, button: 'Custom track unavailable', countdown };
  if (preview) return { state: 'preview', enabled: true, button: 'Preview the custom track', countdown };
  if (!countdown.valid) return { state: 'invalid', enabled: false, button: 'Custom track unavailable', countdown };
  if (!countdown.released) return { state: 'locked', enabled: false, button: `New track in ${countdown.label}`, countdown };
  if (track.placeholder) return { state: 'pending', enabled: false, button: 'Custom track coming soon', countdown };
  return { state: 'open', enabled: true, button: 'Fly the custom track', countdown };
}

/** Whether the landing page may show Play and the board tab. */
export function isCustomTrackLive(track = CUSTOM_TRACK, now = Date.now()) {
  return releaseCountdown(track?.releaseAt, now).released && !track?.placeholder;
}

export function customMusic(track) {
  return MUSIC_CUES.includes(track?.music) ? track.music : 'level1';
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const ints = (v) => (Array.isArray(v) ? v.filter((i) => Number.isInteger(i)) : []);

/**
 * Keep only the fields a track may have, with the right types, from any
 * object (an editor draft, an import, pasted JSON). Anything else is dropped.
 */
export function pickTrackFields(input) {
  if (!input || typeof input !== 'object') return null;
  const text = (v, max = 160) => (typeof v === 'string' ? v.slice(0, max) : '');
  const out = {
    id: CUSTOM_BOARD,
    version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1,
    placeholder: input.placeholder === true,
    releaseAt: text(input.releaseAt, 40),
    title: text(input.title, 60),
    landmark: text(input.landmark, 80),
    music: MUSIC_CUES.includes(input.music) ? input.music : 'level1',
    width: num(input.width),
    lesson: text(input.lesson, 200),
    rumor: text(input.rumor, 200),
    points: Array.isArray(input.points)
      ? input.points.map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [undefined, undefined]))
      : [],
    apexes: ints(input.apexes),
    rocks: ints(input.rocks),
  };
  if (!out.placeholder) delete out.placeholder;
  const moving = ints(input.moving);
  if (moving.length) out.moving = moving;
  if (Array.isArray(input.drones) && input.drones.length) out.drones = input.drones.map(num);
  if (input.well && typeof input.well === 'object') {
    out.well = { x: num(input.well.x), y: num(input.well.y), radius: num(input.well.radius), influence: num(input.well.influence), strength: num(input.well.strength) };
  }
  return out;
}

/** The editor's saved draft, from a Storage-like object. { track } or { error }. */
export function readDraft(storage) {
  let raw = null;
  try { raw = storage?.getItem(DRAFT_KEY) ?? null; } catch { return { error: 'This browser blocked reading the editor draft.' }; }
  if (!raw) return { error: 'No editor draft on this browser. Use “Test fly” in the editor first.' };
  try {
    const track = pickTrackFields(JSON.parse(raw));
    return track ? { track } : { error: 'The editor draft is empty.' };
  } catch {
    return { error: 'The editor draft is damaged. Test fly it from the editor again.' };
  }
}

const FIELD_ORDER = ['id', 'version', 'placeholder', 'releaseAt', 'title', 'landmark', 'music', 'width', 'lesson', 'rumor', 'points', 'apexes', 'rocks', 'moving', 'drones', 'well'];

/** The track as the text of tracks/custom-track.js, ready to paste over the file. */
export function trackModuleText(track) {
  const t = pickTrackFields(track);
  const lines = [];
  for (const key of FIELD_ORDER) {
    if (!(key in t)) continue;
    if (key === 'points') {
      lines.push('  points: [');
      for (const [x, y] of t.points) lines.push(`    [${x}, ${y}],`);
      lines.push('  ],');
    } else if (Array.isArray(t[key])) lines.push(`  ${key}: [${t[key].map((v) => JSON.stringify(v)).join(', ')}],`);
    else lines.push(`  ${key}: ${JSON.stringify(t[key])},`);
  }
  return [
    '// THE CUSTOM TRACK. Exported from the track editor (games/stardust/editor.html).',
    '// Format and publishing steps: docs/stardust/CUSTOM-TRACK.md.',
    'export const CUSTOM_TRACK = {',
    ...lines,
    '};',
    '',
  ].join('\n');
}

// Which track the game flies: the shipped file, or an editor draft in preview.
let active = CUSTOM_TRACK;
export function activeCustomTrack() { return active; }
export function useCustomTrack(track) { active = track || CUSTOM_TRACK; }
