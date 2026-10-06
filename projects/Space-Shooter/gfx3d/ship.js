// The player's ship and the ghosts in 3D. Rendering only: it reads the pose and
// the keys and never writes back, so the drift is exactly the 2D game's. What it
// adds is how that drift looks: the hull banks into turns and slides, lifts and
// dips with power and brake, flares on a boost, shakes when stunned.
//
// Models: assets.ships[build | family | "courier" | "default"] (a THREE.Object3D
// from a .glb, facing +X) when present, else the procedural Courier. See
// motion/shipAssets.js for the conventions. Contract (gfx3d/index.js):
//   createShipRig(THREE, assets)         -> { group, update(pose, keys, scene, time, dt), setVisible(bool), dispose() }
//   createGhostRig(THREE, assets, color) -> { group, update(pose, time), dispose() }
import { buildCourier, COURIER } from './motion/courierModel.js';
import { createEngineRig } from './motion/engineRig.js';
import { makeRadialTexture } from './motion/glowTexture.js';
import { pickShipModel, fitModel, ownMaterials, familyOf, hullFeatures } from './motion/shipAssets.js';
import { createMotionState, stepMotion, steerInput, strafeInput, stunShake } from './motion/shipMotion.js';
import { shipInfo } from './motion/shipInfo.js';
import { reducedMotion } from './motion/prefs.js';
import { buildScale } from '../engine/shipStats.js';

// The 2D sprite is drawn about one cell long (unit * 1.6 * 0.66, ~96% of it hull).
export const SHIP_LENGTH = 1.0;
export const HOVER = 0.3;           // cells above the track surface
const SHADOW_OFFSET = { x: 0.1, y: 0.14 };

const AMBER = [1, 0.62, 0.18];

/** Build the hull for a build key: a fitted .glb clone or the procedural Courier. Always unit length. */
function makeHull(THREE, assets, buildKey) {
  const picked = pickShipModel(assets, buildKey);
  if (picked) {
    const fit = fitModel(THREE, picked.object);
    const materials = ownMaterials(fit.root);
    const features = hullFeatures(picked.key);
    // A measured nozzle beats fitModel's default pair when the .glb names none.
    const named = fit.ports.length && fit.ports !== null && picked.object.getObjectByName && hasExhaustNodes(picked.object);
    const ports = !named && features?.ports ? features.ports.map((p) => ({ x: p.x, y: p.y, z: p.z })) : fit.ports;
    return { key: picked.key, root: fit.root, ports, materials, ownGeometries: [], custom: true, features };
  }
  const built = buildCourier(THREE);
  const materials = built.materials.map((m) => ({ material: m, emissive: m.emissive ? m.emissive.clone() : null, intensity: m.emissiveIntensity ?? 1 }));
  return { key: 'procedural', root: built.root, ports: COURIER.PORTS.map((p) => ({ x: p.x, z: p.z, y: 0.045 })), materials, ownGeometries: built.geometries, custom: false, features: null };
}

function hasExhaustNodes(object) {
  let found = false;
  object.traverse((o) => { if (/exhaust/i.test(o.name || '')) found = true; });
  return found;
}

/** Additive sprites for light a hull paints into its texture (HULL_FEATURES glows), in unit-length space. */
function makeGlows(THREE, texture, glows) {
  const group = new THREE.Group();
  const items = [];
  for (const g of glows || []) {
    const material = new THREE.SpriteMaterial({ map: texture, color: g.color, transparent: true, opacity: g.opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(g.x, g.y, g.z);
    sprite.scale.setScalar(g.size);
    sprite.renderOrder = 5;
    group.add(sprite);
    items.push({ sprite, material, part: g.part, opacity: g.opacity });
  }
  return { group, items, dispose() { for (const i of items) i.material.dispose(); group.removeFromParent(); } };
}

function disposeHull(hull) {
  if (!hull) return;
  for (const g of hull.ownGeometries) g.dispose();
  for (const m of hull.materials) m.material.dispose();
}

/** Tint a hull's emissive toward amber (amount 0..1) for the stun flash; 0 restores it. */
function flashHull(hull, amount) {
  for (const m of hull.materials) {
    const mat = m.material;
    if (!mat.emissive) continue;
    if (amount <= 0) { mat.emissive.copy(m.emissive); mat.emissiveIntensity = m.intensity; continue; }
    mat.emissive.setRGB(m.emissive.r + (AMBER[0] - m.emissive.r) * amount, m.emissive.g + (AMBER[1] - m.emissive.g) * amount, m.emissive.b + (AMBER[2] - m.emissive.b) * amount);
    mat.emissiveIntensity = Math.max(m.intensity, 0.9 * amount);
  }
}

function ringMesh(THREE, inner, outer, color, segments = 48) {
  const g = new THREE.RingGeometry(inner, outer, segments);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.visible = false;
  mesh.renderOrder = 4;
  return mesh;
}

export function createShipRig(THREE, assets) {
  const group = new THREE.Group();
  group.name = 'stardust-ship';
  const lift = new THREE.Group();            // hover height
  const body = new THREE.Group();            // roll and pitch live here
  const scaler = new THREE.Group();          // unit-length models and effects -> cells
  group.add(lift);
  lift.add(body);
  body.add(scaler);

  const texture = makeRadialTexture(THREE, 64, 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: texture, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.02;
  shadow.renderOrder = 1;
  group.add(shadow);

  const engines = createEngineRig(THREE, texture);
  scaler.add(engines.group);

  // Rings that mirror the 2D renderer's status marks: brake bubble, damage immunity, stun.
  const brakeRing = ringMesh(THREE, 0.6, 0.625, 0xa3edff);
  const invulnRing = ringMesh(THREE, 0.56, 0.6, 0xffb769);
  const stunRing = ringMesh(THREE, 0.72, 0.76, 0xffd678);
  lift.add(brakeRing, invulnRing, stunRing);

  // Fill light for scenes that have none of their own (checked once per track).
  const fill = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x1b2430, 1.1);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 6, -2);
  fill.add(hemi, key, key.target);
  fill.visible = false;
  group.add(fill);
  let lightsFor = undefined;
  const ensureLights = (layout) => {
    if (lightsFor === layout && lightsFor !== undefined) return;
    lightsFor = layout ?? null;
    let found = false;
    group.parent?.traverse((o) => { if (o.isLight && o !== hemi && o !== key) found = true; });
    fill.visible = !found;
  };

  let hull = null;
  let hullKey = null;
  let length = SHIP_LENGTH;
  const state = createMotionState();
  const out = {};
  const shake = { x: 0, z: 0, roll: 0, yaw: 0 };
  const input = { steer: 0, strafe: 0, thrust: 0, back: 0, brake: 0, active: false };
  let wasVisible = true;

  function setHull(buildKey, scene) {
    const wanted = `${buildKey || ''}`;
    if (hull && hullKey === wanted) return;
    hullKey = wanted;
    if (hull) { scaler.remove(hull.root); disposeHull(hull); }
    hull = makeHull(THREE, assets, buildKey);
    scaler.add(hull.root);
    length = SHIP_LENGTH * (buildKey ? buildScale(buildKey) : 1);
    scaler.scale.setScalar(length);
    shipInfo.length = length;
    shipInfo.ports = hull.ports.map((p) => ({ x: p.x * length, z: p.z * length }));
  }

  return {
    group,
    update(pose, keys, scene, time, dt) {
      if (!pose) return;
      const reduced = reducedMotion(scene);
      setHull(scene?.ship, scene);
      ensureLights(scene?.layout);

      const started = !scene?.lockedInStart && !scene?.paused;
      const hasFuel = !(scene?.fuel <= 0);
      input.active = started;
      input.steer = steerInput(keys);
      input.strafe = hasFuel ? strafeInput(keys) : 0;
      input.thrust = hasFuel ? (keys?.thrustStrength || 0) : 0;
      input.back = hasFuel ? (keys?.backStrength || 0) : 0;
      input.brake = !!keys?.brake && (scene?.flux ?? 1) > 0;
      stepMotion(state, pose, input, dt, out);

      // Place and orient: the sim angle is the heading; bank and pitch ride on top.
      let sx = 0, sz = 0, sroll = 0, syaw = 0;
      if (out.stunned && !reduced) {
        stunShake(time, out.stun, shake);
        sx = shake.x; sz = shake.z; sroll = shake.roll; syaw = shake.yaw;
      }
      group.position.set(pose.x + sx, 0, pose.y + sz);
      group.rotation.y = -pose.angle + syaw;
      const bob = reduced ? 0 : Math.sin(time * 2.1) * 0.012;
      lift.position.y = HOVER + bob;
      body.rotation.x = out.bank + sroll;
      body.rotation.z = out.pitch;

      // Engines and status marks.
      const ports = hull.ports;
      engines.update(ports, out, time, !reduced);
      const flash = out.stunned ? (reduced ? 0.55 : 0.35 + 0.35 * Math.sin(time * 40) ** 2) : 0;
      flashHull(hull, flash * out.stun);

      stunRing.visible = out.stunned;
      if (out.stunned) { stunRing.material.opacity = reduced ? 0.7 : 0.45 + 0.4 * Math.sin(time * 40) ** 2; stunRing.scale.setScalar(length * 1.3); }
      const invuln = (pose.invulnTimer || 0) > 0;
      invulnRing.visible = invuln;
      if (invuln) { invulnRing.material.opacity = reduced ? 0.7 : 0.45 + 0.4 * Math.sin(time * 45) ** 2; invulnRing.scale.setScalar(length * 1.1); }
      brakeRing.visible = out.brake > 0.05;
      if (brakeRing.visible) { brakeRing.material.opacity = out.brake * 0.8; brakeRing.scale.setScalar(length * (1 + (reduced ? 0 : Math.sin(time * 22) * 0.03))); }

      // Blob shadow: shrinks and fades a little with speed-lift, offset away from the light.
      const a = pose.angle, c = Math.cos(a), s = Math.sin(a);
      shadow.position.x = SHADOW_OFFSET.x * c + SHADOW_OFFSET.y * s;
      shadow.position.z = -SHADOW_OFFSET.x * s + SHADOW_OFFSET.y * c;
      shadow.scale.set(length * 1.25, 1, length * 1.1);

      shipInfo.glow = out.glow; shipInfo.boost = out.boost; shipInfo.strafe = out.strafe; shipInfo.brake = out.brake;
      shipInfo.stunned = out.stunned; shipInfo.speed = out.speed; shipInfo.active = started; shipInfo.hover = HOVER; shipInfo.visible = wasVisible;
    },
    setVisible(v) { group.visible = !!v; wasVisible = !!v; shipInfo.visible = !!v; },
    dispose() {
      disposeHull(hull);
      engines.dispose();
      for (const r of [brakeRing, invulnRing, stunRing]) { r.geometry.dispose(); r.material.dispose(); }
      shadowGeo.dispose(); shadowMat.dispose(); texture.dispose();
      group.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------------------
// Ghosts: a translucent tinted copy of whichever hull the ghost flew, flat
// shaded with one shared unlit material per ghost (no extra lights, no
// per-material cost), and a name tag when the browser can draw one.
// ---------------------------------------------------------------------------
export function createGhostRig(THREE, assets, color = '#9fe8ff') {
  const group = new THREE.Group();
  group.name = 'stardust-ghost';
  const lift = new THREE.Group();
  const body = new THREE.Group();
  const scaler = new THREE.Group();
  group.add(lift);
  lift.add(body);
  body.add(scaler);

  const tint = new THREE.Color(color);
  // Lambert: lit by whatever the scene has (a ghost adds no lights of its own), tinted and see-through.
  const ghostMat = new THREE.MeshLambertMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.3, transparent: true, opacity: 0.45, depthWrite: false, flatShading: true });
  const texture = makeRadialTexture(THREE, 32, 2);
  const engines = createEngineRig(THREE, texture, { alpha: 0.55, outer: tint, inner: 0xffffff, halo: tint, maxPorts: 2 });
  scaler.add(engines.group);

  let hull = null, hullKey = null, length = SHIP_LENGTH;
  const state = createMotionState();
  const out = {};
  const none = { active: false };
  const vis = { glow: 0.35, boost: 0, strafe: 0, brake: 0 };
  let tag = null, tagLabel = null, tagTexture = null, lastTime = null;

  function setHull(buildKey) {
    const wanted = `${buildKey || ''}`;
    if (hull && hullKey === wanted) return;
    hullKey = wanted;
    if (hull) { scaler.remove(hull.root); for (const g of hull.geometries) g.dispose(); }
    const picked = pickShipModel(assets, buildKey);
    if (picked) {
      const fit = fitModel(THREE, picked.object);
      fit.root.traverse((o) => { if (o.isMesh) o.material = ghostMat; });
      hull = { root: fit.root, ports: fit.ports, geometries: [] };
    } else {
      const built = buildCourier(THREE);
      built.root.traverse((o) => { if (o.isMesh) o.material = ghostMat; });
      for (const m of built.materials) m.dispose();
      hull = { root: built.root, ports: COURIER.PORTS.map((p) => ({ x: p.x, z: p.z, y: 0.045 })), geometries: built.geometries };
    }
    scaler.add(hull.root);
    length = SHIP_LENGTH * (buildKey ? buildScale(buildKey) : 1);
    scaler.scale.setScalar(length);
  }
  setHull(null);

  function setLabel(label) {
    if (label === tagLabel || typeof document === 'undefined') return;
    tagLabel = label;
    if (tag) { lift.remove(tag); tag.material.dispose(); tagTexture?.dispose(); tag = tagTexture = null; }
    if (!label) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = '600 22px Consolas, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(label, 128, 26);
      ctx.fillStyle = typeof color === 'string' ? color : '#9fe8ff'; ctx.fillText(label, 128, 26);
      tagTexture = new THREE.CanvasTexture(canvas);
      tagTexture.colorSpace = THREE.SRGBColorSpace;
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture, transparent: true, depthWrite: false, depthTest: false }));
      tag.scale.set(2.6, 0.49, 1);
      tag.position.set(0, 0.2, 0);
      tag.renderOrder = 10;
      lift.add(tag);
    } catch { tag = null; }
  }

  return {
    group,
    update(pose, time = 0) {
      if (!pose) return;
      // The contract passes no dt for ghosts: derive it from the scene clock (which stops while paused).
      const dt = lastTime == null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      setHull(pose.ghost?.build);
      setLabel(pose.label || null);
      stepMotion(state, pose, none, dt, out);
      group.position.set(pose.x, 0, pose.y);
      group.rotation.y = -pose.angle;
      lift.position.y = HOVER * 0.9;
      body.rotation.x = out.bank * 0.9;
      body.rotation.z = out.pitch;
      // A ghost has no key state: its engines burn in proportion to how fast it is going.
      vis.glow = Math.min(1, out.speed / 12) * 0.9;
      engines.update(hull.ports, vis, time, true);
    },
    dispose() {
      if (hull) for (const g of hull.geometries) g.dispose();
      ghostMat.dispose(); engines.dispose(); texture.dispose();
      if (tag) { tag.material.dispose(); tagTexture?.dispose(); }
      group.removeFromParent();
    },
  };
}

export { familyOf };
