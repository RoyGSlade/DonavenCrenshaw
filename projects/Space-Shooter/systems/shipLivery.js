/** Portable cosmetic document. Shared verbatim with the Hub validator. No DOM. */
export const ZONES = ['hull', 'wings', 'nose', 'trim', 'glass', 'engines'];
export const PART_SLOTS = ['body', 'wings', 'cockpit', 'engines'];
export const MAX_LAYERS = 32;
export const SHAPES = [
  'circle',
  'ring',
  'triangle',
  'chevron',
  'bolt',
  'flame',
  'star',
  'slash',
  'hex',
  'skull',
  'text',
];
/** Fixed sayings for text decals. Players pick an id; the text is never taken from saved data. */
export const SAYINGS = [
  { id: 'eat-dust', text: 'EAT MY DUST' },
  { id: 'no-brakes', text: 'NO BRAKES' },
  { id: 'full-send', text: 'FULL SEND' },
  { id: 'send-it', text: 'SEND IT' },
  { id: 'stardust', text: 'STARDUST' },
  { id: 'mind-the-mines', text: 'MIND THE MINES' },
  { id: 'catch-me', text: 'CATCH ME' },
  { id: 'too-slow', text: 'TOO SLOW' },
  { id: 'late-apex', text: 'LATE APEX' },
  { id: 'boost-first', text: 'BOOST FIRST' },
  { id: 'lucky-13', text: 'LUCKY 13' },
  { id: 'rookie', text: 'ROOKIE' },
  { id: 'ace', text: 'ACE' },
  { id: 'vanguard', text: 'VANGUARD' },
  { id: 'nightshift', text: 'NIGHT SHIFT' },
  { id: 'zero-g', text: 'ZERO G' },
  { id: 'hold-the-line', text: 'HOLD THE LINE' },
  { id: 'one-more-lap', text: 'ONE MORE LAP' },
  { id: 'dont-blink', text: "DON'T BLINK" },
  { id: 'gantry-drop', text: 'GANTRY DROP' },
  { id: 'wall-rider', text: 'WALL RIDER' },
  { id: 'fuel-light-on', text: 'FUEL LIGHT ON' },
  { id: 'paid-in-shards', text: 'PAID IN SHARDS' },
  { id: 'ghost-hunter', text: 'GHOST HUNTER' },
  { id: 'personal-best', text: 'PERSONAL BEST' },
  { id: 'fly-safe', text: 'FLY SAFE' },
  { id: 'fly-fast', text: 'FLY FAST' },
  { id: 'n01', text: '01' },
  { id: 'n07', text: '07' },
  { id: 'n13', text: '13' },
  { id: 'n42', text: '42' },
  { id: 'n77', text: '77' },
  { id: 'n99', text: '99' },
];
export const DEFAULT_SAYING = 'stardust';
/** Text for a saying id, or null. Lookup by value in the list, so ids like "__proto__" never match. */
export function sayingText(id) {
  return typeof id === 'string' ? (SAYINGS.find((s) => s.id === id)?.text ?? null) : null;
}
export const SHIP_STYLES = [
  {
    id: 'needle',
    name: 'Needle',
    description: 'Twin spars. Long reach. A knife through the dark.',
    colors: ['#b8b8b8', '#c2c2c2', '#a6a6a6', '#4c4c4c', '#47d8f5', '#8c8c8c'],
  },
  {
    id: 'manta',
    name: 'Manta',
    description: 'Wide crescent. A presence that fills the hangar.',
    colors: ['#b8b8b8', '#c2c2c2', '#a6a6a6', '#4c4c4c', '#47d8f5', '#8c8c8c'],
  },
  {
    id: 'wisp',
    name: 'Wisp',
    description: 'Curved petals. Smooth, strange, and fast-looking.',
    colors: ['#b8b8b8', '#c2c2c2', '#a6a6a6', '#4c4c4c', '#47d8f5', '#8c8c8c'],
  },
  {
    id: 'courier',
    name: 'Original Courier',
    description: 'Your original craft and saved paint.',
    colors: ['#8797a5', '#8797a5', '#8797a5', '#8797a5', '#46dfed', '#8797a5'],
  },
];
export const PART_CHOICES = {
  needle: {
    body: ['Spear / long spine', 'Dart / short & wide', 'Bastion / armored shoulders'],
    wings: ['Lance / twin needles', 'Talon / armored hooks', 'Razor / swept blades'],
    cockpit: ['Lens / smooth capsule', 'Diamond / angular canopy', 'Split / bridge frame'],
    engines: ['Torch / single nozzle', 'Twin / paired thrusters', 'Furnace / wide exhaust'],
  },
  manta: {
    body: ['Keel / deep prow', 'Skate / compact deck', 'Citadel / armored shoulders'],
    wings: ['Crescent / embracing tips', 'Scythe / broad armored sweep', 'Delta / swept kite'],
    cockpit: ['Lens / smooth capsule', 'Diamond / angular canopy', 'Split / bridge frame'],
    engines: ['Twin / inset drives', 'Pulse / closed drive pods', 'Quad / four nozzles'],
  },
  wisp: {
    body: ['Petal / long teardrop', 'Seed / compact core', 'Carapace / armored shoulders'],
    wings: ['Veil / trailing petals', 'Lotus / flared lobes', 'Thorn / forward hooks'],
    cockpit: ['Lens / smooth capsule', 'Diamond / angular canopy', 'Split / bridge frame'],
    engines: ['Whisper / paired vents', 'Bloom / armored drive pods', 'Comet / central drive'],
  },
  courier: {
    body: ['Courier'],
    wings: ['Courier', 'Vector', 'Bulwark'],
    cockpit: ['Courier', 'Vector', 'Bulwark'],
    engines: ['Courier'],
  },
};
const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const within = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function presetAppearance(family = 'needle') {
  const style = SHIP_STYLES.find((s) => s.id === family) || SHIP_STYLES[0];
  return {
    version: 2,
    family: style.id,
    parts: Object.fromEntries(PART_SLOTS.map((s) => [s, 0])),
    paint: Object.fromEntries(ZONES.map((z, i) => [z, style.colors[i]])),
    layers: [],
  };
}
function migrate(v) {
  if (
    v.version !== 1 ||
    !['courier', 'vector', 'bulwark', 'needle', 'outrider'].includes(v.style) ||
    v.body !== 'courier' ||
    v.engines !== 'courier' ||
    !hex(v.primary) ||
    !hex(v.accent)
  )
    return null;
  const old = ['courier', 'vector', 'bulwark'];
  if (!old.includes(v.wings) || !old.includes(v.cockpit)) return null;
  const a = presetAppearance('courier');
  a.parts.wings = old.indexOf(v.wings);
  a.parts.cockpit = old.indexOf(v.cockpit);
  for (const z of ZONES) a.paint[z] = z === 'glass' ? v.accent : v.primary;
  // Uploaded images are no longer supported: a legacy decal is dropped, colors and parts stay.
  return a;
}
export function cleanAppearance(input) {
  if (!object(input)) return null;
  const v = input.version === 1 ? migrate(input) : input;
  if (
    !v ||
    v.version !== 2 ||
    typeof v.family !== 'string' ||
    !Object.hasOwn(PART_CHOICES, v.family) ||
    !object(v.parts) ||
    !object(v.paint) ||
    !Array.isArray(v.layers) ||
    v.layers.length > MAX_LAYERS
  )
    return null;
  if (
    !PART_SLOTS.every(
      (s) =>
        Number.isInteger(v.parts[s]) &&
        v.parts[s] >= 0 &&
        v.parts[s] < PART_CHOICES[v.family][s].length,
    ) ||
    !ZONES.every((z) => hex(v.paint[z]))
  )
    return null;
  const layers = [],
    ids = new Set();
  for (const d of v.layers) {
    // Uploaded artwork is not supported: drop the layer, keep the rest of the design.
    if (object(d) && (d.kind === 'png' || Object.hasOwn(d, 'image'))) continue;
    if (
      !object(d) ||
      typeof d.id !== 'string' ||
      !/^[-\w]{1,48}$/.test(d.id) ||
      ids.has(d.id) ||
      !SHAPES.includes(d.kind) ||
      !hex(d.color) ||
      !within(d.x, -0.65, 0.65) ||
      !within(d.y, -0.65, 0.65) ||
      !within(d.width, 0.02, 1.8) ||
      !within(d.height, 0.02, 1.8) ||
      !within(d.angle, -180, 180) ||
      !within(d.opacity, 0, 1) ||
      !['flipX', 'flipY', 'visible', 'recolor'].every((k) => typeof d[k] === 'boolean')
    )
      return null;
    const l = {
      id: d.id,
      kind: d.kind,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      angle: d.angle,
      opacity: d.opacity,
      color: d.color.toLowerCase(),
      flipX: d.flipX,
      flipY: d.flipY,
      visible: d.visible,
      recolor: d.recolor,
    };
    if (d.kind === 'text') {
      // Only a saying from the fixed list survives; free text loses its layer, not the design.
      if (sayingText(d.saying) === null) continue;
      l.saying = d.saying;
    }
    ids.add(d.id);
    layers.push(l);
  }
  return {
    version: 2,
    family: v.family,
    parts: Object.fromEntries(PART_SLOTS.map((s) => [s, v.parts[s]])),
    paint: Object.fromEntries(ZONES.map((z) => [z, v.paint[z].toLowerCase()])),
    layers,
  };
}
export function newLayer(kind, color = '#ffffff') {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    x: 0,
    y: 0,
    width: 0.25,
    height: 0.25,
    angle: 0,
    opacity: 1,
    color,
    flipX: false,
    flipY: false,
    visible: true,
    recolor: true,
    ...(kind === 'text' ? { saying: DEFAULT_SAYING } : {}),
  };
}
/** Reuse paint + normalized artwork while preserving the receiving ship's parts. */
export function applyLivery(target, source) {
  const a = cleanAppearance(target),
    b = cleanAppearance(source);
  if (!a || !b) return null;
  a.paint = b.paint;
  a.layers = b.layers;
  return a;
}
