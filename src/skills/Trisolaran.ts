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
    const hasMeteorZone = state.fireZones.some(z => z.alive && z.radius >= 100);
    if (!hasMeteorZone) {
      state.meteorPhase = 'idle';
    }
  }
}

export function drawMeteor(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.meteorPhase === 'idle') return;

  // Targeting + Incoming: red circle + white crosshair at target
  if (state.meteorPhase === 'targeting' || state.meteorPhase === 'incoming') {
    const mt = state.meteorTarget;
    const flash = state.meteorPhase === 'targeting' ? Math.abs(Math.sin(performance.now() / 1000 * 8)) : 1;
    ctx.strokeStyle = `rgba(255,40,0,${0.3 + 0.5 * flash})`; ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.arc(mt.x, mt.y, 360, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const cs = 360;
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * flash})`; ctx.lineWidth = 1.5;
    ctx.setLineDash([20, 10]);
    ctx.beginPath(); ctx.moveTo(mt.x - cs, mt.y); ctx.lineTo(mt.x + cs, mt.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mt.x, mt.y - cs); ctx.lineTo(mt.x, mt.y + cs); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,30,30,${0.5 + 0.5 * flash})`;
    ctx.font = `bold ${28 + flash * 8}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('世界属于三体！！！', MAP_W / 2, MAP_H / 2);
  }

  // Incoming: fireball
  if (state.meteorPhase === 'incoming') {
    const mp = state.meteorPos;
    const glow = ctx.createRadialGradient(mp.x, mp.y, 15, mp.x, mp.y, 120);
    glow.addColorStop(0, 'rgba(255,200,50,0.9)');
    glow.addColorStop(0.5, 'rgba(255,80,0,0.6)');
    glow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 120, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 15, 0, Math.PI * 2); ctx.fill();
  }

  // White flash overlay
  if (state.meteorFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${state.meteorFlashAlpha})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }
}

registerEffect('meteor', drawMeteor);

