// src/roadmap/engine/systems/projectiles.js
import { state, config } from '../../state.js';
import { playSoundEffectThrottled } from '../../audio.js';
import { toast } from '../../ui/hud.js';

export function handleShooting(dt, player) {
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);

    if (state.keys.shoot && player.shootCooldown <= 0 && !player.isOverheated) {
        spawnPlayerProjectile(player);
        player.shootCooldown = config.PLAYER_FIRE_RATE;
        player.heat = Math.min(player.maxHeat, player.heat + config.PLAYER_HEAT_PER_SHOT);
    playSoundEffectThrottled('laser', 0.2, 60);
    }
}

// No longer needs exitArena; collision detection now handles arena exit.
export function handleOverheat(dt, player) {
    if (player.isOverheated) {
        player.heat = Math.max(0, player.heat - config.PLAYER_OVERHEAT_COOL_RATE * dt);
        if (player.heat <= 0) {
            player.isOverheated = false;
            toast('Weapons online!');
        }
    } else {
        if (!state.keys.shoot) {
             player.heat = Math.max(0, player.heat - config.PLAYER_COOL_RATE * dt);
        }
        if (player.heat >= player.maxHeat) {
            player.isOverheated = true;
            toast('Weapon overheated!');
        }
    }
}

export function spawnPlayerProjectile(player) {
    const angle = player.angle;
    const speed = config.PLAYER_PROJECTILE_SPEED;
    state.gfx.projectiles.push({
        owner: 'player',
        x: player.x + Math.cos(angle) * 0.5,
        y: player.y + Math.sin(angle) * 0.5,
        vx: player.vx + Math.cos(angle) * speed,
        vy: player.vy + Math.sin(angle) * speed,
        life: config.PLAYER_PROJECTILE_LIFE,
    });
}

export function spawnEnemyProjectile(boss, angle) {
    const speed = 8;
    state.gfx.projectiles.push({
        owner: 'enemy',
        x: boss.x,
        y: boss.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 4.0,
    });
}

export function updateProjectiles(dt) {
    const projectiles = state.gfx.projectiles || [];
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            projectiles.splice(i, 1);
        }
    }
}