import { shipStats } from "./ships.js";

/** Position upright, readable HUDs over the interpolated ships, in screen pixels. */
export function updateShipHud(display, ownId, { ox, oy, unit, width }) {
  for (const ship of display.ships) {
    const stats = shipStats(ship);
    const hud = document.getElementById(`ship-health${ship.id}`);
    const bar = document.getElementById(`bar${ship.id}`);
    const label = ship.id === ownId ? "YOU" : `P${ship.id + 1}`;
    hud.hidden = ship.hp <= 0;
    hud.style.left = `${Math.max(54, Math.min(width - 54, ox + ship.x * unit))}px`;
    hud.style.top = `${Math.max(34, oy + ship.y * unit - stats.scale * 0.65 * unit - 7)}px`;
    document.getElementById(`pilot${ship.id}`).textContent = label;
    document.getElementById(`hp${ship.id}`).textContent = `${Math.ceil(ship.hp)} / ${stats.hp}`;
    bar.max = stats.hp;
    bar.value = ship.hp;
    bar.setAttribute("aria-label", `${label} ${stats.name} ship hull`);
  }
}
