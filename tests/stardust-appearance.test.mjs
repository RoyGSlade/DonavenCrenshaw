import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanAppearance,
  presetAppearance,
  SHIP_STYLES,
  PART_SLOTS,
  ZONES,
  SAYINGS,
  SHAPES,
  sayingText,
  newLayer,
  applyLivery,
} from '../projects/Space-Shooter/systems/shipLivery.js';
test('three hull families support all 81 part combinations; cosmetic documents drop stats', () => {
  for (const { id } of SHIP_STYLES.slice(0, 3))
    for (let b = 0; b < 3; b++)
      for (let w = 0; w < 3; w++)
        for (let c = 0; c < 3; c++)
          for (let e = 0; e < 3; e++) {
            const a = presetAppearance(id);
            a.parts = { body: b, wings: w, cockpit: c, engines: e };
            a.hp = 999;
            const clean = cleanAppearance(a);
            assert.ok(clean);
            assert.ok(!('hp' in clean));
          }
});
test('old pilot saves keep colors and parts; the uploaded PNG decal is dropped', () => {
  const d = {
    image: 'data:image/png;base64,AAAA',
    x: 0.1,
    y: -0.1,
    width: 0.6,
    height: 0.4,
    angle: 25,
    opacity: 0.4,
  };
  const a = cleanAppearance({
    version: 1,
    style: 'vector',
    body: 'courier',
    engines: 'courier',
    wings: 'vector',
    cockpit: 'bulwark',
    primary: '#ffccAA',
    accent: '#44eeff',
    decal: d,
  });
  assert.equal(a.family, 'courier');
  assert.equal(a.parts.wings, 1);
  assert.equal(a.parts.cockpit, 2);
  assert.equal(a.paint.hull, '#ffccaa');
  assert.equal(a.paint.glass, '#44eeff');
  assert.deepEqual(a.layers, []);
});
test('portable artwork preserves receiving geometry and validates layer bounds', () => {
  const from = presetAppearance('needle'),
    to = presetAppearance('manta');
  to.parts.wings = 2;
  from.layers = [newLayer('bolt', '#ff2255')];
  const applied = applyLivery(to, from);
  assert.equal(applied.family, 'manta');
  assert.equal(applied.parts.wings, 2);
  assert.deepEqual(applied.paint, from.paint);
  assert.deepEqual(applied.layers, from.layers);
  for (const patch of [
    { version: 3 },
    { family: 'constructor' },
    { family: '__proto__' },
    { parts: { body: 3, wings: 0, cockpit: 0, engines: 0 } },
    { paint: { ...from.paint, hull: 'red' } },
    { layers: Array.from({ length: 33 }, () => newLayer('circle')) },
  ])
    assert.equal(cleanAppearance({ ...from, ...patch }), null);
  for (const patch of [
    { x: NaN },
    { y: Infinity },
    { width: 0 },
    { height: 2 },
    { angle: 181 },
    { opacity: -1 },
    { color: 'url(x)' },
    { kind: 'svg' },
    { visible: 1 },
    { id: '<script>' },
  ])
    assert.equal(cleanAppearance({ ...from, layers: [{ ...from.layers[0], ...patch }] }), null);
  assert.equal(cleanAppearance({ ...from, layers: [from.layers[0], from.layers[0]] }), null);
});
test('uploaded image layers are dropped and the rest of the design is kept', () => {
  const a = presetAppearance('manta');
  a.parts.wings = 1;
  const keep = newLayer('bolt', '#ff2255');
  const text = { ...newLayer('text'), saying: 'ace' };
  const upload = { ...newLayer('circle'), kind: 'png', image: 'data:image/png;base64,AAAA' };
  for (const image of [
    'data:image/png;base64,AAAA',
    'https://example.com/x.png',
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,' + 'A'.repeat(1500000),
  ]) {
    const clean = cleanAppearance({ ...a, layers: [keep, { ...upload, image }, text] });
    assert.ok(clean);
    assert.equal(clean.family, 'manta');
    assert.equal(clean.parts.wings, 1);
    assert.deepEqual(clean.layers.map((l) => l.id), [keep.id, text.id]);
    assert.ok(clean.layers.every((l) => l.kind !== 'png' && !('image' in l)));
  }
  // Image data on any layer kind, or a png layer without data, also loses the layer.
  const smuggled = { ...keep, id: 'smuggled', image: 'data:image/png;base64,AAAA' };
  const empty = { ...upload, id: 'empty', image: undefined };
  const clean = cleanAppearance({ ...a, layers: [smuggled, empty, keep] });
  assert.deepEqual(clean.layers.map((l) => l.id), [keep.id]);
  // Drawing a new PNG layer is no longer possible.
  assert.equal(SHAPES.includes('png'), false);
});
test('text decals use a fixed saying list, never saved text', () => {
  const expected = [
    ['eat-dust', 'EAT MY DUST'], ['no-brakes', 'NO BRAKES'], ['full-send', 'FULL SEND'],
    ['send-it', 'SEND IT'], ['stardust', 'STARDUST'], ['mind-the-mines', 'MIND THE MINES'],
    ['catch-me', 'CATCH ME'], ['too-slow', 'TOO SLOW'], ['late-apex', 'LATE APEX'],
    ['boost-first', 'BOOST FIRST'], ['lucky-13', 'LUCKY 13'], ['rookie', 'ROOKIE'], ['ace', 'ACE'],
    ['vanguard', 'VANGUARD'], ['nightshift', 'NIGHT SHIFT'], ['zero-g', 'ZERO G'],
    ['hold-the-line', 'HOLD THE LINE'], ['one-more-lap', 'ONE MORE LAP'],
    ['dont-blink', "DON'T BLINK"], ['gantry-drop', 'GANTRY DROP'], ['wall-rider', 'WALL RIDER'],
    ['fuel-light-on', 'FUEL LIGHT ON'], ['paid-in-shards', 'PAID IN SHARDS'],
    ['ghost-hunter', 'GHOST HUNTER'], ['personal-best', 'PERSONAL BEST'], ['fly-safe', 'FLY SAFE'],
    ['fly-fast', 'FLY FAST'], ['n01', '01'], ['n07', '07'], ['n13', '13'], ['n42', '42'],
    ['n77', '77'], ['n99', '99'],
  ];
  assert.deepEqual(SAYINGS.map((s) => [s.id, s.text]), expected);
  assert.equal(new Set(SAYINGS.map((s) => s.id)).size, SAYINGS.length);
  const a = presetAppearance();
  assert.equal(newLayer('text').saying, 'stardust');
  for (const { id, text } of SAYINGS) {
    const clean = cleanAppearance({ ...a, layers: [{ ...newLayer('text'), saying: id }] });
    assert.equal(clean.layers.length, 1);
    assert.equal(clean.layers[0].saying, id);
    assert.equal(sayingText(clean.layers[0].saying), text);
  }
  // Text always comes from the list: a stray text field is not carried through.
  const sneaky = { ...newLayer('text'), saying: 'ace', text: 'ANYTHING I WANT' };
  const [layer] = cleanAppearance({ ...a, layers: [sneaky] }).layers;
  assert.equal(layer.saying, 'ace');
  assert.equal('text' in layer, false);
  // Free text, unknown ids and prototype keys lose the layer; the design and other layers stay.
  const keep = newLayer('star', '#22ccff');
  const bad = [
    { ...newLayer('text'), id: 'free-text', text: 'HELLO', saying: undefined },
    { ...newLayer('text'), id: 'free-text-2', text: 'STARDUST', saying: undefined },
    { ...newLayer('text'), id: 'unknown', saying: 'not-a-saying' },
    { ...newLayer('text'), id: 'proto', saying: '__proto__' },
    { ...newLayer('text'), id: 'ctor', saying: 'constructor' },
    { ...newLayer('text'), id: 'number', saying: 5 },
    { ...newLayer('text'), id: 'case', saying: 'ACE' },
  ];
  a.paint.hull = '#123456';
  const clean = cleanAppearance({ ...a, layers: [...bad, keep] });
  assert.ok(clean);
  assert.equal(clean.paint.hull, '#123456');
  assert.deepEqual(clean.layers.map((l) => l.id), [keep.id]);
  assert.equal(sayingText('__proto__'), null);
  assert.equal(sayingText(undefined), null);
  // Layers still validate their geometry when they carry a saying.
  assert.equal(cleanAppearance({ ...a, layers: [{ ...newLayer('text'), x: 9 }] }), null);
});
test('paint and part bounds are validated', () => {
  const a = presetAppearance();
  for (const z of ZONES)
    assert.equal(cleanAppearance({ ...a, paint: { ...a.paint, [z]: 'bad' } }), null);
  for (const s of PART_SLOTS)
    assert.equal(cleanAppearance({ ...a, parts: { ...a.parts, [s]: -1 } }), null);
});
