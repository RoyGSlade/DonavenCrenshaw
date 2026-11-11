// Christmas list: the pure parts. How the hub's GET /list answer becomes what
// the page draws, what each item says for a giver, and the plain words for a
// failed hub call. No DOM here so tests can import it (tests/site-christmas.test.mjs);
// scripts/christmas.js draws the page.
//
// This repository is public and holds NO list data. Everything below works on
// what the private hub sends to an approved giver.

export const OFFLINE_TEXT = 'The list is offline right now; try again later.';

const str = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);

// A list of short lines from an array of strings, one string, or an object of label: value.
export function lines(value) {
    if (Array.isArray(value)) return value.map((entry) => str(entry)).filter(Boolean);
    if (typeof value === 'string') return value.split(/\n|·/).map((entry) => str(entry)).filter(Boolean);
    if (value && typeof value === 'object') return Object.entries(value).map(([label, entry]) => `${str(label, 60)}: ${str(entry, 200)}`);
    return [];
}

// A link from the hub is only ever an https URL; anything else is dropped.
export function safeHref(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

// "Pick one: this or the X, not both." from the pairs and the item names.
function pickNotes(pairs, names) {
    const notes = new Map();
    for (const pair of Array.isArray(pairs) ? pairs : []) {
        const members = ids(pair).filter((id) => names.has(id));
        for (const id of members) {
            const others = members.filter((other) => other !== id).map((other) => names.get(other).replace(/\s*\([^)]*\)/g, ''));
            if (others.length) notes.set(id, `Pick one: this or ${others.join(' or ')}, not both.`);
        }
    }
    return notes;
}

// The hub's GET /list answer, made safe to draw: strings only, https links only,
// sections in the order sent. Claims are sets of ids.
export function readList(data) {
    const sections = (Array.isArray(data?.sections) ? data.sections : []).map((section) => ({
        id: str(section?.id, 60),
        title: str(section?.title, 120),
        blurb: str(section?.blurb, 600),
        locked: section?.locked === true,
        items: (Array.isArray(section?.items) ? section.items : []).filter((item) => str(item?.id, 80)).map((item) => ({
            id: str(item.id, 80),
            name: str(item.name, 300),
            why: str(item.why, 900),
            price: str(item.price, 40),
            link: safeHref(item.link),
            linkLabel: str(item.linkLabel, 80) || 'Store',
            star: item.star === true,
            kit: item.kit === true
        }))
    })).filter((section) => section.id && section.items.length);
    const names = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, item.name])));
    const notes = pickNotes(data?.pairs, names);
    for (const section of sections) for (const item of section.items) item.pick = notes.get(item.id) || '';
    return {
        title: str(data?.title, 120),
        intro: str(data?.intro, 600),
        closes: /^\d{4}-\d{2}-\d{2}$/.test(String(data?.closes)) ? data.closes : '',
        sizes: lines(data?.sizes),
        rules: lines(data?.rules),
        priceNote: str(data?.priceNote || (data?.priceLabel ? `Prices are approximate (${data.priceLabel}).` : ''), 400),
        sections,
        claims: {
            unlocked: data?.unlocked === true,
            taken: new Set(ids(data?.taken)),
            mine: new Set(ids(data?.mine)),
            covered: new Set(ids(data?.covered))
        }
    };
}

// open | mine | taken | covered. Your own claim wins, then taken, then covered by a pair.
export function itemState(id, claims) {
    if (!claims) return 'unknown';
    if (claims.mine.has(id)) return 'mine';
    if (claims.taken.has(id)) return 'taken';
    if (claims.covered.has(id)) return 'covered';
    return 'open';
}

export const STATE_LABEL = {
    mine: 'You are getting this',
    taken: 'Taken',
    covered: 'Covered by its pair'
};

// The list closes at the end of its last day, local time.
export function isClosed(closes, now = new Date()) {
    const [year, month, day] = String(closes).split('-').map(Number);
    if (!year || !month || !day) return false;
    return now.getTime() >= new Date(year, month - 1, day + 1).getTime();
}

// "December 26, 2026" from "2026-12-26".
export function closesText(closes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(closes))) return '';
    return new Date(`${closes}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Plain words for a join that did not work. `res` is what the hub client returns.
export function joinProblem(res) {
    if (!res || res.offline) return OFFLINE_TEXT;
    if (res.status === 429) return res.text && res.text.length < 200 ? res.text : 'Too many requests right now. Try again later.';
    if (res.status === 400 || res.status === 422) return 'Check your name and email and try again.';
    if (res.status === 410) return 'This list has closed.';
    return 'Something went wrong. Try again.';
}

// Plain words for a claim or release that did not work.
export function claimProblem(res, action = 'claim') {
    if (!res || res.offline) return OFFLINE_TEXT;
    if (res.status === 409) return 'Someone just took that one. The list is updated.';
    if (res.status === 410) return 'This list has closed.';
    if (res.status === 404) return action === 'claim' ? 'That item is not open right now.' : 'You have not claimed that one.';
    if (res.status === 401 || res.status === 403) return 'You need to be approved before you can claim.';
    if (res.status === 429) return 'Too many requests right now. Try again in a minute.';
    return 'Something went wrong. Try again.';
}
