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
import { enterMap, MAP_DEFS } from '../maps/index.js';
import { createWalker, stepWalker, stepNpc, WALK } from './rules/walk.js';
import { createFight, stepFight, STEP, ENEMY_TYPES } from './rules/shooter.js';
import { buildStaticLayer, buildVignette, drawBody, drawContained, castSprite, castLook } from './draw.js';
import { sprite, playerFrames, preload, onArtLoaded, captainSprite, playerArt } from './assets.js';
import { fitCanvas, viewZoom, cameraFor } from './viewport.js';
import { createInput } from './input.js';
import { nearestEnemy } from './aim.js';
import { createEl } from './dom.js';
import { createStealthLayer } from './stealthLayer.js'; // live stealth: only for a map with a `stealth` block (the workbench yard)
import { TUTORIAL_EVENTS } from './events.js';
import { createSfx } from './sfx.js';
import { createStage } from './stage.js'; // opening B: bubbles over heads, staged scenes
// r3 basics: the one interact system (marks, prompt, objective marker) lives in datapad/.
import { createMarks, lookFor } from '../datapad/marks.js';
import { icon, keyCap, promptIcon } from '../datapad/icons.js';
import { mapsHolding, doorToward } from '../datapad/route.js';
import { BASICS_DATA } from '../datapad/data.js';
import { hudArt } from '../ui/assets.js';
// launch maps: things that switch in play (doors, the goo, the reactor) are map data (rules/states.js).
import { hasStates, resolveStates, applyStates, stateSignature } from './rules/states.js';
import { compileMap } from './rules/mapdata.js';
import { createDoorSystem } from './doors/system.js'; // launch doors: doors built into the walls and two-door entries
import { drawWallDoors } from './doors/paint.js';
const expandEntries = def => def.entries || [];
import { markerPoint } from '../slice/places.js';
import { placeName as roomName } from '../slice/places.js';

const VERBS = Object.fromEntries(Object.entries(BASICS_DATA.marks.kinds).map(([k, v]) => [k, v.verb]));
// Donaven: "what if the label only pops up when you are in range say 2 tiles or less from the interactable".
const NAME_RANGE = BASICS_DATA.marks.nameRange ?? 2;
const OFFER_ACCENT = BASICS_DATA.marks.offer ?? '#9fe870';
const short = (label) => String(label || '').split(':')[0].trim();
// A door label that already says where you go ("Back to the hangar", "Board your ship") needs no "Go to".
const DOOR_SAYS_IT = new RegExp(`^(${(BASICS_DATA.marks.doorVerbs || []).join('|')})\\b`, 'i');

export function createWorld({ root, mapId = 'hangar', spawn = 'default', hooks = {}, emit = () => {}, shipArt = null, reducedMotion = () => false, unlocked = [], sound = createSfx() }) {
  const el = createEl('div', { class: 'of-world' });
  const canvas = createEl('canvas', { class: 'of-canvas', 'aria-label': 'On foot. Move with WASD or the arrow keys, E to use.' });
  // The prompt in reach: a key cap, an icon and the verb ("E  Talk to Chibby"); tap or click it to use.
  const prompt = createEl('button', { type: 'button', class: 'of-prompt', 'aria-live': 'polite', hidden: true });
  const promptKey = keyCap('E', 'of-key');
  const promptIconBox = createEl('span', { class: 'of-prompt-icon' });
  const promptText = createEl('span', { class: 'of-prompt-text' });
  prompt.append(promptKey, promptIconBox, promptText);
  const placeName = createEl('div', { class: 'of-place', 'aria-live': 'polite' });
  const hud = createEl('div', { class: 'of-hud' });
  const fadeCaption = createEl('p', { class: 'of-fade-caption' });
  const fade = createEl('div', { class: 'of-fade' }, fadeCaption);
  const objectiveLine = createEl('p', { class: 'of-objective', role: 'status', 'aria-live': 'polite', hidden: true });
  const fightHelp = createEl('p', { class: 'of-hud-help' });
  el.append(canvas, hud, fightHelp, objectiveLine, placeName, fade);
  el.__world = null; // set to the api below (tests and the dev console reach the world through the element)
  root.append(el);
  const marks = createMarks({ root: el, reducedMotion });
  el.append(prompt); // above the marks
  let safe = { top: 0, bottom: 0, avoid: [] }; // avoid: screen boxes the HUD owns (the tracker)
  let promptIconId = null;
  prompt.addEventListener('click', () => { if (target && mode === 'walk' && !busy && !paused) use(target); });
  const ctx = canvas.getContext('2d');
  const stage = createStage({ reducedMotion });

  let map = null, walker = null, npcs = [], layer = null, layerScale = 0, layerDirty = true;
  let vignette = null, view = { w: 1, h: 1, dpr: 1 };
  let mode = 'walk', busy = false, paused = false, t = 0, raf = 0, last = 0, acc = 0;
  let input = createInput(el, { mode: 'walk', canvas });
  promptKey.hidden = input.touch;
  let target = null, arrivedAt = 0, walkedSent = false;
  let camera = null, shake = 0, hitstop = 0, stepDist = 0, objective = null;
  let inRings = new Set(), lastDoorSound = -1;
  let zoomK = 1;
  let stealth = null, caughtT = 0; // live stealth layer for maps that have a `stealth` block
  const dust = [];
  let fight = null, fightDone = null, fx = [];
  const hidden = new Set();
  const following = new Set();
  const opened = new Set(unlocked);
  // launch maps: switchable things. baseMap is the map as made; map is it in its current states.
  let baseMap = null, stateSig = '', stateClock = 0;
  const stateOverrides = new Map(); // map id -> { tag: state } forced by a script (world.setState)
  const flagsNow = () => hooks.flags?.() || {};
  const overridesFor = id => stateOverrides.get(id) || {};
  function withStates(m) { return withEntries(withStatesOnly(m)); }
  /** launch doors hook: a link door that has become a two-door entry is not an old door any more (no walk-in, no old painting, no "Go" mark). */
  function withEntries(m) {
    const ids = new Set(expandEntries(m.def).filter(e => e.door).map(e => e.door));
    if (!ids.size) return m;
    return Object.freeze({ ...m, doors: m.doors.filter(d => !ids.has(d.id)), interacts: m.interacts.filter(i => !(i.kind === 'door' && ids.has(i.id))) });
  }
  function withStatesOnly(m) {
    if (!hasStates(m.def)) { stateSig = ''; return m; }
    const states = resolveStates(m.def, flagsNow(), overridesFor(m.id));
    stateSig = stateSignature(states);
    return compileMap(applyStates(m.def, states));
  }
  /** Re-resolve the current map's states; when anything switched, rebuild the walk map and the baked layer. */
  function refreshStates(force = false) {
    if (!baseMap || !hasStates(baseMap.def)) return false;
    const sig = stateSignature(resolveStates(baseMap.def, flagsNow(), overridesFor(baseMap.id)));
    if (!force && sig === stateSig) return false;
    map = withStates(baseMap);
    const keep = new Map(npcs.map(n => [n.id, n]));
    npcs = map.npcs.map(n => keep.get(n.id) || { ...n, home: { ...n.home }, vx: 0, vy: 0, moving: false });
    for (const n of keep.values()) if (n.follow && !npcs.includes(n)) npcs.push(n);
    layerDirty = true;
    doorsys.load(map, { keep: true }); // launch doors hook
    emit('map:state', { map: map.id, states: { ...(map.def.stateOf || {}) } });
    return true;
  }
  const doorsys = createDoorSystem(); // launch doors hook: wall doors (map.def.wallDoors) and vestibule entries (map.def.entries); nothing happens in a map without them
  const doorBodies = () => [walker, ...npcs.filter(n => !hidden.has(n.id))];
  const doorShown = d => {
    if (doorLocked(d)) return 'locked';
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2, r = map.tile * 1.6;
    return doorBodies().some(b => b && Math.hypot(b.x - cx, b.y - cy) <= r) ? 'open' : 'closed';
  };

  const offArt = onArtLoaded(() => { layerDirty = true; });

  function setMap(id, spawnName = 'default') {
    baseMap = enterMap(id); // a generic place (the cantina) is dressed fresh on every visit
    map = withStates(baseMap); // launch maps: in the states the save's flags (and scripts) say
    preload(map);
    doorsys.load(map, { arrive: spawnName }); // launch doors hook: arriving in a vestibule starts with both doors shut
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
    stage.reset(); // opening B: staged things belong to the room they were staged in
    stealth?.destroy();
    stealth = map.def?.stealth ? createStealthLayer({ map, root: el, setup: hooks.stealthSetup?.() || null, reducedMotion, touch: input.touch, onEvent: stealthEvent }) : null;
    caughtT = 0;
    hooks.entered?.(map, api);
    emit(TUTORIAL_EVENTS.entered, { map: map.id });
  }

  /** launch doors hook: the map change inside a vestibule (both doors are shut): a quick dim under the cycle lights. */
  function transit(id, spawnName) {
    if (reducedMotion()) { setMap(id, spawnName); return; }
    fade.classList.add('on');
    setTimeout(() => { setMap(id, spawnName); fade.classList.remove('on'); }, 160);
  }

  /** Live stealth: what the guards just did (an inspect, an alarm, a takedown, a catch). The page hears it too. */
  const stealthListeners = new Set();
  function stealthEvent(e) {
    hooks.stealthEvent?.(e, api);
    for (const f of stealthListeners) f(e);
    if (e.type === 'alarm') sound('jam');
    else if (e.type === 'takedown') sound('kill');
    else if (e.type === 'inspect' || e.type === 'body-found') sound('turn');
    else if (e.type === 'caught') { caughtT = 1.2; sound('hurt'); }
  }
  /** Opening B: run live stealth in this room for a scene (a room with no stealth block of its own). def: { guards: [...] } as in rules/stealth.js. */
  function beginStealth(def, { setup = null } = {}) {
    stealth?.destroy();
    stealth = createStealthLayer({ map, def, root: el, setup: setup || hooks.stealthSetup?.() || null, reducedMotion, touch: input.touch, onEvent: stealthEvent });
    caughtT = 0;
    return stealth;
  }
  /** Stop the scene's stealth. Returns where the guards stood: [{ id, x, y, angle, down }]. */
  function endStealth() {
    const guards = stealth ? stealth.sim.guards.map((g) => ({ id: g.id, x: g.x, y: g.y, angle: g.angle, down: g.state === 'down' })) : [];
    stealth?.destroy();
    stealth = null; caughtT = 0;
    return guards;
  }
  /** Back to the start of the yard: the guards and the counts reset, you go back to the way in. */
  function stealthRestart() {
    if (!stealth) return;
    stealth.reset();
    const s = map.spawns[map.def.stealth.restart || 'default'] || map.spawns.default;
    walker.x = s.x; walker.y = s.y; walker.angle = s.angle; walker.vx = walker.vy = 0;
    caughtT = 0;
  }

  function go(id, spawnName) {
    sound('door');
    if (reducedMotion()) { setMap(id, spawnName); return; }
    fade.classList.add('on');
    setTimeout(() => { setMap(id, spawnName); fade.classList.remove('on'); }, 180);
  }

  /**
   * A time skip (opening B): the only fade the opening keeps. Fades through black with one line, puts the player in `room`
   * (when it is another room), then fades back. Resolves when the screen is clear again.
   */
  function skip({ room = null, spawn = 'default', caption = '', holdMs = 1100 } = {}) {
    return new Promise((resolve) => {
      const fast = reducedMotion();
      fadeCaption.textContent = caption;
      fade.classList.add('on', 'is-skip');
      setTimeout(() => {
        if (room && map.id !== room) setMap(room, spawn);
        setTimeout(() => { fade.classList.remove('on'); setTimeout(() => { fade.classList.remove('is-skip'); fadeCaption.textContent = ''; resolve(); }, fast ? 0 : 650); }, fast ? 0 : holdMs);
      }, fast ? 0 : 650);
    });
  }

  // The ship on the hangar pad is the player's own ship picture (core's tier art).
  function extraArt(c, p) {
    if (p.art !== 'player-ship') return false;
    const img = shipArt?.();
    if (!img) return false;
    // Tier art faces up with margin; draw it big around the hull box (the ramp row under it stays walkable and clear).
    drawContained(c, img, { ...p, w: p.w * 1.2, h: p.h * 1.75, cx: p.cx, cy: p.cy + p.h * 0.2 });
    return true;
  }

  function ensureLayer(zoom) {
    const want = Math.min(2, zoom * view.dpr);
    if (!layerDirty && layer && Math.abs(layerScale - want) < 0.05) return;
    layer = buildStaticLayer(map, want, { extraArt, isLocked: doorLocked });
    layerScale = want;
    layerDirty = false;
  }
  const findDoorDef = d => map.def.doors?.find(x => x.id === d.id) || map.def.wallDoors?.find(x => x.id === d.id); // launch doors hook: wall doors gate the same way
  // A door's gate: null when open, else { reason, hack?: level, key } (puzzle locks here; skill and hack gates from the page).
  const doorGate = d => {
    const def = findDoorDef(d) || {};
    if (def.locked && !opened.has(def.locked)) return { reason: 'Locked.', key: def.locked };
    if (def.sealed) return { reason: typeof def.sealed === 'string' ? def.sealed : 'Sealed.' }; // launch maps: a state can seal a door
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
    let mv = (busy || paused || caughtT > 0) ? { x: 0, y: 0 } : input.move();
    let walkOpts = {};
    if (stealth) { const m = stealth.moveOf(mv, input.gait?.(mv)); mv = m.mv; walkOpts = m.opts; } // your gait sets the speed
    const wmap = doorsys.walkMap(map); // launch doors hook: a shut wall door is a wall
    stepWalker(walker, mv, wmap, dt, walkOpts);
    if (!walkedSent && walker.walked > map.tile * 3) { walkedSent = true; emit(TUTORIAL_EVENTS.moved, {}); }
    // Footsteps: a soft tick and a puff of dust on exteriors.
    if (walker.moving) {
      stepDist += Math.hypot(walker.vx, walker.vy) * dt;
      if (stepDist > 38) { stepDist = 0; if (stealth?.gait !== 'sneak') sound('step'); if (map.kind === 'exterior' && !reducedMotion()) dust.push({ x: walker.x - Math.cos(walker.angle) * 10, y: walker.y - Math.sin(walker.angle) * 10, life: 0.5 }); }
    }
    checkRings();
    if (stealth && !busy && !paused) {
      if (caughtT > 0) { caughtT -= dt; if (caughtT <= 0) stealthRestart(); } else stealth.step(dt, walker);
    }
    for (const n of npcs) {
      if (hidden.has(n.id)) continue;
      stepNpc(n, t, dt, wmap, following.has(n.id) ? walker : null);
    }
    // Npc interact points follow the npc.
    const extra = npcs.filter(n => !hidden.has(n.id)).map(n => ({ kind: 'npc', id: n.id, label: castLook(n.id).name, x: n.x, y: n.y, reach: map.tile * 1.9 })); // reach: across a desk or a counter
    extra.push(...doorsys.gated(walker, doorLocked)); // launch doors hook: a locked wall door can be tried with E
    if (stealth && !busy && !paused && caughtT <= 0) extra.push(...stealth.interacts(walker)); // a guard you can take from behind
    const base = { ...map, interacts: map.interacts.filter(i => i.kind !== 'npc') };
    target = busy || paused ? null : pickTarget(walker, base, extra); // nothing to use while the floor is held
    showPrompt(target);
    if (busy || paused) return;
    // launch doors hook: panels, the vestibule sequence (the swap happens with both doors shut)
    if (!busy && !paused) {
      const r = doorsys.step(dt, { walker, bodies: doorBodies(), locked: doorLocked, still: reducedMotion() });
      if (r.sounds.includes('open') && t - lastDoorSound > 0.25) { lastDoorSound = t; sound('door'); }
      const swap = r.events.find(e => e.type === 'swap');
      if (swap) { transit(swap.to, swap.arrive); return; }
    }
    // Doors: walk into one (after a moment in a new room) or press Use.
    const useIt = input.take('interact');
    for (const d of map.doors) {
      const inside = walker.x > d.x - 14 && walker.x < d.x + d.w + 14 && walker.y > d.y - 14 && walker.y < d.y + d.h + 14;
      if (inside && t - arrivedAt > 0.5 && !doorLocked(d)) { go(d.to, d.arrive || 'default'); return; }
    }
    if (useIt && target) use(target);
  }

  // r3 basics: which thing in reach E uses. Like rules/walk.js nearestInteract, but what you face
  // counts for more (two things in reach: turn toward the one you want), and the current pick
  // sticks unless another is clearly better, so the prompt never flickers between neighbours.
  function pickTarget(w, m, extra) {
    let best = null, bestScore = Infinity, keep = Infinity;
    const face = BASICS_DATA.marks.facing ?? 40;
    for (const it of [...m.interacts, ...extra]) {
      if (it.hidden) continue;
      const dx = it.x - w.x, dy = it.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d > it.reach + WALK.reachBonus) continue;
      const score = d - Math.cos(Math.atan2(dy, dx) - w.angle) * face;
      if (target && it.kind === target.kind && it.id === target.id) keep = score;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best && keep < bestScore + 14 && target) return [...m.interacts, ...extra].find((it) => it.kind === target.kind && it.id === target.id) || best;
    return best;
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

  // Input is live only when nothing holds the floor: an interaction running AND a page pause are both holds,
  // and ending one must not switch the other off (a closed talk used to re-enable input under a dialogue).
  function syncInput() { input.enabled = !(busy || paused); }

  function use(it) {
    if (stage.captured) return; // opening B: an approach is running, the use key works the job
    if (it.kind === 'takedown') { stealth?.takedown(it.id, walker); return; }
    if (it.kind === 'door' || it.kind === 'wdoor') {
      const d = it.kind === 'wdoor' ? doorsys.get(it.id) : map.doors.find(x => x.id === it.id);
      const gate = doorGate(d);
      if (gate?.hack) {
        const key = `hack:${map.id}:${d.id}`;
        const r = hooks.interact?.({ kind: 'hack', id: key, level: gate.hack, label: d.label, door: true, pick: gate.pick }, api);
        if (r?.then) { busy = true; input.enabled = false; r.then(res => { if (res?.success) { opened.add(key); layerDirty = true; } }).finally(() => { busy = false; syncInput(); }); }
        return;
      }
      if (gate) { hooks.locked?.({ ...d, gate }, api); return; }
      if (it.kind === 'wdoor') return; // launch doors hook: unlocked, it opens on approach
      const redirect = hooks.doorTo?.(d, map);
      go(redirect?.to || it.to, redirect?.arrive || it.arrive);
      return;
    }
    const result = hooks.interact?.(it, api);
    if (result && typeof result.then === 'function') {
      busy = true;
      walker.vx = walker.vy = 0;
      input.enabled = false;
      result.catch(error => console.warn('Stardust: an interaction failed', error)).finally(() => { busy = false; syncInput(); });
    }
  }

  function promptLabel(it) {
    const d = it.kind === 'door' ? map.doors.find(x => x.id === it.id) : it.kind === 'wdoor' ? doorsys.get(it.id) : null;
    const gate = d ? doorGate(d) : hooks.gate?.(it, map) || null;
    const station = stationOf(it);
    const info = station ? hooks.stationInfo?.(station) : null;
    if (it.kind === 'takedown') return { text: 'Silent takedown', gate: null, locked: false };
    if (it.kind === 'npc') return { text: `${VERBS.npc} ${it.label || castLook(it.id).name}`, gate, locked: false };
    if (gate) return { text: `${short(it.label)}: ${gate.hack ? `locked (${gate.pick ? 'pick' : 'hack'}, level ${gate.hack})` : gate.reason}`, gate, locked: !gate.hack };
    if (info?.locked) return { text: `${info.name}: not open yet`, gate: null, locked: true };
    if (it.kind === 'door') return { text: DOOR_SAYS_IT.test(it.label || '') ? it.label : `${VERBS.door} ${it.label}`, gate: null, locked: false };
    if (it.kind === 'station' && info?.prompt) return { text: info.prompt, gate: null, locked: false };
    return { text: it.label || `${VERBS[it.kind] || 'Use'} ${it.id}`, gate: null, locked: false };
  }

  function showPrompt(it) {
    if (!it || mode !== 'walk') { prompt.hidden = true; input.prompt(null); return; }
    const { text, gate, locked } = promptLabel(it);
    if (promptText.textContent !== text) promptText.textContent = text;
    const look = lookFor(it.kind, stationOf(it));
    const iconId = locked ? 'locked' : look.icon;
    if (promptIconId !== iconId) { promptIconBox.replaceChildren(promptIcon(iconId, 'of-prompt-glyph')); promptIconBox.classList.toggle('is-painted', Boolean(promptIconBox.querySelector('img'))); promptIconId = iconId; }
    prompt.style.setProperty('--accent', locked ? '#9db3c2' : look.accent);
    prompt.hidden = false;
    prompt.dataset.kind = it.kind;
    prompt.setAttribute('aria-label', `${input.touch ? 'Tap' : 'Press E'}: ${text}`);
    input.prompt(it.kind === 'takedown' ? 'Takedown' : it.kind === 'npc' ? 'Talk' : gate?.hack ? 'Hack' : gate || locked ? 'Locked' : it.kind === 'door' ? 'Go' : 'Use', iconId);
  }

  // ---- marks: everything usable, from across the room (datapad/marks.js) ----
  const stationOf = (it) => it.station || (it.kind === 'station' ? it.id : null);
  /** Where the objective is: a point in this map, or the door that leads toward it. */
  function objectiveAim() {
    if (!objective || (!objective.station && !objective.npc && !objective.map)) return null;
    // launch slice: a spot in a named room ({ map, npc | zone | prop }): the spot itself when you are in that room, else the door toward it.
    if (objective.map && !objective.station) {
      if (map.id === objective.map) {
        const live = objective.npc ? npcs.find(x => !hidden.has(x.id) && x.id === objective.npc) : null;
        const pt = live ? { x: live.x, y: live.y } : markerPoint(map, objective);
        if (pt) return { x: pt.x, y: pt.y, ...(live ? { npc: live.id } : {}), label: objective.label || (live ? castLook(live.id).name : null) };
        return null;
      }
      const doorTo = doorToward(map.id, [objective.map], MAP_DEFS);
      const dd = doorTo && (map.doors.find(x => x.id === doorTo) || doorsys.get(doorTo)); // launch doors hook: a link door that became a wall door
      return dd ? { x: dd.x + dd.w / 2, y: dd.y + dd.h / 2, door: dd.id, through: true, label: roomName(objective.map) ? `To ${roomName(objective.map)}` : dd.label } : null;
    }
    const n = npcs.find(x => !hidden.has(x.id) && (objective.npc ? x.id === objective.npc : x.station === objective.station));
    if (n) return { x: n.x, y: n.y, npc: n.id, label: objective.label || castLook(n.id).name };
    if (objective.station) {
      const r = map.rings.find(x => x.station === objective.station);
      if (r) {
        const info = hooks.stationInfo?.(objective.station);
        return r.rect ? { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2, station: objective.station, label: info?.name || objective.label } : { x: r.x, y: r.y, station: objective.station, label: info?.name || objective.label };
      }
    }
    // Not in this room: the door that leads toward it.
    const doorId = doorToward(map.id, mapsHolding(objective, MAP_DEFS), MAP_DEFS);
    const d = doorId && (map.doors.find(x => x.id === doorId) || doorsys.get(doorId)); // launch doors hook
    return d ? { x: d.x + d.w / 2, y: d.y + d.h / 2, door: d.id, through: true, label: d.label } : null;
  }

  function markItems(cam) {
    const items = [];
    const aim = objectiveAim();
    const tile = map.tile;
    const at = (x, y) => ({ sx: (x - cam.x) * cam.zoom, sy: (y - cam.y) * cam.zoom });
    for (const it of map.interacts) {
      if (it.kind === 'npc' || it.hidden) continue;
      const station = stationOf(it);
      const info = station ? hooks.stationInfo?.(station) : null;
      const look = lookFor(it.kind, station);
      const door = it.kind === 'door' ? map.doors.find(x => x.id === it.id) : null;
      const prop = it.prop != null ? map.props[it.prop] : null;
      const box = door ? { x: door.x, y: door.y, w: door.w, h: door.h } : prop ? { x: prop.x, y: prop.y, w: prop.w, h: prop.h } : { x: it.x - tile / 2, y: it.y - tile / 2, w: tile, h: tile };
      const gate = door ? doorGate(door) : hooks.gate?.(it, map) || null;
      const locked = Boolean(info?.locked || (gate && !gate.hack));
      const objectiveHere = Boolean(aim && ((aim.door && door && aim.door === door.id) || (aim.station && station === aim.station && !aim.npc)));
      // Donaven: names pop up only within NAME_RANGE tiles of the thing's nearest edge (big things too).
      const dist = Math.hypot(Math.max(box.x - walker.x, 0, walker.x - (box.x + box.w)), Math.max(box.y - walker.y, 0, walker.y - (box.y + box.h))) / tile;
      const label = info?.name || (door ? door.label : short(it.label));
      const offers = station === 'board' ? hooks.offers?.({ map: map.id, station }) || 0 : 0;
      // Phones name only what's close, the objective and job offers; desktops name stations and doors too.
      const named = objectiveHere || dist <= NAME_RANGE; // the objective keeps its name from anywhere
      items.push({
        key: `${it.kind}:${it.id}:${it.prop ?? ''}`, kind: it.kind, station, icon: locked ? 'locked' : offers ? 'jobs' : look.icon, accent: offers ? OFFER_ACCENT : look.accent,
        label: offers ? `${label} · ${offers} job${offers === 1 ? '' : 's'}` : label, showLabel: named, locked, objective: objectiveHere, offers,
        inReach: target === it, box, ...at(box.x + box.w / 2, Math.min(box.y, it.y - tile * 0.4) - 6),
      });
    }
    for (const n of npcs) {
      if (hidden.has(n.id)) continue;
      const look = lookFor('npc');
      const name = castLook(n.id).name;
      const dist = Math.max(0, Math.hypot(walker.x - n.x, walker.y - n.y) - 20 * castLook(n.id).scale) / tile;
      const objectiveHere = Boolean(aim?.npc === n.id);
      const offers = hooks.offers?.({ map: map.id, npc: n.id }) || 0;
      items.push({
        key: `npc:${n.id}`, kind: 'npc', station: n.station || null, icon: offers ? 'jobs' : look.icon, accent: offers ? OFFER_ACCENT : look.accent,
        label: offers ? `${name} · ${offers} job${offers === 1 ? '' : 's'}` : name,
        showLabel: objectiveHere || dist <= NAME_RANGE, locked: false, objective: objectiveHere, offers,
        inReach: target?.kind === 'npc' && target.id === n.id, ring: { x: n.x, y: n.y, r: 21 * castLook(n.id).scale }, ...at(n.x, n.y - (24 * castLook(n.id).scale + 10)),
      });
    }
    // Chips never sit on a doorway or a strip the map keeps clear (a zone with "keepClear": true, e.g. the bay mouth).
    const rect = (b, key) => { const p0 = at(b.x, b.y), p1 = at(b.x + b.w, b.y + b.h); return { key, left: p0.sx, top: p0.sy, right: p1.sx, bottom: p1.sy }; };
    // People too: a chip never covers anyone's body (its own person's chip sits above their head anyway).
    const bodies = npcs.filter((n) => !hidden.has(n.id)).map((n) => { const r = 20 * castLook(n.id).scale; return rect({ x: n.x - r, y: n.y - r * 1.1, w: r * 2, h: r * 2.2 }, `npc:${n.id}`); });
    const me = rect({ x: walker.x - 18, y: walker.y - 20, w: 36, h: 40 }, null);
    const keepClear = [...map.doors.map((d) => rect(d, `door:${d.id}:`)), ...map.zones.filter((z) => z.keepClear).map((z) => rect(z, null)), ...bodies, me];
    return { items, keepClear, aim: aim ? { ...aim, ...at(aim.x, aim.y) } : null };
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
    const aim = input.aim(px, py, nearestEnemy(fight.player, fight.enemies)); // opening B: a fire key aims for the nearest enemy when the pointer is quiet
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
    fightHelp.textContent = fight.ended ? '' : input.touch ? 'Left stick moves. Right stick, or a tap on the playfield, aims and fires. (Keyboard: WASD, hold F to fire.) Dash dodges.' : 'WASD move · mouse aims, click fires · or hold F to fire at the nearest, arrow keys aim and fire · Space dashes';
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
    if (layer.blit) { layer.blit(ctx, cam, view); layer.drawDoors?.(ctx, cam, view, doorShown, t); } // r3-look hook: a look map draws its outside and padded layer itself (onfoot/look); launch maps: doors open as you walk up
    else {
    // The static layer, cropped to the view.
    const s = layer.scale;
    const sx = Math.max(0, cam.x * s), sy = Math.max(0, cam.y * s);
    const dx = Math.max(0, -cam.x) * cam.zoom * dpr, dy = Math.max(0, -cam.y) * cam.zoom * dpr;
    const sw = Math.min(layer.canvas.width - sx, cam.vw * s), sh = Math.min(layer.canvas.height - sy, cam.vh * s);
    if (sw > 0 && sh > 0) ctx.drawImage(layer.canvas, sx, sy, sw, sh, dx, dy, (sw / s) * cam.zoom * dpr, (sh / s) * cam.zoom * dpr);
    } // r3-look hook end
    drawWallDoors(ctx, doorsys, cam, view, layer.look || null, doorLocked); // launch doors hook: the panels, frames and cycle lights
    ctx.setTransform(cam.zoom * dpr, 0, 0, cam.zoom * dpr, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
    // Everything usable, marked on the floor; the objective in gold with a bobbing chevron.
    const marked = mode === 'walk' && !paused ? markItems(cam) : null;
    if (marked) { marks.drawGround(ctx, marked.items, t); if (marked.aim) drawObjective(marked.aim); }
    if (stealth && mode === 'walk') stealth.drawFloor(ctx, t); // cones on the floor, your noise ring
    stage.drawFloor(ctx, t); // opening B: hint ring, scorch, the torch seam, the blown hatch
    const bodies = [];
    if (mode === 'walk') {
      for (const n of npcs) if (!hidden.has(n.id)) bodies.push({ y: n.y, draw: () => drawNpc(n) });
      bodies.push({ y: walker.y, draw: () => drawPlayer(walker.x, walker.y, walker.angle, walker.moving, walker.stride, 0) });
      bodies.push(...stage.bodies(ctx, t)); // opening B: the Reavers on the stage
      if (stealth) bodies.push(...stealth.guardBodies(ctx, t));
    } else {
      for (const e of fight.enemies) if (e.alive) bodies.push({ y: e.y, draw: () => drawEnemy(e) });
      const p = fight.player;
      bodies.push({ y: p.y, draw: () => drawPlayer(p.x, p.y, p.angle, Math.hypot(p.vx, p.vy) > 20, (t * 3) % 4, p.hit, p.iframes > 0) });
    }
    bodies.sort((a, b) => a.y - b.y);
    for (const b of bodies) b.draw();
    stage.drawOver(ctx); // opening B: sparks, flashes, bullet traces, smoke
    if (stealth && mode === 'walk') stealth.drawOver(ctx, t); // meters, ?, !
    if (fight) drawFightFx();
    for (const d of dust) { ctx.fillStyle = `rgba(160,170,180,${d.life * 0.5})`; ctx.beginPath(); ctx.arc(d.x, d.y, 4 + (0.5 - d.life) * 14, 0, Math.PI * 2); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (layer.overlay) layer.overlay(ctx, cam, view, t, mode === 'walk' ? walker : fight?.player); // r3-look hook: a look map's own lights, the captain's light and vignette
    else if (vignette) ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
    if (stealth && mode === 'walk') stealth.drawFog(ctx, cam, view); // fog of war on top of the lights
    stage.drawScreen(ctx, cam, view, stageWhere); // opening B: talk ring and bubbles
    if (marked) {
      // The prompt in reach is a box the chips step around too.
      const avoid = prompt.hidden ? safe.avoid : [...(safe.avoid || []), prompt.getBoundingClientRect()];
      marks.show(); marks.update(marked.items, view, { ...safe, avoid, keepClear: marked.keepClear, hideDoorsUnder: safe.hideDoorsUnder || [] }); marks.pointTo(marked.aim, view, safe);
    } else marks.hide();
    if (fight?.player.hit > 0) { ctx.fillStyle = `rgba(255,80,60,${fight.player.hit})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // Prompt follows its target on screen.
    if (target && mode === 'walk' && !prompt.hidden) {
      const x = (target.x - cam.x) * cam.zoom, y = (target.y - cam.y) * cam.zoom;
      const half = Math.min(view.w / 2 - 8, (prompt.offsetWidth || 200) / 2 + 8);
      const lift = target.kind === 'npc' ? 46 : Math.min(70, (target.reach || 60) * 0.5 * cam.zoom + 18);
      const px = Math.round(Math.max(half, Math.min(view.w - half, x)));
      let py = Math.round(Math.max(safe.top + 54, Math.min(view.h - safe.bottom - 8, y - lift)));
      // Above its thing unless a HUD box (the tracker, the dialogue box) is there: then below it.
      const ph = prompt.offsetHeight || 50;
      const hit = (safe.avoid || []).some((r) => px + half - 8 > r.left && px - half + 8 < r.right && py > r.top && py - ph < r.bottom);
      if (hit) py = Math.round(Math.min(view.h - safe.bottom - 8, y + lift * 0.6 + ph + 14));
      prompt.classList.toggle("is-below", hit);
      prompt.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }
  }

  // The objective marker: the HUD kit's pin bobbing over it, tip down (the brackets and chip are gold too).
  const markerSrc = hudArt('marker-objective');
  const markerImg = markerSrc ? Object.assign(new Image(), { src: markerSrc }) : null;
  function drawObjective(p) {
    const bob = reducedMotion() ? 0 : Math.sin(t * 3) * 4;
    if (markerImg?.complete && markerImg.naturalWidth) {
      const h = 46, w = h * (markerImg.naturalWidth / markerImg.naturalHeight);
      ctx.drawImage(markerImg, p.x - w / 2, p.y - (p.npc ? 40 : 26) - h + bob, w, h);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y - (p.npc ? 62 : 46) + bob);
    ctx.fillStyle = BASICS_DATA.marks.objective;
    ctx.strokeStyle = '#2a1d05';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, -10); ctx.lineTo(0, 4); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(x, y, angle, moving, stride, hit, ghost = false) {
    // The captain's own look (the cast lane's cap-a..cap-d, picked on the licence); the
    // on-foot pack's pilot frames until that picture has loaded.
    const cap = captainSprite();
    const frames = playerFrames();
    const img = cap || (moving ? frames[Math.floor(stride) % 4] || frames[0] : frames[0]);
    if (ghost) ctx.globalAlpha = 0.6;
    drawBody(ctx, x, y, angle, img, { size: cap ? 46 * playerArt().scale : 52, t, moving, stride, hit, tint: '#81e6df' });
    ctx.globalAlpha = 1;
    if (fight && !fight.ended) {
      // A short laser sight: where you're aiming.
      ctx.strokeStyle = '#81e6df55'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 22, y + Math.sin(angle) * 22); ctx.lineTo(x + Math.cos(angle) * 120, y + Math.sin(angle) * 120); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawNpc(n) {
    const look = castLook(n.id);
    // People without a sprite of their own are a re-tinted cast person (assets.js CAST_STAND_IN), never a ship.
    const img = castSprite(n.id);
    // r3 basics: the mark chip and the prompt name people now. launch maps: one label per person, so the canvas
    // never draws a second name tag under the chip.
    drawBody(ctx, n.x, n.y, n.angle, img, { size: 46 * look.scale, t: t + n.x * 0.01, moving: n.moving, stride: (t * 3) % 4, tint: look.color, label: null, dog: look.dog, lift: look.lift });
  }

  function drawEnemy(e) {
    const img = sprite(e.kind.art);
    const size = e.size === 'player' ? 46 * playerArt().scale : e.kind.radius * 3.1;
    drawBody(ctx, e.x, e.y, e.angle, img, { size, lift: e.lift || null, t: t + e.id, moving: e.kind.speed > 0, stride: (t * 2.5 + e.id) % 4, hit: e.hit, tint: '#ffad72' });
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

  /** Where a body is for the stage: an npc by id (with the head height its size needs), or null. */
  const stageWhere = (id) => { const n = npcs.find(x => x.id === id && !hidden.has(x.id)); return n ? { x: n.x, y: n.y, scale: castLook(n.id).scale || 1 } : stage.actorAt(id); };

  /** The camera the player wants: on them, or on what a staged scene points at. */
  const camWant = (zoom) => { const at = stage.camTarget || walker; return cameraFor(map, at.x, at.y, view.w, view.h, zoom); };

  // ---- loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (document.hidden) return;
    t += dt;
    stage.step(dt);
    stateClock += dt;
    if (stateClock > 0.2) { stateClock = 0; refreshStates(); } // launch maps: a flag the story just set switches things
    // Opening B: the fight's pull-back eases in and out over about half a second, never a snap.
    zoomK += ((mode === 'walk' ? 1 : 0.9) - zoomK) * (reducedMotion() ? 1 : 1 - Math.exp(-dt * 5));
    const zoom = viewZoom(view.w, view.h, map.kind) * zoomK;
    let cam;
    for (const d of dust) d.life -= dt;
    while (dust.length && dust[0].life <= 0) dust.shift();
    if (mode === 'walk') {
      stepWalk(dt);
      cam = smoothCamera(camWant(zoom), dt);
      cam = speakerClear(cam, dt);
      shake = Math.max(shake, stage.takeShake());
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

  // Phone layout: the dialogue box sits across the top of the screen, and the
  // speaker can be standing right under it. While a line is up, slide the view
  // so the speaker's head clears the box's bottom edge (eased, and back to
  // normal when the box closes). Desktop and narration lines never shift.
  let speakerShift = 0; // CSS px the view is slid down
  function speakerClear(cam, dt) {
    if (stage.camTarget) return cam;
    let want = 0;
    const box = document.querySelector('.ui-dialogue:not([hidden])');
    const speaker = box?.querySelector('.ui-dlg-portrait')?.dataset.speaker;
    const n = speaker && speaker !== 'narrator' && matchMedia('(max-width:700px)').matches ? npcs.find(x => x.id === speaker && !hidden.has(x.id)) : null;
    if (n) {
      const cr = canvas.getBoundingClientRect();
      const boxBottom = box.getBoundingClientRect().bottom - cr.top;
      const sc = castLook(n.id).scale || 1;
      const head = (n.y - cam.y) * cam.zoom - 34 * sc * cam.zoom;
      const feet = (n.y - cam.y) * cam.zoom + 22 * sc * cam.zoom;
      want = Math.max(0, boxBottom + 8 - head);
      want = Math.min(want, Math.max(0, view.h - 150 - feet)); // never push them under the controls
    }
    speakerShift = reducedMotion() ? want : speakerShift + (want - speakerShift) * (1 - Math.exp(-dt * 9));
    if (Math.abs(speakerShift) < 0.5) { speakerShift = want === 0 ? 0 : speakerShift; return cam; }
    return { ...cam, y: cam.y - speakerShift / cam.zoom };
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
    /** Opening B: the stage (bubbles, the talk ring, staged scenes). */
    stage,
    /** A bubble over an npc's head. */
    bark: (id, text, ms) => stage.bark(id, text, ms),
    /** Is the use key (E) down right now? An approach works the job while it is held. */
    holding: () => input.held('KeyE'),
    /** The people in this room now: [{ id, x, y }] (hidden ones left out). */
    npcsHere: () => npcs.filter(n => !hidden.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y })),
    /** How far the player is from a person here, in tiles, or null when they are not in this room. */
    tilesTo(id) { const n = npcs.find(x => x.id === id && !hidden.has(x.id)) || stage.actorAt(id); return n ? Math.hypot(n.x - walker.x, n.y - walker.y) / map.tile : null; },
    /** Where an npc is now ({ x, y } in world px), or null: tests and the page's pointers. */
    npcAt(id) { const n = npcs.find(x => x.id === id && !hidden.has(x.id)); return n ? { x: n.x, y: n.y } : null; },
    get player() { return walker; },
    get mode() { return mode; },
    get fightState() { return fight; },
    get target() { return target; },
    go,
    skip,
    doors: doorsys, // launch doors: panel amounts and entry phases (tests and the proof)
    fight: startFight,
    unlock(id) { opened.add(id); layerDirty = true; sound('unlock'); },
    /** The story's objective ({ text, station, npc? } or null): a marker in the world and a line on screen. */
    setObjective(o) {
      objective = o ? { text: o.text || '', station: o.station || null, npc: o.npc || null, label: o.label || null, ...(o.map ? { map: o.map, zone: o.zone || null, prop: o.prop || null } : {}) } : null;
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
    /** launch maps: force a tag's state on this map (a scene, the director, a test); null goes back to the flags. */
    setState(tag, state, mapId = map.id) {
      const o = { ...overridesFor(mapId) };
      if (state == null) delete o[tag]; else o[tag] = state;
      stateOverrides.set(mapId, o);
      if (mapId === map.id) refreshStates(true);
    },
    /** launch maps: a tag's state on this map now (or every tag's: no argument). */
    stateOf(tag) { const st = map.def.stateOf || {}; return tag ? st[tag] ?? null : { ...st }; },
    pause() { paused = true; input.enabled = false; },
    resume() { paused = false; syncInput(); },
    /** For tests and the director: use whatever is in reach. */
    useTarget() { if (target) use(target); return target; },
    /** Screen point (CSS px in the canvas) of a world point, for tests and pointer hints. */
    screenOf(x, y) { const c = lastCam || { x: 0, y: 0, zoom: 1 }; return { x: (x - c.x) * c.zoom, y: (y - c.y) * c.zoom }; },
    /** Where the player stands (tests, the director). */
    position: () => ({ x: walker.x, y: walker.y, moving: Boolean(walker.moving) }),
    /** True while something holds the floor (tests): an interaction is running or the page paused the world. */
    get held() { return busy || paused; },
    /** Teleport (tests, director cuts). */
    place(x, y, angle) { walker.x = x; walker.y = y; if (angle != null) walker.angle = angle; walker.vx = walker.vy = 0; },
    /** The HUD's safe area (px kept clear at the top and bottom): marks and the prompt stay inside it. */
    setSafe(next) { safe = { ...safe, top: Math.max(0, next?.top ?? safe.top), bottom: Math.max(0, next?.bottom ?? safe.bottom), avoid: next?.avoid ?? safe.avoid ?? [], hideDoorsUnder: next?.hideDoorsUnder ?? safe.hideDoorsUnder ?? [] }; },
    /** The objective's aim this frame (tests): { x, y, label, through?, door?, station?, npc? } or null. */
    objectiveAim: () => objectiveAim(),
    get marks() { return marks; },
    /** Live stealth on this map ({ sim, stats(), reset() ...}) or null: the page and tests reach the guards here. */
    get stealth() { return stealth; },
    beginStealth, endStealth,
    /** Opening B: hear what the guards did ({ type: 'alarm' | 'caught' | 'takedown' | 'inspect' ... }). Returns off(). */
    onStealth(fn) { stealthListeners.add(fn); return () => stealthListeners.delete(fn); },
    restartStealth: () => stealthRestart(),
    destroy() { stealth?.destroy(); cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); offArt(); marks.destroy(); el.remove(); },
    el, canvas,
  };

  el.__world = api;
  setMap(mapId, spawn);
  resize();
  raf = requestAnimationFrame((now) => { last = now; frame(now); });
  return api;
}

export { ENEMY_TYPES, WALK };
