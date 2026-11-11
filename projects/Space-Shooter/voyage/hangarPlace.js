// The hangar as a place you look around, not a row of tabs. The scene shows
// the floor and its stations; each station has a button over it (so keyboards,
// screen readers and taps all reach it). Opening a station moves the camera
// onto it and slides its panel in beside it (a bottom sheet on phones).
//
// openStation(id, { via }) is the one way in, for clicks and taps (via
// 'click') and for the onfoot lane's player walking up and pressing interact
// (via 'walk'). It tells the story director what happened (contract section 4):
// `tutorial:arrived { station }` for clicks (onfoot sends its own on walking
// into a ring) and `met:<cast>` every time a station with a person opens.
import { STATIONS, stationById, stationState, CAST_NAMES } from './hangarStations.js';
import { isUnlocked } from './hangarLinks.js';
import { stationMounts, watchRegistry } from './hangarApi.js';

/**
 * scene: hangarScene.js. layer: the element holding the station buttons.
 * sheet: { root, title, who, close, tabs, body }. panes: { [paneId]: element }.
 * renderStation(station, state, pane): fills the generic station pane.
 * store, bus. onOpen(station, panes) / onClose(station).
 */
export function createHangarPlace({ scene, layer, sheet, panes, renderStation, store, bus, onOpen = () => {}, onClose = () => {}, reducedMotion = () => false }) {
  let current = null; // station id
  let objective = null;
  let subtab = {}; // station id -> sub view
  let opener = null;
  const buttons = new Map();
  const listeners = new Set();

  // Which panes a station shows, and its sub views.
  const STATION_LABEL = { kennel: 'Ralph', scrap: 'Pile', locker: 'Locker', range: 'Range', backroom: 'Back room' };
  const VIEWS = {
    pad: [{ id: 'ship', label: 'Ship', pane: 'ship' }],
    board: [{ id: 'jobs', label: 'Jobs', pane: 'jobs' }],
    quarters: [{ id: 'skills', label: 'Skill tree', pane: 'captain' }, { id: 'ledger', label: 'Ledger', pane: 'ledger' }],
    hatch: [{ id: 'launch', label: 'Launch', pane: 'station' }, { id: 'crew', label: 'Crew', pane: 'crew' }],
  };
  // Base views plus anything another lane mounted (a shop, say), which draws into the mount pane.
  const viewsFor = (id) => {
    const base = VIEWS[id] || [{ id: 'station', label: STATION_LABEL[id] || 'Here', pane: 'station' }];
    return [...base, ...stationMounts(id).map((m) => ({ id: m.id, label: m.label, pane: 'mount', mount: m }))];
  };
  let mountCleanup = null;
  function drawMount(stationId, view) {
    if (typeof mountCleanup === 'function') { try { mountCleanup(); } catch { /* the mount's own problem */ } }
    mountCleanup = null;
    if (!view?.mount || !panes.mount) return;
    panes.mount.replaceChildren();
    try {
      mountCleanup = view.mount.render(panes.mount, { store, bus, toast: (t) => bus?.emit('hangar:toast', { text: t }), station: stationById(stationId), close: () => closeStation() });
    } catch (error) {
      console.warn(`Stardust: the ${view.id} view at ${stationId} failed`, error);
      const p = document.createElement('p');
      p.className = 'ui-why';
      p.textContent = 'This counter is closed for a moment. Try again shortly.';
      panes.mount.replaceChildren(p);
    }
  }

  function states(save = store.get()) {
    const out = {};
    for (const s of STATIONS) out[s.id] = stationState(save, s, isUnlocked, objective);
    return out;
  }

  // --- Station buttons over the scene -----------------------------------------------
  for (const s of STATIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hg-spot';
    b.dataset.station = s.id;
    const plate = document.createElement('span');
    plate.className = 'hg-spot-plate';
    const name = document.createElement('b');
    name.textContent = s.name;
    plate.append(name);
    if (s.who) {
      const who = document.createElement('small');
      who.textContent = CAST_NAMES[s.who] || s.who;
      plate.append(who);
    }
    b.append(plate);
    b.setAttribute('aria-label', `${s.name}${s.who ? `, ${CAST_NAMES[s.who]}` : ''}. ${s.blurb}`);
    b.addEventListener('click', () => openStation(s.id, { via: 'click' }));
    b.addEventListener('mouseenter', () => scene.setHover(s.id));
    b.addEventListener('mouseleave', () => scene.setHover(null));
    b.addEventListener('focus', () => scene.setHover(s.id));
    b.addEventListener('blur', () => scene.setHover(null));
    layer.append(b);
    buttons.set(s.id, b);
  }

  function place() {
    for (const s of STATIONS) {
      const b = buttons.get(s.id);
      const p = scene.toScreen(s.at.x, s.at.y);
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    }
  }

  function paintButtons(save = store.get()) {
    const st = states(save);
    for (const s of STATIONS) {
      const b = buttons.get(s.id);
      b.classList.toggle('is-locked', st[s.id].locked);
      b.classList.toggle('is-objective', st[s.id].objective);
      b.classList.toggle('is-open', current === s.id);
      b.setAttribute('aria-expanded', String(current === s.id));
    }
    scene.setStates(st);
  }

  // --- The sheet -------------------------------------------------------------------
  function showView(stationId, viewId) {
    const views = viewsFor(stationId);
    const view = views.find((v) => v.id === viewId) || views[0];
    subtab[stationId] = view.id;
    for (const [id, pane] of Object.entries(panes)) pane.hidden = id !== view.pane;
    drawMount(stationId, view);
    sheet.tabs.replaceChildren();
    sheet.tabs.hidden = views.length < 2;
    if (views.length > 1) {
      for (const v of views) {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'ui-tab';
        t.textContent = v.label;
        t.dataset.view = v.id;
        t.setAttribute('aria-pressed', String(v.id === view.id));
        t.addEventListener('click', () => {
          showView(stationId, v.id);
          if (v.pane === 'station') renderStation(stationById(stationId), stationState(store.get(), stationById(stationId), isUnlocked, objective), panes.station, v.id);
          onOpen(stationById(stationId), v.pane, { view: v.id });
          sheet.tabs.querySelector(`[data-view="${v.id}"]`)?.focus({ preventScroll: true });
        });
        sheet.tabs.append(t);
      }
    }
    return view;
  }

  function openStation(id, { via = 'click', view = null } = {}) {
    const s = stationById(id);
    if (!s) return false;
    const save = store.get();
    const st = stationState(save, s, isUnlocked, objective);
    if (current !== id) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    current = id;
    // The panel opens on the side away from the station (it stays in view).
    const side = s.at.x < 12 ? 'right' : 'left';
    sheet.root.dataset.side = side;
    document.body.classList.add('hg-sheet-open');
    document.body.dataset.sheetSide = side;
    sheet.root.dataset.station = id;
    sheet.root.hidden = false;
    sheet.title.textContent = s.name;
    sheet.who.textContent = s.who ? `${(CAST_NAMES[s.who] || s.who).toUpperCase()}${st.locked ? ' · NOT YET' : ''}` : st.locked ? 'LOCKED' : 'STATION';
    scene.focus(id, side);
    const chosen = showView(id, view || subtab[id]);
    if (st.locked) {
      // Locked: the panel says why, whatever the view.
      for (const pane of Object.values(panes)) pane.hidden = true;
      panes.station.hidden = false;
      sheet.tabs.hidden = true;
      renderStation(s, st, panes.station, 'locked');
    } else if (chosen.pane === 'station') {
      renderStation(s, st, panes.station, chosen.id);
    }
    paintButtons(save);
    if (via === 'refresh') return true; // a redraw, not a visit
    if (via === 'click') bus?.emit('tutorial:arrived', { station: id });
    if (s.who) bus?.emit(`met:${s.who}`, {});
    bus?.emit('hangar:opened', { station: id, via });
    onOpen(s, chosen.pane, { via, locked: st.locked, view: chosen.id });
    for (const fn of listeners) fn({ type: 'open', station: id, via });
    // Keyboard users land in the panel.
    if (via !== 'walk') requestAnimationFrame(() => sheet.close.focus({ preventScroll: true }));
    return true;
  }

  function closeStation({ restoreFocus = true } = {}) {
    if (!current) return false;
    const was = current;
    current = null;
    drawMount(was, null);
    sheet.root.hidden = true;
    document.body.classList.remove('hg-sheet-open');
    for (const pane of Object.values(panes)) pane.hidden = true;
    scene.focus(null);
    paintButtons();
    bus?.emit('hangar:closed', { station: was });
    onClose(stationById(was));
    for (const fn of listeners) fn({ type: 'close', station: was });
    if (restoreFocus) (opener?.isConnected ? opener : buttons.get(was))?.focus({ preventScroll: true });
    return true;
  }

  sheet.close.addEventListener('click', () => closeStation());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !e.defaultPrevented) {
      // Escape inside a text box only leaves the box.
      if (e.target instanceof HTMLInputElement) return;
      closeStation();
    }
  });

  // The director's objective: a banner and a pulsing ring on its station.
  bus?.on('story:objective', (o) => { objective = o || null; paintButtons(); });
  store.subscribe((save) => {
    paintButtons(save);
    // A station that unlocks while open redraws its panel.
    if (current) {
      const s = stationById(current);
      const st = stationState(save, s, isUnlocked, objective);
      const view = viewsFor(current).find((v) => v.id === subtab[current]) || viewsFor(current)[0];
      if (view.pane === 'station' || st.locked) renderStation(s, st, panes.station, st.locked ? 'locked' : view.id);
    }
  });
  // A lane mounting a view or a launch while its station is open redraws it.
  watchRegistry(() => { if (current) openStation(current, { via: 'refresh', view: subtab[current] }); });
  paintButtons();

  return {
    openStation,
    closeStation,
    place,
    get current() { return current; },
    get objective() { return objective; },
    /** fn({ type: 'open'|'close', station, via }) -> unsubscribe */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    states: () => states(),
  };
}
