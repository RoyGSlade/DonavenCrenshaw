// One input reader for walking, fighting and flying: keyboard (WASD or
// arrows), mouse aim and click, and touch thumbsticks on phones (left: move,
// right: aim and fire in fights). Buttons for interact and dash. No game rules.
//
//   const input = createInput(root, { mode: 'walk' | 'fight' | 'fly', canvas })
//   input.move() -> {x, y}   input.aim(px, py) -> angle | null (from the player's screen point)
//   input.firing()  input.take('interact' | 'dash' | 'boost')  input.destroy()
import { createEl } from './dom.js';

const MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const AIM_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export const isTouchDevice = () => (globalThis.matchMedia?.('(pointer: coarse)').matches ?? false) || (navigator.maxTouchPoints || 0) > 0;

export function createInput(root, { mode = 'walk', canvas = null, touch = isTouchDevice(), labels = {} } = {}) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  const sticks = { left: null, right: null };
  let enabled = true;

  const onKeyDown = (e) => {
    if (!enabled || e.target.closest?.('input, textarea, select')) return;
    const code = e.code;
    const used = MOVE_KEYS[code] || ['KeyE', 'Enter', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyF'].includes(code);
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

  const onMouseMove = (e) => { if (e.pointerType === 'touch') return; const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.seen = true; };
  const onMouseDown = (e) => { if (e.pointerType === 'touch' || e.button !== 0) return; onMouseMove(e); mouse.down = true; };
  const onMouseUp = (e) => { if (e.pointerType === 'touch') return; mouse.down = false; };
  if (canvas && mode === 'fight') {
    canvas.addEventListener('pointermove', onMouseMove);
    canvas.addEventListener('pointerdown', onMouseDown);
    addEventListener('pointerup', onMouseUp);
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
    /** Aim angle from the player's screen point (fights), or null when not aiming. */
    aim(px, py) {
      if (sticks.right?.active && Math.hypot(sticks.right.x, sticks.right.y) > 0.25) return Math.atan2(sticks.right.y, sticks.right.x);
      let ax = 0, ay = 0;
      for (const code of keys) { const v = AIM_KEYS[code]; if (v) { ax += v[0]; ay += v[1]; } }
      if (ax || ay) return Math.atan2(ay, ax);
      if (mouse.seen) return Math.atan2(mouse.y - py, mouse.x - px);
      return null;
    },
    firing() {
      if (sticks.right?.active) return Math.hypot(sticks.right.x, sticks.right.y) > 0.55;
      for (const code of keys) if (AIM_KEYS[code]) return true;
      return mouse.down || keys.has('KeyF');
    },
    held: (code) => keys.has(code),
    /** True once per press of an action button. */
    take(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    /** Shows or hides the touch interact button with a label. */
    prompt(label) { if (!interactBtn) return; interactBtn.hidden = !label; if (label) interactBtn.textContent = label; },
    set enabled(v) { enabled = v; if (!v) { keys.clear(); pressed.clear(); mouse.down = false; } },
    destroy() {
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur);
      if (canvas) { canvas.removeEventListener('pointermove', onMouseMove); canvas.removeEventListener('pointerdown', onMouseDown); }
      removeEventListener('pointerup', onMouseUp);
      pad.remove();
    },
  };
}
