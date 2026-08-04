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

function bindProjectShowcases() {
    document.querySelectorAll('[data-project-showcase]').forEach((showcase) => {
        const slides = [...showcase.querySelectorAll('[data-showcase-slide]')];
        if (slides.length < 2) return;

        const dots = [...showcase.querySelectorAll('[data-showcase-dot]')];
        const previous = showcase.querySelector('[data-showcase-previous]');
        const next = showcase.querySelector('[data-showcase-next]');
        const current = showcase.querySelector('[data-showcase-current]');
        const shouldLoop = showcase.dataset.loop !== 'false';
        let activeIndex = 0;

        function showSlide(index, focusDot = false) {
            const lastIndex = slides.length - 1;
            activeIndex = shouldLoop
                ? (index + slides.length) % slides.length
                : Math.min(Math.max(index, 0), lastIndex);

            slides.forEach((slide, slideIndex) => {
                const isActive = slideIndex === activeIndex;
                slide.classList.toggle('is-active', isActive);
                slide.setAttribute('aria-hidden', String(!isActive));
                if (!isActive) slide.querySelectorAll('video').forEach((video) => video.pause());
            });

            dots.forEach((dot, dotIndex) => {
                const isActive = dotIndex === activeIndex;
                dot.classList.toggle('is-active', isActive);
                dot.setAttribute('aria-pressed', String(isActive));
            });

            if (current) current.textContent = String(activeIndex + 1).padStart(2, '0');
            if (!shouldLoop) {
                previous.disabled = activeIndex === 0;
                next.disabled = activeIndex === lastIndex;
            }
            if (focusDot) dots[activeIndex]?.focus();
        }

        previous?.addEventListener('click', () => showSlide(activeIndex - 1));
        next?.addEventListener('click', () => showSlide(activeIndex + 1));
        dots.forEach((dot, index) => dot.addEventListener('click', () => showSlide(index)));
        showcase.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                showSlide(activeIndex - 1, event.target.matches('[data-showcase-dot]'));
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                showSlide(activeIndex + 1, event.target.matches('[data-showcase-dot]'));
            } else if (event.key === 'Home') {
                event.preventDefault();
                showSlide(0, event.target.matches('[data-showcase-dot]'));
            } else if (event.key === 'End') {
                event.preventDefault();
                showSlide(slides.length - 1, event.target.matches('[data-showcase-dot]'));
            }
        });

        showSlide(0);
    });
}

markActiveNavigation();
bindBranchNavigation();
bindNavigation();
bindRoadmapDialog();
bindProjectShowcases();
