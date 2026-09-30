// What the site says about a pilot's ship and the device they flew on.
// Pure: no DOM, so tests/site-ship.test.mjs runs it in Node. ship-ui.js draws it.
//
// The hub sends two optional things on leaderboard rows:
//   ship:   { build, family }                  e.g. { build: "needle:0-1-2-0", family: "needle" }
//   client: { device, input, build }           device desktop|phone|tablet, input keyboard|controller|touch|tilt
// and, on profiles and GET /stardust/ship, { build, family, appearance }.
// Every field is whitelisted here before it reaches a class name, a title or an
// aria-label; anything unknown reads as "not sent" and the page shows nothing.

// The four hulls, in the game's order (systems/shipLivery.js SHIP_STYLES).
export const FAMILIES = Object.freeze({ needle: 'Needle', manta: 'Manta', wisp: 'Wisp', courier: 'Courier' });
export const SLOTS = Object.freeze([['body', 'Body'], ['wings', 'Wings'], ['cockpit', 'Cockpit'], ['engines', 'Engines']]);

const own = (table, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null);

export const familyName = (family) => own(FAMILIES, family);

// "needle:0-1-2-0" → family and part indices, or null when it isn't a build key.
export function parseBuild(build) {
    const m = /^([a-z]{3,12}):(\d)-(\d)-(\d)-(\d)$/.exec(typeof build === 'string' ? build : '');
    if (!m || !familyName(m[1])) return null;
    return { family: m[1], parts: { body: Number(m[2]), wings: Number(m[3]), cockpit: Number(m[4]), engines: Number(m[5]) } };
}

// The family a ship record names: its own field, else its build key, else its appearance.
export function shipFamily(ship) {
    if (!ship || typeof ship !== 'object') return null;
    for (const candidate of [ship.family, parseBuild(ship.build)?.family, ship.appearance?.family]) {
        if (familyName(candidate)) return candidate;
    }
    return null;
}

// The small chip on a board row: NEEDLE / MANTA / WISP / COURIER. null when the
// row carries no (known) ship.
export function shipChip(ship) {
    const family = shipFamily(ship);
    if (!family) return null;
    return { family, text: familyName(family), label: `Flying the ${familyName(family)}` };
}

// A ship's build as words. `choices` is the game's PART_CHOICES
// (systems/shipLivery.js), passed in so this file never imports the game. Part
// names are the word before " / " in the game's list ("Spear / long spine").
// Without `choices`, or for an index the list doesn't have, that part is left out.
export function shipSummary(ship, choices = null) {
    const family = shipFamily(ship);
    if (!family) return null;
    const indices = ship.appearance?.parts && typeof ship.appearance.parts === 'object' ? ship.appearance.parts : parseBuild(ship.build)?.parts;
    const parts = [];
    for (const [slot, label] of SLOTS) {
        const index = indices?.[slot];
        const name = choices && Number.isInteger(index) ? own(choices[family] || {}, slot)?.[index] : null;
        if (typeof name === 'string' && name) parts.push({ slot, label, name: name.split(' / ')[0].trim() });
    }
    const named = familyName(family);
    return {
        family,
        name: named,
        parts,
        // "Needle: Spear body, Lance wings, Lens cockpit, Torch engines"
        text: parts.length ? `${named}: ${parts.map((p) => `${p.name} ${p.label.toLowerCase()}`).join(', ')}` : named
    };
}

// --- Device badges -------------------------------------------------------------------

const DEVICE_WORD = Object.freeze({ desktop: 'desktop', phone: 'phone', tablet: 'tablet' });
const INPUT_WORD = Object.freeze({ keyboard: 'keyboard', controller: 'controller', touch: 'touch', tilt: 'tilt' });

// "Flown on a phone with tilt". device decides whether there is a badge at all;
// input is optional. null for a missing or unknown device.
export function clientBadge(client) {
    if (!client || typeof client !== 'object') return null;
    const device = own(DEVICE_WORD, client.device);
    if (!device) return null;
    const input = own(INPUT_WORD, client.input);
    return { device, input, label: `Flown on a ${device}${input ? ` with ${input}` : ''}` };
}

// Drawing data for the three icons: [tag, attributes] pairs on a 16 x 16 grid,
// stroked with currentColor. ship-ui.js builds real <svg> nodes from these.
export const DEVICE_ICON = Object.freeze({
    desktop: [
        ['rect', { x: '1.75', y: '2.5', width: '12.5', height: '8.25', rx: '1.25' }],
        ['path', { d: 'M5.5 13.5h5M8 10.75v2.75' }]
    ],
    phone: [
        ['rect', { x: '4.5', y: '1.5', width: '7', height: '13', rx: '1.5' }],
        ['path', { d: 'M7 12.5h2' }]
    ],
    tablet: [
        ['rect', { x: '2.5', y: '1.75', width: '11', height: '12.5', rx: '1.5' }],
        ['path', { d: 'M7 12h2' }]
    ]
});
