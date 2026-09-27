/** Shared loadout rules. Clients choose a class and paint, never their own stats. */
import { FLIGHT_CONFIG } from "../engine/systems/flight.js";
const makeClass = (name, role, hp, speed, thrust, turn, scale) => Object.freeze({
  name, role, hp, speed: FLIGHT_CONFIG.MAX_SPEED * speed,
  acceleration: FLIGHT_CONFIG.THRUST_ACCEL * thrust, turn,
  radius: FLIGHT_CONFIG.PLAYER_RADIUS * scale, scale,
});
export const SHIP_CLASSES = Object.freeze({
  light: makeClass("Light", "Interceptor", 80, 1.2, 1.25, 1.25, 0.88),
  medium: makeClass("Medium", "All-rounder", 100, 1, 1, 1, 1),
  heavy: makeClass("Heavy", "Armored fighter", 140, 0.8, 0.8, 0.8, 1.16),
});
const FLIGHT_CLASSES = Object.fromEntries(Object.entries(SHIP_CLASSES).map(([id, stats]) => [id, Object.freeze({
  ...FLIGHT_CONFIG, MAX_SPEED: stats.speed, THRUST_ACCEL: stats.acceleration,
  ROTATION_SCALE: FLIGHT_CONFIG.ROTATION_SCALE * stats.turn,
})]));
export function shipFlightConfig(ship) {
  return FLIGHT_CLASSES[ship.loadout?.classId] || FLIGHT_CLASSES.medium;
}
export const LOADOUT_STORAGE_KEY = "stardust.dogfight.ship.v1";
export function defaultLoadout(pilot = 0) {
  return { classId: "medium", bodyColor: "#53687d", accentColor: pilot === 1 ? "#ffad72" : "#81e6df" };
}
export function cleanLoadout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(SHIP_CLASSES, value.classId) ||
      typeof value.bodyColor !== "string" || typeof value.accentColor !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value.bodyColor) || !/^#[0-9a-f]{6}$/i.test(value.accentColor) ||
      Object.keys(value).some(key => !["classId", "bodyColor", "accentColor"].includes(key))) return null;
  return { classId: value.classId, bodyColor: value.bodyColor.toLowerCase(), accentColor: value.accentColor.toLowerCase() };
}
export function shipStats(ship) {
  return SHIP_CLASSES[ship.loadout?.classId] || SHIP_CLASSES.medium;
}
export function sameLoadout(a, b) {
  return a.classId === b.classId && a.bodyColor === b.bodyColor && a.accentColor === b.accentColor;
}
