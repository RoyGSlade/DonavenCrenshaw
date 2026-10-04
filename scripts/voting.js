// Uses the existing HttpOnly Hub account cookie. No vote or identity in storage.
const root = document.querySelector('#voting-polls');
const HUB = document.querySelector('script[data-voting-hub]')?.dataset.votingHub;
const status = document.querySelector('#voting-status');
const admin = document.querySelector('#voting-admin');
const managing = document.body.dataset.votingMode === 'manage';
const accountUrl = `${window.SITE_ROOT || '/'}account/?next=${encodeURIComponent(window.location.pathname)}`;
let signedIn = false;

function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}
async function call(path, body) {
    const response = await fetch(`${HUB}/api${path}`, { credentials: 'include', cache: 'no-store',
        signal: AbortSignal.timeout(10000), method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Poll-Request': '1' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(response.status === 401 ? 'Your session ended. Sign in again to vote.' : data.error || 'Could not complete the request. Try again.');
        error.status = response.status; throw error;
    }
    return data;
}
function results(poll, card) {
    card.append(node('h3', `Results · ${poll.totalVotes} ${poll.totalVotes === 1 ? 'vote' : 'votes'}`));
    const list = node('ul', undefined, 'voting-results');
    for (const option of poll.options) {
        const row = node('li');
        row.append(node('span', option.label), node('span', `${option.votes} · ${poll.totalVotes ? Math.round(option.votes * 100 / poll.totalVotes) : 0}%`));
        const meter = node('meter'); meter.min = 0; meter.max = Math.max(poll.totalVotes, 1); meter.value = option.votes;
        meter.setAttribute('aria-label', `${option.label}: ${option.votes} of ${poll.totalVotes} votes`);
        row.append(meter); list.append(row);
    }
    card.append(list);
}
function pollCard(poll) {
    const card = node('article', undefined, 'noir-card voting-poll');
    card.dataset.pollId = poll.id;
    const heading = node('h2', poll.title); heading.id = `poll-${poll.id}`;
    card.setAttribute('aria-labelledby', heading.id);
    card.append(node('p', poll.state === 'OPEN' ? 'OPEN FOR VOTES' : 'CLOSED', 'voting-state'), heading, node('p', poll.description, 'voting-description'));
    if (poll.ownVote) {
        const chosen = poll.options.find(o => o.id === poll.ownVote);
        card.append(node('p', `Your confirmed vote: ${chosen?.label || 'Recorded'}. This choice is final for this poll.`));
    } else if (poll.state === 'OPEN' && signedIn) {
        const form = node('form');
        const field = node('fieldset'); field.append(node('legend', 'Choose one development priority'));
        for (const option of poll.options) {
            const label = node('label', undefined, 'voting-choice');
            const input = node('input'); input.type = 'radio'; input.name = 'optionId'; input.value = option.id; input.required = true;
            label.append(input, node('span', option.label)); field.append(label);
        }
        const label = node('label', undefined, 'voting-confirm');
        const confirm = node('input'); confirm.type = 'checkbox'; confirm.required = true;
        label.append(confirm, node('span', 'I understand my confirmed vote is final for this poll.'));
        const button = node('button', 'Confirm my one vote', 'btn-noir'); button.type = 'submit';
        const message = node('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); message.tabIndex = -1;
        form.append(field, label, button, message);
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (!form.reportValidity()) return;
            const optionId = new FormData(form).get('optionId');
            button.disabled = true; field.disabled = true; confirm.disabled = true;
            message.textContent = 'Saving your vote…';
            try { await call(`/polls/${poll.id}/ballot`, { optionId, confirmed: true }); await load(); status.textContent = 'Your vote is recorded. Thank you.'; status.focus(); }
            catch (error) {
                message.textContent = error.message;
                if (error.status === 401) { const link = node('a', ' Sign in'); link.href = accountUrl; message.append(link); }
                message.focus();
                button.disabled = false; field.disabled = false; confirm.disabled = false;
            }
        });
        card.append(form);
    } else if (poll.state === 'OPEN') {
        const p = node('p'); const link = node('a', 'Sign in with your existing account to vote'); link.href = accountUrl;
        p.append(link); card.append(p);
    }
    results(poll, card); return card;
}
function adminPoll(poll) {
    const card = node('article'); card.append(node('h3', poll.title), node('p', poll.state, 'voting-state'), node('p', poll.description, 'voting-description'));
    const options = node('ol'); poll.options.forEach(o => options.append(node('li', o.label))); card.append(options);
    if (poll.state !== 'CLOSED') {
        const action = poll.state === 'DRAFT' ? 'open' : 'close';
        const button = node('button', action === 'open' ? 'Open this poll' : 'Close this poll', 'btn-noir'); button.type = 'button';
        const message = node('p'); message.setAttribute('role', 'status');
        button.addEventListener('click', async () => {
            const prompt = action === 'open' ? `Open “${poll.title}” to account votes? Review these priorities first; votes will be final.` : `Close “${poll.title}”? No further votes can be submitted and this poll cannot reopen.`;
            if (!window.confirm(prompt)) return;
            button.disabled = true;
            try { await call(`/admin/polls/${poll.id}/${action}`, {}); await load(); }
            catch (error) { message.textContent = error.message; button.disabled = false; }
        });
        card.append(button, message);
    }
    return card;
}
async function load() {
    const data = await call('/polls');
    signedIn = data.account.signedIn;
    const signIn = document.querySelector('#voting-signin');
    if (signIn) signIn.hidden = signedIn;
    if (root) root.replaceChildren(...data.polls.map(pollCard));
    status.textContent = managing
        ? (data.account.admin ? 'Owner access confirmed. Review private drafts before opening them.' : signedIn ? 'Poll management is available only to the owner.' : 'Sign in with the owner account to manage polls.')
        : data.polls.length ? (signedIn ? 'You are signed in. Each poll has its own vote.' : 'View results here. Sign in to vote in an open poll.') : 'No polls have been opened yet. Check back when I open one.';
    status.tabIndex = -1;
    const manageLink = document.querySelector('#voting-manage-link');
    if (manageLink) manageLink.hidden = !data.account.admin;
    if (admin) admin.hidden = !data.account.admin;
    if (admin && data.account.admin) {
        const drafts = await call('/admin/polls');
        document.querySelector('#voting-admin-polls').replaceChildren(...drafts.polls.map(adminPoll));
    }
    const sponsor = document.querySelector('#voting-sponsor');
    if (!sponsor) return;
    sponsor.hidden = true;
    if (signedIn) {
        try {
            const own = await call('/sponsors/me');
            sponsor.textContent = own.enabled && own.state === 'ACTIVE' ? 'Your GitHub sponsorship is verified privately. Thank you. Your vote has the same weight as every other account.' : 'GitHub sponsorship does not change your voting power.';
            sponsor.hidden = false;
        } catch { /* Sponsor connection never blocks voting. */ }
    }
}
document.querySelector('#voting-draft')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const data = new FormData(form); const message = document.querySelector('#voting-admin-status'); const button = form.querySelector('button');
    const options = String(data.get('options')).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 8 || options.some(v => v.length > 160)) { message.textContent = 'Enter 2–8 options, each at most 160 characters.'; return; }
    button.disabled = true;
    try {
        await call('/admin/polls', { title: data.get('title'), description: data.get('description'), options });
        form.reset(); message.textContent = 'Draft saved. Review it below before opening.'; await load();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
});
if (status && HUB) load().catch(error => { status.textContent = error.name === 'TimeoutError' ? 'Polls took too long to load. Refresh to try again.' : error.message; });
