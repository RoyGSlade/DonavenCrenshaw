import { MAPS, DEFAULT_MAP, createArena, isMapId } from "./maps.js";
import { drawTerrain } from "./terrainView.js";

// `launch` (the new game's dogfight only): { arenas: [ids], initial, comingSoon: { title, note } }
// offers just those arenas, then a dashed "coming soon" tile, and leaves today's saved pick alone.
export function createMapPicker(root, launch = null) {
  let selected = launch ? launch.initial : DEFAULT_MAP;
  if (!launch) try { const saved = localStorage.getItem("stardust.dogfight.map"); if (isMapId(saved)) selected = saved; } catch {}
  const choices = root.querySelector(".map-choices");
  const offered = launch ? Object.entries(MAPS).filter(([id]) => launch.arenas.includes(id)) : Object.entries(MAPS);
  for (const [id, map] of offered) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "arena-map"; radio.value = id;
    radio.setAttribute("aria-label", map.name);
    const body = document.createElement("span"), title = document.createElement("strong"), preview = document.createElement("canvas");
    preview.width = 240; preview.height = 144; preview.setAttribute("aria-hidden", "true");
    const c = preview.getContext("2d"); c.scale(6, 6);
    drawTerrain(c, createArena(id), null, { thumbnail: true, reducedMotion: true });
    title.textContent = map.name; body.append(preview, title); label.append(radio, body); choices.append(label);
  }
  if (launch?.comingSoon) {
    const label = document.createElement("label"), body = document.createElement("span"), tile = document.createElement("span"), title = document.createElement("strong");
    label.className = "soon"; label.dataset.comingSoon = "";
    tile.className = "soon-tile"; tile.textContent = launch.comingSoon.note;
    title.textContent = launch.comingSoon.title;
    body.append(tile, title); label.append(body); choices.append(label);
  }
  const refresh = () => {
    for (const radio of choices.querySelectorAll("input")) radio.checked = radio.value === selected;
    root.querySelector("#map-description").textContent = MAPS[selected].description;
    root.querySelector("#map-legend").textContent = MAPS[selected].legend;
  };
  root.addEventListener("change", event => {
    if (!isMapId(event.target.value) || (launch && !launch.arenas.includes(event.target.value))) return;
    selected = event.target.value;
    if (!launch) try { localStorage.setItem("stardust.dogfight.map", selected); } catch {}
    refresh();
  });
  refresh();
  return {
    getMapId: () => selected,
    setLocked: locked => { root.disabled = locked; },
    select: id => { if (isMapId(id) && (!launch || launch.arenas.includes(id))) { selected = id; refresh(); } },
  };
}
