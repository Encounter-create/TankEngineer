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

export function updateDamocles(state: SiegeState, dt: number): void {
  if (state.damoclesPhase === 'idle') return;

  if (state.damoclesPhase === 'hovering' || state.damoclesPhase === 'dropping') {
    state.damoclesTimer -= dt;
    // Slow enemies throughout
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      const slowFactor = state.damoclesPhase === 'dropping' ? 0.03 : Math.max(0.08, state.damoclesTimer / 13);
      enemy.vel = enemy.vel.scale(slowFactor);
    }
    // Phase transition at last 0.7s of total timer
    if (state.damoclesPhase === 'hovering' && state.damoclesTimer <= 0.7) {
      state.damoclesPhase = 'dropping';
    }
    if (state.damoclesPhase === 'dropping' && state.damoclesTimer <= 0) {
      // KILL — swords impale enemies
      for (const enemy of state.enemies) {
        if (!enemy.alive || enemy.isStatic) continue;
        takeDamage(enemy, 999);
        for (let i = 0; i < 50; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 200;
          state.particles.push({ pos: new Vec2(enemy.pos.x, enemy.pos.y), vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 0.6+Math.random()*0.8, maxLife:1.4, color: ['#ffcc00','#ffdd44','#ffaa00','#ffe888','#ffbb22'][Math.floor(Math.random()*5)], radius: 1.5+Math.random()*3, alive:true, smokeExpand:true, isCross:false });
        }
      }
      state.screenShake = 30;
      state.damoclesPhase = 'aftermath';
      state.damoclesTimer = 2;
    }
    // Sacred particles from each sword
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      const sy = enemy.pos.y - TANK_RADIUS * 13 - 5 + 10 + getDamoclesDescend(state);
      // Bright gold sparkles from pommel/guard
      for (let g = 0; g < 2; g++) {
        state.particles.push({ pos: new Vec2(enemy.pos.x+(Math.random()-0.5)*8, sy + Math.random()*8), vel: new Vec2((Math.random()-0.5)*12, -8-Math.random()*12), life: 0.3+Math.random()*0.4, maxLife:0.7, color: ['#fff8c0','#ffdd44','#ffffcc'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2.5, alive:true, smokeExpand:false, isCross:false });
      }
      // Cold blue sparkles from blade
      for (let b = 0; b < 2; b++) {
        const by = sy + 18 + Math.random() * 45;
        state.particles.push({ pos: new Vec2(enemy.pos.x+(Math.random()-0.5)*5, by), vel: new Vec2((Math.random()-0.5)*12, -6-Math.random()*12), life: 0.4+Math.random()*0.4, maxLife:0.8, color: ['#4488ff','#4466dd','#6688ee','#3355cc'][Math.floor(Math.random()*4)], radius: 2+Math.random()*4, alive:true, smokeExpand:false, isCross:false });
      }
      // Dropping golden trail
      if (state.damoclesPhase === 'dropping') {
        for (let t = 0; t < 3; t++) {
          state.particles.push({ pos: new Vec2(enemy.pos.x+(Math.random()-0.5)*10, sy + Math.random()*3), vel: new Vec2(0, -50-Math.random()*30), life: 0.12+Math.random()*0.15, maxLife:0.28, color: ['#ffffcc','#ffdd44','#ffcc00'][Math.floor(Math.random()*3)], radius: 2+Math.random()*3, alive:true, smokeExpand:true, isCross:false });
        }
      }
    }
    return;
  }

  if (state.damoclesPhase === 'aftermath') {
    state.damoclesTimer -= dt;
    if (state.damoclesTimer <= 0) {
      state.damoclesPhase = 'idle';
    }
  }

}

export function drawDamoclesSwords(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.damoclesPhase === 'idle') return;
  const isAftermath = state.damoclesPhase === 'aftermath';
  const descend = isAftermath ? 0 : getDamoclesDescend(state);
  const isDropping = !isAftermath && state.damoclesPhase === 'dropping';
  const threadShake = (!isAftermath && !isDropping) ? Math.sin(Date.now() / 1000 * 10) * 2 : 0;

  if (!isAftermath) {
    for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.isStatic) continue;
    const ex = enemy.pos.x, ey = enemy.pos.y;
    const anchorY = ey - TANK_RADIUS * 13 - 5;
    const pommelY = anchorY + 10 + descend; // pommel hangs from anchor, descends toward enemy
    const bladeTipY = pommelY + 65; // long blade

    // Thread
    ctx.strokeStyle = isDropping ? '#ff4444' : '#ffffff';
    ctx.lineWidth = isDropping ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(ex, anchorY);
    ctx.lineTo(ex + threadShake, pommelY); ctx.stroke();

    // Blade — long tapered double-edged sword
    const bTop = pommelY + 14;
    ctx.fillStyle = '#e8e8f8'; ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex, bTop);
    ctx.lineTo(ex - 4, bTop + 12); ctx.lineTo(ex - 2, bladeTipY);
    ctx.lineTo(ex + 2, bladeTipY); ctx.lineTo(ex + 4, bTop + 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(ex, bTop + 4); ctx.lineTo(ex, bladeTipY - 2); ctx.stroke();
    ctx.strokeStyle = '#a0a0c0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ex, bTop + 8); ctx.lineTo(ex, bladeTipY - 8); ctx.stroke();

    // Guard — ornate winged
    ctx.fillStyle = '#ffcc44'; ctx.strokeStyle = '#cc9900'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(ex - 12, bTop); ctx.lineTo(ex + 12, bTop);
    ctx.lineTo(ex + 10, bTop + 4); ctx.lineTo(ex - 10, bTop + 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(ex - 8, bTop + 2, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(ex + 8, bTop + 2, 2, 0, Math.PI*2); ctx.fill();

    // Grip
    ctx.fillStyle = '#4a2a10'; ctx.fillRect(ex - 2.5, pommelY + 6, 5, 8);
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 0.5;
    for (let w = 0; w < 3; w++) {
      ctx.beginPath(); ctx.moveTo(ex - 2.5, pommelY + 7 + w * 2.5);
      ctx.lineTo(ex + 2.5, pommelY + 8 + w * 2.5); ctx.stroke();
    }

    // Pommel — ruby-studded gold sphere
    ctx.fillStyle = '#ffcc44'; ctx.beginPath(); ctx.arc(ex, pommelY + 3, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff2222'; ctx.beginPath(); ctx.arc(ex, pommelY + 3, 2, 0, Math.PI*2); ctx.fill();
    }
  }
}

function getDamoclesDescend(state: SiegeState): number {
  if (state.damoclesPhase === 'hovering') return 0;
  if (state.damoclesPhase === 'dropping') {
    const t = 1 - state.damoclesTimer / 0.707;
    return 138 * t * t; // blade MIDDLE hits enemy center (anchor 187 - pommelOffset 10 - halfBlade 39.5 = 137.5)
  }
  return 0;
}

