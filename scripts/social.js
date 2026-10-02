// Friends, challenges and progress on donavencrenshaw.com: the parts with no DOM.
//
// Formatting, links, share messages, error wording, and the shapes the account
// page, the Stardust leaderboard and the challenge page draw from. Nothing here
// touches the page, so tests/site-social-*.test.mjs run it in Node. The hub side
// is docs/game/FRIENDS_CHALLENGES.md.

export const LEVELS = [
    ['alpha-relay', 'Alpha Relay'],
    ['beacon-prime', 'Beacon Prime'],
    ['dustfall-station', 'Dustfall Station'],
    ['nether-crossing', 'Nether Crossing'],
    ['iron-veil', 'Iron Veil']
];
export const BOARDS = [['full', 'Full run'], ...LEVELS];
const BOARD_NAMES = Object.fromEntries(BOARDS);
const MEDALS = ['gold', 'silver', 'bronze'];

const USERNAME = /^[A-Za-z0-9_-]{3,20}$/;
// The contract doesn't fix a challenge id format; anything URL-safe and short.
const CHALLENGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// --- Times --------------------------------------------------------------------

const two = (n) => String(n).padStart(2, '0');
const whole = (ms) => Math.max(0, Math.round(Number(ms) || 0));
// A time field from the hub, or null. Number(null) is 0, which would read as a
// perfect run, so only real numbers count.
const timeOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// 1:54.69, the way every board on the site shows a time.
export function clock(ms) {
    const t = whole(ms);
    return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
}

// A difference between two times: 1.80s under a minute, 1:02.30 above.
export function span(ms) {
    const t = whole(ms);
    return t < 60000 ? `${Math.floor(t / 1000)}.${two(Math.floor((t % 1000) / 10))}s` : clock(t);
}

export const gapText = (ms) => `+${span(ms)}`;

export const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

export const nameOf = (pilot) => (pilot && (pilot.displayName || pilot.username)) || '';

export function boardName(board, fallback) {
    return fallback || BOARD_NAMES[board] || String(board || '');
}

// --- Links ---------------------------------------------------------------------

function normaliseBase(base) {
    const value = String(base || '/').trim();
    const lead = value.startsWith('/') ? value : `/${value}`;
    return lead.endsWith('/') ? lead : `${lead}/`;
}

// Links are built from the page's own origin and the site base, so previews and
// the GitHub Pages copy hand out links to themselves.
export function siteUrl(origin, base, path = '') {
    return `${String(origin || '').replace(/\/+$/, '')}${normaliseBase(base)}${String(path).replace(/^\/+/, '')}`;
}

export const inviteLink = (origin, base, username) => siteUrl(origin, base, `account/?friend=${encodeURIComponent(username)}`);
export const challengeLink = (origin, base, id) => siteUrl(origin, base, `stardust/challenge/?c=${encodeURIComponent(id)}`);
export const challengePath = (base, id) => `${normaliseBase(base)}stardust/challenge/?c=${encodeURIComponent(id)}`;
export const accountPath = (base, hash = '') => `${normaliseBase(base)}account/${hash}`;

// The game with a challenge attached, or plain play when there's no usable one.
export function playPath(base, challengeId) {
    const path = `${normaliseBase(base)}games/stardust/`;
    return challengeId ? `${path}?challenge=${encodeURIComponent(challengeId)}` : path;
}

// Sign-in that comes back to `next` (a path on this site) afterwards. The
// account page only honours same-site paths.
export function signInPath(base, next, { create = false } = {}) {
    return `${normaliseBase(base)}account/?next=${encodeURIComponent(next)}${create ? '#create' : ''}`;
}

// ?friend=<username> on the account page. Exact usernames only.
export function readFriendParam(search) {
    const value = (new URLSearchParams(search || '').get('friend') || '').trim();
    return USERNAME.test(value) ? value : null;
}

// ?c=<id> on the challenge page.
export function readChallengeId(search) {
    const value = (new URLSearchParams(search || '').get('c') || '').trim();
    return CHALLENGE_ID.test(value) ? value : null;
}

// ?vs=<username> on the weekly page: whose ghost to race. Exact usernames only.
export function readVsParam(search) {
    const value = (new URLSearchParams(search || '').get('vs') || '').trim();
    return USERNAME.test(value) ? value : null;
}

// What someone typed into "Add a friend": a username, @username, or a pasted
// invite link. Returns the username, or null when it can't be one.
export function cleanUsername(input) {
    let value = String(input || '').trim();
    if (/[?&]friend=/.test(value)) {
        try { value = new URL(value, 'https://x.invalid/').searchParams.get('friend') || ''; } catch { value = ''; }
    }
    value = value.trim().replace(/^@/, '');
    return USERNAME.test(value) ? value : null;
}

export const isUsername = (value) => USERNAME.test(String(value || ''));

// --- Share messages --------------------------------------------------------------

const boardPhrase = (board, name) => (board === 'full' ? 'the full network' : boardName(board, name));

// "Beat my Stardust time: 1:54.69 on the full network → <link>". Without a link
// it is the text handed to the browser's share sheet, which adds the link itself.
export function challengeMessage({ timeMs, board = 'full', boardName: name, pilotName, mine = true, link } = {}) {
    const whose = mine || !pilotName ? 'my' : `${pilotName}’s`;
    const text = `Beat ${whose} Stardust time: ${clock(timeMs)} on ${boardPhrase(board, name)}`;
    return link ? `${text} → ${link}` : text;
}

export function inviteMessage(link) {
    const text = 'Add me as a friend on Stardust and race my times';
    return link ? `${text} → ${link}` : text;
}

// --- Errors ------------------------------------------------------------------------

const ERRORS = {
    bad_username: 'That isn’t a username. Usernames are 3–20 letters, numbers, - or _.',
    self: 'That’s you. Send your invite link to someone else.',
    no_user: 'No pilot has that username. It has to match exactly.',
    already_friends: 'You’re already friends.',
    already_requested: 'You’ve already sent them a request.',
    blocked: 'You’ve blocked this pilot. Unblock them first.',
    friend_limit: 'You’ve reached the friend limit. Remove someone first.',
    too_many_requests: 'That’s a lot of requests at once. Wait a few minutes and try again.',
    too_many_challenges: 'That’s the limit of 30 challenges a day. Try again tomorrow.',
    not_friends: 'You can only send that to a friend.',
    unknown_challenge: 'This challenge doesn’t exist, or isn’t open to you.',
    challenge_expired: 'This challenge has expired.',
    challenge_outdated: 'The track has changed since this time was set, so it can’t be raced as a challenge.',
    outdated: 'The track has changed since this time was set, so it can’t be raced as a challenge.',
    signed_out: 'Your session ended. Sign in again.',
    unknown_avatar: 'That avatar isn’t available any more. Pick another one.',
    title_not_earned: 'You haven’t earned that title yet.',
    not_found: 'No pilot has that username.'
};

// Plain words for a failed hub call. `res` is what createHub() returns.
export function problemText(res, fallback = 'Something went wrong. Try again.') {
    if (!res || res.offline) return 'The hub isn’t answering. Try again in a minute.';
    const code = res.data?.error;
    if (code && ERRORS[code]) return ERRORS[code];
    if (res.status === 401) return ERRORS.signed_out;
    if (res.status === 429) return ERRORS.too_many_requests;
    return fallback;
}

// --- Friends -------------------------------------------------------------------------

// Where ?friend=<username> stands against the signed-in pilot's lists, so the
// account page knows whether to ask, or to say why it won't.
export function inviteState(username, me, lists) {
    if (!username) return 'none';
    const same = (pilot) => String(pilot?.username || '').toLowerCase() === username.toLowerCase();
    if (me && same(me)) return 'self';
    if (!lists) return 'ask';
    if ((lists.friends || []).some(same)) return 'friends';
    if ((lists.incoming || []).some(same)) return 'incoming';
    if ((lists.outgoing || []).some(same)) return 'outgoing';
    if ((lists.blocked || []).some(same)) return 'blocked';
    return 'ask';
}

// What to say after POST /api/friends/requests succeeded.
export function requestSentText(res, username) {
    if (res?.data?.status === 'friends') return `You and ${nameOf(res.data.friend) || username} are friends now.`;
    return `Request sent to ${nameOf(res?.data?.request) || username}. They’ll see it on their account page.`;
}

// --- Boards ----------------------------------------------------------------------------

export function boardRows(entries, meUsername) {
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
        rank: entry.rank,
        name: nameOf(entry),
        username: entry.username,
        time: clock(entry.timeMs),
        timeMs: entry.timeMs,
        date: day(entry.setAt),
        // Identity for the row: picture, title chip and profile link (pilot-ui.js).
        avatarPreset: entry.avatarPreset ?? null,
        avatarUrl: entry.avatarUrl ?? null,
        title: entry.title && typeof entry.title === 'object' ? entry.title : null,
        // Optional extras from the hub: the ship { build, family } and the device { device, input, build }
        // the time was flown on. Rows without them show nothing extra (ship-info.js).
        ship: entry.ship && typeof entry.ship === 'object' ? entry.ship : null,
        // True when the pilot lets others copy their flight settings (an opt-in on their account page).
        hasSettings: entry.hasSettings === true,
        client: entry.client && typeof entry.client === 'object' ? entry.client : null,
        isMe: Boolean(entry.isMe || (meUsername && entry.username === meUsername))
    }));
}

export const nextText = (next) => (next ? `Next: ${nameOf(next)} ${gapText(next.gapMs)}` : '');

// GET boards/full/around-me: the rows, and the pilot directly above.
export function aroundMe(data, meUsername) {
    const me = data?.me || null;
    return {
        hasTime: Boolean(me),
        me,
        total: Number(data?.total) || 0,
        rows: me ? boardRows(data?.entries, meUsername) : [],
        next: me && data?.next ? { ...data.next, text: nextText(data.next) } : null
    };
}

// On a friends board the hub sends no `next`, so it is the row directly above
// yours. null when you're first or not on the board.
export function nextAbove(entries, meUsername) {
    const rows = Array.isArray(entries) ? entries : [];
    const at = rows.findIndex((entry) => entry.isMe || (meUsername && entry.username === meUsername));
    if (at <= 0) return null;
    const above = rows[at - 1];
    const next = { rank: above.rank, username: above.username, displayName: above.displayName, timeMs: above.timeMs, gapMs: Math.max(0, rows[at].timeMs - above.timeMs) };
    return { ...next, text: nextText(next) };
}

// A friends board with nobody on it but you (or nobody at all).
export const friendlessBoard = (entries, meUsername) => boardRows(entries, meUsername).every((row) => row.isMe);

// --- Medals and splits --------------------------------------------------------------------

export const medalLabel = (medal) => (medal ? medal[0].toUpperCase() + medal.slice(1) : '');

// The next medal a time can reach: the slowest medal time still faster than it.
// null without medals, without a time, or once gold is yours.
export function nextMedal(timeMs, medals) {
    if (!medals || timeOf(timeMs) === null) return null;
    let best = null;
    for (const medal of MEDALS) {
        const target = timeOf(medals[medal]);
        if (target === null || target >= timeMs) continue;
        if (!best || target > best.timeMs) best = { medal, timeMs: target, gapMs: timeMs - target };
    }
    return best;
}

// "Next medal: Silver in 40.00s (2:30.00)". Nothing when the board has no medals.
export function medalLine(best, medals) {
    if (!medals || !best) return '';
    const next = nextMedal(best.timeMs, medals);
    if (next) return `Next medal: ${medalLabel(next.medal)} in ${span(next.gapMs)} (${clock(next.timeMs)})`;
    return best.medal === 'gold' ? 'Top medal on this board.' : '';
}

// A full run's circuit splits in flying order; unknown ids go last.
export function splitRows(splits) {
    if (!splits || typeof splits !== 'object') return [];
    const row = (id, name) => ({ id, name, timeMs: splits[id], time: clock(splits[id]) });
    const known = LEVELS.filter(([id]) => timeOf(splits[id]) !== null).map(([id, name]) => row(id, name));
    const extra = Object.keys(splits).filter((id) => !BOARD_NAMES[id] && timeOf(splits[id]) !== null).map((id) => row(id, id));
    return [...known, ...extra];
}

// --- Challenges ------------------------------------------------------------------------------

const STATUS = { active: 'Open', expired: 'Expired', outdated: 'Track changed' };
export const statusLabel = (status) => STATUS[status] || 'Unknown';

// Your best against the target, in words.
export function versusText(bestMs, targetMs) {
    if (timeOf(bestMs) === null) return 'No attempt yet';
    const diff = bestMs - Number(targetMs);
    if (diff === 0) return `${clock(bestMs)} · dead level`;
    return `${clock(bestMs)} · ${span(Math.abs(diff))} ${diff < 0 ? 'faster' : 'behind'}`;
}

// One row of the account page's Inbox or Sent list.
export function challengeRow(view, box) {
    const target = view?.target || {};
    const pilot = nameOf(target.pilot);
    const from = nameOf(view?.from);
    const to = nameOf(view?.to);
    // A "chase" link targets a friend's run, so the pilot isn't the sender.
    const chase = pilot && target.pilot?.username !== view?.from?.username ? ` · ${pilot}’s run` : '';
    const title = box === 'sent' ? `${to ? `To ${to}` : 'Open link'}${chase}` : `From ${from || pilot}${chase}`;
    let detail;
    if (box === 'sent') {
        const attempts = Number(view?.attemptsCount) || 0;
        const beaten = Number(view?.beatenCount) || 0;
        detail = `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} · ${beaten} beaten`;
    } else {
        detail = `You: ${versusText(view?.viewer?.bestMs, target.timeMs)}`;
    }
    return {
        id: view?.id,
        title,
        board: boardName(view?.board, view?.boardName),
        target: clock(target.timeMs),
        status: view?.status || 'unknown',
        statusLabel: statusLabel(view?.status),
        beaten: Boolean(view?.viewer?.beaten),
        detail
    };
}

// --- The hub ------------------------------------------------------------------------------------

// fetch for the hub's /api. Always sends the session cookie, gives up after
// timeoutMs, and reports a network failure or a 5xx gateway error as `offline`
// (the hub is a laptop that sleeps) rather than as an answer.
export function createHub(origin, { fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 8000 } = {}) {
    const base = String(origin || '').replace(/\/+$/, '');
    return async function hub(path, { method = 'GET', body } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchImpl(`${base}/api${path}`, {
                method,
                credentials: 'include',
                cache: 'no-store',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            let data = null;
            try { data = await res.json(); } catch { /* 204 or not JSON */ }
            return { ok: res.ok, status: res.status, data, offline: res.status >= 502, signedOut: res.status === 401 };
        } catch {
            return { ok: false, status: 0, data: null, offline: true, signedOut: false };
        } finally {
            clearTimeout(timer);
        }
    };
}

// The friends, challenge and board calls, named after what they do.
export function socialApi(hub) {
    const id = encodeURIComponent;
    return {
        session: () => hub('/users/session'),
        friends: () => hub('/friends'),
        request: (username) => hub('/friends/requests', { method: 'POST', body: { username } }),
        accept: (requestId) => hub(`/friends/requests/${id(requestId)}/accept`, { method: 'POST' }),
        decline: (requestId) => hub(`/friends/requests/${id(requestId)}/decline`, { method: 'POST' }),
        cancel: (requestId) => hub(`/friends/requests/${id(requestId)}`, { method: 'DELETE' }),
        unfriend: (username) => hub(`/friends/${id(username)}`, { method: 'DELETE' }),
        block: (username) => hub('/friends/blocks', { method: 'POST', body: { username } }),
        unblock: (username) => hub(`/friends/blocks/${id(username)}`, { method: 'DELETE' }),
        game: () => hub('/games/stardust'),
        me: () => hub('/games/stardust/me'),
        board: (board, { scope, limit = 10 } = {}) => hub(`/games/stardust/boards/${id(board)}?${scope === 'friends' ? 'scope=friends&' : ''}limit=${limit}`),
        aroundMe: (spanRows = 3) => hub(`/games/stardust/boards/full/around-me?span=${spanRows}`),
        challenge: (challengeId) => hub(`/games/stardust/challenges/${id(challengeId)}`),
        challenges: (box) => hub(`/games/stardust/challenges?box=${box === 'sent' ? 'sent' : 'inbox'}`),
        // Titles, avatars and public profiles.
        titles: () => hub('/titles'),
        myTitles: () => hub('/users/me/titles'),
        setTitle: (titleId) => hub('/users/me/title', { method: 'PUT', body: { titleId: titleId || null } }),
        avatars: () => hub('/avatars'),
        setAvatar: (preset) => hub('/users/me/avatar', { method: 'PUT', body: { preset: preset || null } }),
        setProfilePublic: (profilePublic) => hub('/users/profile', { method: 'PUT', body: { profilePublic: Boolean(profilePublic) } }),
        // One section of the public profile at a time; the hub changes only the keys sent.
        setProfileShow: (section, shown) => hub('/users/profile', { method: 'PUT', body: { profileShow: { [section]: Boolean(shown) } } }),
        account: () => hub('/users/me'),
        // Discord linking. status answers { enabled } so the card can hide itself; linking is a
        // browser navigation to discordLinkUrl(), and unlinking answers { discord, rolesRemoved }.
        discordStatus: () => hub('/discord/status'),
        unlinkDiscord: () => hub('/discord/link', { method: 'DELETE' }),
        // The equipped ship (404 no_ship when none) and the pilot's published designs.
        myShip: () => hub('/stardust/ship'),
        liveries: (artist) => hub(`/stardust/liveries${artist ? `?artist=${id(artist)}` : ''}`),
        profile: (username) => hub(`/profiles/${id(username)}`),
        // Weekly events and their comments.
        event: (eventId) => hub(`/games/stardust/events/${id(eventId)}`),
        comments: (page) => hub(`/feedback?page=${id(page)}`),
        postComment: (page, text) => hub('/feedback', { method: 'POST', body: { page, text } }),
        deleteComment: (commentId) => hub(`/feedback/${id(commentId)}`, { method: 'DELETE' })
    };
}

// --- Discord ---------------------------------------------------------------------------

export const DISCORD_INVITE = 'https://discord.gg/qjntnnd9cD';

// The roles the bot can give a linked pilot, as shown on the account page.
export const DISCORD_ROLES = [
    ['Pilot', 'Finish any Stardust run while signed in.'],
    ['Weekly Finisher', 'Set a time on the weekly that is live now.'],
    ['Podium and Weekly Champion', 'Place top three, or first, on the last weekly. Staff dev times never place.'],
    ['Needle, Manta, Wisp or Courier Pilot', 'The family of your equipped ship, only while your profile shows your ship.']
];

// Where the "Link Discord" button goes: the hub starts the OAuth flow and sends the
// pilot back to returnUrl (a page on this site) with ?discord=<code> added.
export function discordLinkUrl(hubOrigin, returnUrl) {
    const base = String(hubOrigin || '').replace(/\/+$/, '');
    return `${base}/api/discord/link?return=${encodeURIComponent(returnUrl)}`;
}

const DISCORD_RESULTS = {
    linked: ['ok', 'Discord linked. Your roles usually arrive within 15 minutes.'],
    denied: ['info', 'You cancelled on Discord, so nothing was linked.'],
    state_invalid: ['error', 'That link attempt expired. Press Link Discord to start again.'],
    signin_required: ['error', 'Sign in first, then link Discord.'],
    wrong_account: ['error', 'You are signed in as a different account than the one that started the link. Press Link Discord to try again.'],
    already_linked: ['error', 'That Discord account is already linked to another account here. Unlink it there first, or use a different Discord account.'],
    exchange_failed: ['error', 'Discord didn’t accept the link. Try again.'],
    discord_unreachable: ['error', 'Discord isn’t answering. Try again in a few minutes.']
};

// What ?discord=<code> on the account page means: { kind, text } or null for an unknown code.
export function discordResult(code) {
    const found = Object.hasOwn(DISCORD_RESULTS, code) ? DISCORD_RESULTS[code] : null;
    return found ? { kind: found[0], text: found[1] } : null;
}

// What to say after DELETE /discord/link answered with `data`.
export function discordUnlinkText(data) {
    if (data?.rolesRemoved === true) return 'Unlinked. Your Stardust roles were removed from the server.';
    if (data?.rolesRemoved === false) return 'Unlinked. Discord didn’t answer, so a role may still show on the server; ask in the Discord and it will be removed.';
    return 'Unlinked.';
}
