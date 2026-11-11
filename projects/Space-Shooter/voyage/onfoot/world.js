// The on-foot world: one canvas where you walk around a map (hangar, ship,
// buildings, outposts), talk to people, use stations, go through doors, and
// fight (free aim) when a fight starts. Rules live in ./rules/*; this file
// runs the loop, draws, and hands interactions to the page's hooks.
//
//   const world = createWorld({ root, mapId: 'hangar', hooks, emit })
//   hooks.interact(target, world)  -> may return a promise; walking pauses until it settles
//       target.kind: npc | station | mine | puzzle | range | repair | console | ship
//   hooks.locked(door, world)      -> a locked door was tried (door.locked names what opens it)
//   hooks.entered(map, world)      -> after every map change
//   world.go(mapId, spawn) · world.fight(setup) -> Promise<{ outcome, hp }> · world.unlock(id)
//   world.setNpcVisible(id, on) · world.follow(id, on) · world.pause() / resume() · world.destroy()
import { getMap } from '../maps/index.js';
import { createWalker, stepWalker, nearestInteract, stepNpc, WALK } from './rules/walk.js';
import { createFight, stepFight, STEP, ENEMY_TYPES } from './rules/shooter.js';
import { buildStaticLayer, buildVignette, drawBody, drawContained, castSprite, castLook } from './draw.js';
import { sprite, playerFrames, preload, onArtLoaded } from './assets.js';
import { fitCanvas, viewZoom, cameraFor } from './viewport.js';
import { createInput } from './input.js';
import { createEl } from './dom.js';
import { TUTORIAL_EVENTS } from './events.js';
import { createSfx } from './sfx.js';

const VERBS = { npc: 'Talk to', station: 'Use', mine: 'Drill', puzzle: 'Fix', hack: 'Hack', range: 'Practice', repair: 'Repair', console: 'Look at', ship: 'Fly', door: 'Go to' };

export function createWorld({ root, mapId = 'hangar', spawn = 'default', hooks = {}, emit = () => {}, shipArt = null, reducedMotion = () => false, unlocked = [], sound = createSfx() }) {
  const el = createEl('div', { class: 'of-world' });
  const canvas = createEl('canvas', { class: 'of-canvas', 'aria-label': 'On foot. Move with WASD or the arrow keys, E to use.' });
  const prompt = createEl('div', { class: 'of-prompt', role: 'status', 'aria-live': 'polite' });
  const placeName = createEl('div', { class: 'of-place', 'aria-live': 'polite' });
  const hud = createEl('div', { class: 'of-hud' });
  const fade = createEl('div', { class: 'of-fade' });
  const objectiveLine = createEl('p', { class: 'of-objective', role: 'status', 'aria-live': 'polite', hidden: true });
  const fightHelp = createEl('p', { class: 'of-hud-help' });
  el.append(canvas, hud, fightHelp, objectiveLine, prompt, placeName, fade);
  el.__world = null; // set to the api below (tests and the dev console reach the world through the element)
  root.append(el);
  const ctx = canvas.getContext('2d');

  let map = null, walker = null, npcs = [], layer = null, layerScale = 0, layerDirty = true;
  let vignette = null, view = { w: 1, h: 1, dpr: 1 };
  let mode = 'walk', busy = false, paused = false, t = 0, raf = 0, last = 0, acc = 0;
  let input = createInput(el, { mode: 'walk', canvas });
  let target = null, arrivedAt = 0, walkedSent = false;
  let camera = null, shake = 0, hitstop = 0, stepDist = 0, objective = null;
  let inRings = new Set();
  const dust = [];
  let fight = null, fightDone = null, fx = [];
  const hidden = new Set();
  const following = new Set();
  const opened = new Set(unlocked);

  const offArt = onArtLoaded(() => { layerDirty = true; });

  function setMap(id, spawnName = 'default') {
    map = getMap(id);
    preload(map);
    const s = map.spawns[spawnName] || map.spawns.default;
    const keep = walker;
    walker = createWalker(s);
    if (keep) walker.walked = keep.walked;
    npcs = map.npcs.map(n => ({ ...n, home: { ...n.home }, vx: 0, vy: 0, moving: false }));
    // Followers (Ralph) come along through doors.
    for (const id2 of following) if (!npcs.some(n => n.id === id2)) npcs.push({ id: id2, x: s.x + 30, y: s.y + 20, home: { x: s.x, y: s.y }, angle: s.angle, follow: true, wander: 0, moving: false });
    layerDirty = true;
    arrivedAt = t;
    camera = null;
    inRings = new Set();
    placeName.textContent = map.name;
    placeName.classList.remove('show'); void placeName.offsetWidth; placeName.classList.add('show');
    el.dataset.map = map.id;
    hooks.entered?.(map, api);
    emit(TUTORIAL_EVENTS.entered, { map: map.id });
  }

  function go(id, spawnName) {
    sound('door');
    if (reducedMotion()) { setMap(id, spawnName); return; }
    fade.classList.add('on');
    setTimeout(() => { setMap(id, spawnName); fade.classList.remove('on'); }, 180);
  }

  // The ship on the hangar pad is the player's own ship picture (core's tier art).
  function extraArt(c, p) {
    if (p.art !== 'player-ship') return false;
    const img = shipArt?.();
    if (!img) return false;
    // Tier art faces up with margin; draw it big inside the pad box.
    drawContained(c, img, { ...p, x: p.x - p.w * 0.1, y: p.y - p.h * 0.25, w: p.w * 1.2, h: p.h * 1.5, cx: p.cx, cy: p.cy });
    return true;
  }

  function ensureLayer(zoom) {
    const want = Math.min(2, zoom * view.dpr);
    if (!layerDirty && layer && Math.abs(layerScale - want) < 0.05) return;
    layer = buildStaticLayer(map, want, { extraArt, isLocked: doorLocked });
    layerScale = want;
    layerDirty = false;
  }
  const findDoorDef = d => map.def.doors?.find(x => x.id === d.id);
  // A door's gate: null when open, else { reason, hack?: level, key } (puzzle locks here; skill and hack gates from the page).
  const doorGate = d => {
    const def = findDoorDef(d) || {};
    if (def.locked && !opened.has(def.locked)) return { reason: 'Locked', key: def.locked };
    const g = hooks.gate?.(def, map) || null;
    if (g?.hack && opened.has(`hack:${map.id}:${d.id}`)) return null;
    return g;
  };
  const doorLocked = d => Boolean(doorGate(d));

  function resize() {
    view = fitCanvas(canvas);
    vignette = buildVignette(view.w, view.h, view.dpr);
    layerDirty = true;
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  // ---- walking ----
  function stepWalk(dt) {
    const mv = (busy || paused) ? { x: 0, y: 0 } : input.move();
    stepWalker(walker, mv, map, dt);
    if (!walkedSent && walker.walked > map.tile * 3) { walkedSent = true; emit(TUTORIAL_EVENTS.moved, {}); }
    // Footsteps: a soft tick and a puff of dust on exteriors.
    if (walker.moving) {
      stepDist += Math.hypot(walker.vx, walker.vy) * dt;
      if (stepDist > 38) { stepDist = 0; sound('step'); if (map.kind === 'exterior' && !reducedMotion()) dust.push({ x: walker.x - Math.cos(walker.angle) * 10, y: walker.y - Math.sin(walker.angle) * 10, life: 0.5 }); }
    }
    checkRings();
    for (const n of npcs) {
      if (hidden.has(n.id)) continue;
      stepNpc(n, t, dt, map, following.has(n.id) ? walker : null);
    }
    // Npc interact points follow the npc.
    const extra = npcs.filter(n => !hidden.has(n.id)).map(n => ({ kind: 'npc', id: n.id, label: castLook(n.id).name, x: n.x, y: n.y, reach: map.tile * 1.3 }));
    const base = { ...map, interacts: map.interacts.filter(i => i.kind !== 'npc') };
    target = busy ? null : nearestInteract(walker, base, extra);
    showPrompt(target);
    if (busy || paused) return;
    // Doors: walk into one (after a moment in a new room) or press Use.
    const useIt = input.take('interact');
    for (const d of map.doors) {
      const inside = walker.x > d.x - 14 && walker.x < d.x + d.w + 14 && walker.y > d.y - 14 && walker.y < d.y + d.h + 14;
      if (inside && t - arrivedAt > 0.5 && !doorLocked(d)) { go(d.to, d.arrive || 'default'); return; }
    }
    if (useIt && target) use(target);
  }

  // Station talk rings: tutorial:arrived { station } on the way in.
  function checkRings() {
    const now = new Set();
    for (const r of map.rings) {
      const inside = r.rect ? (walker.x >= r.rect.x && walker.x <= r.rect.x + r.rect.w && walker.y >= r.rect.y && walker.y <= r.rect.y + r.rect.h) : Math.hypot(walker.x - r.x, walker.y - r.y) <= r.r;
      if (inside) now.add(r.station);
    }
    for (const n of npcs) if (n.station && !hidden.has(n.id) && Math.hypot(walker.x - n.x, walker.y - n.y) <= map.tile * 1.6) now.add(n.station);
    for (const st of now) if (!inRings.has(st)) emit(TUTORIAL_EVENTS.arrived, { station: st });
    inRings = now;
  }

  function use(it) {
    if (it.kind === 'door') {
      const d = map.doors.find(x => x.id === it.id);
      const gate = doorGate(d);
      if (gate?.hack) {
        const key = `hack:${map.id}:${d.id}`;
        const r = hooks.interact?.({ kind: 'hack', id: key, level: gate.hack, label: d.label, door: true }, api);
        if (r?.then) { busy = true; input.enabled = false; r.then(res => { if (res?.success) { opened.add(key); layerDirty = true; } }).finally(() => { busy = false; input.enabled = true; }); }
        return;
      }
      if (gate) { hooks.locked?.({ ...d, gate }, api); return; }
      go(it.to, it.arrive);
      return;
    }
    const result = hooks.interact?.(it, api);
    if (result && typeof result.then === 'function') {
      busy = true;
      walker.vx = walker.vy = 0;
      input.enabled = false;
      result.catch(error => console.warn('Stardust: an interaction failed', error)).finally(() => { busy = false; input.enabled = true; });
    }
  }

  function showPrompt(it) {
    if (!it) { prompt.hidden = true; input.prompt(null); return; }
    const d = it.kind === 'door' ? map.doors.find(x => x.id === it.id) : null;
    const gate = d ? doorGate(d) : hooks.gate?.(it, map) || null;
    const label = it.kind === 'npc' ? `${VERBS.npc} ${it.label || castLook(it.id).name}` : gate ? `${it.label}: ${gate.hack ? `locked (hack, level ${gate.hack})` : gate.reason}` : it.label || `${VERBS[it.kind]} ${it.id}`;
    const key = input.touch ? '' : 'E  ';
    const text = `${key}${label}`;
    if (prompt.textContent !== text) prompt.textContent = text;
    prompt.hidden = false;
    prompt.dataset.kind = it.kind;
    input.prompt(it.kind === 'npc' ? 'Talk' : gate?.hack ? 'Hack' : gate ? 'Locked' : it.kind === 'door' ? 'Go' : 'Use');
  }

  // ---- fighting ----
  function startFight(setup) {
    if (fight) return Promise.reject(new Error('A fight is already on.'));
    if (setup.map && setup.map !== map.id) setMap(setup.map, setup.spawn || 'default');
    input.destroy();
    input = createInput(el, { mode: 'fight', canvas });
    mode = 'fight';
    prompt.hidden = true;
    el.classList.add('is-fight');
    fight = createFight({ map, spawn: setup.spawn || { x: walker.x, y: walker.y, angle: walker.angle }, enemies: setup.enemies || [], player: setup.player || {}, seed: setup.seed || 1, exit: setup.exit || null });
    fx = [];
    renderHud();
    return new Promise(resolve => { fightDone = resolve; });
  }

  function endFight() {
    const result = { ...fight.ended, shots: fight.player.shots, hits: fight.player.hits, kills: fight.kills };
    walker.x = fight.player.x; walker.y = fight.player.y; walker.angle = fight.player.angle;
    fight = null;
    mode = 'walk';
    el.classList.remove('is-fight');
    hud.replaceChildren();
    fightHelp.textContent = '';
    input.destroy();
    input = createInput(el, { mode: 'walk', canvas });
    const done = fightDone; fightDone = null;
    done?.(result);
  }

  let dashWanted = false;
  function stepFightMode(dt, cam) {
    if (input.take('dash')) dashWanted = true;
    const px = (fight.player.x - cam.x) * cam.zoom, py = (fight.player.y - cam.y) * cam.zoom;
    const aim = input.aim(px, py);
    stepFight(fight, { move: input.move(), aim, fire: input.firing(), dash: dashWanted }, dt);
    dashWanted = false;
    for (const e of fight.events) {
      if (e.type === 'shot') { fx.push({ kind: 'flash', x: e.x, y: e.y, a: e.angle, life: 0.06, owner: e.owner }); if (e.owner === 'player') sound('shot'); }
      else if (e.type === 'hit' || e.type === 'spark') {
        fx.push({ kind: 'spark', x: e.x, y: e.y, life: 0.25, enemy: e.target === 'enemy', player: e.target === 'player' });
        if (e.amount) fx.push({ kind: 'num', x: e.x + (Math.random() - 0.5) * 10, y: e.y - 14, text: String(Math.round(e.amount)), player: e.target === 'player', life: 0.7 });
        if (e.target === 'player') { shake = Math.max(shake, 0.25); sound('hurt'); } else if (e.target === 'enemy') { shake = Math.max(shake, 0.06); sound('hit'); }
      }
      else if (e.type === 'kill') { fx.push({ kind: 'boom', x: e.x, y: e.y, life: 0.45 }); shake = Math.max(shake, 0.18); hitstop = 0.05; sound('kill'); }
      else if (e.type === 'dash') { fx.push({ kind: 'ghost', x: e.x, y: e.y, a: fight.player.angle, life: 0.25 }); sound('dash'); }
      else if (e.type === 'guard') { fx.push({ kind: 'num', x: e.x, y: e.y - 20, text: 'GUARD', life: 0.9, guard: true }); sound('guard'); }
    }
    fight.events.length = 0;
    if (fx.length > 80) fx.splice(0, fx.length - 80);
    if (fight.ended) { renderHud(); setTimeout(endFight, 700); fight.ended = { ...fight.ended }; mode = 'fight-over'; }
  }

  function renderHud() {
    if (!fight) return;
    const p = fight.player;
    const left = fight.enemies.filter(e => e.alive).length;
    const bar = createEl('div', { class: 'of-hp' }, createEl('span', { style: `width:${Math.round((p.hp / p.maxHp) * 100)}%` }));
    const text = fight.ended
      ? (fight.ended.outcome === 'win' ? 'Area clear.' : fight.ended.outcome === 'lose' ? 'You go down.' : 'You got out.')
      : `${left} hostile${left === 1 ? '' : 's'} left`;
    hud.replaceChildren(createEl('div', { class: 'of-hud-row' }, createEl('b', { text: `HP ${Math.ceil(p.hp)}` }), bar, createEl('span', { class: 'of-hud-note', text })));
    fightHelp.textContent = fight.ended ? '' : input.touch ? 'Left stick: move. Right stick: aim and fire. Dash dodges.' : 'WASD move · mouse or arrows aim and fire · Space dashes';
  }

  // ---- drawing ----
  let lastCam = null;
  function draw(cam) {
    lastCam = cam;
    const { dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ensureLayer(cam.zoom);
    // The static layer, cropped to the view.
    const s = layer.scale;
    const sx = Math.max(0, cam.x * s), sy = Math.max(0, cam.y * s);
    const dx = Math.max(0, -cam.x) * cam.zoom * dpr, dy = Math.max(0, -cam.y) * cam.zoom * dpr;
    const sw = Math.min(layer.canvas.width - sx, cam.vw * s), sh = Math.min(layer.canvas.height - sy, cam.vh * s);
    if (sw > 0 && sh > 0) ctx.drawImage(layer.canvas, sx, sy, sw, sh, dx, dy, (sw / s) * cam.zoom * dpr, (sh / s) * cam.zoom * dpr);
    ctx.setTransform(cam.zoom * dpr, 0, 0, cam.zoom * dpr, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
    // Interact highlight.
    if (target && mode === 'walk') {
      ctx.strokeStyle = '#81e6df'; ctx.globalAlpha = 0.45 + Math.sin(t * 5) * 0.2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(target.x, target.y, target.kind === 'npc' ? 26 : Math.min(40, target.reach * 0.55), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (objective && mode === 'walk') drawObjective();
    const bodies = [];
    if (mode === 'walk') {
      for (const n of npcs) if (!hidden.has(n.id)) bodies.push({ y: n.y, draw: () => drawNpc(n) });
      bodies.push({ y: walker.y, draw: () => drawPlayer(walker.x, walker.y, walker.angle, walker.moving, walker.stride, 0) });
    } else {
      for (const e of fight.enemies) if (e.alive) bodies.push({ y: e.y, draw: () => drawEnemy(e) });
      const p = fight.player;
      bodies.push({ y: p.y, draw: () => drawPlayer(p.x, p.y, p.angle, Math.hypot(p.vx, p.vy) > 20, (t * 3) % 4, p.hit, p.iframes > 0) });
    }
    bodies.sort((a, b) => a.y - b.y);
    for (const b of bodies) b.draw();
    if (fight) drawFightFx();
    for (const d of dust) { ctx.fillStyle = `rgba(160,170,180,${d.life * 0.5})`; ctx.beginPath(); ctx.arc(d.x, d.y, 4 + (0.5 - d.life) * 14, 0, Math.PI * 2); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (vignette) ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
    drawObjectiveEdge(cam);
    if (fight?.player.hit > 0) { ctx.fillStyle = `rgba(255,80,60,${fight.player.hit})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // Prompt follows its target on screen.
    if (target && mode === 'walk' && !prompt.hidden) {
      const x = (target.x - cam.x) * cam.zoom, y = (target.y - cam.y) * cam.zoom;
      prompt.style.transform = `translate(${Math.round(Math.max(70, Math.min(view.w - 70, x)))}px, ${Math.round(Math.max(30, y - 44))}px) translate(-50%, -100%)`;
    }
  }

  // Where the objective's station is in this map: a ring, a prop, a door, a zone or an npc.
  function objectivePoint() {
    if (!objective?.station) return null;
    const n = npcs.find(x => x.station === objective.station && !hidden.has(x.id) && x.id === objective.npc);
    if (n) return { x: n.x, y: n.y };
    // The person who runs the station first (Chibby for the pad), then the station's own ring.
    const n2 = npcs.find(x => x.station === objective.station && !hidden.has(x.id));
    if (n2) return { x: n2.x, y: n2.y };
    const r = map.rings.find(x => x.station === objective.station);
    return r ? (r.rect ? { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 } : { x: r.x, y: r.y }) : null;
  }

  function drawObjective() {
    const p = objectivePoint();
    if (!p) return;
    const bob = reducedMotion() ? 0 : Math.sin(t * 3) * 4;
    ctx.save();
    ctx.translate(p.x, p.y - 40 + bob);
    ctx.fillStyle = '#f4d35e';
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#f4d35e66'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 + (reducedMotion() ? 0 : (t * 20) % 14), 0, Math.PI * 2); ctx.stroke();
  }

  function drawObjectiveEdge(cam) {
    const p = objective && mode === 'walk' ? objectivePoint() : null;
    if (!p) return;
    const x = (p.x - cam.x) * cam.zoom, y = (p.y - cam.y) * cam.zoom;
    if (x > 24 && y > 24 && x < view.w - 24 && y < view.h - 24) return;
    const a = Math.atan2(y - view.h / 2, x - view.w / 2);
    const r = Math.min(view.w, view.h) / 2 - 30;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.translate(view.w / 2 + Math.cos(a) * r, view.h / 2 + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = '#f4d35e'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawPlayer(x, y, angle, moving, stride, hit, ghost = false) {
    const frames = playerFrames();
    const img = moving ? frames[Math.floor(stride) % 4] || frames[0] : frames[0];
    if (ghost) ctx.globalAlpha = 0.6;
    drawBody(ctx, x, y, angle, img, { size: 52, t, moving, stride, hit, tint: '#81e6df' });
    ctx.globalAlpha = 1;
    if (fight && !fight.ended) {
      // A short laser sight: where you're aiming.
      ctx.strokeStyle = '#81e6df55'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 22, y + Math.sin(angle) * 22); ctx.lineTo(x + Math.cos(angle) * 120, y + Math.sin(angle) * 120); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawNpc(n) {
    const look = castLook(n.id);
    const img = castSprite(n.id) || (look.dog ? null : sprite('npc-stand-in'));
    const near = target?.kind === 'npc' && target.id === n.id;
    drawBody(ctx, n.x, n.y, n.angle, img, { size: 46 * look.scale, t: t + n.x * 0.01, moving: n.moving, stride: (t * 3) % 4, tint: look.color, label: near || !castSprite(n.id) ? look.name : null, dog: look.dog });
    if (img && !castSprite(n.id)) {
      // Stand-in sprite: a coloured ring says who it is until the cast lane's sprite lands.
      ctx.strokeStyle = look.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, 23 * look.scale, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawEnemy(e) {
    const img = sprite(e.kind.art);
    const size = e.kind.radius * 3.1;
    drawBody(ctx, e.x, e.y, e.angle, img, { size, t: t + e.id, moving: e.kind.speed > 0, stride: (t * 2.5 + e.id) % 4, hit: e.hit, tint: '#ffad72' });
    if (e.hp < e.maxHp) {
      ctx.fillStyle = '#070d17cc'; ctx.fillRect(e.x - 16, e.y - size * 0.6 - 6, 32, 4);
      ctx.fillStyle = '#ffad72'; ctx.fillRect(e.x - 16, e.y - size * 0.6 - 6, 32 * (e.hp / e.maxHp), 4);
    }
    if (e.burst > 0 && e.burstT > 0.05) { ctx.fillStyle = '#ffad72'; ctx.beginPath(); ctx.arc(e.x + Math.cos(e.angle) * e.kind.radius * 1.4, e.y + Math.sin(e.angle) * e.kind.radius * 1.4, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawFightFx() {
    // Bullets: one path per side keeps the draw calls down.
    for (const side of ['player', 'enemy']) {
      ctx.strokeStyle = side === 'player' ? '#cff8f4' : '#ffb27a';
      ctx.lineWidth = side === 'player' ? 3 : 3.5;
      ctx.beginPath();
      for (const b of fight.bullets) if (b.owner === side) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); }
      ctx.stroke();
    }
    for (const f of fx) {
      if (f.kind === 'flash') { ctx.fillStyle = f.owner === 'player' ? '#eafffd' : '#ffd2a8'; ctx.globalAlpha = f.life / 0.06; ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'spark') { ctx.strokeStyle = f.player ? '#ff6b5a' : f.enemy ? '#ffad72' : '#cfe8f0'; ctx.globalAlpha = f.life / 0.25; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * 1.7 + f.x; const r = (1 - f.life / 0.25) * 14 + 3; ctx.moveTo(f.x + Math.cos(a) * r * 0.4, f.y + Math.sin(a) * r * 0.4); ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); } ctx.stroke(); }
      else if (f.kind === 'boom') { ctx.fillStyle = '#ffad72'; ctx.globalAlpha = (f.life / 0.45) * 0.6; ctx.beginPath(); ctx.arc(f.x, f.y, (1 - f.life / 0.45) * 34 + 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffe3cf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, (1 - f.life / 0.45) * 48 + 4, 0, Math.PI * 2); ctx.stroke(); }
      else if (f.kind === 'num') { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.guard ? '#9fe870' : f.player ? '#ff6b5a' : '#ffe3cf'; ctx.font = `700 ${f.guard ? 12 : 13}px Consolas, monospace`; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y - (0.7 - f.life) * 30); }
      else if (f.kind === 'ghost') { ctx.globalAlpha = f.life * 2; ctx.strokeStyle = '#81e6df'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 16, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  // ---- loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (document.hidden) return;
    t += dt;
    const zoom = viewZoom(view.w, view.h, map.kind) * (mode === 'walk' ? 1 : 0.9);
    let cam;
    for (const d of dust) d.life -= dt;
    while (dust.length && dust[0].life <= 0) dust.shift();
    if (mode === 'walk') {
      stepWalk(dt);
      cam = smoothCamera(cameraFor(map, walker.x, walker.y, view.w, view.h, zoom), dt);
    } else {
      const p = fight.player;
      cam = smoothCamera(cameraFor(map, p.x + Math.cos(p.angle) * 50, p.y + Math.sin(p.angle) * 50, view.w, view.h, zoom), dt);
      if (hitstop > 0) { hitstop -= dt; draw(shaken(cam, dt)); return; }
      if (mode === 'fight') {
        acc = Math.min(0.2, acc + dt);
        let hpBefore = p.hp, leftBefore = fight.enemies.filter(e => e.alive).length;
        while (acc >= STEP && mode === 'fight') { stepFightMode(STEP, cam); acc -= STEP; }
        if (p.hp !== hpBefore || fight.enemies.filter(e => e.alive).length !== leftBefore) renderHud();
      }
      for (const f of fx) f.life -= dt;
      fx = fx.filter(f => f.life > 0);
    }
    draw(shaken(cam, dt));
  }

  // The camera eases after its target (snaps on a new map), and shakes on hits unless motion is reduced.
  function smoothCamera(want, dt) {
    if (!camera || reducedMotion()) { camera = { ...want }; return camera; }
    const k = 1 - Math.exp(-dt * 9);
    camera = { ...want, x: camera.x + (want.x - camera.x) * k, y: camera.y + (want.y - camera.y) * k };
    return camera;
  }
  function shaken(cam, dt) {
    if (shake <= 0) return cam;
    shake = Math.max(0, shake - dt);
    if (reducedMotion()) return cam;
    const a = shake * 22;
    return { ...cam, x: cam.x + (Math.random() - 0.5) * a, y: cam.y + (Math.random() - 0.5) * a };
  }

  const api = {
    get map() { return map; },
    get player() { return walker; },
    get mode() { return mode; },
    get fightState() { return fight; },
    get target() { return target; },
    go,
    fight: startFight,
    unlock(id) { opened.add(id); layerDirty = true; sound('unlock'); },
    /** The story's objective ({ text, station, npc? } or null): a marker in the world and a line on screen. */
    setObjective(o) {
      objective = o || null;
      objectiveLine.hidden = !objective?.text;
      if (objective?.text) objectiveLine.textContent = objective.text;
    },
    /** Sends an npc to a station's spot (Ralph leading you to the scrap pile). */
    leadTo(id, station) {
      const n = npcs.find(x => x.id === id);
      const r = map.rings.find(x => x.station === station);
      if (!n || !r) return false;
      n.home = r.rect ? { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 } : { x: r.x + map.tile * 0.9, y: r.y - map.tile * 0.4 };
      n.wander = Math.max(n.wander || 0, 0.3);
      return true;
    },
    sound,
    isUnlocked: id => opened.has(id),
    open: id => { opened.add(id); layerDirty = true; },
    setNpcVisible(id, on) { if (on) hidden.delete(id); else hidden.add(id); },
    follow(id, on) { if (on) following.add(id); else following.delete(id); },
    redraw() { layerDirty = true; },
    pause() { paused = true; input.enabled = false; },
    resume() { paused = false; input.enabled = true; },
    /** For tests and the director: use whatever is in reach. */
    useTarget() { if (target) use(target); return target; },
    /** Screen point (CSS px in the canvas) of a world point, for tests and pointer hints. */
    screenOf(x, y) { const c = lastCam || { x: 0, y: 0, zoom: 1 }; return { x: (x - c.x) * c.zoom, y: (y - c.y) * c.zoom }; },
    /** Teleport (tests, director cuts). */
    place(x, y, angle) { walker.x = x; walker.y = y; if (angle != null) walker.angle = angle; walker.vx = walker.vy = 0; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); offArt(); el.remove(); },
    el, canvas,
  };

  el.__world = api;
  setMap(mapId, spawn);
  resize();
  raf = requestAnimationFrame((now) => { last = now; frame(now); });
  return api;
}

export { ENEMY_TYPES, WALK };
