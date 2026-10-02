// Visit counter for donavencrenshaw.com. Loaded as a module on every page.
//
// Sends one small beacon per page view to the hub (POST /api/metrics/view),
// which adds it to a daily count per page and source. The beacon carries the
// page path (no query or hash) and where the visit came from: a ?via= tag the
// owner put on a link, else the referring site's hostname, else "direct".
// No cookie is set or sent, nothing is stored in the browser, and nothing ties
// the view to an account or a device. A browser that sends Global Privacy
// Control or Do Not Track is not counted at all. See content/privacy.md.

const VIA = /^[a-z0-9-]{1,32}$/;
const HOST = /^[a-z0-9][a-z0-9.-]{0,63}$/;

// Global Privacy Control and Do Not Track both switch the counter off.
export function optedOut(nav) {
    if (!nav) return false;
    return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes';
}

const bareHost = (host) => String(host || '').toLowerCase().replace(/^www\./, '');

// The ?via= tag when it is a short lowercase tag, else the referring hostname
// when it is another site, else "internal" (a click from another page here) or
// "direct". Only the hostname of a referrer is ever kept.
export function sourceOf({ search = '', referrer = '', host = '' } = {}) {
    let via = '';
    try { via = (new URLSearchParams(search).get('via') || '').trim().toLowerCase(); } catch { /* no query */ }
    if (VIA.test(via)) return via;
    if (!referrer) return 'direct';
    let from = '';
    try { from = bareHost(new URL(referrer).hostname); } catch { return 'direct'; }
    if (!from) return 'direct';
    if (from === bareHost(host)) return 'internal';
    return HOST.test(from) ? from : 'other';
}

// The beacon body: { p: path, s: source }. The path never includes the query or hash.
export function viewBody({ pathname = '/', search = '', referrer = '', host = '' } = {}) {
    return JSON.stringify({ p: String(pathname || '/').split(/[?#]/, 1)[0] || '/', s: sourceOf({ search, referrer, host }) });
}

// A simple CORS request (text/plain, no cookies), so the browser sends no preflight.
export function sendView(url, body, { fetchImpl = globalThis.fetch, nav = globalThis.navigator } = {}) {
    try {
        if (typeof fetchImpl === 'function') {
            fetchImpl(url, {
                method: 'POST', body, mode: 'cors', credentials: 'omit', keepalive: true,
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
            }).catch(() => {});
            return true;
        }
        if (nav && typeof nav.sendBeacon === 'function') return nav.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch { /* counting must never break a page */ }
    return false;
}

// Counts this page view unless the visitor opted out or no hub is configured.
export function trackView({ hub, nav, location, referrer, send = sendView }) {
    const origin = String(hub || '').trim().replace(/\/+$/, '');
    if (!origin || optedOut(nav)) return false;
    const body = viewBody({ pathname: location.pathname, search: location.search, referrer, host: location.hostname });
    return send(`${origin}/api/metrics/view`, body) !== false;
}

if (typeof document !== 'undefined') {
    const tag = document.querySelector('script[data-visits-hub]');
    const count = () => trackView({ hub: tag?.dataset.visitsHub, nav: navigator, location, referrer: document.referrer });
    // A page the browser prerendered is counted when the visitor opens it.
    if (document.prerendering) document.addEventListener('prerenderingchange', count, { once: true });
    else count();
}
