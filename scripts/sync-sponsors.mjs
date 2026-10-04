// Refreshes data/sponsors.json from GitHub Sponsors, using your own `gh` login.
//
//   node scripts/sync-sponsors.mjs [--dry-run]
//
// Needs the `read:user` scope once:  gh auth refresh -h github.com -s read:user
// Read-only: it asks GitHub for the PUBLIC sponsorships only (includePrivate:false), never
// posts anything, never stores an email, and keeps any `profile` link already set in the
// file. It writes only data/sponsors.json; you review the diff and commit it yourself.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanSponsors, parseSponsorshipsResponse } from './sponsors.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/sponsors.json');
const QUERY = `query($after: String) { viewer { sponsorshipsAsMaintainer(first: 100, after: $after, includePrivate: false, activeOnly: false) {
  pageInfo { hasNextPage endCursor }
  nodes { createdAt privacyLevel isActive isOneTimePayment tier { monthlyPriceInDollars } sponsorEntity { ... on User { login name } ... on Organization { login name } } } } } }`;

function ask(after) {
    const args = ['api', 'graphql', '-f', `query=${QUERY}`];
    if (after) args.push('-F', `after=${after}`);
    try {
        return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
        const text = `${error.stderr || ''}${error.stdout || ''}`;
        if (/INSUFFICIENT_SCOPES|required scopes/i.test(text)) {
            console.error('GitHub says this login lacks the read:user scope. Run once:\n  gh auth refresh -h github.com -s read:user\nthen run this again.');
        } else console.error(`gh failed: ${text.trim().slice(0, 300) || error.message}`);
        process.exit(1);
    }
}

/**
 * The pure part: pages through GitHub's answer (askPage(after) returns one parsed page) and
 * returns the cleaned wall rows. A sponsor already in `existing` keeps their linked profile;
 * anyone GitHub no longer lists (cancelled, or gone private) simply isn't in the result.
 */
export function collect(askPage, existing) {
    const profileOf = new Map(cleanSponsors(existing && existing.sponsors).filter((s) => s.profile).map((s) => [s.login.toLowerCase(), s.profile]));
    let rows = [];
    let after = null;
    for (let page = 0; page < 10; page += 1) {
        const json = askPage(after);
        if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 400));
        rows = rows.concat(parseSponsorshipsResponse(json));
        const info = json.data.viewer.sponsorshipsAsMaintainer.pageInfo;
        if (!info.hasNextPage) break;
        after = info.endCursor;
    }
    return cleanSponsors(rows.map((row) => ({ ...row, profile: profileOf.get(String(row.login).toLowerCase()) || null })));
}

function main() {
    const dry = process.argv.includes('--dry-run');
    const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    let sponsors;
    try { sponsors = collect(ask, existing); } catch (error) { console.error(error.message); process.exit(1); }
    const next = { schemaVersion: 1, updatedAt: new Date().toISOString().slice(0, 10), sponsors };
    console.log(`${sponsors.length} public sponsor(s) from GitHub; ${sponsors.filter((s) => s.profile).length} with a linked profile.`);
    if (dry) return console.log(JSON.stringify(next, null, 2));
    fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log('Wrote data/sponsors.json. Review the diff before committing.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
