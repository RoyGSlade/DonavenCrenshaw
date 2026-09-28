// Friend invites through the hub. A signed-in pilot in a room can invite a
// friend; while not in a room they see invites sent to them. The hub only
// carries the room code: joining still goes through the relay, and always
// takes a click. A hub without these endpoints hides the UI.
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const INVITE_ERRORS = {
  bad_code: "That room code isn't valid anymore.",
  bad_username: "That pilot name isn't valid.",
  self: "You can't invite yourself.",
  no_user: "No pilot has that name.",
  not_friends: "You can only invite pilots on your friends list.",
  too_many_requests: "Too many invites at once. Wait a minute and try again.",
};

export async function hubRequest(origin, path, { method = "GET", body } = {}) {
  if (!origin) return { status: 0, data: null };
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    let data = null;
    if (res.status !== 204) {
      try { data = await res.json(); } catch {}
    }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

// Display text only; every name reaches the page through textContent.
export function pilotName(who) {
  const name = typeof who?.displayName === "string" && who.displayName.trim()
    ? who.displayName : typeof who?.username === "string" ? who.username : "";
  return name.trim().slice(0, 40) || "A friend";
}
const inviteId = (id) =>
  (typeof id === "string" && /^[\w-]{1,64}$/.test(id)) || (Number.isSafeInteger(id) && id > 0) ? String(id) : null;
function button(text, onClick, primary = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (primary) b.className = "primary";
  b.addEventListener("click", onClick);
  return b;
}

// "Invite a friend": the signed-in pilot's friends, each with an Invite button.
export function createFriendInvites({ root, list, statusLine, hubOrigin, roomCode }) {
  let supported = !!hubOrigin, generation = 0;
  const say = (text, error = false) => {
    statusLine.textContent = text;
    statusLine.classList.toggle("error", error);
  };
  async function invite(friend, b) {
    const code = roomCode();
    if (!CODE.test(code)) return;
    b.disabled = true;
    b.textContent = "Sending…";
    const { status, data } = await hubRequest(hubOrigin, "/api/dogfight/invites", {
      method: "POST", body: { to: friend.username, code },
    });
    if (status === 201) {
      b.textContent = "Invited";
      say(`Invite sent to ${pilotName(data?.invite?.to || friend)}. It lasts 10 minutes.`);
      return;
    }
    b.disabled = false;
    b.textContent = "Invite";
    const message = INVITE_ERRORS[data?.error] ||
      (typeof data?.message === "string" && data.message ? data.message.slice(0, 200) : "Invite failed. Try again.");
    say(message, true);
  }
  return {
    // Fetch the friends list; hide everything if the hub doesn't offer it.
    async show() {
      const mine = ++generation;
      if (!supported) { root.hidden = true; return; }
      const { status, data } = await hubRequest(hubOrigin, "/api/friends");
      if (mine !== generation) return;
      if (status === 401) {
        list.replaceChildren();
        say("Sign in to invite friends.");
        root.hidden = false;
        return;
      }
      if (status !== 200 || !Array.isArray(data?.friends)) {
        if (status === 404) supported = false;
        root.hidden = true;
        return;
      }
      const friends = data.friends.filter((f) => typeof f?.username === "string" && f.username.length <= 64).slice(0, 50);
      list.replaceChildren(...friends.map((friend) => {
        const li = document.createElement("li"), name = document.createElement("span");
        name.textContent = pilotName(friend);
        const b = button("Invite", () => invite(friend, b));
        li.append(name, b);
        return li;
      }));
      say(friends.length ? "" : "No friends yet. Add friends on your account page, or share the link.");
      root.hidden = false;
    },
    hide() {
      generation++;
      root.hidden = true;
    },
  };
}

// Invites sent to this pilot, polled every 15 s while the page is visible and
// the pilot is signed in and not in a room.
export function createInviteInbox({ root, list, hubOrigin, canPoll, onJoin }) {
  let supported = !!hubOrigin, timer = 0, busy = false;
  const dismissed = new Set();
  const remove = (id) => hubRequest(hubOrigin, `/api/dogfight/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
  let shown = [];
  function render() {
    const now = Date.now();
    const visible = canPoll() ? shown.filter((i) => !dismissed.has(i.id) && !(Date.parse(i.expiresAt) <= now)) : [];
    list.replaceChildren(...visible.map((invite) => {
      const li = document.createElement("li"), text = document.createElement("span"), actions = document.createElement("span");
      text.textContent = `${pilotName(invite.from)} invited you to a room`;
      actions.append(
        button("Join", () => {
          dismissed.add(invite.id);
          remove(invite.id);
          render();
          onJoin(invite.code);
        }, true),
        button("Dismiss", () => {
          dismissed.add(invite.id);
          remove(invite.id);
          render();
        }),
      );
      li.append(text, actions);
      return li;
    }));
    root.hidden = visible.length === 0;
  }
  async function poll() {
    if (!supported || busy || !canPoll() || document.visibilityState !== "visible") return render();
    busy = true;
    const { status, data } = await hubRequest(hubOrigin, "/api/dogfight/invites");
    busy = false;
    if (status === 404) supported = false;
    shown = status === 200 && Array.isArray(data?.invites)
      ? data.invites.slice(0, 20).flatMap((i) => {
          const id = inviteId(i?.id);
          return id && typeof i.code === "string" && CODE.test(i.code) ? [{ id, code: i.code, from: i.from, expiresAt: i.expiresAt }] : [];
        }).slice(0, 5)
      : [];
    render();
  }
  document.addEventListener("visibilitychange", () => {
    if (timer && document.visibilityState === "visible") poll();
  });
  return {
    start() {
      if (!supported) return;
      clearInterval(timer);
      timer = setInterval(poll, 15000);
      poll();
    },
    poll,
    render,
  };
}
