# Stardust 3D models: adding and replacing them

Stardust's 3D look (`?render=3d`) draws .glb models. Rendering only: the physics, hitboxes and replays never read them. This page is the exact routine for dropping in your Meshy ships and the fuel-station gate. Until a model exists the renderer uses its stand-ins, so you can add them one at a time.

## The short version

1. Download from Meshy as **GLB** with textures (PBR on). One file per model.
2. Put it in `tools/3d/incoming/ships/` or `tools/3d/incoming/props/`, named as in the table below (`needle.glb`, `fuelStation.glb`, ...).
3. Open `projects/Space-Shooter/viewer3d.html` in the browser (serve the repo, see below), drop the same file on it, pick what it is, and turn it until the nose points along the orange arrow. Copy the manifest entry it prints into `tools/3d/incoming/<ships|props>/<name>.json` (just the fields inside the braces).
4. Run `npm run assets:3d:incoming`. It converts every file in `incoming/`, writes the result to `projects/Space-Shooter/art/3d/ships|props/`, and rewrites `art/3d/manifest.json`.
5. Open the viewer again with `?load=ships/needle` (or choose it in "Or open a shipped model") and check it. Play `?preview=weekly&render=3d`.
6. Commit `art/3d/` and `tools/3d/export-report.json`. The raw files in `incoming/` are git-ignored on purpose (they are tens of megabytes).

To look at the viewer: `python -m http.server 8080 --bind 127.0.0.1` from the repo root, then `http://127.0.0.1:8080/projects/Space-Shooter/viewer3d.html`. It is unlisted (`noindex`), is not linked from the site and is not in the sitemap. Files you drop on it are read in your browser and never uploaded.

## Names

| What | File name | Goes in | Notes |
| --- | --- | --- | --- |
| Standard ship (Courier) | `courier.glb` | `ships/` | `ships.default` is an alias of it. Today's Courier is the garage Courier's four Meshy parts. |
| Needle | `needle.glb` | `ships/` | One model per family: the default build (`needle:0-0-0-0`). |
| Manta | `manta.glb` | `ships/` | |
| Wisp | `wisp.glb` | `ships/` | |
| Fuel station gate | `fuelStation.glb` | `props/` | Spelled exactly like that. |
| Mine | `mine.glb` | `props/` | Optional. Sized to the kill radius (0.42 cells). |
| Asteroid | `asteroid.glb` | `props/` | Optional. Sized to radius 1; the renderer scales it per rock. |
| Shard | `shard.glb` | `props/` | Optional. 0.95 cells long. |
| Sentry | `sentry.glb` | `props/` | Optional. Radius 0.5 cells. |

Any other name (`scout.glb`) is listed in the manifest and loaded, but only code that asks for that name uses it. A missing file is never an error: the game skips it with a console warning and uses its stand-in.

Builds other than the default (Needle with other wings, paint and livery) are not modelled in 3D: each family shows its default model. The garage paint does not recolour the 3D models (the textures are baked); that is a rendering feature for later.

## Conventions

- **Nose points +X.** The sim's angle 0 is +x; the model faces +X in the file the game loads.
- **Up is +Y.** Standard glTF.
- **Origin at the hull centre**, the point the sim treats as the ship's position. One unit is one sim cell.
- **Ships are scaled to the game's own hull.** The exporter scales a ship so its footprint radius (farthest point from the origin, seen from above) equals the radius of that build's hull in `engine/hull.js`. The viewer draws that hull (pink circle, yellow outline) so you can see if the picture and the hit box agree. Players feel a mismatch.

| Model | Hull radius (cells) | Hull length x width |
| --- | ---: | ---: |
| Courier (garage build) | 0.516 | 0.79 x 0.90 |
| Needle | 0.727 | 1.45 x 0.44 |
| Manta | 0.783 | 1.35 x 1.11 |
| Wisp | 0.697 | 1.21 x 1.08 |

The standard flight's collision hull (`PLAYER_HULL`, 0.543) is a little larger than the garage Courier's. The 3D Courier is fitted to the garage hull; the ship rig can rescale it with `scaleToFootprintRadius(THREE, model, radius)` from `gfx3d/assets.js`. Regenerate the sizes after any hull change with `npm run assets:3d` (it reruns `tools/3d/hull-targets.mjs`).

- **Props** are fitted by rule, not by hull: `radius` (farthest point from the origin seen from above) or `length` / `width` / `height`. The defaults are in the table above and in `DEFAULT_FIT` (`gfx3d/assets.js`). Change one in the viewer ("Fit by") and it lands in the manifest.
- **Pivot**: ships keep the origin they were exported with. A fuel station or sentry stands on y = 0 (`pivot: "bottom"`); a mine, shard or asteroid is centred.

## Budgets

The tools and the test (`tests/stardust-3d-assets.test.mjs`) enforce these; the viewer shows red when a model is over.

| | Ship | Prop |
| --- | ---: | ---: |
| File size | 1.5 MB | 1 MB |
| Triangles | 60,000 (exported at about 30,000) | 30,000 |
| Texture size | 1024 px longest side | 1024 px |
| Textures | embedded in the .glb (webp), 3 maps per material | same |

Meshy delivers about a million triangles and 2048 px textures. `npm run assets:3d:incoming` decimates to about 30,000 triangles (Blender "collapse", UVs kept), shrinks textures to 1024 px webp, quantizes the vertex data, and retries with smaller textures and fewer triangles until the file fits. When you generate in Meshy, choose the lowest polycount that still looks right and PBR (base colour, metal/roughness, normal).

## The one command

```
npm run assets:3d              # re-export the four current ships from their sources, rebuild the manifest
npm run assets:3d:incoming     # also convert whatever is in tools/3d/incoming/
npm run assets:3d:manifest     # only rebuild art/3d/manifest.json from the files already there (no Blender)
npm run assets:3d:check        # verify, change nothing; exit 1 if the manifest is stale or a model is over budget
```

`assets:3d` needs Blender 4.2 or newer (found automatically in `C:\Program Files\Blender Foundation\`, or set `BLENDER`) and Node. `--only needle,wisp` limits an export. A run takes about a minute (the Meshy sources are 90 MB each).

What it does: regenerates `tools/3d/hull-targets.json` from the game's hull code, runs `tools/3d/export_ships.py` in Blender (read-only on the sources), writes `art/3d/ships|props/*.glb`, then `tools/3d/build.mjs` rewrites the manifest with measured size, triangles, textures, sha256 and where each model came from.

### What the manifest fields mean

`art/3d/manifest.json` is generated, but these fields are yours and survive a rebuild:

```
"needle": { "file": "ships/needle.glb",
            "rotation": [0, 0, 0],      degrees (x, y, z), applied first
            "pivot": "none",            "none" keeps the file's origin, "center" centres it, "bottom" stands it on y = 0
            "fit": { "radius": 0.7265 },  one rule: radius | length | width | height, in cells
            "scale": 1,                 extra multiplier after the fit
            "offset": [0, 0, 0] }       cells, added last
```

Files the exporter produced already have the right orientation and size, so their rotation is 0 and the fit is a no-op safeguard. You only touch these for a .glb you drop straight into `art/3d/` without the exporter (small files that are already under budget): set the fields in the viewer and paste them in, then run `npm run assets:3d:manifest`.

## Where the current ships come from

The sources are read-only; the exporter never writes to them.

| Ship | Source |
| --- | --- |
| Courier | `stardust-ship-families-20260930/approved-families-v3.blend`, the four `Stardust_*-courier` parts (body, wings, cockpit, engines) |
| Needle, Manta, Wisp | `stardust-meshy-ships-20260930/source/<family>-source.blend`: the original textured Meshy models, which are the all-zero default builds |

Both folders live under `Documents\ChatGPT\stardust\output\` in your user folder (override with the `STARDUST_ART_SOURCES` environment variable). The exact source, its sha256, the orientation applied and the Blender version are recorded per model in the manifest (`provenance`) and in `tools/3d/export-report.json`. The approved-families `.blend` also holds the rejected procedural Needle/Manta/Wisp slabs; they are not used.

## Troubleshooting

- **It faces sideways or backwards**: in the viewer turn Rotate Y by 90 or -90 (Meshy models usually need one of them) until the nose is on the orange arrow. If it is on its back or side, try X or Z 90.
- **It looks black or flat**: there is no environment map, so full-metal materials would render black. The loader caps metalness at 0.45 and roughness at 0.35 or more (`LOOK` in `gfx3d/assets.js`). Tune it there.
- **Over budget**: run `npm run assets:3d:incoming`. If a file still will not fit, give it fewer triangles in its sidecar (`"tris": 20000`) or smaller textures (`"tex": 512`).
- **Textures missing**: Meshy must export a single .glb with textures inside. `.gltf` with separate files is not read.
- **"Blender not found"**: install Blender or set `BLENDER` to `blender.exe`. `npm run assets:3d:manifest` works without it.
- **It does not appear in the game**: open the browser console. Every model that fails to load prints `[3d] skipping ...` with the reason; the manifest lists only files that exist.
