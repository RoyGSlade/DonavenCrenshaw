// The weekly time trial: /stardust/weekly/, plus the banners that point at it
// on /stardust/ and the home page.
//
// The page is built with the event's dates, rules and layout written out, so
// it reads right with JavaScript off. This adds the live countdown (to opensAt
// while upcoming, then to closesAt), the Play button once it opens, the live
// board and the comments. The event itself and its countdown come from the
// game's own code (games/stardust/systems/weekly.js), the single source of
// truth. Everything the hub returns is written with textContent.

import { boardRows, signInPath, accountPath, createHub, socialApi } from './social.js';
import { weeklyBoardText, weeklyBoardMeta, commentRows, commentProblem, countdownParts, countdownWords, COMMENT_MAX } from './profile.js';
import { createPilotUi, el } from './pilot-ui.js';

const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const BASE = window.SITE_BASE || '/';
const REFRESH_MS = 60000;
const api = socialApi(createHub(HUB));
const ui = createPilotUi({ base: BASE, hub: HUB });

// Test hook for the visual QA script (scripts/qa-site-pages.mjs): it sets
// window.__SD_NOW__ before the page loads to see the upcoming and live states.
// Only honoured on a loopback host, so it does nothing on the real site; the
// hub enforces the event window whatever the page shows.
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const FAKE_NOW = LOOPBACK && Number.isFinite(window.__SD_NOW__) ? window.__SD_NOW__ : null;
const STARTED = Date.now();
const now = () => (FAKE_NOW === null ? Date.now() : FAKE_NOW + (Date.now() - STARTED));

let weeklyModule = null;
function loadWeekly() {
    weeklyModule ||= import('../games/stardust/systems/weekly.js').catch(() => null);
    return weeklyModule;
}

// Ticks `paint` every second while it returns true.
function everySecond(paint) {
    if (!paint()) return;
    const timer = setInterval(() => { if (!paint()) clearInterval(timer); }, 1000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}

// --- Banners (/stardust/ and the home page) --------------------------------------

async function initBanners() {
    const banners = [...document.querySelectorAll('[data-sd-weekly-banner]')];
    if (!banners.length) return;
    const lib = await loadWeekly();
    if (!lib) return;
    everySecond(() => {
        let ticking = false;
        for (const banner of banners) {
            const event = lib.weeklyById(banner.dataset.eventId);
            if (!event) continue;
            const status = lib.weeklyStatus(event, now());
            const out = banner.querySelector('[data-sd-weekly-status]');
            const go = banner.querySelector('[data-sd-weekly-go]');
            banner.dataset.state = status.state;
            if (status.state === 'upcoming') {
                out.textContent = `Opens in ${status.countdown.label}`;
                if (go) go.textContent = 'See the track';
                ticking = true;
            } else if (status.state === 'live') {
                out.textContent = `Live · closes in ${status.countdown.label}`;
                if (go) go.textContent = 'Fly it now';
                ticking = true;
            } else if (status.state === 'closed') {
                out.textContent = 'Closed · see the results';
                if (go) go.textContent = 'Results';
            }
        }
        return ticking;
    });
}

// --- The weekly page ------------------------------------------------------------------

async function initPage(root) {
    const $ = (sel) => root.querySelector(sel);
    const lib = await loadWeekly();
    const event = lib?.weeklyById(root.dataset.eventId) || null;
    const podium = Number(event?.rewards?.podiumSize) || 3;
    const commentsPage = root.dataset.commentsPage;
    const gameUrl = root.dataset.gameUrl;
    const sessionPromise = api.session();
    let me = null;
    let state = root.dataset.state || 'upcoming';

    // --- Countdown and Play ---
    const clock = $('[data-wk-clock]');
    const label = $('[data-wk-clock-label]');
    const value = $('[data-wk-clock-value]');
    const spoken = $('[data-wk-clock-words]');
    const play = $('[data-wk-play]');
    const wait = $('[data-wk-play-wait]');

    function paintClock(status) {
        clock.dataset.state = status.state;
        if (status.state === 'upcoming' || status.state === 'live') {
            label.textContent = status.state === 'upcoming' ? 'Opens in' : 'Closes in';
            const parts = countdownParts(status.countdown.remainingMs);
            value.replaceChildren(...parts.map((part) => {
                const cell = el('span', 'sd-wk-seg');
                cell.append(el('span', 'sd-wk-seg-num', part.value), el('span', 'sd-wk-seg-unit', part.unit));
                return cell;
            }));
            spoken.textContent = `${status.state === 'upcoming' ? 'Opens' : 'Closes'} in ${countdownWords(status.countdown.remainingMs)}.`;
        } else {
            label.textContent = 'Final';
            value.replaceChildren(el('span', 'sd-wk-closed', 'The week is over'));
            spoken.textContent = 'This weekly has closed.';
        }
        const live = status.state === 'live';
        play.hidden = !live;
        wait.hidden = live;
        if (!live) wait.textContent = status.state === 'upcoming' ? `Opens in ${status.countdown.label}` : 'Closed';
    }

    if (event) {
        everySecond(() => {
            const status = lib.weeklyStatus(event, now());
            paintClock(status);
            if (status.state !== state) {
                state = status.state;
                root.dataset.state = state;
                loadBoard();
            }
            return status.state === 'upcoming' || status.state === 'live';
        });
    }

    // Guests who press Play are told their time won't count and offered sign-in
    // first; signed-in pilots, and everyone while the hub is asleep, go straight in.
    const gate = document.querySelector('[data-sd-gate]');
    play.addEventListener('click', async (e) => {
        if (!gate || typeof gate.showModal !== 'function' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const session = await sessionPromise;
        if (session.offline || session.data?.user) { location.assign(play.href); return; }
        gate.showModal();
    });
    gate?.addEventListener('click', (e) => { if (e.target === gate) gate.close(); });

    // --- The board ---
    const list = $('[data-wk-board-list]');
    const meta = $('[data-wk-board-meta]');
    let boardTimer = 0;

    function metaLine(text, live) {
        meta.replaceChildren();
        if (live) {
            const dot = el('span', 'sd-live-dot');
            dot.setAttribute('aria-hidden', 'true');
            meta.append(dot);
        }
        meta.append(text);
    }

    async function loadBoard() {
        if (state === 'upcoming') {
            metaLine(weeklyBoardMeta('upcoming'), false);
            list.replaceChildren(el('p', 'sd-empty', weeklyBoardText('upcoming')));
            return;
        }
        const key = state;
        const res = await api.board(root.dataset.eventId, { limit: 50 });
        if (key !== state) return;
        if (!res.ok || !Array.isArray(res.data?.entries)) {
            metaLine(weeklyBoardMeta(state, { live: false }), false);
            if (!list.querySelector('ol')) list.replaceChildren(el('p', 'sd-empty', res.offline ? 'The board lives on a small server at home, and it isn’t answering right now. The track still flies; check back in a few minutes.' : 'This board isn’t available right now.'));
            return;
        }
        metaLine(weeklyBoardMeta(state), state === 'live');
        const rows = boardRows(res.data.entries, me?.username);
        const empty = weeklyBoardText(state, rows.length);
        list.replaceChildren(empty ? el('p', 'sd-empty', empty) : ui.boardList(rows, { podium }));
    }

    // --- Comments ---
    const form = $('[data-wk-comment-form]');
    const box = form.elements.text;
    const count = $('[data-wk-comment-count]');
    const formStatus = $('[data-wk-comment-status]');
    const signIn = $('[data-wk-comment-signin]');
    const nameHint = $('[data-wk-comment-name]');
    const commentList = $('[data-wk-comment-list]');
    const commentEmpty = $('[data-wk-comment-empty]');
    const commentNote = $('[data-wk-comment-note]');

    function say(out, message, kind = 'error', link) {
        out.replaceChildren(message || '');
        if (link) {
            const a = el('a', '', link.text);
            a.href = link.href;
            out.append(' ', a, '.');
        }
        out.dataset.kind = message ? kind : '';
    }

    const accountLink = () => ({ text: 'Set one on your account page', href: accountPath(BASE, '#profile') });

    function commentItem(row) {
        const li = el('li', 'sd-wk-comment');
        const head = el('div', 'sd-wk-comment-head');
        const who = el('span', 'sd-wk-comment-who');
        who.append(ui.name(row.pilot, { className: 'sd-pilot' }));
        const chip = ui.chip(row.chip ? { title: row.chip.text, rarity: row.chip.rarity } : null);
        if (chip) who.append(' ', chip);
        head.append(ui.avatar(row.pilot, { size: 'sm' }), who);
        if (row.date) {
            const time = el('time', 'sd-wk-comment-date', row.date);
            time.dateTime = row.iso;
            head.append(time);
        }
        li.append(head, el('p', 'sd-wk-comment-text', row.text));
        if (row.canDelete) {
            const actions = el('div', 'sd-wk-comment-actions');
            const del = el('button', 'sd-btn', 'Delete');
            del.type = 'button';
            del.addEventListener('click', () => {
                const yes = el('button', 'sd-btn sd-btn--danger', 'Delete it');
                yes.type = 'button';
                const keep = el('button', 'sd-btn', 'Keep');
                keep.type = 'button';
                keep.addEventListener('click', () => { actions.replaceChildren(del); del.focus(); });
                yes.addEventListener('click', async () => {
                    yes.disabled = true;
                    const res = await api.deleteComment(row.id);
                    if (!res.ok && res.status !== 404) {
                        yes.disabled = false;
                        say(commentNote, commentProblem(res));
                        return;
                    }
                    say(commentNote, 'Comment deleted.', 'ok');
                    loadComments();
                });
                actions.replaceChildren(el('span', 'sd-wk-confirm', 'Delete this comment?'), yes, keep);
                yes.focus();
            });
            actions.append(del);
            li.append(actions);
        }
        return li;
    }

    async function loadComments() {
        const res = await api.comments(commentsPage);
        if (!res.ok) {
            if (!commentList.children.length) {
                commentEmpty.hidden = false;
                commentEmpty.textContent = res.offline ? 'Comments live on the hub, and it isn’t answering right now. Try again in a few minutes.' : 'Comments aren’t available right now.';
            }
            return;
        }
        const rows = commentRows(res.data, me, { base: BASE });
        commentList.replaceChildren(...rows.map(commentItem));
        commentEmpty.hidden = rows.length > 0;
        commentEmpty.textContent = 'No comments yet. Say hello, share a line, or call your time.';
    }

    function paintCommentForm() {
        form.hidden = !me;
        signIn.hidden = Boolean(me);
        nameHint.hidden = !me || Boolean(me.displayName);
        if (!me) {
            const a = signIn.querySelector('a');
            if (a) a.href = signInPath(BASE, `${BASE}stardust/weekly/#comments`);
        }
    }

    box.maxLength = COMMENT_MAX;
    const updateCount = () => { count.textContent = `${box.value.length} / ${COMMENT_MAX}`; };
    box.addEventListener('input', updateCount);
    updateCount();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = box.value.trim();
        if (!text) { say(formStatus, 'Write something first.'); box.focus(); return; }
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        say(formStatus, 'Posting…', 'info');
        const res = await api.postComment(commentsPage, text);
        button.disabled = false;
        if (!res.ok) {
            if (res.signedOut) { me = null; paintCommentForm(); }
            say(formStatus, commentProblem(res), 'error', res.data?.error === 'display_name_required' ? accountLink() : null);
            return;
        }
        form.reset();
        updateCount();
        say(formStatus, 'Posted.', 'ok');
        loadComments();
    });

    // --- Start ---
    const session = await sessionPromise;
    me = session.ok ? session.data?.user || null : null;
    paintCommentForm();
    await Promise.all([loadBoard(), loadComments()]);
    boardTimer = setInterval(() => { if (document.visibilityState === 'visible') loadBoard(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadBoard(); });
    window.addEventListener('pagehide', () => clearInterval(boardTimer));
}

initBanners();
const page = document.querySelector('[data-sd-weekly]');
if (page) initPage(page);
