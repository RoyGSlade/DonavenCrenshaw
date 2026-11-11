// The Christmas list page: join, pending, and for approved givers the list,
// Claim and Release. This repository is public and holds no list data: the
// page is a shell, and the list arrives from the private hub's GET /list for
// approved givers only (locked sections only once a printer is claimed).
//
// The device credential is an HttpOnly cookie on the hub's host; this script
// never sees it. Everything from the hub is written with textContent, never
// as HTML.

import { OFFLINE_TEXT, readList, itemState, STATE_LABEL, isClosed, closesText, joinProblem, claimProblem } from './christmas-state.js';

const root = document.querySelector('[data-xmas]');
if (root) run(root);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function run(page) {
    const tag = document.querySelector('script[data-christmas-hub]');
    const HUB = (tag?.dataset.christmasHub || 'https://api.donavencrenshaw.com').replace(/\/+$/, '');
    const API = `${HUB}/api/gifts/christmas-2026`;
    const TIMEOUT_MS = 8000;

    const $ = (selector) => page.querySelector(selector);
    const status = $('[data-xm-status]');
    const listRoot = $('[data-xm-list]');
    const views = [...page.querySelectorAll('[data-xm-only]')];
    let list = null;
    let closed = false;
    let busy = false;

    async function hub(path, { method = 'GET', body } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${API}${path}`, {
                method,
                credentials: 'include',
                cache: 'no-store',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            const raw = await res.text();
            let data = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { /* plain text, e.g. a 429 */ }
            return { ok: res.ok, status: res.status, data, text: data ? '' : raw.trim(), offline: res.status >= 502 };
        } catch {
            return { ok: false, status: 0, data: null, text: '', offline: true };
        } finally {
            clearTimeout(timer);
        }
    }

    function say(message, kind = 'info') {
        status.textContent = message || '';
        status.dataset.kind = kind;
    }

    function show(next, name) {
        for (const view of views) view.hidden = view.dataset.xmOnly !== next;
        for (const slot of page.querySelectorAll('[data-xm-name]')) slot.textContent = name || '';
        page.dataset.view = next;
        $('[data-xm-shell-lede]').hidden = next === 'approved';
        if (next !== 'approved') { list = null; listRoot.replaceChildren(); }
    }

    // --- Drawing the list ---------------------------------------------------------

    function drawItem(item) {
        const li = el('li', 'xm-item');
        li.dataset.itemId = item.id;
        const body = el('div', 'xm-item-body');
        const name = el('h3', 'xm-name');
        if (item.star) {
            const star = el('span', 'xm-star', '★');
            star.setAttribute('role', 'img');
            star.setAttribute('aria-label', 'Start here');
            name.append(star, ' ');
        }
        name.append(item.name);
        body.append(name, el('p', 'xm-why', item.why));
        if (item.pick) body.append(el('p', 'xm-pick', item.pick));
        const meta = el('p', 'xm-meta');
        meta.append(el('span', 'xm-price mono', item.price));
        if (item.link) {
            const link = el('a', 'xm-link', item.linkLabel);
            link.href = item.link;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            meta.append(' ', link);
        }
        body.append(meta);
        const action = el('div', 'xm-action');
        action.dataset.xmAction = '';
        li.append(body, action);
        return li;
    }

    function drawSection(section) {
        const el$ = el('section', 'xm-section noir-card');
        el$.dataset.sectionId = section.id;
        el$.setAttribute('aria-labelledby', `xm-sec-${section.id}`);
        const title = el('h2', 'xm-section-title', section.title);
        title.id = `xm-sec-${section.id}`;
        el$.append(title);
        if (section.blurb) el$.append(el('p', 'xm-blurb', section.blurb));
        // Supplies of an open section (e.g. the printer's) sit under their own heading once they arrive.
        const plain = section.locked ? section.items : section.items.filter((item) => !item.kit);
        const kits = section.locked ? [] : section.items.filter((item) => item.kit);
        for (const [group, heading] of [[plain, ''], [kits, 'Supplies, open now that a printer is claimed']]) {
            if (!group.length) continue;
            if (heading) el$.append(el('h3', 'xm-subhead mono', heading));
            const ul = el('ul', 'xm-items');
            ul.append(...group.map(drawItem));
            el$.append(ul);
        }
        return el$;
    }

    function drawFacts(data) {
        if (!data.sizes.length && !data.rules.length && !data.priceNote) return null;
        const card = el('section', 'noir-card xm-facts');
        card.setAttribute('aria-labelledby', 'xm-facts-title');
        const title = el('h2', 'xm-card-title mono', 'Sizes and rules');
        title.id = 'xm-facts-title';
        card.append(title);
        const grid = el('div', 'xm-facts-grid');
        for (const [heading, entries] of [['Sizes', data.sizes], ['Rules', data.rules]]) {
            if (!entries.length) continue;
            const col = el('div');
            col.append(el('h3', 'xm-mini mono', heading));
            const ul = el('ul', 'xm-plain');
            ul.append(...entries.map((entry) => el('li', '', entry)));
            col.append(ul);
            grid.append(col);
        }
        card.append(grid);
        if (data.priceNote) card.append(el('p', 'xm-fine', data.priceNote));
        return card;
    }

    function drawList() {
        const parts = [];
        if (list.title || list.closes) {
            const head = el('header', 'xm-list-head');
            if (list.closes) head.append(el('p', 'xm-eyebrow mono', `Closes ${closesText(list.closes)}`));
            if (list.intro) head.append(el('p', 'xm-lede', list.intro));
            parts.push(head);
        }
        const facts = drawFacts(list);
        if (facts) parts.push(facts);
        const sections = el('div', 'xm-sections');
        sections.append(...list.sections.map(drawSection));
        parts.push(sections);
        listRoot.replaceChildren(...parts);
        $('[data-xm-unlocked-note]').hidden = !list.claims.unlocked;
        paintActions();
    }

    // --- Claim state on each row --------------------------------------------------

    function actionButton(label, kind, onClick) {
        const button = el('button', `btn-noir xm-btn${kind === 'claim' ? ' btn-noir--solid' : ''}`, label);
        button.type = 'button';
        button.disabled = busy;
        button.addEventListener('click', onClick);
        return button;
    }

    function paintActions() {
        if (!list) return;
        const byId = new Map(list.sections.flatMap((section) => section.items.map((item) => [item.id, item])));
        for (const row of listRoot.querySelectorAll('[data-item-id]')) {
            const slot = row.querySelector('[data-xm-action]');
            const id = row.dataset.itemId;
            const item = byId.get(id) || { id };
            const state = itemState(item, list.claims);
            row.dataset.state = state;
            const parts = [];
            if (closed) { /* no buttons once the list has closed */ }
            else if (state === 'open') parts.push(actionButton('Claim', 'claim', () => claim(id)));
            else if (state === 'mine') {
                parts.push(el('span', 'xm-state xm-state--mine', STATE_LABEL.mine));
                parts.push(actionButton('Release', 'release', () => release(id)));
            } else if (state === 'locked') parts.push(el('span', 'xm-state xm-state--locked', item.lockNote));
            else parts.push(el('span', `xm-state xm-state--${state}`, STATE_LABEL[state]));
            slot.replaceChildren(...parts);
        }
    }

    // GET /list: the whole list and the claims, for approved givers only.
    async function loadList() {
        const res = await hub('/list');
        if (res.offline) { show('offline'); say(''); return false; }
        if (res.status === 401 || res.status === 403) { await start(); return false; }
        if (!res.ok) { show('offline'); say(''); return false; }
        list = readList(res.data);
        closed = isClosed(list.closes);
        drawList();
        return true;
    }

    async function claim(id) {
        if (busy) return;
        busy = true; paintActions(); say('Claiming…');
        const res = await hub('/claims', { method: 'POST', body: { itemId: id } });
        busy = false;
        if (res.ok) { say('Claimed. Thank you.', 'ok'); await loadList(); return; }
        say(claimProblem(res, 'claim'), 'error');
        if (res.status === 409) await loadList(); else paintActions();
    }

    async function release(id) {
        if (busy) return;
        busy = true; paintActions(); say('Releasing…');
        const res = await hub(`/claims/${encodeURIComponent(id)}`, { method: 'DELETE' });
        busy = false;
        if (res.ok) { say('Released.', 'ok'); await loadList(); return; }
        say(claimProblem(res, 'release'), 'error');
        paintActions();
    }

    // --- Join ---------------------------------------------------------------------

    const form = $('[data-xm-form]');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        const name = form.elements.name.value.trim();
        const email = form.elements.email.value.trim();
        const emailBad = !email || !form.elements.email.checkValidity();
        form.elements.name.setAttribute('aria-invalid', name ? 'false' : 'true');
        form.elements.email.setAttribute('aria-invalid', emailBad ? 'true' : 'false');
        if (!name || emailBad) { say('Add your name and a real email address.', 'error'); return; }
        busy = true;
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        say('Sending…');
        const res = await hub('/join', { method: 'POST', body: { name, email } });
        busy = false;
        submit.disabled = false;
        if (res.ok) { say(''); form.reset(); show('pending', name); return; }
        if (res.offline) show('offline');
        say(joinProblem(res), 'error');
    });

    $('[data-xm-retry]').addEventListener('click', () => start());

    // --- Start --------------------------------------------------------------------

    async function start() {
        say('');
        show('loading');
        const res = await hub('/me');
        if (res.offline) { show('offline'); return; }
        if (res.status === 401) { show('guest'); return; }
        if (!res.ok) { show('offline'); return; }
        const name = typeof res.data?.name === 'string' ? res.data.name : '';
        const state = res.data?.status;
        if (state === 'approved') { show('approved', name); await loadList(); }
        else if (state === 'pending') show('pending', name);
        else if (state === 'denied') show('denied', name);
        else show('guest');
    }

    start();
}
