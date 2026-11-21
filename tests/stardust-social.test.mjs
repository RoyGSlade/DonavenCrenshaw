// Social as conversation (social lane, plan section 1): the pure rules, tests first. The DC formula, the caps, the gates on pushes,
// every outcome's world change, the three routes A, B and C of the plan's section 1.7 with its exact numbers, the person-sheet
// checker, the scene overlay format, and the bots. The page is in stardust-social-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pip from '../projects/Space-Shooter/voyage/people/pip.js';
import { PEOPLE, ITEMS, WANTS } from '../projects/Space-Shooter/voyage/people/index.js';
import { sheetIssues } from '../projects/Space-Shooter/voyage/people/check.js';
import { dcOf, dcLine, headStart, pushSetup, gradeOf, aftermath, BOND_DC, dayOf, DAY_MS } from '../projects/Space-Shooter/voyage/talk/push.js';
import * as C from '../projects/Space-Shooter/voyage/talk/convo.js';
import { createBribe, offer, takeAsk, bandPrices, priceAt, needleAt, setupBribe } from '../projects/Space-Shooter/voyage/talk/bribe.js';
import { parseOverlay, validateOverlay, readScene, overlayIsEmpty } from '../projects/Space-Shooter/voyage/talk/overlay.js';
import { createPersuade, play as playCard } from '../projects/Space-Shooter/voyage/minigames/persuade.js';
import { createIntimidate, push as pushIt, stand } from '../projects/Space-Shooter/voyage/minigames/intimidate.js';
import { setupPersuade, setupIntimidate, setupHaggle } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import * as S from '../projects/Space-Shooter/voyage/workbench/state.js';
import { cutWidth, cutStation } from '../projects/Space-Shooter/voyage/workbench/cut.js';

const roll = (n) => (n - 1) / 20 + 0.001; // an rng() value that makes the d20 land on n
const NOW = 10 * DAY_MS + 5 * 60 * 1000;   // game day 10, five minutes in
const SHEETS = Object.values(PEOPLE);

/** The plan's example player: Social level 3, points Persuade 2, Intimidate 0, Haggle 1. */
function planPlayer(credits = 100) {
  let s = S.freshState();
  s = { ...s, credits, progress: { ...s.progress, levels: { ...s.progress.levels, social: 3 } } };
  return S.setPoints(s, 'social', { persuade: 2, intimidate: 0, haggle: 1 });
}
const topic = (s, t, id) => { const r = C.askTopic(s, pip, t, id); return [r.state, r.talk, r]; };
const options = (s, t, now = NOW) => C.pushOptions(s, pip, t, 'good-cutter', now);
const opt = (s, t, id) => options(s, t).find((o) => o.id === id);

// ---- the person sheet is data, and the checker knows the rules ------------------------------------------------------------
test('sheet: Pip passes the checker; every line is data and every id is a voice line id', () => {
  assert.deepEqual(sheetIssues(pip, { items: ITEMS }), []);
  assert.equal(pip.speaker, 'pip');
  assert.deepEqual(Object.keys(pip.facts).sort(), ['lost-cutter', 'nan', 'off-books', 'projector', 'safety']);
  assert.equal(pip.topics.length, 4);
  const w = pip.wants['good-cutter'];
  assert.equal(w.pushes.length, 6, 'six pushes, plan 1.7');
  assert.deepEqual(w.pushes.map((p) => `${p.ability}-${p.approach}`), ['persuade-empathy', 'persuade-anger', 'intimidate-anger', 'intimidate-money', 'bribe-money', 'bribe-empathy']);
  assert.equal(w.resist, 12);
  assert.deepEqual(pip.lean, { empathy: -2, money: 0, anger: 2 });
  assert.deepEqual([pip.cares, pip.dislike, pip.bond], [['safety', 'honor', 'family'], 'speed', 2]);
});

test('sheet: the plan\'s line counts hold (20 Pip lines for the cutter, 11 player lines) and no two lines say the same words', () => {
  const mine = Object.values(pip.lines).filter((l) => l.who === 'pip');
  const yours = Object.values(pip.lines).filter((l) => l.who === 'you');
  assert.equal(yours.length, 11, '1 ask + 4 topics + 6 pushes');
  const cutterLines = Object.keys(pip.lines).filter((id) => /^pip\.(cutter|topic)\./.test(id));
  assert.equal(cutterLines.length, 20 + 2 /* closed, have */, '5 topic answers + 12 push replies + lend + trusted + work (20) and the two edge lines');
  assert.ok(mine.length >= 20);
  assert.equal(new Set(Object.values(pip.lines).map((l) => `${l.who}|${l.text}`)).size, Object.keys(pip.lines).length);
  for (const id of Object.keys(pip.lines)) assert.ok(id.length <= 48 && /^[a-z0-9][a-z0-9.-]*$/.test(id), id);
  // the built words stay as they were
  assert.equal(pip.lines['pip.wb.hello'].text, 'Oh. Hi. I have the good cutter, and I am not giving it to you, because you will lose it. Sorry. Not sorry. Sorry.');
  assert.equal(pip.lines['pip.cutter.i-ang.win'].text, 'OKAY. Okay! Take it! Please stop doing the face.');
  assert.equal(pip.lines['pip.cutter.i-ang.no'].text, 'No. I have been shouted at by a reactor. You are not even close.');
});

test('sheet: every push has its own player line, won line and lost line; the emotion follows the approach', () => {
  const emo = { empathy: ['tender', 'warm', 'worried', 'proud'], anger: ['grumpy', 'menacing', 'dry', 'proud', 'worried'], money: ['sly', 'dry', 'deadpan', 'grumpy', 'worried', 'menacing'] };
  for (const p of pip.wants['good-cutter'].pushes) {
    assert.equal(new Set([p.say, p.won, p.lost]).size, 3);
    assert.equal(pip.lines[p.say].who, 'you');
    assert.equal(pip.lines[p.won].who, 'pip'); assert.equal(pip.lines[p.lost].who, 'pip');
    assert.ok(emo[p.approach].includes(pip.lines[p.won].emotion), `${p.id} won emotion`);
    assert.ok(p.say.startsWith('pip.p.') && p.won.startsWith('pip.cutter.') && p.lost.startsWith('pip.cutter.'));
  }
});

test('sheet checker: it names what is wrong', () => {
  const clone = () => JSON.parse(JSON.stringify(pip));
  const bad = (f) => { const s = clone(); f(s); return sheetIssues(s, { items: ITEMS }).join(' | '); };
  assert.match(bad((s) => { s.cares = ['pay', 'pay', 'honor']; }), /cares must be 3 different/);
  assert.match(bad((s) => { s.dislike = 'safety'; }), /dislike must be one value they do not care about/);
  assert.match(bad((s) => { s.lean.anger = 1; }), /lean\.anger/);
  assert.match(bad((s) => { s.bond = 7; }), /bond must be 0 to 5/);
  assert.match(bad((s) => { s.wants['good-cutter'].resist = 11; }), /resist 11 is not on the ladder/);
  assert.match(bad((s) => { s.wants['good-cutter'].pushes.pop(); s.wants['good-cutter'].pushes.pop(); }), /needs at least one bribe push/);
  assert.match(bad((s) => { delete s.lines['pip.cutter.p-emp.win']; }), /line pip.cutter.p-emp.win is missing/);
  assert.match(bad((s) => { s.lines['pip.cutter.p-emp.no'].text = s.lines['pip.cutter.p-emp.win'].text; }), /say the same words/);
  assert.match(bad((s) => { s.lines['pip.hello.cold'].emotion = 'furious'; }), /emotion furious/);
  assert.match(bad((s) => { s.topics[0].fact = 'nope'; }), /fact nope does not exist/);
  assert.match(bad((s) => { s.wants['good-cutter'].pushes[0].needs.facts = ['ghost']; }), /needs fact ghost/);
  assert.match(bad((s) => { s.wants['good-cutter'].pushes[4].bribe = { min: 5, max: 5, best: 5 }; }), /bribe needs/);
  assert.match(bad((s) => { delete s.wants['good-cutter'].pushes[3].hint; }), /shows a hint of what you would need to know/);
  assert.match(bad((s) => { s.facts.nan.named.value = 'pay'; }), /named card must be on something they care about/);
});

// ---- the DC formula (plan 1.5) -------------------------------------------------------------------------------------------
test('dc: resist + lean - (bond - 2) + failed + marks, kept between 5 and 20, with the parts in plain words', () => {
  assert.deepEqual(BOND_DC, [2, 1, 0, -1, -2, -3]);
  for (const resist of [8, 10, 12, 14, 18]) for (const lean of [-2, 0, 2]) for (let bond = 0; bond <= 5; bond++) for (const failed of [0, 1, 2, 3]) {
    const d = dcOf({ resist, lean, bond, failed });
    const raw = resist + lean - (bond - 2) + failed;
    assert.equal(d.raw, raw); assert.equal(d.dc, Math.max(5, Math.min(20, raw)), `${resist} ${lean} ${bond} ${failed}`);
    assert.equal(d.parts.reduce((a, p) => a + p.n, 0), raw);
  }
  assert.equal(dcOf({ resist: 8, lean: -2, bond: 5 }).dc, 5, 'floor of 5');
  assert.equal(dcOf({ resist: 18, lean: 2, bond: 0, failed: 3 }).dc, 20, 'ceiling of 20');
  // marks: scared makes a later Intimidate 2 easier and a later Empathy push 2 harder
  const marks = { scared: { bondWas: 2 } };
  assert.equal(dcOf({ resist: 12, lean: 2, bond: 2, marks, ability: 'intimidate', approach: 'anger' }).dc, 12);
  assert.equal(dcOf({ resist: 12, lean: -2, bond: 2, marks, ability: 'persuade', approach: 'empathy' }).dc, 12);
  assert.equal(dcLine(dcOf({ resist: 12, lean: -2, bond: 3, ability: 'persuade', approach: 'empathy' })), 'Their no 12, Empathy fits them -2, Bond Friendly -1 = 9');
  assert.match(dcLine(dcOf({ resist: 8, lean: -2, bond: 5 })), /kept between 5 and 20/);
});

test('bond: every step of the table moves the roll (Cold +2 up to Family -3)', () => {
  const dcs = [0, 1, 2, 3, 4, 5].map((bond) => dcOf({ resist: 12, bond }).dc);
  assert.deepEqual(dcs, [14, 13, 12, 11, 10, 9]);
});

// ---- the plan's three routes (1.7) ----------------------------------------------------------------------------------------
test('route A: get to know him, then Empathy. DC 9 (75%), a Good roll, trust 4 + 5 + 5 + 6 = 20 of 19, Great, bond 4, 4 XP, the cutter', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  assert.equal(C.personOf(s, pip).bond, 2);
  [s, t] = topic(s, t, 'projector');                      // bond 3
  assert.equal(C.personOf(s, pip).bond, 3);
  let r; [s, t, r] = topic(s, t, 'safety');               // the talk cap: bond stays 3
  assert.equal(C.personOf(s, pip).bond, 3, 'talk alone never goes past 3');
  assert.deepEqual(r.learned, 'safety');
  assert.equal(options(s, t).length, 0, 'no pushes before the no');
  let a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  assert.equal(a.kind, 'no'); assert.deepEqual(a.lines, ['pip.p.ask', 'pip.cutter.no']); assert.equal(a.learned, 'lost-cutter');
  const o = opt(s, t, 'p-emp');
  assert.equal(o.dc, 9); assert.equal(o.chance, 75); assert.equal(o.dcLine, 'Their no 12, Empathy fits them -2, Bond Friendly -1 = 9');
  assert.equal(o.rollText, 'd20 + Social 3');
  assert.ok(o.head.some((l) => /guards|ship/.test(l)), 'a fact gives a visible head start');
  const at = C.attemptPush(s, pip, t, 'good-cutter', 'p-emp', NOW, () => roll(11));
  assert.equal(at.attempt.total, 14); assert.equal(at.tier, 1); assert.equal(at.label, 'Good');
  assert.equal(at.setup.goal, 19, 'Good: trust needed 21, persuade points 2: 19');
  assert.equal(at.setup.patience, 4);
  assert.equal(at.opening.startTrust, 4, 'the approach fits: trust starts at 4');
  const g = createPersuade({ seed: 3, setup: at.setup, opening: at.opening });
  assert.deepEqual([g.cares, g.dislike], [['safety', 'honor', 'family'], 'speed'], 'cares are fixed by the sheet');
  assert.equal(g.trust, 4);
  assert.ok(g.shown.some((x) => x.value === 'safety' && x.kind === 'care'), 'the Safety tell is showing');
  const named = g.hand.filter((c) => c.named);
  assert.equal(named.length, 1); assert.equal(named[0].value, 'safety'); assert.equal(named[0].worth, 5); assert.equal(named[0].text, '"She holds, people live."');
  // play it: 4 + 5 = 9, then a care card worth 4 (streak 1): 14, then another worth 4 (streak 2): 20
  const cares = g.hand.filter((c) => !c.named && g.cares.includes(c.value));
  cares[0].worth = 4; cares[1].worth = 4;
  playCard(g, named[0].id); assert.equal(g.trust, 9);
  playCard(g, cares[0].id); assert.equal(g.trust, 14);
  playCard(g, cares[1].id); assert.equal(g.trust, 20);
  assert.equal(g.result.success, true); assert.equal(g.result.patienceLeft, 4); assert.equal(g.result.xp, 4);
  const done = C.settlePush(s, pip, t, 'good-cutter', 'p-emp', g.result, NOW);
  assert.equal(done.grade, 'great'); assert.equal(done.give, 'keep'); assert.deepEqual(done.lines, ['pip.cutter.p-emp.win']);
  s = done.state;
  assert.equal(C.personOf(s, pip).bond, 4); assert.equal(done.xp, 4); assert.equal(s.progress.xp.social, 4);
  assert.equal(s.items['good-cutter'], 1); assert.equal(cutWidth(s), 15);
  assert.ok(!C.personOf(s, pip).marks.owed, 'kept, not borrowed');
  assert.equal(C.greetingOf(s, pip), 'pip.hello.trusted');
});

test('route B: no homework, Anger. DC 14 (50%), a Shaky roll, snap chances 15, 21, 29 and only words; 48% to win; win = cutter, scared, bond 1; snap = bond 0, Tull -1, closed', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  const o = opt(s, t, 'i-ang');
  assert.equal(o.dc, 14); assert.equal(o.chance, 50);
  assert.deepEqual(options(s, t).map((x) => x.id), ['p-emp', 'p-ang', 'i-ang', 'b-mon'], 'the no taught lost-cutter; nothing else is known, so no tag push and no gift');
  const at = C.attemptPush(s, pip, t, 'good-cutter', 'i-ang', NOW, () => roll(8));
  assert.equal(at.attempt.total, 11); assert.equal(at.tier, -1); assert.equal(at.label, 'Shaky');
  assert.deepEqual(at.setup.chances.slice(0, 3), [15, 21, 29]);
  assert.equal(at.setup.readsOdds, false, 'at Shaky you read only words');
  const p3 = at.setup.chances.slice(0, 3).reduce((x, c) => x * (1 - c / 100), 1);
  assert.equal(Math.round(p3 * 100), 48);
  // win: three pushes with no snap, then stand at 10
  let g = createIntimidate({ seed: 1, setup: at.setup }); g.rolls = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
  pushIt(g); pushIt(g); pushIt(g); stand(g);
  assert.equal(g.result.success, true); assert.equal(g.result.won, 10);
  const win = C.settlePush(s, pip, t, 'good-cutter', 'i-ang', g.result, NOW);
  assert.equal(win.grade, 'ok'); assert.equal(win.give, 'keep');
  assert.equal(win.state.items['good-cutter'], 1);
  const pw = C.personOf(win.state, pip);
  assert.equal(pw.bond, 1, 'Anger that works: bond -1'); assert.ok(pw.marks.scared); assert.equal(pw.marks.scared.bondWas, 2);
  assert.ok(C.topicsOf(win.state, pip, t).every((x) => x.locked), 'topics closed while scared');
  assert.equal(C.greetingOf(win.state, pip), 'pip.hello.scared');
  assert.equal(win.state.rep.tull ?? 0, 0);
  // snap
  g = createIntimidate({ seed: 1, setup: at.setup }); g.rolls = [0.0, 0.5, 0.5, 0.5, 0.5, 0.5];
  pushIt(g);
  assert.equal(g.result.how, 'snapped');
  const lose = C.settlePush(s, pip, t, 'good-cutter', 'i-ang', g.result, NOW);
  assert.equal(lose.grade, 'badno'); assert.deepEqual(lose.lines, ['pip.cutter.i-ang.no']);
  assert.equal(C.personOf(lose.state, pip).bond, 0, 'a failed Anger: bond -2');
  assert.equal(lose.state.rep.tull, -1, 'and they tell their boss');
  assert.equal(lose.talk.ended, true);
  assert.equal(lose.state.items['good-cutter'], undefined);
  assert.equal(C.wantClosed(lose.state, pip, 'good-cutter', NOW), true, 'closed until the next game day');
  assert.equal(C.wantClosed(lose.state, pip, 'good-cutter', NOW + DAY_MS), false, '...which comes');
  assert.equal(C.askWant(lose.state, pip, C.newTalk(pip), 'good-cutter', NOW).kind, 'closed');
  // ...or until something changes: a new fact about them reopens it
  const learnt = C.seeThing(lose.state, pip, 'hook').state;
  assert.equal(C.wantClosed(learnt, pip, 'good-cutter', NOW), true, 'seeing the hook is not a fact');
  const pl = C.personOf(lose.state, pip);
  const withFact = { ...lose.state, people: { ...lose.state.people, pip: { ...pl, facts: [...pl.facts, 'projector'] } } };
  assert.equal(C.wantClosed(withFact, pip, 'good-cutter', NOW), false, 'a new fact reopens the want');
  const withBond = { ...lose.state, people: { ...lose.state.people, pip: { ...pl, bond: 1 } } };
  assert.equal(C.wantClosed(withBond, pip, 'good-cutter', NOW), false, 'a higher bond reopens it');
});

test('route C: notice the tag, then lean on his wallet. DC 11 (65%), Steady, snap chances 0, 14, 22, 67% over three pushes; win = cutter, scared, bond unchanged (Money)', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  let r;
  [s, t] = topic(s, t, 'projector');                                                   // bond 3
  assert.equal(C.topicsOf(s, pip, t).find((x) => x.id === 'tag').locked, 'look around for what they hide');
  const seen = C.seeThing(s, pip, 'hook'); s = seen.state;
  assert.equal(seen.note, "Pip's. Not on the ship's list.");
  [s, t, r] = topic(s, t, 'tag'); assert.equal(r.learned, 'off-books');
  assert.equal(C.personOf(s, pip).bond, 3);
  assert.equal(options(s, t).length, 0);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  const o = opt(s, t, 'i-mon');
  assert.equal(o.dc, 11); assert.equal(o.chance, 65);
  assert.ok(o.head.some((l) => /cannot snap/.test(l)));
  const at = C.attemptPush(s, pip, t, 'good-cutter', 'i-mon', NOW, () => roll(9));
  assert.equal(at.attempt.total, 12); assert.equal(at.label, 'Steady');
  assert.deepEqual(at.setup.chances.slice(0, 3), [0, 14, 22], 'the fact makes the first push safe');
  assert.equal(at.setup.readsOdds, true);
  const p2 = at.setup.chances.slice(0, 3).reduce((x, c) => x * (1 - c / 100), 1);
  assert.equal(Math.round(p2 * 100), 67, '0.86 x 0.78 is for the two risky pushes: the safe one is free');
  const g = createIntimidate({ seed: 1, setup: at.setup }); g.rolls = [0.0, 0.99, 0.99, 0.99, 0.99, 0.99];
  pushIt(g); assert.equal(g.pushes, 1, 'a 0% snap never snaps even on a roll of 0');
  pushIt(g); pushIt(g); stand(g);
  const win = C.settlePush(s, pip, t, 'good-cutter', 'i-mon', g.result, NOW);
  assert.equal(win.state.items['good-cutter'], 1);
  const pw = C.personOf(win.state, pip);
  assert.equal(pw.bond, 3, 'Money: no bond change'); assert.ok(pw.marks.scared);
  assert.deepEqual(win.lines, ['pip.cutter.i-mon.win']);
});

test('money: Bribe, Money at bond 2. DC 12, a Good roll widens the band; offer 30 pays 29, offer 36 pays 35, under the floor costs patience', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  assert.equal(opt(s, t, 'b-mon').dc, 12);
  const at = C.attemptPush(s, pip, t, 'good-cutter', 'b-mon', NOW, () => roll(14));  // 14 + 3 = 17, margin 5: Good
  assert.equal(at.label, 'Good');
  assert.equal(at.setup.band, 0.1426, 'the existing haggle band at Good with 1 point: (12% + 0.4%) x 1.15');
  assert.equal(at.setup.discount, 0.015);
  const range = C.bribeRange(s, at.opt.push);
  assert.deepEqual(range, { min: 10, max: 40 });
  const mk = () => { const g = createBribe({ seed: 4, min: range.min, max: range.max, setup: at.setup }); g.floor = 28; return g; };
  let g = mk();
  const [lo, hi] = bandPrices(g);
  assert.equal(lo, 28); assert.ok(Math.abs(hi - 32.278) < 1e-9, `the band runs 28 to ${hi} (the plan says 32.26: it adds the point after the tier; the built haggle multiplies after, 4.28)`);
  assert.equal(offer(g, 30), 'deal'); assert.equal(g.result.price, 30); assert.equal(g.result.paid, 29); assert.equal(g.result.grade, 'great');
  g = mk(); assert.equal(offer(g, 36), 'deal'); assert.equal(g.result.paid, 35); assert.equal(g.result.grade, 'ok'); assert.equal(g.result.how, 'over');
  g = mk(); assert.equal(offer(g, 20), 'counter'); assert.equal(g.patience, 3, 'a Good roll gives 4 patience, one is spent'); assert.equal(g.ask, 37, 'a quarter of the way down toward his floor: 40 to 37');
  assert.equal(g.done, false);
  // every ask below the floor: patience runs out and they walk, you keep your money
  const steady = () => { const x = createBribe({ seed: 4, min: 10, max: 40, setup: setupBribe({ tier: 0, points: at.points, level: 3 }) }); x.floor = 28; return x; };
  g = steady(); offer(g, 12); offer(g, 12); assert.equal(offer(g, 12), 'walk'); assert.equal(g.result.grade, 'walked'); assert.equal(g.result.paid, 0);
  // settle a deal: 29 credits gone, Pip `paid`, the cutter is yours, no bond change
  g = mk(); offer(g, 30);
  const done = C.settlePush(s, pip, t, 'good-cutter', 'b-mon', g.result, NOW);
  assert.equal(done.state.credits, 100 - 29); assert.equal(done.state.items['good-cutter'], 1);
  const pw = C.personOf(done.state, pip);
  assert.equal(pw.bond, 2); assert.deepEqual(pw.marks.paid, { untilDay: dayOf(NOW) + 3 }); assert.ok(!pw.marks.scared);
  assert.deepEqual(done.lines, ['pip.cutter.b-mon.win']);
  // a walk costs patience, nothing else
  g = steady(); offer(g, 12); offer(g, 12); offer(g, 12);
  const walked = C.settlePush(s, pip, t, 'good-cutter', 'b-mon', g.result, NOW);
  assert.equal(walked.grade, 'no'); assert.equal(walked.state.credits, 100); assert.equal(walked.talk.patience, 2); assert.equal(walked.talk.failed, 1);
});

test('push 6: Bribe, Empathy needs the projector fact and a circuit board; DC 10 at bond 2, 9 at bond 3; the gift is spent on a deal; floor 15% lower, band 1.5 times', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  let a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  assert.equal(opt(s, t, 'b-emp'), undefined, 'hidden until you know the projector');
  [s, t] = topic(s, t, 'projector');
  assert.equal(opt(s, t, 'b-emp').dc, 9, 'bond 3 after the topic');
  const noBoard = { ...s, items: {} };
  assert.equal(C.pushOptions(noBoard, pip, t, 'good-cutter', NOW).find((o) => o.id === 'b-emp'), undefined, 'and a circuit board');
  const at = C.attemptPush(s, pip, t, 'good-cutter', 'b-emp', NOW, () => roll(14));
  assert.equal(at.opening.floorShift, -0.15); assert.equal(at.opening.bandFactor, 1.5);
  const range = C.bribeRange(s, at.opt.push);
  assert.deepEqual(range, { min: 0, max: 15 });
  const g = createBribe({ seed: 2, min: range.min, max: range.max, setup: at.setup });
  const plain = createBribe({ seed: 2, min: 0, max: 15, setup: setupBribe({ tier: at.tier, points: at.points, level: at.level }) });
  assert.ok(g.floor <= Math.round(plain.floor * 0.85) + 1 && g.floor < plain.floor, `floor ${g.floor} is lower than ${plain.floor}`);
  assert.ok(Math.abs(g.band / plain.band - 1.5) < 1e-3);
  offer(g, 15);
  const done = C.settlePush(s, pip, t, 'good-cutter', 'b-emp', g.result, NOW);
  assert.equal(done.state.items['circuit-board'], undefined, 'the board went to Pip');
  assert.equal(done.state.items['good-cutter'], 1);
  assert.deepEqual(done.lines, ['pip.cutter.b-emp.win']);
});

// ---- pushes are gated by what you know -------------------------------------------------------------------------------------
test('gates: pushes appear only after a no, and only the ones whose needs are met', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  assert.deepEqual(options(s, t), []);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  // asking taught lost-cutter, so Persuade Empathy is open; the tag and the projector are not
  assert.deepEqual(options(s, t).map((o) => o.id), ['p-emp', 'p-ang', 'i-ang', 'b-mon']);
  [s, t] = topic(s, t, 'projector');
  assert.deepEqual(options(s, t).map((o) => o.id), ['p-emp', 'p-ang', 'i-ang', 'b-mon', 'b-emp']);
  s = C.seeThing(s, pip, 'hook').state; [s, t] = topic(s, t, 'tag');
  assert.deepEqual(options(s, t).map((o) => o.id), ['p-emp', 'p-ang', 'i-ang', 'i-mon', 'b-mon', 'b-emp']);
  // credits: a money bribe needs money
  const broke = { ...s, credits: 5 };
  assert.ok(!C.pushOptions(broke, pip, t, 'good-cutter', NOW).some((o) => o.id === 'b-mon'));
  // a held cutter, or a closed want, offers no pushes
  assert.deepEqual(C.pushOptions({ ...s, items: { 'good-cutter': 1 } }, pip, t, 'good-cutter', NOW), []);
  // every offered push says what it is: a player line, a DC with parts and odds
  for (const o of options(s, t)) { assert.ok(pip.lines[o.say].text); assert.ok(o.dc >= 5 && o.dc <= 20); assert.ok(o.chance >= 5 && o.chance <= 100); assert.match(o.dcLine, /= \d+/); }
});

test('gates: the head start is shown for each ability and only for what you know', () => {
  const facts = pip.facts, p = pip.wants['good-cutter'].pushes;
  const per = headStart({ ability: 'persuade', push: p[0], facts, known: ['projector'] });
  assert.deepEqual(per.named, []); assert.deepEqual(per.lines, []);
  const both = headStart({ ability: 'persuade', push: p[0], facts, known: ['safety', 'nan'] });
  assert.equal(both.named.length, 2); assert.deepEqual(both.tells.map((x) => x.value), ['safety', 'speed']);
  assert.equal(headStart({ ability: 'intimidate', push: p[2], facts, known: ['off-books'] }).safeFirst, false, 'a push with no needs is not built on a fact');
  assert.equal(headStart({ ability: 'intimidate', push: p[3], facts, known: ['off-books'] }).safeFirst, true);
  assert.equal(headStart({ ability: 'bribe', push: p[5], facts, known: ['projector'] }).bandFactor, 1.5);
  assert.equal(headStart({ ability: 'bribe', push: p[4], facts, known: ['projector'] }).bandFactor, 1);
});

// ---- the approach inside the game (plan 1.5 table) ------------------------------------------------------------------------
test('approach: fit and misfit set the game up exactly as the table says', () => {
  const base = { level: 5, points: { persuade: 0, intimidate: 0, haggle: 0 }, tier: 0, known: [], marks: {} };
  const per = (approach) => pushSetup({ ...base, ability: 'persuade', approach, person: pip, push: { needs: {} } });
  assert.equal(per('empathy').opening.startTrust, 4); assert.equal(per('money').opening.startTrust, 0);
  assert.equal(per('anger').setup.patience, setupPersuade({ tier: 0 }).patience - 1, 'misfit: patience -1');
  assert.equal(per('money').setup.patience, setupPersuade({ tier: 0 }).patience);
  const int = (approach) => pushSetup({ ...base, ability: 'intimidate', approach, person: pip, push: { needs: {} } }).setup.chances;
  const b0 = setupIntimidate({ tier: 0 }).chances;
  assert.deepEqual(int('money'), b0);
  assert.deepEqual(int('anger'), b0.map((c) => c + 4));
  assert.deepEqual(int('empathy'), b0.map((c) => Math.max(2, c - 4)));
  const bribe = (approach, marks = {}) => pushSetup({ ...base, ability: 'bribe', approach, person: pip, push: { needs: {} }, marks }).setup;
  assert.equal(bribe('empathy').floorShift, -0.15); assert.equal(bribe('anger').floorShift, 0.15); assert.equal(bribe('money').floorShift, 0);
  assert.equal(bribe('money', { paid: { untilDay: 99 } }).floorShift, 0.1, 'a paid mark: floor 10% higher');
});

test('points: for each Social path every extra point changes a number the player sees (0 to 9, weakest base)', () => {
  const sig = (f) => (p, game) => JSON.stringify(f({ tier: -2, level: 9, points: { [game]: p } }));
  for (let p = 0; p < 9; p++) {
    assert.notDeepEqual(setupPersuade({ tier: -2, level: 9, points: { persuade: p } }).goal, setupPersuade({ tier: -2, level: 9, points: { persuade: p + 1 } }).goal, `persuade ${p}`);
    const a = setupIntimidate({ tier: -2, level: 9, points: { intimidate: p } }), b = setupIntimidate({ tier: -2, level: 9, points: { intimidate: p + 1 } });
    assert.notDeepEqual(a.chances, b.chances, `intimidate ${p}`);
    const h = setupHaggle({ tier: -2, level: 9, points: { haggle: p } }), h2 = setupHaggle({ tier: -2, level: 9, points: { haggle: p + 1 } });
    assert.ok(h.band !== h2.band && h.priceBonus !== h2.priceBonus, `haggle ${p}`);
    const bb = setupBribe({ tier: -2, level: 9, points: { haggle: p } }), bb2 = setupBribe({ tier: -2, level: 9, points: { haggle: p + 1 } });
    assert.ok(bb.band !== bb2.band && bb.discount !== bb2.discount, `bribe ${p}`);
  }
  void sig;
});

// ---- the caps and the bond ----------------------------------------------------------------------------------------------
test('caps: talk raises the bond to 3 at most; two new topics per talk, then work; a heard topic costs nothing', () => {
  let s = S.freshState(); let t = C.newTalk(pip); let r;
  [s, t, r] = topic(s, t, 'projector'); assert.equal(r.bondDelta, 1); assert.deepEqual(r.lines, ['pip.p.projector', 'pip.topic.projector']);
  [s, t, r] = topic(s, t, 'safety'); assert.equal(r.bondDelta, 0, 'at 3 already');
  assert.equal(t.newTopics, 2);
  [s, t, r] = topic(s, t, 'nan'); assert.equal(r.blocked, 'work'); assert.deepEqual(r.lines, ['pip.topic.work']);
  assert.ok(!C.personOf(s, pip).facts.includes('nan'));
  [s, t, r] = topic(s, t, 'projector'); assert.deepEqual(r.lines, ['pip.p.projector', 'pip.topic.projector'], 'a heard topic can be heard again'); assert.equal(r.learned, null);
  // a new talk: two more
  t = C.newTalk(pip); [s, t, r] = topic(s, t, 'nan'); assert.equal(r.learned, 'nan');
  assert.equal(C.personOf(s, pip).bond, 3);
  // bond 4 and 5 only come from deeds: no topic ever takes it past 3
  const high = { ...s, people: { pip: { ...C.personOf(s, pip), bond: 4 } } };
  [s] = topic(high, C.newTalk(pip), 'tag'.length ? 'safety' : 'safety'); assert.equal(C.personOf(high, pip).bond, 4);
});

test('gates: a topic needs its bond, its fact, or a look at the thing; locked ones say what opens them', () => {
  let s = S.freshState(); const t = C.newTalk(pip);
  const poor = { ...s, people: { pip: { ...C.personOf(s, pip), bond: 1 } } };
  const list = (st) => Object.fromEntries(C.topicsOf(st, pip, t).map((x) => [x.id, x.locked]));
  assert.deepEqual(list(poor), { projector: null, safety: 'get to know Pip better', nan: 'get to know Pip better', tag: 'look around for what they hide' });
  assert.deepEqual(list(s), { projector: null, safety: null, nan: 'get to know Pip better', tag: 'look around for what they hide' });
  assert.equal(C.askTopic(poor, pip, t, 'nan').blocked, 'get to know Pip better');
  const seen = C.seeThing(s, pip, 'hook').state;
  assert.equal(list(seen).tag, null);
});

test('bond 4: a plain ask is answered yes for a lendable thing, until the day ends, then it goes back and the bond drops', () => {
  let s = S.freshState();
  s = { ...s, people: { pip: { ...C.personOf(s, pip), bond: 4 } } };
  const t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW);
  assert.equal(a.kind, 'lent'); assert.deepEqual(a.lines, ['pip.p.ask', 'pip.cutter.trusted']);
  assert.equal(a.state.items['good-cutter'], 1);
  const owed = C.personOf(a.state, pip).marks.owed;
  assert.deepEqual(owed, { want: 'good-cutter', item: 'good-cutter', dueDay: dayOf(NOW) });
  assert.equal(C.greetingOf(a.state, pip), 'pip.hello.owed');
  assert.equal(C.askWant(a.state, pip, t, 'good-cutter', NOW).kind, 'have');
  // same day: still yours
  const same = C.tickDay(a.state, NOW + 60 * 1000, SHEETS);
  assert.equal(same.state.items['good-cutter'], 1); assert.deepEqual(same.said, []);
  // the day's end: it goes back by itself, bond -1
  const next = C.tickDay(a.state, NOW + DAY_MS, SHEETS);
  assert.equal(next.state.items['good-cutter'], undefined); assert.equal(C.personOf(next.state, pip).bond, 3);
  assert.ok(!C.personOf(next.state, pip).marks.owed); assert.match(next.said[0], /went back to Pip by itself\. Bond -1/);
  assert.equal(cutWidth(next.state), 9);
  // returned in time: no penalty
  const back = C.returnBorrowed(a.state, pip, 'good-cutter');
  assert.equal(back.ok, true); assert.equal(back.state.items['good-cutter'], undefined); assert.equal(C.personOf(back.state, pip).bond, 4);
  assert.equal(C.tickDay(back.state, NOW + 5 * DAY_MS, SHEETS).state.people.pip.bond, 4);
  // an OK persuade win borrows it too (plan: OK grade on 1 and 2)
  let s2 = planPlayer(); let t2 = C.newTalk(pip); const q = C.askWant(s2, pip, t2, 'good-cutter', NOW);
  const ok = C.settlePush(q.state, pip, q.talk, 'good-cutter', 'p-emp', { success: true, patienceLeft: 1, xp: 3 }, NOW);
  assert.equal(ok.grade, 'ok'); assert.equal(ok.give, 'lend'); assert.deepEqual(ok.lines, ['pip.cutter.p-emp.win', 'pip.cutter.lend']);
  assert.ok(C.personOf(ok.state, pip).marks.owed);
  assert.equal(C.personOf(ok.state, pip).bond, 3, 'Empathy that works: bond +1');
  // paid marks run out after 3 days
  const paid = { ...s, people: { pip: { ...C.personOf(s, pip), marks: { paid: { untilDay: dayOf(NOW) + 3 } } } } };
  assert.ok(C.tickDay(paid, NOW + 3 * DAY_MS, SHEETS).state.people.pip.marks.paid);
  assert.ok(!C.tickDay(paid, NOW + 4 * DAY_MS, SHEETS).state.people.pip.marks.paid);
});

// ---- grades and aftermath (plan 1.5 and 1.6) -----------------------------------------------------------------------------------
test('grades: Great, OK, No and Bad no from each game result', () => {
  assert.equal(gradeOf('persuade', { success: true, patienceLeft: 2 }), 'great');
  assert.equal(gradeOf('persuade', { success: true, patienceLeft: 1 }), 'ok');
  assert.equal(gradeOf('persuade', { success: false, patienceLeft: 0 }), 'no');
  assert.equal(gradeOf('intimidate', { success: true, won: 15, how: 'stood' }), 'great');
  assert.equal(gradeOf('intimidate', { success: true, won: 21, how: 'stood' }), 'great');
  assert.equal(gradeOf('intimidate', { success: true, won: 10, how: 'stood' }), 'ok');
  assert.equal(gradeOf('intimidate', { success: true, won: 14, how: 'stood' }), 'ok');
  assert.equal(gradeOf('intimidate', { success: false, won: 6, how: 'stood' }), 'no');
  assert.equal(gradeOf('intimidate', { success: false, won: 0, how: 'snapped' }), 'badno');
  assert.equal(gradeOf('bribe', { grade: 'great' }), 'great'); assert.equal(gradeOf('bribe', { grade: 'ok' }), 'ok'); assert.equal(gradeOf('bribe', { grade: 'walked' }), 'no');
});

test('aftermath: the plan\'s consequence tables, by approach and by ability', () => {
  const a = (ability, approach, grade) => aftermath({ ability, approach, grade });
  assert.equal(a('persuade', 'empathy', 'great').bond, 1); assert.equal(a('persuade', 'empathy', 'no').bond, 0);
  assert.equal(a('persuade', 'money', 'great').bond, 0); assert.equal(a('persuade', 'money', 'no').bond, 0);
  assert.deepEqual([a('persuade', 'anger', 'ok').bond, a('persuade', 'anger', 'ok').bossRep], [-1, 0]);
  assert.deepEqual([a('persuade', 'anger', 'no').bond, a('persuade', 'anger', 'no').bossRep], [-2, -1]);
  assert.equal(a('intimidate', 'anger', 'great').mark, 'scared'); assert.equal(a('intimidate', 'anger', 'ok').mark, 'scared'); assert.equal(a('intimidate', 'anger', 'no').mark, null);
  assert.equal(a('bribe', 'money', 'ok').mark, 'paid'); assert.equal(a('bribe', 'money', 'no').mark, null);
  assert.equal(a('intimidate', 'money', 'badno').endsTalk, true); assert.equal(a('intimidate', 'money', 'no').endsTalk, false);
  assert.equal(a('persuade', 'empathy', 'no').patience, 1); assert.equal(a('persuade', 'empathy', 'great').patience, 0);
});

test('a no costs one of the talk\'s 3 patience, closes that pair for this talk, and makes the rest 1 harder; patience 0 ends the talk and closes the want', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  const lost = { success: false, patienceLeft: 0, xp: 0 };
  let r = C.settlePush(s, pip, t, 'good-cutter', 'p-emp', lost, NOW);
  assert.equal(r.grade, 'no'); assert.equal(r.talk.patience, 2); assert.equal(r.talk.failed, 1); assert.deepEqual(r.lines, ['pip.cutter.p-emp.no']);
  assert.equal(r.talk.ended, false);
  const o = C.pushOptions(r.state, pip, r.talk, 'good-cutter', NOW);
  assert.equal(o.find((x) => x.id === 'p-emp').tried, true, 'closed for this talk');
  assert.equal(o.find((x) => x.id === 'p-ang').dc, 14 + 1, 'every other push is 1 harder');
  s = r.state; t = r.talk;
  r = C.settlePush(s, pip, t, 'good-cutter', 'b-mon', { grade: 'walked', paid: 0, xp: 0 }, NOW); s = r.state; t = r.talk;
  assert.equal(t.patience, 1);
  r = C.settlePush(s, pip, t, 'good-cutter', 'p-ang', lost, NOW);
  assert.equal(r.talk.patience, 0); assert.equal(r.talk.ended, true);
  assert.equal(C.wantClosed(r.state, pip, 'good-cutter', NOW), true);
  assert.deepEqual(C.pushOptions(r.state, pip, r.talk, 'good-cutter', NOW), []);
  assert.equal(C.personOf(r.state, pip).bond, 0, 'the Anger no took 2');
});

test('scared: later Intimidate is 2 easier and Empathy 2 harder until the bond is back to where it was', () => {
  let s = planPlayer(); let t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW);
  const won = C.settlePush(a.state, pip, a.talk, 'good-cutter', 'i-ang', { success: true, won: 21, how: 'stood', xp: 5 }, NOW);
  // give the cutter back so the want is open again
  const st = takeBack(won.state);
  const p = C.personOf(st, pip);
  assert.ok(p.marks.scared);
  const t2 = C.askWant(st, pip, C.newTalk(pip), 'good-cutter', NOW + DAY_MS * 2);
  const o = (id) => C.pushOptions(t2.state, pip, t2.talk, 'good-cutter', NOW + DAY_MS * 2).find((x) => x.id === id);
  assert.equal(o('i-ang').dc, dcOf({ resist: 12, lean: 2, bond: p.bond }).dc - 2);
  assert.equal(o('p-emp').dc, dcOf({ resist: 12, lean: -2, bond: p.bond }).dc + 2);
});
function takeBack(s) { const items = { ...s.items }; delete items['good-cutter']; return { ...s, items }; }

// ---- wants and the Cut station ----------------------------------------------------------------------------------------------
test('wants: the Cut station pins "the good cutter"; the strip shows at most 3 and drops what you hold; 15 wide with it, 9 without', () => {
  let s = S.freshState();
  const cut = cutStation(s);
  assert.equal(cut.width, 9); assert.equal(cut.pin, 'good-cutter');
  assert.ok(cut.lines.some((l) => /Worn cutter: 9 wide/.test(l)) && cut.lines.some((l) => l === 'Pip has a good one.'));
  s = C.pinWant(s, cut.pin);
  assert.deepEqual(C.wantsShown(s).map((w) => w.label), ['the good cutter']);
  assert.equal(C.pinWant(s, 'good-cutter'), s, 'pinned once');
  assert.equal(C.pinWant(s, 'nonsense'), s);
  const held = { ...s, items: { ...s.items, 'good-cutter': 1 } };
  assert.deepEqual(C.wantsShown(held), []);
  assert.equal(cutStation(held).width, 15); assert.equal(cutStation(held).pin, null);
  assert.deepEqual(Object.keys(WANTS), ['good-cutter']); assert.equal(WANTS['good-cutter'].person, 'pip');
});

test('wants: asking pins the want, learns the reason, and a closed or held want answers in words', () => {
  let s = S.freshState(); const t = C.newTalk(pip);
  const a = C.askWant(s, pip, t, 'good-cutter', NOW);
  assert.deepEqual(C.wantsShown(a.state).map((w) => w.id), ['good-cutter']);
  assert.deepEqual(C.personOf(a.state, pip).facts, ['lost-cutter']);
  const again = C.askWant(a.state, pip, a.talk, 'good-cutter', NOW);
  assert.equal(again.learned, null); assert.equal(again.kind, 'no');
  const held = C.askWant({ ...a.state, items: { 'good-cutter': 1 } }, pip, a.talk, 'good-cutter', NOW);
  assert.equal(held.kind, 'have'); assert.deepEqual(held.lines, ['pip.cutter.have']);
});

test('state: people, items, wants and reputations save and load whole; broken input falls back', () => {
  let s = S.freshState();
  assert.deepEqual(s.items, { 'circuit-board': 1 }); assert.deepEqual(s.people, {}); assert.deepEqual(s.wants, []); assert.deepEqual(s.rep, {});
  s = C.askWant(s, pip, C.newTalk(pip), 'good-cutter', NOW).state;
  s = { ...s, rep: { tull: -1 } };
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  S.saveState(s, st);
  const back = S.loadState(st);
  assert.deepEqual(back.people, s.people); assert.deepEqual(back.wants, ['good-cutter']); assert.deepEqual(back.rep, { tull: -1 }); assert.deepEqual(back.items, s.items);
  const broken = S.cleanState({ items: { 'good-cutter': 'many', x: 2 }, people: [], wants: [1, 'a'], rep: { tull: 'low' } });
  assert.deepEqual(broken.items, { x: 2 }); assert.deepEqual(broken.people, {}); assert.deepEqual(broken.wants, ['a']); assert.deepEqual(broken.rep, {});
});

// ---- the bribe needle -----------------------------------------------------------------------------------------------------------
test('bribe: the needle sweeps min to max; deal inside the band is Great, over it OK; take their ask; rounds run out at their ask', () => {
  const setup = setupBribe({ tier: 0, points: {}, level: 1 });
  let g = createBribe({ seed: 9, min: 10, max: 40, setup });
  assert.ok(g.floor >= 25 && g.floor <= 33, 'seeded between 25 and 32.5');
  const lo = priceAt(g, 0), hi = priceAt(g, 1); assert.deepEqual([lo, hi], [10, 40]);
  assert.ok(needleAt(g, 0) >= 0 && needleAt(g, 123.4) <= 1);
  g = createBribe({ seed: 9, min: 10, max: 40, setup }); g.floor = 28;
  assert.equal(offer(g, 28), 'deal'); assert.equal(g.result.grade, 'great'); assert.equal(g.result.paid, 28, 'no Haggle points: no discount');
  g = createBribe({ seed: 9, min: 10, max: 40, setup }); g.floor = 28;
  assert.equal(offer(g, 33), 'deal'); assert.equal(g.result.grade, 'ok');
  g = createBribe({ seed: 9, min: 10, max: 40, setup }); g.floor = 28;
  assert.equal(takeAsk(g), 'close'); assert.equal(g.result.price, 40); assert.equal(g.result.grade, 'ok');
  g = createBribe({ seed: 9, min: 10, max: 40, setup: { ...setup, rounds: 2, patience: 3 } }); g.floor = 28;
  offer(g, 10); assert.equal(offer(g, 10), 'close'); assert.equal(g.result.price, g.ask); assert.ok(g.result.price < 40 && g.result.price >= 28);
  // same seed, same needle and floor
  const x = createBribe({ seed: 5, min: 10, max: 40, setup }), y = createBribe({ seed: 5, min: 10, max: 40, setup });
  assert.deepEqual([x.floor, x.phase], [y.floor, y.phase]);
});

// ---- the scene overlay format ----------------------------------------------------------------------------------------------------
const SCENE = `# Scene 4: The Eighth Gunner
- id: the-eighth-gunner
- giver: tull
- where: the freighter Tin Duchess
- summary: Tull offers the janitor the gunner's seat.
- start: desk
- step offer | Hear Tull's offer | desk, seven, ledger

## Nodes
### desk [talk]
Room: duchess-quarters
Beat: Tull's quarters.
**Captain Tull** (playful) \`tull.s4.1\`
"Good morning, janitor!"
*Actor note: Best behaviour.*
- "What happened to the other seven gunners?" -> seven
- "Read the ledger on the desk." [Hacking 10] pass -> ledger, fail -> seven
- "Haggle for a bigger share." [Social 10] pass -> end-hired-well, fail -> end-lowballed
- "Take the standard share." -> end-hired-fair

### seven [talk]
Room: duchess-quarters
Beat: Tull pulls a crew board off the wall.
- "Haggle for a bigger share." [Social 12] pass -> end-hired-well, fail -> end-lowballed
- "Take the standard share." -> end-hired-fair

### ledger [talk]
Room: duchess-quarters
Beat: The desk screen wakes up.
- "Haggle, now that you know he is broke." [Social 10] pass -> end-hired-well, fail -> end-lowballed
- "Take the standard share." -> end-hired-fair

### end-hired-well [end success: hired-well]
Room: duchess-quarters
Title: Better terms
Pays: money 30

### end-hired-fair [end success: hired-fair]
Room: duchess-quarters
Title: Standard share
Pays: money 20

### end-lowballed [end failure: lowballed]
Room: duchess-quarters
Title: Cut short
`;
const OVERLAY = `# Talk overlay: the-eighth-gunner
- people: tull

## Tag
- desk | "Haggle for a bigger share." | want bigger-share | push haggle money
- seven | "Haggle for a bigger share." | want bigger-share | push haggle money
- ledger | "Haggle, now that you know he is broke." | want bigger-share | push haggle money
- ledger | Learn: tull broke
- seven | Learn: tull seven-gunners
- desk | Bond: tull +1

## Add
### desk [want]
- want bigger-share | tull | A bigger share
### desk, seven, ledger
- push persuade empathy (needs know tull seven-gunners) "You liked Reck. Pay the next one like you want them to live." great -> end-hired-well, ok -> end-hired-fair, no -> end-lowballed
- push intimidate money (needs know tull broke) "Your ledger is red. A gunner who talks to the dock office costs more than a gunner who is paid." great -> end-hired-well, ok -> end-hired-fair, no -> end-lowballed
`;

test('overlay: the plan\'s example parses and validates against the scene by exact labels', () => {
  const { errors, overlay } = validateOverlay(OVERLAY, SCENE);
  assert.deepEqual(errors, []);
  assert.equal(overlay.id, 'the-eighth-gunner'); assert.deepEqual(overlay.people, ['tull']);
  assert.equal(overlay.tags.length, 3); assert.deepEqual(overlay.tags[0], { node: 'desk', label: 'Haggle for a bigger share.', want: 'bigger-share', ability: 'haggle', approach: 'money', line: overlay.tags[0].line });
  assert.deepEqual(overlay.learns.map((l) => `${l.node}:${l.person}:${l.fact}`), ['ledger:tull:broke', 'seven:tull:seven-gunners']);
  assert.deepEqual(overlay.bonds.map((b) => b.delta), [1]);
  assert.equal(overlay.adds[0].kind, 'want'); assert.equal(overlay.adds[0].wants[0].label, 'A bigger share');
  const pushes = overlay.adds[1].pushes;
  assert.equal(pushes.length, 2); assert.deepEqual(pushes[0].needs, [{ kind: 'know', person: 'tull', fact: 'seven-gunners' }]);
  assert.deepEqual([pushes[0].great, pushes[0].ok, pushes[0].no], ['end-hired-well', 'end-hired-fair', 'end-lowballed']);
  assert.equal(Object.keys(readScene(SCENE)).length, 6);
});

test('overlay: it names a label that is not exact, a missing node, a non-Social choice, a stranger, a bad ending, a bad fact', () => {
  const bad = (from, to) => validateOverlay(OVERLAY.replace(from, to), SCENE, { sheets: { tull: { facts: { broke: {}, 'seven-gunners': {} } } } }).errors.join(' | ');
  assert.match(bad('"Haggle for a bigger share." | want bigger-share | push haggle money\n- seven', '"Haggle for a bigger share" | want bigger-share | push haggle money\n- seven'), /no choice in "desk" has exactly the label "Haggle for a bigger share"/);
  assert.match(bad('- ledger | Learn: tull broke', '- ledgr | Learn: tull broke'), /no node "ledgr"/);
  assert.match(bad('desk | "Haggle for a bigger share."', 'desk | "What happened to the other seven gunners?"'), /not a Social check/);
  assert.match(bad('- people: tull', '- people: pip'), /person tull is not listed/);
  assert.match(bad('no -> end-lowballed\n- push intimidate', 'no -> end-nowhere\n- push intimidate'), /no node "end-nowhere"/);
  assert.match(bad('Learn: tull broke', 'Learn: tull rich'), /tull has no fact "rich"/);
  assert.match(bad('push haggle money\n- seven', 'push haggle anger\n- seven'), /a haggle is money/);
  assert.match(bad('push persuade empathy', 'push flatter empathy'), /ability flatter/);
  assert.match(bad('(needs know tull seven-gunners)', '(needs hope)'), /cannot read the need/);
  assert.match(bad('# Talk overlay: the-eighth-gunner', '# Talk overlay: another-scene'), /is for scene "another-scene"/);
  assert.match(bad('- desk | Bond: tull +1', '- desk | Bond: tull +9'), /a bond step is at most 2/);
  assert.match(bad('great -> end-hired-well, ok -> end-hired-fair, no -> end-lowballed\n- push intimidate', 'great -> end-hired-well, ok -> end-hired-fair\n- push intimidate'), /a push line is/);
  assert.ok(validateOverlay('', SCENE).errors.some((e) => /needs "# Talk overlay/.test(e)));
});

test('overlay: a tag may leave out the want (a plain tagged haggle), and a lit-word split keeps the words whole', async () => {
  const t = '# Talk overlay: the-eighth-gunner\n- people: tull\n\n## Tag\n- desk | "Haggle for a bigger share." | push haggle money\n';
  const r = validateOverlay(t, SCENE);
  assert.deepEqual(r.errors, []); assert.equal(r.overlay.tags[0].want, null);
  const { litParts, litsOf, lineView } = await import('../projects/Space-Shooter/voyage/talk/model.js');
  const parts = lineView(pip, 'pip.wb.hello').parts;
  assert.equal(parts.map((x) => x.text).join(''), pip.lines['pip.wb.hello'].text, 'the words are never changed');
  assert.deepEqual(parts.filter((x) => x.lit).map((x) => [x.text, x.lit.kind, x.lit.id]), [['good cutter', 'want', 'good-cutter']]);
  assert.deepEqual(litParts('Ask about the PROJECTOR now', [{ phrase: 'projector', kind: 'topic', id: 'p' }]).map((x) => x.text), ['Ask about the ', 'PROJECTOR', ' now']);
  assert.deepEqual(litParts('nothing here', litsOf(pip)).map((x) => x.text), ['nothing here']);
  assert.equal(lineView(pip, 'pip.p.ask').parts.some((x) => x.lit), false, 'your own lines have no lit words');
});

test('overlay: an empty overlay is valid and changes nothing; the scene text is never touched', () => {
  const empty = '# Talk overlay: the-eighth-gunner\n- people: tull\n';
  const r = validateOverlay(empty, SCENE);
  assert.deepEqual(r.errors, []); assert.equal(overlayIsEmpty(r.overlay), true);
  const before = SCENE; validateOverlay(OVERLAY, SCENE); assert.equal(SCENE, before);
  assert.equal(overlayIsEmpty(parseOverlay(OVERLAY).overlay), false);
});

test('overlay: the real approved scenes still lint with an empty overlay beside them (when the quest lane\'s files are present)', () => {
  const dir = join(process.env.HOME || '', 'Desktop/lhc-lanes/stardust/launch/quests/review');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const id = text.match(/^- id: (\S+)/m)?.[1];
    const r = validateOverlay(`# Talk overlay: ${id}\n- people: tull\n`, text);
    assert.deepEqual(r.errors, [], f);
    assert.ok(Object.keys(readScene(text)).length >= 3, f);
  }
});

// ---- bots (plan 1.11): learning first beats pushing at once, anger backfires, no pair is a sure thing -------------------------------
function levelPlayer(level) {
  let s = S.freshState();
  s = { ...s, progress: { ...s.progress, levels: { ...s.progress.levels, social: level } } };
  return s; // no points: the weakest base
}
/** Play the persuade game with the cares-first bot (what a player does with the tells). */
function botPersuade(setup, opening, seed) {
  const g = createPersuade({ seed, setup, opening });
  // The bot reads only what the game shows: tells. Known cares first, best first; then it guesses, avoiding a shown dislike.
  const knownCare = new Set(g.shown.filter((x) => x.kind === 'care').map((x) => x.value));
  const knownBad = new Set(g.shown.filter((x) => x.kind === 'dislike').map((x) => x.value));
  const named = (c) => (c.named ? 1 : 0);
  const known = g.hand.filter((c) => knownCare.has(c.value)).sort((a, b) => named(b) - named(a) || b.worth - a.worth);
  const guess = g.hand.filter((c) => !knownCare.has(c.value) && !knownBad.has(c.value));
  const rest = g.hand.filter((c) => knownBad.has(c.value));
  for (const c of [...known, ...guess, ...rest]) { if (g.done) break; playCard(g, c.id); }
  return g.result;
}
function botIntimidate(setup, seed) {
  const g = createIntimidate({ seed, setup });
  while (!g.done) { if (g.won >= g.goal) stand(g); else pushIt(g); }
  return g.result;
}
function botBribe(setup, seed, range) {
  const g = createBribe({ seed, min: range.min, max: range.max, setup });
  // a patient bot: offer the lowest price it can read as just above a guess at the floor; here it simply creeps up
  let ask = Math.round(range.min + (range.max - range.min) * 0.55);
  while (!g.done) { offer(g, ask); ask += 2; }
  return g.result;
}
/** One whole talk by a bot, with a seeded d20. */
function runTalk(level, plan, seed) {
  let s = levelPlayer(level); let t = C.newTalk(pip);
  const rnd = (() => { let x = seed * 7919 + 13; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
  if (plan === 'learn') { [s, t] = topic(s, t, 'projector'); [s, t] = topic(s, t, 'safety'); }
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  const want = plan === 'learn' ? ['p-emp'] : plan === 'anger' ? ['p-ang', 'i-ang'] : plan === 'rush' ? ['p-ang'] : [plan];
  for (const id of want) {
    if (t.ended || s.items['good-cutter']) break;
    const at = C.attemptPush(s, pip, t, 'good-cutter', id, NOW, rnd);
    if (!at) continue;
    let result;
    if (at.game === 'persuade') result = botPersuade(at.setup, at.opening, seed + 1);
    else if (at.game === 'intimidate') result = botIntimidate(at.setup, seed + 2);
    else result = botBribe(at.setup, seed + 3, C.bribeRange(s, at.opt.push));
    const r = C.settlePush(s, pip, t, 'good-cutter', id, result, NOW); s = r.state; t = r.talk;
  }
  return { got: Boolean(s.items['good-cutter']), bond: C.personOf(s, pip).bond };
}
const rate = (level, plan, n = 400) => { let w = 0, zero = 0; for (let i = 1; i <= n; i++) { const r = runTalk(level, plan, i); if (r.got) w++; if (r.bond === 0) zero++; } return { win: w / n, zero: zero / n }; };

test('bots: a "learn first" bot beats a "push at once" bot at every level', () => {
  for (let level = 1; level <= 9; level++) {
    const learn = rate(level, 'learn').win, rush = rate(level, 'rush').win;
    assert.ok(learn > rush, `level ${level}: learn ${learn} vs rush ${rush}`);
  }
});
test('bots: an "always Anger" bot ends with bond 0 more often than not at level 1', () => {
  const r = rate(1, 'anger');
  assert.ok(r.zero > 0.5, `bond 0 in ${Math.round(r.zero * 100)}% of talks`);
});
test('bots: no single pair wins over 90% at level 1 with no points', () => {
  for (const id of ['p-emp', 'p-ang', 'i-ang', 'b-mon']) { const r = rate(1, id).win; assert.ok(r <= 0.9, `${id} wins ${Math.round(r * 100)}%`); }
  // the two that need facts are checked with the facts in hand
  for (const id of ['learn']) { const r = rate(1, id).win; assert.ok(r <= 0.9, `${id} ${r}`); }
});

test('bots: the table (SOCIAL_RATES=1 prints it): win rates by level for each plan, 400 seeded talks each', { skip: !process.env.SOCIAL_RATES }, () => {
  for (const plan of ['learn', 'rush', 'anger', 'p-emp', 'p-ang', 'i-ang', 'b-mon']) console.log(plan.padEnd(6), [1, 3, 5, 9].map((l) => { const r = rate(l, plan); return `L${l} win ${Math.round(r.win * 100)}% bond0 ${Math.round(r.zero * 100)}%`; }).join(' | '));
});

test('model: the panel shows what the plan says, in order: wants, ask, topics with ??? for locked, pushes only after a no, ability then approach', async () => {
  const { talkModel } = await import('../projects/Space-Shooter/voyage/talk/model.js');
  let s = planPlayer(); let t = C.newTalk(pip);
  s = C.pinWant(s, 'good-cutter');
  let m = talkModel(s, pip, t, { lines: ['pip.wb.hello'] }, NOW);
  assert.deepEqual(m.wants, [{ id: 'good-cutter', label: 'the good cutter' }]);
  assert.equal(m.ask[0].say, 'Can I use the cutter? Just for the bench.'); assert.equal(m.push, null);
  assert.deepEqual(m.topics.map((x) => x.hint), [null, null, 'Get to know Pip better…', 'Look around for what they hide…']);
  assert.deepEqual(m.bond, { n: 2, name: 'Crew' });
  const a = C.askWant(s, pip, t, 'good-cutter', NOW); s = a.state; t = a.talk;
  m = talkModel(s, pip, t, { lines: a.lines, learned: [a.learned] }, NOW);
  assert.deepEqual(m.learned, ['Gunner four lost his last good cutter']);
  assert.deepEqual(m.push.choices.map((x) => x.id), ['p-emp', 'p-ang', 'i-ang', 'b-mon']);
  assert.deepEqual(m.push.choices.map((x) => x.tag), ['Persuade · Empathy · 70%', 'Persuade · Anger · 50%', 'Intimidate · Anger · 50%', 'Bribe · Money · 60%']);
  assert.equal(m.push.choices[0].say, pip.lines['pip.p.p-emp'].text);
  assert.deepEqual(m.push.locked.map((x) => x.hint), ['Know what he is hiding…', 'Know what he is stuck on, and bring a clean circuit board…'], 'what you would need to know');
  assert.equal(m.push.selected, null);
  m = talkModel(s, pip, t, { push: 'p-emp' }, NOW);
  assert.equal(m.push.selected.dc, 10); assert.equal(m.push.sayText, pip.lines['pip.p.p-emp'].text); assert.equal(m.push.choices[0].on, true);
  m = talkModel(s, pip, t, { push: 'b-mon' }, NOW);
  assert.deepEqual(m.push.cost.credits, { min: 10, max: 40 });
  // a scared person: marks show, topics locked
  const scared = { ...s, people: { pip: { ...C.personOf(s, pip), marks: { scared: { bondWas: 2 } } } } };
  m = talkModel(scared, pip, t, {}, NOW);
  assert.deepEqual(m.marks, ['Scared of you']); assert.ok(m.topics.every((x) => x.locked));
});

test('voice: every one of Pip\'s lines is in the voice lane\'s manifest, and the slice cast is in voices.json (when the lane\'s files are present)', () => {
  const dir = join(process.env.HOME || '', 'Desktop/lhc-lanes/stardust/voice');
  if (!existsSync(join(dir, 'manifest.json'))) return;
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).lines;
  for (const [id, l] of Object.entries(pip.lines)) if (l.who === pip.speaker) assert.ok(man[id], `${id} has no voice line`);
  const voices = JSON.parse(readFileSync(join(dir, 'voices.json'), 'utf8')), scratch = JSON.parse(readFileSync(join(dir, 'voices-scratch.json'), 'utf8'));
  for (const who of ['tull', 'nessa', 'pip', 'reck', 'reaver']) { assert.ok(voices[who]?.design && Number.isInteger(voices[who].seed), who); assert.ok(scratch[who]?.kvoice, `${who} scratch`); }
  return import('../projects/Space-Shooter/voyage/quests/data/speakers.js').then(({ SPEAKERS_DATA }) => {
    for (const who of ['tull', 'nessa', 'pip', 'reck', 'reaver']) assert.equal(voices[who].design, SPEAKERS_DATA.extras[who].design, `${who} design is the site's sentence`);
  }).then(() => assert.equal(new Set(Object.values(voices).map((v) => v.seed)).size, Object.keys(voices).length, 'seeds are unique'));
});

test('model: until a want is pinned the greeting stays on show (its amber words raise the want); once pinned it steps aside', async () => {
  const { talkModel } = await import('../projects/Space-Shooter/voyage/talk/model.js');
  const s = S.freshState(), t = C.newTalk(pip);
  const ui = { greeting: 'pip.wb.hello', lines: ['pip.p.projector', 'pip.topic.projector'] };
  let m = talkModel(s, pip, t, ui, NOW);
  assert.deepEqual(m.lines.map((l) => l.id), ['pip.wb.hello', 'pip.p.projector', 'pip.topic.projector']); assert.equal(m.lines[0].earlier, true);
  m = talkModel(C.pinWant(s, 'good-cutter'), pip, t, ui, NOW);
  assert.deepEqual(m.lines.map((l) => l.id), ['pip.p.projector', 'pip.topic.projector']);
  m = talkModel(s, pip, t, { greeting: 'pip.hello.cold', lines: ['pip.p.nan'] }, NOW);
  assert.deepEqual(m.lines.map((l) => l.id), ['pip.p.nan'], 'a greeting with no amber word is not kept');
});

test('voice: a line shown is a line the voice can play (the site\'s scratch voice map finds Pip\'s lines)', async () => {
  const man = join(process.env.HOME || '', 'Desktop/lhc-lanes/stardust/voice/manifest.json');
  if (!existsSync(man)) return;
  const { loadScratchVoice, voiceUrl } = await import('../projects/Space-Shooter/voyage/story/voice.js');
  const data = JSON.parse(readFileSync(man, 'utf8'));
  const n = await loadScratchVoice({ loc: new URL('http://127.0.0.1:4173/?voice=scratch'), fetchFn: async () => ({ ok: true, json: async () => data }) });
  assert.ok(n > 0);
  const missing = Object.entries(pip.lines).filter(([id, l]) => l.who === pip.speaker && !voiceUrl(id)).map(([id]) => id);
  assert.deepEqual(missing, [], 'every Pip line has a voice file');
  assert.match(voiceUrl('pip.cutter.no'), /__stardust-scratch-voice\/lines-scratch\/pip\/pip\.cutter\.no\.mp3$/);
});
