// The new game's dogfight (launch arena lane): one fighter on two arenas,
// Shatterbelt and Stormworks, with backdrops under the live arena, solo play
// against AI, and pay through the Guild bank.
//
// Today's Dogfight page is the same page, as it is: it only turns into this when
// it is opened as `dogfight/?launch=1` with the new game on (runtime-config.js
// newGame, or ?newgame=1 / the stored preview flag). Without that, nothing in
// here is read: all four arenas, all three classes, no backdrops, no pay.
// Pure: no DOM. The view bits are in launchView.js.
import { newGameFlag } from "../voyage/flag.js";
import { LAUNCH_ARENAS, COMING_SOON_ARENAS, ACTIVITY_PAY } from "../voyage/races/data.js";
import { PILOT_COLORS } from "./modes.js";

export const LAUNCH_QUERY = "launch";
export const LAUNCH_ARENA_IDS = Object.freeze(LAUNCH_ARENAS.map((a) => a.id));

// The one fighter. `fighter-medium` is yours; everyone else flies `fighter-rival`.
// The ship's physics are today's medium class (the sim is not changed).
export const LAUNCH_FIGHTER = Object.freeze({
  id: "fighter-medium", classId: "medium", name: "Fighter", role: "All-rounder",
  art: "launch/art/fighter-medium.webp",
  rival: Object.freeze({ id: "fighter-rival", art: "launch/art/fighter-rival.webp" }),
  // Art is 192px, nose up. Drawn this many arena units tall (a medium hull is about one unit).
  drawSize: 2.4,
});
export const LAUNCH_BACKDROPS = Object.freeze({
  shatterbelt: "launch/art/arena-backdrop-shatterbelt.webp",
  stormworks: "launch/art/arena-backdrop-stormworks.webp",
});
// Fighters that are not in yet, shown as coming soon.
export const COMING_SOON_FIGHTERS = Object.freeze([
  Object.freeze({ name: "Light", role: "Interceptor", note: "Coming soon" }),
  Object.freeze({ name: "Heavy", role: "Armored fighter", note: "Coming soon" }),
]);
export { COMING_SOON_ARENAS };

/** Every file under dogfight/ the launch view loads. */
export const LAUNCH_ART = Object.freeze([LAUNCH_FIGHTER.art, LAUNCH_FIGHTER.rival.art, ...Object.values(LAUNCH_BACKDROPS)]);

/**
 * Is this page load the new game's dogfight? `launch=1` AND the new game on.
 * Returns { on, arena } where arena is a launch arena id (default Shatterbelt).
 */
export function launchFromSearch(search = "", { config = {}, storage = globalThis.localStorage } = {}) {
  let params;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(); }
  if (params.get(LAUNCH_QUERY) !== "1") return { on: false, arena: null };
  const flag = newGameFlag({ config, search, storage });
  if (!flag.enabled) return { on: false, arena: null };
  const asked = params.get("arena");
  return { on: true, arena: LAUNCH_ARENA_IDS.includes(asked) ? asked : LAUNCH_ARENA_IDS[0] };
}

/** The only loadout the launch lobby sends: today's medium hull, the fighter's paint. */
export const launchLoadout = (pilot = 0) => ({ classId: LAUNCH_FIGHTER.classId, bodyColor: "#53687d", accentColor: PILOT_COLORS[pilot] || PILOT_COLORS[0] });

/** The Hub/pay job id for an arena. */
export const launchJob = (arenaId) => LAUNCH_ARENAS.find((a) => a.id === arenaId)?.job || null;
export const launchRule = (arenaId) => ACTIVITY_PAY[launchJob(arenaId)] || null;

/**
 * How a finished round reads for pay: the outcome for this seat and whether this
 * pilot's ship was lost. `winner` is the winning seat or null; `reason` is the sim's
 * ("hull" or "time"); `ships` the final ships (hp, maxHp).
 */
export function roundOutcome({ winner, reason, ships, seat }) {
  const me = ships[seat];
  const died = Boolean(me) && me.hp <= 0;
  const maxHp = me?.maxHp || 100;
  const hullFrac = me ? Math.max(0, me.hp) / maxHp : 0;
  if (["host-hidden", "host-stalled", "forfeit"].includes(reason)) return { outcome: "interrupted", died: false, hullFrac };
  if (winner === seat) return { outcome: "win", died: false, hullFrac };
  if (winner === null || winner === undefined) return { outcome: died ? "loss" : "draw", died, hullFrac };
  return { outcome: "loss", died, hullFrac };
}

/** The map picker's launch argument: just the launch arenas, then a "coming soon" tile. */
export const launchPicker = (initial) => ({ arenas: [...LAUNCH_ARENA_IDS], initial: LAUNCH_ARENA_IDS.includes(initial) ? initial : LAUNCH_ARENA_IDS[0], comingSoon: { title: COMING_SOON_ARENAS.title, note: COMING_SOON_ARENAS.note } });

/**
 * Is the home server's economy on for this page? The same switch as the new game's session gate
 * serverMode (runtimeConfig.voyageServer, or ?vserver=1 remembered for the tab), read here
 * so Dogfight code never imports the new game's session gate (a guard test holds that line).
 */
export function launchServerMode({ config = {}, search = "", storage = globalThis.sessionStorage } = {}) {
  if (config.voyageServer === true) return true;
  let asked = null;
  try { asked = new URLSearchParams(search).get("vserver"); } catch { asked = null; }
  try {
    if (asked === "0") { storage?.removeItem("stardust.voyage.server"); return false; }
    if (asked === "1") { storage?.setItem("stardust.voyage.server", "1"); return true; }
    return storage?.getItem("stardust.voyage.server") === "1";
  } catch { return asked === "1"; }
}
