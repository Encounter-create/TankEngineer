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
import { lensCanvas, lensCtx, LENS_W, LENS_H } from '../ui/RenderContext';
import { playExplosion } from '../systems/Sound';

export function updateLens(state: SiegeState, dt: number): void {
  if (state.lensPhase === 'idle') return;

  if (state.lensPhase === 'forming') {
    state.lensTimer -= dt;
    const progress = 1 - Math.max(0, state.lensTimer / 2);
    state.lensStrength = progress;
    state.lensRadius = 250 * progress;
    // Spiral particles (heavy)
    for (let p = 0; p < 3; p++) {
      const a = performance.now() / 1000 * 3 + Math.random() * Math.PI * 2 + p * 2.1;
      const r = state.lensRadius * (0.2 + Math.random() * 0.8);
      const colors = ['#ff2244','#ff4466','#4488ff','#2244ff','#6644cc','#aa44ff'];
      state.particles.push({ pos: new Vec2(state.lensTarget.x + Math.cos(a)*r, state.lensTarget.y + Math.sin(a)*r),
        vel: new Vec2(-Math.sin(a)*80, Math.cos(a)*80).scale(0.6),
        life: 0.6+Math.random()*0.6, maxLife:1.2, color: colors[Math.floor(Math.random()*colors.length)],
        radius: 3+Math.random()*4, alive:true, smokeExpand:false, isCross:false });
    }
    // Gravity pull
    if (progress > 0.3) {
      for (const enemy of state.enemies) {
        if (!enemy.alive || enemy.isStatic) continue;
        const to = state.lensTarget.sub(enemy.pos); const d = to.mag();
        if (d < state.lensRadius && d > 0) {
          enemy.vel = enemy.vel.add(to.norm().scale(600 * progress * dt));
          // Tangential spiral
          const tang = new Vec2(-to.y, to.x).norm();
          enemy.vel = enemy.vel.add(tang.scale(150 * progress * dt));
        }
      }
      for (const block of state.physicsBlocks) {
        if (!block.alive) continue;
        const to = state.lensTarget.sub(block.pos); const d = to.mag();
        if (d < state.lensRadius && d > 0) {
          block.vel = block.vel.add(to.norm().scale(500 * progress * dt));
        }
      }
    }
    if (state.lensTimer <= 0) { state.lensPhase = 'active'; state.lensTimer = 6; }
    return;
  }

  if (state.lensPhase === 'active') {
    state.lensTimer -= dt;
    state.lensStrength = 1;
    state.lensRadius = 250;
    // Continuous pull + spiral
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      const to = state.lensTarget.sub(enemy.pos); const d = to.mag();
      if (d < state.lensRadius && d > 0) {
        enemy.vel = enemy.vel.add(to.norm().scale(600 * dt));
        const tang = new Vec2(-to.y, to.x).norm();
        enemy.vel = enemy.vel.add(tang.scale(150 * dt));
      }
      if (d < 30) { takeDamage(enemy, 30 * dt, state.player); }
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      const to = state.lensTarget.sub(block.pos); const d = to.mag();
      if (d < state.lensRadius && d > 0) block.vel = block.vel.add(to.norm().scale(500 * dt));
      if (d < 20) block.alive = false;
    }
    // Spiral particles (heavy, blue+red)
    for (let p = 0; p < 4; p++) {
      const a = performance.now()/1000 * 3 + Math.random()*Math.PI*2 + p * 1.6;
      const r = 250 * (0.1+Math.random()*0.9);
      const colors = ['#ff2244','#ff4466','#ff6688','#4488ff','#2244ff','#6644ff','#8844ff','#aa44cc'];
      state.particles.push({ pos: new Vec2(state.lensTarget.x+Math.cos(a)*r, state.lensTarget.y+Math.sin(a)*r),
        vel: new Vec2(-Math.sin(a)*90, Math.cos(a)*90).scale(0.7), life:0.5+Math.random()*0.7, maxLife:1.2,
        color: colors[Math.floor(Math.random()*colors.length)], radius:3+Math.random()*5, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.lensTimer <= 0) {
      state.lensPhase = 'collapsing'; state.lensTimer = 2;
      // Destroy enemies in radius
      for (const enemy of state.enemies) {
        if (enemy.alive && enemy.pos.dist(state.lensTarget) < 280) {
          takeDamage(enemy, 999); state.particles.push(...spawnExplosion(enemy.pos));
        }
      }
      for (const block of state.physicsBlocks) {
        if (block.alive && block.pos.dist(state.lensTarget) < 280) block.alive = false;
      }
      // White flash
      for (let i = 0; i < 30; i++) {
        const a = Math.random()*Math.PI*2; const spd = 150+Math.random()*200;
        state.particles.push({ pos: state.lensTarget, vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd),
          life:0.5+Math.random()*0.5, maxLife:1, color:'#fff', radius:3+Math.random()*5, alive:true, smokeExpand:true, isCross:false });
      }
    }
    return;
  }

  if (state.lensPhase === 'collapsing') {
    state.lensTimer -= dt;
    state.lensStrength = Math.max(0, state.lensTimer / 2);
    state.lensRadius = 250 * state.lensStrength;
    if (state.lensTimer <= 0) { state.lensPhase = 'idle'; state.lensStrength = 0; state.lensRadius = 0; }
  }
}

export function drawLens(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.lensPhase === 'idle') return;
  const cx = state.lensTarget.x, cy = state.lensTarget.y, r = state.lensRadius;
  if (r <= 5) return;
  const llx = Math.round(cx * LENS_W / MAP_W), lly = Math.round(cy * LENS_H / MAP_H);
  const lr = Math.round(r * LENS_W / MAP_W);
  lensCtx.drawImage(ctx.canvas, 0, 0, MAP_W, MAP_H, 0, 0, LENS_W, LENS_H);
  const src = lensCtx.getImageData(0, 0, LENS_W, LENS_H);
  const dst = new ImageData(LENS_W, LENS_H);
  const strength = state.lensStrength;
  for (let py = 0; py < LENS_H; py++) {
    for (let px = 0; px < LENS_W; px++) {
      const dx = px - llx, dy = py - lly;
      const d = Math.sqrt(dx * dx + dy * dy);
      const idx = (py * LENS_W + px) * 4;
      if (d < lr && d > 0 && lr > 1) {
        const disp = strength * (lr * lr / d) * (1 - d / lr) * 0.7;
        const ndx = dx / d, ndy = dy / d;
        const tangX = -ndy * disp * 0.3, tangY = ndx * disp * 0.3;
        let sx = Math.round(px + ndx * disp + tangX);
        let sy = Math.round(py + ndy * disp + tangY);
        sx = Math.max(0, Math.min(LENS_W - 1, sx));
        sy = Math.max(0, Math.min(LENS_H - 1, sy));
        const si = (sy * LENS_W + sx) * 4;
        const ratio = d / Math.max(1, lr);
        const rMul = 1 - ratio * 0.5;
        const gMul = 1 - Math.abs(ratio - 0.5) * 0.4;
        const bMul = 0.6 + ratio * 0.6;
        const bright = d < lr * 0.15 ? 1.5 : 1;
        dst.data[idx] = Math.min(255, src.data[si] * rMul * bright);
        dst.data[idx + 1] = Math.min(255, src.data[si + 1] * gMul * bright);
        dst.data[idx + 2] = Math.min(255, src.data[si + 2] * bMul * bright);
        dst.data[idx + 3] = 255;
      } else {
        dst.data[idx] = src.data[idx];
        dst.data[idx + 1] = src.data[idx + 1];
        dst.data[idx + 2] = src.data[idx + 2];
        dst.data[idx + 3] = 255;
      }
    }
  }
  lensCtx.putImageData(dst, 0, 0);
  ctx.drawImage(lensCanvas, 0, 0, LENS_W, LENS_H, 0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = `rgba(180,120,255,${0.4 * strength})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

registerEffect('lens', drawLens);

