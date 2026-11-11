// The new game's art, in one map. Nothing here is approved art yet: these are
// the art lane's proposals (lhc-lanes/stardust/art/PACKS.md) and the Driftwake
// portraits the world lane picked (world/QUEST-GIVERS.md). To swap a picture,
// drop the new file in voyage/art/ and change its line here; no other file
// names an art path.
//
// Ship tiers: the "built from parts" row, Mk I to Mk IV, all four on the same
// canvas so the ship keeps its scale and grows. visualTier (voyage/upgrades.js)
// 0..3 picks Mk I..Mk IV. Mk I is today's standard ship.
const at = (path) => new URL(`./art/${path}`, import.meta.url).href;

export const ART = Object.freeze({
  shipTiers: Object.freeze(['ships/ship-mk1.png', 'ships/ship-mk2.png', 'ships/ship-mk3.png', 'ships/ship-mk4.png']),
  givers: Object.freeze({ hask: 'givers/hask.png', vey: 'givers/vey.png', garrity: 'givers/garrity.png' }),
});

/** URL of the ship picture for visual tier 0..3 (clamped). */
export function shipTierArt(tier) {
  const list = ART.shipTiers;
  return at(list[Math.max(0, Math.min(list.length - 1, Math.trunc(tier) || 0))]);
}

/** URL of a quest giver's portrait, or null when there is none (the page shows initials). */
export function giverPortrait(id) {
  return ART.givers[id] ? at(ART.givers[id]) : null;
}
