// --- CONFIG ---
const SITE_ROOT = window.SITE_ROOT || './';
const API_BASE = `${SITE_ROOT}data/`;

// --- STATE ---
let PROJECTS = [];
let POSTS = [];
let FUNDING = {};
let PATRONS = [];
let MANIFESTO = [
    { title: "VOICE IS DATA", text: "Your voice is a biometric identifier. We process it locally. We do not send it to the cloud to be trained on." },
    { title: "LOCAL-FIRST = OWNERSHIP", text: "If it does not run offline, you do not truly own it. We build tools that still work when the cloud goes dark." },
    { title: "FREE FOREVER = TRUST", text: "No subscriptions. No paywalls. No free-until-we-pivot trap. If it is on this site, it stays free." },
    { title: "DONATIONS ARE VOTES", text: "You do not pay for features. You fund the direction. Donations steer priority, not access." },
    { title: "NO ADS. NO SPONSORS. NO HANDLERS.", text: "I do not sell your attention. I do not trade your creativity for corporate approval." },
    { title: "DISCOMFORT BUILDS CAPABILITY", text: "This is not comfort software. The goal is courage, competence, and action. Tools that make you stronger." },
    { title: "BUILD TO GIVE", text: "The point is not to win capitalism. It is to reduce exploitation and decentralize capability, one useful tool at a time." }
];


function isExternalUrl(url) {
    return /^https?:\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('tel:');
}

function resolveSiteUrl(url) {
    if (!url) return '';
    if (isExternalUrl(url) || url.startsWith('#')) return url;
    if (url.startsWith('../')) return url;
    const normalized = url.replace(/^\.?\//, '');
    return SITE_ROOT + normalized;
}

function getCurrentRoute(path = window.location.pathname.toLowerCase()) {
    if (path.includes('productivity')) return 'productivity';
    if (path.includes('games')) return 'games';
    if (path.includes('financial')) return 'financial';
    if (path.includes('roadmap')) return 'roadmap';
    if (path.includes('chronicles')) return 'chronicles';
    if (path.includes('treasury')) return 'treasury';
    return 'home';
}

function markActiveRoute() {
    const route = getCurrentRoute();
    const links = document.querySelectorAll('.nav-links a[data-route]');
    links.forEach((link) => {
        link.classList.toggle('is-active', link.dataset.route === route);
    });
}

// --- INIT ---
async function init() {
    initEasterEggs();
    markActiveRoute();

    // Hamburger nav toggle (mobile)
    const navToggle = document.querySelector('.nav-toggle');
    const navShell = document.querySelector('.nav-shell');
    if (navToggle && navShell) {
        navToggle.addEventListener('click', () => {
            navShell.classList.toggle('nav-open');
            const isOpen = navShell.classList.contains('nav-open');
            navToggle.setAttribute('aria-expanded', isOpen);
            navToggle.innerHTML = isOpen ? '&#10005;' : '&#9776;';
        });
    }

    try {
        const [projectsRes, postsRes, fundingRes, patronsRes] = await Promise.all([
            fetch(`${API_BASE}projects.json`),
            fetch(`${API_BASE}posts.json`),
            fetch(`${API_BASE}funding.json`),
            fetch(`${API_BASE}patrons.json`)
        ]);

        if (projectsRes.ok) PROJECTS = await projectsRes.json();
        if (postsRes.ok) POSTS = await postsRes.json();
        if (fundingRes.ok) FUNDING = await fundingRes.json();
        if (patronsRes.ok) PATRONS = await patronsRes.json();
        // Router
        const route = getCurrentRoute();

        if (route === 'productivity') {
            renderCategory('productivity');
        } else if (route === 'games') {
            renderCategory('games');
        } else if (route === 'financial') {
            renderCategory('finance');
        } else if (route === 'treasury') {
            renderSupport();
        } else if (route === 'chronicles') {
            const pathMatch = window.location.pathname.toLowerCase();
            // Check if it is the root chronicles index or a sub-page
            if (pathMatch.endsWith('chronicles/index.html') || pathMatch.endsWith('/chronicles/') || pathMatch.endsWith('/chronicles')) {
                renderChroniclesFeed();
            } else {
                // Do nothing on deep chronicle post pages, just let HTML render
            }
        } else {
            // Default to Home if root or unhandled (like root index.html)
            renderHome();
        }

        bindEvents();
        initYouTubePreview();

    } catch (err) {
        console.error("Signal Interpretation Failure:", err);
    }
}

// Layout injection removed - handled by static builder

// --- RENDERERS ---

function renderHome() {
    // 1. Featured Projects Carousel. Driven by the `featured` flag in
    //    projects.json (which validateData.js already enforces) rather than a
    //    second hardcoded list that has to be kept in sync by hand.
    const featured = PROJECTS.filter(p => p.featured);
    renderGrid(featured, 'featured-grid');

    // 2. Chronicles
    renderChronicles();

    // 3. Manifesto Preview (All 6 points)
    renderManifesto(6);
}

function renderChronicles() {
    const container = document.getElementById('chronicles-grid');
    if (!container) return;

    if (POSTS.length === 0) {
        container.innerHTML = `<div class="mono" style="color: var(--text-muted);">// NO LOGS FOUND</div>`;
        return;
    }

    // Top 3
    const latest = POSTS.slice(0, 3);

    container.innerHTML = latest.map(p => `
        <div class="log-entry" onclick="window.location.href='${resolveSiteUrl(p.url)}'" style="cursor: pointer; margin-bottom: 2rem;">
            <div class="log-date mono">${p.dateISO}</div>
            <div>
                <h3 class="log-title">${p.title}</h3>
                <p class="log-excerpt">${p.excerpt}</p>
                <div class="mono" style="margin-top: 1rem; color: var(--accent-gold); font-size: 0.8rem;">READ ENTRY &rarr;</div>
            </div>
        </div>
    `).join('');
}

function renderChroniclesFeed() {
    const container = document.getElementById('chronicles-feed');
    if (!container) return;

    if (POSTS.length === 0) {
        container.innerHTML = `<div class="mono" style="color: var(--text-muted);">// NO LOGS FOUND</div>`;
        return;
    }

    container.innerHTML = POSTS.map(p => `
        <div class="log-entry" onclick="window.location.href='${resolveSiteUrl(p.url)}'" style="cursor: pointer; margin-bottom: 2rem; border-bottom: 1px dotted var(--stone-light); padding-bottom: 2rem;">
            <div class="log-date mono" style="color: var(--tech-cyan);">${p.dateISO}</div>
            <div>
                <h3 class="log-title" style="color: var(--text-main); font-size: 1.4rem;">${p.title}</h3>
                <p class="log-excerpt" style="color: var(--text-muted); margin-top: 1rem;">${p.excerpt}</p>
                <div class="mono" style="margin-top: 1rem; color: var(--tech-cyan); font-size: 0.8rem;">> ACCESS ARCHIVE</div>
            </div>
        </div>
    `).join('');
}

function renderCategory(category) {
    const filtered = PROJECTS.filter(p => p.category === category);
    renderGrid(filtered, 'project-grid');
}

function renderSupport(sortBy = 'priority') {
    const fundingDiv = document.getElementById('funding-grid');
    if (!fundingDiv || !FUNDING.buckets) {
        renderImmortals();
        return;
    }

    let buckets = [...FUNDING.buckets];

    // Sorting Logic
    if (sortBy === 'priority') {
        buckets.sort((a, b) => a.priorityRank - b.priorityRank);
    } else if (sortBy === 'funded') {
        buckets.sort((a, b) => {
            const pctA = (a.raisedUSD / a.goalUSD);
            const pctB = (b.raisedUSD / b.goalUSD);
            return pctB - pctA; // Descending
        });
    }

    fundingDiv.innerHTML = buckets.map(b => {
        // Find votes for this bucket
        const voteData = FUNDING.votes ? FUNDING.votes.find(v => v.bucketId === b.id) : null;
        const voteCount = voteData ? voteData.totalVotes : 0;
        const percent = Math.min(100, Math.round((b.raisedUSD / b.goalUSD) * 100));

        return `
        <div class="funding-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <h4 style="margin-bottom: 0.5rem; color: var(--accent-gold);">${b.title}</h4>
                <span class="mono" style="font-size: 0.8rem; color: var(--tech-cyan);">RANK: ${b.priorityRank}</span>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 1rem;">${b.description}</p>
            
            <!-- Progress Bar -->
            <div style="margin-top: 1rem; margin-bottom: 0.5rem; background: var(--bg-void); height: 6px; width: 100%; position: relative;">
                <div style="background: var(--tech-cyan); height: 100%; width: ${percent}%;"></div>
            </div>
            <div class="mono" style="font-size: 0.8rem; color: var(--text-muted); display:flex; justify-content:space-between;">
                <span>$${b.raisedUSD} / $${b.goalUSD} RAISED (${percent}%)</span>
                <span>${voteCount} VOTES</span>
            </div>

            <!-- Links -->
            <div style="margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                ${b.raisedUSD > 0 ? b.links.map(l => `
                    <a href="${resolveSiteUrl(l.url)}" target="_blank" class="btn btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.7rem;">${l.label}</a>
                `).join('') : '<span class="mono" style="color:var(--text-muted); font-size: 0.8rem;">// STATUS: COMING SOON</span>'}
            </div>
        </div>`;
    }).join('');

    // Toggle Button Logic
    const sorts = document.querySelectorAll('.sort-toggle');
    sorts.forEach(btn => {
        btn.onclick = () => {
            // Update UI
            document.querySelectorAll('.sort-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Re-render
            renderSupport(btn.dataset.sort);
        };
    });

    renderImmortals();
}

function renderImmortals() {
    const grid = document.getElementById('immortals-grid');
    if (!grid) return;

    if (PATRONS.length === 0) {
        grid.innerHTML = `<div class="mono" style="color: var(--text-muted);">// HALL IS EMPTY.</div>`;
        return;
    }

    // Sort by amount, then date
    const sorted = [...PATRONS].sort((a, b) => b.amount - a.amount || new Date(b.date) - new Date(a.date));

    grid.innerHTML = sorted.map(p => `
        <div class="patron-card" style="border: 1px solid var(--stone-light); padding: 1rem; background: rgba(212, 175, 55, 0.02);">
            <div class="mono" style="color: var(--accent-gold); font-size: 1.1rem; margin-bottom: 0.5rem;">> ${p.name.toUpperCase()}</div>
            <div class="mono" style="color: var(--tech-cyan); font-size: 0.8rem;">INITIATION: ${p.date.split('T')[0]}</div>
        </div>
    `).join('');
}

function renderGrid(items, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = `<div class="mono" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 4rem;">// NO ARTIFACTS FOUND IN THIS SECTOR</div>`;
        return;
    }

    grid.innerHTML = items.map(p => {
        // Safe check for stats/version if needed, though mostly in modal now
        // Check for a demo link
        const demoLink = p.links ? p.links.find(l => l.type === 'demo' && l.url) : null;
        const demoBtnHtml = demoLink
            ? `<a href="${resolveSiteUrl(demoLink.url)}" class="btn btn-primary" onclick="event.stopPropagation();" style="display:inline-block; margin-top:1rem; padding:0.6rem 1.5rem; font-size:0.75rem; text-align:center;">PLAY ${demoLink.label.toUpperCase()}</a>`
            : '';

        return `
        <div class="project-card" 
             role="button" 
             tabindex="0" 
             onclick="windowModal('${p.id}')" 
             onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); windowModal('${p.id}'); }">
            <div style="height: 100%; display: flex; flex-direction: column;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
                    <div class="project-status">${p.statusLabel || p.status.toUpperCase()}</div>
                </div>
                
                <h3 style="margin: 0; font-size: 1.4rem; line-height: 1.2; color: var(--text-main);">${p.realName}</h3>
                <div class="mono" style="font-size: 0.8rem; color: var(--accent-gold); margin-bottom: 1rem;">(Codename: ${p.codename})</div>
                
                <p style="margin-bottom: 1.5rem; flex-grow: 1;">${p.plainDescription}</p>
                
                ${demoBtnHtml}
                
                <a class="click-prompt" style="margin-top: auto; display:block; text-decoration:none; color:inherit;"
                   href="${resolveSiteUrl('projects/' + p.id + '.html')}"
                   onclick="event.preventDefault(); event.stopPropagation(); windowModal('${p.id}');">
                    [ ACCESS DOSSIER ] &rarr;
                </a>
            </div>
        </div>
    `;
    }).join('');
}

function renderManifesto(limit = 99) {
    const container = document.getElementById('manifesto-grid');
    if (!container) return;

    container.innerHTML = MANIFESTO.slice(0, limit).map(m => `
        <div class="manifesto-point">
            <h4>// ${m.title}</h4>
            <p>${m.text}</p>
        </div>
    `).join('');
}

// --- MODAL LOGIC ---
let lastFocusedElement;

function bindEvents() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Tab') handleTab(e);
    });

    // Accordion Logic
    const accordions = document.querySelectorAll('.accordion-header');
    accordions.forEach(acc => {
        acc.addEventListener('click', function () {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                content.classList.remove('expanded');
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
                content.classList.add('expanded');
            }
        });
    });

    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
    window.windowModal = openModal; // Alias for HTML usage
}

function handleTab(e) {
    const overlay = document.getElementById('overlay');
    if (!overlay || !overlay.classList.contains('active')) return;

    const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

function openModal(projectId) {
    lastFocusedElement = document.activeElement;

    const project = PROJECTS.find(p => p.id === projectId);
    if (!project) return;

    // Populate Headers
    setText('modal-title', project.realName);
    setText('modal-status', `STATUS: ${project.statusLabel}`);

    // Populate Body
    const descEl = document.getElementById('modal-desc');
    if (descEl) {
        let html = `
            <div style="margin-bottom: 2rem;">
                <p class="reading-text" style="font-weight: 500; font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.5rem;">
                    ${project.plainDescription}
                </p>
                <p class="mono" style="color: var(--text-muted); font-style: italic; font-size: 0.9rem; border-left: 2px solid var(--accent-gold); padding-left: 1rem;">
                    "${project.flavorDescription}"
                </p>
            </div>

            <div class="divider"></div>
            
            <div class="reading-text" style="margin-bottom: 2rem;">
                ${project.fullDescription.map(para => `<p>${para}</p>`).join('')}
            </div>

            <div style="margin-bottom: 2rem;">
                <h4 class="mono" style="color: var(--accent-gold); margin-bottom: 1rem;">// FLAGSHIP CAPABILITIES</h4>
                <ul style="list-style: none; padding: 0;">
                    ${project.flagshipFeatures.map(f => {
            const parts = f.split('::');
            const title = parts[0];
            const text = parts[1] || '';
            return `<li style="margin-bottom: 1rem;">
                             <strong style="color: var(--tech-cyan);">${title}</strong>
                             <span style="color: var(--text-muted);"> ${text}</span>
                         </li>`;
        }).join('')}
                </ul>
            </div>

            <div style="margin-bottom: 2rem;">
                 <h4 class="mono" style="color: var(--text-muted); margin-bottom: 1rem;">// STANDARD FEATURES</h4>
                 <ul style="padding-left: 1.5rem; color: var(--text-main);">
                     ${project.features.map(f => `<li>${f}</li>`).join('')}
                 </ul>
            </div>
        `;

        descEl.innerHTML = html;
    }

    // Trust Facts (Sidebar)
    const statsEl = document.getElementById('modal-stats');
    if (statsEl && project.trustFacts) {
        const tf = project.trustFacts;
        statsEl.innerHTML = `
            <div class="d-stat-row"><span class="d-stat-label">OFFLINE?</span><span class="d-stat-val" style="color:${tf.runsOffline ? 'var(--tech-cyan)' : 'var(--text-muted)'}">${tf.runsOffline ? 'YES' : 'NO'}</span></div>
            <div class="d-stat-row"><span class="d-stat-label">NET REQ?</span><span class="d-stat-val">${tf.requiresInternet}</span></div>
            <div class="d-stat-row"><span class="d-stat-label">TELEMETRY</span><span class="d-stat-val">${tf.telemetry}</span></div>
            <div class="d-stat-row"><span class="d-stat-label">ACCOUNTS</span><span class="d-stat-val">${tf.accounts}</span></div>
            <div class="d-stat-row"><span class="d-stat-label">DATA LOC</span><span class="d-stat-val">${tf.dataStoredWhere}</span></div>
            ${tf.integrity ? `
            <div style="margin-top: 1.5rem; border-top: 1px dotted var(--stone-light); padding-top: 1rem;">
                <div class="d-stat-label" style="color: var(--accent-gold); margin-bottom: 0.5rem;">// INTEGRITY CHECK</div>
                <div class="mono" style="font-size: 0.7rem; color: var(--text-muted); word-break: break-all;">
                    FILE: ${tf.installer || 'Unknown'}<br>
                    SHA256: <span style="color: var(--tech-cyan);">${tf.integrity}</span>
                </div>
            </div>
            ` : ''}
        `;
    }

    // Links (Sidebar)
    const linksEl = document.getElementById('modal-links');
    if (linksEl) {
        // Filter before the length check: several projects carry placeholder link
        // entries with an empty url, which otherwise rendered an empty panel
        // instead of falling back to the ACCESS RESTRICTED notice.
        const usableLinks = project.links.filter(l => l.url);
        linksEl.innerHTML = usableLinks.length > 0
            ? usableLinks.map(l => `
                <a href="${resolveSiteUrl(l.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-align:center; font-size: 0.8rem;">${l.label.toUpperCase()}</a>
            `).join('')
            : `<div class="mono" style="color: var(--text-muted); font-size: 0.8rem;">// ACCESS RESTRICTED</div>`;
    }

    // Roadmap
    const roadmapEl = document.getElementById('modal-roadmap');
    if (roadmapEl && project.roadmap) {
        let html = '';
        if (project.roadmap.nearTerm && project.roadmap.nearTerm.length > 0) {
            html += `<h5 class="mono" style="color: var(--tech-cyan); margin-top: 1rem;">NEAR TERM</h5><ul style="font-size: 0.9rem; padding-left: 1.2rem;">${project.roadmap.nearTerm.map(t => `<li>${t}</li>`).join('')}</ul>`;
        }
        if (project.roadmap.midTerm && project.roadmap.midTerm.length > 0) {
            html += `<h5 class="mono" style="color: var(--accent-gold); margin-top: 1rem;">MID TERM</h5><ul style="font-size: 0.9rem; padding-left: 1.2rem;">${project.roadmap.midTerm.map(t => `<li>${t}</li>`).join('')}</ul>`;
        }
        if (project.roadmap.longTerm) {
            html += `<h5 class="mono" style="color: var(--text-muted); margin-top: 1rem;">LONG TERM</h5><p style="font-size: 0.9rem; color: var(--text-muted);">${project.roadmap.longTerm}</p>`;
        }
        roadmapEl.innerHTML = html;
    }

    // Show
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'modal-title');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        const closeBtn = overlay.querySelector('.close-btn');
        if (closeBtn) closeBtn.focus();
    }
}

function closeModal() {
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto'; // Restore scroll

        // Remove Attributes
        overlay.removeAttribute('role');
        overlay.removeAttribute('aria-modal');
        overlay.removeAttribute('aria-labelledby');
    }

    // Restore Focus
    if (lastFocusedElement) {
        lastFocusedElement.focus();
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

// --- GLITCH SYSTEM ---
function triggerOverride() {
    console.log("%c[!] SYSTEM OVERRIDE INITIATED. ARCANUM PROTOCOLS UNSEALED.", "color: #b366ff; font-weight: bold; font-size: 1.2rem;");
    document.body.classList.toggle('system-override');
}

function initEasterEggs() {
    // 1. Console Whisper
    console.log("%c// SECURE CONNECTION ESTABLISHED", "color: #00e5ff; font-family: monospace;");
    console.log("%cThere are no secrets here. Only things you haven't figured out how to compile yet.", "color: #888; font-style: italic;");

    // 2. Lore Tooltips
    const loreNodes = document.querySelectorAll('[data-lore]');
    loreNodes.forEach(node => {
        node.style.borderBottom = "1px dotted var(--tech-purple)";
        node.style.cursor = "help";

        node.addEventListener('mouseenter', (e) => {
            let tooltip = document.getElementById('lore-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'lore-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.background = 'var(--bg-panel)';
                tooltip.style.border = '1px solid var(--tech-purple)';
                tooltip.style.padding = '0.5rem 1rem';
                tooltip.style.color = 'var(--text-main)';
                tooltip.style.fontFamily = 'var(--font-mono)';
                tooltip.style.fontSize = '0.8rem';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.zIndex = '9999';
                tooltip.style.boxShadow = '0 0 10px rgba(179, 102, 255, 0.2)';
                document.body.appendChild(tooltip);
            }
            tooltip.innerText = node.getAttribute('data-lore');
            tooltip.style.display = 'block';

            // Initial position before mousemove catches it
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        });

        node.addEventListener('mousemove', (e) => {
            const tooltip = document.getElementById('lore-tooltip');
            if (tooltip) {
                tooltip.style.left = (e.pageX + 15) + 'px';
                tooltip.style.top = (e.pageY + 15) + 'px';
            }
        });

        node.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById('lore-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        });
    });
}

// Start
init();

// --- VIDEO PREVIEW SYSTEM ---
//
// Privacy facade. The previous version injected YouTube's iframe_api on page
// load, so every visitor to the manifesto page handed YouTube a request and a
// set of cookies before deciding to watch anything. That is precisely what this
// site tells people not to accept.
//
// Nothing third-party is requested until the visitor clicks, the click is an
// explicit consent step with the destination named, and the embed then uses
// youtube-nocookie.com.

const PREVIEW_VIDEO_ID = '99rThEvTqig';

function initYouTubePreview() {
    const trigger = document.getElementById('preview-trigger');
    const drawer = document.getElementById('video-drawer');
    const mount = document.getElementById('yt-player');
    if (!trigger || !drawer || !mount) return;

    let loaded = false;

    const showConsent = () => {
        loaded = false;
        mount.innerHTML = `
        <div class="video-consent mono">
            <p>// EXTERNAL TRANSMISSION</p>
            <p class="video-consent-body">
                This preview is hosted on YouTube. Loading it contacts
                <strong>youtube-nocookie.com</strong>, outside this site's control.
                Nothing has been requested yet.
            </p>
            <button type="button" id="preview-consent" class="btn btn-primary">LOAD PREVIEW</button>
        </div>`;
        mount.querySelector('#preview-consent').addEventListener('click', loadEmbed);
    };

    const loadEmbed = () => {
        if (loaded) return;
        loaded = true;
        const frame = document.createElement('iframe');
        frame.width = '100%';
        frame.height = '100%';
        frame.src = `https://www.youtube-nocookie.com/embed/${PREVIEW_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
        frame.title = 'BetterFingers preview';
        frame.loading = 'lazy';
        frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.allowFullscreen = true;
        frame.style.border = '0';
        mount.replaceChildren(frame);
    };

    showConsent();

    trigger.onclick = () => {
        const isActive = drawer.classList.toggle('is-active');
        trigger.innerText = isActive ? 'CLOSE PREVIEW' : 'INITIATE PREVIEW';
        // Closing the drawer tears the iframe down so it cannot keep running,
        // and restores the consent gate for the next open.
        if (!isActive && loaded) showConsent();
    };
}
