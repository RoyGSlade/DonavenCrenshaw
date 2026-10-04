// Accounts on donavencrenshaw.com, backed by the hub at api.donavencrenshaw.com.
//
// Loaded as a module on every page. It sets the nav's account link to the
// signed-in name, and on /account/ it runs sign-in, sign-up and the account
// settings. Everything the hub returns is written with textContent, never as
// HTML. The session is an HttpOnly cookie on the hub's own host; this script
// never sees it.
//
// Friends, challenges and Stardust progress (docs/game/FRIENDS_CHALLENGES.md)
// are drawn here too; their wording and shapes live in social.js.

import {
    BOARDS, clock, nameOf, medalLabel, medalLine, splitRows, readFriendParam, inviteState,
    requestSentText, problemText, cleanUsername, inviteLink, inviteMessage, challengeRow, challengePath,
    createHub, socialApi, discordLinkUrl, discordResult, discordUnlinkText
} from './social.js';
import { createShareBox } from './share.js';
import { profilePath, lockedTitles, sortTitles, rarityLabel } from './profile.js';
import { createPilotUi } from './pilot-ui.js';
import { paintShip, shipThumb } from './ship-ui.js';
import { familyName } from './ship-info.js';

const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;
const BASE = window.SITE_BASE || '/';

// status >= 502 or no answer at all is `offline`: the hub is asleep.
const hub = createHub(HUB, { timeoutMs: TIMEOUT_MS });
const api = socialApi(hub);
const ui = createPilotUi({ base: BASE, hub: HUB });

// Reads named form fields into a request body. Emails and usernames are trimmed;
// secrets are sent exactly as typed.
function fields(form, ...names) {
    const out = {};
    for (const name of names) {
        const value = form.elements[name]?.value ?? '';
        out[name] = /pass/i.test(name) ? value : value.trim();
    }
    return out;
}

function displayName(user) {
    return (user && (user.displayName || user.username)) || '';
}

function paintNav(user, offline) {
    for (const link of document.querySelectorAll('[data-account-link]')) {
        const label = link.querySelector('[data-account-label]');
        if (!label) continue;
        if (user) {
            label.textContent = displayName(user);
            link.setAttribute('aria-label', `Account: signed in as ${displayName(user)}`);
            link.dataset.state = 'member';
        } else {
            label.textContent = offline ? 'Account' : 'Sign in';
            link.removeAttribute('aria-label');
            link.dataset.state = offline ? 'offline' : 'guest';
        }
    }
}

async function loadSession() {
    const res = await hub('/users/session');
    if (res.offline || !res.ok) return { user: null, offline: true };
    return { user: res.data?.user ?? null, offline: false };
}

const app = document.querySelector('[data-account-app]');
const initial = await loadSession();
paintNav(initial.user, initial.offline);
if (app) runAccountPage(app, initial);

// ---------------------------------------------------------------------------

function runAccountPage(root, first) {
    const $ = (sel, scope = root) => scope.querySelector(sel);
    const $$ = (sel, scope = root) => [...scope.querySelectorAll(sel)];
    let user = first.user;

    let fresh = false;

    function show(view) {
        root.dataset.view = view;
        for (const el of $$('[data-view-only]')) el.hidden = el.dataset.viewOnly !== view;
        const title = $('[data-acct-title]');
        const lede = $('[data-acct-lede]');
        if (view === 'member') {
            title.textContent = fresh ? `Welcome, ${displayName(user)}` : `Welcome back, ${displayName(user)}`;
            lede.textContent = 'Your profile, your Stardust record and your security settings.';
        } else {
            if (view === 'guest') paintGuestInvite();
            title.textContent = 'Your account';
            lede.textContent = 'One account for the games and tools on this site. Sign in and every Stardust circuit you finish goes on the leaderboard.';
        }
    }

    function status(form, message, kind = 'error') {
        const el = form.querySelector('[data-acct-status]') || form;
        el.textContent = message || '';
        el.dataset.kind = message ? kind : '';
    }

    function markField(form, field) {
        for (const input of form.querySelectorAll('input, textarea')) input.removeAttribute('aria-invalid');
        const input = field && form.elements[field];
        if (input) {
            input.setAttribute('aria-invalid', 'true');
            input.focus();
        }
    }

    function problem(res, fallback) {
        if (res.offline) return 'The hub isn’t answering. Try again in a minute.';
        if (res.status === 429) return res.data?.error || 'Too many attempts. Wait a few minutes.';
        return res.data?.error || fallback;
    }

    async function busy(form, work) {
        const button = form.querySelector('button[type="submit"]') || form.querySelector('button');
        if (button?.disabled) return;
        if (button) button.disabled = true;
        root.setAttribute('aria-busy', 'true');
        try { await work(); } finally {
            if (button) button.disabled = false;
            root.removeAttribute('aria-busy');
        }
    }

    // ?next=/games/stardust/ sends people back where they came from after they
    // sign in or create an account. Only paths on this site are accepted.
    function returnPath() {
        const next = new URLSearchParams(location.search).get('next');
        if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
        const url = new URL(next, location.origin);
        return url.origin === location.origin ? url.pathname + url.search + url.hash : null;
    }

    function signedIn(next, { isNew = false } = {}) {
        fresh = isNew;
        user = next;
        paintNav(user, false);
        fillMember();
        show('member');
        loadStardust();
        loadDogfight();
        loadFriends();
        loadChallenges();
        loadPilotCard();
        loadShip();
        loadLiveries();
        loadVisibility();
        loadDiscord();
    }

    function signedOut(message) {
        if (!user && root.dataset.view === 'guest') return;
        user = null;
        paintNav(null, false);
        show('guest');
        selectTab('signin');
        if (message) status($('[data-acct-form="signin"]'), message, 'info');
    }

    // --- Guest: tabs and forms ---------------------------------------------

    function selectTab(name) {
        for (const tab of $$('[data-acct-tab]')) {
            const on = tab.dataset.acctTab === name;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        }
        $('[data-acct-form="signin"]').hidden = name !== 'signin';
        $('[data-acct-form="signup"]').hidden = name !== 'signup';
    }
    for (const tab of $$('[data-acct-tab]')) {
        tab.addEventListener('click', () => selectTab(tab.dataset.acctTab));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tab.dataset.acctTab === 'signin' ? 'signup' : 'signin';
            selectTab(next);
            $(`[data-acct-tab="${next}"]`).focus();
        });
    }
    if (location.hash === '#create') selectTab('signup');
    if (returnPath()) {
        const back = document.createElement('p');
        back.className = 'acct-fine';
        back.textContent = returnPath().includes('/challenge/')
            ? "You'll go straight back to the challenge after signing in."
            : returnPath().includes('/voting/')
                ? 'You\'ll return to Development votes after signing in.'
                : 'You\'ll go straight back to the game after signing in.';
        for (const form of $$('[data-acct-form="signin"], [data-acct-form="signup"]')) form.append(back.cloneNode(true));
    }

    $('[data-acct-form="signin"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const body = fields(form, 'email', 'password');
        if (!body.email || !form.elements.password.value) { status(form, 'Enter your email and password.'); markField(form, body.email ? 'password' : 'email'); return; }
        busy(form, async () => {
            status(form, 'Signing in…', 'info');
            const res = await hub('/users/login', { method: 'POST', body });
            if (!res.ok) { status(form, problem(res, 'Couldn’t sign in.')); markField(form, res.status === 401 ? 'password' : null); return; }
            form.reset();
            status(form, '');
            if (returnPath()) { location.assign(returnPath()); return; }
            signedIn(res.data.user);
        });
    });

    $('[data-acct-form="signup"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const body = fields(form, 'email', 'username', 'password');
        const secret = form.elements.password.value;
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(body.username)) { status(form, 'Usernames are 3–20 letters, numbers, - or _.'); markField(form, 'username'); return; }
        if (secret.length < 10 || !/[A-Za-z]/.test(secret) || !/\d/.test(secret)) {
            status(form, 'Use at least 10 characters, with a letter and a number.');
            markField(form, 'password');
            return;
        }
        busy(form, async () => {
            status(form, 'Creating your account…', 'info');
            const res = await hub('/users/register', { method: 'POST', body });
            if (!res.ok) { status(form, problem(res, 'Couldn’t create the account.')); markField(form, res.data?.field); return; }
            form.reset();
            status(form, '');
            if (returnPath()) { location.assign(returnPath()); return; }
            signedIn(res.data.user, { isNew: true });
        });
    });

    // --- Member ---------------------------------------------------------------

    function fillMember() {
        const name = displayName(user);
        paintIdentity();
        $('[data-acct-name]').textContent = name;
        $('[data-acct-username]').textContent = `@${user.username}`;
        const since = user.createdAt ? new Date(user.createdAt) : null;
        $('[data-acct-since]').textContent = since && !Number.isNaN(since.getTime())
            ? `joined ${since.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}`
            : '';
        const bio = $('[data-acct-bio]');
        bio.textContent = user.bio || '';
        bio.hidden = !user.bio;

        const profile = $('[data-acct-form="profile"]');
        profile.elements.displayName.value = user.displayName || '';
        profile.elements.bio.value = user.bio || '';
        profile.elements.discordUsername.value = user.discordUsername || '';
        updateCount(profile.elements.bio);
        $('[data-acct-form="email"]').elements.email.value = user.email || '';

        const link = inviteLink(location.origin, BASE, user.username);
        inviteShare.update({ link, message: inviteMessage(link), shareText: inviteMessage(), title: 'Stardust friend invite' });
    }

    // --- Pilot card: avatar, title, public profile ---------------------------------

    // The picture (preset, upload or letter) and the active title chip at the top.
    function paintIdentity() {
        const slot = $('[data-acct-monogram]');
        const picture = ui.avatar(user, { size: 'md' });
        slot.replaceChildren(...picture.childNodes);
        slot.dataset.kind = picture.dataset.kind || 'letter';
        const chip = ui.chip(user.title);
        const title = $('[data-acct-title-chip]');
        title.replaceChildren(...(chip ? [chip] : []));
        title.hidden = !chip;
        const href = profilePath(BASE, user.username);
        for (const a of $$('[data-acct-profile-link]')) if (href) a.href = href;
        paintVisibility();
    }

    let earned = [];

    function radio(name, value, checked, onPick) {
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.checked = checked;
        input.dataset.was = String(checked);
        input.addEventListener('change', () => { if (input.checked) onPick(input); });
        return input;
    }

    // Saves right away; on failure the previous choice comes back.
    async function pick(input, key, call, done) {
        const group = $$(`input[name="${input.name}"]`);
        const before = group.find((other) => other.dataset.was === 'true');
        for (const other of group) other.disabled = true;
        note(key, 'Saving…', 'info');
        const res = await call();
        for (const other of group) other.disabled = false;
        if (res.signedOut) return signedOut('Your session ended. Sign in again.');
        if (!res.ok) {
            if (before) before.checked = true;
            note(key, problemText(res, 'Couldn’t save that.'), 'error');
            return;
        }
        for (const other of group) other.dataset.was = String(other === input);
        done(res.data || {});
        paintIdentity();
        note(key, 'Saved.', 'ok');
    }

    function paintAvatars(known) {
        const grid = $('[data-acct-avatar-grid]');
        const current = user.avatarPreset || '';
        const options = [{ id: '', name: 'Letter' }, ...[...ui.avatars.values()].filter((a) => !known || known.has(a.id))];
        grid.replaceChildren(...options.map((option) => {
            const label = el('label', 'acct-avatar-opt');
            const input = radio('acct-avatar', option.id, option.id === current, (chosen) => pick(chosen, 'avatar',
                () => api.setAvatar(chosen.value || null),
                (data) => { user.avatarPreset = data.avatarPreset === undefined ? (chosen.value || null) : data.avatarPreset; }));
            input.className = 'acct-avatar-input';
            // The letter option shows the pilot's own monogram (or their upload).
            const face = ui.avatar(option.id ? { avatarPreset: option.id } : { ...user, avatarPreset: null }, { size: 'md' });
            label.append(input, face, el('span', 'acct-avatar-name', option.id ? option.name : (user.avatarUrl ? 'Upload' : 'Letter')));
            return label;
        }));
    }

    function titleOption(title, checked) {
        const label = el('label', 'acct-title-opt');
        const input = radio('acct-title', title ? title.id : '', checked, (chosen) => pick(chosen, 'title',
            () => api.setTitle(chosen.value || null),
            (data) => {
                const active = data.active === undefined ? (chosen.value || null) : data.active;
                const found = earned.find((item) => item.id === active);
                user.titleId = active;
                user.title = found ? { id: found.id, title: found.title, rarity: found.rarity } : null;
            }));
        const text = el('span', 'acct-title-text');
        if (title) {
            text.append(ui.chip(title));
            if (title.description) text.append(el('span', 'acct-title-desc', title.description));
        } else {
            text.append(el('span', 'acct-title-none', 'No title'));
        }
        label.append(input, text);
        return label;
    }

    function paintTitles(mine, all) {
        earned = sortTitles(mine?.earned);
        const active = mine?.active ?? user.titleId ?? null;
        $('[data-acct-title-list]').replaceChildren(titleOption(null, !active), ...earned.map((t) => titleOption(t, t.id === active)));
        $('[data-acct-titles-empty]').hidden = earned.length > 0;

        const locked = all ? lockedTitles(all, earned) : [];
        $('[data-acct-locked]').hidden = locked.length === 0;
        $('[data-acct-locked-count]').textContent = `(${locked.length})`;
        $('[data-acct-locked-list]').replaceChildren(...locked.map((t) => {
            const li = el('li', `acct-locked-item${t.secret ? ' is-secret' : ''}`);
            const chip = ui.chip({ title: t.title, rarity: t.rarity });
            chip.classList.add('is-locked');
            li.append(chip, el('span', 'acct-locked-meta mono', rarityLabel(t.rarity)), el('span', 'acct-locked-text', t.secret ? `Hint: ${t.text}` : t.text));
            return li;
        }));
    }

    async function loadPilotCard() {
        const [mine, all, presets] = await Promise.all([api.myTitles(), api.titles(), api.avatars()]);
        if (mine.signedOut) return signedOut('Your session ended. Sign in again.');
        // Only offer the presets the hub knows; with the hub unsure, offer the site's list.
        const known = presets.ok && Array.isArray(presets.data?.presets) ? new Set(presets.data.presets.map((p) => p.id)) : null;
        paintAvatars(known && known.size ? known : null);
        note('title', mine.ok ? '' : problemText(mine, 'Couldn’t load your titles.'), 'error');
        paintTitles(mine.ok ? mine.data : { earned: [], active: user.titleId }, all.ok ? all.data?.titles : null);
    }

    // --- Public profile: the master switch and one switch per section -------------------------

    const SHOW_LABELS = { bio: 'Bio', titles: 'Titles', bests: 'Best times', dogfight: 'Dogfight record', events: 'Event results', ship: 'Ship', devices: 'Device badges', settings: 'Flight settings' };
    // Flight settings are opt-in (the hub treats a missing key as off) and, like Event results, do not need a public profile.
    const OPT_IN = ['settings'];
    const STANDALONE = ['events', 'settings'];
    const saving = new Set();

    // Switches show what is saved; a missing key means shown (the hub's default),
    // except OPT_IN sections, which stay off until switched on.
    // While the profile is private every switch but Event results and Flight settings is off the table.
    function paintVisibility() {
        if (!user) return;
        const isPublic = Boolean(user.profilePublic);
        const show = user.profileShow && typeof user.profileShow === 'object' ? user.profileShow : {};
        $('[data-acct-public]').checked = isPublic;
        for (const input of $$('[data-acct-show-key]')) {
            const key = input.dataset.acctShowKey;
            if (!saving.has(key)) input.checked = OPT_IN.includes(key) ? show[key] === true : show[key] !== false;
            const locked = !isPublic && !STANDALONE.includes(key);
            input.disabled = saving.has(key) || locked;
            input.closest('[data-acct-show-row]').classList.toggle('is-locked', locked);
        }
        $('[data-acct-show-lock]').hidden = isPublic;
        const group = $('[data-acct-show]');
        if (isPublic) group.removeAttribute('aria-describedby');
        else group.setAttribute('aria-describedby', 'acct-show-lock');
    }

    // The session carries these too; GET /users/me is the fresher word.
    async function loadVisibility() {
        paintVisibility();
        const res = await api.account();
        if (!user || !res.ok || saving.size) return;
        const fresh = res.data?.user || res.data;
        if (!fresh || typeof fresh !== 'object') return;
        if (typeof fresh.profilePublic === 'boolean') user.profilePublic = fresh.profilePublic;
        if (fresh.profileShow && typeof fresh.profileShow === 'object') user.profileShow = fresh.profileShow;
        paintVisibility();
    }

    $('[data-acct-public]').addEventListener('change', async (e) => {
        const box = e.currentTarget;
        const wanted = box.checked;
        box.disabled = true;
        note('public', 'Saving…', 'info');
        const res = await api.setProfilePublic(wanted);
        box.disabled = false;
        if (res.signedOut) return signedOut('Your session ended. Sign in again.');
        if (!res.ok) { box.checked = !wanted; note('public', problemText(res, 'Couldn’t change that.'), 'error'); return; }
        user = res.data?.user ? { ...user, ...res.data.user } : { ...user, profilePublic: wanted };
        paintIdentity();
        note('public', wanted ? 'Saved. Your profile is public.' : 'Saved. Your profile is private.', 'ok');
    });

    for (const input of $$('[data-acct-show-key]')) {
        input.addEventListener('change', async () => {
            const key = input.dataset.acctShowKey;
            const wanted = input.checked;
            const label = SHOW_LABELS[key] || key;
            saving.add(key);
            input.disabled = true;
            note('show', `Saving ${label}…`, 'info');
            const res = await api.setProfileShow(key, wanted);
            saving.delete(key);
            if (res.signedOut) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) {
                input.checked = !wanted;
                paintVisibility();
                note('show', `Not saved. ${problemText(res, `Couldn’t change ${label}.`)}`, 'error');
                return;
            }
            const sent = res.data?.user?.profileShow && typeof res.data.user.profileShow === 'object' ? res.data.user.profileShow : user.profileShow;
            user = { ...user, ...(res.data?.user || {}), profileShow: { ...(sent || {}), [key]: wanted } };
            paintVisibility();
            note('show', `Saved. ${label} ${wanted ? 'will show' : 'is hidden'}.`, 'ok');
        });
    }

    // --- Discord -------------------------------------------------------------------------------

    // The card exists only while the hub says Discord is switched on. Linking is a
    // plain navigation: the hub sends the pilot to Discord and back here with
    // ?discord=<code>, which is read once and then removed from the address.
    let discordOn = false;
    function paintDiscord() {
        const card = $('[data-acct-discord]');
        card.hidden = !(user && discordOn);
        if (card.hidden) return;
        const linked = Boolean(user.discord?.linked);
        $('[data-acct-discord-linked]').hidden = !linked;
        $('[data-acct-discord-name]').textContent = user.discord?.name || 'your Discord account';
        const link = $('[data-acct-discord-link]');
        link.hidden = linked;
        link.href = discordLinkUrl(HUB, `${location.origin}${BASE}account/#discord`);
        $('[data-acct-discord-unlink]').hidden = !linked;
    }

    async function loadDiscord() {
        discordOn = false;
        paintDiscord();
        const code = new URLSearchParams(location.search).get('discord');
        if (code) {
            const url = new URL(location.href);
            url.searchParams.delete('discord');
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        }
        const res = await api.discordStatus();
        if (!user || !res.ok || res.data?.enabled !== true) return;
        discordOn = true;
        // The session carries the link state; GET /users/me is the fresher word after the round trip.
        const mine = await api.account();
        const fresh = mine.ok ? (mine.data?.user || mine.data) : null;
        if (user && fresh?.discord && typeof fresh.discord === 'object') user.discord = fresh.discord;
        paintDiscord();
        const result = code ? discordResult(code) : null;
        if (result) {
            note('discord', result.text, result.kind);
            $('[data-acct-discord]').scrollIntoView?.({ block: 'nearest' });
        }
    }

    $('[data-acct-discord-unlink]').addEventListener('click', (e) => {
        const actions = $('[data-acct-discord-actions]');
        const unlinkButton = e.currentTarget;
        const linkButton = $('[data-acct-discord-link]');
        confirmStep(actions, 'Unlink Discord and remove your Stardust roles?', 'Unlink', async (ev) => {
            const yes = ev.currentTarget;
            yes.disabled = true;
            const res = await api.unlinkDiscord();
            if (res.signedOut) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) {
                yes.disabled = false;
                note('discord', problemText(res, 'Couldn’t unlink Discord. Try again.'), 'error');
                return;
            }
            user = { ...user, discord: { linked: false, name: null, linkedAt: null } };
            // confirmStep swapped the buttons for its question; put the originals back before painting.
            actions.replaceChildren(linkButton, unlinkButton);
            paintDiscord();
            note('discord', discordUnlinkText(res.data), 'ok');
        });
    });

    // --- Your ship and your designs -------------------------------------------------------------

    let shipTicket = 0;
    // GET /stardust/ship: the equipped ship, drawn by the game's renderer from its
    // appearance. 404 no_ship means the standard ship. The renderer is loaded by
    // paintShip, and only when there is a ship to draw.
    async function loadShip() {
        const slot = $('[data-acct-ship]');
        const ticket = ++shipTicket;
        const name = user.username;
        note('ship', '');
        slot.replaceChildren(el('p', 'acct-hint', 'Loading your ship…'));
        const res = await api.myShip();
        if (ticket !== shipTicket || user?.username !== name) return;
        if (res.signedOut) return signedOut('Your session ended. Sign in again.');
        if (res.ok && res.data && typeof res.data === 'object') {
            paintShip(slot, res.data, { size: 256, base: BASE }).catch(() => {});
            return;
        }
        // Standard ship: nothing equipped (404 no_ship), or the hub couldn't say.
        const card = el('div', 'ship-card');
        card.dataset.state = 'text';
        const art = el('div', 'ship-art');
        art.append(el('span', 'ship-art-text', 'Standard'));
        const copy = el('div', 'ship-copy');
        copy.append(el('p', 'ship-family', 'Standard ship'), el('p', 'ship-parts', 'No custom ship is equipped.'));
        card.append(art, copy);
        slot.replaceChildren(card);
        if (res.status !== 404) note('ship', problemText(res, 'Couldn’t load your equipped ship.'), 'error');
    }

    let liveryTicket = 0;
    // Published designs, each drawn from its own appearance. The hub keeps no
    // preview images; the game's renderer paints every thumbnail here.
    async function loadLiveries() {
        const root = $('[data-acct-liveries]');
        const status = $('[data-acct-livery-status]');
        const name = user.username;
        const ticket = ++liveryTicket;
        const link = new URL(`${BASE}games/stardust/`, location.origin);
        link.searchParams.set('garageArtist', name);
        $('[data-acct-livery-link]').href = link.href;
        root.replaceChildren();
        status.textContent = 'Loading designs…';
        status.hidden = false;
        const res = await api.liveries(name);
        if (ticket !== liveryTicket || user?.username !== name) return;
        if (!res.ok) {
            status.textContent = 'The design gallery is unavailable. Your account and game records are still available.';
            return;
        }
        const designs = Array.isArray(res.data?.designs) ? res.data.designs : [];
        if (!designs.length) {
            status.textContent = 'No published designs yet. Open the ship garage in Stardust to make one.';
            return;
        }
        status.textContent = '';
        status.hidden = true;
        const cards = designs.map((design) => {
            const a = el('a', 'acct-livery');
            a.href = link.href;
            const art = el('span', 'acct-livery-art');
            art.append(el('span', 'acct-livery-fallback', familyName(design.family) || 'Ship'));
            a.append(art, el('span', 'acct-livery-title', String(design.title ?? 'Untitled')));
            root.append(a);
            return { design, art };
        });
        for (const { design, art } of cards) {
            if (ticket !== liveryTicket) return;
            const thumb = await shipThumb(design.appearance, { size: 128, base: BASE });
            if (thumb && ticket === liveryTicket) art.replaceChildren(thumb);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    function updateCount(area) {
        const out = document.getElementById(area.dataset.acctCount);
        if (out) out.textContent = `${area.value.length} / ${area.maxLength}`;
    }
    const bioField = $('[data-acct-form="profile"]').elements.bio;
    bioField.addEventListener('input', () => updateCount(bioField));

    const el = (tagName, className, text) => {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    // Stardust progress: best time, rank and medal per board, the next medal
    // when the board has medal times, and the best full run's circuit splits.
    // Medals only appear once the hub sets them for a board's version.
    async function loadStardust() {
        const list = $('[data-acct-bests]');
        const empty = $('[data-acct-bests-empty]');
        const splits = $('[data-acct-splits]');
        list.replaceChildren();
        splits.hidden = true;
        const [res, game] = await Promise.all([api.me(), api.game()]);
        if (!res.ok) { empty.hidden = false; paintStats({}); return; }
        const bests = res.data?.bests || {};
        const medals = Object.fromEntries((game.ok && Array.isArray(game.data?.boards) ? game.data.boards : [])
            .map((board) => [board.board, board.medals || null]));
        for (const [id, name] of BOARDS) {
            const best = bests[id];
            if (!best) continue;
            const li = document.createElement('li');
            const label = el('span', 'acct-best-name', name);
            if (best.medal) {
                const medal = el('span', 'acct-medal mono', medalLabel(best.medal));
                medal.dataset.medal = best.medal;
                label.append(' ', medal);
            }
            li.append(label, el('span', 'acct-time mono', clock(best.timeMs)), el('span', 'acct-rank mono', best.rank ? `#${best.rank}` : ''));
            const line = medalLine(best, medals[id]);
            if (line) li.append(el('p', 'acct-best-sub', line));
            list.append(li);
        }
        empty.hidden = list.children.length > 0;

        const rows = splitRows(bests.full?.splits);
        if (rows.length) {
            $('[data-acct-split-list]').replaceChildren(...rows.map((row) => {
                const item = el('div', 'acct-split');
                item.append(el('dt', '', row.name), el('dd', 'mono', row.time));
                return item;
            }));
            splits.hidden = false;
        }
        paintStats(bests);
    }

    function stat(key, value, sub) {
        $(`[data-acct-stat="${key}"]`).textContent = value;
        if (sub) $(`[data-acct-stat-sub="${key}"]`).textContent = sub;
    }

    function paintStats(bests) {
        const full = bests.full;
        stat('full', full ? clock(full.timeMs) : '—', full ? `All five circuits · #${full.rank} on the board` : 'Finish all five circuits while signed in');
        let fastest = null;
        for (const [id, name] of BOARDS) {
            if (id === 'full' || !bests[id]) continue;
            if (!fastest || bests[id].timeMs < fastest.timeMs) fastest = { ...bests[id], name };
        }
        stat('circuit', fastest ? clock(fastest.timeMs) : '—', fastest ? `${fastest.name} · #${fastest.rank}` : 'Any single circuit');
    }

    async function loadDogfight() {
        const res = await hub('/dogfight/me');
        if (!res.ok) { stat('wins', '—', 'Against signed-in pilots'); return; }
        const { wins = 0, played = 0 } = res.data || {};
        stat('wins', String(wins), played ? `${wins} of ${played} counted matches` : 'Play a signed-in friend to start counting');
    }

    // --- Friends --------------------------------------------------------------

    const inviteShare = createShareBox({ linkLabel: 'Invite link', messageLabel: 'Message to send with it', className: 'acct-share' });
    $('[data-acct-invite-share]').append(inviteShare.element);

    const friendParam = readFriendParam(location.search);
    // 'open' while the invite waits for an answer, 'settled' once answered (the
    // result stays on screen), 'closed' when dismissed or absent.
    let invite = friendParam ? 'open' : 'closed';
    let lists = null;

    function note(key, message, kind = 'info') {
        const out = $(`[data-acct-status="${key}"]`);
        out.textContent = message || '';
        out.dataset.kind = message ? kind : '';
    }

    function button(label, onClick, { solid = false, danger = false } = {}) {
        const b = el('button', `btn-noir${solid ? ' btn-noir--solid' : ''}${danger ? ' acct-danger-btn' : ''}`, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    // Unfriend and block ask first, in place of the row's buttons.
    function confirmStep(actions, question, yesLabel, onYes) {
        const before = [...actions.childNodes];
        const keep = () => { actions.replaceChildren(...before); before.find((node) => typeof node.focus === 'function')?.focus(); };
        const yes = button(yesLabel, onYes, { danger: true });
        actions.replaceChildren(el('span', 'acct-confirm-q', question), yes, button('Keep', keep));
        yes.focus();
    }

    // Runs one friends call from a button, then redraws the lists.
    async function friendAction(control, call, done, fallback) {
        if (control) control.disabled = true;
        const res = await call();
        if (control) control.disabled = false;
        if (res.signedOut) return signedOut('Your session ended. Sign in again.');
        if (!res.ok) { note('friends', problemText(res, fallback), 'error'); return; }
        note('friends', done, 'ok');
        await loadFriends();
    }

    function personRow(pilot, meta) {
        const li = el('li', 'acct-person');
        const who = el('div', 'acct-person-who');
        who.append(el('span', 'acct-person-name', nameOf(pilot)), el('span', 'acct-person-meta mono', [`@${pilot.username}`, meta].filter(Boolean).join(' · ')));
        const actions = el('div', 'acct-person-actions');
        li.append(who, actions);
        return { li, actions };
    }

    const since = (iso, word) => {
        const at = iso ? new Date(iso) : null;
        return at && !Number.isNaN(at.getTime()) ? `${word} ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    };

    function blockButton(pilot, actions) {
        const name = nameOf(pilot);
        return button('Block', () => confirmStep(actions, `Block ${name}? You won’t see each other’s requests or challenges.`, 'Block',
            (e) => friendAction(e.currentTarget, () => api.block(pilot.username), `${name} is blocked.`, 'Couldn’t block them.')));
    }

    function paintFriends() {
        const groups = {
            incoming: (pilot) => {
                const { li, actions } = personRow(pilot, since(pilot.sentAt, 'asked'));
                const name = nameOf(pilot);
                actions.append(
                    button('Accept', (e) => friendAction(e.currentTarget, () => api.accept(pilot.id), `You and ${name} are friends now.`, 'Couldn’t accept that request. Reload and try again.'), { solid: true }),
                    button('Decline', (e) => friendAction(e.currentTarget, () => api.decline(pilot.id), `Declined ${name}’s request.`, 'Couldn’t decline that request.')),
                    blockButton(pilot, actions)
                );
                return li;
            },
            friends: (pilot) => {
                const { li, actions } = personRow(pilot, since(pilot.since, 'since'));
                const name = nameOf(pilot);
                actions.append(
                    button('Remove', () => confirmStep(actions, `Remove ${name} from your friends?`, 'Remove',
                        (e) => friendAction(e.currentTarget, () => api.unfriend(pilot.username), `${name} is no longer a friend.`, 'Couldn’t remove them.'))),
                    blockButton(pilot, actions)
                );
                return li;
            },
            outgoing: (pilot) => {
                const { li, actions } = personRow(pilot, since(pilot.sentAt, 'sent'));
                actions.append(button('Cancel', (e) => friendAction(e.currentTarget, () => api.cancel(pilot.id), `Request to ${nameOf(pilot)} cancelled.`, 'Couldn’t cancel that request.')));
                return li;
            },
            blocked: (pilot) => {
                const { li, actions } = personRow(pilot);
                actions.append(button('Unblock', (e) => friendAction(e.currentTarget, () => api.unblock(pilot.username), `${nameOf(pilot)} is unblocked.`, 'Couldn’t unblock them.')));
                return li;
            }
        };
        for (const [key, row] of Object.entries(groups)) {
            const items = Array.isArray(lists?.[key]) ? lists[key] : [];
            $(`[data-acct-fr-list="${key}"]`).replaceChildren(...items.map(row));
            const group = $(`[data-acct-fr-group="${key}"]`);
            if (group) group.hidden = items.length === 0;
        }
        $('[data-acct-fr-empty]').hidden = Boolean(lists?.friends?.length);
    }

    async function loadFriends() {
        const res = await api.friends();
        if (res.signedOut) return signedOut('Your session ended. Sign in again.');
        if (!res.ok) {
            lists = null;
            paintFriends();
            note('friends', problemText(res, 'Couldn’t load your friends.'), 'error');
        } else {
            lists = res.data || {};
            paintFriends();
        }
        paintInvite();
    }

    $('[data-acct-form="friend"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const username = cleanUsername(form.elements.username.value);
        if (!username) { status(form, 'Enter their exact username: 3–20 letters, numbers, - or _.'); markField(form, 'username'); return; }
        busy(form, async () => {
            status(form, 'Sending…', 'info');
            const res = await api.request(username);
            if (res.signedOut) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) { status(form, problemText(res, 'Couldn’t send that request.')); markField(form, 'username'); return; }
            form.reset();
            markField(form, null);
            status(form, requestSentText(res, username), 'ok');
            await loadFriends();
        });
    });

    // --- Invite links: /account/?friend=<username> -------------------------------
    // Never sends anything by itself: the visitor presses the button.

    function dropInvite() {
        const url = new URL(location.href);
        url.searchParams.delete('friend');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }

    function paintGuestInvite() {
        const card = $('[data-acct-invite-guest]');
        card.hidden = invite !== 'open';
        if (friendParam) $('[data-acct-invite-guest-text]').textContent = `Add ${friendParam} as a friend?`;
    }
    for (const b of $$('[data-acct-invite-tab]')) {
        b.addEventListener('click', () => {
            selectTab(b.dataset.acctInviteTab);
            $(`[data-acct-form="${b.dataset.acctInviteTab}"]`).elements.email.focus();
        });
    }

    function paintInvite() {
        const card = $('[data-acct-invite]');
        const text = $('[data-acct-invite-text]');
        const actions = $('[data-acct-invite-actions]');
        if (invite === 'settled') return;
        if (!user || invite !== 'open') { card.hidden = true; return; }
        const state = inviteState(friendParam, user, lists);
        const dismiss = (label = 'Not now') => button(label, () => { invite = 'closed'; card.hidden = true; dropInvite(); });
        const settle = (message) => {
            invite = 'settled';
            note('invite', message, 'ok');
            actions.replaceChildren(dismiss('Done'));
            dropInvite();
        };
        note('invite', '');
        card.hidden = false;
        if (state === 'self') {
            text.textContent = 'This is your own invite link. Send it to someone you race.';
            actions.replaceChildren(dismiss('OK'));
        } else if (state === 'friends') {
            text.textContent = `You and ${friendParam} are already friends.`;
            actions.replaceChildren(dismiss('OK'));
        } else if (state === 'outgoing') {
            text.textContent = `Your request to ${friendParam} is waiting on them.`;
            actions.replaceChildren(dismiss('OK'));
        } else if (state === 'blocked') {
            text.textContent = `You’ve blocked ${friendParam}. Unblock them in Friends below to add them.`;
            actions.replaceChildren(dismiss('OK'));
        } else if (state === 'incoming') {
            const request = lists.incoming.find((pilot) => pilot.username.toLowerCase() === friendParam.toLowerCase());
            text.textContent = `${nameOf(request)} already asked to be friends. Accept?`;
            actions.replaceChildren(button('Accept', async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                const res = await api.accept(request.id);
                b.disabled = false;
                if (res.signedOut) return signedOut('Your session ended. Sign in again.');
                if (!res.ok) { note('invite', problemText(res, 'Couldn’t accept that request.'), 'error'); return; }
                settle(`You and ${nameOf(request)} are friends now.`);
                loadFriends();
            }, { solid: true }), dismiss());
        } else {
            text.textContent = `Add ${friendParam} as a friend?`;
            actions.replaceChildren(button('Send friend request', async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                note('invite', 'Sending…');
                const res = await api.request(friendParam);
                b.disabled = false;
                if (res.signedOut) return signedOut('Your session ended. Sign in again.');
                if (!res.ok) { note('invite', problemText(res, 'Couldn’t send that request.'), 'error'); return; }
                settle(requestSentText(res, friendParam));
                loadFriends();
            }, { solid: true }), dismiss());
        }
    }

    // --- Challenges ------------------------------------------------------------

    function challengeItem(view, box) {
        const row = challengeRow(view, box);
        const li = el('li', 'acct-ch');
        const link = el('a', 'acct-ch-link');
        link.href = challengePath(BASE, row.id);
        link.append(el('span', 'acct-ch-title', row.title), el('span', 'acct-ch-target mono', `${row.board} · ${row.target}`));
        const state = el('span', 'acct-ch-status mono', row.beaten && box === 'inbox' ? 'Beaten' : row.statusLabel);
        state.dataset.status = row.beaten && box === 'inbox' ? 'beaten' : row.status;
        li.append(link, state, el('p', 'acct-ch-detail', row.detail));
        return li;
    }

    async function loadChallenges() {
        note('challenges', '');
        const [inbox, sent] = await Promise.all([api.challenges('inbox'), api.challenges('sent')]);
        if (inbox.signedOut || sent.signedOut) return signedOut('Your session ended. Sign in again.');
        for (const [box, res] of [['inbox', inbox], ['sent', sent]]) {
            const items = res.ok && Array.isArray(res.data?.challenges) ? res.data.challenges : [];
            $(`[data-acct-ch-list="${box}"]`).replaceChildren(...items.map((view) => challengeItem(view, box)));
            $(`[data-acct-ch-empty="${box}"]`).hidden = items.length > 0 || !res.ok;
        }
        if (!inbox.ok || !sent.ok) note('challenges', problemText(inbox.ok ? sent : inbox, 'Couldn’t load your challenges.'), 'error');
    }

    $('[data-acct-form="profile"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        busy(form, async () => {
            const res = await hub('/users/profile', {
                method: 'PUT',
                body: {
                    displayName: form.elements.displayName.value,
                    bio: form.elements.bio.value,
                    discordUsername: form.elements.discordUsername.value
                }
            });
            if (res.status === 401) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) { status(form, problem(res, 'Couldn’t save your profile.')); markField(form, res.data?.field); return; }
            user = res.data.user;
            fillMember();
            paintNav(user, false);
            show('member');
            status(form, 'Saved.', 'ok');
        });
    });

    $('[data-acct-form="email"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const body = fields(form, 'email', 'currentPassword');
        if (!form.elements.currentPassword.value) { status(form, 'Enter your current password.'); markField(form, 'currentPassword'); return; }
        busy(form, async () => {
            const res = await hub('/users/profile', { method: 'PUT', body });
            if (res.status === 401) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) { status(form, problem(res, 'Couldn’t change your email.')); markField(form, res.data?.field); return; }
            user = res.data.user;
            form.elements.currentPassword.value = '';
            fillMember();
            status(form, 'Email changed. Use it next time you sign in.', 'ok');
        });
    });

    $('[data-acct-form="password"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (form.elements.newPassword.value !== form.elements.confirmPassword.value) { status(form, 'The new passwords don’t match.'); markField(form, 'confirmPassword'); return; }
        busy(form, async () => {
            const res = await hub('/users/change-password', { method: 'PUT', body: fields(form, 'currentPassword', 'newPassword') });
            if (res.status === 401) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) { status(form, problem(res, 'Couldn’t change your password.')); markField(form, res.data?.field); return; }
            form.reset();
            status(form, 'Password changed. Other devices are signed out.', 'ok');
        });
    });

    // currentTarget is null once the event finishes dispatching, so take the
    // button before the first await.
    $('[data-acct-signout]').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        await hub('/users/logout', { method: 'POST' });
        button.disabled = false;
        signedOut('Signed out.');
    });

    $('[data-acct-signout-all]').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        const res = await hub('/users/logout-all', { method: 'POST' });
        button.disabled = false;
        if (!res.ok && res.status !== 401) {
            const out = $('[data-acct-status="sessions"]');
            out.textContent = problem(res, 'Couldn’t end your sessions.');
            out.dataset.kind = 'error';
            return;
        }
        signedOut('Every session has ended, including this one.');
    });

    $('[data-acct-form="delete"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (form.elements.confirmUsername.value.trim() !== user.username) {
            status(form, `Type ${user.username} exactly to confirm.`);
            markField(form, 'confirmUsername');
            return;
        }
        busy(form, async () => {
            const res = await hub('/users/profile', { method: 'DELETE', body: fields(form, 'password') });
            if (res.status === 401) return signedOut('Your session ended. Sign in again.');
            if (!res.ok) { status(form, problem(res, 'Couldn’t delete the account.')); markField(form, res.data?.field); return; }
            form.reset();
            signedOut('Your account has been deleted.');
        });
    });

    $('[data-acct-retry]').addEventListener('click', async () => {
        show('loading');
        const again = await loadSession();
        paintNav(again.user, again.offline);
        user = again.user;
        if (again.offline) show('offline');
        else if (user) signedIn(user);
        else show('guest');
    });

    if (first.offline) show('offline');
    else if (user) signedIn(user);
    else show('guest');
}
