import { createStatChart } from './shipStatsChart.js';
import { buildKey } from '../engine/shipStats.js';
import { state } from '../state.js';
import {
  PART_SLOTS,
  ZONES,
  SHIP_STYLES,
  PART_CHOICES,
  SHAPES,
  SAYINGS,
  sayingText,
  MAX_LAYERS,
  presetAppearance,
  cleanAppearance,
  newLayer,
  applyLivery,
} from '../systems/shipLivery.js';
import {
  initCourierAppearance,
  APPEARANCE_KEY,
  getEquippedAppearance,
  renderAppearance,
  equipAppearance,
  availablePartIndices,
} from '../systems/shipAppearance.js';
import {
  readLibrary,
  saveDesign,
  removeDesign,
  downloadDesign,
  readDesignFile,
  liveryRequest,
  getLiveryApi,
  setLiveryApi,
} from '../systems/liveryLibrary.js';
let initialized = false;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const label = (s) => s[0].toUpperCase() + s.slice(1);
const PALETTES = [
  { id: 'nebula', name: 'Nebula', colors: ['#ffffff', '#855bff', '#ff4fad', '#000000', '#4ce6ff', '#292050'] },
  { id: 'solar', name: 'Solar', colors: ['#ffffff', '#f4b23a', '#f2653a', '#000000', '#ffd86b', '#573524'] },
  { id: 'tidal', name: 'Tidal', colors: ['#ffffff', '#1b6fe8', '#39e0cd', '#000000', '#83bcff', '#153451'] },
  { id: 'ember', name: 'Ember', colors: ['#ffffff', '#d43b56', '#ff6b44', '#000000', '#e7ad70', '#462532'] },
  { id: 'aurora', name: 'Aurora', colors: ['#ffffff', '#38bd75', '#adea69', '#000000', '#62e4ca', '#184637'] },
];
const ranges = [
  ['x', 'Horizontal', -0.65, 0.65, 0.005],
  ['y', 'Vertical', -0.65, 0.65, 0.005],
  ['width', 'Width', 0.02, 1.8, 0.005],
  ['height', 'Height', 0.02, 1.8, 0.005],
  ['angle', 'Rotation', -180, 180, 1],
  ['opacity', 'Opacity', 0, 1, 0.01],
];
export function initShipGarage() {
  if (initialized) return;
  initialized = true;
  const opener = document.getElementById('hangar-ship');
  if (!opener) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'ship-garage';
  dialog.className = 'ship-garage';
  dialog.setAttribute('aria-labelledby', 'garage-title');
  dialog.innerHTML = `<div class="garage-layout">
 <header class="garage-header"><div><p class="eyebrow">STARDUST / PERSONAL SHIP</p><h2 id="garage-title">Your ship. Your signature.</h2></div><button class="garage-close" type="button" aria-label="Close ship garage">Close ×</button></header>
 <div class="garage-stage"><span class="garage-stage-label"></span><canvas class="garage-preview" id="garage-preview" width="768" height="768" tabindex="0" aria-label="Customized ship. Drag to spin." role="img"></canvas><div class="garage-flight-sample"><canvas width="84" height="84" aria-label="Ship at flight scale"></canvas><span id="garage-gesture">DRAG TO SPIN</span></div><div class="garage-stage-tools"><button id="garage-undo" type="button" aria-label="Undo">↶</button><button id="garage-redo" type="button" aria-label="Redo">↷</button><label class="garage-zoom">Zoom<input id="garage-zoom" type="range" min=".65" max="1.8" step=".05" value="1"></label><button id="garage-edit" type="button" aria-pressed="false">Edit decals</button><button id="garage-spin" type="button" aria-pressed="false">Auto spin</button><button id="garage-reset-angle" type="button">Reset view</button></div></div>
 <section class="garage-tray" aria-label="Customization"><div class="garage-tabs" role="tablist">${['Ships', 'Parts', 'Paint', 'Decals', 'Designs'].map((s, i) => `<button type="button" id="garage-tab-${s.toLowerCase()}" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="garage-panel-${s.toLowerCase()}" data-tab="${s.toLowerCase()}">${s.toUpperCase()}</button>`).join('')}</div>
 <div class="garage-panel" id="garage-panel-ships" role="tabpanel" aria-labelledby="garage-tab-ships"><p class="garage-caption">Pick a hull family. Your paint and artwork travel with you.</p><div class="garage-options"></div></div>
 <div class="garage-panel" id="garage-panel-parts" role="tabpanel" aria-labelledby="garage-tab-parts" hidden><p class="garage-caption">Build a silhouette with a personality.</p><div class="garage-part-groups"></div></div>
 <div class="garage-panel" id="garage-panel-paint" role="tabpanel" aria-labelledby="garage-tab-paint" hidden><p class="garage-caption">Six separate surfaces. No compulsory stripes. Go subtle or go loud.</p><div class="garage-paints">${ZONES.map((z) => `<label class="garage-color">${{ nose: 'Inset panels', trim: 'Frame / trim', glass: 'Canopy / lights', engines: 'Engine housings' }[z] || label(z)}<input type="color" id="garage-paint-${z}" aria-label="${label(z)} paint"></label>`).join('')}</div><div class="garage-palettes"></div></div>
 <div class="garage-panel" id="garage-panel-decals" role="tabpanel" aria-labelledby="garage-tab-decals" hidden><div class="garage-decal-grid"><div><p class="garage-caption">Click a layer, drag it on the ship. Corner handles resize; the round handle rotates. Shift snaps movement.</p><div class="garage-decal-buttons">${SHAPES
   .map((s) => `<button type="button" data-shape="${s}">${label(s)}</button>`)
   .join(
     '',
 )}</div><div class="garage-layers" aria-label="Decal layers"></div></div><div><div class="garage-layer-tools"><label>Decal palette<select id="garage-decal-palette">${PALETTES.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label><div class="garage-color-swatches" aria-label="Decal palette colors"></div><label>Decal color<input type="color" id="garage-decal-color" value="#ffffff"></label><label class="garage-text-label">Saying<select id="garage-saying">${SAYINGS.map((s) => `<option value="${s.id}">${s.text}</option>`).join('')}</select></label><div class="garage-layer-actions">${[
   ['mirror', 'Mirror other side'],
   ['duplicate', 'Duplicate'],
   ['flip', 'Flip'],
   ['front', 'Forward'],
   ['back', 'Backward'],
   ['visible', 'Show / hide'],
   ['remove', 'Delete'],
 ]
   .map(([k, t]) => `<button type="button" data-layer-action="${k}">${t}</button>`)
   .join(
     '',
   )}</div></div><div class="garage-sliders">${ranges.map(([id, name, min, max, step]) => `<label class="garage-slider">${name}<output id="garage-decal-${id}-value"></output><input aria-label="Decal ${name.toLowerCase()}" id="garage-decal-${id}" type="range" min="${min}" max="${max}" step="${step}"></label>`).join('')}</div></div></div></div>
 <div class="garage-panel" id="garage-panel-designs" role="tabpanel" aria-labelledby="garage-tab-designs" hidden><div class="garage-design-grid"><div><p class="garage-caption">Save a reusable livery, apply it to another hull, or export its editable layers.</p><label class="garage-field">Design name<input id="garage-design-name" maxlength="60" value="My livery"></label><div class="garage-design-actions"><button type="button" id="garage-save">Save locally</button><button type="button" id="garage-export">Export design</button><button type="button" id="garage-publish">Publish to my profile</button></div><label class="garage-file">Import editable design<input id="garage-import" type="file" accept="application/json,.json"></label><div id="garage-library"></div></div><div><p id="garage-account" class="garage-caption">Community designs use your Stardust account.</p><div class="garage-community-tools"><input id="garage-artist" aria-label="Creator username" placeholder="Creator username"><button type="button" id="garage-browse">Browse designs</button><button type="button" id="garage-my-profile">My profile</button></div><div id="garage-gallery"></div><div id="garage-design-detail" hidden></div><details id="garage-dev-api" hidden><summary>Local development Hub</summary><input id="garage-api" aria-label="Development API origin" placeholder="http://127.0.0.1:4183"><button type="button" id="garage-connect">Connect</button><form id="garage-sign-in"><input name="email" type="email" autocomplete="username" placeholder="Test account email" aria-label="Email" required><input name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required><button>Sign in</button></form></details></div></div></div>
 </section><footer class="garage-footer"><p id="garage-status" class="garage-status" role="status">Loading ship parts…</p><div class="garage-footer-actions"><button id="garage-cancel" type="button">Cancel</button><button id="garage-equip" type="button" class="primary" disabled>Equip ship</button></div></footer></div>`;
  document.body.append(dialog);
  const find = (s) => dialog.querySelector(s),
    preview = find('#garage-preview'),
    ctx = preview.getContext('2d'),
    sample = find('.garage-flight-sample canvas'),
    sampleCtx = sample.getContext('2d'),
    status = find('#garage-status'),
    equip = find('#garage-equip');
  let draft = presetAppearance(),
    selected = null,
    ready = false,
    rendered = null,
    angle = -18,
    zoom = 1,
    editing = false,
    spinning = false,
    frame = 0,
    lastFrame = 0,
    pointer = null,
    generation = 0,
    closing = false,
    history = [],
    future = [],
    user = null,
    detail = null,
    communityTicket = 0;
  const selectedLayer = () => draft.layers.find((l) => l.id === selected);
  const reduced = () =>
    state.settings?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setStatus = (t) => (status.textContent = t);
  function remember() {
    history.push(JSON.stringify(draft));
    if (history.length > 30) history.shift();
    future = [];
  }
  function transform() {
    preview.style.setProperty('--garage-angle', `${angle}deg`);
    preview.style.setProperty('--garage-zoom', zoom);
  }
  function stopSpin() {
    spinning = false;
    cancelAnimationFrame(frame);
    frame = 0;
    find('#garage-spin').setAttribute('aria-pressed', 'false');
  }
  function setEditing(value) {
    editing = value;
    stopSpin();
    if (value) angle = 0;
    transform();
    find('#garage-edit').setAttribute('aria-pressed', String(value));
    preview.classList.toggle('editing', value);
    find('#garage-gesture').textContent = value
      ? 'DRAG TO POSITION · SHIFT TO SNAP'
      : 'DRAG TO SPIN';
    paint();
  }
  // The flight stat chart on the stage, for the build being edited.
  const statChart = createStatChart();
  find('.garage-stage').append(statChart);
  function sync() {
    statChart.update(buildKey({ family: draft.family, ...draft.parts }));
    for (const z of ZONES) find(`#garage-paint-${z}`).value = draft.paint[z];
    for (const b of dialog.querySelectorAll('[data-family]'))
      b.setAttribute('aria-pressed', String(b.dataset.family === draft.family));
    for (const b of dialog.querySelectorAll('[data-part]'))
      b.setAttribute(
        'aria-pressed',
        String(draft.parts[b.dataset.slot] === Number(b.dataset.part)),
      );
    const d = selectedLayer();
    for (const [key] of ranges) {
      const input = find(`#garage-decal-${key}`),
        v = d?.[key] ?? { width: 0.25, height: 0.25, opacity: 1 }[key] ?? 0;
      input.value = v;
      input.disabled = !d;
      find(`#garage-decal-${key}-value`).textContent =
        key === 'angle' ? `${Math.round(v)}°` : `${Math.round(v * 100)}%`;
    }
    find('#garage-decal-color').value = d?.color || '#ffffff';
    find('#garage-decal-color').disabled = !d;
    if (d?.kind === 'text') find('#garage-saying').value = d.saying;
    find('.garage-text-label').hidden = d?.kind !== 'text';
    for (const b of dialog.querySelectorAll('[data-layer-action]')) b.disabled = !d;
    for (const b of dialog.querySelectorAll('[data-palette-color]')) {
      b.disabled = !d;
      b.setAttribute('aria-pressed', String(d?.color === b.dataset.paletteColor));
    }
    find('#garage-undo').disabled = !history.length;
    find('#garage-redo').disabled = !future.length;
    find('.garage-stage-label').textContent =
      `${draft.family.toUpperCase()} / ${PART_CHOICES[draft.family].wings[draft.parts.wings].split(' / ')[0].toUpperCase()} / ${draft.layers.length} LAYERS`;
  }
  function paint() {
    if (!ready) return;
    rendered = renderAppearance(draft);
    ctx.clearRect(0, 0, 768, 768);
    ctx.drawImage(rendered, 0, 0);
    sampleCtx.clearRect(0, 0, 84, 84);
    sampleCtx.drawImage(rendered, 0, 0, 84, 84);
    const d = selectedLayer();
    if (editing && d) {
      ctx.save();
      ctx.translate(768 * (0.5 + d.x), 768 * (0.5 + d.y));
      ctx.rotate((d.angle * Math.PI) / 180);
      const w = 768 * d.width,
        h = 768 * d.height;
      ctx.strokeStyle = '#69f3ec';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(0, -h / 2 - 35);
      ctx.stroke();
      ctx.fillStyle = '#69f3ec';
      for (const x of [-w / 2, w / 2])
        for (const y of [-h / 2, h / 2]) ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.beginPath();
      ctx.arc(0, -h / 2 - 35, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    sync();
  }
  function layerList() {
    const list = find('.garage-layers');
    list.replaceChildren();
    const caption = document.createElement('p');
    caption.className = 'garage-caption';
    caption.textContent = `${draft.layers.length}/${MAX_LAYERS} layers · top row is in front`;
    list.append(caption);
    for (const d of [...draft.layers].reverse()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.layer = d.id;
      b.className = 'garage-layer';
      b.setAttribute('aria-pressed', String(d.id === selected));
      b.textContent = `${d.visible ? '●' : '○'} ${d.kind === 'text' ? sayingText(d.saying) || 'Text' : label(d.kind)} ${d.flipX ? '↔' : ''}`;
      b.style.setProperty('--layer-color', d.color);
      b.addEventListener('click', () => {
        selected = d.id;
        setEditing(true);
        layerList();
      });
      list.append(b);
    }
  }
  function parts() {
    const groups = find('.garage-part-groups');
    groups.replaceChildren();
    for (const slot of PART_SLOTS) {
      const field = document.createElement('fieldset'),
        legend = document.createElement('legend');
      legend.textContent = label(slot);
      field.append(legend);
      PART_CHOICES[draft.family][slot].forEach((name, index) => {
        if (!availablePartIndices(draft.family, slot).includes(index)) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'garage-part-choice';
        b.dataset.slot = slot;
        b.dataset.part = index;
        b.textContent = name;
        const thumb = document.createElement('canvas');
        thumb.width = thumb.height = 96;
        const a = structuredClone(draft);
        a.layers = [];
        a.parts[slot] = index;
        thumb.getContext('2d').drawImage(renderAppearance(a, null, 96), 0, 0);
        b.prepend(thumb);
        b.addEventListener('click', () => {
          remember();
          draft.parts[slot] = index;
          paint();
        });
        field.append(b);
      });
      groups.append(field);
    }
    sync();
  }
  function createOptions() {
    for (const style of SHIP_STYLES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'garage-card';
      b.dataset.family = style.id;
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      c.getContext('2d').drawImage(renderAppearance(presetAppearance(style.id), null, 128), 0, 0);
      const title = document.createElement('b'),
        desc = document.createElement('small');
      title.textContent = style.name;
      desc.textContent = style.description;
      b.append(c, title, desc);
      b.addEventListener('click', () => {
        remember();
        const next = presetAppearance(style.id);
        if (draft.layers.length) draft = applyLivery(next, draft);
        else draft = next;
        selected = draft.layers.at(-1)?.id;
        generation++;
        equip.disabled = !ready;
        parts();
        layerList();
        paint();
        setStatus(`${style.name} selected. Artwork uses the same coordinates on every hull.`);
      });
      find('.garage-options').append(b);
    }
    for (const s of PALETTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'garage-palette';
      b.setAttribute('aria-label', `${s.name} paint palette`);
      b.innerHTML = `<span class="garage-palette-name">${s.name}</span><span class="garage-palette-preview" aria-hidden="true">${s.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span>`;
      b.addEventListener('click', () => {
        remember();
        draft.paint = Object.fromEntries(ZONES.map((z, i) => [z, s.colors[i]]));
        paint();
        setStatus(`${s.name} paint applied. Every surface is still editable.`);
      });
      find('.garage-palettes').append(b);
    }
    parts();
  }
  function changeTab(name) {
    for (const b of dialog.querySelectorAll('[data-tab]')) {
      const active = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      find(`#garage-panel-${b.dataset.tab}`).hidden = !active;
    }
    if (name === 'decals') setEditing(true);
    else setEditing(false);
    if (name === 'designs') {
      library();
      refreshSession();
    }
  }
  async function transition(from, reverse = false) {
    if (reduced() || !preview.animate || !from.width) return;
    const to = preview.getBoundingClientRect(),
      dx = from.x + from.width / 2 - to.x - to.width / 2,
      dy = from.y + from.height / 2 - to.y - to.height / 2;
    const small = `translate(${dx}px,${dy}px) scale(${from.width / to.width}) rotate(${angle}deg)`,
      large = `rotate(${angle}deg) scale(${zoom})`;
    await preview
      .animate(
        [
          { transform: reverse ? large : small, opacity: reverse ? 1 : 0.7 },
          { transform: reverse ? small : large, opacity: reverse ? 0.4 : 1 },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' },
      )
      .finished.catch(() => {});
  }
  async function open() {
    if (dialog.open) return;
    const ticket = ++generation;
    draft = getEquippedAppearance() || presetAppearance();
    history = [];
    future = [];
    selected = draft.layers.at(-1)?.id;
    angle = -18;
    zoom = 1;
    editing = false;
    closing = false;
    equip.disabled = true;
    find('#garage-zoom').value = 1;
    transform();
    const bounds = opener.getBoundingClientRect();
    dialog.showModal();
    document.body.classList.add('garage-open');
    window.dispatchEvent(new Event('stardust:clear-input'));
    find('.garage-close').focus();
    if (ready) {
      if (ticket !== generation || !dialog.open) return;
      parts();
      layerList();
      changeTab(find('[data-tab][aria-selected="true"]').dataset.tab);
      equip.disabled = false;
      setStatus('Build your look. Equip to save and fly it.');
      transition(bounds);
    }
  }
  async function close() {
    if (!dialog.open || closing) return;
    closing = true;
    generation++;
    communityTicket++;
    find('#garage-gallery').dataset.view = 'closed';
    stopSpin();
    release();
    if (ready) await transition(opener.getBoundingClientRect(), true);
    dialog.close();
    document.body.classList.remove('garage-open');
    closing = false;
    opener.focus();
  }
  for (const s of ['.garage-close', '#garage-cancel']) find(s).addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (
      (e.ctrlKey || e.metaKey) &&
      !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
      ['z', 'y'].includes(e.key.toLowerCase())
    ) {
      e.preventDefault();
      find(`#garage-${e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo'}`).click();
    }
  });
  equip.addEventListener('click', () => {
    if (!ready) return;
    try {
      const persisted = equipAppearance(draft);
      window.dispatchEvent(new CustomEvent('stardust:garage-equipped', { detail: { persisted } }));
      if (persisted) close();
      else
        setStatus(
          'Equipped for this session. Browser storage is full; export your design to keep it.',
        );
    } catch (e) {
      setStatus(e.message);
    }
  });
  for (const b of dialog.querySelectorAll('[data-tab]')) {
    b.addEventListener('click', () => changeTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const tabs = [...dialog.querySelectorAll('[data-tab]')],
        i = tabs.indexOf(b),
        next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  }
  // Map pointer coordinates through the preview's rotation and zoom, including mobile.
  function point(e) {
    const r = preview.getBoundingClientRect(),
      a = (-angle * Math.PI) / 180,
      dx = e.clientX - r.x - r.width / 2,
      dy = e.clientY - r.y - r.height / 2;
    return {
      x: (dx * Math.cos(a) - dy * Math.sin(a)) / (preview.clientWidth * zoom),
      y: (dx * Math.sin(a) + dy * Math.cos(a)) / (preview.clientHeight * zoom),
    };
  }
  function local(p, d) {
    const a = (-d.angle * Math.PI) / 180,
      x = p.x - d.x,
      y = p.y - d.y;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }
  function hit(p, d) {
    const q = local(p, d);
    return Math.abs(q.x) <= d.width / 2 && Math.abs(q.y) <= d.height / 2;
  }
  preview.addEventListener('pointerdown', (e) => {
    if (!ready || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopSpin();
    const p = point(e);
    let d = selectedLayer(),
      mode = 'move',
      corner = null;
    if (editing) {
      const radius = 16 / (preview.clientWidth * zoom);
      if (d) {
        const q = local(p, d);
        if (Math.hypot(q.x, q.y + d.height / 2 + 35 / 768) < radius) mode = 'rotate';
        else
          for (const sx of [-1, 1])
            for (const sy of [-1, 1])
              if (Math.hypot(q.x - (sx * d.width) / 2, q.y - (sy * d.height) / 2) < radius) {
                mode = 'resize';
                corner = { x: sx, y: sy };
              }
      }
      if (mode === 'move') {
        d = [...draft.layers].reverse().find((l) => l.visible && hit(p, l));
        if (!d) {
          selected = null;
          layerList();
          paint();
          return;
        }
        selected = d.id;
      }
      remember();
    }
    pointer = {
      id: e.pointerId,
      start: p,
      startX: e.clientX,
      startAngle: angle,
      mode,
      corner,
      layer: d ? structuredClone(d) : null,
    };
    preview.setPointerCapture(e.pointerId);
    preview.classList.add('is-dragging');
    preview.focus();
    layerList();
    paint();
  });
  preview.addEventListener('pointermove', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (!editing) {
      angle = pointer.startAngle + (e.clientX - pointer.startX) * 0.7;
      transform();
      return;
    }
    const d = selectedLayer();
    if (!d) return;
    const p = point(e),
      o = pointer.layer;
    if (pointer.mode === 'move') {
      d.x = clamp(o.x + p.x - pointer.start.x, -0.65, 0.65);
      d.y = clamp(o.y + p.y - pointer.start.y, -0.65, 0.65);
      if (e.shiftKey) {
        d.x = Math.round(d.x / 0.025) * 0.025;
        d.y = Math.round(d.y / 0.025) * 0.025;
      }
    } else if (pointer.mode === 'rotate') {
      const degrees = (Math.atan2(p.y - d.y, p.x - d.x) * 180) / Math.PI + 90;
      d.angle = ((((degrees + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) d.angle = Math.round(d.angle / 15) * 15;
    } else {
      const q = local(p, o);
      d.width = clamp(Math.abs(q.x) * 2, 0.02, 1.8);
      d.height = clamp(Math.abs(q.y) * 2, 0.02, 1.8);
      if (e.shiftKey) d.height = clamp((d.width * o.height) / o.width, 0.02, 1.8);
    }
    paint();
  });
  function release() {
    if (pointer && preview.hasPointerCapture(pointer.id)) preview.releasePointerCapture(pointer.id);
    pointer = null;
    preview.classList.remove('is-dragging');
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    preview.addEventListener(event, release);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSpin();
      release();
    }
  });
  preview.addEventListener('keydown', (e) => {
    const d = selectedLayer();
    if (
      editing &&
      d &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(e.key)
    ) {
      e.preventDefault();
      remember();
      if (e.key === 'Delete') {
        draft.layers = draft.layers.filter((l) => l.id !== d.id);
        selected = null;
        layerList();
      } else {
        const step = e.shiftKey ? 0.025 : 0.005;
        d.x = clamp(
          d.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
          -0.65,
          0.65,
        );
        d.y = clamp(
          d.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          -0.65,
          0.65,
        );
      }
      paint();
    } else if (['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) {
      e.preventDefault();
      stopSpin();
      angle = e.key === 'Home' ? 0 : angle + (e.key === 'ArrowRight' ? 15 : -15);
      transform();
    }
  });
  find('#garage-edit').addEventListener('click', () => setEditing(!editing));
  find('#garage-reset-angle').addEventListener('click', () => {
    stopSpin();
    angle = 0;
    zoom = 1;
    find('#garage-zoom').value = 1;
    transform();
  });
  find('#garage-zoom').addEventListener('input', (e) => {
    zoom = Number(e.target.value);
    transform();
  });
  find('#garage-spin').addEventListener('click', () => {
    if (spinning) {
      stopSpin();
      return;
    }
    if (reduced()) {
      setStatus('Auto spin is off while reduced motion is enabled.');
      return;
    }
    setEditing(false);
    spinning = true;
    lastFrame = performance.now();
    find('#garage-spin').setAttribute('aria-pressed', 'true');
    function spin(now) {
      if (!dialog.open || !spinning || document.hidden) {
        stopSpin();
        return;
      }
      angle = (angle + Math.min(40, now - lastFrame) * 0.012) % 360;
      lastFrame = now;
      transform();
      frame = requestAnimationFrame(spin);
    }
    frame = requestAnimationFrame(spin);
  });
  for (const [id, undo] of [
    ['undo', true],
    ['redo', false],
  ])
    find(`#garage-${id}`).addEventListener('click', async () => {
      const source = undo ? history : future,
        target = undo ? future : history;
      if (!source.length) return;
      target.push(JSON.stringify(draft));
      draft = JSON.parse(source.pop());
      selected = draft.layers.at(-1)?.id;
      const ticket = ++generation;
      equip.disabled = true;
      try {
        if (ticket !== generation || !dialog.open) return;
        parts();
        layerList();
        paint();
      } catch (error) {
        setStatus(error.message);
      } finally {
        if (ticket === generation) equip.disabled = !ready;
      }
    });
  for (const z of ZONES) {
    const input = find(`#garage-paint-${z}`);
    input.addEventListener('focus', remember);
    input.addEventListener('input', (e) => {
      draft.paint[z] = e.target.value;
      paint();
    });
  }
  for (const [key] of ranges) {
    const input = find(`#garage-decal-${key}`);
    input.addEventListener('pointerdown', remember);
    input.addEventListener('keydown', (e) => {
      if (e.key.startsWith('Arrow')) remember();
    });
    input.addEventListener('input', (e) => {
      const d = selectedLayer();
      if (d) {
        d[key] = Number(e.target.value);
        paint();
      }
    });
  }
  function addLayer(d) {
    if (draft.layers.length >= MAX_LAYERS) {
      setStatus('The layer limit is 32. Remove a layer first.');
      return;
    }
    remember();
    draft.layers.push(d);
    selected = d.id;
    setEditing(true);
    layerList();
    paint();
  }
  for (const b of dialog.querySelectorAll('[data-shape]'))
    b.addEventListener('click', () =>
      addLayer(newLayer(b.dataset.shape, find('#garage-decal-color').value)),
    );
  find('#garage-decal-color').addEventListener('focus', remember);
  function decalPalette() {
    const palette = PALETTES.find(p => p.id === find('#garage-decal-palette').value) || PALETTES[0];
    const root = find('.garage-color-swatches');
    root.replaceChildren();
    for (const color of ['#ffffff', '#000000', ...palette.colors.filter(c => c !== '#ffffff' && c !== '#000000')]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.paletteColor = color;
      button.disabled = !selectedLayer();
      button.setAttribute('aria-pressed', String(selectedLayer()?.color === color));
      button.style.background = color;
      button.setAttribute('aria-label', color === '#ffffff' ? 'White decal' : color === '#000000' ? 'Black decal' : `${palette.name} ${color} decal`);
      button.addEventListener('click', () => {
        const layer = selectedLayer();
        if (!layer) return;
        remember();
        layer.color = color;
        paint();
        layerList();
      });
      root.append(button);
    }
  }
  find('#garage-decal-palette').addEventListener('change', decalPalette);
  decalPalette();
  find('#garage-decal-color').addEventListener('input', (e) => {
    const d = selectedLayer();
    if (d) {
      d.color = e.target.value;
      paint();
      layerList();
    }
  });
  find('#garage-saying').addEventListener('change', (e) => {
    const d = selectedLayer();
    if (d?.kind !== 'text' || sayingText(e.target.value) === null) return;
    remember();
    d.saying = e.target.value;
    paint();
    layerList();
  });
  for (const b of dialog.querySelectorAll('[data-layer-action]'))
    b.addEventListener('click', () => {
      const d = selectedLayer();
      if (!d) return;
      const action = b.dataset.layerAction;
      if (['duplicate', 'mirror'].includes(action)) {
        const copy = structuredClone(d);
        copy.id = newLayer(d.kind).id;
        if (action === 'mirror') {
          copy.x = -d.x;
          copy.angle = -d.angle;
          copy.flipX = !d.flipX;
        } else {
          copy.x = clamp(d.x + 0.03, -0.65, 0.65);
          copy.y = clamp(d.y + 0.03, -0.65, 0.65);
        }
        addLayer(copy);
        return;
      }
      remember();
      const i = draft.layers.indexOf(d);
      if (action === 'remove') {
        draft.layers.splice(i, 1);
        selected = draft.layers.at(-1)?.id;
      }
      if (action === 'visible') d.visible = !d.visible;
      if (action === 'flip') d.flipX = !d.flipX;
      if (action === 'front' && i < draft.layers.length - 1)
        [draft.layers[i], draft.layers[i + 1]] = [draft.layers[i + 1], draft.layers[i]];
      if (action === 'back' && i > 0)
        [draft.layers[i], draft.layers[i - 1]] = [draft.layers[i - 1], draft.layers[i]];
      layerList();
      paint();
    });
  async function applyDesign(a, name) {
    const ticket = ++generation;
    equip.disabled = true;
    try {
      if (ticket !== generation || !dialog.open) return;
      remember();
      draft = applyLivery(draft, a);
      selected = draft.layers.at(-1)?.id;
      if (name) find('#garage-design-name').value = name;
      layerList();
      paint();
      setStatus('Livery applied to your current hull. Equip to fly it.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      if (ticket === generation) equip.disabled = !ready;
    }
  }
  function library() {
    const root = find('#garage-library');
    root.replaceChildren();
    for (const entry of readLibrary()) {
      const row = document.createElement('div');
      row.className = 'garage-saved-design';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = entry.name;
      b.addEventListener('click', () => applyDesign(entry.appearance, entry.name));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      copy.setAttribute('aria-label', `Copy saved ${entry.name}`);
      copy.addEventListener('click', async () => {
        const text = JSON.stringify({ format:'stardust-livery', name:entry.name, appearance:entry.appearance }, null, 2);
        let backup = root.querySelector('.garage-copy-backup');
        if (!backup) {
          backup = document.createElement('textarea');
          backup.className = 'garage-copy-backup';
          backup.readOnly = true;
          backup.setAttribute('aria-label', 'Editable design backup');
          root.append(backup);
        }
        backup.value = text;
        try {
          await navigator.clipboard.writeText(text);
          setStatus(`${entry.name} copied as an editable design backup.`);
        } catch {
          setStatus('Your backup text is ready below. Select it to copy, or use Export design.');
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete saved ${entry.name}`);
      remove.addEventListener('click', () => {
        removeDesign(entry.id);
        library();
      });
      row.append(b, copy, remove);
      root.append(row);
    }
  }
  find('#garage-save').addEventListener('click', () => {
    try {
      saveDesign(find('#garage-design-name').value, draft);
      library();
      setStatus('Design saved on this device. Apply it to any ship.');
    } catch (e) {
      setStatus(e.message);
    }
  });
  find('#garage-export').addEventListener('click', () =>
    downloadDesign(find('#garage-design-name').value, draft),
  );
  find('#garage-import').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ticket = ++generation;
    try {
      const doc = await readDesignFile(f);
      if (ticket !== generation || !dialog.open) return;
      await applyDesign(doc.appearance, doc.name);
    } catch (error) {
      setStatus(error.message);
    }
  });
  function button(text, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => Promise.resolve(action()).catch((e) => setStatus(e.message)));
    return b;
  }
  async function refreshSession() {
    try {
      const data = await liveryRequest('/users/session');
      user = data.user;
      find('#garage-account').textContent = user
        ? `Publishing as @${user.username}`
        : 'Sign in to publish and comment. Browsing and downloads are public.';
      if (!user) {
        const a = document.createElement('a');
        a.href = 'https://donavencrenshaw.com/account/';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = ' Sign in';
        find('#garage-account').append(a);
      }
    } catch (e) {
      find('#garage-account').textContent = e.message;
    }
  }
  async function browse(artist = find('#garage-artist').value) {
    const ticket = ++communityTicket;
    setStatus('Loading shared designs…');
    const data = await liveryRequest(
      `/stardust/liveries${artist ? `?artist=${encodeURIComponent(artist)}` : ''}`,
    );
    if (ticket !== communityTicket || !dialog.open) return;
    const root = find('#garage-gallery');
    root.replaceChildren();
    root.dataset.view = String(ticket);
    detail = null;
    find('#garage-design-detail').hidden = true;
    if (data.profile) {
      const p = document.createElement('p');
      p.className = 'garage-caption';
      p.textContent = `${data.profile.displayName || data.profile.username} · @${data.profile.username}${data.profile.bio ? ' · ' + data.profile.bio : ''}`;
      root.append(p);
    }
    function addCard(entry) {
      const card = document.createElement('div');
      card.className = 'garage-shared-design';
      const image = document.createElement('img');
      // No images are stored with a design: draw the thumbnail from the design itself.
      try { image.src = renderAppearance(entry.appearance, null, 256).toDataURL('image/png'); } catch { /* unknown parts: leave the card without a picture */ }
      image.alt = `${entry.title} on ${entry.family}`;
      const title = document.createElement('b');
      title.textContent = entry.title;
      const author = button(`@${entry.author.username}`, () => {
        find('#garage-artist').value = entry.author.username;
        return browse(entry.author.username);
      });
      card.append(
        image,
        title,
        author,
        button('View / comment', () => showDesign(entry.id)),
      );
      root.append(card);
    }
    for (const entry of data.designs) addCard(entry);
    setStatus(
      data.designs.length
        ? 'Choose a design to download its editable layers.'
        : 'No published designs yet.',
    );
    let cursor = data.nextCursor;
    if (cursor) {
      const moreButton = button('More designs', async () => {
        moreButton.disabled = true;
        try {
          const more = await liveryRequest(
            `/stardust/liveries?cursor=${encodeURIComponent(cursor)}${artist ? `&artist=${encodeURIComponent(artist)}` : ''}`,
          );
          if (root.dataset.view !== String(ticket) || !dialog.open) return;
          for (const entry of more.designs) addCard(entry);
          cursor = more.nextCursor;
          if (!cursor) moreButton.remove();
          else root.append(moreButton);
        } finally {
          moreButton.disabled = false;
        }
      });
      root.append(moreButton);
    }
  }
  async function showDesign(id) {
    const ticket = ++communityTicket;
    const data = await liveryRequest(`/stardust/liveries/${encodeURIComponent(id)}`);
    if (ticket !== communityTicket || !dialog.open) return;
    detail = data;
    const root = find('#garage-design-detail');
    root.hidden = false;
    root.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = data.title;
    root.append(
      h,
      button('Apply to my ship', () => applyDesign(data.appearance, data.title)),
      button('Download editable design', () => downloadDesign(data.title, data.appearance)),
      button('Copy profile link', async () => {
        const url = new URL(location.href);
        url.searchParams.set('garageArtist', data.author.username);
        await navigator.clipboard.writeText(url.href);
        setStatus('Creator profile link copied.');
      }),
    );
    if (
      user &&
      (user.username === data.author.username || ['ADMIN', 'MODERATOR'].includes(user.role))
    )
      root.append(
        button('Remove published design', async () => {
          await liveryRequest(`/stardust/liveries/${id}`, { method: 'DELETE' });
          root.hidden = true;
          await browse();
        }),
      );
    const comments = document.createElement('div');
    comments.className = 'garage-comments';
    function addComment(c) {
      const p = document.createElement('p');
      p.textContent = `@${c.author.username}: ${c.text}`;
      comments.append(p);
      if (
        user &&
        (user.username === c.author.username ||
          user.username === data.author.username ||
          ['ADMIN', 'MODERATOR'].includes(user.role))
      )
        comments.append(
          button('Delete comment', async () => {
            await liveryRequest(`/stardust/liveries/${id}/comments/${c.id}`, { method: 'DELETE' });
            return showDesign(id);
          }),
        );
    }
    for (const c of data.comments) addComment(c);
    let commentCursor = data.nextCommentsCursor;
    if (commentCursor) {
      const moreComments = button('Older comments', async () => {
        moreComments.disabled = true;
        try {
          const more = await liveryRequest(
            `/stardust/liveries/${id}?commentsCursor=${encodeURIComponent(commentCursor)}`,
          );
          if (ticket !== communityTicket) return;
          for (const comment of more.comments) addComment(comment);
          commentCursor = more.nextCommentsCursor;
          if (!commentCursor) moreComments.remove();
        } finally {
          moreComments.disabled = false;
        }
      });
      root.append(moreComments);
    }
    root.append(comments);
    const form = document.createElement('form'),
      input = document.createElement('input'),
      submit = document.createElement('button');
    input.maxLength = 500;
    input.required = true;
    input.placeholder = user ? 'Leave a comment' : 'Sign in to comment';
    input.setAttribute('aria-label', 'Comment on design');
    submit.textContent = 'Comment';
    submit.disabled = !user;
    form.append(input, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        await liveryRequest(`/stardust/liveries/${id}/comments`, {
          method: 'POST',
          body: { text: input.value },
        });
        await showDesign(id);
      } catch (error) {
        setStatus(error.message);
        submit.disabled = !user;
      }
    });
    root.append(form);
    root.append(
      button('Report design', async () => {
        if (!user) throw new Error('Sign in to report a design.');
        await liveryRequest(`/stardust/liveries/${id}/report`, {
          method: 'POST',
          body: { reason: 'Please review this published design.' },
        });
        setStatus('Report sent for moderation.');
      }),
    );
  }
  find('#garage-browse').addEventListener('click', () =>
    browse().catch((e) => setStatus(e.message)),
  );
  find('#garage-my-profile').addEventListener('click', async () => {
    await refreshSession();
    if (!user) {
      setStatus('Sign in to see your published profile designs.');
      return;
    }
    find('#garage-artist').value = user.username;
    browse(user.username).catch((e) => setStatus(e.message));
  });
  find('#garage-publish').addEventListener('click', async () => {
    const b = find('#garage-publish');
    b.disabled = true;
    try {
      const data = await liveryRequest('/stardust/liveries', {
        method: 'POST',
        body: {
          title: find('#garage-design-name').value,
          appearance: draft,
        },
      });
      setStatus('Published on your creator profile. Players can comment and download.');
      await refreshSession();
      if (user) {
        find('#garage-artist').value = user.username;
        await browse(user.username);
      }
      await showDesign(data.id);
    } catch (e) {
      setStatus(e.message);
    } finally {
      b.disabled = false;
    }
  });
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    find('#garage-dev-api').hidden = false;
    find('#garage-api').value = getLiveryApi();
    find('#garage-connect').addEventListener('click', () => {
      try {
        setLiveryApi(find('#garage-api').value);
        refreshSession();
      } catch (e) {
        setStatus(e.message);
      }
    });
    find('#garage-sign-in').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        await liveryRequest('/users/login', {
          method: 'POST',
          body: { email: form.elements.email.value, password: form.elements.password.value },
        });
        form.elements.password.value = '';
        await refreshSession();
      } catch (error) {
        setStatus(error.message);
      }
    });
  }
  // The part images are large (about 18 MB). A pilot flying the standard ship
  // does not download them until they open the garage; a pilot with a saved
  // custom ship needs them at start to draw it.
  let started = null;
  const start = () => (started ||= initCourierAppearance()
    .then(() => {
      ready = true;
      createOptions();
      equip.disabled = false;
      if (dialog.open) {
        draft = getEquippedAppearance() || draft;
        selected = draft.layers.at(-1)?.id;
        parts();
        layerList();
        changeTab(find('[data-tab][aria-selected="true"]').dataset.tab);
        setStatus('Build your look. Equip to save and fly it.');
      }
      const artist = new URL(location.href).searchParams.get('garageArtist');
      if (artist) {
        open().then(() => {
          changeTab('designs');
          find('#garage-artist').value = artist;
          browse(artist).catch((e) => setStatus(e.message));
        });
      }
    })
    .catch(() => { started = null; setStatus('Ship parts could not load. Reload to try again.'); }));
  window.addEventListener('stardust:open-garage', () => { start(); open().catch((e) => setStatus(e.message)); });
  let saved = false;
  try { saved = !!localStorage.getItem(APPEARANCE_KEY); } catch { /* private window */ }
  if (saved || new URL(location.href).searchParams.has('garageArtist')) start();
}
