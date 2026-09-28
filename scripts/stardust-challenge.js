// The challenge landing page: /stardust/challenge/?c=<id>.
//
// Shows who sent the challenge, whose run it is, the target time and board,
// whether it is still open, and the attempts so far, with a Play button that
// launches the game against it. Anyone can view a challenge; only a signed-in
// attempt counts. When the challenge can't be raced (expired, track changed,
// unknown, hub asleep) the page says so plainly and still offers a normal run.
// Everything the hub returns is written with textContent.

import {
    readChallengeId, clock, day, nameOf, boardName, statusLabel, versusText, splitRows, boardRows,
    challengeLink, challengeMessage, challengePath, playPath, signInPath, createHub, socialApi
} from './social.js';
import { createShareBox } from './share.js';

const root = document.querySelector('[data-sd-challenge]');
const tag = document.querySelector('script[data-hub]');
const HUB = (tag?.dataset.hub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
const BASE = window.SITE_BASE || '/';
const api = socialApi(createHub(HUB));

if (root) run();

function run() {
    const $ = (sel) => root.querySelector(sel);
    const title = $('[data-ch-title]');
    const lede = $('[data-ch-lede]');
    const facts = $('[data-ch-facts]');
    const you = $('[data-ch-you]');
    const play = $('[data-ch-play]');
    const retry = $('[data-ch-retry]');
    const id = readChallengeId(location.search);
    let share = null;

    const el = (tagName, className, text) => {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    function heading(text) {
        title.textContent = text;
        document.title = `${text} · Stardust challenge`;
    }

    function say(text, kind = '') {
        lede.textContent = text;
        lede.dataset.kind = kind;
    }

    // Play with the challenge attached only while it can count; otherwise a
    // normal run, labelled as one.
    function playButton(challengeId) {
        play.href = playPath(BASE, challengeId);
        play.replaceChildren(challengeId ? 'Take the challenge ' : 'Play a normal run ');
        const arrow = el('span', '', '→');
        arrow.setAttribute('aria-hidden', 'true');
        play.append(arrow);
    }

    function fact(label, value, className) {
        const row = el('div');
        row.append(el('dt', '', label), el('dd', className, value));
        return row;
    }

    function paintFacts(c) {
        const target = c.target || {};
        const rows = [
            fact('Time to beat', clock(target.timeMs), 'sd-ch-time'),
            fact('Pilot', nameOf(target.pilot)),
            fact('Board', `${boardName(c.board, c.boardName)} · v${c.version}`),
            fact('Status', statusLabel(c.status))
        ];
        if (c.from && c.from.username !== target.pilot?.username) rows.splice(2, 0, fact('Sent by', nameOf(c.from)));
        if (c.to) rows.push(fact('Sent to', nameOf(c.to)));
        if (c.status === 'active' && c.expiresAt) rows.push(fact('Open until', day(c.expiresAt)));
        if (target.setAt) rows.push(fact('Flown', day(target.setAt)));
        facts.replaceChildren(...rows);
        facts.hidden = false;
    }

    function paintSplits(c) {
        const rows = splitRows(c.target?.splits);
        $('[data-ch-splits-section]').hidden = rows.length === 0;
        $('[data-ch-splits]').replaceChildren(...rows.map((row) => fact(row.name, row.time)));
    }

    function paintAttempts(c, me) {
        const attempts = Array.isArray(c.attempts) ? c.attempts : [];
        const box = $('[data-ch-attempts]');
        $('[data-ch-attempts-section]').hidden = false;
        if (!attempts.length) {
            box.replaceChildren(el('p', 'sd-empty', c.status === 'active' ? 'No attempts yet. Be the first.' : 'Nobody attempted this one.'));
            return;
        }
        // Attempts come best first; number them in that order.
        const rows = boardRows(attempts.map((a, i) => ({ ...a, rank: i + 1, timeMs: a.bestMs })), me?.username);
        const ol = el('ol', 'sd-board');
        rows.forEach((row, i) => {
            const li = el('li');
            if (row.isMe) li.classList.add('is-me');
            // The badge sits in the name cell so it survives the narrow layout.
            const name = el('span', 'sd-name', row.name);
            if (attempts[i].beaten) name.append(' ', el('span', 'sd-badge', 'Beaten'));
            li.append(el('span', 'sd-rank', String(row.rank).padStart(2, '0')), name, el('span', 'sd-time', row.time), el('span', 'sd-date', ''));
            ol.append(li);
        });
        box.replaceChildren(ol);
    }

    function paintYou(c) {
        const viewer = c.viewer;
        if (!viewer) { you.hidden = true; return; }
        if (viewer.isCreator) {
            you.textContent = 'You sent this challenge.';
        } else {
            you.textContent = viewer.beaten
                ? `Beaten. Your best: ${versusText(viewer.bestMs, c.target?.timeMs)}`
                : `Your best: ${versusText(viewer.bestMs, c.target?.timeMs)}`;
        }
        you.dataset.beaten = String(Boolean(viewer.beaten));
        you.hidden = false;
    }

    function paintSignIn(signedIn) {
        const note = $('[data-ch-signin]');
        note.hidden = signedIn;
        if (signedIn) return;
        const back = challengePath(BASE, id);
        $('[data-ch-signin-link]').href = signInPath(BASE, back);
        $('[data-ch-create-link]').href = signInPath(BASE, back, { create: true });
    }

    function paintShare(c, me) {
        if (!share) {
            share = createShareBox({ linkLabel: 'Challenge link', messageLabel: 'Message to send with it', buttonClass: 'sd-btn', className: 'sd-share' });
            $('[data-ch-share]').append(share.element);
        }
        const link = challengeLink(location.origin, BASE, c.id || id);
        const words = { timeMs: c.target?.timeMs, board: c.board, boardName: c.boardName, pilotName: nameOf(c.target?.pilot), mine: Boolean(me && me.username === c.target?.pilot?.username) };
        share.update({ link, message: challengeMessage({ ...words, link }), shareText: challengeMessage(words), title: 'Stardust challenge' });
        $('[data-ch-share-section]').hidden = false;
    }

    function unavailable(headline, message) {
        heading(headline);
        say(message, 'warn');
        playButton(null);
    }

    async function load() {
        retry.hidden = true;
        if (!id) {
            unavailable('No challenge in this link', 'This link is missing its challenge code, or it got cut off. Ask whoever sent it for a fresh one, or fly a normal run.');
            return;
        }
        say('Loading the challenge…');
        const [session, res] = await Promise.all([api.session(), api.challenge(id)]);
        if (res.offline) {
            unavailable('The hub is asleep', 'Challenges live on a small server at home, and it isn’t answering right now. You can still fly a normal run; it just won’t count against this challenge. Try again in a few minutes.');
            retry.hidden = false;
            return;
        }
        if (!res.ok) {
            // Unknown, withdrawn and blocked all look the same from here, on purpose.
            unavailable('Challenge not found', 'This challenge doesn’t exist, or isn’t open to you. Check the link with whoever sent it, or fly a normal run.');
            return;
        }
        const c = res.data || {};
        const me = session.ok ? session.data?.user || null : null;
        const pilot = nameOf(c.target?.pilot) || 'a pilot';
        const time = clock(c.target?.timeMs);
        paintFacts(c);
        paintSplits(c);
        paintAttempts(c, me);
        paintYou(c);
        $('[data-ch-share-section]').hidden = true;

        if (c.status === 'expired') {
            heading(`${pilot}’s ${time} has expired`);
            say(`This challenge closed on ${day(c.expiresAt)}. The time still stands; fly a normal run and chase it anyway.`, 'warn');
            playButton(null);
            paintSignIn(true);
            return;
        }
        if (c.status === 'outdated') {
            heading(`The track changed since ${pilot}’s ${time}`);
            say('The full network has been updated since this time was set, so it can’t be raced as a challenge any more. Fly the current track and set a new time to send.', 'warn');
            playButton(null);
            paintSignIn(true);
            return;
        }
        if (c.status !== 'active') {
            unavailable('This challenge isn’t open', 'It can’t be raced right now. You can still fly a normal run.');
            return;
        }
        heading(me && me.username === c.target?.pilot?.username ? `Your ${time} is on the line` : `Beat ${pilot}’s ${time}`);
        const sender = c.from && c.from.username !== c.target?.pilot?.username ? ` ${nameOf(c.from)} sent it on.` : '';
        const task = c.board === 'full' ? 'Fly all five circuits' : `Fly ${boardName(c.board, c.boardName)}`;
        say(`${task} faster than ${time}.${sender}`);
        playButton(c.id || id);
        paintSignIn(Boolean(me || c.viewer));
        paintShare(c, me);
    }

    retry.addEventListener('click', load);
    load();
}
