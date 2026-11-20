// The words people use for the player's role (opening track A, outcome 3). Pure and import-free, so the story's line filler can use it.
export const ROLES = Object.freeze(['janitor', 'gunner', 'captain']);
const ADDRESS = Object.freeze({ janitor: 'Janitor', gunner: 'Gunner', captain: 'Captain' });
export const addressOf = (role) => ADDRESS[role] || ADDRESS.captain;

// "Captain" used to speak to the player: after a comma or at the start of a sentence, or "my captain", but never a title in front of a name.
const TITLE_NAME = /^\s+[A-Z][a-z]/;
export function roleSay(text, role) {
  if (role === 'captain') return String(text);
  const word = addressOf(role);
  return String(text).replace(/\b(my )?([Cc])aptain\b/g, (m, my, c, offset, whole) => {
    if (TITLE_NAME.test(whole.slice(offset + m.length))) return m; // "Captain Tull": a title before someone else's name
    return `${my || ''}${c === 'c' ? word.toLowerCase() : word}`; // "Captain {name}" is the player's own title: it changes too
  });
}
