// The new game's dogfight, on screen (launch arena lane): the art, the lobby bits and
// the payout line. Everything here runs only when launch.js says the page is the new
// game's; today's Dogfight page never imports a function from this file that runs.
// All text goes in with textContent.
import { LAUNCH_FIGHTER, LAUNCH_BACKDROPS, COMING_SOON_FIGHTERS } from "./launch.js";

const here = (rel) => new URL(rel, import.meta.url).href;
const load = (rel) => { const img = new Image(); img.decoding = "async"; img.src = here(rel); return img; };

/** Loads the fighter sprites and the backdrop for an arena (the other arena's loads lazily). */
export function createLaunchArt() {
  const fighter = load(LAUNCH_FIGHTER.art), rival = load(LAUNCH_FIGHTER.rival.art);
  const backdrops = {};
  return {
    fighter, rival,
    backdrop(mapId) {
      if (!LAUNCH_BACKDROPS[mapId]) return null;
      return (backdrops[mapId] ??= load(LAUNCH_BACKDROPS[mapId]));
    },
    ready: () => fighter.complete && rival.complete && fighter.naturalWidth > 0,
  };
}

/**
 * Draws one ship as the fighter, in arena units, already translated to the ship.
 * Yours is `fighter-medium`; every other pilot flies `fighter-rival`. `hit` flashes it.
 * Falls back to the caller's own drawing when the sprite has not loaded (returns false).
 */
export function drawFighter(ctx, art, ship, mine, unit = 30) {
  const img = mine ? art.fighter : art.rival;
  if (!img.complete || !img.naturalWidth) return false;
  // Big enough to read on a phone (about 44 px), never smaller than the art's own size.
  const size = Math.max(LAUNCH_FIGHTER.drawSize, 44 / unit);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  // a lift so the ships are the brightest things on screen
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.22;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (ship.hit > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.65;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  return true;
}

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
};

/**
 * Turns the lobby into the new game's: one fighter, no class or paint, a way to fly
 * solo against AI, and a pay line on the result panel. `onSolo(mode)` starts a local
 * round. Returns { payLine(text), setSoloBusy(busy) }.
 */
export function dressLobby({ onSolo, arenaName }) {
  document.documentElement.dataset.launch = "1";
  if (!document.querySelector("link[data-launch-css]")) {
    document.head.append(el("link", { rel: "stylesheet", href: here("./launch.css"), "data-launch-css": "" }));
  }
  const q = (id) => document.getElementById(id);
  const back = q("back");
  if (back) { back.setAttribute("href", "../voyage/"); back.textContent = "← HANGAR"; }
  // Fullscreen and tilt live behind a cog on the phone layout.
  const header = document.querySelector("header");
  if (header && !q("launch-cog")) {
    const cog = el("button", { type: "button", id: "launch-cog", "aria-label": "Display and steering settings", "aria-expanded": "false", text: "⚙" });
    cog.addEventListener("click", () => {
      const on = document.documentElement.toggleAttribute("data-launch-tools");
      cog.setAttribute("aria-expanded", String(on));
    });
    q("leave")?.before(cog);
  }
  const lobby = q("lobby");
  lobby.querySelector(".eyebrow").textContent = "STARDUST · THE ARENA";
  lobby.querySelector("h1").textContent = "Climb in. Fly it out.";
  lobby.querySelector(".intro").textContent = "You fly the fighter by remote, so your captain is safe. Win a round and the Guild bank pays you. Lose the ship and it takes the upgrades and a repair bill.";
  // one fighter, no paint shop
  q("ship-builder").hidden = true;
  const lobbyShip = q("lobby-ship");
  if (lobbyShip) lobbyShip.hidden = true;
  const preview = el("canvas", { id: "launch-fighter-art", width: "240", height: "150", role: "img", "aria-label": "The fighter" });
  const fighter = el("fieldset", { id: "launch-fighter" },
    el("legend", { text: "YOUR SHIP" }),
    preview,
    el("p", { class: "launch-fighter-name", text: `${LAUNCH_FIGHTER.name} · ${LAUNCH_FIGHTER.role}` }),
    el("p", { class: "small", id: "launch-fighter-soon", text: `${COMING_SOON_FIGHTERS.map((f) => f.name).join(" and ")}: ${COMING_SOON_FIGHTERS[0].note.toLowerCase()}.` }));
  q("ship-builder").after(fighter);
  const img = new Image();
  img.onload = () => {
    const c = preview.getContext("2d");
    c.clearRect(0, 0, 240, 150);
    c.strokeStyle = "#284454"; c.lineWidth = 1;
    for (const r of [52, 78]) { c.beginPath(); c.arc(120, 75, r, 0, Math.PI * 2); c.stroke(); }
    c.save(); c.translate(120, 75); c.rotate(-Math.PI / 7); c.drawImage(img, -66, -66, 132, 132); c.restore();
  };
  img.src = here(`./${LAUNCH_FIGHTER.art}`);
  // fly now, against AI
  const busyNote = el("p", { class: "small", id: "launch-solo-note", text: "No room, no waiting. The AI flies the other seats." });
  const free = el("button", { type: "button", class: "primary", id: "launch-solo-ffa", text: "Free-for-all vs 2 AI" });
  const duel = el("button", { type: "button", id: "launch-solo-duel", text: "Duel vs 1 AI" });
  free.addEventListener("click", () => onSolo("ffa3"));
  duel.addEventListener("click", () => onSolo("duel"));
  const solo = el("section", { id: "launch-solo", "aria-label": "Fly now against AI" },
    el("p", { class: "eyebrow", text: "FLY NOW" }), el("div", { class: "launch-solo-row" }, free, duel), busyNote);
  const actions = lobby.querySelector(".room-actions");
  const withFriends = el("p", { class: "eyebrow launch-friends", text: "OR FLY WITH FRIENDS" });
  lobby.querySelector(".intro").after(solo);
  actions.before(withFriends);
  // the result panel's pay line
  const pay = el("p", { id: "launch-pay", role: "status", "aria-live": "polite" });
  q("result-detail").after(pay);
  const arenaLine = q("arena-name");
  if (arenaLine) arenaLine.dataset.launch = "1";
  return {
    payLine: (text) => { pay.textContent = text || ""; pay.hidden = !text; },
    setSoloBusy: (busy) => { free.disabled = busy; duel.disabled = busy; },
    setSoloNote: (text) => { busyNote.textContent = text; },
  };
}
