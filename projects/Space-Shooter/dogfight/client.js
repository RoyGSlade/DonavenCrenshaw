import {
  RULES,
  NEUTRAL,
  createMatch,
  stepMatch,
  snapshot,
} from "./simulation.js";
import { inputControls, cleanSnapshot } from "./protocol.js";
import { connectRelay, defaultRelay, relayAddress } from "./transport.js";
import {
  createTiltController,
  toggleMobileFullscreen,
  isFullscreen,
  watchFullscreen,
} from "../systems/mobileControls.js";

const $ = (id) => document.getElementById(id),
  canvas = $("arena"),
  ctx = canvas.getContext("2d");
const shipImage = new Image(),
  rockImage = new Image();
shipImage.src = "../art/player-ship.png";
rockImage.src = "../art/asteroid-v1.png";
let connection = null,
  connecting = false,
  role = null,
  roomCode = "",
  round = 0,
  match = null,
  roundEnded = false;
let previous = null,
  latest = null,
  previousAt = 0,
  latestAt = 0,
  guestInput = { ...NEUTRAL },
  guestInputAt = 0,
  guestSeq = -1,
  inputSeq = 0;
let accumulator = 0,
  lastFrame = performance.now(),
  lastSnapshot = 0,
  lastTickSent = -1;
const held = new Set(),
  touch = new Map();
const counters = { snapshotsReceived: 0, inputsSent: 0 };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const bindings = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "thrust",
  ArrowUp: "thrust",
  KeyS: "brake",
  ArrowDown: "brake",
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
  const on = (key) => held.has(key) || Array.from(touch.values()).includes(key);
  return {
    turn:
      on("right") || on("left")
        ? (on("right") ? 1 : 0) - (on("left") ? 1 : 0)
        : tilt.getAxis(),
    thrust: on("thrust"),
    reverse: on("reverse"),
    boost: on("boost"),
    brake: on("brake"),
    fire: on("fire"),
  };
}
function clearControls() {
  held.clear();
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
  $("flight-footer").hidden = true;
  $("touch-controls").hidden = true;
  $("waiting").hidden = role !== "host";
  $("leave").hidden = !role;
  setBusy(false);
  if (message) status(message);
}
function resetRoom(message) {
  role = null;
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
  const mine = role === "host" ? 0 : 1;
  const interrupted = ["host-hidden", "host-stalled"].includes(reason);
  $("result-title").textContent = interrupted
    ? "Round interrupted"
    : winner === null
      ? "Draw"
      : winner === mine
        ? "You won."
        : "Opponent wins.";
  $("result-detail").textContent =
    reason === "host-hidden"
      ? "The host tab was hidden. Both pilots can ready up again when it is visible."
      : reason === "host-stalled"
        ? "The host stopped delivering live simulation. Keep its browser foregrounded, then try a rematch."
        : reason === "time"
          ? "Time expired. The pilot with more hull remaining wins."
          : "One hull down. Same ships, new round?";
  $("rematch").disabled = false;
  $("rematch-status").textContent = "Both pilots must ready up for a rematch.";
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
    role = message.role;
    roomCode = message.code;
    $("share-code").textContent = roomCode;
    $("role-label").textContent =
      `${role === "host" ? "CYAN / HOST" : "ORANGE / GUEST"} · ROOM ${roomCode}`;
    showLobby(
      role === "host"
        ? "Room created. Waiting for your friend."
        : "Joined. Preparing the round.",
    );
    return;
  }
  if (message.type === "closed") {
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
    round = message.round;
    match = createMatch(message.seed, round);
    roundEnded = false;
    guestInput = { ...NEUTRAL };
    guestInputAt = 0;
    guestSeq = -1;
    inputSeq = 0;
    previous = null;
    latest = null;
    lastTickSent = -1;
    accumulator = 0;
    lastFrame = performance.now();
    lastSnapshot = 0;
    clearControls();
    $("lobby").hidden = true;
    $("waiting").hidden = true;
    $("result").hidden = true;
    $("match-hud").hidden = false;
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
  if (
    message.type === "input" &&
    role === "host" &&
    message.round === round &&
    Number.isSafeInteger(message.seq) &&
    message.seq > guestSeq
  ) {
    const valid = inputControls(message.controls);
    if (valid) {
      guestSeq = message.seq;
      guestInput = valid;
      guestInputAt = performance.now();
    }
    return;
  }
  if (message.type === "snapshot" && role === "guest") {
    const data = cleanSnapshot(message.state, round);
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
    [null, 0, 1].includes(message.winner) &&
    ["time", "hull", "host-hidden", "host-stalled"].includes(message.reason)
  ) {
    finishView(message.winner, message.reason);
    return;
  }
  if (message.type === "votes" && message.votes) {
    $("rematch-status").textContent =
      `Cyan: ${message.votes.host ? "ready" : "waiting"} · Orange: ${message.votes.guest ? "ready" : "waiting"}`;
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
    next.send(type === "create" ? { type: "create" } : { type: "join", code });
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
  $("rematch-status").textContent = "Ready. Waiting for the other pilot.";
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    status("Room code copied. Share the same relay address too.");
  } catch {
    status(`Copy this room code: ${roomCode}`);
  }
});
window.addEventListener("keydown", (event) => {
  if (!match || roundEnded || event.target.matches("input,button,a")) return;
  const action = bindings[event.code];
  if (action) {
    event.preventDefault();
    const changed = !held.has(action);
    held.add(action);
    if (changed) sendInput();
  }
});
window.addEventListener("keyup", (event) => {
  const action = bindings[event.code];
  if (action) {
    held.delete(action);
    sendInput();
  }
});
window.addEventListener("blur", clearControls);
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", (event) => {
    if (!match || roundEnded) return;
    event.preventDefault();
    touch.set(event.pointerId, button.dataset.key);
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
  ? "Relay selected. On your home Wi-Fi, both pilots open the same game link. For internet play, use the same configured secure relay."
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
  return {
    ...latest,
    ships: latest.ships.map((ship, i) => ({
      ...ship,
      x: previous.ships[i].x + (ship.x - previous.ships[i].x) * t,
      y: previous.ships[i].y + (ship.y - previous.ships[i].y) * t,
      angle: angle(previous.ships[i].angle, ship.angle),
    })),
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
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    0,
    width * 0.5,
    height * 0.45,
    width * 0.7,
  );
  bg.addColorStop(0, "#102337");
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
  ctx.strokeStyle = "#2c465866";
  ctx.lineWidth = 1 / unit;
  ctx.strokeRect(0, 0, 40, 24);
  ctx.fillStyle = "#648ca433";
  for (let x = 1; x < 40; x += 2)
    for (let y = 1; y < 24; y += 2) {
      circle(x, y, 0.022);
      ctx.fill();
    }
  const display = view(now),
    obstacles = match?.obstacles || createMatch(1).obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(i * 1.9);
    if (rockImage.complete && rockImage.naturalWidth)
      ctx.drawImage(
        rockImage,
        -o.radius * 1.05,
        -o.radius * 1.05,
        o.radius * 2.1,
        o.radius * 2.1,
      );
    else {
      ctx.fillStyle = "#52616d";
      circle(0, 0, o.radius);
      ctx.fill();
    }
    ctx.restore();
  }
  if (display) {
    for (const b of display.bullets) {
      ctx.fillStyle = b.owner === 0 ? "#a4fff7" : "#ffd8a7";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      circle(b.x, b.y, 0.085);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const ship of display.ships) {
      if (ship.hp <= 0) continue;
      const mine = (role === "host" ? 0 : 1) === ship.id,
        color = ship.id === 0 ? "#81e6df" : "#ffad72";
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = (mine ? 1.5 : 1) / unit;
      ctx.globalAlpha = mine ? 0.8 : 0.38;
      circle(0, 0, 0.65);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.rotate(ship.angle + Math.PI / 2);
      if (
        mine &&
        controls().thrust &&
        !roundEnded &&
        display.phase === "playing"
      ) {
        ctx.fillStyle = color;
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
      if (shipImage.complete && shipImage.naturalWidth)
        ctx.drawImage(shipImage, -0.528, -0.528, 1.056, 1.056);
      else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -0.6);
        ctx.lineTo(0.4, 0.5);
        ctx.lineTo(-0.4, 0.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    for (let i = 0; i < 2; i++) {
      $(`hp${i}`).textContent = String(display.ships[i].hp);
      $(`bar${i}`).value = display.ships[i].hp;
    }
    const ownShip = display.ships[role === "host" ? 0 : 1];
    const cooldown = ownShip.boostCooldown || 0;
    $("boost-state").textContent =
      cooldown > 0.05 ? `${cooldown.toFixed(1)}s` : "READY";
    $("boost-button").classList.toggle("cooling", cooldown > 0.05);
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
        const remote =
          now - guestInputAt <= RULES.inputTimeout * 1000
            ? guestInput
            : NEUTRAL;
        stepMatch(match, [controls(), remote]);
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
    role,
    roomCode,
    round,
    phase: roundEnded
      ? "finished"
      : (role === "guest" ? latest?.phase : match?.phase) || "lobby",
    hull: (latest || match)?.ships.map((s) => s.hp) || [],
    snapshotsReceived: counters.snapshotsReceived,
    inputsSent: counters.inputsSent,
    bufferedAmount: connection?.socket.bufferedAmount || 0,
    controls: controls(),
    tilt: tilt.getState(),
    boostCooldown:
      (role === "guest" ? latest : match)?.ships[role === "host" ? 0 : 1]
        ?.boostCooldown ?? 0,
  };
}
