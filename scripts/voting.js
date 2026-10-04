import { createPollCarousel, timeLabel } from './voting-carousel.js';
// Uses the existing HttpOnly Hub account cookie. No vote or identity in storage.
const root = document.querySelector('#voting-polls');
const HUB = document.querySelector('script[data-voting-hub]')?.dataset.votingHub;
const status = document.querySelector('#voting-status');
const admin = document.querySelector('#voting-admin');
const managing = document.body.dataset.votingMode === 'manage';
const accountUrl = `${window.SITE_ROOT || '/'}account/?next=${encodeURIComponent(window.location.pathname)}`;
let signedIn = false;
const carouselState = new Map();

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
        error.status = response.status; error.code = data.code; throw error;
    }
    return data;
}
function pollCard(poll) {
    if (!carouselState.has(poll.id)) carouselState.set(poll.id,{index:0,selected:null});
    return createPollCarousel(poll,{signedIn,accountUrl,state:carouselState.get(poll.id),base:window.SITE_ROOT||'/',
        submit:async optionId=>{
            const result=await call(`/polls/${poll.id}/ballot`, {optionId,confirmed:true});
            const previous=root.querySelector(`[data-poll-id="${poll.id}"]`);
            if(previous){previous.dispose?.();previous.replaceWith(pollCard(result.poll));}
        },
        expired:load, report:message=>{status.hidden=false;status.textContent=message;status.focus();}});
}
function adminPoll(poll) {
    const card = node('article'); card.append(node('h3', poll.title), node('p', poll.state, 'voting-state'), node('p', timeLabel(poll), 'voting-fine'), node('p', poll.description, 'voting-description'));
    const options = node('ol'); poll.options.forEach(o => options.append(node('li', o.label))); card.append(options);
    if (poll.state !== 'CLOSED') {
        const action = poll.state === 'DRAFT' ? 'open' : 'close';
        const button = node('button', action === 'open' ? 'Open this poll' : 'Close this poll', 'btn-noir'); button.type = 'button';
        const message = node('p'); message.setAttribute('role', 'status');
        let duration;
        if (action === 'open') {
            const label=node('label','Vote duration');duration=node('select');duration.id=`duration-${poll.id}`;label.htmlFor=duration.id;
            for(const [value,text] of [['','Not set (manual close)'],['60','1 hour'],['360','6 hours'],['720','12 hours'],['1440','1 day'],['2880','2 days'],['10080','7 days']]) {const option=node('option',text);option.value=value;duration.append(option);}
            card.append(label,duration);
        }
        button.addEventListener('click', async () => {
            const prompt = action === 'open' ? `Open “${poll.title}” to account votes? Review these priorities first; votes will be final. ${duration?.value ? `Voting lasts ${Number(duration.value)/60} hours.` : 'No closing time is set.'}` : `Close “${poll.title}”? No further votes can be submitted and this poll cannot reopen.`;
            if (!window.confirm(prompt)) return;
            button.disabled = true;
            try { await call(`/admin/polls/${poll.id}/${action}`, action === 'open' && duration.value ? {durationMinutes:Number(duration.value)} : {}); await load(); }
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
    if (signIn) signIn.hidden = signedIn || !!(root && data.polls.length);
    if (root) { root.querySelectorAll('.poll-carousel').forEach(card=>card.dispose?.()); root.replaceChildren(...data.polls.map(pollCard)); }
    status.textContent = managing
        ? (data.account.admin ? 'Owner access confirmed. Review private drafts before opening them.' : signedIn ? 'Poll management is available only to the owner.' : 'Sign in with the owner account to manage polls.')
        : data.polls.length ? (signedIn ? 'You are signed in. Each poll has its own vote.' : 'View results here. Sign in to vote in an open poll.') : 'No polls have been opened yet. Check back when I open one.';
    status.hidden = !managing && data.polls.length > 0;
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
if (status && HUB) load().catch(error => { status.hidden=false; status.textContent = error.name === 'TimeoutError' ? 'Polls took too long to load. Refresh to try again.' : error.message; });
