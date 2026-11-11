// Forgot-password by email. A mail-link fragment (#reset=<token>) is removed from history
// before any request; its token lives only in this page's memory. All text is set with
// textContent. The hub answers the same whether or not an email has an account.
export const SENT_TEXT = 'If that email has an account, a reset link is on its way. It lasts 30 minutes.';
export const CHANGED_TEXT = 'Password changed. Sign in with your new password.';

export function passwordResetToken(location, history) {
    const match = /^#reset=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    if (location.hash.startsWith('#reset=')) history.replaceState(null, '', location.pathname + location.search);
    return match?.[1] || null;
}

export function createPasswordResetUi({ root, hub, token, fetchImpl = globalThis.fetch?.bind(globalThis), onDone = () => {} }) {
    const q = sel => root.querySelector(sel);
    const forgot = q('[data-password-forgot]');
    const choose = q('[data-password-reset-choose]');
    if (!forgot || !choose) return Object.assign(() => {}, { setToken() {} });
    const auth = q('[data-acct-auth]');
    const forgotStatus = forgot.querySelector('[data-password-forgot-status]');
    const contact = q('[data-password-forgot-contact]');
    const chooseForm = choose.querySelector('form');
    const chooseStatus = choose.querySelector('[data-password-reset-status]');
    let busy = false;

    const say = (el, text, kind = 'info') => { el.textContent = text; el.dataset.kind = text ? kind : ''; };
    const post = async (action, body) => {
        try {
            const res = await fetchImpl(`${hub}/api/users/password-reset/${action}`, {
                method: 'POST', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', 'X-Account-Request': '1' }, body: JSON.stringify(body),
            });
            let data = null; try { data = await res.json(); } catch { /* not JSON */ }
            return { ok: res.ok, status: res.status, data };
        } catch { return { ok: false, status: 0, data: null }; }
    };
    const paint = () => {
        choose.hidden = !token;
        if (auth) auth.hidden = Boolean(token);
        for (const b of [...forgot.querySelectorAll('button'), ...chooseForm.querySelectorAll('button')]) b.disabled = busy;
    };

    const emailForm = forgot.querySelector('form') || forgot;
    emailForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const email = String(emailForm.elements.email?.value ?? '').trim();
        if (!email) { say(forgotStatus, 'Enter your email address.', 'error'); return; }
        contact.hidden = true;
        busy = true; paint(); say(forgotStatus, 'Sending…');
        const res = await post('request', { email });
        busy = false; paint();
        if (res.ok) { say(forgotStatus, SENT_TEXT, 'ok'); return; }
        if (res.data?.code === 'MAIL_UNAVAILABLE') { say(forgotStatus, ''); contact.hidden = false; return; }
        say(forgotStatus, res.status === 0 || res.status >= 502 ? 'The hub isn’t answering. Try again in a minute.'
            : res.data?.error || 'Couldn’t send the link. Try again.', 'error');
    });

    chooseForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !token) return;
        const typed = chooseForm.elements.password.value;
        if (typed !== chooseForm.elements.repeat.value) { say(chooseStatus, 'The two passwords don’t match.', 'error'); return; }
        busy = true; paint(); say(chooseStatus, 'Saving…');
        const res = await post('confirm', { token, [chooseForm.elements.password.name]: typed });
        busy = false;
        if (res.ok) {
            token = null; chooseForm.reset(); say(chooseStatus, ''); paint();
            onDone(CHANGED_TEXT);
            return;
        }
        if (res.data?.code === 'INVALID_RESET') token = null; // used or expired: ask for a new one
        paint();
        say(chooseStatus, res.status === 0 || res.status >= 502 ? 'The hub isn’t answering. Try again in a minute.'
            : res.data?.error || 'Couldn’t change the password. Try again.', 'error');
        if (!token) { choose.hidden = true; if (auth) auth.hidden = false; onDone(res.data?.error || '', 'error'); }
    });

    const update = () => paint();
    update.setToken = value => { token = value; busy = false; chooseForm.reset(); say(chooseStatus, ''); paint(); };
    paint();
    return update;
}
