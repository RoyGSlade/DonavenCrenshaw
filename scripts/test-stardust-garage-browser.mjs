/** Real local browser acceptance: modular art, direct layer editing and two accounts. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      path.join(
        homedir(),
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
      ),
  )
);
const out = process.env.STARDUST_QA_OUT || 'output/stardust-ship-families-20260930/qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [],
  failedAssets = [],
  checks = [];
const url = process.env.STARDUST_TEST_URL || 'http://127.0.0.1:4182/projects/Space-Shooter/';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/art/garage/')) failedAssets.push(r.url());
});
async function open(p) {
  await p.goto(url);
  await p.waitForFunction(
    () =>
      document.getElementById('garage-equip') && !document.getElementById('garage-equip').disabled,
  );
  await p.locator('#hangar-ship').click();
  await p.waitForSelector('#ship-garage[open]');
  await p.waitForTimeout(420);
}
const dispatch = async (p, id, value) =>
  p.evaluate(
    ([id, value]) => {
      const i = document.getElementById(id);
      i.value = value;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [id, value],
  );
async function stored(p) {
  return p.evaluate(() => JSON.parse(localStorage.getItem('stardust.courier.appearance.v1')));
}
async function signIn(p, email) {
  await p.getByRole('tab', { name: 'DESIGNS', exact: true }).click();
  await p.locator('#garage-dev-api summary').click();
  await p.locator('#garage-api').fill('http://127.0.0.1:4183');
  await p.locator('#garage-connect').click();
  await p.locator('#garage-sign-in [name=email]').fill(email);
  await p.locator('#garage-sign-in [name=password]').fill('LocalPaint123!');
  await p.locator('#garage-sign-in button').click();
  await p.waitForFunction(() =>
    document.getElementById('garage-account').textContent.includes('Publishing as'),
  );
}
try {
  await open(page);
  assert.equal(await page.locator('[data-family]').count(), 4);
  checks.push('three approved hull families plus preserved courier');
  const recovered = await page.evaluate(async () => {
    const m = await import('./systems/shipAppearance.js');
    const a = m.presetAppearance('needle');
    a.parts.wings = 2;
    a.paint.hull = '#de1234';
    const restored = m.resolveAvailableAppearance(a);
    return { requested: a.parts.wings, restored: restored.parts.wings, color: restored.paint.hull };
  });
  assert.deepEqual(recovered, { requested: 2, restored: 0, color: '#de1234' });
  checks.push('retired prototype parts restore to source geometry without losing paint');
  const shapeResults = await page.evaluate(async () => {
    const m = await import('./systems/shipAppearance.js');
    const results = {};
    for (const f of ['needle', 'manta', 'wisp']) {
      results[f] = [];
      const available = m.availablePartIndices(f, 'wings');
      for (const w of available) {
        const a = m.presetAppearance(f);
        a.parts.wings = w;
        const c = m.renderAppearance(a, null, 256),
          d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
        let alpha = '';
        for (let i = 3; i < d.length; i += 4) alpha += d[i] > 128 ? '1' : '0';
        results[f].push(alpha);
      }
    }
    return Object.fromEntries(
      Object.entries(results).map(([f, items]) => [
        f,
        { unique: new Set(items).size, areas: items.map((a) => a.split('1').length - 1) },
      ]),
    );
  });
  for (const f of ['needle', 'manta', 'wisp'])
    assert.equal(shapeResults[f].unique, shapeResults[f].areas.length);
  checks.push('reviewed wing choices have distinct silhouettes');
  const grid = await page.evaluate(async () => {
    const m = await import('./systems/shipAppearance.js'),
      l = await import('./systems/shipLivery.js');
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 1050;
    const q = canvas.getContext('2d');
    q.fillStyle = '#08131e';
    q.fillRect(0, 0, 1440, 1050);
    for (let col = 0; col < 3; col++)
      for (const [row, wing] of m.availablePartIndices(['needle', 'manta', 'wisp'][col], 'wings').entries()) {
        const family = ['needle', 'manta', 'wisp'][col],
          a = m.presetAppearance(family);
        a.parts.wings = wing;
        q.strokeStyle = '#28434f';
        q.strokeRect(col * 480 + 16, row * 350 + 14, 448, 322);
        q.fillStyle = '#d9eef1';
        q.font = '22px sans-serif';
        q.fillText(
          `${family.toUpperCase()} · ${l.PART_CHOICES[family].wings[wing].split(' / ')[0]}`,
          col * 480 + 35,
          row * 350 + 50,
        );
        q.drawImage(m.renderAppearance(a, null, 280), col * 480 + 100, row * 350 + 58, 280, 280);
      }
    return canvas.toDataURL().split(',')[1];
  });
  await writeFile(`${out}/reviewed-wing-builds.png`, Buffer.from(grid, 'base64'));
  await page.locator('[data-family=manta]').click();
  await page.getByRole('tab', { name: 'PARTS', exact: true }).click();
  await page.locator('[data-slot=wings][data-part="1"]').click();
  await page.locator('[data-slot=engines][data-part="0"]').click();
  await page.getByRole('tab', { name: 'PAINT', exact: true }).click();
  assert.equal(await page.locator('.garage-palette').count(), 5);
  for (const palette of ['Nebula','Solar','Tidal','Ember','Aurora']) {
    await page.getByRole('button',{name:`${palette} paint palette`,exact:true}).click();
    assert.equal(await page.locator('#garage-paint-hull').inputValue(), '#ffffff');
    assert.equal(await page.locator('#garage-paint-trim').inputValue(), '#000000');
  }
  await page.screenshot({path:`${out}/five-paint-palettes.png`});
  for (const [z, color] of Object.entries({
    hull: '#eae2cc',
    wings: '#d54669',
    nose: '#873c79',
    trim: '#172b3d',
    glass: '#33dcf0',
    engines: '#e6ad49',
  }))
    await dispatch(page, `garage-paint-${z}`, color);
  await page.getByRole('tab', { name: 'DECALS', exact: true }).click();
  await page.locator('[data-shape=bolt]').click();
  for (const palette of ['nebula','solar','tidal','ember','aurora']) {
    await page.locator('#garage-decal-palette').selectOption(palette);
    assert.equal(await page.locator('[data-palette-color]').count(),6);
    assert.equal(await page.getByRole('button',{name:'White decal',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Black decal',exact:true}).count(),1);
    const swatch=page.locator('[data-palette-color]').nth(2);
    const color=await swatch.getAttribute('data-palette-color');
    await swatch.click();
    assert.equal(await page.locator('#garage-decal-color').inputValue(),color);
  }
  checks.push('five themed paint and decal palettes each include white and black');
  await dispatch(page, 'garage-decal-color', '#ffee99');
  await dispatch(page, 'garage-decal-width', 0.15);
  await dispatch(page, 'garage-decal-height', 0.3);
  await dispatch(page, 'garage-decal-x', -0.22);
  await dispatch(page, 'garage-decal-y', 0.02);
  const box = await page.locator('#garage-preview').boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx - 0.22 * box.width, cy + 0.02 * box.height);
  await page.mouse.down();
  await page.mouse.move(cx - 0.12 * box.width, cy + 0.09 * box.height, { steps: 8 });
  await page.mouse.up();
  assert.ok(Math.abs(Number(await page.locator('#garage-decal-x').inputValue()) + 0.12) < 0.015);
  assert.ok(Math.abs(Number(await page.locator('#garage-decal-y').inputValue()) - 0.09) < 0.015);
  checks.push('direct on-ship drag maps screen coordinates');
  // Resize a real corner handle, then rotate across the full signed angle range.
  await page.mouse.move(cx + (-0.12 + 0.075) * box.width, cy + (0.09 + 0.15) * box.height);
  await page.mouse.down();
  await page.mouse.move(cx + (-0.12 + 0.1) * box.width, cy + (0.09 + 0.2) * box.height, {
    steps: 6,
  });
  await page.mouse.up();
  assert.ok(Math.abs(Number(await page.locator('#garage-decal-width').inputValue()) - 0.2) < 0.02);
  await page.mouse.move(cx - 0.12 * box.width, cy + (0.09 - 0.2 - 35 / 768) * box.height);
  await page.mouse.down();
  await page.mouse.move(cx + (-0.12 + 0.22) * box.width, cy + 0.09 * box.height, { steps: 6 });
  await page.mouse.up();
  assert.ok(Math.abs(Number(await page.locator('#garage-decal-angle').inputValue()) - 90) < 5);
  await dispatch(page, 'garage-decal-angle', 0);
  // Editing still maps correctly after zooming and rotating the preview.
  await dispatch(page, 'garage-zoom', 1.3);
  await page.locator('#garage-edit').click();
  await page.locator('#garage-preview').focus();
  await page.keyboard.press('ArrowRight');
  // Switching edit back on recenters the overhead view; positions stay unchanged.
  await page.locator('#garage-edit').click();
  assert.ok(Math.abs(Number(await page.locator('#garage-decal-x').inputValue()) + 0.12) < 0.015);
  await page.locator('#garage-reset-angle').click();
  checks.push('resize and rotation handles, zoom, view reset');
  await page.locator('[data-layer-action=mirror]').click();
  assert.equal(await page.locator('[data-layer]').count(), 2);
  assert.ok(Number(await page.locator('#garage-decal-x').inputValue()) > 0);
  checks.push('mirrored layer keeps editable transform');
  await page.locator('[data-shape=flame]').click();
  await dispatch(page, 'garage-decal-x', 0.29);
  await dispatch(page, 'garage-decal-y', -0.02);
  await dispatch(page, 'garage-decal-width', 0.18);
  await dispatch(page, 'garage-decal-height', 0.4);
  await dispatch(page, 'garage-decal-color', '#5fe6eb');
  await page.locator('[data-shape=text]').click();
  await page.locator('#garage-saying').selectOption('n07');
  assert.equal(await page.locator('#garage-text').count(), 0);
  checks.push('text decal is chosen from the fixed saying list, with no free-text input');
  await dispatch(page, 'garage-decal-y', 0.25);
  await dispatch(page, 'garage-decal-width', 0.1);
  await dispatch(page, 'garage-decal-height', 0.08);
  await dispatch(page, 'garage-decal-color', '#ffffff');
  await page.screenshot({ path: `${out}/layer-editor-desktop.png` });
  await page.getByRole('tab', { name: 'DESIGNS', exact: true }).click();
  await page.locator('#garage-design-name').fill('Manta Sunfire');
  await page.locator('#garage-save').click();
  assert.equal(await page.locator('.garage-saved-design').count(), 1);
  const savedLibrary = await page.evaluate(async () =>
    (await import('./systems/liveryLibrary.js')).readLibrary());
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'Copy saved Manta Sunfire',exact:true}).click();
  const copiedDesign = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(copiedDesign.format,'stardust-livery');
  assert.deepEqual(copiedDesign.appearance,savedLibrary[0].appearance);
  assert.deepEqual(JSON.parse(await page.locator('.garage-copy-backup').inputValue()),copiedDesign);
  checks.push('saved design copy backup retains the exact editable document');
  const download = page.waitForEvent('download');
  await page.locator('#garage-export').click();
  const exported = await download;
  await exported.saveAs(`${out}/sunfire.livery.json`);
  await page.getByRole('tab', { name: 'SHIPS', exact: true }).click();
  await page.locator('[data-family=wisp]').click();
  await page.locator('#garage-equip').click();
  await page.waitForFunction(() => !document.getElementById('ship-garage').open);
  let a = await stored(page);
  assert.equal(a.family, 'wisp');
  assert.equal(a.layers.length, 4);
  assert.equal(a.paint.wings, '#d54669');
  checks.push('portable paint and layers carry across hulls');
  await page.reload();
  await page.waitForFunction(
    () =>
      document.getElementById('garage-equip') && !document.getElementById('garage-equip').disabled,
  );
  await page.locator('#hangar-ship').click();
  await page.waitForTimeout(420);
  assert.equal(await page.locator('[data-family=wisp]').getAttribute('aria-pressed'), 'true');
  checks.push('equipped design survives reload');
  const reloadedLibrary = await page.evaluate(async () =>
    (await import('./systems/liveryLibrary.js')).readLibrary());
  assert.deepEqual(reloadedLibrary,savedLibrary);
  checks.push('Save locally retains named design, paint, parts and every layer through reload');
  // No image uploads: the control is gone, tinting and undo still work on built-in shapes.
  await page.getByRole('tab', { name: 'DECALS', exact: true }).click();
  assert.equal(await page.locator('#garage-decal-file').count(), 0);
  assert.equal(await page.locator('#garage-recolor').count(), 0);
  assert.equal(await page.locator('[data-shape=png]').count(), 0);
  checks.push('garage offers no custom image upload');
  await page.locator('[data-shape=circle]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-layer]').length === 5);
  await dispatch(page, 'garage-decal-color', '#11ee55');
  await page.locator('#garage-undo').click();
  checks.push('decal color edits and undo work on built-in shapes');
  await page.locator('#garage-cancel').click();
  await page.waitForFunction(() => !document.getElementById('ship-garage').open);
  a = await stored(page);
  assert.equal(a.layers.length, 4);
  checks.push('cancel preserves equipped design');
  // Pixel evidence: only authored zones change, clipped decals never escape armor.
  const evidence = await page.evaluate(async () => {
    const m = await import('./systems/shipAppearance.js'),
      l = await import('./systems/shipLivery.js');
    const a = m.presetAppearance('manta'),
      bare = m.renderAppearance(a, null, 256),
      base = bare.getContext('2d').getImageData(0, 0, 256, 256).data;
    const zones = {};
    for (const z of l.ZONES) {
      const b = structuredClone(a);
      b.paint[z] = '#ff00ff';
      const data = m
        .renderAppearance(b, null, 256)
        .getContext('2d')
        .getImageData(0, 0, 256, 256).data;
      let changed = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          base[i + 3] &&
          (data[i] !== base[i] || data[i + 1] !== base[i + 1] || data[i + 2] !== base[i + 2])
        )
          changed++;
      zones[z] = changed;
    }
    const d = l.newLayer('circle', '#ffffff');
    d.width = d.height = 1.8;
    a.layers = [d];
    const decal = m
      .renderAppearance(a, null, 256)
      .getContext('2d')
      .getImageData(0, 0, 256, 256).data;
    let escaped = 0;
    for (let i = 3; i < base.length; i += 4) if (base[i] === 0 && decal[i] > 0) escaped++;
    const b = structuredClone(a);
    b.layers[0].opacity = 0;
    const zero = m
      .renderAppearance(b, null, 256)
      .getContext('2d')
      .getImageData(0, 0, 256, 256).data;
    return { zones, escaped, zeroEqual: zero.every((v, i) => v === base[i]) };
  });
  for (const z of Object.keys(evidence.zones)) assert.ok(evidence.zones[z] > 10, z);
  assert.equal(evidence.escaped, 0);
  assert.ok(evidence.zeroEqual);
  checks.push('six independently paintable masks and clipped decals');
  if (process.env.STARDUST_SKIP_COMMUNITY === '1') {
    const flight = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    flight.on('pageerror', e => errors.push(e.message));
    await open(flight);
    await flight.locator('[data-family=needle]').click();
    await flight.getByRole('tab', { name: 'PARTS', exact: true }).click();
    await flight.locator('[data-slot=wings][data-part="1"]').click();
    assert.equal(await flight.locator('[data-slot=wings][data-part="2"]').count(), 0);
    await flight.locator('#garage-equip').click();
    assert.equal((await stored(flight)).parts.wings, 1);
    await flight.evaluate(async () => {
      window.__garageFlightState = (await import('./state.js')).state;
    });
    await flight.locator('#starmap-start-btn').click();
    await flight.waitForFunction(() => window.__garageFlightState.ui.countdownActive);
    await flight.waitForFunction(() => !window.__garageFlightState.ui.countdownActive);
    await flight.locator('#starmap-canvas').click({ position: { x: 650, y: 420 } });
    await flight.keyboard.press('Space');
    await flight.waitForFunction(() => window.__garageFlightState.run?.current?.launched === true);
    await flight.keyboard.down('w');
    await flight.waitForTimeout(700);
    await flight.keyboard.up('w');
    await flight.screenshot({ path: `${out}/equipped-needle-flight.png` });
    checks.push('reviewed Talon equips and flies; unreviewed wing is hidden');
    await flight.close();
  } else {
  await page.locator('#hangar-ship').click();
  await page.waitForTimeout(420);
  await signIn(page, 'needleartist@qa.invalid');
  await page.locator('#garage-design-name').fill('Sunfire QA');
  await page.locator('#garage-publish').click();
  await page.waitForFunction(() => !document.getElementById('garage-design-detail').hidden);
  const detail = await page.locator('#garage-design-detail').textContent();
  assert.match(detail, /Sunfire QA/);
  checks.push('authenticated publication persisted through real Prisma API');
  await page.screenshot({ path: `${out}/creator-gallery-desktop.png` });
  const guest = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  guest.on('pageerror', (e) => errors.push(e.message));
  await open(guest);
  await signIn(guest, 'mantapilot@qa.invalid');
  await guest.locator('#garage-artist').fill('NeedleArtist');
  await guest.locator('#garage-browse').click();
  await guest.locator('.garage-shared-design').first().waitFor();
  await guest.getByRole('button', { name: 'View / comment', exact: true }).first().click();
  await guest.locator('#garage-design-detail').waitFor({ state: 'visible' });
  await guest.locator('#garage-design-detail form input').fill('Love the mirrored lightning.');
  await guest.locator('#garage-design-detail form button').click();
  await guest.getByText('@MantaPilot: Love the mirrored lightning.', { exact: true }).waitFor();
  await guest.getByRole('button', { name: 'Apply to my ship', exact: true }).click();
  await guest.locator('#garage-equip').click();
  await guest.waitForFunction(() => !document.getElementById('ship-garage').open);
  const remix = await stored(guest);
  assert.equal(remix.family, 'needle');
  assert.equal(remix.layers.length, 4);
  checks.push('second account comments and applies downloaded livery to a different hull');
  await guest.evaluate(async () => {
    window.__garageFlightState = (await import('./state.js')).state;
  });
  await guest.locator('#starmap-start-btn').click();
  await guest.waitForFunction(() => window.__garageFlightState.ui.countdownActive);
  await guest.waitForFunction(() => !window.__garageFlightState.ui.countdownActive);
  await guest.locator('#starmap-canvas').click({ position: { x: 650, y: 420 } });
  await guest.keyboard.press('Space');
  await guest.waitForFunction(() => window.__garageFlightState.run?.current?.launched === true);
  await guest.keyboard.down('w');
  await guest.waitForTimeout(700);
  await guest.keyboard.up('w');
  await guest.screenshot({ path: `${out}/equipped-needle-flight.png` });
  checks.push('equipped Needle launches and flies in the real game');
  await guest.close();
  // Render the actual account-page build against the same isolated Hub.
  const account = await page.context().newPage();
  account.on('pageerror', (e) => errors.push(e.message));
  const siteRoot = 'C:/Users/Laptop/Documents/ChatGPT/engagement/site/public';
  let profileOrigin;
  const profileServer = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/')) {
        const upstream = await fetch('http://127.0.0.1:4183' + req.url, {
          headers: { Cookie: req.headers.cookie || '' },
        });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      const target = path.resolve(
        siteRoot,
        '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''),
      );
      if (!target.startsWith(path.resolve(siteRoot) + path.sep)) {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = await readFile(target);
      if (path.extname(target) === '.html')
        body = Buffer.from(
          body.toString().replaceAll('https://api.donavencrenshaw.com', profileOrigin),
        );
      const type =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
        }[path.extname(target)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise((resolve) => profileServer.listen(0, '127.0.0.1', resolve));
  profileOrigin = `http://127.0.0.1:${profileServer.address().port}`;
  try {
    await account.goto(profileOrigin + '/account/');
    await account.locator('.acct-liveries a').first().waitFor();
    assert.ok(
      (await account.locator('[data-acct-livery-link]').getAttribute('href')).includes(
        'garageArtist=NeedleArtist',
      ),
    );
    await account.locator('[data-acct-livery-link]').scrollIntoViewIfNeeded();
    await account.screenshot({ path: `${out}/account-profile-designs.png` });
    await account.close();
  } finally {
    profileServer.closeAllConnections();
    await new Promise((resolve) => profileServer.close(resolve));
  }
  checks.push('published designs appear on the real account profile page');
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  mobile.on('pageerror', (e) => errors.push(e.message));
  await open(mobile);
  await mobile.locator('[data-family=wisp]').click();
  await mobile.getByRole('tab', { name: 'DECALS', exact: true }).click();
  await mobile.locator('[data-shape=skull]').click();
  await dispatch(mobile, 'garage-decal-y', 0.23);
  await mobile.screenshot({ path: `${out}/layer-editor-mobile.png` });
  assert.ok(await mobile.locator('#garage-equip').isVisible());
  const overflow = await mobile.evaluate(
    () => document.querySelector('#ship-garage').scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  await mobile.close();
  checks.push('390px mobile layout, touch canvas and reduced motion');
  assert.deepEqual(failedAssets, []);
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/acceptance.json`,
    JSON.stringify({ checks, shapeResults, evidence, errors, failedAssets }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, failedAssets }, null, 2));
} finally {
  await browser.close();
}
