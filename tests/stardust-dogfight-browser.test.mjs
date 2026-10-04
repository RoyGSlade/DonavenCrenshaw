import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
// Optional browser dependency is supplied by the developer runtime, never shipped to players.
test(
  "real browsers: room, keyboard hull damage, both winners, rematch, host stall and disconnect",
  { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 60000 },
  async (t) => {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    const { chromium } = await import(
      modulePath
        ? modulePath.startsWith("file:")
          ? modulePath
          : pathToFileURL(modulePath).href
        : "playwright"
    );
    const server = await createDogfightServer({ port: 0 });
    t.after(() => server.close());
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const hostContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      guestContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
    const host = await hostContext.newPage(),
      guest = await guestContext.newPage(),
      errors = [];
    const sentSnapshots = [];
    host.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const message = JSON.parse(payload);
        if (message.type === "snapshot") sentSnapshots.push(message.state);
      }),
    );
    for (const page of [host, guest]) {
      page.setDefaultTimeout(8000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));

      // Keep local gameplay QA independent of the public account service.
      await page.route("https://api.donavencrenshaw.com/**", route => route.fulfill({ json: { user: null } }));
      await page.goto(
        `http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`,
      );
      await page.evaluate(async () => {
        window.__dogfightDiag = (await import("./client.js")).getDiagnostics;
      });
      await page.locator("#connection-settings summary").click();
      await page
        .locator("#relay-url")
        .fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    const diagnostics = (page) =>
      page.evaluate(async () => (await import("./client.js")).getDiagnostics());
    await host.locator("#create").click();
    await host.waitForFunction(
      () => document.querySelector("#share-code").textContent.length === 8,
    );
    const code = await host.locator("#share-code").textContent();
    await guest.locator("#room-code").fill(code);
    await guest.locator("#join").click();
    const playing = async (page, round) =>
      page.waitForFunction(
        (expected) => {
          const d = window.__dogfightDiag();
          return d.round === expected && d.phase === "playing";
        },
        round,
        { timeout: 12000 },
      );
    await playing(host, 1);
    await playing(guest, 1);
    assert.equal(await host.evaluate(() => document.activeElement.id), "arena");
    assert.equal(
      await guest.evaluate(() => document.activeElement.id),
      "arena",
    );
    const startX = sentSnapshots.at(-1).ships[0].x;
    await host.keyboard.down("w");
    await host.waitForTimeout(500);
    await host.keyboard.up("w");
    await host.keyboard.down("x");
    await host.waitForTimeout(350);
    await host.keyboard.up("x");
    assert.ok(
      sentSnapshots.at(-1).ships[0].x > startX + 0.5,
      "Real thrust must change authoritative position",
    );
    t.diagnostic(
      "Room joined; both canvases focused; host keyboard thrust verified in transmitted snapshots.",
    );
    await host.keyboard.down("w");
    await host.waitForTimeout(2300);
    await host.keyboard.up("w");
    await host.keyboard.down("x");
    await host.waitForTimeout(400);
    await host.keyboard.up("x");
    await host.keyboard.down("Space");
    await host.locator("#result").waitFor({ state: "visible", timeout: 7000 });
    await host.keyboard.up("Space");
    await guest.locator("#result").waitFor({ state: "visible" });
    assert.equal(await host.locator("#result-title").textContent(), "You won.");
    assert.equal(
      await guest.locator("#result-title").textContent(),
      "Opponent wins.",
    );
    assert.deepEqual((await diagnostics(host)).hull, [100, 0]);
    assert.deepEqual((await diagnostics(guest)).hull, [100, 0]);
    assert.ok((await diagnostics(guest)).snapshotsReceived > 20);
    t.diagnostic(
      "Verified completed round with matching hull on both clients.",
    );
    await host.locator("#rematch").click();
    await host.waitForTimeout(100);
    assert.equal((await diagnostics(host)).round, 1);
    await guest.locator("#rematch").click();
    await playing(guest, 2);
    assert.deepEqual((await diagnostics(guest)).hull, [100, 100]);
    await guest.keyboard.down("w");
    await guest.waitForTimeout(2500);
    await guest.keyboard.up("w");
    await guest.keyboard.down("x");
    await guest.waitForTimeout(400);
    await guest.keyboard.up("x");
    await guest.keyboard.down("Space");
    await guest.locator("#result").waitFor({ state: "visible", timeout: 7000 });
    await guest.keyboard.up("Space");
    await host.locator("#result").waitFor({ state: "visible" });
    assert.equal(
      await guest.locator("#result-title").textContent(),
      "You won.",
    );
    assert.deepEqual((await diagnostics(host)).hull, [0, 100]);
    await host.locator("#rematch").click();
    await guest.locator("#rematch").click();
    await playing(guest, 3);
    const beforeAngle = sentSnapshots.at(-1).ships[0].angle;
    await host.keyboard.down("a");
    await host.waitForTimeout(150);
    await host.keyboard.up("a");
    assert.ok(
      Math.abs(sentSnapshots.at(-1).ships[0].angle - beforeAngle) > 0.1,
      "Real rotation must change authoritative angle",
    );
    t.diagnostic(
      "Both pilots won by real keyboard fire; two rematches reset hull; rotation verified.",
    );
    const blocked = host.evaluate(() => {
      const until = performance.now() + 5200;
      while (performance.now() < until) {}
    });
    await guest.locator("#result").waitFor({ state: "visible", timeout: 7000 });
    assert.equal(
      await guest.locator("#result-title").textContent(),
      "Round interrupted",
    );
    await blocked;
    // Relay v3: a dropped guest's seat is held for a rejoin instead of closing the room.
    await guestContext.close();
    await host.waitForFunction(
      () => window.__dogfightDiag().lobby?.seats[1].presence === "away",
    );
    assert.match(await host.locator("#lobby-seats").textContent(), /Orange · disconnected/);
    assert.equal(server.rooms.size, 1);
    t.diagnostic(
      JSON.stringify({
        afterDisconnect: await diagnostics(host),
        seats: await host.locator("#lobby-seats").textContent(),
        rooms: server.rooms.size,
      }),
    );
    await host.locator("#result-leave").click();
    await host.waitForFunction(() => window.__dogfightDiag().phase === "lobby");
    assert.equal((await diagnostics(host)).phase, "lobby");
    await host.waitForTimeout(100);
    assert.equal(server.rooms.size, 0);
    assert.deepEqual(errors, []);
  },
);

test(
  "phone layout, real multi-touch plus simulated sensor steering, reverse and boost relay",
  { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 30000 },
  async (t) => {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    const { chromium } = await import(
      modulePath
        ? modulePath.startsWith("file:")
          ? modulePath
          : pathToFileURL(modulePath).href
        : "playwright"
    );
    const server = await createDogfightServer({ port: 0 });
    t.after(() => server.close());
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const host = await browser.newPage();
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const guest = await context.newPage();
    const errors = [],
      inputs = [],
      states = [];
    host.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(payload);
        if (m.type === "snapshot") states.push(m.state);
      }),
    );
    guest.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(payload);
        if (m.type === "input") inputs.push(m.controls);
      }),
    );
    for (const page of [host, guest]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));

      // Keep local gameplay QA independent of the public account service.
      await page.route("https://api.donavencrenshaw.com/**", route => route.fulfill({ json: { user: null } }));
      await page.goto(
        `http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`,
      );
      await page.evaluate(async () => {
        window.__dogfightDiag = (await import("./client.js")).getDiagnostics;
      });
      await page.locator("#connection-settings summary").click();
      await page
        .locator("#relay-url")
        .fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    await host.locator("#create").click();
    await host.waitForFunction(
      () => document.querySelector("#share-code").textContent.length === 8,
    );
    await guest
      .locator("#room-code")
      .fill(await host.locator("#share-code").textContent());
    await guest.locator("#join").click();
    await guest.waitForFunction(
      () => window.__dogfightDiag().phase === "playing",
    );
    const boxes = await guest.evaluate(() => {
      const rect = (key) => {
        const r = document
          .querySelector(`[data-key="${key}"]`)
          .getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        gas: rect("thrust"),
        reverse: rect("reverse"),
        fire: rect("fire"),
        brake: rect("brake"),
        boost: rect("boost"),
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(boxes.width, boxes.scroll);
    assert.ok(boxes.gas.x < 100 && boxes.fire.x > 700);
    assert.ok(
      boxes.gas.y < boxes.reverse.y &&
        boxes.fire.y < boxes.brake.y &&
        boxes.brake.y < boxes.boost.y,
    );
    await guest.locator("#enable-tilt").click();
    // Browser sensor emulation proves wiring, not physical iPhone/Android motion support.
    // Describe a phone held 30 degrees back from upright, then rotated like a
    // steering wheel. Convert screen-frame gravity to W3C device-frame angles:
    // mobile Chromium rotates the screen to landscape but beta/gamma do not rotate.
    const orient = (roll) => guest.evaluate((roll) => {
      const radians = Math.PI / 180;
      const pitch = 30 * radians, turn = roll * radians;
      const s = { x: -Math.sin(turn) * Math.cos(pitch), y: Math.cos(turn) * Math.cos(pitch), z: Math.sin(pitch) };
      const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
      const up = angle === 90 ? { x: s.y, y: -s.x, z: s.z }
        : angle === 180 ? { x: -s.x, y: -s.y, z: s.z }
        : angle === 270 ? { x: -s.y, y: s.x, z: s.z } : s;
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: Math.asin(up.y) / radians,
        gamma: Math.atan2(-up.x, up.z) / radians,
      }));
    }, roll);
    // Enabled alone is not calibrated: supply steady neutral samples first.
    for (let i = 0; i < 12; i++) {
      await orient(0);
      await guest.waitForTimeout(30);
    }
    await guest.waitForFunction(() => window.__dogfightDiag().tilt.enabled);
    assert.equal((await guest.evaluate(() => window.__dogfightDiag().controls)).turn, 0);
    const cdp = await context.newCDPSession(guest);
    const point = (box, id) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      id,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(boxes.gas, 1), point(boxes.fire, 2)],
    });
    for (let i = 0; i < 6; i++) {
      // Between the 3-degree dead zone and 40-degree full lock.
      await orient(20);
      await guest.waitForTimeout(30);
    }
    assert.ok(
      inputs.some((c) => c.thrust && c.fire && c.turn > 0 && c.turn < 1),
      `Two held thumb actions and analog tilt must coexist on the wire: ${JSON.stringify(inputs.slice(-8))}`,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await guest.waitForTimeout(420);
    const neutral = await guest.evaluate(
      () => window.__dogfightDiag().controls,
    );
    assert.equal(neutral.thrust, false);
    assert.equal(neutral.fire, false);
    assert.equal(neutral.turn, 0);
    await guest.locator("#enable-tilt").click();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(boxes.reverse, 3), point(boxes.boost, 4)],
    });
    await guest.waitForTimeout(160);
    assert.ok(inputs.some((c) => c.reverse && c.boost));
    assert.ok(
      states.some(
        (s) =>
          s.ships[1].boostCooldown > 0 &&
          s.ships[1].boostCooldown <= 0.25 &&
          s.ships[1].flux < 30,
      ),
      "Guest boost must reach the host simulation and snapshot",
    );
    assert.match(
      await guest.locator("#boost-state").textContent(),
      /Flux .*pips/,
    );
    await guest.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(
      (await guest.evaluate(() => window.__dogfightDiag().controls)).boost,
      false,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await guest.locator("#fullscreen").click();
    await guest.waitForFunction(() => !!document.fullscreenElement);
    assert.equal(
      await guest.evaluate(() => document.fullscreenElement?.tagName),
      "HTML",
    );
    assert.equal(await guest.locator("#touch-controls").isVisible(), true);
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const evidence = join(tmpdir(), "stardust-dogfight-mobile-controls.png");
    await guest.screenshot({ path: evidence });
    t.diagnostic(
      `Landscape multi-touch/sensor-emulation/fullscreen proof: ${evidence}`,
    );
    await guest.locator("#fullscreen").click();
    await guest.waitForFunction(() => !document.fullscreenElement);
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.waitForTimeout(100);
    assert.equal(
      await guest.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    assert.equal(await guest.locator("#touch-controls").isVisible(), true);
    await guest.screenshot({
      path: join(tmpdir(), "stardust-dogfight-mobile-controls-portrait.png"),
    });
    assert.deepEqual(errors, []);
  },
);

test(
  "standard controllers drive host and guest with analog strengths and safe disconnect/focus recovery",
  { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 30000 },
  async (t) => {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    const { chromium } = await import(
      modulePath
        ? modulePath.startsWith("file:")
          ? modulePath
          : pathToFileURL(modulePath).href
        : "playwright"
    );
    const server = await createDogfightServer({ port: 0 });
    t.after(() => server.close());
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const host = await browser.newPage(),
      guest = await browser.newPage(),
      states = [],
      inputs = [],
      errors = [];
    host.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(payload);
        if (m.type === "snapshot") states.push(m.state);
      }),
    );
    guest.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(payload);
        if (m.type === "input") inputs.push(m.controls);
      }),
    );
    for (const page of [host, guest]) {
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        window.__pads = [
          null,
          null,
          {
            index: 2,
            connected: true,
            mapping: "standard",
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({
              pressed: false,
              value: 0,
            })),
          },
        ];
        Object.defineProperty(navigator, "getGamepads", {
          value: () => window.__pads,
        });
      });
      await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));

      // Keep local gameplay QA independent of the public account service.
      await page.route("https://api.donavencrenshaw.com/**", route => route.fulfill({ json: { user: null } }));
      await page.goto(
        `http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`,
      );
      await page.evaluate(async () => {
        window.__dogfightDiag = (await import("./client.js")).getDiagnostics;
      });
      await page.locator("#connection-settings summary").click();
      await page
        .locator("#relay-url")
        .fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    await host.locator("#create").click();
    await host.waitForFunction(
      () => document.querySelector("#share-code").textContent.length === 8,
    );
    await guest
      .locator("#room-code")
      .fill(await host.locator("#share-code").textContent());
    await guest.locator("#join").click();
    for (const page of [host, guest]) {
      await page.waitForFunction(
        () => window.__dogfightDiag().phase === "playing",
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    }
    // The shared selector now requires activation/choice followed by neutral.
    for (const page of [host, guest]) await page.evaluate(async () => {
      (await import('../systems/controllerDevices.js')).selectController(2);
      window.__dogfightDiag();
    });
    await host.waitForTimeout(80);
    const configure = async (page, axes, buttons = {}) =>
      page.evaluate(
        ({ axes, buttons }) => {
          const p = window.__pads[2];
          p.axes = axes;
          p.buttons = Array.from({ length: 17 }, (_, i) => ({
            pressed: !!buttons[i],
            value: buttons[i] || 0,
          }));
        },
        { axes, buttons },
      );
    for (const [page, id] of [
      [host, 0],
      [guest, 1],
    ]) {
      const before = { ...states.at(-1).ships[id] };
      await configure(page, [0.5, -0.65, 0.35], { 7: 1, 4: 1 });
      await page.waitForTimeout(130);
      const c = await page.evaluate(() => window.__dogfightDiag().controls);
      assert.equal(c.thrustStrength, 0.65);
      assert.equal(c.strafe, 0.3);
      assert.equal(c.turn, 0.35);
      assert.equal(c.fire, true);
      assert.equal(c.boost, true);
      assert.ok(
        states.some((s) => s.ships[id].flux < 30),
        "Boost spends shared flight flux in authoritative snapshots",
      );
      await configure(page, [-0.5, 0.5, -0.3], { 5: 1 });
      await page.waitForTimeout(100);
      const reverse = await page.evaluate(
        () => window.__dogfightDiag().controls,
      );
      assert.equal(reverse.backStrength, 0.3);
      assert.equal(reverse.strafe, -0.3);
      assert.equal(reverse.brake, true);
      assert.ok(
        Math.hypot(
          states.at(-1).ships[id].x - before.x,
          states.at(-1).ships[id].y - before.y,
        ) > 0.01,
        "Controller movement reaches authoritative simulation",
      );
      await configure(page, [0, 0, 0]);
      await page.waitForTimeout(40);
      // A Y toggle is discarded on blur. Releasing Y after focus must not restore it.
      await configure(page, [0, 0, 0], { 3: 1 });
      await page.waitForTimeout(45);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await page.waitForTimeout(45);
      assert.equal(
        (await page.evaluate(() => window.__dogfightDiag().controls)).boost,
        false,
      );
      await configure(page, [0, 0, 0]);
      await page.waitForTimeout(40);
      assert.equal(
        (await page.evaluate(() => window.__dogfightDiag().controls)).boost,
        false,
      );
      if (id === 1) {
        await configure(page, [0, -.6, 0], {7:1});
        await page.waitForTimeout(40);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', {configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(40);
        assert.equal((await page.evaluate(() => window.__dogfightDiag().controls)).fire,false);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', {configurable:true,value:false});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(40);
        assert.equal((await page.evaluate(() => window.__dogfightDiag().controls)).thrust,false);
        await configure(page,[0,0,0]);await page.waitForTimeout(40);
      }
      await configure(page, [0, -1, 0], { 4: 1 });
      await page.waitForTimeout(40);
      await page.evaluate(() => {
        window.__savedPad = window.__pads[2];
        window.__pads = [];
        const e = new Event("gamepaddisconnected");
        Object.defineProperty(e, "gamepad", { value: window.__savedPad });
        window.dispatchEvent(e);
      });
      await page.waitForTimeout(40);
      assert.equal(
        (await page.evaluate(() => window.__dogfightDiag().controls)).thrust,
        false,
      );
      await page.evaluate(() => {
        window.__pads = [null, null, window.__savedPad];
      });
      await page.waitForTimeout(40);
      assert.equal(
        (await page.evaluate(() => window.__dogfightDiag().controls)).boost,
        false,
      );
      await configure(page, [0, 0, 0]);
      await page.waitForTimeout(40);
      await configure(page, [0, -0.4, 0]);
      await page.waitForTimeout(40);
      assert.equal(
        (await page.evaluate(() => window.__dogfightDiag().controls))
          .thrustStrength,
        0.4,
      );
      await configure(page, [0, 0, 0]);
    }
    assert.ok(
      inputs.some(
        (c) =>
          c.thrustStrength === 0.65 && c.strafe === 0.3 && c.fire && c.boost,
      ),
      "Guest analog actions survive relay serialization",
    );
    assert.ok(
      inputs.some(
        (c) => c.backStrength === 0.3 && c.strafe === -0.3 && c.brake,
      ),
      "Guest reverse and strafe survive relay serialization",
    );
    // A controller cannot promise fullscreen when a browser rejects activation.
    await guest.evaluate(() => {
      document.documentElement.requestFullscreen = () =>
        Promise.reject(new Error("blocked"));
    });
    await configure(guest, [0, 0, 0], { 9: 1 });
    await guest.waitForTimeout(80);
    assert.match(
      await guest.locator("#tilt-status").textContent(),
      /blocked|Home Screen/i,
    );
    assert.deepEqual(errors, []);
    t.diagnostic(
      "Both simulated standard pads: analog flight, boost resources, fire, reverse, strafe, disconnect, focus recovery and honest fullscreen failure verified. Physical hardware is not covered.",
    );
  },
);
