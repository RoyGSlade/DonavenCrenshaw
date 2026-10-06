// The weekly track in 3D: lane, rails, start/finish gate, shards, mines,
// bouncers, sentries and a deep-space backdrop. Rendering only: it reads the
// weekly scene (engine/weekly/sim.js) and never changes it.
//
//   createWorld(THREE, layout, assets) -> { group, update(lv, time, opts), dispose(), stats }
//
// Everything the 2D renderer shows that matters to play is here too: rails
// (hard, glowing walls), mine kill halos (same radius as gfx/weeklyVfx.js),
// bouncer sweep lanes, sentry range / telegraph / aim line, the shard you are
// heading for, the finish line and whether it will count yet.
//
// The world takes over scene.background and scene.fog once it is added to a
// scene (restored on dispose). Optional GLB overrides: see world/glb.js.
import { WEEKLY_CONFIG } from '../engine/weekly/sim.js';
import { WEEKLY_RULES } from '../engine/weekly/layout.js';
import { trackFrames, detectCorners, haloRadius, bouncerSweep, distanceToTrack } from './world/laneMath.js';
import { buildLaneSurface, buildLaneOverlay, buildRails, buildCornerChevrons, buildCheckerStrip } from './world/laneGeometry.js';
import { starSlab, skyStars, laneMotes, backdropPlan } from './world/backdrop.js';
import { makeFlowTexture, makeGlowTexture, makeDotTexture, makeHaloTexture, makeRingTexture, makePlanetTexture } from './world/textures.js';
import { mineGeometry, asteroidGeometry, shardGeometry, beamGeometry, dashedRingGeometry, flatDiscGeometry, skyGeometry } from './world/props.js';
import { buildGate, buildDock, buildSentry, GATE_COLORS } from './world/structures.js';
import { propFrom, fitProp } from './world/glb.js';
import { Registry } from './world/registry.js';

const SHARD_COLORS = { blue: '#73d9ff', green: '#99e9b2', pink: '#ffa4ca', purple: '#bca5ff' };
const FLOW_PERIOD = 8;
const FLOW_SPEED = 3;           // lane units per second the flow lines drift (race direction)
const RAIL_COLOR = 0x3ff2ff, RAIL_STUN = 0xff8a1f;

export function createWorld(THREE, layout, assets = {}) {
  const R = new Registry();
  const group = new THREE.Group();
  group.name = 'stardust-world';
  const track = layout.track;
  const width = track.width, half = width / 2;
  const frames = trackFrames(track.points);
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

  const geometryFrom = (arrays, { color = 0, uv = false, normal = false } = {}) => {
    const g = R.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
    if (normal) g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
    if (color) g.setAttribute('color', new THREE.BufferAttribute(arrays.color, color));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2));
    g.setIndex(new THREE.BufferAttribute(arrays.index, 1));
    g.computeBoundingSphere();
    return g;
  };
  const additive = (params) => R.mat(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...params }));

  // Shared textures.
  const flowTex = R.tex(makeFlowTexture(THREE, { period: FLOW_PERIOD, width }));
  flowTex.anisotropy = 4;
  const glowTex = R.tex(makeGlowTexture(THREE));
  const dotTex = R.tex(makeDotTexture(THREE));
  const haloTex = R.tex(makeHaloTexture(THREE));
  const ringTex = R.tex(makeRingTexture(THREE));

  // ---------------------------------------------------------------- lighting
  const hemi = new THREE.HemisphereLight(0x8aa8ff, 0x0b1220, 1.0);
  const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
  key.position.set(-40, 80, 30);
  group.add(hemi, key, new THREE.AmbientLight(0x1a2a44, 0.8));

  // -------------------------------------------------------------------- lane
  const lane = new THREE.Group(); lane.name = 'lane'; group.add(lane);
  const surface = new THREE.Mesh(
    geometryFrom(buildLaneSurface(track.points, width, { colors: { edge: lin('#0c1e30'), center: lin('#0c1e30') } }), { color: 3, normal: true }),
    R.mat(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, specularIntensity: 0.12, emissive: 0x04101c })),
  );
  surface.name = 'lane-surface';
  lane.add(surface);
  const overlayMat = additive({ map: flowTex, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  overlayMat.blending = THREE.NormalBlending;
  const overlay = new THREE.Mesh(geometryFrom(buildLaneOverlay(track.points, width, { period: FLOW_PERIOD }), { uv: true }), overlayMat);
  overlay.renderOrder = 1; overlay.name = 'lane-flow';
  lane.add(overlay);
  const rails = buildRails(track.points, width);
  const railBody = new THREE.Mesh(
    geometryFrom(rails.body, { normal: true }),
    R.mat(new THREE.MeshStandardMaterial({ color: 0x1f3347, roughness: 0.45, metalness: 0.5, emissive: 0x08202c, side: THREE.DoubleSide })),
  );
  railBody.name = 'rails';
  const railGlowMat = additive({ vertexColors: true, color: RAIL_COLOR, side: THREE.DoubleSide, opacity: 1 });
  const railGlow = new THREE.Mesh(geometryFrom(rails.glow, { color: 4 }), railGlowMat);
  railGlow.renderOrder = 3; railGlow.name = 'rail-glow';
  lane.add(railBody, railGlow);

  // Corner chevrons on tight corners.
  const corners = detectCorners(track.points);
  const chevronMat = additive({ color: 0xffb347, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const chevrons = buildCornerChevrons(corners, width);
  const chevronMesh = new THREE.Mesh(geometryFrom(chevrons, { uv: true }), chevronMat);
  chevronMesh.renderOrder = 2; chevronMesh.name = 'corner-chevrons';
  if (corners.length) lane.add(chevronMesh);

  // Start pad ring (where the ship waits) and the finish line.
  const startRing = new THREE.Mesh(R.geo(flatDiscGeometry(THREE, 0.95)), additive({ map: ringTex, color: 0x6fd1e3, opacity: 0.55 }));
  startRing.position.set(layout.start.x, 0.03, layout.start.y); startRing.renderOrder = 2;
  lane.add(startRing);
  const portal = track.portal;
  const checker = new THREE.Mesh(
    geometryFrom(buildCheckerStrip(portal, width), { color: 3 }),
    R.mat(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
  );
  checker.name = 'finish-line'; lane.add(checker);

  // ----------------------------------------------------------- start / finish
  const gateHolder = new THREE.Group(); gateHolder.name = 'gate-holder';
  gateHolder.position.set(portal.x, 0, portal.y); gateHolder.rotation.y = -portal.angle;
  group.add(gateHolder);
  let gateLight = null;
  const finishProp = propFrom(assets, 'fuelStation');
  const fitted = finishProp && fitProp(THREE, finishProp, { target: width + 1.4, by: 'z', base: 'floor' });
  if (fitted) gateHolder.add(fitted);
  else { const gate = buildGate(THREE, R, width); gateHolder.add(gate.group); gateLight = gate.lightMat; }

  // ------------------------------------------------------------------ shards
  const shardProp = propFrom(assets, 'shard');
  const shardGeo = R.geo(shardGeometry(THREE));
  const beamGeo = R.geo(beamGeometry(THREE));
  const pickupRing = R.geo(flatDiscGeometry(THREE, WEEKLY_RULES.SHARD_PICKUP));
  const colorMats = new Map();
  const shardMat = (name) => {
    if (!colorMats.has(name)) {
      const hex = SHARD_COLORS[name] || SHARD_COLORS.blue;
      colorMats.set(name, {
        crystal: R.mat(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.2, flatShading: true })),
        glow: R.mat(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, toneMapped: false })),
        ring: additive({ map: ringTex, color: hex, opacity: 0.5 }),
        beam: additive({ vertexColors: true, color: hex, opacity: 0.8, side: THREE.DoubleSide }),
      });
    }
    return colorMats.get(name);
  };
  const shards = layout.shards.map((s, i) => {
    const m = shardMat(s.color);
    const g = new THREE.Group(); g.name = `shard-${s.id}`; g.position.set(s.x, 0, s.y);
    const body = new THREE.Group(); body.position.y = 1.0; g.add(body);
    const custom = shardProp && fitProp(THREE, shardProp, { target: 1.1, by: 'y' });
    if (custom) body.add(custom); else body.add(new THREE.Mesh(shardGeo, m.crystal));
    const glow = new THREE.Sprite(m.glow); glow.scale.setScalar(2.4); body.add(glow);
    const ring = new THREE.Mesh(pickupRing, m.ring); ring.position.y = 0.035; ring.renderOrder = 2; g.add(ring);
    const beam = new THREE.Mesh(beamGeo, m.beam); beam.scale.set(1, 7, 1); beam.renderOrder = 3; g.add(beam);
    group.add(g);
    return { id: s.id, x: s.x, y: s.y, group: g, body, glow, ring, beam, phase: i * 1.3 + s.x * 0.17 };
  });

  // ------------------------------------------------------------------- mines
  const mineProp = propFrom(assets, 'mine');
  const mineGeo = R.geo(mineGeometry(THREE));
  const mineMat = R.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45, emissive: 0x5a0a06, emissiveIntensity: 0.6, flatShading: true }));
  const coreGeo = R.geo(new THREE.SphereGeometry(1, 10, 8));
  const discGeo = R.geo(flatDiscGeometry(THREE, 1));
  const mineBeaconMat = R.mat(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, toneMapped: false }));
  const mines = layout.mines.map((m, i) => {
    const g = new THREE.Group(); g.name = `mine-${m.id}`; g.position.set(m.x, 0, m.y);
    const body = new THREE.Group(); body.position.y = 0.7; g.add(body);
    const custom = mineProp && fitProp(THREE, mineProp, { target: m.radius * 2.6, by: 'max' });
    if (custom) body.add(custom);
    else { const spikes = new THREE.Mesh(mineGeo, mineMat); spikes.scale.setScalar(m.radius); body.add(spikes); }
    const coreMat = R.mat(new THREE.MeshBasicMaterial({ color: 0xfff0dc, toneMapped: false }));
    const core = new THREE.Mesh(coreGeo, coreMat); core.scale.setScalar(m.radius * 0.22); body.add(core);
    const haloMat = additive({ map: haloTex, color: 0xff4a3a, opacity: 1 });
    const halo = new THREE.Mesh(discGeo, haloMat); halo.name = `mine-halo-${m.id}`; halo.position.y = 0.04; halo.renderOrder = 2;
    const kill = haloRadius(m, 2, WEEKLY_CONFIG.PLAYER_RADIUS);
    halo.scale.setScalar(kill); g.add(halo);
    // A wider soft glow so a mine is findable from far off (the ring above is the true kill radius).
    const beacon = new THREE.Sprite(mineBeaconMat); beacon.position.y = 0.7; beacon.scale.setScalar(2.6); g.add(beacon);
    group.add(g);
    return { m, group: g, body, core, coreMat, halo, haloMat, phase: m.x + i, kill };
  });

  // ---------------------------------------------------------------- bouncers
  const rockProp = propFrom(assets, 'asteroid');
  const rockGeos = [1, 2, 3].map((s) => R.geo(asteroidGeometry(THREE, s)));
  const rockMat = R.mat(new THREE.MeshStandardMaterial({ color: 0x6d7a86, roughness: 0.85, metalness: 0.1, emissive: 0x0b0f14, flatShading: true }));
  const laneStripGeo = R.geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const capGeo = R.geo(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2));
  const sweepMat = R.mat(new THREE.MeshBasicMaterial({ color: 0x9aabb7, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const burstMat = R.mat(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a4a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const bouncers = layout.bouncers.map((b, i) => {
    const sweep = bouncerSweep(b);
    const lane3 = new THREE.Group(); lane3.name = `sweep-${b.id}`;
    const strip = new THREE.Mesh(laneStripGeo, sweepMat); strip.scale.set(sweep.halfLength * 2 - b.radius * 2, 1, b.radius * 2); lane3.add(strip);
    for (const s of [-1, 1]) { const cap = new THREE.Mesh(capGeo, sweepMat); cap.scale.setScalar(b.radius); cap.position.set(s * (sweep.halfLength - b.radius), 0, 0); lane3.add(cap); }
    lane3.position.set(sweep.x, 0.035, sweep.y); lane3.rotation.y = -sweep.angle; lane3.renderOrder = 1;
    group.add(lane3);
    const rock = new THREE.Group(); rock.name = `rock-${b.id}`;
    const custom = rockProp && fitProp(THREE, rockProp, { target: b.radius, by: 'sphere' });
    if (custom) rock.add(custom);
    else { const mesh = new THREE.Mesh(rockGeos[i % rockGeos.length], rockMat); mesh.scale.setScalar(b.radius); rock.add(mesh); }
    rock.position.y = 0.55 + b.radius * 0.35;
    const holder = new THREE.Group(); holder.add(rock); holder.position.set(b.x, 0, b.y); group.add(holder);
    const burst = new THREE.Sprite(burstMat.clone()); R.mat(burst.material); burst.visible = false; holder.add(burst);
    return { b, lane: lane3, holder, rock, burst, spin: (i % 2 ? 1 : -1) * (0.25 + (i % 3) * 0.08), tilt: i * 1.7 };
  });

  // ---------------------------------------------------------------- sentries
  const sentryProp = propFrom(assets, 'sentry');
  const rangeGeo = R.geo(dashedRingGeometry(THREE, WEEKLY_RULES.SENTRY_RANGE, { dashes: 72, fill: 0.5, thickness: 0.16 }));
  const rangeIdle = additive({ color: 0xffad72, opacity: 0.2 });
  const rangeHot = additive({ color: 0xff6e50, opacity: 0.75 });
  const aimGeo = R.geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0));
  const aimMat = additive({ color: 0xff7848, opacity: 0.9 });
  const targetGeo = R.geo(flatDiscGeometry(THREE, 0.34));
  const targetMat = additive({ map: ringTex, color: 0xff7848, opacity: 1 });
  const sentries = layout.sentries.map((s) => {
    const built = buildSentry(THREE, R, s.radius);
    const root = built.root; root.name = `sentry-${s.id}`; root.position.set(s.x, 0, s.y); group.add(root);
    let custom = null;
    if (sentryProp) { custom = fitProp(THREE, sentryProp, { target: s.radius * 2.4, by: 'max', base: 'floor' }); if (custom) { root.clear(); built.turret.clear(); built.turret.add(custom); root.add(built.turret); built.turret.position.y = 0; } }
    const range = new THREE.Mesh(rangeGeo, rangeIdle); range.name = `sentry-range-${s.id}`; range.position.set(s.x, 0.05, s.y); range.renderOrder = 2; group.add(range);
    const aim = new THREE.Mesh(aimGeo, aimMat); aim.name = `sentry-aim-${s.id}`; aim.visible = false; aim.position.y = 0.45; aim.renderOrder = 3; group.add(aim);
    const target = new THREE.Mesh(targetGeo, targetMat); target.name = `sentry-target-${s.id}`; target.visible = false; target.position.y = 0.06; target.renderOrder = 3; group.add(target);
    const flash = new THREE.Sprite(R.mat(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a50, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false })));
    flash.position.set(s.x, 1.1, s.y); flash.scale.setScalar(2.4); group.add(flash);
    return { s, ...built, custom, range, aim, target, flash };
  });

  // ------------------------------------------------------------- fuel docks
  const stationProp = propFrom(assets, 'fuelDock');
  const docks = (layout.stations || []).map((st) => {
    const near = distanceToTrack(frames, st.x, st.y), seg = frames.segments[near.segment];
    const holder = new THREE.Group(); holder.name = `dock-${st.id}`;
    holder.position.set(st.x, 0, st.y); holder.rotation.y = -Math.atan2(seg.ty, seg.tx);
    const custom = stationProp && fitProp(THREE, stationProp, { target: 3.4, by: 'z', base: 'floor' });
    if (custom) holder.add(custom); else holder.add(buildDock(THREE, R, { haloTexture: haloTex, pickupRadius: WEEKLY_RULES.STATION_PICKUP }).group);
    group.add(holder);
    return holder;
  });

  // ---------------------------------------------------------------- backdrop
  const bounds = (() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of frames.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    return { minX: minX - half, minY: minY - half, maxX: maxX + half, maxY: maxY + half };
  })();
  const plan = backdropPlan(bounds);
  const backdrop = new THREE.Group(); backdrop.name = 'backdrop'; group.add(backdrop);
  const pointsMat = (size, extra = {}) => R.mat(new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size, sizeAttenuation: true, transparent: true, alphaTest: 0.02, depthWrite: false, fog: false, toneMapped: false, ...extra }));
  const slab = starSlab({ seed: 11, bounds });
  const slabGeo = R.geo(new THREE.BufferGeometry());
  slabGeo.setAttribute('position', new THREE.BufferAttribute(slab.positions, 3));
  slabGeo.setAttribute('color', new THREE.BufferAttribute(slab.colors, 3));
  const slabPoints = new THREE.Points(slabGeo, pointsMat(0.55)); slabPoints.frustumCulled = false; backdrop.add(slabPoints);
  const dust = laneMotes(frames, { seed: 7 });
  const dustGeo = R.geo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust.positions, 3));
  const dustPoints = new THREE.Points(dustGeo, R.mat(new THREE.PointsMaterial({ map: dotTex, color: 0x9fe8ff, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.55, alphaTest: 0.02, depthWrite: false, toneMapped: false })));
  dustPoints.frustumCulled = false; backdrop.add(dustPoints);
  for (const n of plan.nebulae) {
    const mat = additive({ map: glowTex, color: new THREE.Color(n.color[0], n.color[1], n.color[2]), opacity: n.opacity, fog: false });
    const mesh = new THREE.Mesh(R.geo(new THREE.PlaneGeometry(n.size, n.size).rotateX(-Math.PI / 2)), mat);
    mesh.position.set(n.x, n.y, n.z); mesh.renderOrder = -5; backdrop.add(mesh);
  }
  const planetTex = R.tex(makePlanetTexture(THREE));
  const planet = new THREE.Mesh(R.geo(new THREE.SphereGeometry(plan.planet.radius, 48, 32)), R.mat(new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.9, metalness: 0, emissive: 0x0a1020, fog: false })));
  planet.position.set(plan.planet.x, plan.planet.y, plan.planet.z); planet.rotation.set(1.25, 0.3, 0.5); backdrop.add(planet);
  const atmosphere = new THREE.Sprite(R.mat(new THREE.SpriteMaterial({ map: glowTex, color: 0x4a86d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22, fog: false, toneMapped: false })));
  atmosphere.position.copy(planet.position); atmosphere.scale.setScalar(plan.planet.radius * 3.1); atmosphere.renderOrder = -4; backdrop.add(atmosphere);
  const moon = new THREE.Mesh(R.geo(new THREE.SphereGeometry(plan.moon.radius, 24, 16)), R.mat(new THREE.MeshStandardMaterial({ color: 0x625b53, roughness: 1, metalness: 0, emissive: 0x0a0908, fog: false })));
  moon.position.set(plan.moon.x, plan.moon.y, plan.moon.z); backdrop.add(moon);

  // The sky follows the ship so it never parallaxes: gradient dome plus far stars.
  const sky = new THREE.Group(); sky.name = 'sky'; group.add(sky);
  const dome = new THREE.Mesh(
    R.geo(skyGeometry(THREE, 900, [[-1, lin('#02030a')], [-0.15, lin('#050a1c')], [0.05, lin('#14123a')], [0.35, lin('#07102a')], [1, lin('#02040c')]])),
    R.mat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false })),
  );
  dome.renderOrder = -10; sky.add(dome);
  const far = skyStars({ seed: 5, radius: 850 });
  const farGeo = R.geo(new THREE.BufferGeometry());
  farGeo.setAttribute('position', new THREE.BufferAttribute(far.positions, 3));
  farGeo.setAttribute('color', new THREE.BufferAttribute(far.colors, 3));
  const farPoints = new THREE.Points(farGeo, pointsMat(5, { sizeAttenuation: false, size: 2.4 })); farPoints.frustumCulled = false; farPoints.renderOrder = -9; sky.add(farPoints);

  // ------------------------------------------------------------ scene hookup
  let scene = null, saved = null;
  const hookScene = () => {
    const s = group.parent;
    if (!s || s === scene) return;
    if (scene) restoreScene();
    scene = s;
    saved = { background: s.background, fog: s.fog };
    s.background = new THREE.Color(0x02040a);
    s.fog = new THREE.FogExp2(0x050b1a, 0.006);
  };
  const restoreScene = () => {
    if (!scene) return;
    scene.background = saved.background; scene.fog = saved.fog;  // 3d-local: the three.js scene, not the race scene
    scene = null; saved = null;
  };

  // ------------------------------------------------------------------ update
  const tmpColor = new THREE.Color(), railBase = new THREE.Color(RAIL_COLOR), railStun = new THREE.Color(RAIL_STUN);
  const lockedColor = new THREE.Color(GATE_COLORS.locked), readyColor = new THREE.Color(GATE_COLORS.ready);
  const nextShardOf = (lv) => {
    const list = lv.shardList || layout.shards, got = lv.shards instanceof Set ? lv.shards : new Set();
    const t = lv.nearestShardTarget;
    if (t && t.kind !== 'gate') {
      const hit = list.find((s) => Math.abs(s.x - 0.5 - t.x) < 1e-3 && Math.abs(s.y - 0.5 - t.y) < 1e-3);
      if (hit) return hit.id;
    }
    return list.find((s) => !got.has(s.id))?.id ?? null;
  };

  function update(lv, time = 0, opts = {}) {
    if (!lv) return;
    hookScene();
    const calm = !!opts.reducedMotion;
    const t = calm ? 0 : time;
    const pose = lv.viewPlayer || lv.player;
    if (pose) sky.position.set(pose.x, 0, pose.y);
    const collected = lv.shards instanceof Set ? lv.shards : new Set();
    const all = collected.size >= (lv.shardList || layout.shards).length;
    const pulse = (rate, phase = 0) => (calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * rate + phase));

    // Flow lines drift in the race direction.
    flowTex.offset.x = calm ? 0 : -((t * FLOW_SPEED) / FLOW_PERIOD) % 1;

    // Rails turn amber while the ship is stunned from a rail hit.
    const stunned = (pose?.stunTimer || 0) > 0;
    railGlowMat.color.copy(stunned ? tmpColor.copy(railStun).lerp(railBase, calm ? 0 : 0.5 + 0.5 * Math.sin(t * 40)) : railBase);
    chevronMat.opacity = 0.4 + 0.3 * pulse(3);

    // Gate: amber until every shard is collected, then green and pulsing (the line counts).
    if (gateLight) gateLight.color.copy(all ? readyColor : lockedColor).multiplyScalar(all ? 0.8 + 0.4 * pulse(5) : 0.9);

    // Shards: gone when collected; the next one is marked.
    const next = nextShardOf(lv);
    for (const s of shards) {
      const got = collected.has(s.id);
      s.group.visible = !got;
      if (got) continue;
      const isNext = s.id === next;
      s.body.position.y = 1.0 + (calm ? 0 : Math.sin(t * 2.2 + s.phase) * 0.12);
      s.body.rotation.y = calm ? s.phase : t * 1.2 + s.phase;
      s.beam.visible = isNext;
      s.ring.material.opacity = isNext ? 0.5 + 0.4 * pulse(4, s.phase) : 0.28;
      s.glow.material.opacity = isNext ? 0.95 : 0.65;
    }

    // Mines: kill halo radius follows the physics version of this attempt, like the 2D view.
    const physics = lv.physics ?? 2;
    for (const m of mines) {
      const p = pulse(5, m.phase);
      m.haloMat.opacity = 0.5 + p * 0.5;
      m.coreMat.color.setScalar(0.65 + 0.35 * p);
      m.body.rotation.y = calm ? 0 : t * 0.4 + m.phase;
      const kill = haloRadius(m.m, physics, WEEKLY_CONFIG.PLAYER_RADIUS);
      if (kill !== m.kill) { m.kill = kill; m.halo.scale.setScalar(kill); }
    }

    // Bouncers: interpolated view positions, hidden when destroyed (with a short flash).
    const hazards = lv.viewHazards || lv.hazards || [];
    bouncers.forEach((bo, i) => {
      const h = hazards[i];
      const alive = !h || h.hp > 0;
      bo.rock.visible = alive; bo.lane.visible = alive;
      if (h) bo.holder.position.set(h.x, 0, h.y);
      if (alive) { bo.rock.rotation.set(0.3 * Math.sin(bo.tilt), bo.tilt + (calm ? 0 : t * bo.spin), 0.25 * Math.cos(bo.tilt)); bo.burst.visible = false; return; }
      const age = (lv.elapsed || 0) - (h.destroyedAt ?? -100);
      bo.burst.visible = age >= 0 && age < 0.6;
      if (bo.burst.visible) { const k = age / 0.6; bo.burst.scale.setScalar(bo.b.radius * (calm ? 4 : 2 + 7 * k)); bo.burst.material.opacity = 1 - k; bo.burst.position.y = 0.8; }
    });

    // Sentries: range ring, telegraph and aim line, as in weeklyVfx.
    const live = lv.sentries || layout.sentries;
    sentries.forEach((se, i) => {
      const s = live[i] || se.s;
      const hot = s.state === 'telegraph' || !!s.slow;
      const locking = s.state === 'telegraph';
      se.range.material = hot ? rangeHot : rangeIdle;
      se.turret.rotation.y = -(s.angle ?? se.s.angle);
      if (!se.custom) {
        se.coreMat.color.setHex(hot ? 0xfff1a4 : 0xff9447);
        se.barrelMat.color.setHex(hot ? 0xffb38a : 0x8b99a3);
        se.barrelMat.emissive.setHex(hot ? 0x7a2a10 : 0x000000);
      }
      const aimOk = locking && Number.isFinite(s.aimX) && Number.isFinite(s.aimY);
      se.aim.visible = aimOk; se.target.visible = aimOk;
      if (aimOk) {
        const dx = s.aimX - s.x, dy = s.aimY - s.y, len = Math.hypot(dx, dy);
        se.aim.position.set(s.x, 0.45, s.y); se.aim.rotation.y = -Math.atan2(dy, dx); se.aim.scale.set(len, 1, 0.14);
        se.target.position.set(s.aimX, 0.06, s.aimY);
        se.target.rotation.y = calm ? 0 : t * 3;
      }
      se.flash.material.opacity = locking ? 0.55 + 0.45 * pulse(24, i) : hot ? 0.3 : 0.2;
    });
  }

  function dispose() {
    restoreScene();
    group.parent?.remove(group);
    group.clear();
    return R.disposeAll();
  }

  const stats = { corners: corners.length, railLength: rails.railLength, railRuns: rails.runs.length, shards: shards.length, mines: mines.length, bouncers: bouncers.length, sentries: sentries.length, docks: docks.length, customProps: ['fuelStation', 'fuelDock', 'mine', 'asteroid', 'shard', 'sentry'].filter((k) => propFrom(assets, k)) };
  return { group, update, dispose, stats };
}
