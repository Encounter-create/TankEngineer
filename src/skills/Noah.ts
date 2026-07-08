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

export function updateArk(state: SiegeState, dt: number): void {
  if (state.arkPhase === 'idle') return;
  const t = Date.now() / 1000;
  const MAX_H = MAP_H * 0.6;
  const RISE_TIME = 11, PEAK_TIME = 1, FALL_TIME = 11;

  // Compute water height
  if (state.arkPhase === 'raining') {
    state.arkTimer -= dt;
    const progress = Math.min(1, (RISE_TIME - state.arkTimer) / RISE_TIME);
    state.arkWaterH = MAX_H * progress * progress;
    if (state.arkTimer <= 0) { state.arkPhase = 'peaking'; state.arkTimer = PEAK_TIME; state.arkLightningTimer = 1; }
  } else if (state.arkPhase === 'peaking') {
    state.arkTimer -= dt;
    state.arkWaterH = MAX_H;
    if (state.arkTimer <= 0) { state.arkPhase = 'receding'; state.arkTimer = FALL_TIME; }
  } else if (state.arkPhase === 'receding') {
    state.arkTimer -= dt;
    const progress = Math.min(1, (FALL_TIME - state.arkTimer) / FALL_TIME);
    state.arkWaterH = MAX_H * (1 - progress * progress);
    if (state.arkTimer <= 0) { state.arkPhase = 'idle'; state.arkWaterH = 0; state.arkLightningBranches = []; return; }
  }
  const waterY = MAP_H - state.arkWaterH;
  const isReceding = state.arkPhase === 'receding';

  // Rain — heavy throughout the entire skill (rising + peak + receding)
  const rainCount = state.arkPhase === 'receding' ? 2 : 6;
  for (let i = 0; i < rainCount; i++) {
    state.particles.push({ pos: new Vec2(Math.random()*MAP_W, -10), vel: new Vec2(-30-Math.random()*40, 250+Math.random()*150), life: 1.5+Math.random(), maxLife:2.5, color: '#6699cc', radius: 1.5+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
  }
  // Lightning — throughout the entire skill
  state.arkLightningTimer -= dt;
  if (state.arkLightningTimer <= 0) {
    state.arkLightningTimer = state.arkPhase === 'receding' ? (0.8 + Math.random() * 2) : (0.4 + Math.random() * 1.2);
    const genBranch = (startX: number): Vec2[] => {
      const segs = 2 + Math.floor(Math.random() * 4);
      const pts: Vec2[] = [new Vec2(startX, 0)];
      let px = startX;
      for (let s = 1; s <= segs; s++) {
        const ly = (s / segs) * (180 + Math.random() * 140);
        px = Math.max(10, Math.min(MAP_W - 10, px + (Math.random() - 0.5) * 100));
        pts.push(new Vec2(px, ly));
      }
      return pts;
    };
    const lx = Math.random() * MAP_W;
    state.arkLightningBranches = [genBranch(lx)];
    for (let i = 0; i < 3; i++) {
      state.arkLightningBranches.push(genBranch(lx + (Math.random()-0.5)*120));
    }
    state.screenShake = Math.max(state.screenShake, 12);
    for (let i = 0; i < 10; i++) {
      state.particles.push({ pos: new Vec2(lx+(Math.random()-0.5)*80, 40+Math.random()*150), vel: new Vec2((Math.random()-0.5)*20, -5-Math.random()*20), life: 0.3+Math.random()*0.4, maxLife:0.7, color: ['#ffdd44','#ffaa00','#ffcc00'][Math.floor(Math.random()*3)], radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
    }
  }

  // === Sticky surface: objects touching water get captured ===
  const snapEnemy = (enemy: TankEntity) => {
    if (enemy.isStatic) return;
    const sx = isReceding ? enemy.pos.x + 300 * dt : enemy.pos.x + Math.sin(t * 8 + enemy.pos.x * 0.05) * 20;
    enemy.pos = new Vec2(sx, waterY - TANK_RADIUS - 3);
    enemy.vel = Vec2.zero();
    takeDamage(enemy, 20 * dt);
    if (Math.random() < 0.7) {
      state.particles.push({ pos: new Vec2(enemy.pos.x+(Math.random()-0.5)*30, waterY-5), vel: new Vec2((Math.random()-0.5)*60, -30-Math.random()*80), life: 0.3+Math.random()*0.4, maxLife:0.7, color: '#ffffff', radius: 4+Math.random()*6, alive:true, smokeExpand:false, isCross:false });
      state.particles.push({ pos: new Vec2(enemy.pos.x+(Math.random()-0.5)*25, waterY-3), vel: new Vec2((Math.random()-0.5)*40, -20-Math.random()*50), life: 0.4+Math.random()*0.4, maxLife:0.8, color: '#88bbff', radius: 3+Math.random()*5, alive:true, smokeExpand:false, isCross:false });
    }
  };

  const snapBlock = (block: PhysicsBlock) => {
    const sx = block.pos.x + 250 * dt; // same speed rising and receding
    block.pos = new Vec2(sx, waterY - BLOCK_RADIUS - 3);
    block.vel = Vec2.zero();
    if (Math.random() < 0.5) {
      state.particles.push({ pos: new Vec2(block.pos.x+(Math.random()-0.5)*20, waterY-3), vel: new Vec2((Math.random()-0.5)*40, -20-Math.random()*50), life: 0.3+Math.random()*0.3, maxLife:0.6, color: '#ffffff', radius: 3+Math.random()*4, alive:true, smokeExpand:false, isCross:false });
    }
  };

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.pos.y > waterY - TANK_RADIUS * 2) {
      snapEnemy(enemy);
      if (isReceding && enemy.pos.x > MAP_W - 20) {
        takeDamage(enemy, 999);
        state.particles.push(...spawnParticles(enemy.pos, 'explosion', 10, 80));
      }
    }
  }
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    if (block.pos.y > waterY - BLOCK_RADIUS * 2) {
      snapBlock(block);
      // Destroy when swept to edge during receding
      if (isReceding && block.pos.x > MAP_W - 20) {
        block.alive = false;
        state.particles.push(...spawnParticles(block.pos, 'explosion', 8, 60));
      }
    }
  }
  // Player: cannot go below water surface
  if (state.player.alive && state.player.pos.y > waterY - TANK_RADIUS) {
    state.player.pos = new Vec2(state.player.pos.x, waterY - TANK_RADIUS - 3);
    state.player.vel = Vec2.zero();
  }

  // === Constant surface spray + internal turbulence ===
  // Surface foam particles (always, regardless of objects)
  if (Math.random() < 0.9) {
    const sx = Math.random() * MAP_W;
    const sy = waterY + Math.sin(sx * 0.05 + t * 2.8) * 8;
    state.particles.push({ pos: new Vec2(sx, sy), vel: new Vec2((Math.random()-0.5)*50, -20-Math.random()*80), life: 0.3+Math.random()*0.5, maxLife:0.8, color: Math.random() < 0.4 ? '#ffffff' : '#88ccff', radius: 3+Math.random()*7, alive:true, smokeExpand:false, isCross:false });
  }
  // Internal water turbulence
  if (Math.random() < 0.7) {
    const ix = Math.random() * MAP_W;
    const iy = waterY + 30 + Math.random() * (MAP_H - waterY - 40);
    state.particles.push({ pos: new Vec2(ix, iy), vel: new Vec2((Math.random()-0.5)*30, -10-Math.random()*40), life: 0.4+Math.random()*0.6, maxLife:1, color: ['#4488cc','#6699dd','#88bbff'][Math.floor(Math.random()*3)], radius: 2+Math.random()*4, alive:true, smokeExpand:false, isCross:false });
  }
}

export function drawArk(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.arkPhase === 'idle' || state.arkWaterH < 10) return;
  const px = state.player.pos.x, py = MAP_H - state.arkWaterH - 10;
  ctx.save();
  ctx.fillStyle = '#5C3317'; ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px-28, py); ctx.lineTo(px+28, py);
  ctx.quadraticCurveTo(px+20, py+14, px, py+16);
  ctx.quadraticCurveTo(px-20, py+14, px-28, py); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a4a2a'; ctx.fillRect(px-10, py-16, 20, 14);
  ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 1; ctx.strokeRect(px-10, py-16, 20, 14);
  ctx.restore();
}

export function drawArkWater(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.arkPhase === 'idle' || state.arkWaterH < 5) return;
  const waterY = MAP_H - state.arkWaterH;
  const t = Date.now() / 1000;

  // Storm sky + rain — throughout the entire skill
  {
    const skyAlpha = state.arkPhase === 'receding' ? 0.55 : 0.75;
    const sg = ctx.createLinearGradient(0, 0, 0, waterY);
    sg.addColorStop(0, `rgba(3,5,15,${skyAlpha})`);
    sg.addColorStop(1, `rgba(10,20,45,${skyAlpha*0.27})`);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, MAP_W, waterY);
    // Pixel clouds
    ctx.fillStyle = '#1a1a2a';
    for (let cx = 60; cx < MAP_W; cx += 120+Math.random()*40) {
      const cy = 10+Math.sin(cx*0.1+t)*8;
      ctx.beginPath(); ctx.ellipse(cx, cy, 40, 14, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx-20, cy+4, 28, 12, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+20, cy+2, 30, 11, 0, 0, Math.PI*2); ctx.fill();
    }
    // Heavy rain lines — only above water surface (water covers below)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, MAP_W, waterY); ctx.clip();
    const rainLines = state.arkPhase === 'receding' ? 6 : 15;
    for (let i = 0; i < rainLines; i++) {
      const rx = Math.random()*MAP_W, ry = Math.random()*waterY;
      ctx.fillStyle = `rgba(140,180,230,0.5)`;
      ctx.fillRect(rx-0.5, ry, 1.5, 10);
    }
    ctx.restore();
  }

  // Lightning branches + white screen flash
  if (state.arkLightningTimer > 0 && state.arkLightningBranches.length > 0) {
    // White flash (gradually fading)
    const flashAlpha = 0.35 * Math.min(1, state.arkLightningTimer / 0.6);
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Branches with gradual fade
    const branchAlpha = Math.min(1, state.arkLightningTimer / 0.3);
    for (const branch of state.arkLightningBranches) {
      ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 5; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20;
      ctx.globalAlpha = branchAlpha;
      ctx.beginPath(); ctx.moveTo(branch[0].x, branch[0].y);
      for (let i = 1; i < branch.length; i++) ctx.lineTo(branch[i].x, branch[i].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // Water: 3 wave layers with large amplitudes
  ctx.fillStyle = 'rgba(5,15,50,0.6)';
  ctx.beginPath(); ctx.moveTo(0, MAP_H);
  for (let x = 0; x <= MAP_W; x += 2) {
    ctx.lineTo(x, waterY + Math.sin(x*0.03+t*5.4)*14 + Math.sin(x*0.07+t*7.5)*8);
  }
  ctx.lineTo(MAP_W, MAP_H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgba(10,30,80,0.4)';
  ctx.beginPath(); ctx.moveTo(0, MAP_H);
  for (let x = 0; x <= MAP_W; x += 2) {
    ctx.lineTo(x, waterY + 6 + Math.sin(x*0.05+t*8.4)*11 + Math.sin(x*0.09+t*10.5)*6);
  }
  ctx.lineTo(MAP_W, MAP_H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgba(20,50,120,0.3)';
  ctx.beginPath(); ctx.moveTo(0, MAP_H);
  for (let x = 0; x <= MAP_W; x += 2) {
    ctx.lineTo(x, waterY + 12 + Math.sin(x*0.07+t*12)*8 + Math.sin(x*0.12+t*16.5)*5);
  }
  ctx.lineTo(MAP_W, MAP_H); ctx.closePath(); ctx.fill();

  // Wave crest highlights
  ctx.strokeStyle = 'rgba(140,210,255,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, waterY+Math.sin(t*6)*10);
  for (let x = 0; x <= MAP_W; x += 3) {
    ctx.lineTo(x, waterY + Math.sin(x*0.05+t*8.4)*10 + Math.sin(x*0.1+t*12)*6);
  }
  ctx.stroke();
  // Secondary crest
  ctx.strokeStyle = 'rgba(180,230,255,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, waterY+6+Math.sin(t*9)*8);
  for (let x = 0; x <= MAP_W; x += 4) {
    ctx.lineTo(x, waterY + 8 + Math.sin(x*0.06+t*10.5)*9 + Math.sin(x*0.13+t*15)*5);
  }
  ctx.stroke();

  // Internal water turbulence — scattered particles throughout water body
  for (let i = 0; i < 5; i++) {
    const px = Math.random() * MAP_W;
    const py = waterY + 20 + Math.random() * (MAP_H - waterY - 20);
    ctx.fillStyle = `rgba(140,200,255,${0.15+Math.random()*0.2})`;
    ctx.beginPath(); ctx.arc(px, py, 2+Math.random()*4, 0, Math.PI*2); ctx.fill();
  }
  // Surface spray — constant white/blue foam particles
  for (let i = 0; i < 6; i++) {
    const sx = Math.random() * MAP_W;
    const sy = waterY + Math.sin(sx*0.05+t*2.8)*8 - 2 - Math.random()*10;
    const c = Math.random() < 0.5 ? '#ffffff' : '#88ccff';
    ctx.fillStyle = c; ctx.globalAlpha = 0.6+Math.random()*0.4;
    ctx.beginPath(); ctx.arc(sx, sy, 2+Math.random()*5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

registerEffect('noah_ark', drawArk);
registerEffect('noah_water', drawArkWater);

