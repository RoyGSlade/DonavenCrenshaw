// Touch flight controls: a joystick (up thrust, down reverse, sides strafe),
// a self-centering steering wheel, and Brake / Boost. Every control tracks its
// own pointer, so both thumbs work at once, and a thumb that slides off the
// joystick keeps driving it until it lifts. input.js reads touchInput each frame.
import { artImage } from './uiArt.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

export const TOUCH_TUNING = Object.freeze({
  STICK_DEAD: 0.12,       // joystick dead zone (fraction of its radius)
  REVERSE_MAX: 0.6,       // full pull-down = keyboard reverse strength
  STRAFE_MAX: 0.6,        // full side push = keyboard strafe strength
  WHEEL_FULL_DEG: 90,     // wheel rotation for a full-lock turn
  WHEEL_MAX_DEG: 135,     // how far the wheel can be turned
  WHEEL_DEAD_DEG: 4,
  WHEEL_SPRING: 14,       // return-to-centre spring (1/s), critically damped
});

/** Joystick vector (-1..1, y down) to drive strengths. Pure, for tests. */
export function stickToDrive(x, y) {
  const m = Math.hypot(x, y);
  if (m <= TOUCH_TUNING.STICK_DEAD) return { thrust: 0, back: 0, strafe: 0 };
  const k = Math.min(1, (m - TOUCH_TUNING.STICK_DEAD) / (1 - TOUCH_TUNING.STICK_DEAD)) / m;
  const ux = x * k, uy = y * k;
  return {
    thrust: clamp(-uy, 0, 1),
    back: clamp(uy, 0, 1) * TOUCH_TUNING.REVERSE_MAX,
    strafe: clamp(ux, -1, 1) * TOUCH_TUNING.STRAFE_MAX,
  };
}

/** Wheel rotation (degrees, clockwise +) to a turn strength -1..1. Pure, for tests. */
export function wheelToTurn(deg) {
  const a = Math.abs(deg);
  if (a <= TOUCH_TUNING.WHEEL_DEAD_DEG) return 0;
  return Math.sign(deg) * Math.min(1, (a - TOUCH_TUNING.WHEEL_DEAD_DEG) / (TOUCH_TUNING.WHEEL_FULL_DEG - TOUCH_TUNING.WHEEL_DEAD_DEG));
}

export const touchInput = {
  thrust: 0, back: 0, strafe: 0, turn: 0,
  brake: false, boost: false, launchEdge: false,
  active: false,          // any touch control is being held
  wheelHidden: false,     // tilt steering replaces the wheel
};

let els = null;
let wheel = { angle: 0, velocity: 0, pointer: null, grabAngle: 0, grabWheel: 0 };
let stick = { pointer: null };
let canDrive = () => true;
let launchPending = () => false;

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: Math.min(r.width, r.height) / 2 };
}

function makeStick() {
  const el = document.createElement('div');
  el.className = 'fx-widget fx-stick';
  el.dataset.widget = 'stick';
  el.setAttribute('aria-label', 'Thrust joystick: up thrust, down reverse, sideways strafe');
  el.innerHTML = '<div class="fx-stick-base"><span class="fx-stick-mark fx-up"></span><span class="fx-stick-mark fx-down"></span><span class="fx-stick-mark fx-left"></span><span class="fx-stick-mark fx-right"></span></div><div class="fx-stick-knob"></div>';
  artImage('joystick-base', el.querySelector('.fx-stick-base'));
  artImage('joystick-knob', el.querySelector('.fx-stick-knob'));
  const knob = el.querySelector('.fx-stick-knob');
  const move = (event) => {
    if (event.pointerId !== stick.pointer) return;
    const c = center(el);
    let x = (event.clientX - c.x) / (c.radius * 0.72), y = (event.clientY - c.y) / (c.radius * 0.72);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    knob.style.transform = `translate(${x * c.radius * 0.72}px, ${y * c.radius * 0.72}px)`;
    Object.assign(touchInput, stickToDrive(x, y));
  };
  const release = (event) => {
    if (event.pointerId !== stick.pointer) return;
    stick.pointer = null;
    knob.style.transform = '';
    Object.assign(touchInput, { thrust: 0, back: 0, strafe: 0 });
    el.classList.remove('is-held');
  };
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!canDrive() || stick.pointer !== null) return;
    stick.pointer = event.pointerId;
    el.setPointerCapture?.(event.pointerId);
    el.classList.add('is-held');
    move(event);
  });
  el.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, release);
  return el;
}

function makeWheel() {
  const el = document.createElement('div');
  el.className = 'fx-widget fx-wheel';
  el.dataset.widget = 'wheel';
  el.setAttribute('aria-label', 'Steering wheel: rotate to turn');
  el.innerHTML = '<div class="fx-wheel-rim"><span class="fx-wheel-grip fx-gl"></span><span class="fx-wheel-grip fx-gr"></span><span class="fx-wheel-mark"></span><span class="fx-wheel-hub"></span></div>';
  const rim = el.querySelector('.fx-wheel-rim');
  artImage('steering-wheel', rim);
  const pointerAngle = (event) => {
    const c = center(el);
    return Math.atan2(event.clientY - c.y, event.clientX - c.x);
  };
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!canDrive() || wheel.pointer !== null) return;
    wheel.pointer = event.pointerId;
    wheel.grabAngle = pointerAngle(event);
    wheel.grabWheel = wheel.angle;
    wheel.velocity = 0;
    el.setPointerCapture?.(event.pointerId);
    el.classList.add('is-held');
  });
  el.addEventListener('pointermove', (event) => {
    if (event.pointerId !== wheel.pointer) return;
    const deg = wheel.grabWheel + (wrap(pointerAngle(event) - wheel.grabAngle) * 180) / Math.PI;
    wheel.angle = clamp(deg, -TOUCH_TUNING.WHEEL_MAX_DEG, TOUCH_TUNING.WHEEL_MAX_DEG);
  });
  const release = (event) => {
    if (event.pointerId !== wheel.pointer) return;
    wheel.pointer = null;
    el.classList.remove('is-held');
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, release);
  return el;
}

function makeButton(action, label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `fx-widget fx-btn fx-${action}`;
  el.dataset.widget = action;
  el.setAttribute('aria-label', label);
  el.innerHTML = `<span class="fx-btn-icon"></span><span class="fx-btn-label">${label}</span><span class="fx-btn-ring"></span>`;
  artImage(`btn-${action}`, el);
  artImage('btn-pressed-ring', el.querySelector('.fx-btn-ring'));
  let pointer = null;
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!canDrive() || pointer !== null) return;
    pointer = event.pointerId;
    el.setPointerCapture?.(event.pointerId);
    el.classList.add('is-held');
    // Boost on the start line launches; a fresh press boosts once airborne.
    if (action === 'boost' && launchPending()) { touchInput.launchEdge = true; return; }
    touchInput[action] = true;
  });
  const release = (event) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    touchInput[action] = false;
    el.classList.remove('is-held');
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, release);
  return el;
}

/** Build the controls into the flight UI layer. */
export function initTouchPad(root, { driveAllowed, onStartLine }) {
  canDrive = driveAllowed;
  launchPending = onStartLine;
  els = { stick: makeStick(), wheel: makeWheel(), brake: makeButton('brake', 'BRAKE'), boost: makeButton('boost', 'BOOST') };
  for (const el of Object.values(els)) {
    el.classList.add('fx-touch');
    root.append(el);
  }
  return els;
}

/** Per frame: the wheel springs back when released; publish its turn. */
export function updateTouchPad(dt) {
  if (!els) return;
  if (wheel.pointer === null && (Math.abs(wheel.angle) > 0.01 || Math.abs(wheel.velocity) > 0.01)) {
    const w = TOUCH_TUNING.WHEEL_SPRING;
    for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 240) {
      const h = Math.min(1 / 240, left);
      wheel.velocity += (-w * w * wheel.angle - 2 * w * wheel.velocity) * h;
      wheel.angle += wheel.velocity * h;
    }
    if (Math.abs(wheel.angle) < 0.05 && Math.abs(wheel.velocity) < 0.5) { wheel.angle = 0; wheel.velocity = 0; }
  }
  const rim = els.wheel.firstElementChild;
  rim.style.transform = `rotate(${wheel.angle}deg)`;
  touchInput.turn = touchInput.wheelHidden ? 0 : wheelToTurn(wheel.angle);
  touchInput.active = stick.pointer !== null || wheel.pointer !== null || touchInput.brake || touchInput.boost;
}

export function setWheelHidden(hidden) {
  touchInput.wheelHidden = !!hidden;
  els?.wheel.classList.toggle('is-off', !!hidden);
}

/** Drop every held control (pause, blur, overlays). */
export function releaseTouchPad() {
  stick.pointer = null;
  wheel.pointer = null;
  Object.assign(touchInput, { thrust: 0, back: 0, strafe: 0, brake: false, boost: false, launchEdge: false, active: false });
  if (els) {
    els.stick.querySelector('.fx-stick-knob').style.transform = '';
    for (const el of Object.values(els)) el.classList.remove('is-held');
  }
}
