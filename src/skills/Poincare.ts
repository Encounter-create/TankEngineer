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

export function updateRewind(state: SiegeState, dt: number): void {
  if (state.rewindPhase === 'idle') return;

  if (state.rewindPhase === 'rewinding') {
    state.rewindTimer -= dt;
    const progress = 1 - Math.max(0, state.rewindTimer / 5);
    state.rewindBlueAlpha = 0.15 + 0.25 * progress;
    state.screenShake = Math.max(state.screenShake, 10 * progress);
    // Reverse velocities ONCE at start, then boost
    if (!state.rewindReversed) {
      state.rewindReversed = true;
      for (const enemy of state.enemies) {
        if (enemy.alive && !enemy.isStatic) enemy.vel = enemy.vel.scale(-1);
      }
      for (const bullet of state.bullets) {
        if (bullet.alive) bullet.vel = bullet.vel.scale(-1);
      }
      for (const block of state.physicsBlocks) {
        if (block.alive) block.vel = block.vel.scale(-1);
      }
    }
    // Override friction: maintain minimum reversed speed + accelerate
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      if (enemy.vel.mag() < 40) enemy.vel = enemy.vel.norm().scale(40);
      enemy.vel = enemy.vel.scale(1 + 1.5 * dt);
    }
    for (const bullet of state.bullets) {
      if (!bullet.alive) continue;
      if (bullet.vel.mag() < 100) bullet.vel = bullet.vel.norm().scale(100);
      bullet.vel = bullet.vel.scale(1 + 1.0 * dt);
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      if (block.vel.mag() > 0 && block.vel.mag() < 30) block.vel = block.vel.norm().scale(30);
      if (block.vel.mag() > 0) block.vel = block.vel.scale(1 + 1.0 * dt);
    }
    // Reverse particles
    for (const p of state.particles) {
      p.life += dt * (1 + 2 * progress);
      if (!state.rewindReversed) p.vel = p.vel.scale(-1);
    }
    // Blue particles flowing backwards
    if (Math.random() < 0.5) {
      const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
      state.particles.push({ pos: new Vec2(x, y), vel: new Vec2((Math.random()-0.5)*20, (Math.random()-0.5)*20), life: 0.3+Math.random()*0.3, maxLife:0.6, color: ['#4488ff','#6688cc','#88aadd'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.rewindTimer <= 0) {
      // Entropy burst
      for (const enemy of state.enemies) {
        if (enemy.alive) { takeDamage(enemy, 999); state.particles.push(...spawnExplosion(enemy.pos)); }
      }
      for (const block of state.physicsBlocks) {
        if (block.alive) block.alive = false;
      }
      // Blue-white shockwave particles
      const px = state.player.pos.x, py = state.player.pos.y;
      for (let i = 0; i < 50; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 100 + Math.random() * 300;
        state.particles.push({ pos: new Vec2(px, py), vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 0.5+Math.random()*1, maxLife:1.5, color: ['#ffffff','#aaccff','#4488ff','#6688dd'][Math.floor(Math.random()*4)], radius: 3+Math.random()*6, alive:true, smokeExpand:true, isCross:false });
      }
      state.screenShake = 20;
      state.rewindPhase = 'recovering';
      state.rewindTimer = 3;
    }
    return;
  }

  if (state.rewindPhase === 'recovering') {
    state.rewindTimer -= dt;
    state.rewindBlueAlpha = Math.max(0, state.rewindTimer / 3 * 0.4);
    if (state.rewindTimer <= 0) {
      state.rewindPhase = 'idle';
      state.rewindBlueAlpha = 0;
    }
  }
}

