// src/roadmap/assets.js

/**
 * @fileoverview Loads and manages all image assets for the game.
 * Paths are relative to the Space-Shooter directory for static hosting.
 */

// Resolve the base path to the sprites directory relative to this file
const SPRITE_BASE = '../../assets/Images/sprites';

// This helper function simplifies loading a single image
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => reject(`Failed to load asset: ${src}`);
    });
}

// Helper to load a numbered image sequence from a folder.
function loadSequence(dir, prefix, count, pad = 3, ext = 'png') {
    const files = [];
    for (let i = 0; i < count; i++) {
        const n = String(i).padStart(pad, '0');
        files.push(loadImage(`${dir}/${prefix}${n}.${ext}`).catch(() => null));
    }
    return Promise.all(files).then(arr => arr.filter(Boolean));
}

export const assets = {};

// This function loads all images and returns a promise that resolves when they are all ready.
export async function loadAssets() {
    const assetPromises = {
        playerShip: loadImage(`${SPRITE_BASE}/Raumschiff.png`),
        fuelStation: loadImage(`${SPRITE_BASE}/fuelstation.png`),

        // Boss and effects
        bossShip: loadImage(`${SPRITE_BASE}/BossShip.png`),
        bossShield: loadImage(`${SPRITE_BASE}/BossShieldEffect.png`),
        bossBoom: loadImage(`${SPRITE_BASE}/bossboom.png`),
        bossBoomFrames: loadSequence(`${SPRITE_BASE}/boom`, 'boom', 9),

        // Gate frame sequences
        gateBaseFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/gates/gate001.png`),
            loadImage(`${SPRITE_BASE}/gates/gate002.png`),
            loadImage(`${SPRITE_BASE}/gates/gate003.png`),
            loadImage(`${SPRITE_BASE}/gates/gate004.png`),
            loadImage(`${SPRITE_BASE}/gates/gate005.png`),
            loadImage(`${SPRITE_BASE}/gates/gate006.png`),
            loadImage(`${SPRITE_BASE}/gates/gate007.png`),
        ]),
        gateOverlayFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/gates/gate011.png`),
            loadImage(`${SPRITE_BASE}/gates/gate012.png`),
            loadImage(`${SPRITE_BASE}/gates/gate013.png`),
            loadImage(`${SPRITE_BASE}/gates/gate014.png`),
            loadImage(`${SPRITE_BASE}/gates/gate015.png`),
            loadImage(`${SPRITE_BASE}/gates/gate016.png`),
            loadImage(`${SPRITE_BASE}/gates/gate017.png`),
        ]),

        // Shard frame arrays
        shardBlueFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/shards/Blue/blue_crystal_0000.png`),
            loadImage(`${SPRITE_BASE}/shards/Blue/blue_crystal_0001.png`),
            loadImage(`${SPRITE_BASE}/shards/Blue/blue_crystal_0002.png`),
            loadImage(`${SPRITE_BASE}/shards/Blue/blue_crystal_0003.png`),
        ]),
        shardGreenFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/shards/Green/green_crystal_0000.png`),
            loadImage(`${SPRITE_BASE}/shards/Green/green_crystal_0001.png`),
            loadImage(`${SPRITE_BASE}/shards/Green/green_crystal_0002.png`),
            loadImage(`${SPRITE_BASE}/shards/Green/green_crystal_0003.png`),
        ]),
        shardPinkFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/shards/Pink/pink_crystal_0000.png`),
            loadImage(`${SPRITE_BASE}/shards/Pink/pink_crystal_0001.png`),
            loadImage(`${SPRITE_BASE}/shards/Pink/pink_crystal_0002.png`),
            loadImage(`${SPRITE_BASE}/shards/Pink/pink_crystal_0003.png`),
        ]),
        shardPurpleFrames: Promise.all([
            loadImage(`${SPRITE_BASE}/shards/Purple/purple_crystal_0000.png`),
            loadImage(`${SPRITE_BASE}/shards/Purple/purple_crystal_0001.png`),
            loadImage(`${SPRITE_BASE}/shards/Purple/purple_crystal_0002.png`),
            loadImage(`${SPRITE_BASE}/shards/Purple/purple_crystal_0003.png`),
        ]),

        // Single image shards (used in arena)
        shard: loadImage(`${SPRITE_BASE}/shards/shard.png`).catch(() => null),
        shard_gold: loadImage(`${SPRITE_BASE}/shards/shard_gold.png`).catch(() => null),

        // Generators art
        genA: loadImage(`${SPRITE_BASE}/generators/genA.PNG`).catch(() => null),
        genB: loadImage(`${SPRITE_BASE}/generators/genB.PNG`).catch(() => null),
    };

    // Wait for all promises to resolve and assign them to the assets object
    const loadedEntries = await Promise.all(Object.entries(assetPromises).map(async ([key, promise]) => [key, await promise]));
    for (const [key, value] of loadedEntries) {
        assets[key] = value;
    }

    // Aliases expected by renderers
    if (assets.bossShip) assets.boss = assets.bossShip;
    if (assets.bossShield) assets.boss_shield = assets.bossShield;
    if (assets.bossBoom) assets.boss_boom = assets.bossBoom;
}
