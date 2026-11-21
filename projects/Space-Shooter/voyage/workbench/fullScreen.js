// The shared full-screen game overlay for workbench stations (house rule: a game owns the whole screen on desktop and phone;
// the side sheet is for menus and panels only). The trainer's gallery and Perihelion each built the same shape by hand:
// a fixed layer over everything, a dark backdrop, a top bar with the station word and a Leave button, the game below.
// This is that shape once. DOM only; no rules.
//
//   const fs = openFullScreen({ word: 'CUT · STEADY ROLL', title: 'Cut a plate', note: 'Steady roll: ...', onLeave });
//   playSomething(fs.stage, ...);          // the game mounts in fs.stage (a flex column that fills the screen)
//   fs.close();                            // remove the overlay
// Games should size to the stage: `.wb-full .wb-fstage` is flex:1 with min-height:0, so a canvas with max-width/max-height 100%
// fits whatever the screen is. The Leave button calls onLeave (the controller resolves the game with null).
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};

// The overlay's stylesheet travels with it: loaded once, wherever the helper is used (the workbench room or a scene's mini-game).
function ensureStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[data-wb-fullscreen]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./fullScreen.css', import.meta.url).href;
  link.dataset.wbFullscreen = '';
  document.head.append(link);
}

export function openFullScreen({ word = '', title = '', note = '', onLeave = () => {}, bare = false, noLeave = false } = {}) {
  ensureStyles();
  // A new game starts on a clean screen: the last game's toast ("You left the game") must not sit on top of it.
  document.dispatchEvent(new CustomEvent('wb-fullscreen', { detail: { open: true } }));
  const leave = h('button', { type: 'button', class: 'wb-leave wb-fleave ui-btn', text: 'Leave this game' });
  leave.addEventListener('click', () => onLeave());
  if (noLeave) leave.hidden = true; // a scene's mini-game ends on its own result card; a scene must never be left half-played
  const top = h('div', { class: 'wb-ftop' }, h('div', { class: 'wb-fhead' }, h('p', { class: 'wb-feyebrow', text: word }), h('h2', { class: 'wb-ftitle', text: title })), leave);
  const noteEl = note ? h('p', { class: 'rp-help wb-preview wb-fnote', text: note }) : null;
  const stage = h('div', { class: 'wb-stage wb-fstage' });
  // `bare`: for games that already draw their own top bar and Leave (Perihelion, the shooting gallery): the helper still owns the
  // screen (backdrop, layer, body class) but adds no bar of its own.
  const root = h('section', { class: bare ? 'wb-full wb-full-bare' : 'wb-full', role: 'dialog', 'aria-label': title || 'Game' }, ...(bare ? [] : [top, noteEl]), stage);
  document.body.append(root);
  document.body.classList.add('wb-full-open');
  return {
    root, stage, leave, bare,
    close() { root.remove(); document.body.classList.remove('wb-full-open'); },
  };
}
