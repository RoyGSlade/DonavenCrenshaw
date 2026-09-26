import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { BlockList, isIPv4 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import {
  inputControls,
  cleanSnapshot,
} from "../projects/Space-Shooter/dogfight/protocol.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(randomBytes(8), (b) => ALPHABET[b & 31]).join("");
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
    const privateIP = isIPv4(lanAddress) && (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
    const nic = Object.values(networkInterfaces()).flat().find(n =>
      n && !n.internal && n.family === "IPv4" && n.address === lanAddress);
    if (!privateIP || !nic?.cidr)
      throw new Error("LAN address must be a private IPv4 address assigned to this computer.");
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
  if (lanSubnet) server.on("connection", socket => {
    const local = socket.localAddress;
    const remote = socket.remoteAddress;
    const localClient = local === "127.0.0.1" && remote === "127.0.0.1";
    const lanClient = local === lanAddress && isIPv4(remote || "") && lanSubnet.check(remote, "ipv4");
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
  function finish(room, winner, reason) {
    if (room.phase !== "active") return;
    room.phase = "finished";
    room.votes = { host: false, guest: false };
    for (const p of [room.host, room.guest])
      send(p, { type: "result", winner, reason, round: room.round });
  }
  function detach(socket, reason = "Opponent disconnected. Room closed.") {
    const room = socket.room;
    if (!room) return;
    rooms.delete(room.code);
    for (const peer of [room.host, room.guest]) {
      if (!peer) continue;
      peer.room = null;
      peer.role = null;
      if (peer !== socket) send(peer, { type: "closed", reason });
    }
    socket.room = null;
  }
  function start(room) {
    room.round++;
    room.phase = "active";
    room.lastTick = -1;
    room.lastSnapshot = Date.now();
    room.lastActivity = Date.now();
    room.votes = { host: false, guest: false };
    room.guest.lastSeq = -1;
    const seed = randomBytes(4).readUInt32LE();
    for (const p of [room.host, room.guest])
      send(p, { type: "start", round: room.round, seed });
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
    const ip = req.socket.remoteAddress || "unknown";
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
    socket.lastSeq = -1;
    socket.tokens = 100;
    socket.rateTime = Date.now();
    socket.actions = [];
    socket.alive = true;
    send(socket, { type: "hello", version: 1 });
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
      if (["create", "join"].includes(message.type)) {
        socket.actions = socket.actions.filter((t) => now - t < 60000);
        if (socket.actions.length >= 12)
          return error(socket, "Too many room attempts. Wait a minute.");
        socket.actions.push(now);
        if (socket.room) return error(socket, "Leave your current room first.");
        if (message.type === "create") {
          if (rooms.size >= 64)
            return error(socket, "Relay is full. Try again later.");
          let roomCode;
          do {
            roomCode = code();
          } while (rooms.has(roomCode));
          const room = {
            code: roomCode,
            host: socket,
            guest: null,
            phase: "waiting",
            round: 0,
            lastActivity: now,
          };
          rooms.set(roomCode, room);
          socket.room = room;
          socket.role = "host";
          return send(socket, { type: "room", role: "host", code: roomCode });
        }
        if (
          typeof message.code !== "string" ||
          !/^[A-HJ-NP-Z2-9]{8}$/.test(message.code)
        )
          return error(socket, "Use the eight-character room code.");
        const room = rooms.get(message.code);
        if (!room || room.guest || room.phase !== "waiting")
          return error(socket, "Room unavailable or already full.");
        room.guest = socket;
        socket.room = room;
        socket.role = "guest";
        send(socket, { type: "room", role: "guest", code: room.code });
        start(room);
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
          { type: "input", controls, seq: message.seq, round: room.round },
          true,
        );
        return;
      }
      if (message.type === "snapshot") {
        if (socket !== room.host || room.phase !== "active") return;
        const state = cleanSnapshot(message.state, room.round);
        if (!state || state.tick <= room.lastTick) return;
        room.lastTick = state.tick;
        room.lastSnapshot = now;
        send(room.guest, { type: "snapshot", state }, true);
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
      if (message.type === "rematch") {
        if (room.phase !== "finished" || message.round !== room.round) return;
        room.votes[socket.role] = true;
        for (const p of [room.host, room.guest])
          send(p, { type: "votes", votes: room.votes });
        if (room.votes.host && room.votes.guest) start(room);
        return;
      }
      if (message.type === "leave") {
        detach(socket);
        return send(socket, { type: "closed", reason: "You left the room." });
      }
      error(socket, "Unsupported room message.");
    });
    socket.on("close", () => {
      perIP.set(socket.ip, Math.max(0, (perIP.get(socket.ip) || 1) - 1));
      detach(socket);
    });
  });
  let heartbeat = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.phase === "active" && now - room.lastSnapshot > 3000)
        finish(room, null, "host-stalled");
      if (now - room.lastActivity > 10 * 60 * 1000)
        detach(room.host, "Room expired after inactivity.");
    }
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
  });
  console.log(
    `Dogfight: http://127.0.0.1:${relay.port}/projects/Space-Shooter/dogfight/`,
  );
  console.log(
    `Relay: ws://127.0.0.1:${relay.port}/relay — no public tunnel configured.`,
  );
  if (process.env.STARDUST_LAN_IP) {
    console.log(`Home network game: http://${process.env.STARDUST_LAN_IP}:${relay.port}/projects/Space-Shooter/`);
    console.log("LAN clients are limited to the selected interface and its local subnet.");
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await relay.close();
      process.exit(0);
    });
}
