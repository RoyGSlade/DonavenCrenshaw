// Drawing pilots: avatar, name linked to their profile, title chip, and the
// leaderboard row every board on the site shares. Everything from the hub is
// written with textContent or as an attribute value, never as HTML. The
// wording and shapes come from profile.js; the avatar list is data/avatars.json,
// published by the build as scripts/avatars.js.

import { AVATARS } from './avatars.js';
import { deviceBadge, shipChipEl, shareMenu } from './ship-ui.js';
import { avatarIndex, avatarSrc, monogram, profilePath, titleChip } from './profile.js';

const INDEX = avatarIndex(AVATARS);

export function el(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

export function createPilotUi({ base = window.SITE_BASE || '/', hub = '' } = {}) {
    const avatars = INDEX;

    // A round picture, or the pilot's first letter when there isn't one (or it
    // fails to load). Decorative: the name always sits next to it.
    function avatar(pilot, { size = 'sm', label = '' } = {}) {
        const box = el('span', `pilot-avatar pilot-avatar--${size}`);
        const letter = () => {
            box.replaceChildren(el('span', 'pilot-avatar-letter', monogram(pilot)));
            box.dataset.kind = 'letter';
        };
        const source = avatarSrc(pilot, { avatars, base, hub });
        if (source) {
            const img = document.createElement('img');
            img.src = source.src;
            img.alt = label;
            img.decoding = 'async';
            img.loading = 'lazy';
            img.width = size === 'lg' ? 112 : size === 'md' ? 48 : 28;
            img.height = img.width;
            img.addEventListener('error', letter, { once: true });
            box.append(img);
            box.dataset.kind = source.kind;
        } else {
            letter();
        }
        if (!label) box.setAttribute('aria-hidden', 'true');
        return box;
    }

    // The name, linked to /u/?name=<username> when the pilot has one.
    function name(pilot, { className = 'pilot-link', text } = {}) {
        const words = text ?? ((pilot && (pilot.displayName || pilot.name || pilot.username)) || 'A pilot');
        const href = profilePath(base, pilot?.username);
        if (!href) return el('span', className, words);
        const a = el('a', className, words);
        a.href = href;
        return a;
    }

    function chip(title) {
        const data = titleChip(title);
        if (!data) return null;
        const span = el('span', data.className, data.text);
        span.title = data.label;
        return span;
    }

    // One leaderboard: rank, avatar, name + title chip, time, date. `rows`
    // come from social.js boardRows(). `extra(row, i)` may return nodes to add
    // after the name (the challenge page's "Beaten").
    function boardList(rows, { extra, podium = 0 } = {}) {
        const ol = el('ol', 'sd-board sd-board--pilots');
        rows.forEach((row, i) => {
            const li = el('li');
            if (row.isMe) li.classList.add('is-me');
            if (podium && Number(row.rank) <= podium) li.classList.add('is-podium');
            const pilot = { username: row.username, displayName: row.name, avatarPreset: row.avatarPreset, avatarUrl: row.avatarUrl };
            const who = el('span', 'sd-name');
            who.append(name(pilot, { className: 'sd-pilot' }));
            const badge = chip(row.title);
            if (badge) who.append(' ', badge);
            // The ship family and the device flown on, when the hub sent them.
            const ship = shipChipEl(row.ship);
            if (ship) who.append(' ', ship);
            const device = deviceBadge(row.client);
            if (device) who.append(' ', device);
            const more = extra ? extra(row, i) : null;
            if (more) who.append(' ', ...[].concat(more));
            li.append(
                el('span', 'sd-rank', String(row.rank ?? i + 1).padStart(2, '0')),
                avatar(pilot, { size: 'sm' }),
                who,
                el('span', 'sd-time', row.time),
                el('span', 'sd-date', row.date || ''),
                // Always a cell, so rows with and without the Copy menu keep their columns.
                shareCell(row, pilot)
            );
            ol.append(li);
        });
        return ol;
    }

    // "Copy" menu: fly this pilot's ship, use their settings. Empty for a row that offers neither.
    function shareCell(row, pilot) {
        const cell = el('span', 'sd-share-cell');
        const menu = shareMenu(row, { base, name: pilot.displayName || pilot.username });
        if (menu) cell.append(menu);
        return cell;
    }

    return { avatar, name, chip, boardList, avatars };
}
