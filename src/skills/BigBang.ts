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
import { registerEffect } from '../ui/EffectRenderer';
import { playExplosion } from '../systems/Sound';

export function updateBigBang(state: SiegeState, dt: number): void {
  if (state.bigbangPhase === 'idle') return;

  if (state.bigbangPhase === 'imploding') {
    state.bigbangTimer -= dt;
    const progress = Math.min(1, (3 - state.bigbangTimer) / 3);
    state.bigbangScale = 1 - progress * 0.7; // 1 → 0.3
    state.bigbangWhiteAlpha = progress * 0.6;
    state.screenShake = Math.max(state.screenShake, 50 * progress);
    const cx = state.player.pos.x, cy = state.player.pos.y;
    // Pull everything toward player
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      const to = new Vec2(cx, cy).sub(enemy.pos); const d = to.mag();
      if (d > 5) enemy.vel = enemy.vel.add(to.norm().scale(800 * progress * dt));
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      const to = new Vec2(cx, cy).sub(block.pos); const d = to.mag();
      if (d > 5) block.vel = block.vel.add(to.norm().scale(1000 * progress * dt));
    }
    for (const bullet of state.bullets) {
      if (!bullet.alive) continue;
      const to = new Vec2(cx, cy).sub(bullet.pos); const d = to.mag();
      if (d > 3) bullet.vel = bullet.vel.add(to.norm().scale(600 * progress * dt));
    }
    // Inhaling particles
    if (Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2, r = 200 + Math.random() * 200;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      state.particles.push({ pos: new Vec2(px, py), vel: new Vec2(cx-px, cy-py).norm().scale(150+Math.random()*200), life: 0.3+Math.random()*0.4, maxLife:0.7, color: ['#ffffff','#ffcc88','#ffaa44'][Math.floor(Math.random()*3)], radius: 1+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.bigbangTimer <= 0) {
      // EXPLOSION
      for (const enemy of state.enemies) {
        if (!enemy.alive || enemy.isStatic) continue;
        takeDamage(enemy, 999);
        state.particles.push(...spawnExplosion(enemy.pos));
        const away = enemy.pos.sub(new Vec2(cx, cy));
        if (away.mag() > 1) enemy.vel = away.norm().scale(400 + Math.random() * 500);
      }
      for (const block of state.physicsBlocks) {
        if (!block.alive) continue;
        block.alive = false;
      }
      // Fire zone
      state.fireZones.push(createFireZone(new Vec2(cx, cy), 200, 5, 40));
      // Supernova particles
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 200 + Math.random() * 500;
        state.particles.push({ pos: new Vec2(cx, cy), vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 0.5+Math.random()*1.5, maxLife:2, color: ['#ffffff','#ffcc88','#ffaa44','#ff6600'][Math.floor(Math.random()*4)], radius: 3+Math.random()*8, alive:true, smokeExpand:true, isCross:false });
      }
      state.screenShake = 40;
      state.bigbangPhase = 'aftermath';
      state.bigbangTimer = 3;
    }
    return;
  }

  if (state.bigbangPhase === 'aftermath') {
    state.bigbangTimer -= dt;
    const elapsed = 3 - state.bigbangTimer;
    state.bigbangScale = 0.3 + 0.7 * Math.min(1, elapsed / 1.5); // 0.3 → 1 over 1.5s
    state.bigbangWhiteAlpha = Math.max(0, (3 - state.bigbangTimer) / 3 * 0.6);
    if (state.bigbangTimer <= 0) {
      state.bigbangPhase = 'idle';
      state.bigbangScale = 1;
      state.bigbangWhiteAlpha = 0;
    }
  }
}

export function drawBigBang(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.bigbangPhase === 'idle') return;
  const wa = state.bigbangWhiteAlpha;
  if (wa > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${wa})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }
  if (state.bigbangPhase === 'aftermath') {
    const px = (state as any).player?.pos?.x ?? MAP_W/2;
    const py = (state as any).player?.pos?.y ?? MAP_H/2;
    const et = 3 - state.bigbangTimer;
    const waveR = et * 350;
    const alpha = Math.max(0, 1 - et / 3) * 0.7;
    ctx.strokeStyle = `rgba(255,220,180,${alpha})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(px, py, waveR, 0, Math.PI * 2); ctx.stroke();
  }
}

registerEffect('bigbang', drawBigBang);

