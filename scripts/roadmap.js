// ROADMAP LOGIC

let RM_DATA = null;
let activeIndex = 0;
let carouselOrder = [];

document.addEventListener('DOMContentLoaded', initRoadmap);

async function initRoadmap() {
    try {
        const root = window.SITE_ROOT || '';
        const res = await fetch(`${root}data/roadmap.json`);
        if (!res.ok) throw new Error("Failed to load roadmap data");
        RM_DATA = await res.json();

        carouselOrder = RM_DATA.carouselOrder || [];

        if (carouselOrder.length > 0) {
            renderSidebarQueue();
            renderSidebarFeed();
            renderCarousel(0);
            bindCarouselControls();
        } else {
            showError("No active projects found in roadmap.");
        }

    } catch (err) {
        console.error(err);
        showError("ERROR: Unable to load roadmap data. Please try again later.");
    }
}

function renderSidebarQueue() {
    const list = document.getElementById('next-focus-list');
    if (!list || !RM_DATA.nextFocusQueue) return;

    list.innerHTML = RM_DATA.nextFocusQueue.map(item => `
        <div class="queue-item">
            <div class="item-meta">
                <span>${getProjectName(item.projectId)}</span>
                <span style="color: var(--accent-gold);">${item.etaLabel || ''}</span>
            </div>
            <div class="item-title">${item.projectId.toUpperCase()}</div>
            <div class="item-note">${item.note}</div>
        </div>
    `).join('');
}

function renderSidebarFeed() {
    const list = document.getElementById('recently-shipped-list');
    if (!list || !RM_DATA.recentlyShippedFeed) return;

    // Take top 6
    const feed = RM_DATA.recentlyShippedFeed.slice(0, 6);

    list.innerHTML = feed.map(item => {
        let stateClass = item.state ? item.state.toLowerCase() : '';
        let route = '#';
        if (item.projectId === 'betterfingers') route = '../productivity/index.html';
        if (item.projectId === 'infinite-ages') route = '../games/index.html';

        return `
        <div class="feed-item" style="cursor: pointer; transition: 0.2s;" onclick="window.location.href='${route}'" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
            <div class="item-meta">
                <span style="color: var(--tech-cyan);">${item.dateISO}</span>
                <span class="state-tag ${stateClass}">${item.state || 'LOGGED'}</span>
            </div>
            <div class="item-title" style="color: var(--accent-gold);">${getProjectName(item.projectId)}</div>
            <div class="item-note">${item.summary}</div>
        </div>
    `}).join('');
}

function renderCarousel(index) {
    if (index < 0) index = carouselOrder.length - 1;
    if (index >= carouselOrder.length) index = 0;

    activeIndex = index;
    const projectId = carouselOrder[index];
    const project = RM_DATA.projects[projectId];

    if (!project) return;

    // 1. Update Header
    const titleEl = document.getElementById('rm-project-title');
    const summaryEl = document.getElementById('rm-focus-summary');
    const statusEl = document.getElementById('rm-status-summary');

    if (titleEl) titleEl.innerText = project.name.toUpperCase();
    if (summaryEl) summaryEl.innerText = `FOCUS: ${project.focus.focusLine}`;
    if (statusEl) statusEl.innerText = project.focus.summary;

    // 2. Update Dots
    const dotsContainer = document.getElementById('rm-dots');
    if (dotsContainer) {
        dotsContainer.innerHTML = carouselOrder.map((pid, idx) => `
            <div class="dot ${idx === index ? 'active' : ''}" onclick="renderCarousel(${idx})"></div>
        `).join('');
    }

    // 3. Update Panels
    const updateList = document.getElementById('rm-updates');
    if (updateList) {
        if (project.updatePlans.length === 0) {
            updateList.innerHTML = `<div class="mono" style="color:var(--text-muted)">No pending updates</div>`;
        } else {
            updateList.innerHTML = project.updatePlans.map(plan => `
                <div class="plan-card">
                    <div class="plan-title">${plan.title}</div>
                    <div class="item-note">${plan.desc}</div>
                </div>
            `).join('');
        }
    }

    const scopeList = document.getElementById('rm-scope');
    if (scopeList) {
        if (project.scopeChanges.length === 0) {
            scopeList.innerHTML = `<div class="mono" style="color:var(--text-muted)">No recent changes</div>`;
        } else {
            scopeList.innerHTML = project.scopeChanges.map(scope => `
                <div class="scope-card">
                    <div class="item-meta" style="color:var(--accent-gold)">${scope.dateISO}</div>
                    <div class="plan-title">${scope.change}</div>
                    <div class="item-note" style="font-size: 0.9rem;">TARGET: ${scope.reason}</div>
                </div>
            `).join('');
        }
    }

    // 4. Update Kanban
    renderKanban(project.kanban);
}

function renderKanban(kb) {
    const todoCol = document.getElementById('kb-todo');
    const doneCol = document.getElementById('kb-done');

    if (!todoCol || !doneCol) return;

    if (!kb) {
        todoCol.innerHTML = '';
        doneCol.innerHTML = '';
        return;
    }

    const renderCard = (card) => `
        <div class="kb-card">
            <h5>${card.title}</h5>
            ${card.note ? `<div class="item-note" style="font-size:0.9rem">${card.note}</div>` : ''}
        </div>
    `;

    todoCol.innerHTML = (kb.todo || []).map(renderCard).join('');
    doneCol.innerHTML = (kb.done || []).map(renderCard).join('');
}

function bindCarouselControls() {
    document.getElementById('btn-prev').onclick = () => renderCarousel(activeIndex - 1);
    document.getElementById('btn-next').onclick = () => renderCarousel(activeIndex + 1);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') renderCarousel(activeIndex - 1);
        if (e.key === 'ArrowRight') renderCarousel(activeIndex + 1);
    });
}

function getProjectName(id) {
    if (RM_DATA.projects[id]) return RM_DATA.projects[id].name;
    return id; // fallback
}

function showError(msg) {
    const grid = document.querySelector('.roadmap-grid');
    if (grid) {
        grid.innerHTML = `<div class="container" style="text-align:center; padding: 4rem; grid-column: 1/-1;">
            <h2 style="color: var(--accent-gold); font-family: var(--font-mono);">ERROR</h2>
            <p>${msg}</p>
        </div>`;
    }
}
