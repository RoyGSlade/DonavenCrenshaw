/** Independent map acceptance: actual browser input, relay agreement, screenshots. */
import assert from "node:assert/strict";
import path from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createDogfightServer } from "./serve-stardust-dogfight.mjs";
const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
const { chromium } = await import(modulePath.startsWith("file:") ? modulePath : pathToFileURL(modulePath));
const server = await createDogfightServer({ port: 0 });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
const output = path.resolve("docs/stardust/evidence/maps"); await mkdir(output, { recursive: true });
const errors = [], results = [];
try {
  for (const mapId of ["shatterbelt", "gravemaw", "stormworks"]) {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    for (const page of [host, guest]) {
      page.setDefaultTimeout(10000);
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      await page.goto(`http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`);
      await page.evaluate(async () => { window.diag = (await import("./client.js")).getDiagnostics; });
      await page.locator("#connection-settings summary").click();
      await page.locator("#relay-url").fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    await host.locator(`input[name="arena-map"][value="${mapId}"]`).check();
    if (mapId === "shatterbelt") {
      await host.locator("#map-picker").scrollIntoViewIfNeeded();
      await host.screenshot({ path: path.join(output, "map-picker-desktop.png") });
      await guest.setViewportSize({ width: 390, height: 844 });
      await guest.locator("#map-picker").scrollIntoViewIfNeeded();
      assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await guest.screenshot({ path: path.join(output, "map-picker-phone.png") });
      await guest.setViewportSize({ width: 844, height: 390 });
    }
    await host.locator("#create").click();
    try {
      await host.waitForFunction(() => document.querySelector("#share-code").textContent.length === 8);
    } catch (error) {
      console.error({ mapId, status: await host.locator("#status").textContent(), errors });
      throw error;
    }
    await guest.locator("#room-code").fill(await host.locator("#share-code").textContent());
    await guest.locator("#join").click();
    for (const page of [host, guest]) await page.waitForFunction(() => window.diag().phase === "playing");
    const get = page => page.evaluate(() => window.diag());
    assert.equal((await get(host)).mapId, mapId); assert.equal((await get(guest)).mapId, mapId);
    assert.ok((await get(guest)).snapshotsReceived > 3);
    assert.equal(await host.locator(`input[name="arena-map"][value="${mapId}"]`).isDisabled(), true);
    await host.screenshot({ path: path.join(output, `${mapId}-desktop.png`) });
    await guest.screenshot({ path: path.join(output, `${mapId}-phone.png`) });
    if (mapId === "shatterbelt") {
      await host.keyboard.down("Space");
      await host.waitForFunction(() => window.diag().terrain.hp.some(hp => hp === 0), null, { timeout: 6000 });
      await host.keyboard.up("Space");
      await guest.waitForFunction(() => window.diag().terrain.hp.some(hp => hp === 0));
      // Let already-fired shots expire, then wait for the corresponding relayed state.
      await host.waitForTimeout(1500);
      const settledHp = (await get(host)).terrain.hp;
      await guest.waitForFunction(hp => JSON.stringify(window.diag().terrain.hp) === JSON.stringify(hp), settledHp);
      await host.screenshot({ path: path.join(output, "shatterbelt-breached.png") });
      assert.deepEqual((await get(host)).terrain.hp, (await get(guest)).terrain.hp);
    }
    if (mapId === "stormworks") {
      await host.waitForFunction(() => document.querySelector("#arena-tip").textContent.includes("WARNING"), null, { timeout: 10000 });
      await host.screenshot({ path: path.join(output, "stormworks-warning.png") });
      await host.waitForFunction(() => document.querySelector("#arena-tip").textContent.includes("LIVE"));
      await host.screenshot({ path: path.join(output, "stormworks-live.png") });
    }
    results.push({ mapId, host: await get(host), guest: await get(guest) });
    // Browser-hidden interruption exercises the mutual-rematch path without a fake win.
    await host.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    for (const page of [host, guest]) await page.locator("#result").waitFor({ state: "visible" });
    await host.evaluate(() => { delete document.hidden; });
    await host.locator("#rematch").click(); await guest.locator("#rematch").click();
    await guest.waitForFunction(() => window.diag().round === 2 && window.diag().phase === "playing");
    assert.equal((await get(guest)).mapId, mapId);
    assert.ok((await get(guest)).terrain.hp.every(hp => hp !== 0), "rematch repairs cover");
    await hostContext.close(); await guestContext.close();
    console.log(`${mapId}: selected, synchronized, rendered desktop/phone, rematched; ${mapId === "shatterbelt" ? "real keyboard destroyed cover" : mapId === "stormworks" ? "warning/live cycle captured" : "gravity/gates rendered"}`);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "browser-results.json"), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
} finally { await browser.close(); await server.close(); }
