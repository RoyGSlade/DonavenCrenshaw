// Public configuration only. Never put a tunnel token, service credential, or secret here.
// The hub at api.donavencrenshaw.com. Empty keeps gameplay fully local.
// build names this version of the game to the hub, which can refuse runs from a broken one.
// bossFight: false switches off the hidden Warden fight behind Iron Veil's gate (and its
// cues) until it is ready to come back.
export const runtimeConfig = Object.freeze({ backendBaseUrl: 'https://api.donavencrenshaw.com/api/games/stardust', requestTimeoutMs: 2500, build: 'stardust-2026.09.27', bossFight: false });
