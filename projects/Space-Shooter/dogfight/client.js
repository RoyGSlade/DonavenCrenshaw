import { MATCH_MODES, isMode, modeSeats, PILOT_COLORS, PILOT_NAMES, voteKey } from "./modes.js";
import {
  RULES,
  NEUTRAL,
  createMatch,
  stepMatch,
  snapshot,
} from "./simulation.js";
import { inputControls, cleanSnapshot } from "./protocol.js";
import { MAPS, createArena, isMapId, ventPhase } from "./maps.js";
import { createMapPicker } from "./mapPicker.js";
import { drawTerrain } from "./terrainView.js";
import { cleanLoadout, shipStats } from "./ships.js";
import { createShipBuilder } from "./shipBuilder.js";
import { drawCustomShip } from "./shipArt.js";
import { updateShipHud } from "./shipHud.js";
import { drawLaserTraps, drawTrapLock, updateTrapHud } from "./laserTrapView.js";
import { connectRelay, defaultRelay, relayAddress } from "./transport.js";
import {
  createTiltController,
  toggleMobileFullscreen,
  isFullscreen,
  watchFullscreen,
} from "../systems/mobileControls.js";
import { runtimeConfig } from "../runtime-config.js";
import { validateBackendUrl } from "../systems/backend.js";

// Accounts. A signed-in pilot hands the relay a short-lived ticket from the hub;
// when both duel pilots do, the relay reports the winner to the hub. FFA is casual.
let hubOrigin = null;
try {
  const base = validateBackendUrl(runtimeConfig.backendBaseUrl);
  hubOrigin = base ? new URL(base).origin : null;
} catch {}
let pilot = null;
let counted = false;
let opponentCounted = false;
async function hubJson(path, method = "GET") {
  if (!hubOrigin) return null;
  try {
    const res = await fetch(`${hubOrigin}${path}`, { method, credentials: "include", cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
async function paintAccountLine() {
  const line = document.getElementById("account-line");
  if (!line || !hubOrigin) return;
  const session = await hubJson("/api/users/session");
  pilot = session?.user || null;
  line.replaceChildren();
  if (pilot) {
    line.append(`Signed in as ${pilot.displayName || pilot.username}. Duels count when your opponent is signed in too. Three-player matches are casual.`);
  } else if (session) {
    const a = document.createElement("a");
    a.href = new URL("../../../account/?next=/games/stardust/dogfight/", location.href).href;
    a.textContent = "Sign in";
    line.append("Playing as a guest: wins aren’t recorded. ", a, " to count duels. Three-player matches are casual.");
  } else {
    line.append("Account service unavailable. You can still play as a guest. Three-player matches are casual.");
  }
}
paintAccountLine();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !role) paintAccountLine();
});

import { createGamepadReader } from "../systems/gamepad.js";
const gamepad = createGamepadReader();
let inputFocused = true;
const $ = (id) => document.getElementById(id),
  canvas = $("arena"),
  ctx = canvas.getContext("2d");
const shipBuilder = createShipBuilder($("ship-builder"));
const mapPicker = createMapPicker($("map-picker"));
const arenaPreviews = Object.fromEntries(Object.keys(MAPS).map(id => [id, createArena(id)]));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const rockImage = new Image();
rockImage.src = "../art/asteroid-v1.png";
let connection = null,
  connecting = false,
  role = null,
  playerId = null,
  mode = "duel",
  roomCode = "",
  round = 0,
  match = null,
  roundEnded = false;
let previous = null,
  latest = null,
  previousAt = 0,
  latestAt = 0,
  remoteInputs = new Map(),
  inputSeq = 0;
let accumulator = 0,
  lastFrame = performance.now(),
  lastSnapshot = 0,
  lastTickSent = -1;
const keyCodes = new Map();
const held = new Set(),
  touch = new Map();
const counters = { snapshotsReceived: 0, inputsSent: 0 };
let localTrapPressed = false;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const bindings = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "thrust",
  ArrowUp: "thrust",
  KeyS: "reverse",
  ArrowDown: "reverse",
  KeyQ: "strafeLeft",
  KeyE: "strafeRight",
  KeyX: "brake",
  KeyF: "trap",
  ControlLeft: "fire",
  ControlRight: "fire",
  Space: "fire",
  KeyR: "reverse",
  ShiftLeft: "boost",
  ShiftRight: "boost",
};
const tilt = createTiltController({
  onChange(state) {
    $("enable-tilt").textContent = state.enabled
      ? "Disable tilt"
      : "Enable tilt";
    $("enable-tilt").disabled = state.status === "requesting";
    $("recenter-tilt").disabled = !state.enabled;
    $("tilt-status").textContent = state.message;
  },
});
$("enable-tilt").addEventListener("click", async () => {
  if (tilt.getState().enabled) tilt.disable();
  else await tilt.enable();
});
$("recenter-tilt").addEventListener("click", () => tilt.calibrate());
$("fullscreen").addEventListener("click", async () => {
  const result = await toggleMobileFullscreen();
  if (!result.ok) $("tilt-status").textContent = result.message;
});
watchFullscreen(() => {
  $("fullscreen").textContent = isFullscreen()
    ? "Exit fullscreen"
    : "Fullscreen";
});
function controls() {
  const gp = gamepad.poll(navigator.getGamepads?.() || [], {
    active: inputFocused && !document.hidden,
  });
  if (gp.fullscreenEdge)
    toggleMobileFullscreen().then((result) => {
      if (!result.ok) $("tilt-status").textContent = result.message;
    });
  const own = (role === "guest" ? latest || match : match)?.ships[playerId];
  if (!inputFocused || document.hidden || !match || roundEnded || own?.hp <= 0)
    return { ...NEUTRAL };
  const on = (key) => held.has(key) || Array.from(touch.values()).includes(key);
  const thrustStrength = on("thrust") ? 1 : gp.thrustStrength;
  const backStrength = on("reverse") ? 0.6 : gp.backStrength;
  const strafe =
    on("strafeLeft") || on("strafeRight")
      ? ((on("strafeRight") ? 1 : 0) - (on("strafeLeft") ? 1 : 0)) * 0.6
      : gp.strafe;
  const tiltAxis = tilt.getAxis();
  return {
    turn:
      on("right") || on("left")
        ? (on("right") ? 1 : 0) - (on("left") ? 1 : 0)
        : tiltAxis || gp.turnStrength,
    thrust: thrustStrength > 0,
    reverse: backStrength > 0,
    thrustStrength,
    backStrength,
    strafe,
    boost: on("boost") || gp.boost,
    brake: on("brake") || gp.brake,
    fire: on("fire") || gp.shoot,
    trap: on("trap") || gp.trap || localTrapPressed,
  };
}
function clearControls() {
  localTrapPressed = false;
  gamepad.suspend();
  held.clear();
  keyCodes.clear();
  touch.clear();
  tilt.suspend();
  for (const button of document.querySelectorAll("[data-key]"))
    button.classList.remove("pressed");
  sendInput();
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function setBusy(busy) {
  connecting = busy;
  $("mode-picker").disabled = busy || !!role;
  shipBuilder.setLocked(busy || !!role);
  mapPicker.setLocked(busy || !!role);
  $("create").disabled = busy || !!role;
  $("join").disabled = busy || !!role;
  $("relay-url").disabled = busy || !!role;
  $("room-code").disabled = busy || !!role;
}
function showLobby(message) {
  $("lobby").hidden = false;
  $("result").hidden = true;
  $("countdown").hidden = true;
  $("match-hud").hidden = true;
  $("ship-hud").hidden = true;
  $("trap-hud").hidden = true;
  $("arena-brief").hidden = true;
  $("flight-footer").hidden = true;
  $("touch-controls").hidden = true;
  $("waiting").hidden = !role;
  $("spectator-status").hidden = true;
  $("leave").hidden = !role;
  setBusy(false);
  if (message) status(message);
}
function resetRoom(message) {
  role = null;
  playerId = null;
  remoteInputs.clear();
  clearControls();
  roomCode = "";
  round = 0;
  match = null;
  previous = null;
  latest = null;
  roundEnded = false;
  showLobby(message);
}
function leave() {
  const old = connection;
  connection = null;
  if (old) old.close();
  resetRoom("You left the room. Create or join another match.");
}
function sendInput() {
  if (role === "guest" && round && !roundEnded && connection) {
    inputSeq++;
    if (
      connection.send(
        {
          type: "input",
          round,
          seq: inputSeq,
          controls: document.hidden ? { ...NEUTRAL } : controls(),
        },
        true,
      )
    )
      counters.inputsSent++;
  }
}
function publish() {
  if (role !== "host" || !match || roundEnded || match.tick === lastTickSent)
    return;
  if (
    connection?.send(
      { type: "snapshot", state: snapshot(match) },
      match.phase !== "finished",
    )
  )
    lastTickSent = match.tick;
}
function finishView(winner, reason) {
  roundEnded = true;
  clearControls();
  $("countdown").hidden = true;
  $("result").hidden = false;
  $("touch-controls").hidden = true;
  const mine = playerId;
  const interrupted = ["host-hidden", "host-stalled"].includes(reason);
  $("result-title").textContent = interrupted
    ? "Round interrupted"
    : winner === null
      ? "Draw"
      : winner === mine
        ? "You won."
        : mode === "ffa3" ? `${PILOT_NAMES[winner]} wins.` : "Opponent wins.";
  $("result-detail").textContent =
    reason === "host-hidden"
      ? "The host tab was hidden. All pilots can ready up again when it is visible."
      : reason === "host-stalled"
        ? "The host stopped delivering live simulation. Keep its browser foregrounded, then try a rematch."
        : reason === "time"
          ? "Time expired. The pilot with the higher hull percentage wins."
          : mode === "ffa3" ? "Last ship standing. Same ships, new round?" : "One hull down. Same ships, new round?";
  if (mode === "duel" && !interrupted && winner !== null && counted && opponentCounted)
    $("result-detail").textContent += " This duel is eligible for account stats.";
  $("rematch").disabled = false;
  $("rematch-status").textContent = "All pilots must ready up for a rematch.";
}
function abortHost(reason) {
  if (role !== "host" || !match || roundEnded) return;
  connection?.send({ type: "abort", reason });
  finishView(null, reason);
}
function receive(message) {
  if (message.type === "hello") return;
  if (message.type === "error") {
    status(
      typeof message.message === "string"
        ? message.message.slice(0, 200)
        : "Relay rejected the request.",
      true,
    );
    setBusy(false);
    return;
  }
  if (message.type === "room") {
    if (
      !["host", "guest"].includes(message.role) ||
      typeof message.code !== "string" ||
      message.code.length !== 8
    )
      return;
    const roomMode = message.mode ?? "duel";
    const assignedId = message.playerId ?? (message.role === "host" ? 0 : 1);
    if (!isMode(roomMode) || !Number.isInteger(assignedId) || assignedId < 0 || assignedId >= modeSeats(roomMode) ||
        (message.role === "host") !== (assignedId === 0) ||
        (message.role === "host" && $("match-mode").value === "ffa3" && roomMode !== "ffa3")) {
      leave(); status("This relay needs the three-player update. Connect to an updated relay.", true); return;
    }
    mode = roomMode;
    playerId = assignedId;
    $("match-mode").value = mode;
    $("mode-label").textContent = "/ " + MATCH_MODES[mode].label;
    canvas.setAttribute("aria-label", mode === "ffa3" ? "Dogfight arena: cyan, orange and violet pilots" : "Dogfight arena: cyan pilot against orange pilot");
    role = message.role;
    if (isMapId(message.mapId)) mapPicker.select(message.mapId);
    roomCode = message.code;
    counted = message.counted === true;
    opponentCounted = message.opponentCounted === true;
    $("share-code").textContent = roomCode;
    $("role-label").textContent =
      `${PILOT_NAMES[playerId].toUpperCase()} / ${role.toUpperCase()} · ROOM ${roomCode}`;
    showLobby(
      role === "host"
        ? `Room created. Waiting for ${modeSeats(mode) - 1} other pilot${mode === "ffa3" ? "s" : ""}.`
        : `Joined. Preparing the round.${mode === "duel" && counted && opponentCounted ? " Both pilots are signed in, so this duel counts." : ""}`,
    );
    return;
  }
  if (message.type === "opponent") {
    opponentCounted = mode === "duel" && message.counted === true;
    if (counted && opponentCounted) status("Your opponent is signed in too, so this duel counts.");
    return;
  }
  if (message.type === "roster" && role && message.mode === mode && Array.isArray(message.players)) {
    const count = message.players.length;
    if (count >= 1 && count <= modeSeats(mode)) {
      $("waiting-status").textContent = `${count} / ${modeSeats(mode)} pilots connected. Share this room code with your friends.`;
      status(count < modeSeats(mode) ? `Waiting for ${modeSeats(mode) - count} more pilot(s).` : "All pilots connected. Preparing the round.");
    }
    return;
  }
  if (message.type === "closed") {
    // The relay closes sockets that sit outside a room; let go of this one now.
    const old = connection;
    connection = null;
    if (old) old.close();
    resetRoom(
      typeof message.reason === "string"
        ? message.reason.slice(0, 200)
        : "Room closed.",
    );
    return;
  }
  if (message.type === "start") {
    if (
      !role ||
      !Number.isSafeInteger(message.round) ||
      message.round < 1 ||
      !Number.isInteger(message.seed) ||
      message.seed < 0 ||
      message.seed > 4294967295
    )
      return;
    if (!Array.isArray(message.loadouts) || message.loadouts.length !== modeSeats(mode) || (message.mode ?? "duel") !== mode ||
        message.loadouts.some(loadout => !cleanLoadout(loadout))) {
      leave();
      status("This relay needs the ship customization update. Connect to an updated relay.", true);
      return;
    }
    if (!isMapId(message.mapId)) {
      leave();
      status("This relay needs the arena update. Connect to an updated relay.", true);
      return;
    }
    round = message.round;
    match = createMatch(message.seed, round, message.loadouts, message.mapId, mode);
    mapPicker.select(message.mapId);
    roundEnded = false;
    remoteInputs = new Map();
    inputSeq = 0;
    previous = null;
    latest = null;
    lastTickSent = -1;
    accumulator = 0;
    lastFrame = performance.now();
    lastSnapshot = 0;
    clearControls();
    $("ship-health2").hidden = mode !== "ffa3";
    $("spectator-status").hidden = true;
    $("lobby").hidden = true;
    $("waiting").hidden = true;
    $("result").hidden = true;
    $("match-hud").hidden = false;
    $("ship-hud").hidden = false;
    $("trap-hud").hidden = false;
    $("arena-brief").hidden = false;
    $("arena-name").textContent = MAPS[match.mapId].name;
    $("arena-name").style.color = MAPS[match.mapId].color;
    $("flight-footer").hidden = false;
    $("leave").hidden = false;
    $("touch-controls").hidden = false;
    $("countdown").hidden = false;
    $("countdown").textContent = "3";
    canvas.focus({ preventScroll: true });
    if (role === "host") {
      publish();
      if (document.hidden) abortHost("host-hidden");
    }
    return;
  }
  if (message.type === "input" && role === "host" && message.round === round) {
    const id = message.playerId ?? 1;
    if (!Number.isInteger(id) || id < 1 || id >= modeSeats(mode) || !Number.isSafeInteger(message.seq)) return;
    const prior = remoteInputs.get(id);
    if (message.seq <= (prior?.seq ?? -1)) return;
    const valid = inputControls(message.controls);
    if (valid) remoteInputs.set(id, {
      controls: valid, seq: message.seq, at: performance.now(),
      trapPressed: !!prior?.trapPressed || (valid.trap && !prior?.controls.trap),
    });
    return;
  }
  if (message.type === "snapshot" && role === "guest") {
    const data = cleanSnapshot(message.state, round, match?.ships.map(ship => ship.loadout), match?.mapId, mode);
    if (!data || (latest && data.tick <= latest.tick)) return;
    previous = latest;
    previousAt = latestAt;
    latest = data;
    latestAt = performance.now();
    counters.snapshotsReceived++;
    return;
  }
  if (
    message.type === "result" &&
    message.round === round &&
    (message.winner === null || (Number.isInteger(message.winner) && message.winner >= 0 && message.winner < modeSeats(mode))) &&
    ["time", "hull", "host-hidden", "host-stalled"].includes(message.reason)
  ) {
    finishView(message.winner, message.reason);
    return;
  }
  if (message.type === "votes" && message.votes) {
    $("rematch-status").textContent =
      Array.from({ length: modeSeats(mode) }, (_, id) => `${PILOT_NAMES[id]}: ${message.votes[voteKey(id)] ? "ready" : "waiting"}`).join(" · ");
  }
}
async function requestRoom(type) {
  if (connecting || role) return;
  let url;
  try {
    url = relayAddress($("relay-url").value);
  } catch (error) {
    status(error.message, true);
    return;
  }
  const code = $("room-code").value.trim().toUpperCase();
  if (type === "join" && !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    status("Enter the eight-character room code from your friend.", true);
    return;
  }
  setBusy(true);
  status("Connecting to relay…");
  try {
    if (connection) connection.close();
    const next = connectRelay(
      url,
      (message) => {
        if (connection === next) receive(message);
      },
      () => {
        if (connection !== next) return;
        connection = null;
        resetRoom(
          "Relay disconnected. The round has ended. Reconnect to play again.",
        );
      },
    );
    connection = next;
    await next.ready;
    if (connection !== next) return;
    try {
      localStorage.setItem("stardust.dogfight.relay", url);
    } catch {}
    $("relay-url").value = url;
    status(type === "create" ? "Creating room…" : "Joining room…");
    const ticket = pilot ? (await hubJson("/api/dogfight/ticket", "POST"))?.ticket : null;
    if (connection !== next) return;
    const request = { type, ...(type === "join" ? { code } : { mapId: mapPicker.getMapId(), mode: $("match-mode").value }), loadout: shipBuilder.getLoadout() };
    if (typeof ticket === "string") request.ticket = ticket;
    next.send(request);
  } catch (error) {
    status(error.message, true);
    $("connection-settings").open = true;
    setBusy(false);
  }
}
$("create").addEventListener("click", () => requestRoom("create"));
$("join").addEventListener("click", () => requestRoom("join"));
$("room-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") requestRoom("join");
});
$("leave").addEventListener("click", leave);
$("result-leave").addEventListener("click", leave);
$("rematch").addEventListener("click", () => {
  if (!connection || !role || !roundEnded) return;
  if (document.hidden) {
    $("rematch-status").textContent = "Return to this tab before readying.";
    return;
  }
  $("rematch").disabled = true;
  connection.send({ type: "rematch", round });
  $("rematch-status").textContent = "Ready. Waiting for the other pilots.";
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    status("Room code copied.");
  } catch {
    status(`Copy this room code: ${roomCode}`);
  }
});
window.addEventListener("keydown", (event) => {
  if (!match || roundEnded || event.target.matches("input,button,a")) return;
  const action = bindings[event.code];
  if (event.repeat && !held.has(action)) return;
  if (action) {
    event.preventDefault();
    const changed = !held.has(action);
    keyCodes.set(event.code, action);
    held.add(action);
    if (changed && action === "trap" && role === "host") localTrapPressed = true;
    if (changed) sendInput();
  }
});
window.addEventListener("keyup", (event) => {
  const action = bindings[event.code];
  if (action) {
    keyCodes.delete(event.code);
    if (![...keyCodes.values()].includes(action)) held.delete(action);
    sendInput();
  }
});
window.addEventListener("blur", () => {
  inputFocused = false;
  clearControls();
});
window.addEventListener("focus", () => {
  inputFocused = true;
});
window.addEventListener("gamepaddisconnected", (event) => {
  gamepad.disconnect(event.gamepad.index);
  sendInput();
});
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", (event) => {
    if (!match || roundEnded) return;
    event.preventDefault();
    touch.set(event.pointerId, button.dataset.key);
    if (button.dataset.key === "trap" && role === "host") localTrapPressed = true;
    button.classList.add("pressed");
    button.setPointerCapture(event.pointerId);
    sendInput();
  });
  const release = (event) => {
    touch.delete(event.pointerId);
    button.classList.toggle(
      "pressed",
      Array.from(touch.values()).includes(button.dataset.key),
    );
    sendInput();
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearControls();
    abortHost("host-hidden");
  }
});
window.addEventListener("pagehide", () => {
  clearControls();
  connection?.close();
});
setInterval(sendInput, 1000 / 30);
let initial = defaultRelay();
try {
  initial = localStorage.getItem("stardust.dogfight.relay") || initial;
} catch {}
$("relay-url").value = initial;
$("connection-settings").open = !initial;
$("relay-help").textContent = initial
  ? "Relay selected. On your home Wi-Fi, all pilots open the same game link. For internet play, use the same configured secure relay."
  : "No public relay is configured. Enter your friend’s wss:// relay address to play online.";

function view(now) {
  if (role !== "guest") return match ? snapshot(match) : null;
  if (!latest) return match ? snapshot(match) : null;
  if (!previous) return latest;
  const t = clamp(
    (now - 75 - previousAt) / (latestAt - previousAt || 50),
    0,
    1,
  );
  const angle = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const positionT = (ship, i) => Math.hypot(ship.x - previous.ships[i].x, ship.y - previous.ships[i].y) > 3 ? 1 : t;
  return {
    ...latest,
    ships: latest.ships.map((ship, i) => ({
      ...ship,
      x: previous.ships[i].x + (ship.x - previous.ships[i].x) * positionT(ship, i),
      y: previous.ships[i].y + (ship.y - previous.ships[i].y) * positionT(ship, i),
      angle: angle(previous.ships[i].angle, ship.angle),
    })),
    traps: latest.traps.map(trap => {
      const old = previous.traps.find(p => p.id === trap.id);
      return old ? { ...trap, x: old.x + (trap.x - old.x) * t, y: old.y + (trap.y - old.y) * t } : trap;
    }),
    bullets: latest.bullets.map((b) => {
      const old = previous.bullets.find((p) => p.id === b.id);
      return old
        ? { ...b, x: old.x + (b.x - old.x) * t, y: old.y + (b.y - old.y) * t }
        : b;
    }),
  };
}
function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function render(now) {
  const dpr = Math.min(2, devicePixelRatio || 1),
    width = innerWidth,
    height = innerHeight;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const display = view(now), arena = match || arenaPreviews[mapPicker.getMapId()];
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    0,
    width * 0.5,
    height * 0.45,
    width * 0.7,
  );
  bg.addColorStop(0, MAPS[arena.mapId].background);
  bg.addColorStop(1, "#050c15");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const compact = width > height && height <= 600;
  const arenaTop = compact ? 61 : 122;
  const playableHeight = Math.max(120, height - arenaTop - (compact ? 12 : 53)),
    playableWidth = width - (compact ? 180 : 24),
    unit = Math.min(playableWidth / RULES.width, playableHeight / RULES.height),
    ox = (width - RULES.width * unit) / 2,
    oy = arenaTop + (playableHeight - RULES.height * unit) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(unit, unit);
  drawTerrain(ctx, arena, display, { rockImage, reducedMotion: reducedMotion.matches });
  if (display) {
    const phase = ventPhase(RULES.roundSeconds - display.remaining);
    $("arena-tip").textContent = arena.mapId === "stormworks"
      ? phase === "live" ? "VENTS LIVE · stay clear" : phase === "warning" ? "VENT WARNING · clear the marked lanes" : "VENTS SAFE · ride arrows for speed"
      : MAPS[arena.mapId].legend;
    drawLaserTraps(ctx, display, unit);
    for (const b of display.bullets) {
      ctx.fillStyle = PILOT_COLORS[b.owner];
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      circle(b.x, b.y, 0.085);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const ship of display.ships) {
      if (ship.hp <= 0) continue;
      const mine = playerId === ship.id,
        color = PILOT_COLORS[ship.id];
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = (mine ? 1.5 : 1) / unit;
      ctx.globalAlpha = mine ? 0.8 : 0.38;
      circle(0, 0, 0.65 * shipStats(ship).scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.rotate(ship.angle + Math.PI / 2);
      if (
        mine &&
        controls().thrust &&
        ship.trapLock <= 0 &&
        !roundEnded &&
        display.phase === "playing"
      ) {
        ctx.fillStyle = ship.loadout.accentColor;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(-0.12, 0.36);
        ctx.lineTo(0, 0.84);
        ctx.lineTo(0.12, 0.36);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = color;
      ctx.shadowBlur = ship.hit > 0 ? 20 : 5;
      drawCustomShip(ctx, ship.loadout, ship.hit > 0);
      ctx.restore();
    }
    for (const ship of display.ships) drawTrapLock(ctx, ship, unit);
    updateTrapHud(display, playerId, roundEnded);
    updateShipHud(display, playerId, { ox, oy, unit, width });
    const ownShip = display.ships[playerId];
    const eliminated = ownShip.hp <= 0 && !roundEnded && display.phase === "playing";
    $("spectator-status").hidden = !eliminated;
    $("spectator-status").textContent = role === "host" ? "Eliminated · watching the remaining pilots. Keep this host tab open." : "Eliminated · watching the remaining pilots.";
    $("touch-controls").hidden = eliminated || roundEnded;
    const cooldown = ownShip.boostCooldown || 0;
    $("boost-state").textContent =
      `Flux ${Math.floor(ownShip.flux || 0)} · ${Math.floor(ownShip.boost || 0)} pips · ${cooldown > 0.01 ? `${cooldown.toFixed(2)}s` : ownShip.flux >= 20 || ownShip.boost >= 1 ? "READY" : "EMPTY"}`;
    $("flight-energy").textContent = $("boost-state").textContent;
    $("flight-energy").textContent += ownShip.isOverheated ? " · GUN HOT — cooling" : ` · Gun heat ${Math.round(ownShip.heat || 0)}%`;
    $("boost-button").classList.toggle(
      "cooling",
      cooldown > 0.01 || !(ownShip.flux >= 20 || ownShip.boost >= 1),
    );
    const seconds = Math.ceil(display.remaining);
    $("round-clock").textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (!roundEnded) {
      $("countdown").hidden = display.phase !== "countdown";
      $("countdown").textContent = String(
        Math.max(1, Math.ceil(display.countdown)),
      );
    }
    $("network-status").textContent =
      role === "host"
        ? "Hosting · connected"
        : latestAt && now - latestAt > 1000
          ? "Waiting for host…"
          : "Connected";
  }
  ctx.restore();
}
function frame(now) {
  const elapsed = now - lastFrame;
  lastFrame = now;
  if (role === "host" && match && !roundEnded) {
    if (elapsed > 500) abortHost("host-stalled");
    else {
      accumulator += Math.min(0.25, elapsed / 1000);
      while (accumulator >= RULES.step) {
        const inputs = match.ships.map(ship => {
          if (ship.id === playerId) return controls();
          const remote = remoteInputs.get(ship.id);
          return remote && now - remote.at <= RULES.inputTimeout * 1000
            ? { ...remote.controls, trap: remote.controls.trap || remote.trapPressed } : NEUTRAL;
        });
        stepMatch(match, inputs);
        localTrapPressed = false;
        for (const remote of remoteInputs.values()) remote.trapPressed = false;
        accumulator -= RULES.step;
      }
      if (now - lastSnapshot >= 50 || match.phase === "finished") {
        lastSnapshot = now;
        publish();
      }
    }
  }
  render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
export function getDiagnostics() {
  return {
    mapId: match?.mapId || null,
    terrain: (role === "guest" ? latest : match ? snapshot(match) : null)?.terrain || null,
    role,
    playerId,
    mode,
    winner: (latest || match)?.winner ?? null,
    roomCode,
    round,
    phase: roundEnded
      ? "finished"
      : (role === "guest" ? latest?.phase : match?.phase) || "lobby",
    hull: (latest || match)?.ships.map((s) => s.hp) || [],
    ships: (latest || match)?.ships.map(s => ({ id: s.id, x: s.x, y: s.y, angle: s.angle, vx: s.vx, vy: s.vy, hp: s.hp,
      maxHp: shipStats(s).hp, loadout: { ...s.loadout } })) || [],
    snapshotsReceived: counters.snapshotsReceived,
    inputsSent: counters.inputsSent,
    bufferedAmount: connection?.socket.bufferedAmount || 0,
    controls: controls(),
    tilt: tilt.getState(),
    gamepad: gamepad.getState(),
    trapCooldown: (role === "guest" ? latest : match)?.ships[playerId]?.trapCooldown ?? 0,
    trapLock: (role === "guest" ? latest : match)?.ships[playerId]?.trapLock ?? 0,
    traps: (role === "guest" ? latest : match)?.traps.length ?? 0,
    boostCooldown:
      (role === "guest" ? latest : match)?.ships[playerId]
        ?.boostCooldown ?? 0,
  };
}
