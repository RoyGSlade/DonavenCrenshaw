// Copy and share controls for friend invites and challenge links.
//
// Nothing is sent from here. A link goes to the clipboard or to the browser's
// own share sheet, and the player decides where it goes next. When the
// clipboard is refused (older browsers, plain http previews) the text is
// selected in its read-only field so it can be copied by hand.

let count = 0;

async function copyText(text, field) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return 'copied';
        }
    } catch { /* refused: select it instead */ }
    field.focus();
    field.select();
    try { if (document.execCommand('copy')) return 'copied'; } catch { /* not supported */ }
    return 'selected';
}

// Builds a share box: the link and the prepared message in read-only fields,
// "Copy link", "Copy message" and, where the browser has one, "Share…".
// `buttonClass` lets each page use its own buttons. Returns the element and an
// update({ link, message, shareText, title }) to change what it shares.
export function createShareBox({ linkLabel = 'Link', messageLabel = 'Message', buttonClass = 'btn-noir', className = '' } = {}) {
    const n = ++count;
    const box = document.createElement('div');
    box.className = `share-box ${className}`.trim();

    const field = (label, tag, id) => {
        const wrap = document.createElement('label');
        wrap.className = 'share-field';
        wrap.htmlFor = id;
        wrap.textContent = label;
        const input = document.createElement(tag);
        input.id = id;
        input.readOnly = true;
        input.spellcheck = false;
        if (tag === 'textarea') input.rows = 4;
        else input.type = 'text';
        wrap.append(input);
        box.append(wrap);
        return input;
    };
    const linkField = field(linkLabel, 'input', `share-link-${n}`);
    const messageField = field(messageLabel, 'textarea', `share-message-${n}`);

    const actions = document.createElement('div');
    actions.className = 'share-actions';
    const button = (text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = buttonClass;
        b.textContent = text;
        actions.append(b);
        return b;
    };
    const copyLink = button('Copy link');
    const copyMessage = button('Copy message');
    const native = typeof navigator.share === 'function' ? button('Share…') : null;
    const status = document.createElement('p');
    status.className = 'share-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    box.append(actions, status);

    let payload = { link: '', message: '', shareText: '', title: 'Stardust' };
    const say = (result, what) => {
        status.textContent = result === 'copied'
            ? `${what} copied.`
            : 'Selected. Press Ctrl+C, or long-press and choose Copy.';
    };
    copyLink.addEventListener('click', async () => say(await copyText(payload.link, linkField), 'Link'));
    copyMessage.addEventListener('click', async () => say(await copyText(payload.message, messageField), 'Message'));
    native?.addEventListener('click', async () => {
        try {
            await navigator.share({ title: payload.title, text: payload.shareText || payload.message, url: payload.link });
            status.textContent = '';
        } catch (error) {
            if (error?.name !== 'AbortError') status.textContent = 'Sharing didn’t work here. Copy the link instead.';
        }
    });

    function update(next) {
        payload = { ...payload, ...next };
        linkField.value = payload.link;
        messageField.value = payload.message;
        status.textContent = '';
    }
    return { element: box, update };
}
