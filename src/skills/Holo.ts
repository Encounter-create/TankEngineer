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

export function drawHolo(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.holoPhase === 'idle') return;
  const cx = MAP_W / 2, cy = MAP_H / 2, r = state.holoRadius;
  if (r > 5 && state.holoPhase !== 'aftermath') {
    lensCtx.drawImage(ctx.canvas, 0, 0, MAP_W, MAP_H, 0, 0, LENS_W, LENS_H);
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(lensCanvas, 0, 0, LENS_W, LENS_H, 0, 0, MAP_W, MAP_H);
    const lightX = cx + Math.cos(state.holoRotation) * r * 0.3;
    const lightY = cy + Math.sin(state.holoRotation * 0.7) * r * 0.3;
    const shade = ctx.createRadialGradient(lightX, lightY, r * 0.1, cx, cy, r);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    shade.addColorStop(0.7, 'rgba(0,0,20,0.3)');
    shade.addColorStop(1, 'rgba(0,0,40,0.7)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.strokeStyle = 'rgba(100,200,255,0.25)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const angle = state.holoRotation + i * Math.PI / 3;
      const ex = cx + Math.cos(angle) * r;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(ex, cy, cx, cy + r); ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const ly = cy - r + i * r * 0.5;
      const lr = Math.sqrt(r * r - (ly - cy) * (ly - cy));
      ctx.beginPath(); ctx.ellipse(cx, ly, lr, lr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(100,200,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (state.holoPhase === 'shattering') {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      for (let i = 0; i < state.holoCracks; i++) {
        const a1 = (i / state.holoCracks) * Math.PI * 2 + state.holoRotation * 0.1;
        const a2 = a1 + 0.3 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a1) * r * 0.3, cy + Math.sin(a1) * r * 0.3);
        ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
        ctx.stroke();
      }
    }
  } else if (state.holoPhase === 'aftermath') {
    const alpha = state.holoTimer / 2;
    ctx.strokeStyle = `rgba(100,200,255,${alpha})`; ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const fr = state.holoRadius * (0.3 + Math.random() * 0.7);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * fr, cy + Math.sin(a) * fr);
      ctx.stroke();
    }
  }
}

registerEffect('holo', drawHolo);

