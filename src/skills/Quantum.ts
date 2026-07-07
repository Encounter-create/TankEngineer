// @ts-nocheck
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

export function updateQuantum(state: SiegeState, dt: number): void {
  if (state.quantumPhase === 'idle') return;

  if (state.quantumPhase === 'superposing') {
    state.quantumTimer -= dt;
    const elapsed = 5 - state.quantumTimer;
    // Red/blue alpha oscillate 180° out of phase at ~10Hz
    const baseAlpha = Math.min(0.25, elapsed * 0.5); // ramp up first 0.5s
    state.quantumRedAlpha = baseAlpha + 0.2 * Math.sin(elapsed * 20);
    state.quantumBlueAlpha = baseAlpha + 0.2 * Math.cos(elapsed * 20);
    state.screenShake = Math.max(state.screenShake, 15 + 25 * (elapsed / 5));
    // Quantum particles
    if (Math.random() < 0.5) {
      const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
      state.particles.push({ pos: new Vec2(x, y), vel: new Vec2((Math.random()-0.5)*30, (Math.random()-0.5)*30), life: 0.5+Math.random()*0.5, maxLife:1, color: Math.random()<0.5 ? '#ff4444' : '#4488ff', radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.quantumTimer <= 0) {
      state.quantumPhase = 'collapsed';
      state.quantumTimer = 3; // aftermath 3s
      state.screenShake = 0;
      state.quantumRedAlpha = 0;
      state.quantumBlueAlpha = 0;
      if (!state.quantumDestroyed) {
        state.quantumDestroyed = true;
        // 50% chance each enemy dies
        for (const enemy of state.enemies) {
          if (enemy.alive && Math.random() < 0.5) {
            takeDamage(enemy, 999);
            state.particles.push(...spawnExplosion(enemy.pos));
          }
        }
      }
    }
    return;
  }

  if (state.quantumPhase === 'collapsed') {
    state.quantumTimer -= dt;
    if (state.quantumTimer <= 0) {
      state.quantumPhase = 'idle';
      state.quantumDestroyed = false;
    }
  }
}

