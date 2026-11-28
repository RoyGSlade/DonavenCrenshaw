// One input reader for walking, fighting and flying: keyboard (WASD or
// arrows), mouse aim and click, and touch thumbsticks on phones (left: move,
// right: aim and fire in fights). Buttons for interact and dash. No game rules.
//
//   const input = createInput(root, { mode: 'walk' | 'fight' | 'fly', canvas })
//   input.move() -> {x, y}   input.aim(px, py) -> angle | null (from the player's screen point)
//   input.firing()  input.take('interact' | 'dash' | 'boost')  input.destroy()
import { createEl } from './dom.js';
import { decideAim, decideFire, FIRE_KEYS } from './aim.js';

const MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const AIM_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export const isTouchDevice = () => (globalThis.matchMedia?.('(pointer: coarse)').matches ?? false) || (navigator.maxTouchPoints || 0) > 0;

export function createInput(root, { mode = 'walk', canvas = null, touch = isTouchDevice(), labels = {} } = {}) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false, t: 0 };
  const sticks = { left: null, right: null };
  let enabled = true;

  const onKeyDown = (e) => {
    if (!enabled || e.target.closest?.('input, textarea, select')) return;
    const code = e.code;
    const used = MOVE_KEYS[code] || ['KeyE', 'Enter', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyJ', 'ControlLeft', 'ControlRight'].includes(code);
    if (!used) return;
    e.preventDefault();
    if (!keys.has(code)) {
      if (code === 'KeyE' || code === 'Enter' || (mode === 'walk' && code === 'Space')) pressed.add('interact');
      if (mode === 'fight' && (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight')) pressed.add('dash');
      if (mode === 'fly' && (code === 'ShiftLeft' || code === 'ShiftRight')) pressed.add('boost');
      if (mode === 'fly' && (code === 'KeyE' || code === 'KeyF')) pressed.add('scan');
    }
    keys.add(code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => { keys.clear(); mouse.down = false; };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  // Opening B: the pointer is read on the whole window, not only on the canvas, so a HUD box or a mark layer over the playfield never
  // eats the aim; clicks on a button or a box (the dialogue, the approach bar) are not shots.
  const now = () => (globalThis.performance?.now?.() ?? Date.now());
  const onUi = (e) => Boolean(e.target?.closest?.('button, a, input, select, textarea, .ui-dialogue, .op-approach, .dp-tracker, .dp-bag, .of-stick, .of-tbtn'));
  const onMouseMove = (e) => { if (e.pointerType === 'touch') return; const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.seen = true; mouse.t = now(); };
  const onMouseDown = (e) => { if (e.pointerType === 'touch' || e.button !== 0 || onUi(e)) return; onMouseMove(e); mouse.down = true; };
  const onMouseUp = (e) => { if (e.pointerType === 'touch') return; mouse.down = false; };
  // A finger on the playfield (not on a stick or a button) aims there and fires while it stays down.
  const finger = { id: null, x: 0, y: 0 };
  const onTouchDown = (e) => { if (e.pointerType !== 'touch' || onUi(e) || finger.id != null) return; const r = canvas.getBoundingClientRect(); finger.id = e.pointerId; finger.x = e.clientX - r.left; finger.y = e.clientY - r.top; };
  const onTouchMove = (e) => { if (e.pointerId !== finger.id) return; const r = canvas.getBoundingClientRect(); finger.x = e.clientX - r.left; finger.y = e.clientY - r.top; };
  const onTouchUp = (e) => { if (e.pointerId === finger.id) finger.id = null; };
  if (canvas && mode === 'fight') {
    addEventListener('pointermove', onMouseMove);
    addEventListener('pointerdown', onMouseDown);
    addEventListener('pointerup', onMouseUp);
    canvas.addEventListener('pointerdown', onTouchDown);
    addEventListener('pointermove', onTouchMove);
    addEventListener('pointerup', onTouchUp);
    addEventListener('pointercancel', onTouchUp);
  }

  // ---- touch controls ----
  const pad = createEl('div', { class: 'of-touch', 'aria-hidden': 'true' });
  function stick(side) {
    const base = createEl('div', { class: `of-stick of-stick-${side}` }, createEl('div', { class: 'of-knob' }));
    const knob = base.firstChild;
    const state = { x: 0, y: 0, active: false, id: null };
    const R = 46;
    const set = (e) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      state.x = dx / R; state.y = dy / R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    base.addEventListener('pointerdown', (e) => { e.preventDefault(); state.active = true; state.id = e.pointerId; try { base.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already-lifted pointer */ } set(e); });
    base.addEventListener('pointermove', (e) => { if (state.active && e.pointerId === state.id) set(e); });
    const end = (e) => { if (e.pointerId !== state.id) return; state.active = false; state.x = state.y = 0; knob.style.transform = ''; };
    base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
    pad.append(base);
    return state;
  }
  function tapButton(label, action, cls) {
    const b = createEl('button', { type: 'button', class: `of-tbtn ${cls}`, text: label });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressed.add(action); b.classList.add('is-down'); });
    const up = () => b.classList.remove('is-down');
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    pad.append(b);
    return b;
  }
  let interactBtn = null;
  if (touch) {
    sticks.left = stick('left');
    if (mode === 'fight') { sticks.right = stick('right'); tapButton(labels.dash || 'Dash', 'dash', 'of-tbtn-dash'); }
    if (mode === 'walk') { interactBtn = tapButton(labels.interact || 'Use', 'interact', 'of-tbtn-use'); interactBtn.hidden = true; }
    if (mode === 'fly') { tapButton('Boost', 'boost', 'of-tbtn-dash'); interactBtn = tapButton('Scan', 'scan', 'of-tbtn-use'); interactBtn.hidden = true; }
    root.append(pad);
  }

  return {
    touch,
    /** Movement vector, length up to 1. */
    move() {
      if (sticks.left?.active) { const { x, y } = sticks.left; const m = Math.hypot(x, y); return m < 0.15 ? { x: 0, y: 0 } : { x, y }; }
      let x = 0, y = 0;
      for (const code of keys) {
        if (mode === 'fight' && AIM_KEYS[code]) continue; // arrows aim in fights
        const v = MOVE_KEYS[code]; if (v) { x += v[0]; y += v[1]; }
      }
      const m = Math.hypot(x, y);
      return m ? { x: x / m, y: y / m } : { x: 0, y: 0 };
    },
    /** Analog stick, raw (fly mode steers toward it). */
    stick: () => (sticks.left?.active ? { x: sticks.left.x, y: sticks.left.y } : null),
    /**
     * Aim angle from the player's screen point (fights), or null when not aiming. assist: { angle } of the nearest enemy, used by a fire key
     * when the pointer has gone quiet (see aim.js).
     */
    aim(px, py, assist = null) {
      let ax = 0, ay = 0, any = false;
      for (const code of keys) { const v = AIM_KEYS[code]; if (v) { ax += v[0]; ay += v[1]; any = true; } }
      return decideAim({
        stick: sticks.right?.active ? { x: sticks.right.x, y: sticks.right.y } : null,
        arrows: any ? { x: ax, y: ay } : null,
        touchAim: finger.id != null ? Math.atan2(finger.y - py, finger.x - px) : null,
        mouse: mouse.seen ? { seen: true, ageMs: mouse.down ? 0 : now() - mouse.t, angle: Math.atan2(mouse.y - py, mouse.x - px) } : null,
        fireKey: FIRE_KEYS.some((k) => keys.has(k)),
        assist,
      });
    },
    firing() {
      let arrows = false;
      for (const code of keys) if (AIM_KEYS[code]) arrows = true;
      return decideFire({ stick: sticks.right?.active ? { x: sticks.right.x, y: sticks.right.y } : null, arrows, touchHeld: finger.id != null, fireKey: FIRE_KEYS.some((k) => keys.has(k)), mouseDown: mouse.down });
    },
    /** Live stealth: how you move. Ctrl sneaks, Shift runs, otherwise walk; on a phone the stick's strength picks it (gentle sneaks, full runs). */
    gait(mv = null) {
      if (sticks.left?.active) { const m = Math.hypot(sticks.left.x, sticks.left.y); return m < 0.5 ? 'sneak' : m > 0.92 ? 'run' : 'walk'; }
      if (keys.has('ControlLeft') || keys.has('ControlRight')) return 'sneak';
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) return 'run';
      return 'walk';
    },
    held: (code) => keys.has(code),
    /** True once per press of an action button. */
    take(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    /** Shows or hides the touch interact button with a label (and an icon element maker, r3 basics). */
    prompt(label, iconId = null) {
      if (!interactBtn) return;
      interactBtn.hidden = !label;
      if (!label) return;
      if (interactBtn.dataset.label !== label) { interactBtn.dataset.label = label; interactBtn.textContent = label; }
      if (iconId) interactBtn.dataset.icon = iconId;
    },
    set enabled(v) { enabled = v; if (!v) { keys.clear(); pressed.clear(); mouse.down = false; } },
    destroy() {
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur);
      removeEventListener('pointermove', onMouseMove); removeEventListener('pointerdown', onMouseDown); removeEventListener('pointerup', onMouseUp);
      removeEventListener('pointermove', onTouchMove); removeEventListener('pointerup', onTouchUp); removeEventListener('pointercancel', onTouchUp);
      canvas?.removeEventListener('pointerdown', onTouchDown);
      pad.remove();
    },
  };
}
