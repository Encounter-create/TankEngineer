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

export function updateMeteor(state: SiegeState, dt: number): void {
  if (state.meteorPhase === 'idle') return;

  if (state.meteorPhase === 'targeting') {
    state.meteorTimer -= dt;
    if (state.meteorTimer <= 0) {
      state.meteorPhase = 'incoming';
      state.meteorVel = 200; // starting speed
      state.meteorPos = new Vec2(-200, -200); // off-screen top-left
    }
    return;
  }

  if (state.meteorPhase === 'incoming') {
    // Accelerate toward target
    const toTarget = state.meteorTarget.sub(state.meteorPos);
    const dist = toTarget.mag();
    state.meteorVel += 800 * dt; // acceleration
    const moveAmount = state.meteorVel * dt;
    if (dist < moveAmount + 10) {
      // IMPACT!
      state.meteorPhase = 'impact';
      state.meteorImpactTime = performance.now() / 1000;
      state.meteorFlashAlpha = 1.0;
      state.screenShake = 50;
      // Destroy everything in radius (except player, allies, turrets)
      const RADIUS = 360;
      for (const enemy of state.enemies) {
        if (enemy.alive && enemy.pos.dist(state.meteorTarget) < RADIUS) {
          takeDamage(enemy, 999);
          if (!enemy.alive) state.particles.push(...spawnExplosion(enemy.pos));
        }
      }
      for (const block of state.physicsBlocks) {
        if (block.alive && block.pos.dist(state.meteorTarget) < RADIUS) {
          block.alive = false;
        }
      }
      // Destroy map tiles in radius
      for (let gy = 0; gy < MAP_ROWS; gy++) {
        for (let gx = 0; gx < MAP_COLS; gx++) {
          const tile = state.map[gy][gx];
          if (tile.type === TileType.EMPTY) continue;
          const tx = gx * CELL_SIZE + CELL_SIZE / 2;
          const ty = gy * CELL_SIZE + CELL_SIZE / 2;
          if (Math.hypot(tx - state.meteorTarget.x, ty - state.meteorTarget.y) < RADIUS) {
            state.map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
          }
        }
      }
      // Create huge fire zone
      state.fireZones.push(createFireZone(state.meteorTarget, RADIUS, 10, 30));
      // Burst particles
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 100 + Math.random() * 200;
        state.particles.push({ pos: state.meteorTarget, vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 1+Math.random(), maxLife:1.5, color: ['#ff4400','#ff8800','#ffcc00'][Math.floor(Math.random()*3)], radius: 3+Math.random()*5, alive:true, smokeExpand:true, isCross:false });
      }
      playExplosion();
      return;
    }
    const dir = toTarget.norm();
    state.meteorPos = state.meteorPos.add(dir.scale(moveAmount));
    // Trail particles
    if (Math.random() < 0.8) {
      state.particles.push({ pos: state.meteorPos, vel: new Vec2((Math.random()-0.5)*30, (Math.random()-0.5)*30), life: 0.3+Math.random()*0.4, maxLife:0.5, color: ['#ff4400','#ff6600','#ffaa00'][Math.floor(Math.random()*3)], radius: 3+Math.random()*6, alive:true, smokeExpand:false, isCross:false });
    }
    return;
  }

  if (state.meteorPhase === 'impact') {
    const elapsed = performance.now() / 1000 - state.meteorImpactTime;
    state.meteorFlashAlpha = Math.max(0, 1 - elapsed / 5);
    state.screenShake = Math.max(0, 50 * (1 - elapsed / 5));
    if (elapsed > 5) {
      state.meteorPhase = 'burning';
    }
    return;
  }

  // burning phase: fire zone is handled by handleFireZones, just wait for it to expire
  // Reset to idle when no fire zones remain (or after some time)
  if (state.meteorPhase === 'burning') {
    // Check if fire zone is still active
    const hasMeteorZone = state.fireZones.some(z => z.alive && z.radius >= 100);
    if (!hasMeteorZone) {
      state.meteorPhase = 'idle';
    }
  }
}

