// Browser input integration; sensor events are simulated, physical tilt is a phone check.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const evidence = 'docs/stardust/evidence';
await mkdir(evidence, { recursive: true });
const results = [], errors = [];
const url = process.env.STARDUST_TEST_URL || 'http://127.0.0.1:4173/projects/Space-Shooter/';
async function launch(context, address) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(address);
  await page.getByRole('button', { name: 'Launch expedition' }).click();
  await page.evaluate(async () => { window.__state = (await import('/projects/Space-Shooter/state.js')).state; });
  await page.waitForFunction(() => !window.__state.ui.countdownActive);
  await page.locator('#touch-boost').tap();
  await page.waitForFunction(() => window.__state.run.current.launched);
  return page;
}
async function gasAndFire(page, context) {
  const cdp = await context.newCDPSession(page);
  const boxes = await Promise.all(['#touch-up', '#touch-fire'].map(selector => page.locator(selector).boundingBox()));
  const touches = boxes.map((box, id) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await page.waitForFunction(() => window.__state.keys.thrustStrength > 0 && window.__state.keys.shoot);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => !window.__state.keys.shoot && !window.__state.keys.thrust);
  await cdp.detach();
}
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 320 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await launch(context, url);
    const boxes = await Promise.all(['#touch-up', '#touch-down', '#touch-fire', '#touch-brake', '#touch-boost'].map(selector => page.locator(selector).boundingBox()));
    assert(boxes.every(box => box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height));
    assert(boxes[0].x < viewport.width / 2 && boxes[1].x < viewport.width / 2);
    assert(boxes.slice(2).every(box => box.x > viewport.width / 2));
    assert(boxes[2].y < boxes[3].y && boxes[3].y < boxes[4].y);
    const minimap = await page.evaluate(async () => (await import('/projects/Space-Shooter/ui/hud.js')).getMinimapRect(innerWidth, innerHeight));
    const mission = await page.locator('#mission-tracker').boundingBox();
    assert(minimap.y > mission.y + mission.height, 'Map clears mission text');
    assert(minimap.y + minimap.h < boxes[0].y, 'Map clears gas pedal');
    let insecureTiltFallback = false;
    if (!await page.evaluate(() => isSecureContext)) {
      await page.locator('#starmap-touch-controls [data-tilt-enable]').tap();
      assert.match(await page.locator('#starmap-touch-controls [data-mobile-status]').textContent(), /HTTPS/);
      assert(await page.locator('#touch-steering-fallback').isVisible());
      insecureTiltFallback = true;
    }
    await gasAndFire(page, context);
    await page.locator('#starmap-touch-controls [data-fullscreen]').tap();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    assert(await page.locator('#touch-up').isVisible() && await page.locator('#touch-boost').isVisible());
    await page.screenshot({ path: `${evidence}/mobile-layout-${viewport.width}.png` });
    await page.locator('#starmap-touch-controls [data-fullscreen]').tap();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    results.push({ viewport, boostLaunched: true, layoutCorrect: true, minimapClear: true, simultaneousGasFire: true, wholeDocumentFullscreen: true, insecureTiltFallback });
    await context.close();
  }
  // Localhost is a real secure context. Only the hardware events/permission are mocked.
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
  });
  const page = await launch(context, 'http://127.0.0.1:4173/projects/Space-Shooter/');
  assert(await page.evaluate(() => isSecureContext));
  await page.locator('#starmap-touch-controls [data-tilt-enable]').tap();
  await page.evaluate(() => {
    window.__tiltDegrees = 0;
    window.__sensor = setInterval(() => {
      const angle = (screen.orientation?.angle || 0) * Math.PI / 180;
      dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: window.__tiltDegrees * Math.sin(angle), gamma: window.__tiltDegrees * Math.cos(angle) }));
    }, 16);
  });
  await page.waitForFunction(() => window.__state.input.touch.useTilt);
  const before = await page.evaluate(() => window.__state.run.current.player.angle);
  await page.evaluate(() => { window.__tiltDegrees = 14; });
  await page.waitForFunction(() => window.__state.keys.turnStrength > .2);
  await gasAndFire(page, context);
  await page.waitForFunction(angle => window.__state.run.current.player.angle > angle + .05, before);
  await page.locator('#starmap-touch-controls [data-tilt-recenter]').tap();
  await page.waitForFunction(() => Math.abs(window.__state.keys.turnStrength) < .01);
  await page.evaluate(() => { window.__tiltDegrees = -10; });
  await page.waitForFunction(() => window.__state.keys.turnStrength < -.2);
  await page.evaluate(() => { clearInterval(window.__sensor); });
  await page.waitForFunction(() => window.__state.keys.turnStrength === 0);
  results.push({ secureContext: 'localhost', simulatedSensor: true, turnsBothDirections: true, changesShipHeading: true, simultaneousGasFire: true, recenterAndStaleNeutral: true });
  await context.close();
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${evidence}/mobile-controls-root.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ results, errors }, null, 2));
