// The bag and the datapad (round 3, basics lane). Donaven: "jobs skills all in
// a data pad with an animation of sliding one up out of a bag". A bag sits in
// the HUD corner. Tab (or tapping the bag) opens it: the bag opens and the pad
// slides up out of it (about 350 ms; reduced motion gets a fade). Esc or Tab
// closes it. Pages: Captain (K), Pack (I), Jobs (J), Map (M); Q/E or [ ] flip
// pages; arrow keys move between the pad's buttons. Walking stops while it is
// open (the page holds the floor); the world itself keeps running.
//
//   const pad = createDatapad({ root, store, bus, world, ... })
//   pad.open(pageId?) · pad.close() · pad.toggle() · pad.isOpen · pad.page · pad.blocked(fn)
import { BASICS_DATA } from './data.js';
import { icon, keyCap } from './icons.js';
import { hudArt } from '../ui/assets.js';
import { el, createCaptainPage, createPackPage, createJobsPage, createMapPage } from './pages.js';
import { unspentOnCharacter } from '../skills/model.js';
import { createSkillsPage } from '../skills/skillsPage.js';

const KEYS = BASICS_DATA.keys;
const PAGES = BASICS_DATA.pages;
const PAD = BASICS_DATA.pad;
const has = (list, code) => list.includes(code);
// A tab's icon: the kit's hexagon pair (lit when the page is open), else the line icon.
function tabArt(p) {
  const on = hudArt(`tab-${p.id}-on`), off = hudArt(`tab-${p.id}-off`);
  if (!on || !off) return [icon(p.icon, 'dp-tab-icon')];
  return [el('img', { class: 'dp-tab-art is-off', src: off, alt: '' }), el('img', { class: 'dp-tab-art is-on', src: on, alt: '' })];
}

/**
 * root: where the HUD and the pad go (document.body). store, bus, toast.
 * world(): the walking world (onfoot.world) or null. tutorialOn(save). reducedMotion().
 * canOpen(): false while something else owns the screen (a station panel, the licence, a minigame).
 * onChange(open): the page holds or frees the floor. openLicence(): no captain yet.
 * stationInfo(id): { name, locked } for the map's legend.
 */
export function createDatapad({ root = document.body, store, skillSave = null, bus = null, toast = () => {}, world = () => null, tutorialOn = () => false, reducedMotion = () => false, canOpen = () => true, onChange = () => {}, openLicence = () => {}, stationInfo = () => null, touch = false, onContinueJob = () => {}, onTrain = null, onScan = null }) {
  // --- The bag in the HUD corner ---
  const bagArt = hudArt('bag-closed');
    const badge = el('span', { class: 'dp-bag-badge', hidden: true });
  const bag = el('button', { type: 'button', class: 'dp-bag', id: 'dp-bag', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${PAD.bagHint} (Tab)`, title: `${PAD.bagHint} (Tab)` },
    bagArt ? el('img', { class: 'dp-bag-art', src: bagArt, alt: '' }) : el('span', { class: 'dp-bag-art dp-satchel', 'aria-hidden': 'true' }, el('i', { class: 'dp-satchel-flap' }), el('i', { class: 'dp-satchel-buckle' })),
    touch ? el('span', { class: 'dp-bag-label', text: PAD.bagLabel }) : keyCap('Tab', 'dp-key dp-bag-key'),
    badge);
  bag.addEventListener('click', () => toggle());

  // --- The pad ---
  const tabs = el('div', { class: 'dp-tabs', role: 'tablist', 'aria-label': 'Datapad pages' });
  const screens = {};
  const tabButtons = {};
  for (const p of PAGES) {
    const b = el('button', { type: 'button', class: 'dp-tab', role: 'tab', id: `dp-tab-${p.id}`, 'aria-controls': `dp-page-${p.id}`, 'aria-selected': 'false', dataset: { page: p.id }, tabindex: '-1' },
      ...tabArt(p), el('span', { class: 'dp-tab-name', text: p.name }), touch ? null : keyCap(p.keyLabel, 'dp-key dp-key-sm'));
    b.addEventListener('click', () => show(p.id));
    tabButtons[p.id] = b;
    tabs.append(b);
    screens[p.id] = el('section', { class: `dp-page dp-page-${p.id}`, id: `dp-page-${p.id}`, role: 'tabpanel', 'aria-labelledby': `dp-tab-${p.id}`, hidden: true, dataset: { page: p.id } });
  }
  // The Captain and Pack pages keep the ids the hangar's tests and kit know.
  screens.captain.id = 'pane-captain';
  screens.pack.id = 'pane-ledger';
  const closeBtn = el('button', { type: 'button', class: 'dp-close', 'aria-label': 'Close the datapad (Esc)' }, touch ? null : keyCap('Esc', 'dp-key dp-key-sm'), el('span', { text: '✕', 'aria-hidden': 'true' }));
  closeBtn.addEventListener('click', () => close());
  // The kit's datapad frame (9-slice): landscape on a computer, portrait on a phone (CSS picks).
  const frameWide = hudArt('datapad-landscape'), frameTall = hudArt('datapad-portrait');
  const pad = el('section', { class: `dp-pad${frameWide ? ' has-frame' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Datapad', tabindex: '-1', style: frameWide ? `--dp-frame-wide:url("${frameWide}");--dp-frame-tall:url("${frameTall || frameWide}")` : null },
    el('header', { class: 'dp-head' }, el('span', { class: 'dp-title', text: PAD.title }), tabs, closeBtn),
    el('div', { class: 'dp-screen' }, Object.values(screens)),
    el('i', { class: 'dp-glare', 'aria-hidden': 'true' }));
  // The bag it comes out of: the kit's closed bag cross-fades to the open one, then the pad slides up out of it.
  const bagOpenArt = hudArt('bag-open');
  const openBag = bagArt && bagOpenArt
    ? el('div', { class: 'dp-bag-open has-art', 'aria-hidden': 'true' }, el('img', { class: 'dp-bag-shut', src: bagArt, alt: '' }), el('img', { class: 'dp-bag-wide', src: bagOpenArt, alt: '' }))
    : el('div', { class: 'dp-bag-open', 'aria-hidden': 'true' }, el('i', { class: 'dp-bag-back' }), el('i', { class: 'dp-bag-front' }, el('i', { class: 'dp-bag-buckle' })));
  const scrim = el('div', { class: 'dp-scrim', hidden: true });
  scrim.append(openBag, pad);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  root.append(bag, scrim);

  const pages = {
    captain: createCaptainPage({ root: screens.captain, store, openLicence: () => { close(); openLicence(); } }),
    skills: createSkillsPage({ root: screens.skills, store, toast, skillSave, tutorialOn, reducedMotion, openLicence: () => { close(); openLicence(); }, onTrain, onScan }),
    pack: createPackPage({ root: screens.pack, store, toast }),
    jobs: createJobsPage({ root: screens.jobs, store, onContinue: () => { close(); onContinueJob(); } }),
    map: createMapPage({ root: screens.map, world, stationInfo }),
  };

  let isOpen = false;
  let page = 'captain';
  let opener = null;
  let timer = 0;

  function paintBadge(save = store.get()) {
    const n = save.character ? unspentOnCharacter(save.character) : 0;
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
    bag.dataset.points = String(n);
  }

  function show(id) {
    if (!screens[id]) return;
    page = id;
    for (const p of PAGES) {
      const on = p.id === id;
      screens[p.id].hidden = !on;
      tabButtons[p.id].setAttribute('aria-selected', String(on));
      tabButtons[p.id].tabIndex = on ? 0 : -1;
    }
    pad.dataset.page = id;
    pages[id].render(store.get());
    bus?.emit('datapad:page', { page: id });
  }

  function open(id = page) {
    if (isOpen) { show(id); return true; }
    if (!canOpen()) return false;
    isOpen = true;
    clearTimeout(timer);
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    scrim.hidden = false;
    scrim.classList.remove('is-closing');
    scrim.classList.toggle('is-still', reducedMotion());
    void scrim.offsetWidth;
    scrim.classList.add('is-open');
    bag.setAttribute('aria-expanded', 'true');
    document.body.classList.add('dp-open');
    show(id);
    onChange(true);
    bus?.emit('datapad:open', { page: id });
    requestAnimationFrame(() => pad.focus({ preventScroll: true }));
    return true;
  }

  function close() {
    if (!isOpen) return false;
    isOpen = false;
    scrim.classList.remove('is-open');
    scrim.classList.add('is-closing');
    bag.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('dp-open');
    clearTimeout(timer);
    timer = setTimeout(() => { scrim.hidden = true; scrim.classList.remove('is-closing'); }, reducedMotion() ? 0 : PAD.closeMs);
    onChange(false);
    bus?.emit('datapad:close', {});
    (opener?.isConnected && opener !== document.body ? opener : null)?.focus?.({ preventScroll: true });
    return true;
  }
  const toggle = (id) => (isOpen ? close() : open(id));

  // Arrow keys move between the pad's buttons (Tab closes the pad, like a game's bag).
  function moveFocus(step) {
    const list = [...pad.querySelectorAll('button:not([disabled]), summary, [tabindex="0"]')].filter((n) => n.offsetParent !== null && !n.closest('[hidden]'));
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    list[(at + step + list.length) % list.length].focus({ preventScroll: false });
  }

  const typing = (t) => t instanceof HTMLElement && (t.closest('input, textarea, select') || t.isContentEditable);
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    const pageKey = PAGES.find((p) => p.key === e.code);
    if (isOpen) {
      if (has(KEYS.pad, e.code) || has(KEYS.close, e.code)) { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (pageKey) { e.preventDefault(); if (pageKey.id === page) close(); else show(pageKey.id); return; }
      const at = PAGES.findIndex((p) => p.id === page);
      if (has(KEYS.prevPage, e.code)) { e.preventDefault(); show(PAGES[(at - 1 + PAGES.length) % PAGES.length].id); tabButtons[page].focus(); return; }
      if (has(KEYS.nextPage, e.code)) { e.preventDefault(); show(PAGES[(at + 1) % PAGES.length].id); tabButtons[page].focus(); return; }
      if (e.target instanceof HTMLElement && e.target.closest('[data-own-arrows]') && e.code.startsWith('Arrow')) return; // a page that moves its own focus (the skills page)
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { e.preventDefault(); moveFocus(1); return; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); return; }
      return;
    }
    if (e.repeat) return;
    if (has(KEYS.pad, e.code) && canOpen()) { e.preventDefault(); e.stopPropagation(); open(); return; }
    if (pageKey && canOpen()) { e.preventDefault(); open(pageKey.id); }
  }
  addEventListener('keydown', onKey, true);

  store.subscribe((save) => {
    paintBadge(save);
    if (isOpen && page !== 'map') pages[page].render(save);
  });
  bus?.on?.('story:objective', () => { if (isOpen && page === 'jobs') pages.jobs.render(store.get()); });
  paintBadge();

  return {
    open, close, toggle, show,
    get isOpen() { return isOpen; },
    get page() { return page; },
    bag, pad, pages,
    destroy() { removeEventListener('keydown', onKey, true); bag.remove(); scrim.remove(); },
  };
}
