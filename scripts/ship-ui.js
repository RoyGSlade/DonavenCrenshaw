// Drawing ships and device badges. The words and whitelists live in ship-info.js.
//
// A ship is drawn from its `appearance` (colours, parts and saying layers) by
// the game's own renderer, so the site never shows a stored picture and never
// accepts one. The renderer and its part images are large, so the game module
// is imported only when a ship is actually on screen; a page with no ship, and
// a leaderboard that only shows chips and badges, never loads it.
//
// Everything from the hub is written with textContent or as an attribute value.

import { clientBadge, shipChip, shipSummary, DEVICE_ICON } from './ship-info.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function node(tagName, className, text) {
    const n = document.createElement(tagName);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
}

const normaliseBase = (base) => {
    const value = String(base || '/').trim();
    const lead = value.startsWith('/') ? value : `/${value}`;
    return lead.endsWith('/') ? lead : `${lead}/`;
};

// --- The game's renderer ---------------------------------------------------------------

// The game is published at <base>games/stardust/ (the build copies
// projects/Space-Shooter there), so its modules sit under systems/.
const gameRoot = (base) => `${normaliseBase(base)}games/stardust/systems/`;

let artPromise = null;
let choicesPromise = null;

// shipAppearance.js with its part images loaded. One attempt at a time; a
// failure clears itself so the next ship gets a fresh try.
export function loadShipArt(base = window.SITE_BASE || '/') {
    if (!artPromise) {
        artPromise = (async () => {
            const art = await import(`${gameRoot(base)}shipAppearance.js`);
            await art.loadShipKits();
            return art;
        })().catch((error) => { artPromise = null; throw error; });
    }
    return artPromise;
}

// The game's part names (systems/shipLivery.js). Small, no images; null when it can't load.
export function loadPartChoices(base = window.SITE_BASE || '/') {
    if (!choicesPromise) {
        choicesPromise = import(`${gameRoot(base)}shipLivery.js`)
            .then((mod) => mod.PART_CHOICES || null)
            .catch(() => { choicesPromise = null; return null; });
    }
    return choicesPromise;
}

// A canvas of the design, drawn by the game's renderer. Throws when the design
// can't be drawn (no appearance, the game refuses it, a part image is missing).
export async function shipCanvas(appearance, { size = 256, base } = {}) {
    if (!appearance || typeof appearance !== 'object') throw new Error('No appearance to draw.');
    const art = await loadShipArt(base);
    // Render big, then pose it to fill the frame (see posed()).
    return posed(art.renderAppearance(appearance, null, size * 2), size);
}

// The game frames every ship by its longest side, so a thin one (the
// twin-blade Needle is a third as wide as it is long) comes out a sliver in a
// square card. Pose it like the hangar does, nose up and to the right, and
// scale so its visible body fills the frame whatever its shape.
const POSE = (-35 * Math.PI) / 180;
function posed(src, size) {
    const w = src.width, h = src.height;
    const data = src.getContext('2d').getImageData(0, 0, w, h).data;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] < 24) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) return src;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const c = Math.abs(Math.cos(POSE)), s = Math.abs(Math.sin(POSE));
    const bw = maxX - minX + 2, bh = maxY - minY + 2;
    const scale = (0.92 * size) / Math.max(bw * c + bh * s, bw * s + bh * c);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.translate(size / 2, size / 2);
    g.rotate(POSE);
    g.scale(scale, scale);
    g.drawImage(src, -cx, -cy);
    return out;
}

// Fills `target` with a ship: its picture, its family and the parts it is built
// from. `ship` is { build, family, appearance }. While the renderer loads the
// card already names the family; if it can't draw, the family name stays as text.
export async function paintShip(target, ship, { size = 256, base } = {}) {
    const ticket = (target._shipTicket = (target._shipTicket || 0) + 1);
    const current = () => target._shipTicket === ticket;
    const first = shipSummary(ship);
    const card = node('div', 'ship-card');
    card.dataset.state = 'loading';
    const art = node('div', 'ship-art');
    art.append(node('span', 'ship-art-text', first ? first.name : 'Ship'));
    const family = node('p', 'ship-family', first ? first.name : 'Ship');
    const parts = node('p', 'ship-parts');
    parts.hidden = true;
    card.append(art, node('div', 'ship-copy'));
    card.lastChild.append(family, parts);
    target.replaceChildren(card);

    const [choices, drawn] = await Promise.all([
        loadPartChoices(base),
        shipCanvas(ship?.appearance, { size, base }).catch(() => null)
    ]);
    if (!current()) return first;
    const summary = shipSummary(ship, choices) || first;
    if (summary?.parts.length) {
        parts.textContent = summary.parts.map((p) => `${p.name} ${p.label.toLowerCase()}`).join(' · ');
        parts.hidden = false;
    }
    if (drawn) {
        drawn.className = 'ship-canvas';
        drawn.setAttribute('role', 'img');
        drawn.setAttribute('aria-label', `${summary?.text || 'Ship'}`);
        art.replaceChildren(drawn);
        card.dataset.state = 'drawn';
    } else {
        // Stays readable: the family name is already in the art slot and the caption.
        card.dataset.state = 'text';
    }
    return summary;
}

// A small thumbnail for a list of designs. Resolves to a canvas, or null when it can't be drawn.
export async function shipThumb(appearance, { size = 128, base } = {}) {
    try {
        const canvas = await shipCanvas(appearance, { size, base });
        canvas.className = 'ship-thumb';
        canvas.setAttribute('aria-hidden', 'true');
        return canvas;
    } catch {
        return null;
    }
}

// --- Leaderboard row extras ----------------------------------------------------------------

// NEEDLE / MANTA / WISP / COURIER. null when the row has no ship.
export function shipChipEl(ship) {
    const chip = shipChip(ship);
    if (!chip) return null;
    const span = node('span', `sd-ship-chip sd-ship-chip--${chip.family}`, chip.text);
    span.title = chip.label;
    return span;
}

function deviceIcon(device) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tagName, attrs] of DEVICE_ICON[device]) {
        const part = document.createElementNS(SVG_NS, tagName);
        for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
        svg.append(part);
    }
    return svg;
}

let closeOpenTip = null;
let listening = false;
function watchOutside() {
    if (listening) return;
    listening = true;
    document.addEventListener('click', (event) => { if (closeOpenTip && !event.target.closest?.('.sd-device-wrap')) closeOpenTip(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && closeOpenTip) closeOpenTip(); });
}

// "Flown on a phone with tilt": an icon with the words as its tooltip (title),
// its accessible name (aria-label), and, for touch screens with no hover, a tap
// that shows the same words next to it. null when the row has no client.
export function deviceBadge(client) {
    const info = clientBadge(client);
    if (!info) return null;
    const wrap = node('span', 'sd-device-wrap');
    const button = node('button', 'sd-device');
    button.type = 'button';
    button.title = info.label;
    button.setAttribute('aria-label', info.label);
    button.dataset.device = info.device;
    if (info.input) button.dataset.input = info.input;
    button.setAttribute('aria-expanded', 'false');
    button.append(deviceIcon(info.device));
    const tip = node('span', 'sd-device-tip', info.label);
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    const close = () => { tip.hidden = true; button.setAttribute('aria-expanded', 'false'); if (closeOpenTip === close) closeOpenTip = null; };
    button.addEventListener('click', () => {
        if (!tip.hidden) return close();
        if (closeOpenTip) closeOpenTip();
        tip.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        closeOpenTip = close;
    });
    watchOutside();
    wrap.append(button, tip);
    return wrap;
}
