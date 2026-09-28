import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { BlockList, isIP, isIPv4 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import {
  isMode,
  modeSeats,
  voteKey,
} from "../projects/Space-Shooter/dogfight/modes.js";
import { isMapId } from "../projects/Space-Shooter/dogfight/maps.js";
import {
  cleanLoadout,
  defaultLoadout,
  sameLoadout,
} from "../projects/Space-Shooter/dogfight/ships.js";
import {
  inputControls,
  cleanSnapshot,
} from "../projects/Space-Shooter/dogfight/protocol.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(randomBytes(8), (b) => ALPHABET[b & 31]).join("");
// Version 3 adds the after-match lobby and guest rejoin. A page opts in by
// sending `protocol: 3` with create/join; a room keeps the older rematch-only
// rules while any of its pilots uses an older page.
export const RELAY_VERSION = 3;
const LOBBY_PROTOCOL = 3;
// The host may give up on a disconnected pilot only after this long.
const DECISION_MS = 5000;
// After a paused round resumes the host counts down 3-2-1 before its next
// snapshot; the stall watchdog allows for that.
const RESUME_GRACE_MS = 3500;
const TOKEN = /^[A-Za-z0-9_-]{24}$/;
const seatToken = () => randomBytes(18).toString("base64url");
const sameToken = (given, kept) =>
  typeof given === "string" && typeof kept === "string" && TOKEN.test(given) &&
  timingSafeEqual(Buffer.from(given), Buffer.from(kept));
const inside = (root, file) => {
  const rel = path.relative(root, file);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
};
export async function createDogfightServer({
  port = 4174,
  host = "127.0.0.1",
  lanAddress = null,
  allowedOrigins = [],
  // Behind a proxy every client shares the proxy's address. Name the header
  // that carries the real one (e.g. "cf-connecting-ip" behind Cloudflare) so
  // the per-address limit applies per visitor. Only set it when every
  // connection arrives through that proxy.
  clientIpHeader = null,
  // Sockets that are not in a room are closed after this long, so idle
  // connections cannot hold the per-address or total slots.
  idleTimeoutMs = 60000,
  // A guest seat whose socket dropped is held for its pilot to reclaim with
  // their seat token. The host decides when to stop waiting; this bounds it.
  holdMs = 10 * 60 * 1000,
  // Accounts, both optional. verifyTicket(ticket) returns { userId } for a
  // valid ticket from a signed-in pilot, or null. onResult({ winnerId,
  // loserId, reason }) is called when a round ends with a winner and both
  // pilots presented valid tickets for different accounts. The hub wires
  // these up; without them rooms work exactly the same and nothing is kept.
  verifyTicket = null,
  onResult = null,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid port");
  if (host !== "127.0.0.1")
    throw new Error(
      "Use lanAddress to explicitly enable a home-network interface.",
    );
  // LAN mode is explicit and limited to one assigned private interface/subnet.
  // Keep loopback working so the existing desktop preview joins the same rooms.
  let lanSubnet;
  if (lanAddress !== null) {
    const octets = String(lanAddress).split(".").map(Number);
    const privateIP =
      isIPv4(lanAddress) &&
      (octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168));
    const nic = Object.values(networkInterfaces())
      .flat()
      .find(
        (n) =>
          n && !n.internal && n.family === "IPv4" && n.address === lanAddress,
      );
    if (!privateIP || !nic?.cidr)
      throw new Error(
        "LAN address must be a private IPv4 address assigned to this computer.",
      );
    lanSubnet = new BlockList();
    lanSubnet.addSubnet(lanAddress, Number(nic.cidr.split("/")[1]), "ipv4");
  }
  const roots = [
    {
      url: "/projects/Space-Shooter/",
      disk: await realpath(path.join(repo, "projects/Space-Shooter")),
    },
    {
      url: "/assets/Images/sprites/",
      disk: await realpath(path.join(repo, "assets/Images/sprites")),
    },
    {
      url: "/assets/audio/",
      disk: await realpath(path.join(repo, "assets/audio")),
    },
  ];
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".svg": "image/svg+xml",
  };
  const rooms = new Map();
  const perIP = new Map();
  const server = createServer(async (req, res) => {
    const reject = (status = 404, message = "Not found") => {
      res.writeHead(status, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(message);
    };
    if (!["GET", "HEAD"].includes(req.method))
      return reject(405, "Method not allowed");
    let name;
    try {
      name = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      return reject();
    }
    if (name === "/" || name === "/projects/Space-Shooter/dogfight") {
      res.writeHead(302, { Location: "/projects/Space-Shooter/dogfight/" });
      return res.end();
    }
    if (name === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end('{"ok":true,"service":"stardust-dogfight"}');
    }
    if (
      name.includes("\\") ||
      /[\u0000-\u001f]/.test(name) ||
      name.split("/").some((p) => p.startsWith("."))
    )
      return reject();
    if (
      name
        .split("/")
        .some(
          (part) =>
            part.toLowerCase() === "evidence" ||
            /provenance\.json$/i.test(part),
        )
    )
      return reject();
    const root = roots.find((r) => name.startsWith(r.url));
    if (!root) return reject();
    const tail =
      name.slice(root.url.length) + (name.endsWith("/") ? "index.html" : "");
    try {
      const file = await realpath(path.resolve(root.disk, tail));
      if (!inside(root.disk, file)) return reject();
      const info = await stat(file),
        type = mime[path.extname(file).toLowerCase()];
      if (!info.isFile() || !type) return reject();
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": info.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      if (req.method === "HEAD") res.end();
      else
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
    } catch {
      reject();
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  if (lanSubnet)
    server.on("connection", (socket) => {
      const local = socket.localAddress;
      const remote = socket.remoteAddress;
      const localClient = local === "127.0.0.1" && remote === "127.0.0.1";
      const lanClient =
        local === lanAddress &&
        isIPv4(remote || "") &&
        lanSubnet.check(remote, "ipv4");
      if (!localClient && !lanClient) socket.destroy();
    });
  const send = (socket, message, transient = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 65536) {
      socket.close(1013, "Connection too slow");
      return false;
    }
    if (transient && socket.bufferedAmount > 16384) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  const error = (socket, message) => send(socket, { type: "error", message });
  const freshVotes = (room) =>
    Object.fromEntries(room.players.map((_p, id) => [voteKey(id), false]));
  function roster(room) {
    const message = {
      type: "roster",
      mode: room.mode,
      capacity: room.capacity,
      // Whether this room sends `lobby` state (every pilot is on a v3 page).
      lobby: room.v3,
      // Connected pilots only; held and reopened seats appear in `lobby`.
      players: room.players.flatMap((peer, playerId) =>
        peer ? [{ playerId, loadout: room.loadouts[playerId] }] : []),
    };
    for (const peer of room.players) send(peer, message);
  }
  // Every seat is taken by a connected pilot.
  const full = (room) =>
    room.players.length === room.capacity && room.players.every(Boolean);
  const anyAway = (room) => room.seats.some((seat) => seat.presence === "away");
  // Version 3 rooms: per-seat loadout, ready and presence, and the map, sent
  // to every connected pilot whenever one of them changes. Seat tokens never
  // appear here.
  function lobby(room) {
    if (!room.v3) return;
    const now = Date.now();
    const message = {
      type: "lobby",
      round: room.round,
      phase: room.phase,
      mapId: room.mapId,
      holdMs,
      seats: room.seats.map((seat, playerId) => ({
        playerId,
        loadout: room.loadouts[playerId],
        ready: room.votes?.[voteKey(playerId)] === true,
        presence: seat.presence,
        awayMs: seat.presence === "away" ? now - seat.awaySince : 0,
      })),
    };
    for (const peer of room.players) send(peer, message);
  }
  function finish(room, winner, reason) {
    if (room.phase !== "active") return;
    room.phase = "finished";
    room.votes = freshVotes(room);
    room.lastState = null;
    for (const p of room.players)
      send(p, { type: "result", winner, reason, round: room.round });
    // Ship 0 is the host, ship 1 the guest. Forfeits are casual: only a round
    // played to its end is reported.
    const won = room.seats[winner]?.pilot;
    const lost = winner === 0 ? room.seats[1]?.pilot : winner === 1 ? room.seats[0]?.pilot : null;
    if (room.mode === "duel" && reason !== "forfeit" && onResult && won && lost && won.userId !== lost.userId) {
      const result = { winnerId: won.userId, loserId: lost.userId, reason: typeof reason === "string" ? reason : "finished" };
      Promise.resolve().then(() => onResult(result)).catch(() => {});
    }
    lobby(room);
  }
  // The host stopped waiting for a disconnected pilot (or the hold ran out).
  // Mid-round a duel ends as a forfeit win for the host, and a three-player
  // ship is eliminated while the others play on. The seat stays open: its
  // pilot can still reclaim it, or between rounds a new pilot can take it.
  function release(room, id) {
    const seat = room.seats[id];
    seat.presence = "open";
    seat.awaySince = 0;
    if (room.votes) room.votes[voteKey(id)] = false;
    if (room.phase === "active") {
      if (room.mode === "duel") return finish(room, 0, "forfeit");
      if (!anyAway(room)) room.lastSnapshot = Date.now() + RESUME_GRACE_MS;
    }
    lobby(room);
  }
  // A version 3 guest's socket dropped: hold the seat for the same pilot.
  // Hosts, and rooms with an older page, still close the room.
  function drop(socket) {
    const room = socket.room;
    if (!room) return;
    if (!room.v3 || socket === room.host) return detach(socket);
    const id = socket.playerId;
    room.players[id] = null;
    if (id === 1) room.guest = null;
    room.seats[id].presence = "away";
    room.seats[id].awaySince = Date.now();
    if (room.votes) room.votes[voteKey(id)] = false;
    socket.room = null;
    socket.role = null;
    socket.playerId = null;
    roster(room);
    lobby(room);
  }
  function detach(socket, reason = "Opponent disconnected. Room closed.") {
    const room = socket.room;
    if (!room) return;
    rooms.delete(room.code);
    for (const peer of room.players) {
      if (!peer) continue;
      peer.room = null;
      peer.role = null;
      peer.idleSince = Date.now();
      peer.playerId = null;
      if (peer !== socket) send(peer, { type: "closed", reason });
    }
    socket.room = null;
  }
  const startMessage = (room, rejoin = false) => ({
    type: "start",
    round: room.round,
    seed: room.seed,
    loadouts: room.loadouts,
    mapId: room.mapId,
    mode: room.mode,
    ...(rejoin ? { rejoin: true } : {}),
  });
  function start(room) {
    if (!full(room)) return;
    room.round++;
    room.phase = "active";
    room.lastTick = -1;
    room.lastState = null;
    room.lastSnapshot = Date.now();
    room.lastActivity = Date.now();
    room.votes = freshVotes(room);
    for (const peer of room.players) peer.lastSeq = -1;
    room.seed = randomBytes(4).readUInt32LE();
    const message = startMessage(room);
    for (const p of room.players) send(p, message);
  }
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    const boundPort = server.address()?.port;
    const permitted = [
      `http://127.0.0.1:${boundPort}`,
      `http://localhost:${boundPort}`,
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      ...(lanAddress ? [`http://${lanAddress}:${boundPort}`] : []),
      ...allowedOrigins,
    ].includes(origin);
    const forwarded = clientIpHeader && req.headers[clientIpHeader.toLowerCase()];
    const ip = typeof forwarded === "string" && isIP(forwarded.trim())
      ? forwarded.trim()
      : req.socket.remoteAddress || "unknown";
    if (
      req.url !== "/relay" ||
      !permitted ||
      wss.clients.size >= 128 ||
      (perIP.get(ip) || 0) >= 16
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIP.set(ip, (perIP.get(ip) || 0) + 1);
      ws.ip = ip;
      wss.emit("connection", ws);
    });
  });
  wss.on("connection", (socket) => {
    socket.room = null;
    socket.role = null;
    socket.playerId = null;
    socket.lastSeq = -1;
    socket.tokens = 100;
    socket.rateTime = Date.now();
    socket.actions = [];
    socket.alive = true;
    socket.idleSince = Date.now();
    socket.v3 = false;
    send(socket, { type: "hello", version: RELAY_VERSION, modes: ["duel", "ffa3"] });
    socket.on("pong", () => {
      socket.alive = true;
    });
    socket.on("error", () => {});
    socket.on("message", (buffer, isBinary) => {
      if (isBinary) {
        socket.close(1008, "Text messages required");
        return;
      }
      const now = Date.now();
      socket.tokens = Math.min(
        100,
        socket.tokens + (now - socket.rateTime) * 0.06,
      );
      socket.rateTime = now;
      if (socket.tokens < 1) {
        socket.close(1008, "Rate limit");
        return;
      }
      socket.tokens--;
      let message;
      try {
        message = JSON.parse(buffer.toString());
      } catch {
        socket.close(1008, "Invalid JSON");
        return;
      }
      if (!message || typeof message.type !== "string") {
        socket.close(1008, "Invalid message");
        return;
      }
      if (["create", "join", "rejoin"].includes(message.type)) {
        socket.actions = socket.actions.filter((t) => now - t < 60000);
        if (socket.actions.length >= 12)
          return error(socket, "Too many room attempts. Wait a minute.");
        socket.actions.push(now);
        if (socket.room) return error(socket, "Leave your current room first.");
        socket.v3 = message.protocol === LOBBY_PROTOCOL;
        if (message.type === "rejoin") {
          // Reclaim a held guest seat with the secret token the relay gave
          // only to that seat's socket. The seat keeps its pilot identity.
          const room =
            typeof message.code === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(message.code)
              ? rooms.get(message.code) : null;
          const id = room?.v3 && TOKEN.test(message.token ?? "")
            ? room.seats.findIndex((seat, i) => i > 0 && sameToken(message.token, seat.token))
            : -1;
          if (id < 1)
            return error(socket, "That seat is no longer available. Ask for the room code to join again.");
          const seat = room.seats[id];
          // The token holder wins over a connection the relay has not yet
          // noticed is dead.
          const stale = room.players[id];
          if (stale) {
            stale.room = null;
            stale.role = null;
            stale.playerId = null;
            stale.idleSince = now;
            stale.close(4000, "Seat reclaimed");
          }
          const wasAway = seat.presence === "away";
          room.players[id] = socket;
          if (id === 1) room.guest = socket;
          seat.presence = "here";
          seat.awaySince = 0;
          socket.v3 = true;
          socket.room = room;
          socket.role = "guest";
          socket.playerId = id;
          socket.lastSeq = -1;
          room.lastActivity = now;
          if (room.phase === "active" && wasAway && !anyAway(room))
            room.lastSnapshot = now + RESUME_GRACE_MS;
          send(socket, {
            type: "room",
            role: "guest",
            playerId: id,
            code: room.code,
            mapId: room.mapId,
            mode: room.mode,
            capacity: room.capacity,
            round: room.round,
            rejoined: true,
            counted: room.mode === "duel" && Boolean(seat.pilot),
            opponentCounted: room.mode === "duel" && Boolean(room.seats[0].pilot),
          });
          if (room.phase === "active") {
            send(socket, startMessage(room, true));
            if (room.lastState) send(socket, { type: "snapshot", state: room.lastState });
          }
          roster(room);
          lobby(room);
          if (room.phase === "waiting" && full(room)) start(room);
          return;
        }
        let pilot = null;
        try {
          pilot = verifyTicket && typeof message.ticket === "string" && message.ticket.length <= 2048
            ? verifyTicket(message.ticket) : null;
        } catch {
          pilot = null;
        }
        socket.pilot = pilot && typeof pilot.userId === "string" ? { userId: pilot.userId } : null;
        const loadout = message.loadout === undefined
          ? defaultLoadout(message.type === "join" ? 1 : 0) : cleanLoadout(message.loadout);
        if (!loadout) return error(socket, "Choose a valid ship class and body/accent colors.");
        if (message.type === "create") {
          const mode = message.mode ?? "duel";
          if (typeof mode !== "string" || !isMode(mode))
            return error(socket, "Choose duel or ffa3 mode.");
          const mapId = message.mapId ?? "classic";
          if (!isMapId(mapId))
            return error(socket, "Choose a valid arena map.");
          if (rooms.size >= 64)
            return error(socket, "Relay is full. Try again later.");
          let roomCode;
          do {
            roomCode = code();
          } while (rooms.has(roomCode));
          const room = {
            code: roomCode,
            mapId,
            mode,
            capacity: modeSeats(mode),
            players: [socket],
            host: socket,
            guest: null,
            phase: "waiting",
            loadouts: [loadout],
            // Per seat: its secret token (guests only), whether its pilot is
            // "here", "away" (held for rejoin) or "open", and who signed in.
            seats: [{ token: null, presence: "here", awaySince: 0, pilot: socket.pilot }],
            v3: socket.v3,
            round: 0,
            seed: 0,
            lastState: null,
            lastActivity: now,
          };
          rooms.set(roomCode, room);
          socket.room = room;
          socket.role = "host";
          socket.playerId = 0;
          send(socket, {
            type: "room",
            role: "host",
            playerId: 0,
            code: roomCode,
            mapId: room.mapId,
            mode: room.mode,
            capacity: room.capacity,
            counted: room.mode === "duel" && Boolean(socket.pilot),
          });
          roster(room);
          lobby(room);
          return;
        }
        if (
          typeof message.code !== "string" ||
          !/^[A-HJ-NP-Z2-9]{8}$/.test(message.code)
        )
          return error(socket, "Use the eight-character room code.");
        const room = rooms.get(message.code);
        // A new pilot takes a never-filled seat before the first round, or,
        // in a version 3 room, a seat the host opened, outside a live round.
        let playerId = room?.v3 && room.phase !== "active"
          ? room.seats.findIndex((seat, id) => id > 0 && seat.presence === "open") : -1;
        if (playerId < 0 && room?.phase === "waiting" && room.players.length < room.capacity)
          playerId = room.players.length;
        if (!room || playerId < 0)
          return error(socket, "Room unavailable or already full.");
        // An older page cannot follow held or reopened seats.
        if (!socket.v3 && room.seats.some((seat) => seat.presence !== "here"))
          return error(socket, "This room needs the latest Dogfight page. Refresh and try again.");
        if (!socket.v3) room.v3 = false;
        room.players[playerId] = socket;
        room.loadouts[playerId] =
          message.loadout === undefined ? defaultLoadout(playerId) : loadout;
        const token = room.v3 ? seatToken() : null;
        room.seats[playerId] = { token, presence: "here", awaySince: 0, pilot: socket.pilot };
        if (room.votes) room.votes[voteKey(playerId)] = false;
        // Retain this alias for existing duel tooling; authority comes from the seat array.
        room.guest = room.players[1];
        socket.room = room;
        socket.role = "guest";
        socket.playerId = playerId;
        room.lastActivity = now;
        send(socket, {
          type: "room",
          role: "guest",
          playerId,
          code: room.code,
          mapId: room.mapId,
          mode: room.mode,
          capacity: room.capacity,
          round: room.round,
          counted: room.mode === "duel" && Boolean(socket.pilot),
          opponentCounted: room.mode === "duel" && Boolean(room.seats[0].pilot),
          // Sent to this socket only; it reclaims the seat after a drop.
          ...(token ? { seatToken: token } : {}),
        });
        if (room.mode === "duel") send(room.host, { type: "opponent", counted: Boolean(socket.pilot) });
        roster(room);
        lobby(room);
        if (room.phase === "waiting" && full(room)) start(room);
        return;
      }
      const room = socket.room;
      if (!room) return error(socket, "Create or join a room first.");
      room.lastActivity = now;
      if (message.type === "input") {
        if (
          socket.role !== "guest" ||
          room.phase !== "active" ||
          message.round !== room.round
        )
          return;
        const controls = inputControls(message.controls);
        if (
          !controls ||
          !Number.isSafeInteger(message.seq) ||
          message.seq <= socket.lastSeq ||
          message.seq > 1e9
        )
          return;
        socket.lastSeq = message.seq;
        send(
          room.host,
          {
            type: "input",
            controls,
            seq: message.seq,
            round: room.round,
            playerId: socket.playerId,
          },
          true,
        );
        return;
      }
      if (message.type === "snapshot") {
        if (socket !== room.host || room.phase !== "active") return;
        const state = cleanSnapshot(
          message.state,
          room.round,
          room.loadouts,
          room.mapId,
          room.mode,
        );
        if (!state || state.tick <= room.lastTick) return;
        room.lastTick = state.tick;
        room.lastSnapshot = now;
        // A rejoining guest starts from the newest accepted state.
        if (room.v3) room.lastState = state;
        for (const peer of room.players.slice(1))
          send(peer, { type: "snapshot", state }, true);
        if (state.phase === "finished")
          finish(room, state.winner, state.reason);
        return;
      }
      if (message.type === "abort") {
        if (
          socket === room.host &&
          ["host-hidden", "host-stalled"].includes(message.reason)
        )
          finish(room, null, message.reason);
        return;
      }
      // "rematch" is the older page's ready vote; "ready" can also take it back.
      if (message.type === "rematch" || message.type === "ready") {
        if (room.phase !== "finished" || message.round !== room.round) return;
        if (message.type === "ready" && typeof message.ready !== "boolean") return;
        room.votes[voteKey(socket.playerId)] = message.type === "rematch" || message.ready;
        for (const p of room.players)
          send(p, { type: "votes", votes: room.votes });
        lobby(room);
        if (full(room) && room.players.every((_peer, id) => room.votes[voteKey(id)]))
          start(room);
        return;
      }
      // Between rounds of a version 3 room, any pilot may change ship and the
      // host may change the arena. Any change un-readies everyone, so nobody
      // launches against a ship or arena they have not seen.
      if (message.type === "loadout") {
        if (!room.v3 || room.phase !== "finished" || message.round !== room.round) return;
        const loadout = cleanLoadout(message.loadout);
        if (!loadout)
          return error(socket, "Choose a valid ship class and body/accent colors.");
        if (sameLoadout(loadout, room.loadouts[socket.playerId])) return;
        room.loadouts[socket.playerId] = loadout;
        room.votes = freshVotes(room);
        roster(room);
        lobby(room);
        return;
      }
      if (message.type === "map") {
        if (!room.v3 || socket !== room.host || room.phase !== "finished" || message.round !== room.round) return;
        if (!isMapId(message.mapId)) return error(socket, "Choose a valid arena map.");
        if (message.mapId === room.mapId) return;
        room.mapId = message.mapId;
        room.votes = freshVotes(room);
        lobby(room);
        return;
      }
      // Host only, once the rejoin countdown for a held seat has run out.
      if (message.type === "release") {
        if (!room.v3 || socket !== room.host || message.round !== room.round) return;
        const id = message.playerId;
        const seat = Number.isInteger(id) && id > 0 ? room.seats[id] : null;
        if (!seat || seat.presence !== "away") return;
        if (now - seat.awaySince < DECISION_MS)
          return error(socket, "Give them a few seconds to rejoin first.");
        release(room, id);
        return;
      }
      if (message.type === "leave") {
        detach(socket);
        return send(socket, { type: "closed", reason: "You left the room." });
      }
      error(socket, "Unsupported room message.");
    });
    socket.on("close", () => {
      const left = (perIP.get(socket.ip) || 1) - 1;
      if (left > 0) perIP.set(socket.ip, left);
      else perIP.delete(socket.ip);
      drop(socket);
    });
  });
  let heartbeat = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      // The host holds the simulation while a guest seat waits for its pilot.
      if (room.phase === "active" && !anyAway(room) && now - room.lastSnapshot > 3000)
        finish(room, null, "host-stalled");
      room.seats.forEach((seat, id) => {
        if (seat.presence === "away" && now - seat.awaySince > holdMs) release(room, id);
      });
      if (now - room.lastActivity > 10 * 60 * 1000) {
        const reason = "Room expired after inactivity.";
        const host = room.host;
        detach(host, reason);
        send(host, { type: "closed", reason });
      }
    }
    for (const socket of wss.clients)
      if (!socket.room && now - socket.idleSince > idleTimeoutMs)
        socket.close(1000, "Idle");
    if (++heartbeat % 20 === 0)
      for (const socket of wss.clients) {
        if (!socket.alive) {
          socket.terminate();
          continue;
        }
        socket.alive = false;
        socket.ping();
      }
  }, 1000);
  timer.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, lanSubnet ? "0.0.0.0" : host, resolve);
  });
  return {
    server,
    wss,
    rooms,
    port: server.address().port,
    close: async () => {
      clearInterval(timer);
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const relay = await createDogfightServer({
    port: Number(process.env.PORT || 4174),
    lanAddress: process.env.STARDUST_LAN_IP || null,
    allowedOrigins: (process.env.DOGFIGHT_ALLOWED_ORIGINS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    clientIpHeader: process.env.DOGFIGHT_CLIENT_IP_HEADER || null,
  });
  console.log(
    `Dogfight: http://127.0.0.1:${relay.port}/projects/Space-Shooter/dogfight/`,
  );
  console.log(
    `Relay: ws://127.0.0.1:${relay.port}/relay — no public tunnel configured.`,
  );
  if (process.env.STARDUST_LAN_IP) {
    console.log(
      `Home network game: http://${process.env.STARDUST_LAN_IP}:${relay.port}/projects/Space-Shooter/`,
    );
    console.log(
      "LAN clients are limited to the selected interface and its local subnet.",
    );
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await relay.close();
      process.exit(0);
    });
}
