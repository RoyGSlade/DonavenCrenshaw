import { MATCH_MODES, isMode, modeSeats, PILOT_COLORS, PILOT_NAMES, voteKey } from "./modes.js";
import {
  RULES,
  NEUTRAL,
  createMatch,
  stepMatch,
  snapshot,
} from "./simulation.js";
import { inputControls, cleanSnapshot } from "./protocol.js";
import { createSnapshotBuffer, blendSnapshots } from "./interpolation.js";
import { createPredictor } from "./prediction.js";
import { MAPS, createArena, isMapId, ventPhase } from "./maps.js";
import { createMapPicker } from "./mapPicker.js";
import { drawTerrain } from "./terrainView.js";
import { SHIP_CLASSES, cleanLoadout, shipStats } from "./ships.js";
import { createFriendInvites, createInviteInbox } from "./invites.js";
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
  if (pilot) inviteInbox.start();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !role) paintAccountLine();
});

import { createGamepadReader } from "../systems/gamepad.js";
import { selectedController, controllerRevision, reportControllerState, controllerSnapshot, standardController } from "../systems/controllerDevices.js";
import { binds, controllerTuning } from "../systems/flightSettings.js";
const gamepad = createGamepadReader({ getPad: selectedController, getRevision: controllerRevision, getBindings: binds, getTuning: controllerTuning });
let controllerStatusAt = 0;
function updateControllerStatus(now) {
  if (now - controllerStatusAt < 250) return;
  controllerStatusAt = now;
  const snapshot = controllerSnapshot(), pad = snapshot.pad, guard = gamepad.getState();
  const text = !snapshot.available ? 'Controller access unavailable in this browser.'
    : !snapshot.active ? 'Controller paused: click the game and release controls.'
    : !pad && snapshot.preference ? 'Chosen controller disconnected. Reconnect it or choose another in hangar settings.'
    : !pad ? ''
    : !standardController(pad) ? 'Controller has no standard mapping. Use the raw test in hangar settings, standard mode or keyboard/touch.'
    : !snapshot.activated ? 'Controller detected: press a button to activate, then release controls.'
    : guard.awaitingNeutral ? `Controller waiting for neutral: release ${guard.blocking.length ? guard.blocking.join(', ') : 'sticks and buttons'}. Tune drift in hangar settings.`
    : `Controller ready: ${pad.id || 'standard gamepad'}`;
  for (const node of document.querySelectorAll('[data-controller-status]')) if (node.textContent !== text) node.textContent = text;
}
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
// Relay version 3 adds the after-match lobby and guest rejoin. Against an
// older relay (or in a room with an older page) the page keeps the
// rematch-only flow: no lobby messages arrive and no seat token is issued.
const LOBBY_PROTOCOL = 3;
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const TOKEN = /^[A-Za-z0-9_-]{24}$/;
const SEAT_KEY = "stardust.dogfight.seat";
const SEAT_TTL = 15 * 60 * 1000;
const DECISION_MS = 5000; // the relay enforces the same wait
const RESUME_MS = 3000;
const RETRY_MS = [400, 1000, 2000, 3000, 5000, 5000, 8000, 10000, 10000, 10000];
let relayVersion = 0,
  relayUrl = "",
  roomLobby = false, // this room sends lobby state (every pilot on a v3 page)
  lobbyState = null,
  seatToken = null, // secret for reclaiming this guest seat; never shown
  pendingRejoin = false,
  reconnect = null, // { seat, attempt, timer, gaveUp } while reclaiming a seat
  resumeAt = 0,
  loadoutTimer = 0,
  lobbyNote = "",
  joinedLate = false;
const awayAt = new Map(), // playerId -> when they left, on this page's clock
  keptWaiting = new Set();
// Our seat, kept for this tab so a reload can reclaim it.
function saveSeat() {
  if (!seatToken || !roomCode || !relayUrl) return;
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify({ code: roomCode, token: seatToken, relay: relayUrl, at: Date.now() }));
  } catch {}
}
function readSeat() {
  try {
    const seat = JSON.parse(sessionStorage.getItem(SEAT_KEY) || "null");
    if (seat && CODE.test(seat.code) && TOKEN.test(seat.token) && typeof seat.relay === "string" &&
        Number.isFinite(seat.at) && Date.now() - seat.at < SEAT_TTL) return seat;
  } catch {}
  return null;
}
function forgetSeat() {
  seatToken = null;
  try { sessionStorage.removeItem(SEAT_KEY); } catch {}
}
// Guests draw from a short buffer of host snapshots; `latest` is the newest one.
const snapshots = createSnapshotBuffer();
// A guest flies its own ship ahead of the host with the controls it last sent.
const predictor = createPredictor();
let sentControls = { ...NEUTRAL },
  predictionArena = null,
  snapshotGaps = { last: 0, max: 0, total: 0, count: 0 };
let latest = null,
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
  const gp = gamepad.poll([], {
    active: inputFocused && !document.hidden,
  });
  reportControllerState(gamepad.getState());
  if (gp.fullscreenEdge)
    toggleMobileFullscreen().then((result) => {
      if (!result.ok) $("tilt-status").textContent = result.message;
    });
  const own = (role === "guest" ? latest || match : match)?.ships[playerId];
  if (!inputFocused || document.hidden || !match || roundEnded || own?.hp <= 0 ||
      reconnect || paused(performance.now()))
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
  // Between rounds the after-match lobby unlocks the ship (and the host's map).
  const between = !$("after-lobby").hidden;
  shipBuilder.setLocked(busy || (!!role && !between));
  mapPicker.setLocked(busy || (!!role && !(between && role === "host")));
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
  $("rejoin-offer").hidden = true;
  $("link-join").hidden = true;
  restoreBuilders();
  setBusy(false);
  if (role === "host") showFriendInvites();
  else friendInvites.hide();
  if (message) status(message);
  renderSeats();
}
function resetRoom(message) {
  role = null;
  playerId = null;
  remoteInputs.clear();
  clearControls();
  roomCode = "";
  round = 0;
  match = null;
  snapshots.clear();
  resetPrediction();
  latest = null;
  roundEnded = false;
  roomLobby = false;
  lobbyState = null;
  joinedLate = false;
  awayAt.clear();
  keptWaiting.clear();
  resumeAt = 0;
  stopReconnect();
  forgetSeat();
  showLobby(message);
  inviteInbox.poll();
}
function leave() {
  const old = connection;
  connection = null;
  if (old) {
    // Say so, or a version 3 relay would hold the seat for a rejoin.
    old.send({ type: "leave" });
    old.close();
  }
  resetRoom("You left the room. Create or join another match.");
}
// Between rounds the ship builder, the host's map picker and the invite list
// move into the after-match lobby; they go back when a round starts.
const builderHome = { ship: $("ship-builder"), map: $("map-picker"), invites: $("invite-friends") };
function restoreBuilders() {
  $("after-lobby").hidden = true;
  if (builderHome.ship.parentNode !== $("lobby")) $("mode-picker").after(builderHome.ship);
  if (builderHome.map.parentNode !== $("lobby")) builderHome.ship.after(builderHome.map);
  if (builderHome.invites.parentNode !== $("waiting")) $("waiting").append(builderHome.invites);
}
function showFriendInvites() {
  if (pilot && hubOrigin && roomCode) friendInvites.show();
  else friendInvites.hide();
}
function roomLink() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  return url.href;
}
async function copyLink(say) {
  if (!roomCode) return;
  const link = roomLink();
  try {
    await navigator.clipboard.writeText(link);
    say("Invite link copied. Opening it asks before joining.");
  } catch {
    say(`Copy this link: ${link}`);
  }
}
function sendInput() {
  if (role === "guest" && round && !roundEnded && connection) {
    inputSeq++;
    const sent = document.hidden ? { ...NEUTRAL } : controls();
    if (
      connection.send(
        {
          type: "input",
          round,
          seq: inputSeq,
          controls: sent,
        },
        true,
      )
    ) {
      counters.inputsSent++;
      // Prediction flies with exactly what the host was sent, in the same shape.
      sentControls = inputControls(sent) || { ...NEUTRAL };
    }
  }
}
function resetPrediction() {
  predictor.reset();
  sentControls = { ...NEUTRAL };
  predictionArena = null;
  snapshotGaps = { last: 0, max: 0, total: 0, count: 0 };
}
// The guest's copy of the arena, with obstacle damage from the newest snapshot.
function refreshPredictionArena() {
  if (!match || !latest) return;
  const hp = latest.terrain?.hp;
  predictionArena = {
    obstacles: match.obstacles.map((o, i) => ({ ...o, hp: hp?.[i] ?? o.hp })),
    fields: match.fields,
  };
}
function reconcileOwnShip() {
  const own = latest?.ships[playerId];
  if (!own || latest.phase !== "playing" || own.hp <= 0 || roundEnded) {
    predictor.reset();
    return;
  }
  refreshPredictionArena();
  predictor.reconcile(own, predictionArena);
}
function publish() {
  if (role !== "host" || !match || roundEnded || match.tick === lastTickSent)
    return;
  const state = snapshot(match);
  // Tell each guest the newest input of theirs this state includes.
  for (const [id, remote] of remoteInputs) {
    if (state.ships[id]) state.ships[id].ack = remote.seq;
  }
  if (
    connection?.send(
      { type: "snapshot", state },
      match.phase !== "finished",
    )
  )
    lastTickSent = match.tick;
}
function finishView(winner, reason) {
  const mine = playerId;
  const interrupted = ["host-hidden", "host-stalled"].includes(reason);
  const title = interrupted
    ? "Round interrupted"
    : winner === null
      ? "Draw"
      : winner === mine
        ? "You won."
        : mode === "ffa3" ? `${PILOT_NAMES[winner]} wins.` : "Opponent wins.";
  let detail =
    reason === "host-hidden"
      ? "The host tab was hidden. All pilots can ready up again when it is visible."
      : reason === "host-stalled"
        ? "The host stopped delivering live simulation. Keep its browser foregrounded, then try a rematch."
        : reason === "time"
          ? "Time expired. The pilot with the higher hull percentage wins."
          : reason === "forfeit"
            ? "Your opponent disconnected and the host continued without them. Forfeit wins are casual and never count toward account stats."
            : `${mode === "ffa3" ? "Last ship standing." : "One hull down."} ${roomLobby ? "Change ships or ready up." : "Same ships, new round?"}`;
  if (mode === "duel" && !interrupted && reason !== "forfeit" && winner !== null && counted && opponentCounted)
    detail += " This duel is eligible for account stats.";
  showRoundOver(title, detail);
}
// The round-over panel. In a lobby room it becomes the after-match lobby.
function showRoundOver(title, detail) {
  roundEnded = true;
  clearControls();
  $("countdown").hidden = true;
  $("result").hidden = false;
  $("touch-controls").hidden = true;
  $("result-title").textContent = title;
  $("result-detail").textContent = detail;
  $("rematch").disabled = false;
  $("rematch").textContent = "Ready for rematch";
  $("rematch-status").textContent = "All pilots must ready up for a rematch.";
  showAfterLobby();
}
function lobbyMode() {
  return roomLobby && relayVersion >= LOBBY_PROTOCOL && !!lobbyState && !!role;
}
function showAfterLobby() {
  if (!lobbyMode() || !roundEnded || $("result").hidden || lobbyState.phase !== "finished") return;
  const opening = $("after-lobby").hidden;
  $("after-lobby").hidden = false;
  $("lobby-code").textContent = roomCode;
  if (builderHome.ship.parentNode !== $("lobby-ship-slot")) $("lobby-ship-slot").append(builderHome.ship);
  shipBuilder.setLocked(false);
  $("lobby-arena").hidden = role !== "host";
  if (role === "host") {
    if (builderHome.map.parentNode !== $("lobby-map-slot")) $("lobby-map-slot").append(builderHome.map);
    mapPicker.setLocked(false);
  }
  if (builderHome.invites.parentNode !== $("lobby-invite-slot")) $("lobby-invite-slot").append(builderHome.invites);
  if (opening) showFriendInvites();
  renderLobby();
}
// Send a ship change once the pilot stops dragging the colour picker.
function queueLoadout() {
  clearTimeout(loadoutTimer);
  loadoutTimer = setTimeout(() => {
    loadoutTimer = 0;
    if (!lobbyMode() || !roundEnded || lobbyState.phase !== "finished") return;
    connection?.send({ type: "loadout", round, loadout: shipBuilder.getLoadout() });
  }, 250);
}
const seatName = (id) => PILOT_NAMES[id] || `Pilot ${id + 1}`;
function awayLeft(id, now) {
  return Math.max(0, Math.ceil((DECISION_MS - (now - (awayAt.get(id) ?? now))) / 1000));
}
// Seat list for the waiting room and the after-match lobby. Rebuilt only when
// its text changes, so a button is never swapped out under a click.
let seatsSignature = "";
function renderSeats(now = performance.now()) {
  const seats = lobbyMode() ? lobbyState.seats : [];
  const between = lobbyState?.phase !== "active";
  const lines = seats.map((seat) => {
    const who = `${seatName(seat.playerId)}${seat.playerId === playerId ? " (you)" : ""}`;
    if (seat.presence === "away") {
      const left = awayLeft(seat.playerId, now);
      return { seat, text: `${who} · disconnected · ${left ? `rejoin window ${left}s` : "can still rejoin"}`, open: role === "host" && between, locked: left > 0 };
    }
    if (seat.presence === "open") return { seat, text: `${who} · open seat · share the room code or invite a friend` };
    const ship = SHIP_CLASSES[seat.loadout.classId]?.name || "Medium";
    const ready = lobbyState.phase === "finished" ? ` · ${seat.ready ? "ready" : "not ready"}` : "";
    return { seat, text: `${who} · ${ship}${ready}` };
  });
  const signature = JSON.stringify(lines.map((l) => [l.text, !!l.open, !!l.locked]));
  if (signature === seatsSignature) return;
  seatsSignature = signature;
  for (const list of [$("lobby-seats"), $("waiting-seats")]) {
    list.replaceChildren(...lines.map(({ seat, text, open, locked }) => {
      const li = document.createElement("li"), label = document.createElement("span");
      li.className = `${["cyan", "orange", "violet"][seat.playerId] || ""}${seat.presence === "away" ? " away" : ""}`;
      label.textContent = text;
      li.append(label);
      if (open) {
        // Between rounds, "continue without them" opens the seat to a new pilot.
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Open seat";
        b.disabled = locked;
        b.addEventListener("click", () => release(seat.playerId));
        li.append(b);
      }
      return li;
    }));
  }
}
function renderLobby() {
  renderSeats();
  if (!lobbyMode() || lobbyState.phase !== "finished" || $("after-lobby").hidden) return;
  const me = lobbyState.seats[playerId];
  $("lobby-map").textContent = `Arena: ${MAPS[lobbyState.mapId].name}${role === "host" ? "" : " · the host picks"}`;
  $("rematch").textContent = me?.ready ? "Ready ✓" : "Ready";
  $("rematch").disabled = !!me?.ready;
  const missing = lobbyState.seats.filter((s) => s.presence !== "here").length;
  $("rematch-status").textContent = lobbyNote ||
    (missing ? `Waiting for ${missing} seat${missing > 1 ? "s" : ""} to be filled before the next round.`
      : lobbyState.seats.every((s) => s.ready) ? "Everyone is ready. Launching…"
        : "Change your ship if you like, then press Ready. The round starts when every pilot is ready.");
}
function release(id) {
  if (role !== "host" || !connection) return;
  connection.send({ type: "release", round, playerId: id });
}
// Paused while a guest seat waits for its pilot, then a 3-2-1 before resuming.
function paused(now) {
  if (!lobbyMode() || !match || roundEnded || lobbyState.phase !== "active" || lobbyState.round !== round) return false;
  return lobbyState.seats.some((s) => s.presence === "away") || now < resumeAt;
}
function handleLobby(state) {
  const now = performance.now();
  const before = lobbyState;
  const meBefore = before?.seats[playerId];
  lobbyState = state;
  for (const seat of state.seats) {
    if (seat.presence === "away") {
      if (!awayAt.has(seat.playerId)) awayAt.set(seat.playerId, now - seat.awayMs);
    } else {
      awayAt.delete(seat.playerId);
      keptWaiting.delete(seat.playerId);
    }
    // A new socket numbers its inputs from 1 again.
    if (role === "host" && seat.presence !== before?.seats[seat.playerId]?.presence) remoteInputs.delete(seat.playerId);
  }
  if (state.phase === "active" && state.round === round && match) {
    const wasHeld = before?.phase === "active" && before.round === round && before.seats.some((s) => s.presence === "away");
    const held = state.seats.some((s) => s.presence === "away");
    if (wasHeld && !held) resumeAt = now + RESUME_MS;
    if (held && !wasHeld) predictor.reset();
    // A seat given up mid-round loses its ship; the others play on.
    if (role === "host" && !roundEnded)
      for (const seat of state.seats)
        if (seat.presence === "open" && match.ships[seat.playerId]?.hp > 0) match.ships[seat.playerId].hp = 0;
  }
  if (state.phase === "finished") {
    lobbyNote = meBefore?.ready && !state.seats[playerId]?.ready && before?.round === state.round
      ? "A ship or the arena changed, so everyone was un-readied. Press Ready again." : lobbyNote;
    if (state.seats[playerId]?.ready) lobbyNote = "";
    if (!roundEnded || round !== state.round) {
      // We arrived between rounds: a rejoin, or a new pilot in an opened seat.
      round = state.round;
      match = null;
      snapshots.clear();
      latest = null;
      showRoundOver(joinedLate ? "Welcome aboard" : "Back in the room",
        joinedLate ? "You took an open seat between rounds. Pick your ship and press Ready."
          : "You rejoined between rounds. Pick your ship and press Ready.");
    }
    showAfterLobby();
    if (builderHome.map.parentNode === $("lobby-map-slot")) mapPicker.select(state.mapId);
  }
  saveSeat();
  renderLobby();
}
// Keep only well-formed lobby state from the relay.
function cleanLobby(message) {
  const seats = Array.isArray(message.seats) ? message.seats : [];
  if (!Number.isSafeInteger(message.round) || message.round < 0 || !["waiting", "active", "finished"].includes(message.phase) ||
      !isMapId(message.mapId) || seats.length < 1 || seats.length > modeSeats(mode)) return null;
  const clean = [];
  for (const [id, seat] of seats.entries()) {
    const loadout = cleanLoadout(seat?.loadout);
    if (!loadout || seat.playerId !== id || typeof seat.ready !== "boolean" || !["here", "away", "open"].includes(seat.presence) ||
        typeof seat.awayMs !== "number" || !Number.isFinite(seat.awayMs) || seat.awayMs < 0) return null;
    clean.push({ playerId: id, loadout, ready: seat.ready, presence: seat.presence, awayMs: Math.min(seat.awayMs, 36e5) });
  }
  return { round: message.round, phase: message.phase, mapId: message.mapId, seats: clean };
}
// The floating panel for a paused round and for our own lost connection.
let pauseSignature = "", decisionFor = null;
function updatePausePanel(now) {
  let text = "", actions = false, keep = false, reconnecting = false;
  decisionFor = null;
  if (reconnect && role) {
    reconnecting = true;
    text = reconnect.gaveUp
      ? "Couldn't reach the room. Your seat is held for a while — try Rejoin."
      : `Connection lost. Reconnecting to your seat… (attempt ${Math.max(1, reconnect.attempt)})`;
  } else if (paused(now)) {
    const away = lobbyState.seats.find((s) => s.presence === "away");
    if (away) {
      const name = seatName(away.playerId);
      text = `Waiting for ${name}… (rejoin window)`;
      if (role === "host") {
        const left = awayLeft(away.playerId, now);
        if (left) text += ` · you can continue without them in ${left}s`;
        else {
          actions = true;
          decisionFor = away.playerId;
          keep = !keptWaiting.has(away.playerId);
          if (!keep) text = `Still waiting for ${name}. You can continue without them at any time.`;
        }
      }
    } else text = `Resuming in ${Math.max(1, Math.ceil((resumeAt - now) / 1000))}…`;
  }
  const signature = JSON.stringify([text, actions, keep, reconnecting, decisionFor]);
  if (signature === pauseSignature) return;
  pauseSignature = signature;
  $("pause-panel").hidden = !text;
  $("pause-text").textContent = text;
  $("pause-actions").hidden = !actions;
  $("keep-waiting").hidden = !keep;
  $("continue-without").textContent = lobbyState?.phase === "active" && mode === "duel"
    ? "Continue without them (win by forfeit)" : "Continue without them";
  $("reconnect-actions").hidden = !reconnecting;
}
// Reclaiming our guest seat: automatic retries, a Rejoin button, and the
// same path for a reloaded tab that still holds the seat token.
function stopReconnect() {
  if (reconnect) clearTimeout(reconnect.timer);
  reconnect = null;
  pendingRejoin = false;
}
function startReconnect(seat, automatic = true) {
  stopReconnect();
  reconnect = { seat, attempt: 0, timer: 0, gaveUp: false };
  clearControls();
  if (automatic) scheduleReconnect();
  else rejoinSeat();
}
function scheduleReconnect() {
  if (!reconnect || reconnect.timer) return;
  if (reconnect.attempt >= RETRY_MS.length) {
    reconnect.gaveUp = true;
    if (!role) {
      $("rejoin-offer").hidden = false;
      status("Couldn't reach the room's relay. Try Rejoin again in a moment.", true);
    }
    return;
  }
  reconnect.timer = setTimeout(rejoinSeat, RETRY_MS[reconnect.attempt]);
}
async function rejoinSeat() {
  if (!reconnect || connection || connecting) return;
  clearTimeout(reconnect.timer);
  reconnect.timer = 0;
  reconnect.attempt++;
  reconnect.gaveUp = false;
  const { seat } = reconnect;
  let url;
  try {
    url = relayAddress(seat.relay);
  } catch (error) {
    return rejoinRefused(error.message);
  }
  if (!role) {
    setBusy(true);
    status("Rejoining your seat…");
  }
  pendingRejoin = true;
  const next = openRelay(url);
  try {
    await next.ready;
  } catch {
    if (connection === next) connection = null;
    rejoinAttemptFailed();
    return;
  }
  if (connection !== next) return;
  if (!role) setBusy(false);
  next.send({ type: "rejoin", code: seat.code, token: seat.token, protocol: LOBBY_PROTOCOL });
}
function rejoinAttemptFailed() {
  pendingRejoin = false;
  if (!role) setBusy(false);
  scheduleReconnect();
}
// The relay says the seat is gone (the room closed, or someone else has it).
function rejoinRefused(reason) {
  const old = connection;
  connection = null;
  if (old) old.close();
  resetRoom(`${reason} Your seat could not be reclaimed.`);
}
function abortHost(reason) {
  if (role !== "host" || !match || roundEnded) return;
  connection?.send({ type: "abort", reason });
  finishView(null, reason);
}
function receive(message) {
  if (message.type === "hello") {
    relayVersion = Number.isSafeInteger(message.version) ? message.version : 0;
    return;
  }
  if (message.type === "error" && pendingRejoin) {
    rejoinRefused(typeof message.message === "string" ? message.message.slice(0, 200) : "That seat is no longer available.");
    return;
  }
  if (message.type === "error" && role && !$("result").hidden) {
    $("rematch-status").textContent = typeof message.message === "string" ? message.message.slice(0, 200) : "The relay rejected that change.";
    return;
  }
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
    pendingRejoin = false;
    stopReconnect();
    lobbyState = null;
    lobbyNote = "";
    joinedLate = message.rejoined !== true && Number.isSafeInteger(message.round) && message.round > 0;
    if (Number.isSafeInteger(message.round) && message.round >= 0) round = message.round;
    if (typeof message.seatToken === "string" && TOKEN.test(message.seatToken)) seatToken = message.seatToken;
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
    saveSeat();
    showLobby(
      message.rejoined === true
        ? "Rejoined your seat."
        : role === "host"
          ? `Room created. Waiting for ${modeSeats(mode) - 1} other pilot${mode === "ffa3" ? "s" : ""}.`
          : `Joined. Preparing the round.${mode === "duel" && counted && opponentCounted ? " Both pilots are signed in, so this duel counts." : ""}`,
    );
    return;
  }
  if (message.type === "lobby") {
    if (!role || !roomLobby) return;
    const state = cleanLobby(message);
    if (state) handleLobby(state);
    return;
  }
  if (message.type === "opponent") {
    opponentCounted = mode === "duel" && message.counted === true;
    if (counted && opponentCounted) status("Your opponent is signed in too, so this duel counts.");
    return;
  }
  if (message.type === "roster" && role && message.mode === mode && Array.isArray(message.players)) {
    // Version 3 relays say whether this room keeps lobby state (every pilot
    // on a current page); older relays never do.
    roomLobby = message.lobby === true && relayVersion >= LOBBY_PROTOCOL;
    if (!roomLobby) {
      lobbyState = null;
      renderSeats();
    }
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
    restoreBuilders();
    setBusy(false);
    clearTimeout(loadoutTimer);
    awayAt.clear();
    keptWaiting.clear();
    lobbyNote = "";
    joinedLate = false;
    // A rejoining guest counts down with everyone else before play resumes.
    resumeAt = message.rejoin === true ? performance.now() + RESUME_MS : 0;
    saveSeat();
    remoteInputs = new Map();
    inputSeq = 0;
    snapshots.clear();
    resetPrediction();
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
    const arrived = performance.now();
    if (!data || !snapshots.push(data, arrived)) return;
    if (latestAt) {
      const gap = arrived - latestAt;
      snapshotGaps = { last: gap, max: Math.max(snapshotGaps.max, gap), total: snapshotGaps.total + gap, count: snapshotGaps.count + 1 };
    }
    latest = snapshots.newest;
    latestAt = snapshots.newestAt;
    counters.snapshotsReceived++;
    reconcileOwnShip();
    return;
  }
  if (
    message.type === "result" &&
    message.round === round &&
    (message.winner === null || (Number.isInteger(message.winner) && message.winner >= 0 && message.winner < modeSeats(mode))) &&
    ["time", "hull", "host-hidden", "host-stalled", "forfeit"].includes(message.reason)
  ) {
    finishView(message.winner, message.reason);
    return;
  }
  if (message.type === "votes" && message.votes && !lobbyMode()) {
    $("rematch-status").textContent =
      Array.from({ length: modeSeats(mode) }, (_, id) => `${PILOT_NAMES[id]}: ${message.votes[voteKey(id)] ? "ready" : "waiting"}`).join(" · ");
  }
}
function openRelay(url) {
  const next = connectRelay(
    url,
    (message) => {
      if (connection === next) receive(message);
    },
    () => {
      if (connection !== next) return;
      connection = null;
      relayClosed();
    },
  );
  connection = next;
  relayUrl = url;
  relayVersion = 0;
  return next;
}
function relayClosed() {
  // A rejoin attempt that never reached the room: try again shortly.
  if (reconnect && pendingRejoin) return rejoinAttemptFailed();
  // A version 3 guest keeps its seat for a while: reclaim it.
  if (role === "guest" && seatToken && roomCode && !reconnect) {
    status("Connection lost. Reconnecting to your seat…");
    return startReconnect({ code: roomCode, token: seatToken, relay: relayUrl });
  }
  if (reconnect) return rejoinAttemptFailed();
  resetRoom(
    "Relay disconnected. The round has ended. Reconnect to play again.",
  );
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
  stopReconnect();
  $("rejoin-offer").hidden = true;
  $("link-join").hidden = true;
  status("Connecting to relay…");
  try {
    if (connection) connection.close();
    const next = openRelay(url);
    await next.ready;
    if (connection !== next) return;
    try {
      localStorage.setItem("stardust.dogfight.relay", url);
    } catch {}
    $("relay-url").value = url;
    status(type === "create" ? "Creating room…" : "Joining room…");
    const ticket = pilot ? (await hubJson("/api/dogfight/ticket", "POST"))?.ticket : null;
    if (connection !== next) return;
    const request = {
      type,
      ...(type === "join" ? { code } : { mapId: mapPicker.getMapId(), mode: $("match-mode").value }),
      loadout: shipBuilder.getLoadout(),
      // Older relays ignore this; version 3 turns on the lobby and rejoin.
      protocol: LOBBY_PROTOCOL,
    };
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
  if (lobbyMode()) {
    // Send any ship change still waiting on the debounce first.
    if (loadoutTimer) {
      clearTimeout(loadoutTimer);
      loadoutTimer = 0;
      connection.send({ type: "loadout", round, loadout: shipBuilder.getLoadout() });
    }
    lobbyNote = "";
    connection.send({ type: "ready", round, ready: true });
    $("rematch-status").textContent = "Ready. Waiting for the other pilots.";
    return;
  }
  connection.send({ type: "rematch", round });
  $("rematch-status").textContent = "Ready. Waiting for the other pilots.";
});
$("ship-builder").addEventListener("input", () => {
  if (lobbyMode() && roundEnded) queueLoadout();
});
$("map-picker").addEventListener("change", () => {
  if (role !== "host" || !lobbyMode() || !roundEnded || lobbyState.phase !== "finished") return;
  connection?.send({ type: "map", round, mapId: mapPicker.getMapId() });
});
$("continue-without").addEventListener("click", () => {
  if (decisionFor !== null) release(decisionFor);
});
$("keep-waiting").addEventListener("click", () => {
  if (decisionFor !== null) keptWaiting.add(decisionFor);
});
$("rejoin-now").addEventListener("click", () => {
  if (reconnect) rejoinSeat();
});
$("reconnect-leave").addEventListener("click", leave);
$("copy-link").addEventListener("click", () => copyLink(status));
$("lobby-copy-link").addEventListener("click", () =>
  copyLink((text) => { $("rematch-status").textContent = text; }));
const friendInvites = createFriendInvites({
  root: $("invite-friends"),
  list: $("friend-list"),
  statusLine: $("invite-status"),
  hubOrigin,
  roomCode: () => roomCode,
});
const inviteInbox = createInviteInbox({
  root: $("invites"),
  list: $("invite-list"),
  hubOrigin,
  canPoll: () => !!pilot && !role && !connecting && !reconnect,
  onJoin: (code) => {
    $("room-code").value = code;
    requestRoom("join");
  },
});
paintAccountLine();
// A shared link (dogfight/?room=CODE) fills in the code and asks first.
const linkedCode = (new URLSearchParams(location.search).get("room") || "").trim().toUpperCase();
if (CODE.test(linkedCode)) {
  $("room-code").value = linkedCode;
  $("link-join-text").textContent = `Join room ${linkedCode}?`;
  $("link-join").hidden = false;
}
const forgetLink = () => {
  $("link-join").hidden = true;
  try {
    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(history.state, "", url.href);
  } catch {}
};
$("link-join-yes").addEventListener("click", () => {
  forgetLink();
  requestRoom("join");
});
$("link-join-no").addEventListener("click", forgetLink);
// A reloaded tab that still holds a guest seat offers to reclaim it.
const heldSeat = readSeat();
if (heldSeat) {
  $("rejoin-text").textContent = `You were in room ${heldSeat.code}. Rejoin your seat?`;
  $("rejoin-offer").hidden = false;
}
$("rejoin-yes").addEventListener("click", () => {
  const seat = readSeat();
  $("rejoin-offer").hidden = true;
  if (!seat) return status("That seat has expired. Join with the room code instead.", true);
  seatToken = seat.token;
  startReconnect(seat, false);
});
$("rejoin-no").addEventListener("click", () => {
  forgetSeat();
  $("rejoin-offer").hidden = true;
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
  const pair = snapshots.sample(now);
  const shown = pair ? blendSnapshots(pair, latest) : latest;
  // Our own ship is drawn where we are flying it now; everything else stays
  // on the smoothed host timeline.
  const pose = predictor.active && !roundEnded ? predictor.pose() : null;
  if (!pose || !shown.ships[playerId]) return shown;
  return {
    ...shown,
    ships: shown.ships.map((ship, i) => (i === playerId ? { ...ship, ...pose } : ship)),
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
      reconnect
        ? "Reconnecting…"
        : paused(now)
          ? "Paused · waiting for a pilot"
          : role === "host"
        ? "Hosting · connected"
        : latestAt && now - latestAt > 1000
          ? "Waiting for host…"
          : predictor.active
            ? "Connected · predicted"
            : "Connected";
  }
  ctx.restore();
}
function frame(now) {
  const elapsed = now - lastFrame;
  lastFrame = now;
  const hold = paused(now);
  if (role === "guest" && predictor.active && predictionArena && !roundEnded && !hold && !reconnect)
    predictor.advance(elapsed / 1000, sentControls, inputSeq, predictionArena);
  if (role === "host" && match && !roundEnded) {
    if (elapsed > 500) abortHost("host-stalled");
    else if (hold) accumulator = 0; // the round clock stops with everyone else
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
  updateControllerStatus(now);
  updatePausePanel(now);
  if (awayAt.size) renderSeats(now);
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
    tick: (role === "guest" ? latest : match)?.tick ?? 0,
    phase: roundEnded
      ? "finished"
      : (role === "guest" ? latest?.phase : match?.phase) || "lobby",
    hull: (latest || match)?.ships.map((s) => s.hp) || [],
    ships: (latest || match)?.ships.map(s => ({ id: s.id, x: s.x, y: s.y, angle: s.angle, vx: s.vx, vy: s.vy, hp: s.hp,
      maxHp: shipStats(s).hp, loadout: { ...s.loadout } })) || [],
    snapshotsReceived: counters.snapshotsReceived,
    inputsSent: counters.inputsSent,
    // Playtest evidence for guest feel: snapshot spacing and prediction corrections.
    network: {
      snapshotGapMs: {
        last: Math.round(snapshotGaps.last),
        max: Math.round(snapshotGaps.max),
        average: snapshotGaps.count ? Math.round(snapshotGaps.total / snapshotGaps.count) : 0,
      },
      prediction: { active: predictor.active, ...predictor.stats },
      drawnOwnShip: role === "guest" ? predictor.pose() : null,
    },
    bufferedAmount: connection?.socket.bufferedAmount || 0,
    // After-match lobby and rejoin (relay version 3). The seat token is never exposed.
    relayVersion,
    lobby: lobbyMode() ? { phase: lobbyState.phase, round: lobbyState.round, mapId: lobbyState.mapId,
      seats: lobbyState.seats.map(({ playerId, loadout, ready, presence }) => ({ playerId, loadout: { ...loadout }, ready, presence })) } : null,
    paused: paused(performance.now()),
    reconnecting: !!reconnect,
    seatHeld: !!seatToken,
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
