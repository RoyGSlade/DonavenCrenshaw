import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import { readList, lines, itemState, hubReason, isClosed, closesText, joinProblem, claimProblem, safeHref, OFFLINE_TEXT } from '../scripts/christmas-state.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

// A made-up hub answer, shaped like GET /list. No real list data lives in this public repo.
const answer = () => ({
    title: 'Test list', closes: '2026-12-26', sizes: ['Size A', 'Size B'], rules: 'Rule one\nRule two', priceLabel: 'approx., as of today',
    sections: [
        { id: 's1', title: 'First', blurb: 'About first', locked: false, items: [
            { id: 'a-one', name: 'Thing one (the big one)', why: 'Because', price: '~$1', link: 'https://shop.test/a', linkLabel: 'Shop', star: true, kit: false },
            { id: 'a-two', name: 'Thing two (instead of one)', why: 'Cheaper', price: '~$2', link: 'javascript:alert(1)', star: false, kit: false },
            { id: 'a-kit', name: 'Supply', why: 'Needs a printer', price: '~$3', link: 'http://insecure.test', linkLabel: 'Shop', star: false, kit: true },
            { id: 'a-lock', name: 'Refill', why: 'Needs a thing', price: '~$5', link: 'https://shop.test/r', linkLabel: 'Shop', needs: ['a-one'], ready: false },
            { id: 'a-lock2', name: 'Extra', why: 'Needs either', price: '~$6', link: 'https://shop.test/e', linkLabel: 'Shop', needs: ['a-one', 'a-two'], ready: false },
            { id: 'a-lock3', name: 'Hidden need', why: 'x', price: '~$7', link: 'https://shop.test/h', linkLabel: 'Shop', needs: ['not-sent'], ready: false }
        ] },
        { id: 's2', title: 'Locked one', locked: true, items: [{ id: 'b-one', name: 'Kit thing', why: 'Kit', price: '~$4', link: 'https://shop.test/b', linkLabel: 'Shop', star: true, kit: true }] },
        { id: 'empty', title: 'Nothing', items: [] }
    ],
    pairs: [['a-one', 'a-two']], taken: ['a-two', 7], mine: ['a-one'], covered: ['a-kit'], unlocked: true
});

test('readList keeps the hub order, drops empty sections and unsafe links', () => {
    const list = readList(answer());
    assert.deepEqual(list.sections.map((s) => s.id), ['s1', 's2']);
    const items = list.sections[0].items;
    assert.equal(items[0].link, 'https://shop.test/a');
    assert.equal(items[1].link, null);
    assert.equal(items[2].link, null);
    assert.equal(items[1].linkLabel, 'Store');
    assert.equal(list.sections[1].locked, true);
    assert.deepEqual(list.sizes, ['Size A', 'Size B']);
    assert.deepEqual(list.rules, ['Rule one', 'Rule two']);
    assert.match(list.priceNote, /approx\., as of today/);
    assert.equal(list.closes, '2026-12-26');
});

test('pick-one notes come from the pairs and name the partner without its parenthesis', () => {
    const items = readList(answer()).sections[0].items;
    assert.equal(items[0].pick, 'Pick one: this or Thing two, not both.');
    assert.equal(items[1].pick, 'Pick one: this or Thing one, not both.');
    assert.equal(items[2].pick, '');
});

test('item states: your claim wins, then taken, then covered', () => {
    const { claims } = readList(answer());
    assert.equal(claims.unlocked, true);
    assert.equal(itemState({ id: 'a-one' }, claims), 'mine');
    assert.equal(itemState({ id: 'a-two' }, claims), 'taken');
    assert.equal(itemState({ id: 'a-kit' }, claims), 'covered');
    assert.equal(itemState({ id: 'b-one', ready: true }, claims), 'open');
    assert.equal(itemState({ id: 'b-one' }, null), 'unknown');
    assert.equal(itemState({ id: 'a-lock', ready: false }, claims), 'locked');
    assert.equal(itemState({ id: 'a-one', ready: false }, claims), 'mine', 'a claim stays once made, even if its prerequisite is released');
    assert.equal(claims.taken.size, 1, 'non-string ids are ignored');
});

test('items that are not ready say what unlocks them, by the needed item names', () => {
    const items = readList(answer()).sections[0].items;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    assert.equal(byId['a-one'].ready, true);
    assert.equal(byId['a-lock'].ready, false);
    assert.equal(byId['a-lock'].lockNote, 'Unlocks once someone gets the Thing one');
    assert.equal(byId['a-lock2'].lockNote, 'Unlocks once someone gets the Thing one or the Thing two');
    assert.equal(byId['a-lock3'].lockNote, 'Unlocks once something it needs is claimed');
    assert.equal(byId['a-one'].lockNote, '');
});

test('a 409 shows the hub\'s own plain reason, and never a bare code', () => {
    assert.equal(claimProblem({ status: 409, data: { error: 'Get the soldering iron first.' } }), 'Get the soldering iron first.');
    assert.equal(claimProblem({ status: 409, data: { reason: 'Someone already has the filament dryer.' } }), 'Someone already has the filament dryer.');
    assert.equal(claimProblem({ status: 409, data: null, text: 'Needs a charger first.' }), 'Needs a charger first.');
    assert.match(claimProblem({ status: 409, data: { error: 'taken' } }), /took that one/);
    assert.equal(hubReason({ data: { message: 'x'.repeat(300) + ' y' } }), '');
});

test('readList survives junk', () => {
    const list = readList({ sections: 'x', sizes: 5, taken: 'a', unlocked: 'yes' });
    assert.deepEqual(list.sections, []);
    assert.deepEqual(list.sizes, []);
    assert.equal(list.claims.unlocked, false);
    assert.deepEqual(readList(null).sections, []);
    assert.deepEqual(lines({ Shirts: 'S' }), ['Shirts: S']);
});

test('the offline wording is the one Donaven asked for', () => {
    assert.equal(OFFLINE_TEXT, 'The list is offline right now; try again later.');
    assert.equal(joinProblem({ offline: true }), OFFLINE_TEXT);
    assert.equal(claimProblem({ offline: true }), OFFLINE_TEXT);
    assert.equal(joinProblem({ status: 429, text: 'Too many requests, slow down.' }), 'Too many requests, slow down.');
    assert.match(joinProblem({ status: 429, text: '' }), /Too many/);
    assert.match(claimProblem({ status: 409 }), /took that one/);
    assert.match(claimProblem({ status: 410 }), /closed/);
});

test('the close date is the end of the last day', () => {
    assert.equal(isClosed('2026-12-26', new Date(2026, 11, 26, 23, 59)), false);
    assert.equal(isClosed('2026-12-26', new Date(2026, 11, 27, 0, 0)), true);
    assert.equal(isClosed(''), false);
    assert.equal(closesText('2026-12-26'), 'December 26, 2026');
});

test('only https links survive', () => {
    assert.equal(safeHref('https://www.asus.com/x'), 'https://www.asus.com/x');
    assert.equal(safeHref('javascript:alert(1)'), null);
    assert.equal(safeHref('not a url'), null);
});

test('the page is a shell: intro, join form and states, with no list data', () => {
    const html = ejs.render(read('src/layouts/christmas.ejs'), {
        siteRoot: '/', hubUrl: 'https://api.donavencrenshaw.com', page: { skin: 'parent', branch: 'parent' },
        components: { head: '', nav: '', footer: '' }
    });
    assert.match(html, /Ask to join to see it\./);
    assert.match(html, /data-xm-form/);
    for (const state of ['guest', 'pending', 'approved', 'offline']) assert.match(html, new RegExp(`data-xm-only="${state}"`));
    assert.match(html, /The list is offline right now; try again later\./);
    assert.ok(!/data-item-id|data-section-id|\$\d|RTX|waist/.test(html));
});

test('no list data, ids or hub config in the public repo, and the script writes hub text with textContent only', () => {
    for (const file of ['data/christmas.json', 'data/christmas-hub-config.json', 'data/christmas-claims.json', 'scripts/christmas.mjs']) {
        assert.ok(!fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} must not exist`);
    }
    const sources = ['scripts/christmas.js', 'scripts/christmas-state.js', 'src/layouts/christmas.ejs', 'content/christmas.md'].map(read).join('\n');
    assert.ok(!/pc-motherboard|printer-h2s|solder-pinecil|Ryzen|ProArt|Bambu|Pinecil|Hakko|Mitutoyo/i.test(sources));
    const script = read('scripts/christmas.js');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(script));
    assert.ok(!/googleapis|gstatic|analytics/.test(script));
    assert.ok(!/kits\.json/.test(sources));
});
