import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
// Optional browser dependency is supplied by the developer runtime, never shipped to players.
const skip = !process.env.STARDUST_BROWSER_TEST;
async function launch(t) {
  const modulePath = process.env.PLAYWRIGHT_MODULE;
  const { chromium } = await import(
    modulePath ? (modulePath.startsWith("file:") ? modulePath : pathToFileURL(modulePath).href) : "playwright"
  );
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const errors = [];
  async function open({ viewport = { width: 1280, height: 800 }, mobile = false, hub = null, init = null, query = "" } = {}) {
    const context = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));
    if (init) await page.addInitScript(init);
    // Keep local gameplay QA independent of the public account service.
    await page.route("https://api.donavencrenshaw.com/**", hub || ((route) => route.fulfill({ json: { user: null } })));
    await page.goto(`http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/${query}`);
    await ready(page);
    await page.locator("#connection-settings").evaluate((node) => { node.open = true; });
    await page.locator("#relay-url").fill(`ws://127.0.0.1:${server.port}/relay`);
    return { page, context };
  }
  return { server, open, errors };
}
const ready = (page) => page.evaluate(async () => {
  window.__diag = (await import("./client.js")).getDiagnostics;
});
const diag = (page) => page.evaluate(() => window.__diag());
const playing = (page, round) => page.waitForFunction(
  (r) => { const d = window.__diag(); return d.round === r && d.phase === "playing"; }, round, { timeout: 12000 });
async function pair(open, guestOptions = {}) {
  const { page: host } = await open();
  const guestSide = await open(guestOptions);
  await host.locator("#create").click();
  await host.waitForFunction(() => document.querySelector("#share-code").textContent.length === 8);
  const code = await host.locator("#share-code").textContent();
  await guestSide.page.locator("#room-code").fill(code);
  await guestSide.page.locator("#join").click();
  await playing(host, 1);
  await playing(guestSide.page, 1);
  return { host, guest: guestSide.page, guestContext: guestSide.context, code };
}
// Real keyboard flight and fire from the host until the guest's hull is gone.
async function hostWins(host, guest) {
  await host.keyboard.down("w");
  await host.waitForTimeout(2700);
  await host.keyboard.up("w");
  await host.keyboard.down("x");
  await host.waitForTimeout(400);
  await host.keyboard.up("x");
  await host.keyboard.down("Space");
  await host.locator("#result").waitFor({ state: "visible", timeout: 9000 });
  await host.keyboard.up("Space");
  await guest.locator("#result").waitFor({ state: "visible" });
}

test("after-match lobby: guest changes ship, host changes arena, everyone readies and round 2 uses both", { skip, timeout: 90000 }, async (t) => {
  const { server, open, errors } = await launch(t);
  const { host, guest } = await pair(open, { viewport: { width: 375, height: 812 }, mobile: true });
  await hostWins(host, guest);
  for (const page of [host, guest]) await page.locator("#after-lobby").waitFor({ state: "visible" });
  assert.equal(await host.locator("#result-title").textContent(), "You won.");
  assert.equal(await guest.locator("#lobby-arena").isHidden(), true, "only the host picks the arena");
  await host.locator("#rematch").click();
  await guest.waitForFunction(() => window.__diag().lobby?.seats[0].ready === true);
  assert.match(await guest.locator("#lobby-seats").textContent(), /Cyan · Medium · ready/);
  // The guest reworks their ship with the same builder as the front page.
  await guest.locator("#lobby-ship summary").click();
  await guest.locator("#after-lobby .ship-classes label").nth(2).click();
  await guest.evaluate(() => {
    for (const [id, value] of [["ship-body", "#224466"], ["ship-accent", "#ff3366"]]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const heavy = { classId: "heavy", bodyColor: "#224466", accentColor: "#ff3366" };
  await host.waitForFunction(() => {
    const seat = window.__diag().lobby?.seats[1];
    return seat?.loadout.classId === "heavy" && seat.loadout.accentColor === "#ff3366";
  });
  assert.equal((await diag(host)).lobby.seats[0].ready, false, "a ship change un-readies everyone");
  assert.equal(await host.locator("#rematch").isEnabled(), true);
  assert.match(await host.locator("#rematch-status").textContent(), /press Ready again/i);
  assert.match(await host.locator("#lobby-seats").textContent(), /Orange · Heavy · not ready/);
  // The host switches the arena; the guest sees it named.
  await host.locator("#lobby-arena summary").click();
  await host.getByRole("radio", { name: "Gravemaw", exact: true }).check();
  await guest.waitForFunction(() => window.__diag().lobby?.mapId === "gravemaw");
  assert.match(await guest.locator("#lobby-map").textContent(), /Gravemaw · the host picks/);
  // Phone-width lobby: no sideways scroll, Ready reachable.
  assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth), 375);
  await guest.locator("#rematch").scrollIntoViewIfNeeded();
  const box = await guest.locator("#rematch").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.y + box.height <= 812);
  const shot = join(tmpdir(), "stardust-dogfight-lobby-phone.png");
  await guest.screenshot({ path: shot });
  await guest.locator("#rematch").click();
  await host.locator("#rematch").click();
  for (const page of [host, guest]) {
    await playing(page, 2);
    const d = await diag(page);
    assert.equal(d.mapId, "gravemaw");
    assert.deepEqual(d.ships[1].loadout, heavy);
    assert.deepEqual(d.hull, [100, 140]);
  }
  assert.equal(await guest.locator("#touch-controls").isVisible(), true);
  assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.equal(await host.locator("#ship-body").isDisabled(), true, "the ship locks again during the round");
  assert.equal(server.rooms.size, 1);
  assert.deepEqual(errors, []);
  t.diagnostic(`Round 2 on Gravemaw with the guest's new Heavy on both clients. Phone lobby: ${shot}`);
});

test("guest drop mid-round: host pauses with a 5 s countdown, guest reconnects by token (auto and after reload) and play resumes", { skip, timeout: 90000 }, async (t) => {
  const { server, open, errors } = await launch(t);
  // Lets the test hold the guest's network down while the page retries.
  const blockable = () => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url, ...rest) {
        super(window.__blockRelay ? "ws://127.0.0.1:9/relay" : url, ...rest);
      }
    };
  };
  const { host, guest, code } = await pair(open, { init: blockable });
  assert.equal((await diag(guest)).seatHeld, true);
  await guest.evaluate(() => { window.__blockRelay = true; });
  const dropped = Date.now();
  for (const socket of server.wss.clients) if (socket.room && socket.playerId === 1) socket.terminate();
  await host.locator("#pause-panel").waitFor({ state: "visible" });
  assert.match(await host.locator("#pause-text").textContent(), /Waiting for Orange… \(rejoin window\) · you can continue without them in \ds/);
  assert.equal(await host.locator("#pause-actions").isHidden(), true);
  await guest.locator("#reconnect-actions").waitFor({ state: "visible" });
  assert.match(await guest.locator("#pause-text").textContent(), /Reconnecting to your seat/);
  // The host's simulation holds still.
  const held = (await diag(host)).tick;
  await host.waitForTimeout(700);
  assert.equal((await diag(host)).tick, held);
  assert.equal((await diag(host)).paused, true);
  await host.locator("#pause-actions").waitFor({ state: "visible", timeout: 7000 });
  assert.ok(Date.now() - dropped >= 4500, "buttons unlock after the countdown");
  await host.locator("#keep-waiting").click();
  await host.locator("#keep-waiting").waitFor({ state: "hidden" });
  assert.equal(await host.locator("#continue-without").isVisible(), true);
  assert.match(await host.locator("#pause-text").textContent(), /Still waiting for Orange/);
  // The network comes back; the page's own retries reclaim the seat.
  await guest.evaluate(() => { window.__blockRelay = false; });
  await guest.waitForFunction(() => !window.__diag().reconnecting && window.__diag().round === 1, null, { timeout: 15000 });
  await host.waitForFunction(() => /Resuming in/.test(document.getElementById("pause-text").textContent));
  await host.waitForFunction(() => !window.__diag().paused, null, { timeout: 6000 });
  await guest.waitForFunction(() => window.__diag().phase === "playing" && window.__diag().snapshotsReceived > 5);
  const resumed = (await diag(host)).tick;
  const before = (await diag(host)).ships[1];
  await guest.keyboard.down("w");
  await guest.waitForTimeout(500);
  await guest.keyboard.up("w");
  assert.ok((await diag(host)).tick > resumed, "the host simulates again");
  const after = (await diag(host)).ships[1];
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.2, "the rejoined guest flies the same seat");
  t.diagnostic("Paused host, 5 s countdown, Keep waiting, automatic token rejoin, 3-2-1 resume and guest control verified.");

  // A reloaded tab still holds the token for this tab and offers the seat back.
  await guest.reload();
  await ready(guest);
  await host.locator("#pause-panel").waitFor({ state: "visible" });
  await guest.locator("#rejoin-offer").waitFor({ state: "visible" });
  assert.equal(await guest.locator("#rejoin-text").textContent(), `You were in room ${code}. Rejoin your seat?`);
  assert.equal((await diag(guest)).role, null, "no automatic join after a reload");
  await guest.locator("#rejoin-yes").click();
  await guest.waitForFunction(() => window.__diag().round === 1 && window.__diag().playerId === 1 && window.__diag().phase === "playing");
  await host.waitForFunction(() => !window.__diag().paused, null, { timeout: 8000 });
  assert.equal(server.rooms.get(code).players.filter(Boolean).length, 2);
  assert.deepEqual(errors, []);
});

test("Continue without them ends a duel as a casual host win; a friend opening the room link takes the open seat", { skip, timeout: 90000 }, async (t) => {
  const { server, open, errors } = await launch(t);
  const { host, guestContext, code } = await pair(open);
  await guestContext.close();
  await host.locator("#pause-panel").waitFor({ state: "visible" });
  await host.locator("#pause-actions").waitFor({ state: "visible", timeout: 8000 });
  assert.match(await host.locator("#continue-without").textContent(), /win by forfeit/);
  await host.locator("#continue-without").click();
  await host.locator("#result").waitFor({ state: "visible" });
  assert.equal(await host.locator("#result-title").textContent(), "You won.");
  assert.match(await host.locator("#result-detail").textContent(), /never count toward account stats/);
  assert.equal(await host.locator("#pause-panel").isHidden(), true);
  await host.waitForFunction(() => window.__diag().lobby?.seats[1].presence === "open");
  assert.match(await host.locator("#lobby-seats").textContent(), /Orange · open seat/);
  await host.locator("#lobby-copy-link").click();
  await host.waitForFunction(() => /copied|room=/.test(document.getElementById("rematch-status").textContent));
  // A shared link asks first; nothing joins until the click.
  const { page: friend } = await open({ query: `?room=${code}` });
  await friend.locator("#link-join").waitFor({ state: "visible" });
  assert.equal(await friend.locator("#link-join-text").textContent(), `Join room ${code}?`);
  assert.equal(await friend.locator("#room-code").inputValue(), code);
  await friend.waitForTimeout(300);
  assert.equal((await diag(friend)).role, null);
  await friend.locator("#link-join-yes").click();
  await friend.locator("#after-lobby").waitFor({ state: "visible" });
  assert.equal(await friend.locator("#result-title").textContent(), "Welcome aboard");
  assert.equal((await diag(friend)).playerId, 1);
  assert.equal(await friend.evaluate(() => location.search), "");
  await host.waitForFunction(() => window.__diag().lobby?.seats[1].presence === "here");
  await host.locator("#rematch").click();
  await friend.locator("#rematch").click();
  await playing(host, 2);
  await playing(friend, 2);
  assert.deepEqual((await diag(friend)).hull, [100, 100]);
  assert.equal(server.rooms.size, 1);
  assert.deepEqual(errors, []);
});

test("an older page (no lobby protocol, hello v2) still finishes a match and rematches on the new relay", { skip, timeout: 90000 }, async (t) => {
  const { server, open, errors } = await launch(t);
  // Behave like the page before relay v3: no protocol field, a v2 hello, and
  // nothing learned from lobby messages or seat tokens.
  const olderPage = () => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      send(data) {
        try {
          const message = JSON.parse(data);
          if (["create", "join", "rejoin"].includes(message.type)) {
            delete message.protocol;
            data = JSON.stringify(message);
          }
        } catch {}
        return super.send(data);
      }
      addEventListener(type, listener, options) {
        if (type !== "message") return super.addEventListener(type, listener, options);
        return super.addEventListener(type, (event) => {
          let message;
          try { message = JSON.parse(event.data); } catch { return listener(event); }
          if (message.type === "lobby") return;
          if (message.type === "hello") message.version = 2;
          delete message.seatToken;
          listener(new MessageEvent("message", { data: JSON.stringify(message) }));
        }, options);
      }
    };
  };
  const received = [];
  const { page: host } = await open();
  const { page: guest, context: guestContext } = await open({ init: olderPage });
  guest.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => received.push(JSON.parse(payload).type)));
  await host.locator("#create").click();
  await host.waitForFunction(() => document.querySelector("#share-code").textContent.length === 8);
  const code = await host.locator("#share-code").textContent();
  await guest.locator("#room-code").fill(code);
  await guest.locator("#join").click();
  await playing(host, 1);
  await playing(guest, 1);
  await hostWins(host, guest);
  assert.equal(await guest.locator("#result-title").textContent(), "Opponent wins.");
  assert.equal(await host.locator("#after-lobby").isHidden(), true, "no lobby with an older page in the room");
  assert.equal(await host.locator("#rematch").textContent(), "Ready for rematch");
  assert.equal((await diag(host)).lobby, null);
  assert.equal((await diag(guest)).relayVersion, 2);
  assert.equal((await diag(guest)).seatHeld, false);
  await host.locator("#rematch").click();
  await guest.locator("#rematch").click();
  await playing(host, 2);
  await playing(guest, 2);
  assert.deepEqual((await diag(guest)).hull, [100, 100]);
  assert.equal(received.includes("lobby"), false, "the relay sends no lobby state to an older room");
  // Older rules: a drop closes the room.
  await guestContext.close();
  await host.waitForFunction(() => window.__diag().phase === "lobby");
  assert.match(await host.locator("#status").textContent(), /disconnected/i);
  assert.equal(server.rooms.size, 0);
  assert.deepEqual(errors, []);
});

test("friend invites: host invites from the friends list (errors shown plainly), friend sees the invite and joins with a click", { skip, timeout: 60000 }, async (t) => {
  const { server, open, errors } = await launch(t);
  const origin = `http://127.0.0.1:${server.port}`;
  const posted = [], deleted = [];
  let roomCode = "";
  const hub = (user, extra = {}) => async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const reply = (status, body) => route.fulfill({ status, headers, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/users/session") return reply(200, { user });
    if (url.pathname === "/api/dogfight/ticket") return reply(200, { ticket: "local-test" });
    if (url.pathname === "/api/friends") return reply(200, { friends: extra.friends || [] });
    if (url.pathname === "/api/dogfight/invites" && method === "POST") {
      const body = JSON.parse(request.postData());
      posted.push(body);
      if (body.to === "rook") return reply(409, { error: "not_friends", message: "Not friends." });
      return reply(201, { invite: { id: "inv-1", code: body.code, from: { username: "ace", displayName: "Ace" }, to: { username: body.to, displayName: "Nova" }, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 6e5).toISOString() } });
    }
    if (url.pathname === "/api/dogfight/invites" && method === "GET")
      return reply(200, { invites: roomCode ? [{ id: "inv-1", code: roomCode, from: { username: "ace", displayName: "Ace" }, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 6e5).toISOString() }] : [] });
    if (url.pathname.startsWith("/api/dogfight/invites/") && method === "DELETE") {
      deleted.push(decodeURIComponent(url.pathname.split("/").pop()));
      return route.fulfill({ status: 204, headers });
    }
    return reply(404, { error: "not_found" });
  };
  const { page: host } = await open({
    hub: hub({ username: "ace", displayName: "Ace" }, {
      friends: [{ username: "nova", displayName: "<b>Nova</b>", avatarUrl: null, since: "2026-09-01" }, { username: "rook", displayName: "Rook" }],
    }),
  });
  await host.waitForFunction(() => /Signed in as Ace/.test(document.getElementById("account-line").textContent));
  await host.locator("#create").click();
  await host.waitForFunction(() => document.querySelector("#share-code").textContent.length === 8);
  roomCode = await host.locator("#share-code").textContent();
  await host.locator("#invite-friends").waitFor({ state: "visible" });
  await host.locator("#invite-friends summary").click();
  const nova = host.locator("#friend-list li").filter({ hasText: "<b>Nova</b>" });
  assert.equal(await host.locator("#friend-list b").count(), 0, "friend names are text, not markup");
  await nova.getByRole("button", { name: "Invite" }).click();
  await host.waitForFunction(() => [...document.querySelectorAll("#friend-list button")].some((b) => b.textContent === "Invited" && b.disabled));
  assert.deepEqual(posted[0], { to: "nova", code: roomCode });
  await host.locator("#friend-list li").filter({ hasText: "Rook" }).getByRole("button", { name: "Invite" }).click();
  await host.waitForFunction(() => /friends list/.test(document.getElementById("invite-status").textContent));
  assert.match(await host.locator("#invite-status").getAttribute("class"), /error/);
  await host.locator("#copy-link").click();
  await host.waitForFunction(() => /copied|room=/.test(document.getElementById("status").textContent));
  // Nova, signed in and not in a room, sees the invite and joins with a click.
  const { page: friend } = await open({ hub: hub({ username: "nova", displayName: "Nova" }) });
  await friend.locator("#invites").waitFor({ state: "visible" });
  assert.equal(await friend.locator("#invite-list li span").first().textContent(), "Ace invited you to a room");
  assert.equal((await diag(friend)).role, null);
  await friend.locator("#invite-list").getByRole("button", { name: "Join" }).click();
  await playing(host, 1);
  await playing(friend, 1);
  assert.equal((await diag(friend)).roomCode, roomCode);
  assert.deepEqual(deleted, ["inv-1"]);
  assert.equal(await friend.locator("#invites").isHidden(), true);
  assert.deepEqual(errors, []);
});
