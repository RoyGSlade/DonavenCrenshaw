// Live Stardust leaderboards on /stardust/.
//
// The page is built with the hub's last snapshot of the full-network board, so
// it reads fine with JavaScript off or the hub asleep. This swaps in live
// boards from the hub, one per tab. Everything the hub returns is written with
// textContent.

const root = document.querySelector('[data-sd-boards]');
const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const GAME = `${HUB}/api/games/stardust`;
const REFRESH_MS = 60000;

const two = (n) => String(n).padStart(2, '0');
const clock = (ms) => {
    const t = Math.max(0, Math.round(Number(ms) || 0));
    return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
};
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

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

if (root) {
    const tabs = [...root.querySelectorAll('[data-sd-board]')];
    const list = root.querySelector('[data-sd-board-list]');
    const meta = root.querySelector('[data-sd-board-meta]');
    const note = root.querySelector('[data-sd-board-note]');
    const snapshot = list.innerHTML;
    let current = 'full';
    let me = null;
    let timer = null;

    function render(board, entries) {
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'sd-empty';
            empty.textContent = board === 'full'
                ? 'No saved runs yet. The first pilot with an account to finish all five circuits takes the top spot.'
                : 'No saved times on this circuit yet. Sign in, finish it once, and it’s yours.';
            list.replaceChildren(empty);
            return;
        }
        const ol = document.createElement('ol');
        ol.className = 'sd-board';
        for (const entry of entries) {
            const li = document.createElement('li');
            if (me && entry.username === me.username) li.classList.add('is-me');
            const cells = [
                ['sd-rank', two(entry.rank)],
                ['sd-name', entry.displayName || entry.username],
                ['sd-time', clock(entry.timeMs)],
                ['sd-date', day(entry.setAt)]
            ];
            for (const [cls, text] of cells) {
                const span = document.createElement('span');
                span.className = cls;
                span.textContent = text;
                li.append(span);
            }
            ol.append(li);
        }
        list.replaceChildren(ol);
    }

    function live(on) {
        meta.replaceChildren();
        if (on) {
            const dot = document.createElement('span');
            dot.className = 'sd-live-dot';
            dot.setAttribute('aria-hidden', 'true');
            meta.append(dot, 'Live · top 10');
        } else {
            meta.textContent = 'Hub asleep · showing the last snapshot';
        }
    }

    async function load(board) {
        const data = await getJson(`${GAME}/boards/${encodeURIComponent(board)}?limit=10`);
        if (board !== current) return;
        if (!data || !Array.isArray(data.entries)) {
            live(false);
            if (board === 'full') list.innerHTML = snapshot;
            return;
        }
        live(true);
        render(board, data.entries);
    }

    function select(board) {
        current = board;
        for (const tab of tabs) {
            const on = tab.dataset.sdBoard === board;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        }
        load(board);
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(tab.dataset.sdBoard));
        tab.addEventListener('keydown', (e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = tabs[(i + step + tabs.length) % tabs.length];
            next.focus();
            select(next.dataset.sdBoard);
        });
    });

    const session = await getJson(`${HUB}/api/users/session`);
    me = session?.user || null;
    if (me) {
        note.replaceChildren(`Signed in as ${me.displayName || me.username}. Every circuit you finish in the game is saved here. `);
        const a = document.createElement('a');
        a.href = `${window.SITE_ROOT || '/'}games/stardust/`;
        a.textContent = 'Fly now';
        note.append(a);
    }
    root.querySelector('[data-sd-board-tabs]').hidden = false;
    await load(current);
    timer = setInterval(() => { if (document.visibilityState === 'visible') load(current); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(current); });
    window.addEventListener('pagehide', () => clearInterval(timer));
}
