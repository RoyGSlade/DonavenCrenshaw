// Content lane (round 2): the 15 quests in the new tone, their voice lines,
// skill gates and stat rolls, the story chain, and the three hangar shops.
// Pure modules, no browser. Reachability of every node and ending of every
// quest is in stardust-voyage-quests.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUESTS, QUEST_LIST } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';
import { SHOPS_DATA } from '../projects/Space-Shooter/voyage/quests/data/shops.js';
import { BADGES_DATA } from '../projects/Space-Shooter/voyage/quests/data/badges.js';
import { validateQuest, questLines, SPEAKERS, LINE_ID } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { startQuest, view, act, availability } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { contentLines } from '../projects/Space-Shooter/voyage/quests/lines.js';
import { emptySave, testCharacter, ITEMS, check, grant } from '../projects/Space-Shooter/voyage/quests/core.js';
import { SKILLS as SKILL_LIST } from '../projects/Space-Shooter/voyage/data.js';
import { cleanSave } from '../projects/Space-Shooter/voyage/save.js';
import { priceFor } from '../projects/Space-Shooter/voyage/economy.js';
import { shopView, buy, sell, tryDeal, equip, unequip, gearOf, loadout, priceAt, SHOP_IDS, GEAR } from '../projects/Space-Shooter/voyage/shops/shop.js';

const SKILLS = Object.fromEntries(SKILL_LIST.map((s) => [s.id, s]));
const root = new URL('../projects/Space-Shooter/voyage/quests/data/', import.meta.url);
const body = (file, marker) => {
  const src = readFileSync(fileURLToPath(new URL(file, root)), 'utf8');
  const at = src.indexOf(marker);
  assert.ok(at > 0, `${file}: ${marker}`);
  return JSON.parse(src.slice(at + marker.length).trim().replace(/;\s*$/, ''));
};
const captain = (stats = 3, extra = {}) => cleanSave({ ...emptySave(), money: 1000, character: testCharacter({ cha: stats, con: stats, dex: stats, wis: stats, str: stats }), ...extra });
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const choicesOf = (q) => Object.values(q.nodes).flatMap((n) => (n.choices || []).flatMap((c) => [c, ...(c.variants || [])]));
const gates = (req) => (req ? [req, ...(req.anyOf || [])] : []);

test('quest, speaker, badge and shop files are Studio data: strict JSON bodies', () => {
  for (const q of QUEST_LIST) assert.deepEqual(body(`quests/${q.id}.js`, 'export default '), JSON.parse(JSON.stringify(q)), q.id);
  assert.equal(body('speakers.js', 'export const SPEAKERS_DATA = ').version, 1);
  assert.equal(body('badges.js', 'export const BADGES_DATA = ').version, 1);
  assert.deepEqual(body('shops.js', 'export const SHOPS_DATA = '), JSON.parse(JSON.stringify(SHOPS_DATA)));
});

test('fifteen quests, five per giver, each with its own job kind, all valid', () => {
  assert.equal(QUEST_LIST.length, 15);
  for (const [id, giver] of Object.entries(QUEST_GIVERS)) {
    assert.equal(giver.quests.length, 5, id);
    for (const qid of giver.quests) assert.equal(QUESTS[qid].giver, id, qid);
  }
  for (const q of QUEST_LIST) assert.deepEqual(validateQuest(q), [], q.id);
  assert.ok(QUESTS['railgun-paper-trail'], 'the railgun quest stays');
  // The part types in use across the set: ship fights, on-foot fights, race legs, travel, events, puzzles, the riddle.
  const kinds = new Set(QUEST_LIST.flatMap((q) => Object.values(q.nodes).map((n) => (n.type === 'fight' ? `fight-${n.mode}` : n.type))));
  for (const k of ['fight-ship', 'fight-foot', 'race', 'travel', 'event', 'puzzle', 'riddle', 'branch']) assert.ok(kinds.has(k), k);
  const foot = QUEST_LIST.filter((q) => Object.values(q.nodes).some((n) => n.type === 'fight' && n.mode === 'foot'));
  const races = QUEST_LIST.filter((q) => Object.values(q.nodes).some((n) => n.type === 'race'));
  assert.ok(foot.length >= 6, `on-foot fights in ${foot.length} quests`);
  assert.ok(races.length >= 5, `race legs in ${races.length} quests`);
});

test('every ending has words; every win pays a reward moment and a badge that exists', () => {
  for (const q of QUEST_LIST) {
    const ends = Object.entries(q.nodes).filter(([, n]) => n.type === 'end');
    for (const [id, n] of ends) {
      assert.ok(n.text.length > 20, `${q.id}: ${id} has an ending beat`);
      if (n.result !== 'success') continue;
      assert.ok(Object.keys(n.reward || {}).some((k) => k !== 'unlocks'), `${q.id}: ${id} pays something`);
      const badges = (n.reward.unlocks || []).filter((u) => u.startsWith('badge:'));
      assert.deepEqual(badges, [`badge:${q.id === 'railgun-paper-trail' ? 'railgun' : q.id}`], `${q.id}: ${id}`);
      assert.ok(BADGES_DATA.badges[badges[0].slice(6)], badges[0]);
    }
  }
  // A badge lands on the account and survives a save round trip.
  const out = grant(captain(), { unlocks: ['badge:teapot'] });
  assert.ok(cleanSave(out.save).account.unlocks.includes('badge:teapot'));
});

test('every spoken node has a unique voice line with an emotion and direction; rolled fills carry audioText', () => {
  const { lines, errors } = questLines(QUEST_LIST);
  assert.deepEqual(errors, []);
  assert.ok(lines.length >= 150, `${lines.length} quest lines`);
  for (const q of QUEST_LIST) for (const [id, n] of Object.entries(q.nodes)) if ((n.type === 'dialogue' || n.type === 'end') && n.speaker) assert.ok(n.line, `${q.id}: ${id}`);
  const all = contentLines().lines;
  assert.equal(new Set(all.map((l) => l.id)).size, all.length, 'no id twice');
  for (const l of all) {
    assert.match(l.id, LINE_ID);
    assert.ok(SPEAKERS[l.speaker], `${l.id}: speaker`);
    assert.ok(l.text && l.direction && l.emotion, l.id);
    if (/\{[^}]+\}/.test(l.text)) assert.ok(l.audioText && !/[{}]/.test(l.audioText), `${l.id}: audioText`);
    if (!SPEAKERS[l.speaker].cast) assert.ok(l.name && SPEAKERS[l.speaker].design, `${l.id}: an extra has a name and a voice design`);
  }
  // The story's own shop lines are referenced, not copied.
  assert.equal(all.some((l) => l.id === 'mel.shop.1'), false);
  assert.ok(all.some((l) => l.id === 'chibby.shop.1'));
});

test('the view carries the stage direction and the voice line; a hull patch node heals the ship', () => {
  const q = QUESTS['cold-run'];
  const { run, save } = startQuest(q, captain(), { seed: 3 });
  const v = view(q, run, save);
  assert.equal(v.line, 'hask.cold-run.intro');
  assert.match(v.beat, /Deputy the cactus/);
  assert.doesNotMatch(v.text, /\{/, 'the caption is filled');
  const p = QUESTS['slow-parade'];
  let r = startQuest(p, captain(), { seed: 1 });
  const hurt = { ...r.run, node: 'patch', part: null, hull: 10 };
  const patchIndex = p.nodes.patch.choices.findIndex((c) => c.to === 'patched');
  const kit = cleanSave({ ...r.save, items: { 'hull-patch': 1 } });
  const out = act(p, hurt, kit, { type: 'choose', index: patchIndex });
  assert.equal(out.error, undefined);
  assert.equal(out.run.hull, 50, '+40 hull');
  assert.equal(out.save.items['hull-patch'], undefined, 'the patch is used up');
});

test('dice rule: stats never gate an option, they add to a fresh roll; the set has a gamble, a brawl and bad food', () => {
  for (const q of QUEST_LIST) for (const c of choicesOf(q)) for (const g of gates(c.requires)) assert.equal(g.stats, undefined, `${q.id}: ${c.label}`);
  const checks = QUEST_LIST.flatMap((q) => choicesOf(q).filter((c) => c.check).map((c) => ({ q: q.id, ...c.check })));
  assert.ok(checks.some((c) => c.tag === 'gamble'), 'a gamble');
  assert.ok(checks.some((c) => c.tag === 'brawl' && c.stat === 'str'), 'a brawl on Strength');
  assert.ok(checks.some((c) => c.tag === 'food' && c.stat === 'con'), 'bad food on Health');
  for (const c of checks) assert.ok(c.dc >= 6 && c.dc <= 10, `${c.q}: dc ${c.dc}`);
  // The attempt (contract section 6): 2d6 + (stat - 3), fresh every time.
  const strong = testCharacter({ cha: 3, con: 3, dex: 3, wis: 3, str: 6 });
  const r = check(strong, { stat: 'str', tag: 'brawl', dc: 8 }, () => 0);
  assert.deepEqual(r.dice, [1, 1]);
  assert.equal(r.total, 2 + 3, 'double one plus Strength 6');
  assert.equal(r.pass, false, 'a strong captain can still miss');
  const weak = testCharacter({ cha: 1, con: 1, dex: 1, wis: 1, str: 1 });
  assert.equal(check(weak, { stat: 'str', tag: 'brawl', dc: 11 }, () => 0.99).pass, true, 'a weak one can still land a double six');
});

test('skill gates: level 1 and level 2-3 doors, routes and options, shown with their level while locked', () => {
  const found = [];
  for (const q of QUEST_LIST) for (const c of choicesOf(q)) for (const g of gates(c.requires)) for (const [skill, level] of Object.entries(g.skills || {})) {
    found.push({ q: q.id, skill, level, hidden: Boolean(c.hideLocked) });
    assert.ok(SKILLS[skill] && level <= SKILLS[skill].max, `${q.id}: ${skill} ${level}`);
  }
  assert.ok(found.filter((g) => g.level === 1).length >= 5, 'level 1 gates');
  assert.ok(found.filter((g) => g.level >= 2).length >= 8, 'level 2-3 gates');
  assert.ok(found.some((g) => g.level === 3), 'a level 3 gate');
  assert.ok(new Set(found.map((g) => g.skill)).size >= 7, 'gates across the trees');
  assert.equal(found.filter((g) => g.hidden).length, 0, 'skill gates always show');
  assert.ok(new Set(found.map((g) => g.q)).size >= 12, 'most quests reward a skill');
  // Locked, a gate says what it needs, by level.
  const q = QUESTS['railgun-paper-trail'];
  const { run, save } = startQuest(q, captain(), { seed: 1 });
  const v = view(q, { ...run, node: 'steal-plan', part: null }, save);
  const door = v.choices.find((c) => /Hacker 2/.test(c.label));
  assert.equal(door.locked, true);
  assert.deepEqual(door.reasons, ['Needs Hacker rank 2.']);
  const skilled = cleanSave({ ...save, character: { ...save.character, earned: 10, skills: { hacker: 2 } } });
  assert.equal(view(q, { ...run, node: 'steal-plan', part: null }, skilled).choices.find((c) => /Hacker 2/.test(c.label)).locked, false);
});

test('story chain: three quests open after the first fragments and leave a lead; the Knock still counts five', () => {
  const chain = { 'dead-channel': 'fragment-1', 'warden-file': 'fragment-2', 'black-box': 'fragment-3' };
  for (const [id, flag] of Object.entries(chain)) {
    const q = QUESTS[id];
    assert.equal(availability(q, captain()).ok, false, `${id} is shut at first`);
    assert.equal(availability(q, captain(3, { flags: { [flag]: 1 } })).ok, true, `${id} opens with ${flag}`);
    for (const n of Object.values(q.nodes)) if (n.type === 'end' && n.result === 'success') assert.ok(Object.keys(n.reward.flags || {}).some((f) => f.startsWith('lead-')), `${id}: a lead`);
  }
  const fragments = new Set(QUEST_LIST.flatMap((q) => Object.values(q.nodes).flatMap((n) => Object.keys(n.reward?.flags || {}))).filter((f) => f.startsWith('fragment-')));
  assert.deepEqual([...fragments].sort(), ['fragment-1', 'fragment-2', 'fragment-3', 'fragment-4', 'fragment-5']);
  // Deadly jobs: only Black Lane and Black Box, and they say so.
  const deadly = QUEST_LIST.filter((q) => Object.values(q.nodes).some((n) => n.type === 'end' && n.death)).map((q) => q.id).sort();
  assert.deepEqual(deadly, ['black-box', 'black-lane']);
  for (const id of deadly) assert.match(QUESTS[id].summary, /Deadly/);
});

// ---- shops ------------------------------------------------------------------

test('shop data: three shops at the contract stations, real items, gear that fits the shooter', () => {
  assert.deepEqual(SHOP_IDS, ['mel', 'edna', 'chibby']);
  const stations = { mel: 'locker', edna: 'backroom', chibby: 'pad' };
  for (const id of SHOP_IDS) {
    const s = SHOPS_DATA.shops[id];
    assert.equal(s.station, stations[id]);
    assert.equal(s.keeper, id);
    assert.ok(s.lines.open?.line && s.lines.buy?.line && s.lines.broke?.line, `${id}: lines`);
    for (const e of s.stock) {
      assert.ok(ITEMS[e.item], `${id}: ${e.item}`);
      assert.ok(e.price.money > 0, `${id}: ${e.item} has a price`);
      for (const g of Object.keys(e.rep || {})) assert.ok(QUEST_GIVERS[g], g);
      for (const sk of Object.keys(e.requires?.skills || {})) assert.ok(SKILLS[sk], sk);
    }
    for (const b of s.buys) {
      assert.ok(ITEMS[b.item], b.item);
      const sold = SHOP_IDS.flatMap((k) => SHOPS_DATA.shops[k].stock).filter((e) => e.item === b.item);
      for (const e of sold) assert.ok(b.money < e.price.money / (e.qty || 1), `${id} never buys ${b.item} back for more than it sells`);
    }
  }
  for (const [id, g] of Object.entries(GEAR)) {
    assert.ok(ITEMS[id] && ITEMS[id].kind === 'gear', id);
    if (g.weapon) for (const k of ['damage', 'rate', 'speed', 'spread', 'life']) assert.ok(Number.isFinite(g.weapon[k]), `${id}.${k}`);
  }
  for (const d of SHOPS_DATA.shops.edna.deals) assert.ok(d.pass && d.fail && d.check.dc >= 6, d.id);
});

test('buying: core\'s price and spend, the shop\'s own discounts, limits, gates and rep effects', () => {
  const save = captain(3, { money: 500 });
  const before = structuredClone(save);
  const out = buy(save, 'mel', 'flak-vest');
  assert.equal(out.ok, true);
  assert.deepEqual(save, before, 'the save given is not changed');
  assert.equal(out.save.money, 500 - priceFor(save, 140));
  assert.equal(out.save.items['flak-vest'], 1);
  assert.equal(gearOf(out.save).armour, 'flak-vest', 'worn at once when the slot is empty');
  assert.equal(out.line, 'mel.shop.buy');
  const again = buy(out.save, 'mel', 'flak-vest');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'You have one.');
  // Stack items buy in their qty and stop at the cap.
  let s = captain(3, { money: 5000 });
  s = buy(s, 'chibby', 'scrap').save;
  assert.equal(s.items.scrap, 2);
  for (let i = 0; i < 9; i++) s = buy(s, 'mel', 'medkit').save;
  assert.equal(s.items.medkit, 9);
  assert.equal(buy(s, 'mel', 'medkit').ok, false);
  // Broke: no change, the keeper's line.
  const broke = buy(captain(3, { money: 5 }), 'chibby', 'circuit');
  assert.equal(broke.ok, false);
  assert.equal(broke.line, 'chibby.shop.broke');
  // Gates: rep for plate, a skill level for the longshot and Edna's railgun.
  assert.match(buy(save, 'mel', 'plated-coat').reason, /rep with Stationmaster Orrin Hask/);
  const view0 = shopView('edna', save);
  const gun = view0.stock.find((e) => e.item === 'railgun');
  assert.equal(gun.locked, true);
  assert.deepEqual(gun.reasons, ['Needs the Trader skill.']);
  const haggler = cleanSave({ ...captain(3, { money: 2000 }), character: { ...testCharacter({ cha: 3, con: 3, dex: 3, wis: 3 }), earned: 10, skills: { trader: 1 } }, rep: { hask: 30 } });
  const bought = buy(haggler, 'edna', 'railgun');
  assert.equal(bought.ok, true);
  assert.equal(bought.save.items.railgun, 1);
  assert.equal(bought.save.rep.hask, 24, 'the black market costs Guild rep');
});

test('Edna: her Charisma 6 boon and the teapot discount stack on core\'s price', () => {
  const plain = captain(3);
  const charming = cleanSave({ ...plain, character: { ...plain.character, stats: { ...plain.character.stats, cha: 6 } } });
  assert.equal(priceAt('edna', plain, 200), priceFor(plain, 200));
  assert.equal(priceAt('edna', charming, 200), Math.round(priceFor(charming, 200) * 0.9));
  const family = cleanSave({ ...charming, flags: { 'edna-teapot': 1 } });
  assert.equal(priceAt('edna', family, 200), Math.round(priceFor(family, 200) * 0.75));
  assert.equal(shopView('edna', family).discounts.length, 2);
  assert.equal(priceAt('mel', family, 200), priceFor(family, 200), 'other shops do not care');
});

test('Edna\'s risky deals: a fresh d6 + stat roll each time, either way it lands in the save', () => {
  const save = captain(3, { money: 200 });
  const lucky = tryDeal(save, 'edna', 'mystery-crate', { rng: seq(0.99) });
  assert.equal(lucky.ok, true);
  assert.equal(lucky.pass, true);
  assert.equal(lucky.save.items.circuit, 2);
  assert.equal(lucky.save.money, 200 - 60);
  assert.equal(lucky.line, 'edna.shop.lucky');
  const unlucky = tryDeal(save, 'edna', 'mystery-crate', { rng: seq(0) });
  assert.equal(unlucky.pass, false);
  assert.equal(unlucky.save.items.scrap, 3);
  assert.equal(unlucky.roll.total, unlucky.roll.roll + 0, 'Wisdom 3 adds nothing');
  const hot = tryDeal(cleanSave({ ...save, rep: { hask: 20 } }), 'edna', 'hot-crate', { rng: seq(0) });
  assert.equal(hot.save.rep.hask, 14);
  assert.equal(hot.save.money, 160, 'the fine');
  assert.equal(tryDeal(captain(3, { money: 5 }), 'edna', 'dice-with-edna').ok, false);
});

test('selling, wearing and the on-foot loadout', () => {
  let s = captain(3, { money: 2000, rep: { garrity: 50 } });
  assert.deepEqual(loadout(s).weapon.id, 'sidearm');
  assert.equal(loadout(s).weapon.damage, SHOPS_DATA.sidearm.damage);
  s = buy(s, 'mel', 'bolt-carbine').save;
  s = buy(s, 'mel', 'hardsuit').save;
  s = buy(s, 'mel', 'mag-boots').save;
  const kit = loadout(s);
  assert.equal(kit.weapon.id, 'bolt-carbine');
  assert.equal(kit.footHp, 55);
  assert.equal(kit.footSpeed, -0.02, 'hardsuit slower, mag boots quicker');
  assert.deepEqual(kit.tools, ['mag-boots']);
  s = buy(s, 'mel', 'flak-vest').save;
  assert.equal(gearOf(s).armour, 'hardsuit', 'a second armour waits in the locker');
  s = equip(s, 'flak-vest').save;
  assert.equal(loadout(s).footHp, 20);
  assert.equal(equip(s, 'mag-boots').ok, false, 'tools are not worn');
  s = unequip(s, 'weapon').save;
  assert.equal(loadout(s).weapon.id, 'sidearm');
  // The gear survives the save's cleaning and the account round trip.
  assert.deepEqual(gearOf(cleanSave(JSON.parse(JSON.stringify(s)))), gearOf(s));
  // Selling worn gear takes it off; the price is the shop's.
  const money = s.money;
  const sold = sell(s, 'mel', 'flak-vest');
  assert.equal(sold.ok, true);
  assert.equal(sold.save.money, money + 55);
  assert.equal(gearOf(sold.save).armour, null);
  assert.equal(sell(s, 'chibby', 'flak-vest').ok, false, 'Chibby does not buy gear');
  const scrapper = sell(captain(3, { items: { scrap: 3 } }), 'edna', 'scrap');
  assert.equal(scrapper.save.items.scrap, 2);
  assert.equal(scrapper.save.money, 1003);
  // The counter lists only what you can sell there.
  assert.deepEqual(shopView('chibby', captain(3, { items: { scrap: 1, railgun: 1 } })).buys.map((b) => b.item), ['scrap']);
});

test('shop items bought for quests open those quests\' options', () => {
  const asks = new Set(QUEST_LIST.flatMap((q) => choicesOf(q).flatMap((c) => gates(c.requires).flatMap((g) => Object.keys(g.items || {})))));
  const costs = new Set(QUEST_LIST.flatMap((q) => choicesOf(q).flatMap((c) => Object.keys(c.cost?.items || {}))));
  for (const id of ['breach-kit', 'scan-goggles', 'syndicate-codes', 'ghost-transponder']) assert.ok(asks.has(id), `${id} opens something`);
  for (const id of ['medkit', 'hull-patch', 'shield-cell']) assert.ok(costs.has(id), `${id} is spent in a job`);
});

test('the counters mount at the hangar\'s stations (mountStation) and unmount cleanly', async () => {
  const { registerShops } = await import('../projects/Space-Shooter/voyage/shops/ui.js');
  const mounted = [];
  const api = { mountStation: (station, view) => { const entry = { station, view }; mounted.push(entry); return () => mounted.splice(mounted.indexOf(entry), 1); } };
  const off = registerShops(api);
  assert.deepEqual(mounted.map((m) => [m.station, m.view.id]), [['locker', 'shop-mel'], ['backroom', 'shop-edna'], ['pad', 'shop-chibby']]);
  for (const m of mounted) assert.equal(typeof m.view.render, 'function');
  off();
  assert.equal(mounted.length, 0);
});
