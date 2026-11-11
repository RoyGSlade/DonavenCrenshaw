// Job badges: the keepsake a job leaves on the account the first time it is won
// (core's reward `unlocks: ['badge:<id>']`, kept through death like liveries).
// The hangar can show them as a wall of patches; the quest player names them.
// DATA ONLY: the body after "= " is strict JSON (STUDIO-SCHEMA.md form D).
export const BADGES_DATA = {
  "version": 1,
  "badges": {
    "cold-run": { "name": "Cold Run patch", "blurb": "A courier patch with a little humming core stitched on it." },
    "black-lane": { "name": "Black Lane patch", "blurb": "An amber eye, stitched shut. Hask had them made." },
    "three-tiers": { "name": "Sugar star", "blurb": "One sugar star off a Guild wedding cake, lacquered so it keeps." },
    "slow-parade": { "name": "Knitted pennant", "blurb": "Nana Opaline knitted it. It says ESCORT, mostly." },
    "dead-channel": { "name": "Buoy crystal", "blurb": "A chip of warm Warden crystal from the relay buoy." },
    "railgun": { "name": "Railgun slug", "blurb": "A spent railgun slug on a chain. Vey thinks it is vulgar." },
    "listening-gate": { "name": "Veil glyph", "blurb": "A rubbing of the four glyphs from the Iron Veil seal." },
    "missing-page": { "name": "Ledger corner", "blurb": "A torn corner of Vey's ledger. It says only: 'owes me'." },
    "teapot": { "name": "Teapot lid charm", "blurb": "A tiny silver teapot. Edna winks whenever she sees it." },
    "warden-file": { "name": "File stamp", "blurb": "The Records Hall's APPROVED stamp, pressed onto your sleeve by Pell." },
    "dead-weight": { "name": "Hulk rivet", "blurb": "A rivet from a twenty-year-dead hull. It still knocks, faintly." },
    "deep-seam": { "name": "Blue ore nugget", "blurb": "A nugget of Deep Seam ore. The claim-jumpers call it a piece of Kevin." },
    "lighthouse": { "name": "Lighthouse lens", "blurb": "A sliver of lens from the field lighthouse. Wren signed it." },
    "dustfall-derby": { "name": "Derby trophy", "blurb": "A bolt welded to a bolt, welded to a bolt. Garrity cried." },
    "black-box": { "name": "Nightjar wing", "blurb": "A courier wing pin from the Nightjar's console. Handle it gently." }
  }
};
