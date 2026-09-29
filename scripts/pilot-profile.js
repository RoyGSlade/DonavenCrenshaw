// A pilot's public profile: /u/?name=<username>.
//
// Everyone sees the card (avatar, name, @username, title, joined date) and the
// pilot's weekly placements. A public profile also shows the bio, earned
// titles, Stardust bests with ranks and the Dogfight record; a private one
// says so instead. Staff profiles carry a separate "Dev times — not ranked"
// panel. Everything the hub returns is written with textContent.

import { readProfileName, profileView } from './profile.js';
import { createHub, socialApi } from './social.js';
import { createPilotUi, el } from './pilot-ui.js';

const root = document.querySelector('[data-pilot-profile]');
const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const BASE = window.SITE_BASE || '/';
const api = socialApi(createHub(HUB));
const ui = createPilotUi({ base: BASE, hub: HUB });

if (root) run(root);

function run(page) {
    const $ = (sel) => page.querySelector(sel);
    const status = $('[data-pf-status]');
    const retryRow = $('[data-pf-retry-row]');
    const body = $('[data-pf-body]');
    const privateNote = $('[data-pf-private]');
    const name = readProfileName(location.search);

    function view(state, message) {
        page.dataset.view = state;
        status.textContent = message || '';
        status.hidden = !message;
        retryRow.hidden = state !== 'offline';
    }

    function heading(text) {
        $('[data-pf-name]').textContent = text;
        document.title = `${text} · Pilot profile`;
    }

    function section(key, show) {
        $(`[data-pf-section="${key}"]`).hidden = !show;
    }

    function row(cells) {
        const li = el('li', 'sd-pf-row');
        for (const [className, text] of cells) li.append(el('span', className, text));
        return li;
    }

    function paintCard(p, raw) {
        heading(p.name || p.username);
        const picture = ui.avatar(raw, { size: 'lg' });
        picture.dataset.pfAvatar = '';
        $('[data-pf-avatar]').replaceWith(picture);
        $('[data-pf-username]').textContent = `@${p.username}`;
        const chip = ui.chip(raw.title);
        $('[data-pf-chip]').replaceChildren(...(chip ? [chip] : []));
        $('[data-pf-handle]').hidden = false;
        const joined = $('[data-pf-joined]');
        joined.textContent = p.joined;
        joined.hidden = !p.joined;
    }

    function paint(p, raw) {
        paintCard(p, raw);
        body.hidden = false;

        // Private: the card and weekly placements only (unless it's your own).
        privateNote.hidden = p.isPublic;
        privateNote.textContent = p.ownPrivate
            ? 'Your profile is private. Other pilots see only your card and weekly placements; you’re seeing everything because it’s yours. Change it on your account page.'
            : 'This pilot keeps their profile private. Their card and weekly placements are still public.';

        section('bio', p.showDetails && Boolean(p.bio));
        $('[data-pf-bio]').textContent = p.bio;

        section('titles', p.showDetails && p.titles.length > 0);
        $('[data-pf-titles]').replaceChildren(...p.titles.map((chip) => {
            const li = el('li');
            li.append(ui.chip({ title: chip.text, rarity: chip.rarity }));
            return li;
        }));

        section('bests', p.showDetails);
        $('[data-pf-bests]').replaceChildren(...p.bests.map((b) => row([['sd-pf-cell-name', b.name], ['sd-pf-cell-time', b.time], ['sd-pf-cell-rank', b.rank]])));
        $('[data-pf-bests-empty]').hidden = p.bests.length > 0;

        section('dogfight', p.showDetails && Boolean(p.dogfight));
        if (p.dogfight) {
            $('[data-pf-wins]').textContent = String(p.dogfight.wins);
            $('[data-pf-losses]').textContent = String(p.dogfight.losses);
            $('[data-pf-dogfight-empty]').hidden = p.dogfight.played > 0;
        }

        section('events', true);
        $('[data-pf-events]').replaceChildren(...p.events.map((e) => {
            const li = row([['sd-pf-cell-name', e.name], ['sd-pf-cell-time', e.time], ['sd-pf-cell-rank', e.place]]);
            if (e.podium) li.classList.add('is-podium');
            return li;
        }));
        $('[data-pf-events-empty]').hidden = p.events.length > 0;

        section('dev', p.staff);
        $('[data-pf-dev]').replaceChildren(...p.devTimes.map((d) => row([['sd-pf-cell-name', d.name], ['sd-pf-cell-time', d.time], ['sd-pf-cell-rank', d.date]])));
        $('[data-pf-dev-empty]').hidden = p.devTimes.length > 0;
    }

    async function load() {
        body.hidden = true;
        privateNote.hidden = true;
        if (!name) {
            heading('No pilot in this link');
            view('missing', 'This link is missing a username, or it got cut off. Find a pilot on the leaderboards and open their name.');
            return;
        }
        view('loading', 'Loading the pilot…');
        const res = await api.profile(name);
        if (res.offline) {
            heading(name);
            view('offline', 'Profiles live on a small server at home, and it isn’t answering right now. Try again in a few minutes.');
            return;
        }
        if (!res.ok) {
            heading('Pilot not found');
            view('missing', `No pilot is called ${name}. Usernames have to match exactly; check the link, or find them on the leaderboards.`);
            return;
        }
        const raw = res.data || {};
        view(raw.isPublic ? 'public' : 'private', '');
        paint(profileView(raw), raw);
    }

    $('[data-pf-retry]').addEventListener('click', load);
    load();
}
