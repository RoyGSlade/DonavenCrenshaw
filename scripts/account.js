// Accounts on donavencrenshaw.com, backed by the hub at api.donavencrenshaw.com.
//
// Loaded as a module on every page. It sets the nav's account link to the
// signed-in name, and on /account/ it runs sign-in, sign-up and the account
// settings. Everything the hub returns is written with textContent, never as
// HTML. The session is an HttpOnly cookie on the hub's own host; this script
// never sees it.

const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;

async function hub(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${HUB}/api${path}`, {
            method,
            credentials: 'include',
            cache: 'no-store',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        let data = null;
        try { data = await res.json(); } catch { /* 204 or not JSON */ }
        return { ok: res.ok, status: res.status, data, offline: res.status >= 502 };
    } catch {
        return { ok: false, status: 0, data: null, offline: true };
    } finally {
        clearTimeout(timer);
    }
}

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
    }

    function signedOut(message) {
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
        back.textContent = 'You’ll go straight back to the game after signing in.';
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
        $('[data-acct-monogram]').textContent = name.slice(0, 1).toUpperCase();
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
    }

    function updateCount(area) {
        const out = document.getElementById(area.dataset.acctCount);
        if (out) out.textContent = `${area.value.length} / ${area.maxLength}`;
    }
    const bioField = $('[data-acct-form="profile"]').elements.bio;
    bioField.addEventListener('input', () => updateCount(bioField));

    const BOARDS = [
        ['full', 'Full run'],
        ['alpha-relay', 'Alpha Relay'],
        ['beacon-prime', 'Beacon Prime'],
        ['dustfall-station', 'Dustfall Station'],
        ['nether-crossing', 'Nether Crossing'],
        ['iron-veil', 'Iron Veil']
    ];
    const clock = (ms) => {
        const t = Math.max(0, Math.round(Number(ms) || 0));
        const two = (n) => String(n).padStart(2, '0');
        return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
    };

    async function loadStardust() {
        const list = $('[data-acct-bests]');
        const empty = $('[data-acct-bests-empty]');
        list.replaceChildren();
        const res = await hub('/games/stardust/me');
        if (!res.ok) { empty.hidden = false; paintStats({}); return; }
        const bests = res.data?.bests || {};
        for (const [id, name] of BOARDS) {
            const best = bests[id];
            if (!best) continue;
            const li = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = name;
            const time = document.createElement('span');
            time.className = 'acct-time mono';
            time.textContent = clock(best.timeMs);
            const rank = document.createElement('span');
            rank.className = 'acct-rank mono';
            rank.textContent = best.rank ? `#${best.rank}` : '';
            li.append(label, time, rank);
            list.append(li);
        }
        empty.hidden = list.children.length > 0;
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
