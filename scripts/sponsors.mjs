// The sponsor wall on /support/: reading data/sponsors.json safely, grouping it by
// tier, and parsing GitHub's answer when scripts/sync-sponsors.mjs refreshes it.
//
// Only what GitHub already shows publicly about a sponsor is kept: login, display
// name, tier, the month they started, and optionally the username of a site
// profile they asked to be linked to. There is no email field anywhere, and
// cleanSponsors() drops any field it doesn't know, so one can't slip in.

import { profilePath } from './profile.js';

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SINCE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_SPONSORS = 200;

// Wall groups, biggest first. `min` is the monthly dollar amount a sponsorship
// needs to land in the group; one-time gifts have their own group.
export const GROUPS = Object.freeze([
    { key: 'top', label: '$100 a month', min: 100 },
    { key: 'mid', label: '$25 a month', min: 25 },
    { key: 'base', label: '$5 a month', min: 1 },
    { key: 'thanks', label: 'One-time thanks', oneTime: true }
]);

const plainText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The tier group key for a sponsorship, or null when it fits none. */
export function groupKeyFor({ oneTime, amountUSD }) {
    if (oneTime) return 'thanks';
    const amount = Number(amountUSD);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return (GROUPS.find((g) => !g.oneTime && amount >= g.min) || {}).key || null;
}

/** Validates and trims the raw list. Unknown fields (an email, say) are dropped, bad rows skipped. */
export function cleanSponsors(raw) {
    const seen = new Set();
    const out = [];
    for (const row of Array.isArray(raw) ? raw : []) {
        if (!row || typeof row !== 'object') continue;
        const login = plainText(row.login, 100); // not cut to 39: a too-long login must fail the pattern, not become another one
        if (!GITHUB_LOGIN.test(login) || seen.has(login.toLowerCase())) continue;
        const key = groupKeyFor({ oneTime: row.oneTime === true, amountUSD: row.amountUSD });
        if (!key) continue;
        seen.add(login.toLowerCase());
        const profile = plainText(row.profile, 32);
        out.push({
            login,
            name: plainText(row.name, 60) || login,
            group: key,
            amountUSD: row.oneTime === true ? null : Number(row.amountUSD),
            oneTime: row.oneTime === true,
            since: SINCE.test(String(row.since || '')) ? row.since : null,
            // A site profile the sponsor asked to link. The page shows the link; whether the
            // profile is public is the hub's rule, not decided here.
            profile: /^[A-Za-z0-9_-]{3,32}$/.test(profile) ? profile : null
        });
        if (out.length >= MAX_SPONSORS) break;
    }
    return out;
}

/** What the wall component renders: groups with their sponsors, empty groups left out. */
export function buildSponsorWall(file, { basePath = '/' } = {}) {
    const sponsors = cleanSponsors(file && file.sponsors);
    const groups = GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        items: sponsors
            .filter((s) => s.group === g.key)
            .sort((a, b) => (b.amountUSD || 0) - (a.amountUSD || 0) || String(a.since || '').localeCompare(String(b.since || '')) || a.login.localeCompare(b.login))
            .map((s) => ({
                login: s.login,
                name: s.name,
                since: s.since,
                githubUrl: `https://github.com/${s.login}`,
                profileUrl: s.profile ? profilePath(basePath, s.profile) : null
            }))
    })).filter((g) => g.items.length);
    return { total: sponsors.length, updatedAt: (file && file.updatedAt) || null, groups };
}

/**
 * Turns GitHub's sponsorshipsAsMaintainer answer into wall rows. Only public sponsorships
 * count; a recurring sponsor who has stopped is left out, one-time gifts stay as thanks.
 */
export function parseSponsorshipsResponse(json) {
    const nodes = json && json.data && json.data.viewer && json.data.viewer.sponsorshipsAsMaintainer && json.data.viewer.sponsorshipsAsMaintainer.nodes;
    const rows = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        const who = node && node.sponsorEntity;
        if (!who || !who.login) continue; // a deleted account
        if (node.privacyLevel !== 'PUBLIC') continue;
        const oneTime = node.isOneTimePayment === true;
        if (!oneTime && node.isActive === false) continue;
        rows.push({
            login: who.login,
            name: who.name || who.login,
            amountUSD: oneTime ? null : node.tier && node.tier.monthlyPriceInDollars,
            oneTime,
            since: typeof node.createdAt === 'string' ? node.createdAt.slice(0, 7) : null
        });
    }
    return rows;
}
