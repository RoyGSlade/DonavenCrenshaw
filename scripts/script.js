document.documentElement.classList.add('js');

function currentSection(pathname = window.location.pathname) {
    const segments = pathname.toLowerCase().split('/').filter(Boolean);
    const routeSegments = new Set([
        'now',
        'projects',
        'underplain',
        'crenshaw-systems',
        'infinite-ages',
        'build-log',
        'about',
        'contact',
        'support'
    ]);
    return segments.find((segment) => routeSegments.has(segment)) || 'home';
}

function markActiveNavigation() {
    const section = currentSection();
    document.querySelectorAll('.nav-links a[data-route]').forEach((link) => {
        const active = link.dataset.route === section;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

function closeNavigation(toggle, shell) {
    shell.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.innerHTML = '&#9776;';
}

function bindNavigation() {
    const toggle = document.querySelector('.nav-toggle');
    const shell = document.querySelector('.nav-shell');
    if (!toggle || !shell) return;

    toggle.addEventListener('click', () => {
        const open = shell.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        toggle.innerHTML = open ? '&#10005;' : '&#9776;';
    });

    shell.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => closeNavigation(toggle, shell));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && shell.classList.contains('nav-open')) {
            closeNavigation(toggle, shell);
            toggle.focus();
        }
    });

    window.matchMedia('(min-width: 64rem)').addEventListener('change', (event) => {
        if (event.matches) closeNavigation(toggle, shell);
    });
}

markActiveNavigation();
bindNavigation();
