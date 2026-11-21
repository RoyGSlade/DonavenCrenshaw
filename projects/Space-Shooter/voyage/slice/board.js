// The Tin Duchess's crew board, close up (playtest 1, item 8). Data only; onfoot/boardView.js draws it.
// The scene's own words: "seven names, six crossed out in red and the last one in pencil" (Third Shift), and later "Seven gunners
// before you. One quit. One was reassigned to a planet. One is technically on leave. Three are not the subject of this meeting. And Reck."
// The six crossed-out names and the five notes are DRAFTS (Sonnet 5.5 fix lane, awaiting Donaven's review), not approved text.
export const BOARD = Object.freeze({
  title: 'CREW: GUNNERS',
  // [name, how it ends]; the last (Reck) is still in pencil.
  names: Object.freeze([
    { name: 'Okafor', crossed: true },
    { name: 'Bram', crossed: true },
    { name: 'Delphine', crossed: true },
    { name: 'Tink', crossed: true },
    { name: 'Marsh', crossed: true },
    { name: 'Ines', crossed: true },
    { name: 'Reck', crossed: false, pencil: true },
  ]),
  // Notes tucked on the board by earlier crew. `at` is a spot on the board in percent (left, top).
  notes: Object.freeze([
    { id: 'okafor', from: 'Okafor', at: [6, 70], text: 'Tull said two weeks, tops. That was my fourth month.' },
    { id: 'bram', from: 'Bram', at: [87, 20], text: 'He calls the board a metaphor. It is my name with a line through it.' },
    { id: 'delphine', from: 'Delphine', at: [58, 84], text: 'Pay is pending. It has been pending since the Tuesday I joined.' },
    { id: 'tink', from: 'Tink', at: [31, 8], text: 'The gun is fine. The chair is the problem. Do not trust the chair.' },
    { id: 'marsh', from: 'Marsh', at: [92, 74], text: 'Reassigned to a planet, he said. It was a rock. A small rock. I am still on it.' },
  ]),
  words: Object.freeze({
    label: 'The crew board',
    close: 'Back',
    hint: 'Seven names. Look closer.',
    // Words, not digits (the HUD rule): "Notes found: two", and a pip for every note.
    found: (n) => `Notes found: ${['none', 'one', 'two', 'three', 'four', 'five', 'six'][n] || 'many'}`,
  }),
});
export const noteFlag = (id) => `board-note-${id}`;
