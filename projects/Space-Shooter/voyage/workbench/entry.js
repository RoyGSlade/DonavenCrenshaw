// Is the workbench room asked for? Pure. A dev entry only: it needs the new game's switch (voyage/flag.js: ?newgame=1 in
// this browser, or runtimeConfig.newGame) AND ?start=workbench. Nothing links to it and no story reaches it.
export const WORKBENCH_START = 'workbench';

/** `flagEnabled` is newGameFlag(...).enabled; `params` a URLSearchParams. */
export function wantsWorkbench({ flagEnabled = false, params = null } = {}) {
  return Boolean(flagEnabled) && params?.get?.('start') === WORKBENCH_START;
}
