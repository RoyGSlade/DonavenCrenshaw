# Track Studio v2: everything we can do in 2D to make it dope

…and how to drive each one from a phone sketch. Ranked by **player impact**
(how much a lap feels different) against **effort** (game + studio work, and
how much it touches the deterministic sim; see
`TRACK-STUDIO-V2-GAME-SUPPORT.md`). Score = impact ÷ effort, 1–5 each.

"Studio today" says what the v2 studio already captures: the owner can draw it
now and it is kept as design intent until the game supports it.

## Ranked

| # | Idea | Impact | Effort | Phone gesture | Studio today |
|---|------|:-:|:-:|---|---|
| 1 | **Landmark set pieces and decor** (shops flying by, signs, the escalator as scenery) | 4 | 1 | Landmark pen outline + label, or Landmark/Star stamp, size handle | Yes (intent; renderer-only work) |
| 2 | **Per-sector themes and decals** (mall → mountain mid-lap) | 4 | 2 | Paint a stretch with a "theme" brush (like the width brush), pick a skin per stretch | Skin per track; per-stretch is the width-brush pattern |
| 3 | **Ghost racing lines** (your best, #1, the autopilot) as a coloured line | 4 | 1 | Toggle in Checks; the studio already draws a suggested racing line | Racing line suggestion (shard sub-toolbar) |
| 4 | **Boost pads / speed strips** | 5 | 2 | Zone pen → type Boost strip, draw a short strip on the lane | Yes (intent) |
| 5 | **Moving obstacles on drawn paths** | 5 | 3 | Obstacle stamp → Properties → Moving; draw its path with the obstacle pen | Behaviour stored; path = a stroke |
| 6 | **Falling debris zones** (the mall's broken escalator, things falling through a store) | 5 | 3 | Zone pen → Falling debris, draw the area; timing in Properties | Yes (intent with polygon) |
| 7 | **Narrowing gates** (very wide flowing into a slot) | 4 | 3 | Width brush narrow + taper, or Gate stamp sized smaller than the lane | Width profile stored; gate stamp |
| 8 | **Timed doors** | 4 | 3 | Barricade stamp → Properties → Timed, period slider | Yes (intent) |
| 9 | **Split lanes and shortcuts** | 5 | 5 | Draw a second lane stroke that leaves and rejoins the loop (reshape gesture without replacing) | Not yet (needs a lane graph) |
| 10 | **Gravity wells** | 4 | 2 | Zone pen → Gravity well; size = strength | Yes (intent); circuits already have wells |
| 11 | **Wind / current zones** | 3 | 2 | Zone pen → Wind; draw an arrow with the note pen for direction | Yes (intent) |
| 12 | **Collapsing floor sections** | 4 | 4 | Zone pen → Collapsing floor over a stretch; Properties timing | Yes (intent) |
| 13 | **Rotating bars / sweepers** | 4 | 3 | Barricade stamp → Rotating; rotation handle sets start angle | Behaviour stored |
| 14 | **Variable lane width in the game** | 4 | 4 | Width brush (done) | Yes (intent with the profile) |
| 15 | **Difficulty auto-tuning from autopilot** | 3 | 2 | Difficulty chips; the studio re-flies the autopilot in a worker on every edit | Live autopilot time in Checks |
| 16 | **Parallax backgrounds per theme** | 3 | 2 | Pick per skin/sector; no drawing | Skin picker |
| 17 | **Blackout / spotlight zones** | 3 | 2 | Zone pen → Blackout | Yes (intent) |
| 18 | **Shard trails that reward the racing line** | 3 | 1 | Shards pen along the line, or "Lay 8 on racing line" | Yes (in game today) |
| 19 | **Sentry nests at the hairpins** | 3 | 1 | Sentry stamp next to a corner | Yes (in game today) |
| 20 | **Mirror-symmetric sections** | 2 | 1 | Stamp → Mirror, or Select → Mirror across lane | Yes |

## Notes per idea

1. **Landmark set pieces.** The owner's week-2 notes ("shops you fly by", "a
   mall escalator broken") are mostly scenery. A `track.decor` list drawn by the
   renderer gives the biggest feel-per-effort jump and never touches the sim.
   The "Request something new" card already queues the 3D/visual asset.
2. **Sector themes.** Reuse the width-brush gesture: brush a stretch, pick a
   skin. The game skin cache is per track and zoom; per-sector means a chunk
   picks its plates by lap distance.
3. **Ghost lines.** Ghosts are replays already; drawing the best line as a
   trail is renderer-only.
4. **Boost strips.** An impulse when the ship crosses a strip (like the launch
   impulse); pure, content-only. Huge for "fast" stretches the owner marks.
5. **Moving obstacles.** Generalise `bouncerPosition` to a path; the studio
   already stores behaviour + period and the path is a stroke.
6. **Falling debris.** Scheduled drops from the zone's top edge across the lane,
   telegraphed; rock collision. This is the escalator.
7. **Narrowing gates.** With variable width, a taper into a 5.8 slot is a
   skill check; before that, a Gate stamp narrower than the lane can be a
   two-post checkpoint.
8. **Timed doors.** A barricade solid for `duty` of its `period`.
9. **Split lanes.** The lane becomes a graph (two arcs between the same
   points). Checkpoints and lap progress need a rethink; highest effort.
10. **Gravity wells.** The network circuits already have them; weeklies just
    need to apply `scene.gravityWells`.
11. **Wind.** A constant force inside a polygon; the arrow is drawn with the
    note pen today.
12. **Collapsing floor.** Lane stretches that turn "off" on a schedule.
13. **Rotating bars.** A segment obstacle rotating with `elapsed`.
14. **Variable width.** The studio's width brush and taper are ready; the game
    work is the biggest single change (rails, checkpoints, finish line, skin,
    pilot).
15. **Auto-tuning.** The studio already runs the real converter + autopilot in
    a web worker on every edit; it could nudge mine density or width until the
    autopilot time lands in a target band per difficulty.
16. **Parallax.** Background layers per skin; visual only.
17. **Blackout.** Fog-of-war circle around the ship inside the zone.
18. **Shard trails.** Supported now.
19. **Sentry nests.** Supported now.
20. **Mirror.** Supported now in the studio.

## How the phone sketch drives it (the vocabulary)

- **Colour = meaning.** White lane, pink obstacles, cyan shards, violet
  landmarks, orange zones, grey notes. An agent reading a design knows what
  every stroke is without being told.
- **Pen draws a row or an area; tap drops one.** Obstacle and shard pens lay a
  row at the chosen spacing; a tap places one.
- **Stamps carry behaviour.** Long-press any stamp: size, rotation, behaviour
  (static, moving, rotating, falling, timed), timing.
- **Brushes paint along the lane.** Width today; theme, boost and difficulty
  brushes use the same gesture.
- **"?" means "make me this".** The request card captures title, effect, why,
  type, behaviour and form plus a sketch, files a board card and queues a 3D
  asset; the "?" sits on the track where it goes.
- **Checks talk back while drawing.** Pink markers for overlaps and razor
  turns, the autopilot time live, so the owner fixes the track before an agent
  ever has to.
