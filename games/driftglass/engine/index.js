// src/roadmap/engine/index.js

/**
 * @fileoverview Main public API for the game engine.
 * This module re-exports the primary functions that the UI or other
 * parts of the application will need to interact with the engine.
 */

// Core engine lifecycle
export { initEngine, ensureEngineRunning } from './core.js';

// Game run and mode management
export { startNewRun, retryRun, quitRun, enterArena, exitArena } from './modeManager.js';

// Timer controls for use by other modules (like API)
export { pauseTimer } from './modes/roadmap.js';

// API-related actions
export { requestArenaEnterFromBack } from './api.js';