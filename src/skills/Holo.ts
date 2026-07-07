// @ts-nocheck
import { SiegeState } from '../types/SiegeState';
import { TankEntity, takeDamage, TANK_RADIUS, getBerserkerMultiplier } from '../entities/Tank';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, DEFAULT_COMMANDER } from '../entities/Parts';
import { BulletEntity, createBullet, FIREWORK_MAX_LIFE, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, BULLET_RADIUS } from '../entities/Bullet';
import { FireZone, createFireZone, updateFireZone } from '../entities/FireZone';
import { Particle, spawnParticles, spawnExplosion, updateParticles } from '../entities/Particle';
import { DamageNumber, spawnDamageNumber, updateDamageNumbers } from '../entities/DamageNumber';
import { PhysicsBlock, createPhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { AllyTank, CloneEntity, TurretEntity, Plane, createAllyTank, createTurret, createPlanes, createClone } from '../entities/Ally';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H, gridToPixel, pixelToGrid, inBounds } from '../utils/Grid';
import { Vec2 } from '../utils/Vector';
import { hasSynergy } from '../systems/Synergy';
import { AIContext, createAIContext } from '../ai/EnemyAI';
import { moveTank } from '../core/Physics';
import { playExplosion } from '../systems/Sound';

export function updateHolo(state: SiegeState, dt: number): void {
  if (state.holoPhase === 'idle') return;

  if (state.holoPhase === 'projecting') {
    state.holoTimer -= dt;
    const progress = Math.min(1, (3 - state.holoTimer) / 3);
    state.holoRadius = 220 * progress;
    state.holoRotation = 0;
    if (state.holoTimer <= 0) { state.holoPhase = 'rotating'; state.holoTimer = 7; }
    return;
  }

  if (state.holoPhase === 'rotating') {
    state.holoTimer -= dt;
    state.holoRadius = 220;
    state.holoRotation += dt * 2.5; // ~3 full rotations in 7s
    // Holographic particles orbiting the sphere
    if (Math.random() < 0.6) {
      const a = state.holoRotation + Math.random() * Math.PI * 2;
      const r = 220 + 10 + Math.random() * 30;
      const cx = MAP_W / 2, cy = MAP_H / 2;
      state.particles.push({ pos: new Vec2(cx + Math.cos(a) * r, cy + Math.sin(a) * r), vel: new Vec2(-Math.sin(a) * 40, Math.cos(a) * 40), life: 0.4+Math.random()*0.4, maxLife:0.8, color: ['#44ccff','#88ddff','#aaddff'][Math.floor(Math.random()*3)], radius: 1+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.holoTimer <= 0) {
      state.holoPhase = 'shattering';
      state.holoTimer = 1;
      state.holoCracks = 8;
      // Destroy all enemies
      for (const enemy of state.enemies) {
        if (enemy.alive) { takeDamage(enemy, 999); state.particles.push(...spawnExplosion(enemy.pos)); }
      }
      for (const block of state.physicsBlocks) {
        if (block.alive) block.alive = false;
      }
      // Shatter particles
      const cx = MAP_W/2, cy = MAP_H/2;
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 100 + Math.random() * 300;
        state.particles.push({ pos: new Vec2(cx, cy), vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 0.5+Math.random()*1, maxLife:1.5, color: ['#ffffff','#aaddff','#44ccff','#88ddff'][Math.floor(Math.random()*4)], radius: 3+Math.random()*6, alive:true, smokeExpand:true, isCross:false });
      }
      state.screenShake = 25;
    }
    return;
  }

  if (state.holoPhase === 'shattering') {
    state.holoTimer -= dt;
    state.holoRadius = 220 + (1 - state.holoTimer) * 100; // expand
    state.holoCracks = Math.floor(8 + (1 - state.holoTimer) * 12);
    if (state.holoTimer <= 0) {
      state.holoPhase = 'aftermath';
      state.holoTimer = 2;
    }
    return;
  }

  if (state.holoPhase === 'aftermath') {
    state.holoTimer -= dt;
    if (state.holoTimer <= 0) {
      state.holoPhase = 'idle';
      state.holoRadius = 0;
      state.holoRotation = 0;
      state.holoCracks = 0;
    }
  }
}

