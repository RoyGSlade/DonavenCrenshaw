// The workshop's crafting, over the crafting chain's own modules (Cut, Screw, Bolt plate: minigames/craftChain.js and recipeView.js).
// The captain's real crafting level and points set each game up; one d20 roll sets the tier for the whole craft. Pure helpers here
// (the menu and the setup); the DOM of a game is the chain's own recipeView.
import { RECIPES, createRecipe } from '../minigames/craftChain.js';
import { playRecipe } from '../minigames/recipeView.js';
import { tierOf, tierInfo, CUT_TOOLS, setupCut } from '../minigames/setup.js';
import { rollPreview } from '../minigames/rollPreview.js';
import { cleanSkillPoints } from '../minigames/picker.js';
import { check } from '../character.js';

export const CRAFT_ROLL = Object.freeze({ skill: 'crafting', stat: 'dex', tag: 'craft', dc: 10 });
export const CRAFT_LIST = Object.freeze([
  { id: 'cut', name: 'Cut a plate', what: 'Cut: drag the blade round the outline. One game, about 20 seconds.' },
  { id: 'screw', name: 'Drive a bolt', what: 'Screw: circle the bolt head, stop in the green. One game, about 15 seconds.' },
  { id: 'bolt-plate', name: 'Bolt plate', what: 'Cut the plate, then bolt it down. Two games, one roll.' },
]);
export const TOOLS = Object.freeze({ worn: 'thin', shop: 'normal', good: 'wide' });

/** The level and cleaned category points the games read, from a real captain. */
export function loadoutOf(character) {
  const level = character?.levels?.crafting ?? 1;
  return { level, points: cleanSkillPoints('crafting', character?.points?.crafting, level) };
}

/** One d20, then everything a craft needs to open: the attempt, the tier, the preview words and the recipe state. */
export function startCraft(character, id, { tool = 'shop', seed = 1, rng = Math.random } = {}) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`No craft ${id}`);
  const { level, points } = loadoutOf(character);
  const attempt = check(character, CRAFT_ROLL, rng);
  const tier = tierOf(attempt);
  const preview = rollPreview(id, attempt, { level, points });
  const state = createRecipe({ recipe, tier, points, level: 9, tool: CUT_TOOLS[tool] ? tool : 'shop', bank: 0, seed });
  return { id, recipe, attempt, tier, label: tierInfo(tier).label, preview, note: preview ? `${preview.line} ${preview.nextLine}` : '', state, setup: setupCut({ tier, level, points, tool }) };
}

/** Play a started craft in a stage; resolves with the recipe's result card data. */
export const playCraftGame = (stage, start, { reducedMotion = () => false } = {}) => playRecipe(stage, { state: start.state, unit: 'scrap', reducedMotion });
