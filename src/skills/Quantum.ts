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
import { registerEffect } from '../ui/EffectRenderer';

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

export function drawQuantum(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.quantumPhase === 'idle') return;
  let elapsed: number;
  if (state.quantumPhase === 'superposing') elapsed = 5 - state.quantumTimer;
  else if (state.quantumPhase === 'collapsed') elapsed = 5 + (3 - state.quantumTimer);
  else elapsed = 0;
  const hasOverlay = state.quantumRedAlpha > 0.01 || state.quantumBlueAlpha > 0.01 || state.quantumPhase === 'collapsed';
  if (hasOverlay && state.quantumPhase !== 'collapsed') {
    ctx.fillStyle = `rgba(255,60,60,${Math.max(0, state.quantumRedAlpha * 0.5)})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = `rgba(60,60,255,${Math.max(0, state.quantumBlueAlpha * 0.5)})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }
  drawQuantumCat(ctx, elapsed);
}

function drawQuantumCat(ctx: CanvasRenderingContext2D, elapsed: number): void {
  let cx: number, cy = MAP_H / 2;
  if (elapsed <= 4) {
    cx = -30 + (MAP_W / 2 + 30) * (elapsed / 4); // left edge → center
  } else if (elapsed <= 5) {
    cx = MAP_W / 2; // center
  } else {
    cx = MAP_W / 2 + (MAP_W / 2 + 30) * ((elapsed - 5) / 3); // center → right
  }
  const walking = elapsed <= 4 || elapsed > 5;
  const bounce = walking ? Math.abs(Math.sin(elapsed * 8)) * 4 : 0;
  const lookUp = elapsed > 4 && elapsed <= 5;

  ctx.save();
  ctx.translate(cx, cy + bounce);
  // Body (ellipse)
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.ellipse(0, 5, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
  // Head (circle)
  ctx.beginPath(); ctx.arc(lookUp ? 2 : 0, -10, 10, 0, Math.PI * 2); ctx.fill();
  // Ears (triangles)
  ctx.beginPath(); ctx.moveTo(-7, -18); ctx.lineTo(-3, -28); ctx.lineTo(2, -18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2, -18); ctx.lineTo(3, -28); ctx.lineTo(7, -18); ctx.closePath(); ctx.fill();
  // Inner ears (pink)
  ctx.fillStyle = '#f8a0c0';
  ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(-2, -25); ctx.lineTo(0, -18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(2, -25); ctx.lineTo(5, -18); ctx.closePath(); ctx.fill();
  // Eyes
  ctx.fillStyle = '#44dd44';
  if (lookUp) {
    ctx.beginPath(); ctx.arc(-4, -13, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -13, 3, 0, Math.PI * 2); ctx.fill();
    // Meow bubble
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(14, -35, 50, 20, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('喵呜~', 20, -22);
  } else {
    ctx.beginPath(); ctx.arc(-4, -10, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -10, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Pupils
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-4, -10, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -10, 1.2, 0, Math.PI * 2); ctx.fill();
  // Nose
  ctx.fillStyle = '#f8a0c0';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-2, -5); ctx.lineTo(2, -5); ctx.closePath(); ctx.fill();
  // Tail (only when walking)
  if (walking) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-16, 3);
    const tailWave = Math.sin(elapsed * 12) * 15;
    ctx.quadraticCurveTo(-26, -5 + tailWave, -30, -12 + tailWave);
    ctx.stroke();
  }
  // Whiskers
  ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8;
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath(); ctx.moveTo(s * 5, -6); ctx.lineTo(s * 18, s * 3 - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 5, -5); ctx.lineTo(s * 18, -6); ctx.stroke();
  }
  // Legs
  if (walking) {
    ctx.fillStyle = '#333';
    const legOff = Math.sin(elapsed * 12) * 5;
    ctx.fillRect(-10, 14, 5, 8 + legOff); ctx.fillRect(-2, 14, 5, 8 - legOff);
    ctx.fillRect(3, 14, 5, 8 + legOff); ctx.fillRect(9, 14, 5, 8 - legOff);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(-10, 14, 5, 8); ctx.fillRect(-2, 14, 5, 8);
    ctx.fillRect(3, 14, 5, 8); ctx.fillRect(9, 14, 5, 8);
  }
  ctx.restore();
}

registerEffect('quantum', drawQuantum);

