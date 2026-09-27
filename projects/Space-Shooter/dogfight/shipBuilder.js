import { SHIP_CLASSES, LOADOUT_STORAGE_KEY, cleanLoadout, defaultLoadout } from "./ships.js";
import { drawCustomShip } from "./shipArt.js";

export function createShipBuilder(root) {
  let loadout = defaultLoadout();
  try { loadout = cleanLoadout(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY))) || loadout; } catch {}
  const canvas = root.querySelector("canvas"), ctx = canvas.getContext("2d");
  const body = root.querySelector("#ship-body"), accent = root.querySelector("#ship-accent");
  body.value = loadout.bodyColor;
  accent.value = loadout.accentColor;
  function paint() {
    const stats = SHIP_CLASSES[loadout.classId];
    for (const input of root.querySelectorAll('[name="ship-class"]')) input.checked = input.value === loadout.classId;
    root.querySelector("#ship-stats").textContent = `${stats.role} · ${stats.hp} hull · ${stats.speed} top speed`;
    root.querySelector("#body-value").textContent = loadout.bodyColor.toUpperCase();
    root.querySelector("#accent-value").textContent = loadout.accentColor.toUpperCase();
    canvas.setAttribute("aria-label", `${stats.name} ship, body ${loadout.bodyColor}, accent ${loadout.accentColor}`);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.strokeStyle = "#284454";
    ctx.lineWidth = 1;
    for (const r of [55, 85]) { ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke(); }
    ctx.rotate(-Math.PI / 7);
    ctx.scale(135, 135);
    drawCustomShip(ctx, loadout);
    ctx.restore();
  }
  root.addEventListener("input", () => {
    loadout = cleanLoadout({
      classId: root.querySelector('[name="ship-class"]:checked').value,
      bodyColor: body.value, accentColor: accent.value,
    }) || loadout;
    try { localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(loadout)); } catch {}
    paint();
  });
  paint();
  return { getLoadout: () => ({ ...loadout }), setLocked: locked => { root.disabled = locked; } };
}
