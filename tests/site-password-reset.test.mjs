import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passwordResetToken, createPasswordResetUi, SENT_TEXT, CHANGED_TEXT } from '../scripts/password-reset.js';

test('reset fragment is removed from history before any request and never kept in the query', () => {
    const token = 'A'.repeat(43), writes = [];
    assert.equal(passwordResetToken({ hash: `#reset=${token}`, pathname: '/account/', search: '?next=%2Fgames%2F' }, { replaceState: (...a) => writes.push(a) }), token);
    assert.equal(writes[0][2], '/account/?next=%2Fgames%2F');
    assert.equal(passwordResetToken({ hash: '#reset=bad', pathname: '/account/', search: '' }, { replaceState: (...a) => writes.push(a) }), null);
    assert.equal(writes.at(-1)[2], '/account/');
    assert.equal(passwordResetToken({ hash: '#verify=' + token, pathname: '/account/', search: '' }, { replaceState: () => assert.fail() }), null);
});

// A tiny DOM: elements with hidden/disabled/textContent/dataset, forms with elements, event listeners.
function el(extra = {}) {
    const listeners = {};
    return { hidden: false, disabled: false, textContent: '', dataset: {}, listeners,
        addEventListener(type, fn) { listeners[type] = fn; }, reset() { for (const i of Object.values(this.elements || {})) i.value = ''; }, ...extra };
}
function page() {
    const forgotForm = el({ elements: { email: { value: '' } } });
    const forgotStatus = el(), contact = el({ hidden: true });
    const forgotButton = el();
    const forgot = el({ querySelector: s => s === 'form' ? forgotForm : s === '[data-password-forgot-status]' ? forgotStatus : null, querySelectorAll: () => [forgotButton] });
    forgot.querySelector = s => ({ form: forgotForm, '[data-password-forgot-status]': forgotStatus }[s] || null);
    const chooseForm = el({ elements: { password: { name: 'password', value: '' }, repeat: { value: '' } }, querySelectorAll: () => [el()] });
    const chooseStatus = el();
    const choose = el({ hidden: true });
    choose.querySelector = s => s === 'form' ? chooseForm : s === '[data-password-reset-status]' ? chooseStatus : null;
    const auth = el();
    const map = { '[data-password-forgot]': forgot, '[data-password-reset-choose]': choose, '[data-acct-auth]': auth, '[data-password-forgot-contact]': contact };
    return { root: { querySelector: s => map[s] || null }, forgotForm, forgotStatus, contact, chooseForm, chooseStatus, choose, auth };
}
const submit = (form) => form.listeners.submit({ preventDefault() {} });
const reply = (status, body) => async (url, init) => { reply.calls.push({ url, init }); return { ok: status < 400, status, json: async () => body }; };
reply.calls = [];

test('the forgot form always shows the same message and posts only the email', async () => {
    reply.calls = []; const p = page();
    createPasswordResetUi({ root: p.root, hub: 'https://hub.test', token: null, fetchImpl: reply(200, { ok: true }) });
    p.forgotForm.elements.email.value = ' pilot@example.test ';
    await submit(p.forgotForm);
    assert.equal(p.forgotStatus.textContent, SENT_TEXT);
    assert.equal(SENT_TEXT, 'If that email has an account, a reset link is on its way. It lasts 30 minutes.');
    assert.equal(reply.calls[0].url, 'https://hub.test/api/users/password-reset/request');
    assert.equal(reply.calls[0].init.headers['X-Account-Request'], '1');
    assert.deepEqual(JSON.parse(reply.calls[0].init.body), { email: 'pilot@example.test' });
    assert.equal(p.choose.hidden, true);
});

test('mail unavailable brings back the get-in-touch wording', async () => {
    const p = page();
    createPasswordResetUi({ root: p.root, hub: 'https://hub.test', token: null, fetchImpl: reply(503, { code: 'MAIL_UNAVAILABLE', error: 'x' }) });
    p.forgotForm.elements.email.value = 'a@b.test';
    await submit(p.forgotForm);
    assert.equal(p.contact.hidden, false); assert.equal(p.forgotStatus.textContent, '');
});

test('a token opens the choose-password form, hides sign-in, and success returns to sign-in', async () => {
    reply.calls = []; const p = page(); const done = [];
    createPasswordResetUi({ root: p.root, hub: 'https://hub.test', token: 'B'.repeat(43), fetchImpl: reply(200, { ok: true }), onDone: (...a) => done.push(a) });
    assert.equal(p.choose.hidden, false); assert.equal(p.auth.hidden, true);
    p.chooseForm.elements.password.value = 'new-password-123'; p.chooseForm.elements.repeat.value = 'different-password-1';
    await submit(p.chooseForm);
    assert.match(p.chooseStatus.textContent, /don’t match/); assert.equal(reply.calls.length, 0);
    p.chooseForm.elements.repeat.value = 'new-password-123';
    await submit(p.chooseForm);
    assert.deepEqual(JSON.parse(reply.calls[0].init.body), { token: 'B'.repeat(43), password: 'new-password-123' });
    assert.equal(p.choose.hidden, true); assert.equal(p.auth.hidden, false);
    assert.deepEqual(done, [[CHANGED_TEXT]]); assert.equal(CHANGED_TEXT, 'Password changed. Sign in with your new password.');
});

test('a weak password shows the server rule and keeps the token; a bad link clears it', async () => {
    const p = page(); let answer = reply(400, { code: 'WEAK_PASSWORD', error: 'Use at least 10 characters.' });
    createPasswordResetUi({ root: p.root, hub: 'https://hub.test', token: 'C'.repeat(43), fetchImpl: (...a) => answer(...a), onDone: () => {} });
    p.chooseForm.elements.password.value = p.chooseForm.elements.repeat.value = 'short1';
    await submit(p.chooseForm);
    assert.equal(p.chooseStatus.textContent, 'Use at least 10 characters.'); assert.equal(p.choose.hidden, false);
    answer = reply(400, { code: 'INVALID_RESET', error: 'This reset link is invalid or has expired. Ask for a new one.' });
    await submit(p.chooseForm);
    assert.equal(p.choose.hidden, true); assert.equal(p.auth.hidden, false);
});

test('account page wiring: layout has the forgot control and no "no reset email yet" line outside the fallback', () => {
    const html = readFileSync(new URL('../src/layouts/account.ejs', import.meta.url), 'utf8');
    assert.match(html, /Send reset link/); assert.match(html, /Set new password/); assert.match(html, /Choose a new password/);
    assert.equal(html.split("There's no reset email yet").length - 1, 1);
    assert.match(html, /data-password-forgot-contact hidden/);
    const js = readFileSync(new URL('../scripts/account.js', import.meta.url), 'utf8');
    assert.match(js, /passwordResetToken\(location, history\)/);
});
