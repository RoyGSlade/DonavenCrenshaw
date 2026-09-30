/** Pointer-driven 2D hangar turntable; independent of flight controls. */
import { state } from '../state.js';

let initialized = false;
export function initHangarShip() {
  const control = document.getElementById('hangar-ship');
  const hangar = document.getElementById('starmap-start');
  if (initialized || !control || !hangar) return;
  initialized = true;

  const initialAngle = -23;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let angle = initialAngle;
  let pointer = null;
  let lastX = 0, lastY = 0, lastMove = 0;
  let movement = 0;
  let velocity = 0;
  let frame = 0, lastFrame = 0;
  const reducedMotion = () => !!state.settings?.reducedMotion || motionPreference.matches;
  const available = () => !document.hidden && !hangar.hidden && !hangar.classList.contains('hidden') && !state.ui.showSettingsOverlay && !document.getElementById('ship-garage')?.open;
  const paint = () => control.style.setProperty('--ship-angle', `${angle.toFixed(2)}deg`);
  control.setAttribute('aria-label', 'Customize ship');
  const hint = document.getElementById('hangar-ship-hint');
  if (hint) hint.textContent = 'CLICK TO CUSTOMIZE · DRAG TO SPIN';

  function stopInertia() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; velocity = 0;
  }
  function cancelInteraction() {
    stopInertia();
    const captured = pointer;
    pointer = null;
    control.classList.remove('is-dragging');
    if (captured !== null && control.hasPointerCapture(captured)) control.releasePointerCapture(captured);
  }
  function coast(now) {
    frame = 0;
    if (!available() || reducedMotion() || Math.abs(velocity) < .005) { velocity = 0; return; }
    const dt = Math.min(32, Math.max(0, now - lastFrame));
    lastFrame = now;
    angle = (angle + velocity * dt) % 360;
    velocity *= Math.exp(-dt * .006);
    paint();
    frame = requestAnimationFrame(coast);
  }

  control.addEventListener('pointerdown', event => {
    if (!available() || pointer !== null || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    stopInertia();
    pointer = event.pointerId;
    movement = 0;
    lastX = event.clientX; lastY = event.clientY; lastMove = event.timeStamp;
    control.focus({ preventScroll: true });
    control.setPointerCapture(pointer);
    control.classList.add('is-dragging');
  });
  control.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); event.stopPropagation();
    movement += Math.hypot(event.clientX-lastX,event.clientY-lastY);
    const delta = (event.clientX - lastX) * .7 + (event.clientY - lastY) * .22;
    const dt = Math.max(8, event.timeStamp - lastMove);
    angle = (angle + delta) % 360;
    velocity = Math.max(-.65, Math.min(.65, velocity * .4 + delta / dt * .6));
    lastX = event.clientX; lastY = event.clientY; lastMove = event.timeStamp;
    paint();
  });
  control.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); event.stopPropagation();
    pointer = null;
    control.classList.remove('is-dragging');
    if (control.hasPointerCapture(event.pointerId)) control.releasePointerCapture(event.pointerId);
    if (movement < 6 && available()) { stopInertia(); window.dispatchEvent(new Event('stardust:open-garage')); return; }
    if (!available() || reducedMotion() || event.timeStamp - lastMove > 100) return stopInertia();
    lastFrame = performance.now();
    frame = requestAnimationFrame(coast);
  });
  control.addEventListener('pointercancel', cancelInteraction);
  control.addEventListener('lostpointercapture', () => { if (pointer !== null) cancelInteraction(); });
  control.addEventListener('dragstart', event => event.preventDefault());
  control.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    cancelInteraction();
    angle = event.key === 'Home' ? initialAngle : (angle + (['ArrowLeft','ArrowDown'].includes(event.key) ? -15 : 15)) % 360;
    paint();
  });
  // Native button activation gives Enter/Space and assistive technology garage access.
  control.addEventListener('click', event => {
    event.stopPropagation();
    if (event.detail !== 0 || !available()) return;
    cancelInteraction(); window.dispatchEvent(new Event('stardust:open-garage'));
  });
  control.addEventListener('blur', cancelInteraction);
  window.addEventListener('blur', cancelInteraction);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInteraction(); });
  motionPreference.addEventListener('change', () => { if (reducedMotion()) stopInertia(); });
  const visibility = new MutationObserver(() => { if (!available()) cancelInteraction(); if (reducedMotion()) stopInertia(); });
  visibility.observe(hangar, { attributes: true, attributeFilter: ['class', 'hidden'] });
  visibility.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  paint();
}
