
/**
 * @fileoverview Centralized state and configuration for the Starmap game.
 */

import movementConfig from './engine/systems/movement-config.json' with { type: 'json' };

export const MAX_LEVEL = 5;
export const SHARDS_PER_LEVEL = 5;

// All values in grid cells or cells/second unless noted
export const config = {
  GRID_W: 32,
  GRID_H: 18,

  // Player ship physics
  ROT_SPEED: Math.PI * 1.2,    // rad/s
  ROTATION_SCALE: movementConfig.ROTATION_SCALE ?? 0.35,
  THRUST_ACCEL: 5.0,           // cells/s^2
  FRICTION: 0.7,               // multiplier per second (applied with pow(dt))
  MAX_SPEED: 15.0,             // cells/s
  LAUNCH_IMPULSE: 3.5,         // cells/s added on boost
  SHIP_SCALE: 0.85,            // scale factor for ship graphics
  MAX_HP: 100,                 // default HP if player lacks stats
  PLAYER_INVULN_DURATION: 0.4, // seconds of invulnerability after a hit

  // Fuel mechanics
  MAX_TANK: 100.0,
  BASE_START_FUEL: 100.0,
  FUEL_PER_LEVEL: 10.0,
  FUEL_ROT_PER_SEC: 0.3,
  FUEL_THRUST_PER_SEC: 1.5,
  LAUNCH_FUEL_COST: 5.0,
  FUEL_OUT_PENALTY_MS: 30000,   // 30s penalty

  // Start pad logic
  START_PAD_RADIUS: 0.9,        // distance to consider “on the pad”

  // Interaction radii (as fraction of cell size)
  PLANET_RADIUS: 0.45,
  STATION_RADIUS: 0.5,
  GATE_RADIUS: 0.9,

  // New engine configs
  COUNTDOWN_DURATION: 3.5,       // Seconds for pre-level countdown
  STUCK_HINT_SECONDS: 10,        // Seconds of inactivity before showing launch hint
  GATE_MIN_FUEL: 1,              // Minimum fuel required to use a gate
  WORLD_PADDING: 0.3,            // Padding from the world edge
  WALL_BOUNCE_DAMPENING: -0.3,   // Velocity multiplier on wall collision

  // Camera base zoom level
  CAMERA_BASE_ZOOM: 1.85,         // Higher number = more zoomed in
  ARENA_CAMERA_ZOOM: 1.25,        // Custom zoom for arena (smaller number = further out)
  CAMERA_FOLLOW_SPEED: 0.9,      // Speed at which the camera follows the player
  CAMERA_PAN_SPEED: 0.8,         // Speed at which the camera pans to a new position

  // Arena & combat tuning
  ARENA_SIZE: 40,                // FIX B: Increased arena size
  ARENA_WALL_THICKNESS: 0.24,
  BOSS_MAX_HP: 500,
  BOSS_ENTRY_DURATION: 1.5,      // seconds for boss to fly in
  BOSS_DEATH_DURATION: 2.0,      // seconds for explosion/victory sequence
  BOSS_DAMAGE: 10,               // damage per bullet from boss
  BOSS_FIRE_COOLDOWN_BASE: 1.25, // seconds
  BOSS_FIRE_COOLDOWN_FAST: 0.8,  // seconds at low health
  BOSS_TELEGRAPH_DURATION: 0.25, // seconds
  GENERATOR_DEPOSIT_RADIUS: 1.5, // cells
  ARENA_SHARD_PICKUP_RADIUS: 1.0, // cells

  // Boss sprite controls
  BOSS_SHIP_FRAMES: 6,      // boss sheet has 6 frames horizontally
  BOSS_DRAW_SCALE: 4.4,     // tweak to taste; current look but "one notch bigger"

  // Combat (tune to taste)
  PLAYER_PROJECTILE_SPEED: 16,       // cells/s
  PLAYER_PROJECTILE_LIFE: 1.2,       // seconds
  PLAYER_PROJECTILE_DAMAGE: 50,      // damage per player bullet
  PLAYER_FIRE_RATE: 0.16,            // seconds between shots
  PLAYER_MAX_HEAT: 100,
  PLAYER_HEAT_PER_SHOT: 8,
  PLAYER_COOL_RATE: 28,              // idle cool
  PLAYER_OVERHEAT_COOL_RATE: 14,     // slower when overheated

  // Boost (charge-based)
  BOOST_MAX_PIPS: 3,
  BOOST_REGEN_PER_SEC: 0.22,     // ~1 pip every ~4.5s; tweak to taste
  BOOST_IMPULSE: 4.0,            // cells/s for each boost tap

  // Ramming the boss
  RAM_DAMAGE: 90,
  RAM_COOLDOWN: 0.25,            // seconds between contact ticks

  // Minimap/UI
  MINIMAP: {
    WIDTH_PCT: 0.24,       // width of minimap as % of screen width
    ASPECT: 0.62,          // height = width * ASPECT (shorter than before)
    MARGIN_PCT: 0.02,      // margin as % of the short screen side
    ICON_BASE: 0.042,      // base icon size = r.w * ICON_BASE
    PLANET_SCALE: 1.00,    // planet (shard) circle radius multiplier
    STATION_SCALE: 1.90,   // station square size multiplier
    GATE_RADIUS: 1.10,     // gate ring radius multiplier
    GATE_THICKNESS: 0.60,  // gate ring stroke thickness multiplier
  },

  // Playfield slab (drawn over the wallpaper, under grid & entities)
  PLAYFIELD: {
    FILL: 'rgba(10,12,16,0.65)', // darker than space bg, still a bit transparent
    RADIUS: 12,                  // corner radius in *screen* pixels (we quantize later)
    PADDING_CELLS: 0.0           // grow/shrink the slab around the grid (in cells)
  },

  // Grid styling
  GRID: {
    MAJOR_EVERY: 4,     // every N cells draw a “major” line
    MINOR_ALPHA: 0.14,  // minor line opacity
    MAJOR_ALPHA: 0.28,  // major line opacity
    MINOR_PX: 1,        // minor line width in *screen* pixels
    MAJOR_PX: 2,        // major line width in *screen* pixels
    DOTS: true          // small dots at cell centers for extra motion cues
  },

  // Screen-space parallax starfield (constant motion cues)
  STARFIELD: {
    ENABLED: true,
    LAYERS: [
      { count: 60, parallax: 0.25, size: [1, 2] },
      { count: 40, parallax: 0.55, size: [1, 2] },
      { count: 24, parallax: 0.90, size: [1, 3] }
    ],
    STREAK_MULT: 0.018,   // streak length ~= speedPx * parallax * STREAK_MULT
    ALPHA: 0.25           // opacity of stars/streaks
  },

  // Gamepad input config
  GAMEPAD: {
    STICK_DEADZONE: 0.2,
    TRIGGER_DEADZONE: 0.08
  },
};

export const state = {
  // Current game mode: 'roadmap' or 'arena'
  mode: 'roadmap',

  // UI and general state
  ui: {
    paused: false,
    countdownActive: false,
    showStartOverlay: true,
    showEndOverlay: false,
    showSettingsOverlay: false, // new
    showMinimap: true,
    showTimer: true,
    screenshake: 0, // timer for screenshake effect
  },

  // User settings (loaded from DB)
  settings: {
    musicVolume: 1.0,
    sfxVolume: 1.0,
    // Gamepad bindings can be added here later
    bindings: {},
    invertThrustAxis: false
  },

  // User input state
  keys: {
    left: false,
    right: false,
    thrust: false,
    thrustBack: false,
    launch: false,
    shoot: false,
    // --- NEW KEYS FOR STRAFING ---
    strafeLeft: false,
    strafeRight: false,
    // --- ANALOG STRENGTHS ---
    turnStrength: 0.0,
    thrustStrength: 1.0,
    strafeStrength: 1.0,
  },

  // Arena state specific object
  arena: null,

  // Current run state
  // Structure: { runId, totalActiveMs, levelIndex, seeds, current }
  run: null,

  // Graphics and rendering
  gfx: {
    ctx: null,
    canvas: null,
    cellW: 64,
    cellH: 64,
    padding: 8,
    dpr: 1,
    particles: [],
    projectiles: [], // Combined pool for player and enemy bullets
    // NEW: Camera state
    camera: {
      x: 0,
      y: 0,
      zoom: config.CAMERA_BASE_ZOOM // initial zoom comes from config
    }
  },

  // Loaded content (roadmap.json)
  data: null,
  input: {
    touch: {
      active: false,
      aimWorld: { x: 0, y: 0 },   // world coords to steer toward
      thrustHold: false,          // on-screen thrust button held
      useTilt: false,             // enable to add tilt steering
      turnAxis: 0,                // [-1..1] left/right tilt
    }
  },
};