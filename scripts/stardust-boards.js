// Live Stardust leaderboards on /stardust/, and the sign-in prompt before Play.
//
// The page is built with the hub's last snapshot of the full-network board, so
// it reads fine with JavaScript off or the hub asleep. This swaps in live
// boards from the hub, one per tab. Everything the hub returns is written with
// textContent.
//
// Signed-in pilots also get, on the full network tab, a Friends scope and a
// "Jump to my time" view of the pilots around them (docs/game/FRIENDS_CHALLENGES.md).

import { boardRows, aroundMe, nextAbove, friendlessBoard, inviteLink, inviteMessage, accountPath, playPath, problemText, createHub, socialApi } from './social.js';
import { createShareBox } from './share.js';

const root = document.querySelector('[data-sd-boards]');
const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const GAME = `${HUB}/api/games/stardust`;
const BASE = window.SITE_BASE || '/';
const REFRESH_MS = 60000;
const api = socialApi(createHub(HUB));

const two = (n) => String(n).padStart(2, '0');

async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Who is signed in. null means the hub didn't answer, which is different from
// a guest ({ user: null }).
const sessionPromise = getJson(`${HUB}/api/users/session`);

// Guests who press Play are told their times won't be saved and offered sign-in
// first. Signed-in pilots, and everyone while the hub is asleep, go straight in.
const gate = document.querySelector('[data-sd-gate]');
if (gate && typeof gate.showModal === 'function') {
    for (const link of document.querySelectorAll('a[href$="/games/stardust/"]:not([data-sd-guest])')) {
        link.addEventListener('click', async (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            const session = await sessionPromise;
            if (!session || session.user) {
                location.assign(link.href);
                return;
            }
            gate.showModal();
        });
    }
    gate.addEventListener('click', (event) => {
        if (event.target === gate) gate.close();
    });
}

// The custom track section: a live countdown until releaseAt, then Play and
// its leaderboard tab. The page is built with the release date written out, so
// it still reads right with JavaScript off. data-ready="false" (the placeholder,
// or a track that fails its checks) never opens.
async function initCustomTrack() {
    const section = document.querySelector('[data-sd-custom]');
    if (!section) return;
    let releaseCountdown;
    try {
        ({ releaseCountdown } = await import('../games/stardust/systems/customTrack.js'));
    } catch {
        return;
    }
    const status = section.querySelector('[data-sd-custom-status]');
    const play = section.querySelector('[data-sd-custom-play]');
    const tab = document.querySelector('[data-sd-custom-tab]');
    const when = status.querySelector('time')?.cloneNode(true) || null;
    const ready = section.dataset.ready === 'true';
    let timer = 0;
    const paint = () => {
        const countdown = releaseCountdown(section.dataset.releaseAt, Date.now());
        if (countdown.valid && !countdown.released) {
            const count = document.createElement('strong');
            count.textContent = `New track in ${countdown.label}`;
            status.replaceChildren(count);
            if (when) status.append(' · opens ', when, '.');
            return;
        }
        clearInterval(timer);
        timer = 0;
        if (countdown.released && ready) {
            status.textContent = 'Open now.';
            play.hidden = false;
            if (tab) tab.hidden = false;
        } else {
            status.textContent = 'Coming soon: the track is still being built.';
        }
    };
    section.querySelector('[data-sd-custom-board]')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('sd:board', { detail: 'custom-track' }));
    });
    paint();
    const counting = releaseCountdown(section.dataset.releaseAt, Date.now());
    if (counting.valid && !counting.released) timer = setInterval(paint, 1000);
}
initCustomTrack();

if (root) {
    const tabs = [...root.querySelectorAll('[data-sd-board]')];
    const list = root.querySelector('[data-sd-board-list]');
    const meta = root.querySelector('[data-sd-board-meta]');
    const note = root.querySelector('[data-sd-board-note]');
    const tools = root.querySelector('[data-sd-board-tools]');
    const scopes = [...root.querySelectorAll('[data-sd-scope]')];
    const jump = root.querySelector('[data-sd-jump]');
    const snapshot = list.innerHTML;
    let current = 'full';
    // On the full network: 'top' (global top 10), 'around' (Jump to my time)
    // or 'friends'. Other boards are always 'top'.
    let mode = 'top';
    let me = null;
    let timer = null;
    let invite = null;

    const view = () => `${current}:${current === 'full' ? mode : 'top'}`;
    const el = (tagName, className, text) => {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    function boardList(rows) {
        const ol = el('ol', 'sd-board');
        for (const row of rows) {
            const li = el('li');
            if (row.isMe) li.classList.add('is-me');
            li.append(el('span', 'sd-rank', two(row.rank)), el('span', 'sd-name', row.name), el('span', 'sd-time', row.time), el('span', 'sd-date', row.date));
            ol.append(li);
        }
        return ol;
    }

    function render(board, entries) {
        if (!entries.length) {
            list.replaceChildren(el('p', 'sd-empty', board === 'full'
                ? 'No saved runs yet. The first pilot with an account to finish all five circuits takes the top spot.'
                : board === 'custom-track'
                    ? 'No saved times on the custom track yet. Sign in, fly one lap, and it’s yours.'
                    : 'No saved times on this circuit yet. Sign in, finish it once, and it’s yours.'));
            return;
        }
        list.replaceChildren(boardList(boardRows(entries, me?.username)));
    }

    // Nobody on your friends board yet: hand over the invite link instead.
    function invitePanel() {
        if (!invite) {
            invite = createShareBox({ linkLabel: 'Your invite link', messageLabel: 'Message to send with it', buttonClass: 'sd-btn', className: 'sd-share' });
        }
        const link = inviteLink(location.origin, BASE, me.username);
        if (invite.link !== link) {
            invite.update({ link, message: inviteMessage(link), shareText: inviteMessage(), title: 'Stardust friend invite' });
            invite.link = link;
        }
        const panel = el('div', 'sd-empty sd-invite');
        const more = el('a', '', 'Add friends by username on your account page');
        more.href = accountPath(BASE, '#friends');
        const lead = el('p', '', 'No friends on your board yet. Send your invite link to someone you race; once they accept, their times show up here. ');
        lead.append(more, '.');
        panel.append(lead, invite.element);
        return panel;
    }

    function renderFriends(data) {
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        const parts = [];
        const next = nextAbove(entries, me.username);
        const mine = entries.find((entry) => entry.isMe || entry.username === me.username);
        if (next) parts.push(el('p', 'sd-next', next.text));
        else if (mine && entries.length > 1) parts.push(el('p', 'sd-next', 'You lead your friends. Nobody to chase.'));
        if (entries.length) parts.push(boardList(boardRows(entries, me.username)));
        if (friendlessBoard(entries, me.username)) parts.push(invitePanel());
        list.replaceChildren(...parts);
    }

    function renderAround(data) {
        const around = aroundMe(data, me.username);
        if (!around.hasTime) {
            const empty = el('p', 'sd-empty', 'No full-network time yet. Fly all five circuits while signed in and this jumps straight to you. ');
            const play = el('a', '', 'Fly now');
            play.href = playPath(BASE);
            empty.append(play);
            list.replaceChildren(empty);
            return;
        }
        const where = `You’re #${around.me.rank}${around.total ? ` of ${around.total}` : ''}`;
        const line = el('p', 'sd-next', around.next ? `${where} · ${around.next.text}` : `${where} · First place. Nobody to chase.`);
        const ol = boardList(around.rows);
        ol.classList.add('sd-board--window');
        list.replaceChildren(line, ol);
    }

    function live(on, label = 'Live · top 10') {
        meta.replaceChildren();
        if (on) {
            const dot = document.createElement('span');
            dot.className = 'sd-live-dot';
            dot.setAttribute('aria-hidden', 'true');
            meta.append(dot, label);
        } else {
            meta.textContent = 'Hub asleep · showing the last snapshot';
        }
    }

    function asleep(board) {
        live(false);
        if (board === 'full') list.innerHTML = snapshot;
        // The snapshot only covers the full network; an older hub may not have this board at all.
        else if (board === 'custom-track') {
            meta.textContent = 'Custom track board unavailable';
            list.replaceChildren(el('p', 'sd-empty', 'Custom track times aren’t available right now. The track still flies; check back for its leaderboard.'));
        }
    }

    async function loadSocial(key) {
        const res = mode === 'friends' ? await api.board('full', { scope: 'friends', limit: 50 }) : await api.aroundMe(3);
        if (view() !== key) return;
        if (res.signedOut) {
            // The session ended since the page loaded: back to the global board.
            me = null;
            mode = 'top';
            paintTools();
            load(current);
            return;
        }
        if (res.offline) { asleep('full'); return; }
        if (!res.ok) {
            meta.textContent = mode === 'friends' ? 'Friends board' : 'Around you';
            list.replaceChildren(el('p', 'sd-empty', problemText(res, 'That view isn’t available right now. The global board still is.')));
            return;
        }
        if (mode === 'friends') {
            live(true, 'Live · you and your friends');
            renderFriends(res.data);
        } else {
            live(true, 'Live · around you');
            renderAround(res.data);
        }
    }

    async function load(board) {
        const key = view();
        if (board === 'full' && me && mode !== 'top') return loadSocial(key);
        const data = await getJson(`${GAME}/boards/${encodeURIComponent(board)}?limit=10`);
        if (view() !== key) return;
        if (!data || !Array.isArray(data.entries)) { asleep(board); return; }
        live(true);
        render(board, data.entries);
    }

    // Scope and Jump only exist for signed-in pilots on the full network.
    function paintTools() {
        tools.hidden = !(me && current === 'full');
        for (const button of scopes) button.setAttribute('aria-pressed', String((button.dataset.sdScope === 'friends') === (mode === 'friends')));
        jump.hidden = mode === 'friends';
        jump.setAttribute('aria-pressed', String(mode === 'around'));
        jump.textContent = mode === 'around' ? 'Back to the top 10' : 'Jump to my time';
    }

    function setMode(next) {
        if (next === mode) return;
        mode = next;
        paintTools();
        load(current);
    }
    for (const button of scopes) button.addEventListener('click', () => setMode(button.dataset.sdScope === 'friends' ? 'friends' : 'top'));
    jump.addEventListener('click', () => setMode(mode === 'around' ? 'top' : 'around'));

    function select(board) {
        current = board;
        for (const tab of tabs) {
            const on = tab.dataset.sdBoard === board;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        }
        paintTools();
        load(board);
    }

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => select(tab.dataset.sdBoard));
        tab.addEventListener('keydown', (e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            // The custom track tab stays hidden until the track opens.
            const shown = tabs.filter((t) => !t.hidden);
            const i = shown.indexOf(tab);
            const next = shown[(i + step + shown.length) % shown.length];
            next.focus();
            select(next.dataset.sdBoard);
        });
    });
    // "Its leaderboard" in the custom track section.
    document.addEventListener('sd:board', (event) => {
        const tab = tabs.find((t) => t.dataset.sdBoard === event.detail && !t.hidden);
        if (tab) select(tab.dataset.sdBoard);
    });

    const session = await sessionPromise;
    me = session?.user || null;
    if (me) {
        note.replaceChildren(`Signed in as ${me.displayName || me.username}. Every circuit you finish in the game is saved here. `);
        const a = document.createElement('a');
        a.href = playPath(BASE);
        a.textContent = 'Fly now';
        note.append(a);
    }
    root.querySelector('[data-sd-board-tabs]').hidden = false;
    paintTools();
    await load(current);
    timer = setInterval(() => { if (document.visibilityState === 'visible') load(current); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(current); });
    window.addEventListener('pagehide', () => clearInterval(timer));
}

