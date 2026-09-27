import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";

test("two browsers: keyboard/touch traps, shared locks, movement release, cooldown and rematch", {
  skip: !process.env.STARDUST_TRAP_BROWSER_TEST, timeout: 60000,
}, async t => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
    ? process.env.PLAYWRIGHT_MODULE.startsWith("file:") ? process.env.PLAYWRIGHT_MODULE : pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright");
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const guest = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const sent = [], received = [], errors = [], failedResources = [];
  host.on("websocket", socket => socket.on("framesent", ({ payload }) => {
    const msg = JSON.parse(payload);
    if (msg.type === "snapshot") sent.push(msg.state);
  }));
  guest.on("websocket", socket => socket.on("framereceived", ({ payload }) => {
    const msg = JSON.parse(payload);
    if (msg.type === "snapshot") received.push(msg.state);
  }));
  for (const page of [host, guest]) {
    page.setDefaultTimeout(8000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("response", response => { if (response.status() >= 400) failedResources.push(response.url()); });
    await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));
    await page.goto(`http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`);
    await page.evaluate(async () => { window.__trapDiag = (await import("./client.js")).getDiagnostics; });
    await page.locator("#connection-settings").evaluate(node => { node.open = true; });
    await page.locator("#relay-url").fill(`ws://127.0.0.1:${server.port}/relay`);
  }
  // Keep this weapon proof on the classic open center lane as new maps are added.
  const classicMap = host.locator('input[name="arena-map"][value="classic"]');
  if (await classicMap.count()) await classicMap.check();
  await host.locator("#create").click();
  await host.waitForFunction(() => document.getElementById("share-code").textContent.length === 8);
  await guest.locator("#room-code").fill(await host.locator("#share-code").textContent());
  await guest.locator("#join").click();
  for (const page of [host, guest]) await page.waitForFunction(() => window.__trapDiag().phase === "playing");
  const initialHull = await host.evaluate(() => window.__trapDiag().hull);
  await host.keyboard.press("f"); // intentionally fast: latch must preserve a short press
  await host.waitForFunction(() => window.__trapDiag().trapCooldown > 10);
  await host.waitForFunction(() => window.__trapDiag().traps > 0);
  const evidenceDir = new URL("../docs/stardust/evidence/", import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  await host.screenshot({ path: fileURLToPath(new URL("laser-trap-flight.png", evidenceDir)) });
  await guest.waitForFunction(() => window.__trapDiag().trapLock > 0);
  await guest.keyboard.down("w");
  await guest.keyboard.down("ArrowLeft");
  await guest.waitForTimeout(160);
  await guest.keyboard.up("w");
  await guest.keyboard.up("ArrowLeft");
  const locked = sent.filter(s => s.ships[1].trapLock > 0);
  assert.ok(locked.length >= 2, "Host publishes multiple locked frames");
  assert.ok(locked.every(s => s.ships[1].x === locked[0].ships[1].x &&
    s.ships[1].y === locked[0].ships[1].y && s.ships[1].angle === locked[0].ships[1].angle), "Motion input cannot move a locked ship");
  await guest.screenshot({ path: fileURLToPath(new URL("laser-trap-phone-locked.png", evidenceDir)) });
  await guest.waitForFunction(() => window.__trapDiag().trapLock === 0);
  assert.deepEqual(await guest.evaluate(() => window.__trapDiag().hull), initialHull, "Clamp deals no damage");
  // Real touch button drives a guest input through the live relay to host authority.
  await guest.locator("#trap-button").tap();
  await guest.waitForFunction(() => window.__trapDiag().trapCooldown > 10);
  assert.match(await guest.locator("#trap-state").textContent(), /s$/);
  await host.waitForFunction(() => window.__trapDiag().trapLock > 0);
  await host.screenshot({ path: fileURLToPath(new URL("laser-trap-desktop-locked.png", evidenceDir)) });
  await host.waitForFunction(() => window.__trapDiag().trapLock === 0);
  // Ready feedback follows the full host timer; early presses do not shorten it.
  await host.keyboard.press("f");
  assert.ok(await host.evaluate(() => window.__trapDiag().trapCooldown > 0));
  await host.waitForFunction(() => window.__trapDiag().trapCooldown === 0, null, { timeout: 14000 });
  assert.match(await host.locator("#trap-hud-state").textContent(), /READY/);
  await host.keyboard.press("f");
  await host.waitForFunction(() => window.__trapDiag().trapCooldown > 11);
  await guest.setViewportSize({ width: 390, height: 844 });
  assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth), 390);
  const trapBox = await guest.locator("#trap-button").boundingBox();
  assert.ok(trapBox.x >= 0 && trapBox.y >= 0 && trapBox.x + trapBox.width <= 390 && trapBox.y + trapBox.height <= 844);
  await guest.screenshot({ path: fileURLToPath(new URL("laser-trap-phone-portrait.png", evidenceDir)) });
  // Primary fire has the solo weapon's shorter reach; close the gap with real controls.
  await host.keyboard.down("w");
  await host.waitForTimeout(2500);
  await host.keyboard.up("w");
  await host.keyboard.down("x");
  await host.waitForTimeout(400);
  await host.keyboard.up("x");
  await host.keyboard.down("Space");
  await host.locator("#result").waitFor({ state: "visible", timeout: 12000 });
  await host.keyboard.up("Space");
  await guest.locator("#result").waitFor({ state: "visible" });
  assert.equal(sent.at(-1).traps.length, 0);
  assert.ok(sent.at(-1).ships.every(s => s.trapLock === 0));
  await host.locator("#rematch").click();
  await guest.locator("#rematch").click();
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.__trapDiag().round === 2 && window.__trapDiag().phase === "playing");
    assert.equal(await page.evaluate(() => window.__trapDiag().trapCooldown), 0);
    assert.equal(await page.evaluate(() => window.__trapDiag().trapLock), 0);
  }
  // Short guest key taps take the same reliable path as touch.
  await guest.keyboard.press("f");
  await guest.waitForFunction(() => window.__trapDiag().trapCooldown > 11);
  for (const state of received.filter(s => s.ships.some(p => p.trapLock > 0))) {
    const authority = sent.find(s => s.round === state.round && s.tick === state.tick);
    assert.deepEqual(state.traps, authority.traps);
    assert.deepEqual(state.ships.map(s => s.trapLock), authority.ships.map(s => s.trapLock));
  }
  assert.ok(received.some(s => s.ships[0].trapLock > 0) && received.some(s => s.ships[1].trapLock > 0));
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  const proof = { testedAt: new Date().toISOString(), keyboardHost: true, touchGuest: true,
    quickGuestKey: true, locksBothSeats: true, movementSuppressed: true, automaticRelease: true,
    cooldownRecharged: true, rematchReset: true, matchingRelayLocks: true, landscape: "844x390", portrait: "390x844",
    snapshotsSent: sent.length, snapshotsReceived: received.length, errors, failedResources,
    limits: "Local Chromium with emulated phone; no physical phone, real gamepad, human balance or internet latency acceptance." };
  await writeFile(new URL("laser-traps-browser.json", evidenceDir), JSON.stringify(proof, null, 2) + "\n");
  t.diagnostic(JSON.stringify(proof));
});
