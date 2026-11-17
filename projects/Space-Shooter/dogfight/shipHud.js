import { shipStats } from "./ships.js";

/**
 * Position upright, readable HUDs over the interpolated ships, in screen pixels.
 * `project(x, y)` maps an arena point to the screen (the new game's phone layout turns
 * the arena on its side); `compact` shrinks each tag to the hull number and a bar and
 * keeps every tag over its own ship without ever overlapping another.
 */
export function updateShipHud(display, ownId, { ox, oy, unit, width, project = (x, y) => [ox + x * unit, oy + y * unit], compact = false }) {
  document.getElementById('ship-health2').hidden = display.ships.length !== 3;
  const placed = [];
  for (const ship of display.ships) {
    const stats = shipStats(ship);
    const hud = document.getElementById(`ship-health${ship.id}`);
    const bar = document.getElementById(`bar${ship.id}`);
    const label = ship.id === ownId ? "YOU" : `P${ship.id + 1}`;
    hud.hidden = ship.hp <= 0;
    hud.classList.toggle("compact", compact);
    const [sx, sy] = project(ship.x, ship.y);
    if (compact) {
      // 46 x 24 px tag, centred over the ship and nudged clear of any tag already placed
      const half = 23, h = 24, lift = 30;
      let x = Math.max(half + 2, Math.min(width - half - 2, sx)), y = Math.max(h + 52, sy - lift);
      for (const other of placed) {
        if (Math.abs(x - other.x) < 2 * half + 3 && Math.abs(y - other.y) < h + 3) {
          // slide sideways first, then down
          const side = x >= other.x ? 1 : -1;
          const nx = other.x + side * (2 * half + 4);
          if (nx > half + 2 && nx < width - half - 2) x = nx; else y = other.y + h + 4;
        }
      }
      if (!hud.hidden) placed.push({ x, y });
      hud.style.left = `${x}px`;
      hud.style.top = `${y}px`;
      document.getElementById(`hp${ship.id}`).textContent = `${Math.ceil(ship.hp)}`;
    } else {
      hud.style.left = `${Math.max(54, Math.min(width - 54, sx))}px`;
      hud.style.top = `${Math.max(34, sy - stats.scale * 0.65 * unit - 7)}px`;
      document.getElementById(`hp${ship.id}`).textContent = `${Math.ceil(ship.hp)} / ${stats.hp}`;
    }
    document.getElementById(`pilot${ship.id}`).textContent = label;
    bar.max = stats.hp;
    bar.value = ship.hp;
    bar.setAttribute("aria-label", `${label} ${stats.name} ship hull`);
  }
}
