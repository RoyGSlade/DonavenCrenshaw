// The pages of the three training books (Donaven 2026-11-19: "read a paragraph that feels like it is out of a blueprint or a learning book,
// then answer a question about it correctly, get XP"). Every page is one short in-world paragraph (`lines`, shown with line numbers) and one
// question. The facts in a page are the TRUE rules of that skill's mini-game: `facts` lists the ids from bookFacts.js that the page states,
// and a test runs each one against the real code, so a rule that changes breaks the test until the page is looked at.
//   level   the skill level that unlocks the page (1, 3 or 6)       answer  index of the right choice as written here (the view shuffles them)
//   line    the line (or lines) of the page that hold the answer, said back on a wrong answer
// `[[text]]` in a line is flavour that the hacking manual redacts (it never hides a fact).
const page = (skill, level, id, title, lines, question, choices, answer, line, facts) => Object.freeze({ id: `${skill}-${id}`, skill, level, title, lines: Object.freeze(lines), question, choices: Object.freeze(choices), answer, line: Object.freeze([].concat(line)), facts: Object.freeze(facts) });

export const PAGES = Object.freeze([
  // ---- Repair: the service manual -------------------------------------------------------------------------------------------
  page('repair', 1, 'closed', 'Closed lines only', [
    'Coolant does not stop at a joint it likes. It runs out of the pump through every piece that meets its neighbour, and it pours out of any opening that meets nothing.',
    'A line is sound only when every opening on the wet pipe meets another opening.',
    'One open end, anywhere on the wet pipe, and the spill begins.',
    'Walk the line from the pump and look for openings that face the board’s edge or an empty socket.',
  ], 'A wet piece has one opening that faces the edge of the board. What does the coolant do there?', ['It stops at the edge and waits', 'It drains back toward the pump', 'It pours out, and the spill begins', 'It does nothing until the next shift'], 2, 1, ['repair.closed-network']),
  page('repair', 1, 'tee', 'The Tee', [
    'Tees are where most patches go wrong.',
    'A Tee has three openings, and all three must meet something before the piece is closed.',
    'Two out of three leaves an open end, and an open end leaks.',
    'Turn the Tee until its third end meets a pipe, a loop or the valve, then check the line again from the pump.',
  ], 'A Tee on the wet line has two ends joined and its third end facing an empty socket. Is it closed?', ['Yes. Two ends are enough', 'No. The third end is open, so it leaks', 'Yes, if it sits on the top row', 'Only once the water rises'], 1, [2, 3], ['repair.tee-needs-three']),
  page('repair', 1, 'edges', 'Pump and valve', [
    'Every coolant board in the fleet is laid out the same way.',
    'The pump sits on the left edge and the leaking valve on the right edge.',
    'The valve is always in the top half of the board, so it is never hard against the floor.',
    'Neither of them turns. You build the line between them, and you do not get to move the ends.',
  ], 'Where do you find the valve on a coolant board?', ['On the left edge, beside the pump', 'In the middle of the bottom row', 'Somewhere new after every turn you make', 'On the right edge, in the top half'], 3, [2, 3], ['repair.pump-valve-edges', 'repair.fixed-pieces']),
  page('repair', 3, 'rising', 'Rising water', [
    'The spill does not fall from above. It collects at the bottom of the board and climbs.',
    'A piece is drowned only when the water is over all of it, so the bottom row goes under first and the top row last.',
    'A drowned piece cannot be turned. Whatever way it points is how it stays.',
    'Fix the low pieces first.',
  ], 'Which pieces does the rising water lock first?', ['The pieces beside the pump', 'The top row', 'The bottom row', 'The pieces nearest the valve'], 2, 2, ['repair.water-rises-bottom', 'repair.submerged-locked']),
  page('repair', 3, 'leaks', 'No clock, only leaks', [
    'Nobody is racing a clock on a coolant job. The water rises only while something is pouring.',
    'An open end pours once the coolant has filled the piece it sits on, and it adds to the pool every second.',
    'Three open ends fill the pool three times as fast as one.',
    'Close every open end and the pool stops where it is.',
  ], 'You close every open end while the pool is half full. What happens to the water?', ['It stops rising and stays where it is', 'It drains away to nothing', 'It keeps climbing, only more slowly', 'It floods the valve at once'], 0, 4, ['repair.only-leaks-fill', 'repair.more-leaks-faster', 'repair.coolant-fills']),
  page('repair', 3, 'floor', 'The bottom row', [
    'Dock crews learned this the hard way: the bottom row is the first to flood.',
    'So every job is delivered with the bottom row already turned the right way round, and the water cannot lock it wrong.',
    'Leave it alone and start your work at the pump.',
    'Spend your turns on the pieces above it, where the mistakes are.',
  ], 'Why can you leave the bottom row alone when a job begins?', ['It has no openings', 'It is never touched by water', 'The valve takes care of it', 'It starts turned the right way round'], 3, 2, ['repair.bottom-row-starts-right']),
  page('repair', 6, 'lost', 'A drowned mistake', [
    'A drowned piece that is turned wrong is a mistake you cannot take back.',
    'If it leaves no way to seal the line, the line is lost at once. The water does not need to reach the valve.',
    'So before you commit the high pieces, look at the low ones, and turn the low ones first.',
  ], 'A drowned piece is wrong, and no turning above it can seal the line. What happens?', ['You may turn the drowned piece once more', 'The water drains for a minute', 'The line is lost at once', 'Nothing until the water reaches the valve'], 2, 2, ['repair.locked-lost']),
  page('repair', 6, 'valve', 'The valve wheel', [
    'When the water reaches the valve wheel the line is lost. It stays broken and the flooding goes on.',
    'Shut the valve to stop the flood.',
    'Shutting it also takes the system the line protected offline, whether that is engine cooling, life support or another. That is the price.',
  ], 'The line is lost and flooding. What does shutting the valve do?', ['It seals the line and restores the system', 'It drains the board for a fresh start', 'It stops the flood but takes the system offline', 'Nothing. The flood runs on'], 2, [2, 3], ['repair.valve-flood']),
  page('repair', 6, 'marks', 'What a patch scores', [
    'A sealed patch is marked out of a hundred.',
    'Forty for sealing it at all, up to thirty more for few turns, and up to thirty more for little spill.',
    'Ninety and over earns three stars. Sixty-five and over earns two.',
    'A patch that nearly flooded the bay can still hold, but it will not score high.',
  ], 'A patch scores 92. How many stars does it earn?', ['Two', 'One', 'None, only a hundred counts', 'Three'], 3, 3, ['repair.quality']),

  page('repair', 3, 'sockets', 'Shapes and sockets', [
    'An assembly job gives you a housing with one glowing socket and a tray of parts. Only one part in the tray has the socket’s outline, and it fits in one turn only.',
    'Beware the mirror twin. It looks the same and it never fits, however you turn it.',
    'A wrong part bounces off and counts against you. The right part turned the wrong way bounces too, but it costs nothing.',
  ], 'The right part is in the socket’s outline but turned the wrong way. What happens when you drop it?', ['It snaps in anyway', 'It bounces and counts as a wrong fit', 'It bounces and costs nothing', 'The socket closes for good'], 2, 3, ['assembly.one-fit', 'assembly.bounce']),
  page('repair', 6, 'bolted', 'Bolts and the clock', [
    'A part is not done when it snaps in. Drag each bolt to a hole and drive it down. A stripped bolt comes back out; set it again.',
    'The next socket opens only when the last bolt is snug.',
    'The unit scores forty for finishing, up to thirty more for few wrong fits and up to thirty for the clock left. The clock is 110 seconds, six more for each Time point.',
    'Ninety and over earns three stars.',
  ], 'You snap in a part, but one of its bolts strips. What do you do?', ['Move on, the next socket is open', 'Take the bolt out and set it again', 'Give up the unit', 'Wait for the clock to reset'], 1, 1, ['assembly.next-socket', 'assembly.score']),

  // ---- Hacking: the ops terminal manual -------------------------------------------------------------------------------------
  page('hacking', 1, 'grade', 'Firewalls in a row', [
    'A lock is graded one to four, and the grade is the number of firewalls between you and the data.',
    'Each firewall is a board of its own: an emitter, a few mirrors you can turn, and the wall itself.',
    'You clear them one after another. Break the first and the next board loads. [[Operator 7731]] never skipped one.',
  ], 'A grade 3 lock stands between you and the data. How many firewalls must you break?', ['Four', 'Two', 'One, and the rest fall', 'Three'], 3, 1, ['hack.grade']),
  page('hacking', 1, 'turn', 'Turning mirrors', [
    'Select a mirror and hold to turn it. It moves in steps of seven and a half degrees, one step every 0.09 seconds.',
    'The preview beam shows where a shot would go right now, so line it up before you spend a catch.',
    'Every board has a solution. The layouts are built backwards from a working beam path. [[Annex 4: field notes withheld.]]',
  ], 'How do you know a firewall board can be solved?', ['The terminal checks it for you after a miss', 'It is built backwards from a working beam path', 'Only the decoy mirrors need turning', 'You cannot know until the clock runs out'], 1, 3, ['hack.turn-step', 'hack.preview', 'hack.always-solvable']),
  page('hacking', 1, 'catch', 'The catch', [
    'To open the portal you must catch it. A marker sweeps along a bar and back.',
    'Press when the marker sits inside the lit window. At a steady roll the window is a fifth of the bar.',
    'Press outside it and the catch goes dead for 0.6 seconds. That costs you time, never a try.',
  ], 'You press the catch while the marker is outside the lit window. What does it cost you?', ['A try, and the board resets', 'The whole firewall', 'Nothing at all', 'A 0.6 second wait, and no try'], 3, 3, ['hack.catch-window', 'hack.catch-miss']),
  page('hacking', 3, 'portal', 'Fire through the portal', [
    'The portal opens only when you catch it.',
    'It closes again behind every shot you fire, hit or miss.',
    'No open portal, no shot: the fire control stays dead until you catch it fresh.',
    'Catch once for every shot you mean to take. [[Rev. C, signed off by M. Okafor.]]',
  ], 'Your shot missed the wall. Is the portal still open?', ['Yes, until the clock runs out', 'Yes, for one more shot', 'No. It closed behind the shot', 'It never opened'], 2, 2, ['hack.fire-needs-portal']),
  page('hacking', 3, 'fizzle', 'A fizzled shot', [
    'A shot follows the mirrors as they stand. If its path does not end on the firewall, it fizzles out.',
    'A fizzle costs you the seconds it took and nothing else: no try is spent.',
    'While a shot is in flight the mirrors are locked, so you cannot turn one to chase it.',
  ], 'Your shot fizzles. What have you lost?', ['One try', 'The firewall’s progress', 'Only the seconds it took', 'Nothing: the clock stops while a shot flies'], 2, 2, ['hack.fizzle', 'hack.no-turn-in-flight']),
  page('hacking', 3, 'decoys', 'Decoy mirrors', [
    'Not every mirror on a board belongs to the beam.',
    'Decoys are put there to tempt you. They sit clear of the solved path.',
    'The solution works with the decoys left exactly as they are, so spend no time turning them. [[Decoy count: redacted.]]',
  ], 'What should you do with a decoy mirror?', ['Turn it to face the emitter', 'Leave it alone: the solution works with it untouched', 'Turn it to the middle of the bar', 'Remove it by clicking twice'], 1, 3, ['hack.decoys']),
  page('hacking', 6, 'reset', 'The firewall clock', [
    'Every firewall has a clock of its own: twenty-six seconds at a steady roll. It starts fresh on each new wall.',
    'When it runs out the board resets on the same seed. You get the same mirrors and the same catch window, and one try is spent.',
    'A reset is a second look at the same board, not a new one.',
  ], 'A firewall’s clock runs out and you still have a try. What do you face next?', ['A new board with a new window', 'The next firewall', 'The same board and the same window, with one try spent', 'A shorter clock'], 2, 2, ['hack.time-reset', 'hack.fresh-clock']),
  page('hacking', 6, 'tries', 'Tries for the whole hack', [
    'Your tries are counted for the whole hack, not for each wall.',
    'Spend one on the first firewall and it is gone for the third.',
    'Clearing a wall gives none back, so a careless first board makes every later board costlier. [[Ref: breach log 19.]]',
  ], 'You spent a try on the first firewall. How many tries do you have on the second?', ['One fewer than you started with', 'The full number again', 'Double', 'One more, as a reward'], 0, [1, 2], ['hack.tries-whole-hack']),
  page('hacking', 6, 'lockout', 'Lockout', [
    'Out of tries, the hack fails and security is alerted.',
    'Then the place answers. On foot, the terminal locks you out. At a ship, the port closes. In ship to ship combat, they seal that section and you must target a new one.',
    'A run with no try spent pays a bonus, so it is worth stopping to look before you fire.',
  ], 'You run out of tries while breaking in at a ship’s port. What happens?', ['The terminal locks you out', 'They seal that section', 'You are given another try', 'Security is alerted and the port closes'], 3, 2, ['hack.lockout-world', 'hack.clean-bonus']),

  // ---- Crafting: the blueprint sheets ---------------------------------------------------------------------------------------
  page('crafting', 1, 'stages', 'Heat, then shape', [
    'Every part is made in two stages: heat the stock, then shape it.',
    'Hold the heat control and the gauge climbs from a low start. Let go to lock the temperature.',
    'The shaping clock starts the moment you let go, and the stock cools as you work.',
  ], 'When does the shaping clock start?', ['When you choose the recipe', 'When the gauge first lights', 'The moment you let go of the heat', 'After the first tool tap'], 2, 3, ['craft.hold-release']),
  page('crafting', 1, 'band', 'The lit band', [
    'A lit band on the gauge marks the right temperature. Let go inside it for a clean heat.',
    'Let go too cold and the stock will not take its shape: you get half the work time.',
    'Let go too hot and two lots of stock spoil, though you gain a quarter more time.',
  ], 'You let go below the lit band. What do you get?', ['Two spoils and extra time', 'A clean heat', 'Nothing: the stock burns', 'Half the work time'], 3, 2, ['craft.heat-verdicts', 'craft.cold-half-time', 'craft.hot-spoils']),
  page('crafting', 1, 'burn', 'Do not burn it', [
    'Hold the heat all the way to the top of the gauge and the stock burns.',
    'A burn lets go for you and counts as too hot.',
    'The lit band always sits in the upper half of the gauge, so aim past the middle and watch the glow.',
  ], 'You hold the heat until the gauge is full. How does it count?', ['As a clean heat', 'As too cold', 'As too hot', 'It does not count'], 2, 2, ['craft.burn', 'craft.band-upper-half']),
  page('crafting', 3, 'order', 'Rough to fine', [
    'Shaping steps go in a fixed order, rough work first and fine work last: Cut, Draw, Bend, Fold, Flatten, Polish.',
    'A part uses some of the six, always in that order.',
    'The tools are laid out shuffled on the bench. Do not follow the layout. Follow the order.',
  ], 'A part needs both Bend and Polish. Which comes first?', ['Polish, because it finishes the job', 'Whichever tool is on the left', 'Either, the bench does not mind', 'Bend, because Polish is fine work and goes last'], 3, 1, ['craft.tool-order']),
  page('crafting', 3, 'wrong', 'A wrong tool', [
    'Tap the wrong tool and the step goes unclean and the stock spoils.',
    'Every spoil costs a tenth of the job’s materials.',
    'Then tap the right tool and the step is finished, but it is marked fixed, not clean.',
    'Only clean steps count towards the quality of the part.',
  ], 'You tap the wrong tool, then the right one. How is that step marked?', ['Clean', 'Ruined', 'Fixed, not clean', 'It is not marked'], 2, 3, ['craft.wrong-spoil', 'craft.fixed-step']),
  page('crafting', 3, 'clock', 'The shaping clock', [
    'Shaping runs on a clock: three seconds plus two and a half for every step, at a clean heat.',
    'A five step part gives fifteen and a half seconds.',
    'If the clock runs out the part cools, and it is not made. Settle which tools the part needs before you let go of the heat.',
  ], 'A part has four steps and a clean heat. How long is the shaping clock?', ['15.5 seconds', '13 seconds', '10 seconds', '11 seconds'], 1, 1, ['craft.work-clock', 'craft.cooled']),
  page('crafting', 6, 'half', 'Half clean', [
    'A part is made when at least half its steps were clean.',
    'With fewer, it comes out sloppy and does not count.',
    'On a five step part that means three clean steps. Two clean and three fixed is sloppy, and the stock is lost.',
  ], 'A five step part has two clean steps and three fixed. What is the result?', ['Made, with one star', 'Made, at poor quality', 'Sloppy: it does not count', 'Cooled'], 2, 3, ['craft.half-clean']),
  page('crafting', 6, 'quality', 'Quality', [
    'Quality starts at ten, plus ninety times the share of steps that were clean.',
    'Every step clean gives a hundred.',
    'Ninety and over earns three stars. Sixty-five and over earns two.',
    'The bench rounds the number, and the stars follow from it.',
  ], 'Every step on a part was clean. What is its quality, before any bonus?', ['90', '65', '110', '100'], 3, 2, ['craft.quality']),
  page('crafting', 6, 'scrap', 'Scrap carries over', [
    'Material points save scrap, and the saving is a fraction. At nine points a job costs 64 percent of its scrap.',
    'A bench cannot cut a part in fractions, so each craft rounds up and writes the leftover in the ledger.',
    'The next craft spends that leftover first. A four scrap job at nine points runs 3, then 3, then 2.',
  ], 'Three four-scrap jobs at nine Material points use how much scrap in all?', ['12', '10', '8', '9'], 2, 3, ['craft.material-bank']),
]);

export const BOOK_SKILLS = Object.freeze(['crafting', 'repair', 'hacking']);
