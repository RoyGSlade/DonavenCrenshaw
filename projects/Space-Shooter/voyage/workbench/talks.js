// The workbench room's test conversations, pure data and rules. Tull and Nessa each have a short talk with one social
// check: Tull haggles a share, Nessa is persuaded. (Pip has a full conversation instead: people/pip.js.) A check choice rolls the real d20 (Social, the test
// character's level), then plays that mini-game at the roll's tier; the result picks the next line. Speakers are the cast ids
// the dialogue box already knows (portraits). All words here; nothing is spoken by the quest engine.
//
// A node: { speaker, name, text, emotion?, choices: [{ label, goto } | { label, check: { game, who?, what?, open?, best?, dc? }, win, mid?, lose }] }
// A node with no choices ends the talk after its line. `goto: null` ends it.
export const TALKS = Object.freeze({
  tull: {
    start: 'hello',
    nodes: {
      hello: { speaker: 'tull', name: 'Captain Tull', text: "Janitor! Welcome to the workbench bay. Nothing in here counts, which is the best kind of room. Want a word, or a better share?", choices: [
        { label: 'Haggle for a bigger share.', check: { game: 'haggle', who: 'Captain Tull', what: 'your share', open: 20, best: 30 }, win: 'well', mid: 'fair', lose: 'walked' },
        { label: 'What is this room for?', goto: 'about' },
        { label: 'Nothing, Captain.', goto: null },
      ] },
      about: { speaker: 'tull', name: 'Captain Tull', text: 'Every station is a game you can try. Roll the dice, play it, get XP. The board on the wall keeps score, and the pod on the left shows what dying costs.', emotion: 'happy', choices: [
        { label: 'Back to the share.', goto: 'hello' },
        { label: 'Thanks.', goto: null },
      ] },
      well: { speaker: 'tull', name: 'Captain Tull', text: 'Thirty credits. Thirty! You have the soul of a quartermaster. Do not tell the others.', emotion: 'happy', choices: [{ label: 'Pleasure doing business.', goto: null }] },
      fair: { speaker: 'tull', name: 'Captain Tull', text: 'Twenty, the standard share. Fair, fair. I have been called worse than fair.', choices: [{ label: 'Fair enough.', goto: null }] },
      walked: { speaker: 'tull', name: 'Captain Tull', text: 'Ha! You pushed and I walked. Ten credits, and a lesson about greed.', emotion: 'annoyed', choices: [{ label: 'Noted.', goto: null }] },
    },
  },
  nessa: {
    start: 'hello',
    nodes: {
      hello: { speaker: 'nessa', name: 'Nessa', text: "You look like someone who wants me to teach them the lane. I charge in patience, and you have not got much.", choices: [
        { label: 'Talk her into a lesson.', check: { game: 'persuade', who: 'Nessa', what: 'teach you the lane' }, win: 'win', lose: 'lose' },
        { label: 'Is she always like this?', goto: 'aside' },
        { label: 'Never mind.', goto: null },
      ] },
      aside: { speaker: 'nessa', name: 'Nessa', text: 'Yes. Ask Tull. He has stopped asking me things.', emotion: 'annoyed', choices: [{ label: 'Back to the lesson.', goto: 'hello' }, { label: 'Right.', goto: null }] },
      win: { speaker: 'nessa', name: 'Nessa', text: 'Fine. Hands off the stick, eyes on the lane, and breathe out before the brake. That is the lesson.', emotion: 'happy', choices: [{ label: 'Thank you.', goto: null }] },
      lose: { speaker: 'nessa', name: 'Nessa', text: 'No. You argued the wrong things. Try again when you have noticed what I care about.', emotion: 'annoyed', choices: [{ label: 'Fair.', goto: null }] },
    },
  },
});
// Pip is not here: his talk is the social lane's person sheet (people/pip.js), played by talk/ (the cutter conversation).
export const TALK_WHO = Object.freeze(Object.keys(TALKS));

/** Problems in a talk tree as plain sentences (tests): unknown nodes, no ending, bad check games. Empty when fine. */
export function talkIssues(talk, games = ['haggle', 'persuade', 'intimidate']) {
  const out = [];
  const nodes = talk?.nodes || {};
  if (!nodes[talk?.start]) out.push(`start node ${talk?.start} is missing`);
  let ends = false;
  for (const [id, n] of Object.entries(nodes)) {
    if (!n.speaker || !n.text) out.push(`${id}: needs a speaker and text`);
    for (const c of n.choices || []) {
      if (c.check) {
        if (!games.includes(c.check.game)) out.push(`${id}: check game ${c.check.game}`);
        for (const k of ['win', 'lose']) if (!nodes[c[k]]) out.push(`${id}: ${k} node ${c[k]} is missing`);
        if (c.check.game === 'haggle' && !nodes[c.mid]) out.push(`${id}: haggle needs a mid node`);
        if (c.check.game !== 'haggle' && c.mid) out.push(`${id}: only haggle has a mid result`);
        if (c.check.game === 'haggle' && !(c.check.best > c.check.open)) out.push(`${id}: haggle best must be above open`);
      } else if (c.goto === null) ends = true;
      else if (!nodes[c.goto]) out.push(`${id}: goto ${c.goto} is missing`);
    }
  }
  if (!ends) out.push('no choice ends the talk');
  return out;
}

/** The node a finished check leads to: win, mid or lose (haggle only has mid). */
export const nextAfterCheck = (choice, branch) => (branch === 'win' ? choice.win : branch === 'mid' ? choice.mid : choice.lose);
