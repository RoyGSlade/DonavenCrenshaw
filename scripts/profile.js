// Pilot identity on donavencrenshaw.com: avatars, titles, profile links, the
// weekly board and its comments. The parts with no DOM, so
// tests/site-profile.test.mjs runs them in Node. pilot-ui.js draws them.
//
// The avatar list itself lives in data/avatars.json; the build publishes it as
// scripts/avatars.js, and callers pass it in here.

import { isUsername, clock, nameOf } from './social.js';

function normaliseBase(base) {
    const value = String(base || '/').trim();
    const lead = value.startsWith('/') ? value : `/${value}`;
    return lead.endsWith('/') ? lead : `${lead}/`;
}

// --- Profile links -------------------------------------------------------------

// /u/?name=<username>. null when it can't be a username, so callers render the
// name as plain text instead of a link that would 404 on the hub.
export function profilePath(base, username) {
    return isUsername(username) ? `${normaliseBase(base)}u/?name=${encodeURIComponent(username)}` : null;
}

// ?name=<username> on the profile page. Exact usernames only.
export function readProfileName(search) {
    let value = '';
    try { value = (new URLSearchParams(search || '').get('name') || '').trim().replace(/^@/, ''); } catch { value = ''; }
    return isUsername(value) ? value : null;
}

// --- Avatars ---------------------------------------------------------------------

const PRESET_ID = /^[a-z0-9-]{1,40}$/;
const SAFE_FILE = /^assets\/images\/avatars\/[A-Za-z0-9_-]+\.(?:svg|png|webp|jpe?g|avif)$/;

// data/avatars.json as a Map, keeping only well-formed entries.
export function avatarIndex(avatars) {
    const map = new Map();
    for (const entry of Array.isArray(avatars) ? avatars : []) {
        if (!entry || !PRESET_ID.test(String(entry.id)) || !SAFE_FILE.test(String(entry.file))) continue;
        map.set(entry.id, { id: entry.id, name: String(entry.name || entry.id), file: entry.file });
    }
    return map;
}

// Where a pilot's picture comes from:
//   1. their preset (avatarPreset → data/avatars.json → a site asset)
//   2. an uploaded picture (avatarUrl, a path on the hub like /uploads/avatars/x.png)
//   3. nothing: the caller draws the letter monogram.
// Uploaded pictures only load from the hub's own origin, never a third party.
export function avatarSrc(pilot, { avatars, base = '/', hub = '' } = {}) {
    if (!pilot) return null;
    const index = avatars instanceof Map ? avatars : avatarIndex(avatars);
    const preset = pilot.avatarPreset ? index.get(pilot.avatarPreset) : null;
    if (preset) return { kind: 'preset', src: `${normaliseBase(base)}${preset.file}`, id: preset.id, name: preset.name };
    const url = typeof pilot.avatarUrl === 'string' ? pilot.avatarUrl.trim() : '';
    const origin = String(hub || '').replace(/\/+$/, '');
    if (url && origin) {
        if (/^\/(?!\/)[A-Za-z0-9/_.-]+$/.test(url) && !url.includes('..')) return { kind: 'upload', src: `${origin}${url}` };
        try {
            const parsed = new URL(url);
            if (parsed.origin === new URL(origin).origin) return { kind: 'upload', src: parsed.href };
        } catch { /* not a URL */ }
    }
    return null;
}

// The letter shown when there is no picture.
export function monogram(pilot) {
    const name = nameOf(pilot) || (typeof pilot?.name === 'string' ? pilot.name : '');
    const first = [...String(name).trim()][0] || '?';
    return first.toUpperCase();
}

// --- Titles ----------------------------------------------------------------------

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'unique'];
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', unique: 'Unique' };
// Rarest first, for lists of earned titles.
const RARITY_ORDER = { unique: 0, legendary: 1, epic: 2, rare: 3, common: 4 };

export const rarityOf = (value) => (RARITIES.includes(value) ? value : 'common');
export const rarityLabel = (value) => RARITY_LABEL[rarityOf(value)];

// A title chip: its words, its rarity (whitelisted, so it can go in a class
// name) and the class list. null for no title.
export function titleChip(title) {
    if (!title || typeof title !== 'object') return null;
    const text = typeof title.title === 'string' ? title.title.trim().slice(0, 40) : '';
    if (!text) return null;
    const rarity = rarityOf(title.rarity);
    return { id: title.id ?? null, text, rarity, label: `${rarityLabel(rarity)} title: ${text}`, className: `pilot-chip pilot-chip--${rarity}` };
}

export function sortTitles(titles) {
    return (Array.isArray(titles) ? titles : [])
        .filter((t) => t && typeof t.title === 'string')
        .slice()
        .sort((a, b) => (RARITY_ORDER[rarityOf(a.rarity)] - RARITY_ORDER[rarityOf(b.rarity)]) || String(a.title).localeCompare(String(b.title)));
}

// GET /titles minus what the pilot has earned: the locked list on /account/.
// Hidden ones come from the hub as "???" with a hint and stay that way.
export function lockedTitles(all, earned) {
    const have = new Set((Array.isArray(earned) ? earned : []).map((t) => t?.id));
    return sortTitles((Array.isArray(all) ? all : []).filter((t) => t && !have.has(t.id))).map((t) => {
        const secret = Boolean(t.hidden) && (t.title === '???' || !t.description);
        return {
            id: t.id,
            title: secret ? '???' : t.title,
            rarity: rarityOf(t.rarity),
            text: secret ? (t.hint || 'A hidden title.') : (t.description || ''),
            secret,
            holders: Number.isFinite(t.holders) ? t.holders : null
        };
    });
}

// --- Profile page ------------------------------------------------------------------

const BOARD_ORDER = ['full', 'alpha-relay', 'beacon-prime', 'dustfall-station', 'nether-crossing', 'iron-veil', 'custom-track'];

export function joinedText(iso) {
    const at = iso ? new Date(iso) : null;
    if (!at || Number.isNaN(at.getTime())) return '';
    return `Joined ${at.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' })}`;
}

const ordinal = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 1) return '';
    const s = ['th', 'st', 'nd', 'rd'];
    const m = v % 100;
    return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`;
};
export { ordinal };

// GET /profiles/:username, shaped for the page. `isPublic` false with no
// details means the private card; the owner viewing their own private
// profile still gets everything, flagged with `ownPrivate`.
export function profileView(data) {
    const p = data || {};
    const detailed = Array.isArray(p.titles) || Boolean(p.stardust) || Boolean(p.dogfight) || typeof p.bio === 'string';
    const bests = (Array.isArray(p.stardust?.bests) ? p.stardust.bests : [])
        .filter((b) => b && typeof b.timeMs === 'number')
        .slice()
        .sort((a, b) => {
            const ai = BOARD_ORDER.indexOf(a.board);
            const bi = BOARD_ORDER.indexOf(b.board);
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        })
        .map((b) => ({ board: b.board, name: b.name || b.board, time: clock(b.timeMs), rank: b.rank ? `#${b.rank}` : 'Unranked', date: b.setAt ? String(b.setAt).slice(0, 10) : '' }));
    const events = (Array.isArray(p.events) ? p.events : [])
        .filter((e) => e && e.id)
        .map((e) => ({ id: e.id, name: e.name || e.id, place: ordinal(e.rank) || '—', podium: Number(e.rank) >= 1 && Number(e.rank) <= 3, time: typeof e.timeMs === 'number' ? clock(e.timeMs) : '' }));
    const devTimes = p.staff ? (Array.isArray(p.devTimes) ? p.devTimes : [])
        .filter((d) => d && typeof d.timeMs === 'number')
        .map((d) => ({ board: d.board, name: d.name || d.board, time: clock(d.timeMs), date: d.setAt ? String(d.setAt).slice(0, 10) : '' })) : [];
    const wins = Number(p.dogfight?.wins) || 0;
    const losses = Number(p.dogfight?.losses) || 0;
    return {
        username: p.username,
        name: nameOf(p) || p.username || '',
        chip: titleChip(p.title),
        joined: joinedText(p.joinedAt),
        isPublic: Boolean(p.isPublic),
        showDetails: Boolean(p.isPublic) || detailed,
        ownPrivate: !p.isPublic && detailed,
        bio: typeof p.bio === 'string' ? p.bio : '',
        titles: sortTitles(p.titles).map(titleChip).filter(Boolean),
        bests,
        dogfight: p.dogfight ? { wins, losses, text: `${wins}–${losses}`, played: wins + losses } : null,
        events,
        staff: Boolean(p.staff),
        devTimes
    };
}

// --- Weekly board and comments ------------------------------------------------------

// What the weekly board says instead of rows. `state` is weeklyStatus().state.
export function weeklyBoardText(state, count = 0) {
    if (state === 'upcoming') return 'Board opens with the track.';
    if (count > 0) return '';
    if (state === 'live') return 'No times yet. Sign in, fly one clean lap, and the top spot is yours.';
    if (state === 'closed') return 'The week closed with no finished runs.';
    return 'No times on this board.';
}

// The line over the weekly board.
export function weeklyBoardMeta(state, { live = true } = {}) {
    if (!live) return 'Hub asleep · try again soon';
    if (state === 'upcoming') return 'Opens with the track';
    if (state === 'closed') return 'Closed · final standings';
    return 'Live · refreshes every minute';
}

const COMMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

// One comment from GET /feedback?page=…, ready to draw. `me` is the session
// user (or null). Author links only when the hub names a real username.
export function commentRow(item, me, { base = '/' } = {}) {
    if (!item || typeof item.text !== 'string') return null;
    const author = item.author && typeof item.author === 'object' ? item.author : null;
    const name = (author && nameOf(author)) || (typeof item.name === 'string' && item.name.trim()) || 'A pilot';
    const username = author && isUsername(author.username) ? author.username : null;
    const at = item.createdAt ? new Date(item.createdAt) : null;
    const valid = at && !Number.isNaN(at.getTime());
    const mine = Boolean(me && username && me.username && username.toLowerCase() === String(me.username).toLowerCase());
    const id = item.id === undefined || item.id === null ? '' : String(item.id);
    return {
        id,
        text: item.text,
        name,
        username,
        href: username ? profilePath(base, username) : null,
        pilot: { username, displayName: name, avatarPreset: author?.avatarPreset ?? null, avatarUrl: author?.avatarUrl ?? null },
        chip: titleChip(author?.title),
        date: valid ? at.toISOString().slice(0, 10) : '',
        iso: valid ? at.toISOString() : '',
        time: valid ? at.getTime() : 0,
        canDelete: Boolean(COMMENT_ID.test(id) && (mine || me?.role === 'ADMIN'))
    };
}

// Newest first, whatever order the hub sent.
export function commentRows(data, me, options) {
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return items.map((item) => commentRow(item, me, options)).filter(Boolean).sort((a, b) => b.time - a.time);
}

export const COMMENT_MAX = 1000;

const COMMENT_ERRORS = {
    display_name_required: 'Set a display name on your account page first; comments show it.',
    invalid_text: `Write something, up to ${COMMENT_MAX} characters.`,
    too_many_requests: 'That’s a lot of comments at once. Wait a few minutes and try again.',
    unauthorized: 'Your session ended. Sign in again.'
};

export function commentProblem(res) {
    if (!res || res.offline) return 'The hub isn’t answering. Try again in a minute.';
    const code = res.data?.error;
    if (code && COMMENT_ERRORS[code]) return COMMENT_ERRORS[code];
    if (res.status === 401) return COMMENT_ERRORS.unauthorized;
    if (res.status === 429) return COMMENT_ERRORS.too_many_requests;
    if (res.status === 403) return 'You can only delete your own comments.';
    return 'That didn’t go through. Try again.';
}

// The weekly countdown as clock segments: days (only while there are any),
// hours, minutes, seconds. Seconds round up, like the game's countdown label.
export function countdownParts(remainingMs) {
    const total = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
    const two = (n) => String(n).padStart(2, '0');
    const days = Math.floor(total / 86400);
    const parts = [
        { value: two(Math.floor((total % 86400) / 3600)), unit: 'hrs' },
        { value: two(Math.floor((total % 3600) / 60)), unit: 'min' },
        { value: two(total % 60), unit: 'sec' }
    ];
    return days ? [{ value: String(days), unit: days === 1 ? 'day' : 'days' }, ...parts] : parts;
}

// "6 days, 4 hours, 3 minutes" for screen readers, next to the ticking clock.
export function countdownWords(remainingMs) {
    const total = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const words = [];
    if (d) words.push(plural(d, 'day'));
    if (h || d) words.push(plural(h, 'hour'));
    words.push(plural(m, 'minute'));
    return words.join(', ');
}
