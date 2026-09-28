import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
// Optional browser dependency is supplied by the developer runtime, never shipped to players.
test(
  "real browsers: a guest predicts its own ship through the relay and stays in step with the host",
  { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 60000 },
  async (t) => {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    const { chromium } = await import(
      modulePath ? (modulePath.startsWith("file:") ? modulePath : pathToFileURL(modulePath).href) : "playwright"
    );
    const server = await createDogfightServer({ port: 0 });
    t.after(() => server.close());
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const [host, guest] = await Promise.all([0, 1].map(async () =>
      (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()));
    const errors = [];
    const hostSnapshots = [];
    host.on("websocket", (socket) => socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(payload);
      if (message.type === "snapshot") hostSnapshots.push(message.state);
    }));
    for (const page of [host, guest]) {
      page.setDefaultTimeout(8000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "gravemaw"));
      await page.route("https://api.donavencrenshaw.com/**", (route) => route.fulfill({ json: { user: null } }));
      await page.goto(`http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`);
      await page.evaluate(async () => {
        window.__dogfightDiag = (await import("./client.js")).getDiagnostics;
      });
      await page.locator("#connection-settings summary").click();
      await page.locator("#relay-url").fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    await host.locator("#create").click();
    await host.waitForFunction(() => document.querySelector("#share-code").textContent.length === 8);
    await guest.locator("#room-code").fill(await host.locator("#share-code").textContent());
    await guest.locator("#join").click();
    for (const page of [host, guest])
      await page.waitForFunction(() => window.__dogfightDiag().phase === "playing", null, { timeout: 12000 });

    await guest.waitForFunction(() => window.__dogfightDiag().network.prediction.active);
    assert.ok(hostSnapshots.at(-1).ships[1].ack >= 1, "the host acknowledges the guest's inputs");
    await guest.waitForFunction(() => document.querySelector("#network-status").textContent === "Connected · predicted");

    // Fly a loop through the gravity well: thrust, turn, boost, brake.
    const start = (await guest.evaluate(() => window.__dogfightDiag().network.drawnOwnShip));
    await guest.keyboard.down("w");
    await guest.waitForTimeout(700);
    await guest.keyboard.down("a");
    await guest.waitForTimeout(500);
    await guest.keyboard.up("a");
    await guest.keyboard.down("Shift");
    await guest.waitForTimeout(300);
    await guest.keyboard.up("Shift");
    await guest.keyboard.up("w");
    await guest.keyboard.down("x");
    await guest.waitForTimeout(500);
    await guest.keyboard.up("x");
    await guest.waitForTimeout(400);

    const d = await guest.evaluate(() => window.__dogfightDiag());
    const drawn = d.network.drawnOwnShip;
    const host1 = hostSnapshots.at(-1).ships[1];
    t.diagnostic(`guest prediction: ${JSON.stringify(d.network)}`);
    assert.ok(Math.hypot(drawn.x - start.x, drawn.y - start.y) > 1, "the guest's own ship flew");
    assert.ok(d.network.prediction.reconciles > 20);
    assert.equal(d.network.prediction.snaps, 0, "no snapping during ordinary flight");
    assert.ok(d.network.prediction.maxError < 1, `largest correction ${d.network.prediction.maxError}`);
    assert.ok(Math.hypot(drawn.x - host1.x, drawn.y - host1.y) < 0.75, "after settling, the guest draws itself where the host has it");
    assert.deepEqual(errors, []);
  },
);
