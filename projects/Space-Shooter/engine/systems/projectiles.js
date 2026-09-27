// src/roadmap/engine/systems/projectiles.js
import { state, config } from '../../state.js';
import { playSoundEffectThrottled } from '../../audio.js';
import { toast } from '../../ui/hud.js';
import { fireWeapon, coolWeapon, projectileFrom } from './weapons.js';

export function handleShooting(dt, player) {
    if (fireWeapon(dt, player, state.keys.shoot, config, () => spawnPlayerProjectile(player))) {
        playSoundEffectThrottled('laser', 0.2, 60);
    }
}

// No longer needs exitArena; collision detection now handles arena exit.
export function handleOverheat(dt, player) {
    const transition = coolWeapon(dt, player, state.keys.shoot, config);
    if (transition === 'cooled') toast('Weapons online!');
    else if (transition === 'overheated') toast('Weapon overheated!');
}

export function spawnPlayerProjectile(player) {
    state.gfx.projectiles.push({
        owner: 'player',
        ...projectileFrom(player, config),
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
        p.prevX = p.x; p.prevY = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            projectiles.splice(i, 1);
        }
    }
}
