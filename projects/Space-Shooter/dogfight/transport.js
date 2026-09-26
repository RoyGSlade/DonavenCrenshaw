function isPrivateIPv4(hostname) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some(n => n > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}
export function relayAddress(value, location = globalThis.location) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Enter a relay URL.");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a full ws:// or wss:// relay URL.");
  }
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error(
      "Use a WebSocket URL without credentials or query parameters.",
    );
  const sameHomeNetwork = location?.protocol === "http:" &&
    isPrivateIPv4(location.hostname) && url.host === location.host;
  if (url.protocol === "ws:" && ((!loopback && !sameHomeNetwork) || location?.protocol === "https:"))
    throw new Error("Public or HTTPS play requires a secure wss:// relay.");
  if (url.pathname === "/") url.pathname = "/relay";
  return url.href;
}
export function defaultRelay(location = globalThis.location) {
  if (location.protocol === "http:" && isPrivateIPv4(location.hostname))
    return `ws://${location.host}/relay`;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
    return "";
  return location.protocol === "https:"
    ? `wss://${location.host}/relay`
    : "ws://127.0.0.1:4174/relay";
}
export function connectRelay(address, onMessage, onClose) {
  const socket = new WebSocket(address);
  let resolveOpen, rejectOpen;
  let settled = false;
  const ready = new Promise((resolve, reject) => {
    resolveOpen = resolve;
    rejectOpen = reject;
  });
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectOpen(
        new Error(
          "Relay did not answer. Check its address and that the server is running.",
        ),
      );
      socket.close();
    }
  }, 6000);
  socket.addEventListener("open", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolveOpen();
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string" || event.data.length > 16384) return;
    try {
      const data = JSON.parse(event.data);
      if (data && typeof data.type === "string") onMessage(data);
    } catch {}
  });
  socket.addEventListener("error", () => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      rejectOpen(
        new Error(
          "Cannot reach relay. Check the URL, server, and allowed site origin.",
        ),
      );
    }
  });
  socket.addEventListener("close", () => {
    clearTimeout(timeout);
    if (!settled) {
      settled = true;
      rejectOpen(new Error("Relay connection closed."));
    }
    onClose();
  });
  return {
    socket,
    ready,
    send(message, transient = false) {
      if (socket.readyState !== WebSocket.OPEN) return false;
      if (socket.bufferedAmount > 65536) {
        socket.close(1013, "Connection too slow");
        return false;
      }
      if (transient && socket.bufferedAmount > 16384) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    close() {
      socket.close();
    },
  };
}
