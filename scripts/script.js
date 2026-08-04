document.documentElement.classList.add('js');

function currentSection(pathname = window.location.pathname) {
    const segments = pathname.toLowerCase().split('/').filter(Boolean);
    if (segments[0] === 'projects' && segments[1] === 'betterfingers') return 'underplain';
    const routeSegments = new Set([
        'now',
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

    const currentPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    document.querySelectorAll('.nav-submenu a[data-nav-path]').forEach((link) => {
        const linkPath = new URL(link.href, window.location.href).pathname.replace(/\/+$/, '').toLowerCase();
        const active = linkPath === currentPath;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

function setSubmenu(group, open) {
    const toggle = group.querySelector('.nav-submenu-toggle');
    if (!toggle) return;
    group.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
}

function bindBranchNavigation() {
    const groups = [...document.querySelectorAll('.nav-group')];
    const activeSection = currentSection();

    groups.forEach((group) => {
        const toggle = group.querySelector('.nav-submenu-toggle');
        if (!toggle) return;

        if (group.dataset.navGroup === activeSection) setSubmenu(group, true);
        toggle.addEventListener('click', () => {
            const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
            groups.forEach((candidate) => setSubmenu(candidate, candidate === group && willOpen));
        });
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

function bindRoadmapDialog() {
    const dialog = document.querySelector('#roadmap-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const title = dialog.querySelector('#roadmap-dialog-title');
    const summary = dialog.querySelector('#roadmap-dialog-summary');
    const state = dialog.querySelector('#roadmap-dialog-state');
    const step = dialog.querySelector('#roadmap-dialog-step');
    let trigger = null;

    document.querySelectorAll('.roadmap-node').forEach((node) => {
        node.addEventListener('click', () => {
            trigger = node;
            title.textContent = node.dataset.roadmapTitle || 'Roadmap item';
            summary.textContent = node.dataset.roadmapSummary || '';
            state.textContent = (node.dataset.roadmapState || 'planned').replace(/-/g, ' ');
            step.textContent = `Workflow node ${String(node.dataset.roadmapStep || '').padStart(2, '0')}`;
            dialog.showModal();
        });
    });

    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close('cancel');
    });

    dialog.addEventListener('close', () => {
        trigger?.focus();
    });
}

markActiveNavigation();
bindBranchNavigation();
bindNavigation();
bindRoadmapDialog();
