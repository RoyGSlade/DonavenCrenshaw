# Pilot avatars

Twelve preset avatars a signed-in pilot can pick on `/account/`. The hub stores
only the id (`avatarPreset`, e.g. `pilot-nova`); the site maps each id to an
image through `data/avatars.json`, and that file is the only place the mapping
lives.

The SVGs here are placeholders: a helmet on a round badge per pilot.

## Replacing them

1. Keep the **same ids** (`pilot-nova`, `pilot-comet`, `pilot-vega`, `pilot-orion`,
   `pilot-lyra`, `pilot-draco`, `pilot-atlas`, `pilot-ember`, `pilot-frost`,
   `pilot-void`, `pilot-sol`, `pilot-nebula`). The hub's list
   (`hub/api/config/avatars.json`) uses them, and pilots have already picked them.
2. Images must be **square, at least 256 × 256 px**, and read at 24 px (leaderboard
   rows) as well as 96 px (profile). The site crops them to a circle, so keep the
   subject inside the centre circle.
3. Drop the files in this folder, e.g. `pilot-nova.png`, and change `file` for
   that id in `data/avatars.json`:
   `{ "id": "pilot-nova", "name": "Nova", "file": "assets/images/avatars/pilot-nova.png" }`
   No code change is needed. Delete the old `.svg` once nothing points at it.
4. Run `SITE_BASE=/ npm run build`. The build fails if an id is malformed or a
   `file` is missing.

To add a new preset, add it to `hub/api/config/avatars.json` (the hub rejects ids
it doesn't know) and to `data/avatars.json` with its image.
