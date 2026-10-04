// Confirmation is explicit and authenticated. A mail-link fragment is removed
// from history before any request; its token lives only in this page's memory.
export function emailConfirmationToken(location, history) {
    const match = /^#verify=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    if (location.hash.startsWith('#verify=')) history.replaceState(null, '', location.pathname + location.search);
    return match?.[1] || null;
}

export function createEmailVerificationUi({ root, hub, token }) {
    const section = root.querySelector('[data-email-verification]');
    if (!section) return () => {};
    const state = section.querySelector('[data-email-verification-state]');
    const feedback = section.querySelector('[data-email-verification-feedback]');
    const request = section.querySelector('[data-email-verification-request]');
    const confirm = section.querySelector('[data-email-verification-confirm]');
    let verified = false, busy = false, identity, generation = 0;
    const paint = () => {
        state.textContent = verified ? 'Email confirmed' : 'Confirm your email to vote';
        request.hidden = verified;
        confirm.hidden = verified || !token;
        request.disabled = confirm.disabled = busy;
    };
    async function send(action, body) {
        if (busy) return;
        const ticket = generation;
        busy = true; paint(); feedback.textContent = action === 'request' ? 'Sending confirmation email.' : 'Confirming email.';
        try {
            const response = await fetch(`${hub}/api/users/email-verification/${action}`, {
                method: 'POST', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', 'X-Account-Request': '1' }, body: JSON.stringify(body),
            });
            const result = await response.json();
            if (ticket !== generation) return;
            if (!response.ok) throw new Error(result.error || 'Could not confirm your email. Try again.');
            if (result.verified) { verified = true; token = null; feedback.textContent = 'Email confirmed. You can return to Community.'; }
            else { token = null; feedback.textContent = 'Check your email. The link lasts 30 minutes.'; }
        } catch (error) { if (ticket === generation) feedback.textContent = error.message || 'Could not reach the server. Try again.'; }
        finally { if (ticket === generation) { busy = false; paint(); } }
    }
    request.addEventListener('click', () => send('request', {}));
    confirm.addEventListener('click', () => send('confirm', { token }));
    const update = user => {
        const nextIdentity = user ? `${user.id}\0${user.email}` : null;
        if (identity && nextIdentity !== identity) { token = null; generation++; busy = false; feedback.textContent = ''; }
        identity = nextIdentity;
        verified = user?.emailVerified === true; paint();
    };
    update.setToken = value => { token = value; generation++; busy = false; feedback.textContent = ''; paint(); };
    return update;
}
