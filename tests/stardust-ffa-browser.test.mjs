import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = (to, from) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
test(
  "three real clients: waiting seats, independent controls, actual violet combat win, spectator host, all-ready rematch and disconnect",
  { skip: !process.env.STARDUST_FFA_BROWSER_TEST, timeout: 120000 },
  async (t) => {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    const { chromium } = await import(
      modulePath
        ? modulePath.startsWith("file:")
          ? modulePath
          : pathToFileURL(modulePath).href
        : "playwright"
    );
    const evidence = resolve("output/stardust");
    await mkdir(evidence, { recursive: true });
    const server = await createDogfightServer({ port: 0 });
    t.after(() => server.close());
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.BROWSER_CHANNEL || "msedge",
    });
    t.after(() => browser.close());
    const contexts = await Promise.all(
      [0, 1, 2].map((id) =>
        browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: id === 2 }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const [host, orange, violet] = pages,
      errors = [],
      snapshots = [],
      wireInputs = [];
    host.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(payload);
        if (m.type === "snapshot") snapshots.push(m.state);
      }),
    );
    for (const [id, page] of pages.entries()) {
      page.setDefaultTimeout(8000);
      page.on("pageerror", (error) => errors.push(`P${id}: ${error.message}`));
      if (id)
        page.on("websocket", (socket) =>
          socket.on("framesent", ({ payload }) => {
            const m = JSON.parse(payload);
            if (m.type === "input") wireInputs.push({ playerId: id, ...m });
          }),
        );
      await page.addInitScript(() => {
        window.__testPad = {
          index: 0,
          connected: true,
          mapping: "standard",
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            value: 0,
            pressed: false,
          })),
        };
        Object.defineProperty(navigator, "getGamepads", {
          value: () => [window.__testPad],
        });
      });
      // Keep local gameplay QA independent of the public account service.
      await page.route("https://api.donavencrenshaw.com/**", route => route.fulfill({ json: { user: null } }));
      await page.goto(
        `http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`,
      );
      await page.evaluate(async () => {
        window.__ffaDiag = (await import("./client.js")).getDiagnostics;
      });
      await page.locator("#connection-settings summary").click();
      await page
        .locator("#relay-url")
        .fill(`ws://127.0.0.1:${server.port}/relay`);
    }
    const diag = (page) => page.evaluate(() => window.__ffaDiag());
    const pad = async (
      page,
      {
        thrust = 0,
        reverse = 0,
        turn = 0,
        strafe = 0,
        fire = false,
        brake = false,
      } = {},
    ) =>
      page.evaluate(
        (c) => {
          window.__testPad.axes = [c.strafe, c.reverse || -c.thrust, c.turn, 0];
          window.__testPad.buttons = Array.from({ length: 17 }, (_, i) => ({
            value: (i === 7 && c.fire) || (i === 5 && c.brake) ? 1 : 0,
            pressed: !!((i === 7 && c.fire) || (i === 5 && c.brake)),
          }));
        },
        { thrust, reverse, turn, strafe, fire, brake },
      );
    await host.locator("#match-mode").selectOption("ffa3");
    await host.getByRole("radio", { name: "Classic", exact: true }).check();
    await host.locator("#create").click();
    await host.waitForFunction(() => window.__ffaDiag().roomCode.length === 8);
    const roomCode = (await diag(host)).roomCode;
    await orange.locator("#room-code").fill(roomCode);
    await orange.locator("#join").click();
    await orange.waitForFunction(() => window.__ffaDiag().playerId === 1);
    await host.waitForTimeout(250);
    assert.equal((await diag(host)).phase, "lobby");
    assert.equal((await diag(host)).round, 0);
    assert.equal((await diag(orange)).phase, "lobby");
    assert.equal(server.rooms.get(roomCode).phase, "waiting");
    t.diagnostic(
      "Two connected pilots remain in the lobby until the third joins.",
    );
    await violet.locator("#room-code").fill(roomCode);
    await violet.locator("#join").click();
    for (const [id, page] of pages.entries()) {
      await page.waitForFunction(() => window.__ffaDiag().phase === "playing");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      const d = await diag(page);
      assert.equal(d.playerId, id);
      assert.equal(d.mode, "ffa3");
      assert.deepEqual(d.hull, [100, 100, 100]);
      assert.equal(await page.locator("#ship-health2").isVisible(), true);
      assert.match(
        await page.locator("#ship-health2").getAttribute("class"),
        /violet/,
      );
      assert.match(await page.locator("#hp2").textContent(), /100/);
    }
    await host.waitForTimeout(80); // Neutral sample arms the shared gamepad reader after round reset.
    const before = (await diag(host)).ships;
    await pad(orange, { strafe: 0.7 });
    await pad(violet, { thrust: 0.7 });
    await host.waitForTimeout(350);
    await pad(orange, { brake: true });
    await pad(violet, { brake: true });
    await host.waitForTimeout(700);
    await pad(orange);
    await pad(violet);
    const moved = (await diag(host)).ships;
    for (const id of [1, 2])
      assert.ok(
        Math.hypot(moved[id].x - before[id].x, moved[id].y - before[id].y) >
          0.04,
        `Guest${id} must move independently in authoritative simulation`,
      );
    assert.ok(
      wireInputs.some((m) => m.playerId === 1 && m.controls.strafe > 0.3),
    );
    assert.ok(
      wireInputs.some(
        (m) => m.playerId === 2 && m.controls.thrustStrength === 0.7,
      ),
    );
    await host.screenshot({ path: join(evidence, "ffa-three-pilots.png") });
    t.diagnostic(
      "Orange strafes and Violet thrusts through separate real relay input streams.",
    );

    // Closed-loop pilot changes only the simulated physical pad. Every position, shot, hit and death comes from the live host.
    async function flyTo(point, limit = 18000) {
      const started = Date.now();
      let lastAngle = null,
        lastAt = Date.now();
      while (Date.now() - started < limit) {
        const d = await diag(host),
          ship = d.ships[2],
          dx = point.x - ship.x,
          dy = point.y - ship.y,
          dist = Math.hypot(dx, dy),
          speed = Math.hypot(ship.vx, ship.vy);
        if (dist < 0.45 && speed < 0.65) {
          await pad(violet);
          return;
        }
        const desired = Math.min(3.4, Math.sqrt(3 * dist));
        const ax = ((dx / (dist || 1)) * desired - ship.vx) * 2.5,
          ay = ((dy / (dist || 1)) * desired - ship.vy) * 2.5;
        const target = Math.atan2(ay, ax),
          err = angleDelta(target, ship.angle);
        const now = Date.now(),
          angular =
            lastAngle === null
              ? 0
              : angleDelta(ship.angle, lastAngle) /
                Math.max(0.01, (now - lastAt) / 1000);
        lastAngle = ship.angle;
        lastAt = now;
        await pad(violet, {
          turn: clamp(err * 1.8 - angular * 0.15, -1, 1),
          thrust: Math.abs(err) < 0.3 ? Math.min(1, Math.hypot(ax, ay) / 5) : 0,
          brake: dist < 1.2 && speed > 1.2,
        });
        await host.waitForTimeout(35);
      }
      throw new Error(
        `Control pilot failed waypoint ${JSON.stringify(point)}: ${JSON.stringify((await diag(host)).ships)}`,
      );
    }
    async function shoot(targetId, limit = 16000) {
      const started = Date.now();
      let lastAngle = null,
        lastAt = Date.now();
      while (Date.now() - started < limit) {
        const d = await diag(host),
          ship = d.ships[2],
          target = d.ships[targetId];
        if (target.hp <= 0) {
          await pad(violet);
          return;
        }
        const err = angleDelta(
            Math.atan2(target.y - ship.y, target.x - ship.x),
            ship.angle,
          ),
          now = Date.now();
        const angular =
          lastAngle === null
            ? 0
            : angleDelta(ship.angle, lastAngle) /
              Math.max(0.01, (now - lastAt) / 1000);
        lastAngle = ship.angle;
        lastAt = now;
        const requested = clamp(err * 2 - angular * 0.25, -1, 1);
        // The real stick deadzone is .2; use short corrective pulses instead of stalling just outside firing alignment.
        const turn =
          Math.abs(err) > 0.008 || Math.abs(angular) > 0.06
            ? Math.abs(requested) < 0.21
              ? Math.sign(requested || err) * 0.21
              : requested
            : 0;
        await pad(violet, {
          turn,
          fire: Math.abs(err) < 0.035,
          brake: Math.hypot(ship.vx, ship.vy) > 0.12,
        });
        await host.waitForTimeout(25);
      }
      throw new Error(
        `Real combat pilot failed target${targetId}: ${JSON.stringify((await diag(host)).ships)}`,
      );
    }
    await flyTo({ x: 26, y: 12 });
    await flyTo({ x: 16, y: 12 });
    await shoot(0);
    const afterHostDeath = await diag(host);
    assert.equal(afterHostDeath.hull[0], 0);
    assert.equal(afterHostDeath.phase, "playing");
    assert.ok(afterHostDeath.hull[1] > 0 && afterHostDeath.hull[2] > 0);
    await host.locator("#spectator-status").waitFor({ state: "visible" });
    assert.equal(await host.locator("#result").isVisible(), false);
    const afterDeathCount = snapshots.length;
    await host.waitForTimeout(180);
    assert.ok(
      snapshots.length > afterDeathCount,
      "Eliminated host must continue authoritative snapshots",
    );
    t.diagnostic(
      "Violet eliminated Cyan with actual primary fire; Cyan keeps hosting while spectating the remaining two pilots.",
    );
    await host.screenshot({ path: join(evidence, "ffa-host-spectating.png") });
    await flyTo({ x: 26, y: 12 });
    await shoot(1);
    for (const page of pages) {
      await page.locator("#result").waitFor({ state: "visible" });
      const d = await diag(page);
      assert.equal(d.phase, "finished");
      assert.equal(d.winner, 2);
      assert.equal(d.hull[0], 0);
      assert.equal(d.hull[1], 0);
      assert.ok(d.hull[2] > 0);
    }
    assert.equal(
      await violet.locator("#result-title").textContent(),
      "You won.",
    );
    await violet.screenshot({ path: join(evidence, "ffa-violet-wins.png") });
    await host.locator("#rematch").click();
    await orange.locator("#rematch").click();
    await host.waitForTimeout(180);
    for (const page of pages) assert.equal((await diag(page)).round, 1);
    await violet.locator("#rematch").click();
    for (const page of pages) {
      await page.waitForFunction(
        () =>
          window.__ffaDiag().round === 2 &&
          window.__ffaDiag().phase === "playing",
      );
      assert.deepEqual((await diag(page)).hull, [100, 100, 100]);
    }
    t.diagnostic(
      "Winner2 matched across all clients. Two rematch votes did not restart; all three reset every hull.",
    );
    await violet.setViewportSize({ width: 390, height: 844 });
    await violet.waitForTimeout(100);
    assert.equal(
      await violet.evaluate(() => document.documentElement.scrollWidth),
      390,
      "Three-player portrait UI must not overflow horizontally",
    );
    assert.equal(await violet.locator("#touch-controls").isVisible(), true);
    for (const id of [0, 1, 2]) {
      const hud = violet.locator(`#ship-health${id}`);
      assert.equal(await hud.isVisible(), true);
      const bounds = await hud.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, `Pilot ${id} hull must fit the phone viewport`);
    }
    await violet.screenshot({ path: join(evidence, "ffa-portrait.png") });
    await contexts[1].close();
    for (const page of [host, violet]) {
      await page.waitForFunction(() => window.__ffaDiag().phase === "lobby");
      assert.match(
        await page.locator("#status").textContent(),
        /disconnected|closed/i,
      );
    }
    assert.equal(server.rooms.size, 0);
    assert.deepEqual(errors, []);
    t.diagnostic(
      `Screenshots: ${join(evidence, "ffa-host-spectating.png")} and ${join(evidence, "ffa-violet-wins.png")}. No simulation-state writes or forged snapshots used.`,
    );
  },
);
