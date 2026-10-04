import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHub, socialApi, discordLinkUrl, discordResult, discordUnlinkText, DISCORD_INVITE, DISCORD_ROLES } from '../scripts/social.js';

const ORIGIN = 'https://hub.example';
const reply = (status, data) => ({ ok: status < 400, status, json: async () => { if (data === undefined) throw new SyntaxError('no body'); return data; } });

test('the Link Discord button goes to the hub link route with an encoded return address', () => {
  assert.equal(
    discordLinkUrl('https://api.donavencrenshaw.com/', 'https://donavencrenshaw.com/account/#discord'),
    'https://api.donavencrenshaw.com/api/discord/link?return=https%3A%2F%2Fdonavencrenshaw.com%2Faccount%2F%23discord'
  );
  assert.equal(discordLinkUrl('http://127.0.0.1:3000', 'http://localhost:8080/account/'), 'http://127.0.0.1:3000/api/discord/link?return=http%3A%2F%2Flocalhost%3A8080%2Faccount%2F');
});

test('every code the hub redirects with has plain words; unknown codes are ignored', () => {
  for (const code of ['linked', 'denied', 'state_invalid', 'signin_required', 'wrong_account', 'already_linked', 'exchange_failed', 'discord_unreachable']) {
    const result = discordResult(code);
    assert.ok(result && result.text.length > 10, code);
    assert.ok(['ok', 'info', 'error'].includes(result.kind), code);
  }
  assert.equal(discordResult('linked').kind, 'ok');
  assert.equal(discordResult('denied').kind, 'info');
  assert.match(discordResult('already_linked').text, /already linked to another account/);
  for (const bad of ['', null, undefined, 'nope', 'toString', '__proto__', 'constructor']) assert.equal(discordResult(bad), null, String(bad));
});

test('the unlink message follows what the hub says about the roles', () => {
  assert.match(discordUnlinkText({ rolesRemoved: true }), /roles were removed/);
  assert.match(discordUnlinkText({ rolesRemoved: false }), /may still show/);
  assert.equal(discordUnlinkText({ rolesRemoved: null }), 'Unlinked.');
  assert.equal(discordUnlinkText(null), 'Unlinked.');
});

test('the card lists the roles and the invite is the community Discord', () => {
  assert.equal(DISCORD_INVITE, 'https://discord.gg/qjntnnd9cD');
  assert.equal(DISCORD_ROLES.length, 4);
});

test('status and unlink use the contract paths, methods and credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ path: url.slice(`${ORIGIN}/api`.length), method: init.method || 'GET', credentials: init.credentials });
    if (url.endsWith('/discord/status')) return reply(200, { enabled: true, roles: true });
    return reply(200, { discord: { linked: false }, rolesRemoved: true });
  };
  const api = socialApi(createHub(ORIGIN, { fetchImpl }));
  assert.deepEqual((await api.discordStatus()).data, { enabled: true, roles: true });
  assert.equal((await api.unlinkDiscord()).data.rolesRemoved, true);
  assert.deepEqual(calls, [
    { path: '/discord/status', method: 'GET', credentials: 'include' },
    { path: '/discord/link', method: 'DELETE', credentials: 'include' }
  ]);
});

test('a hub that is off or asleep gives no card: status failures are not enabled', async () => {
  const api = socialApi(createHub(ORIGIN, { fetchImpl: async () => { throw new TypeError('network'); } }));
  const res = await api.discordStatus();
  assert.equal(res.ok, false);
  assert.equal(res.offline, true);
});

test('the account page wires the Discord card: layout hooks exist and the script uses them', () => {
  const layout = fs.readFileSync(new URL('../src/layouts/account.ejs', import.meta.url), 'utf8');
  const script = fs.readFileSync(new URL('../scripts/account.js', import.meta.url), 'utf8');
  for (const hook of ['data-acct-discord', 'data-acct-discord-link', 'data-acct-discord-unlink', 'data-acct-discord-name', 'data-acct-discord-linked', 'data-acct-discord-actions']) {
    assert.ok(layout.includes(hook), `layout has ${hook}`);
    assert.ok(script.includes(`[${hook}]`), `script uses [${hook}]`);
  }
  assert.ok(layout.includes('data-acct-status="discord"'), 'layout has the status line');
  assert.ok(script.includes("note('discord'"), 'script writes to the status line');
  assert.match(layout, /<section[^>]*data-acct-discord hidden>/, 'the card starts hidden');
  assert.ok(layout.includes('https://discord.gg/qjntnnd9cD'), 'the join link');
  assert.match(script, /enabled !== true\) return;/, 'stays hidden unless the hub says enabled');
});

test('the privacy notice has the Discord subsection under Accounts and a fresh date', () => {
  const text = fs.readFileSync(new URL('../content/privacy.md', import.meta.url), 'utf8');
  // Fresh = at or after the day the Discord section was added; later edits bump the date.
  assert.ok((text.match(/^date: "(\d{4}-\d{2}-\d{2})"$/m) || [])[1] >= '2026-10-02', 'privacy date is current');
  const accounts = text.indexOf('<h2 id="accounts">');
  const discord = text.indexOf('### Discord');
  const next = text.indexOf('## underplain products');
  assert.ok(accounts > 0 && discord > accounts && discord < next, 'Discord sits inside Accounts');
  const section = text.slice(discord, next);
  for (const phrase of ['optional', 'Discord user id', 'identify', 'messages', 'email', 'only the Stardust roles', 'Unlink', 'deletes your Discord id']) {
    assert.ok(section.includes(phrase), phrase);
  }
});
