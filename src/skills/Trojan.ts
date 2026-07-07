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

export function updateTrojan(state: SiegeState, dt: number): void {
  if (state.trojanPhase === 'idle') return;
  const horseCY = MAP_H / 2 + 25;

  if (state.trojanPhase === 'entering') {
    state.trojanTimer -= dt;
    const progress = Math.min(1, (2 - state.trojanTimer) / 2);
    state.trojanX = -120 + (MAP_W / 2 + 120) * progress;
    state.screenShake = Math.max(state.screenShake, 5 * (1 - progress));
    // Dust particles from wheels
    if (Math.random() < 0.4) state.particles.push({ pos: new Vec2(state.trojanX - 40, horseCY + 20 + Math.random()*20), vel: new Vec2(-30-Math.random()*30, -10-Math.random()*20), life: 0.4+Math.random()*0.4, maxLife:0.8, color: ['#c8a050','#d4b060','#e0c070'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
    // Ramming: push enemies and blocks in horse's path
    const hx = state.trojanX, hy = horseCY;
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      if (enemy.pos.x > hx - 55 && enemy.pos.x < hx + 90 && enemy.pos.y > hy - 35 && enemy.pos.y < hy + 55) {
        enemy.vel = new Vec2(500 + Math.random() * 300, (Math.random() - 0.5) * 200);
        enemy.pos = new Vec2(enemy.pos.x + 100, enemy.pos.y);
        takeDamage(enemy, 20);
        // Spark particles at contact
        for (let s = 0; s < 8; s++) {
          state.particles.push({ pos: new Vec2(enemy.pos.x, enemy.pos.y), vel: new Vec2((Math.random()-0.5)*200, (Math.random()-0.5)*200), life: 0.2+Math.random()*0.3, maxLife:0.5, color: ['#ff8800','#ffaa00','#ffcc44'][Math.floor(Math.random()*3)], radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
        }
      }
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      if (block.pos.x > hx - 55 && block.pos.x < hx + 90 && block.pos.y > hy - 35 && block.pos.y < hy + 55) {
        block.vel = new Vec2(400 + Math.random() * 400, (Math.random() - 0.5) * 300);
        block.pos = new Vec2(block.pos.x + 80, block.pos.y);
        for (let s = 0; s < 6; s++) {
          state.particles.push({ pos: new Vec2(block.pos.x, block.pos.y), vel: new Vec2((Math.random()-0.5)*150, (Math.random()-0.5)*150), life: 0.2+Math.random()*0.3, maxLife:0.5, color: ['#ff8800','#ffaa00'][Math.floor(Math.random()*2)], radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
        }
      }
    }
    if (state.trojanTimer <= 0) { state.trojanPhase = 'opening'; state.trojanTimer = 1; }
    return;
  }

  if (state.trojanPhase === 'opening') {
    state.trojanTimer -= dt;
    state.trojanDoor = Math.min(1, (1 - state.trojanTimer) / 1);
    state.trojanX = MAP_W / 2;
    // Golden light particles from door
    if (Math.random() < 0.6) {
      const dx = state.trojanX + 50 + Math.random() * 30;
      const dy = horseCY - 5 + Math.random() * 20;
      state.particles.push({ pos: new Vec2(dx, dy), vel: new Vec2(30+Math.random()*30, -5-Math.random()*15), life: 0.3+Math.random()*0.3, maxLife:0.6, color: ['#ffcc00','#ffdd44','#ffaa00'][Math.floor(Math.random()*3)], radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.trojanTimer <= 0) { state.trojanPhase = 'deploying'; state.trojanTimer = 3; state.trojanSpawned = 0; }
    return;
  }

  if (state.trojanPhase === 'deploying') {
    state.trojanTimer -= dt;
    state.trojanX = MAP_W / 2;
    state.trojanDoor = 1;
    // Continuous golden glow + particles throughout deploying
    if (Math.random() < 0.8) {
      const gx = state.trojanX + 50 + Math.random() * 20;
      const gy = horseCY - 5 + Math.random() * 15;
      state.particles.push({ pos: new Vec2(gx, gy), vel: new Vec2(40+Math.random()*60, -5-Math.random()*15), life: 0.4+Math.random()*0.5, maxLife:0.9, color: ['#ffcc00','#ffdd44','#ffaa00','#ffe888'][Math.floor(Math.random()*4)], radius: 2+Math.random()*4, alive:true, smokeExpand:false, isCross:false });
    }
    // Spawn allies every 0.5s
    const targetCount = Math.min(6, Math.floor((3 - state.trojanTimer) / 0.5) + 1);
    while (state.trojanSpawned < targetCount) {
      const cfg = assembleTank(
        MVP_BARRELS[Math.floor(Math.random() * MVP_BARRELS.length)],
        MVP_TURRETS[Math.floor(Math.random() * MVP_TURRETS.length)],
        MVP_CHASSIS[Math.floor(Math.random() * MVP_CHASSIS.length)],
        DEFAULT_COMMANDER,
      );
      const spawnX = state.trojanX + 60 + state.trojanSpawned * 15;
      const ally = createAllyTank(`trojan_${Date.now()}_${state.trojanSpawned}`, new Vec2(spawnX, horseCY + 40), cfg, 'guard_player');
      ally.followRadius = 180; ally.visionRadius = 250;
      (state as any).allies.push(ally);
      state.trojanSpawned++;
    }
    if (state.trojanTimer <= 0) { state.trojanPhase = 'shattering'; state.trojanTimer = 2; }
    return;
  }

  if (state.trojanPhase === 'shattering') {
    state.trojanTimer -= dt;
    // Slide out to the right with screen shake
    const progress = Math.min(1, (2 - state.trojanTimer) / 2);
    state.trojanX = MAP_W / 2 + (MAP_W + 200) * progress * progress;
    state.screenShake = Math.max(state.screenShake, 8 * progress);
    // Dust particles from wheels
    if (Math.random() < 0.6) {
      state.particles.push({ pos: new Vec2(state.trojanX - 40, horseCY + 40 + Math.random()*15), vel: new Vec2(20+Math.random()*30, -10-Math.random()*15), life: 0.3+Math.random()*0.3, maxLife:0.6, color: ['#c8a050','#b09040','#a08030'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2, alive:true, smokeExpand:false, isCross:false });
    }
    if (state.trojanTimer <= 0) { state.trojanPhase = 'idle'; state.trojanDoor = 0; state.trojanSpawned = 0; }
  }
}

export function drawTrojanHorse(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.trojanPhase === 'idle') return;
  const cx = state.trojanX, cy = MAP_H / 2 + 25;
  ctx.save();
  // Body — elongated oval (horse torso)
  ctx.fillStyle = '#8B6914'; ctx.strokeStyle = '#5a3a0a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(cx, cy, 65, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Neck — steep upright from front of body
  ctx.fillStyle = '#7a5a10';
  ctx.beginPath(); ctx.moveTo(cx + 45, cy - 8);
  ctx.lineTo(cx + 60, cy - 55); ctx.lineTo(cx + 72, cy - 10);
  ctx.lineTo(cx + 55, cy + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Head — elongated horse snout
  ctx.fillStyle = '#8B6914';
  ctx.beginPath(); ctx.moveTo(cx + 60, cy - 55);
  ctx.lineTo(cx + 90, cy - 50); ctx.lineTo(cx + 85, cy - 36);
  ctx.lineTo(cx + 68, cy - 38); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Snout tip
  ctx.fillStyle = '#6B4914';
  ctx.beginPath(); ctx.ellipse(cx + 87, cy - 43, 5, 3.5, -0.3, 0, Math.PI * 2); ctx.fill();
  // Nostril
  ctx.fillStyle = '#3a1a00'; ctx.beginPath(); ctx.arc(cx + 89, cy - 44, 1.2, 0, Math.PI * 2); ctx.fill();
  // Eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 78, cy - 47, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx + 78, cy - 47, 1.2, 0, Math.PI * 2); ctx.fill();
  // Ears — pointy, on top of head
  ctx.fillStyle = '#7a5a10'; ctx.strokeStyle = '#5a3a0a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 65, cy - 55); ctx.lineTo(cx + 67, cy - 65); ctx.lineTo(cx + 73, cy - 53); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 70, cy - 54); ctx.lineTo(cx + 73, cy - 63); ctx.lineTo(cx + 78, cy - 52); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Mane — flowing crest down steep neck
  ctx.strokeStyle = '#4a2a00'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx + 62, cy - 56);
  ctx.quadraticCurveTo(cx + 55, cy - 50, cx + 52, cy - 22);
  ctx.stroke();
  // Tail — flowing from rear
  ctx.strokeStyle = '#4a2a00'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx - 60, cy - 5);
  ctx.quadraticCurveTo(cx - 75, cy - 15, cx - 70, cy - 30);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 60, cy - 5);
  ctx.quadraticCurveTo(cx - 78, cy, cx - 72, cy + 10);
  ctx.stroke();
  // Legs — 4 longer wooden posts with hooves
  for (let l = -1; l <= 1; l += 2) {
    for (let f = 1; f >= -1; f -= 2) {
      const lx = cx + f * 30 + l * 6;
      ctx.fillStyle = '#6B4914'; ctx.strokeStyle = '#4a2a00'; ctx.lineWidth = 1.5;
      ctx.fillRect(lx - 4, cy + 12, 8, 30);
      ctx.strokeRect(lx - 4, cy + 12, 8, 30);
      // Hoof
      ctx.fillStyle = '#3a1a00';
      ctx.fillRect(lx - 5, cy + 40, 10, 5);
    }
  }
  // Wheels at bottom of legs (aligned with each leg pair)
  for (let w = 0; w < 2; w++) {
    const wx = cx - 15 + w * 30, wy = cy + 52;
    ctx.fillStyle = '#4a2a00'; ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.stroke();
    // Spokes
    ctx.strokeStyle = '#6B4914'; ctx.lineWidth = 1;
    const moving = state.trojanPhase === 'entering' || state.trojanPhase === 'shattering';
    for (let s = 0; s < 4; s++) {
      const sa = s * Math.PI / 2 + (moving ? Date.now() / 1000 * 4 : 0);
      ctx.beginPath(); ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(sa) * 9, wy + Math.sin(sa) * 9); ctx.stroke();
    }
  }
  // Door
  const dx = cx + 40, dw = 22;
  if (state.trojanDoor < 1) {
    ctx.fillStyle = '#6B4914'; ctx.fillRect(dx, cy - 5, dw, 22);
    ctx.strokeStyle = '#4a2a00'; ctx.strokeRect(dx, cy - 5, dw, 22);
    const openW = dw * state.trojanDoor;
    ctx.fillStyle = '#1a0a00'; ctx.fillRect(dx + openW, cy - 5, dw - openW, 22);
  }
  // Door glow — during opening AND deploying (full golden light)
  if (state.trojanDoor > 0 || state.trojanPhase === 'deploying') {
    const glowX = state.trojanPhase === 'deploying' ? dx + dw : dx + dw * state.trojanDoor;
    const glow = ctx.createRadialGradient(glowX, cy + 6, 5, glowX, cy + 6, 40);
    glow.addColorStop(0, 'rgba(255,220,80,0.7)'); glow.addColorStop(0.5, 'rgba(255,180,30,0.3)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(glowX, cy + 6, 40, 0, Math.PI*2); ctx.fill();
  }
  // Rider — Odysseus on horseback
  const rx = cx - 5, ry = cy - 22;
  // Body
  ctx.fillStyle = '#d4c4a0'; ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
  // Cape (red flowing back)
  ctx.fillStyle = '#cc3333'; ctx.beginPath();
  ctx.moveTo(rx, ry - 4); ctx.lineTo(rx - 14, ry - 8); ctx.lineTo(rx - 12, ry + 2); ctx.lineTo(rx - 2, ry + 4); ctx.closePath(); ctx.fill();
  // Greek helmet (crested)
  ctx.fillStyle = '#c8a840'; ctx.strokeStyle = '#8a6a20'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(rx, ry - 6, 5.5, Math.PI, 0); ctx.fill(); ctx.stroke();
  // Helmet plume (red crest)
  ctx.strokeStyle = '#cc3333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx - 4, ry - 10); ctx.quadraticCurveTo(rx, ry - 16, rx + 4, ry - 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx - 2, ry - 10); ctx.quadraticCurveTo(rx, ry - 14, rx + 2, ry - 10); ctx.stroke();
  // Arm pointing forward
  ctx.strokeStyle = '#d4c4a0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx + 3, ry); ctx.lineTo(rx + 12, ry - 4); ctx.stroke();
  // Spear
  ctx.strokeStyle = '#8a6a20'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(rx + 10, ry - 2); ctx.lineTo(rx + 22, ry - 16); ctx.stroke();
  ctx.fillStyle = '#c8a840'; ctx.beginPath(); ctx.moveTo(rx + 22, ry - 18); ctx.lineTo(rx + 20, ry - 14); ctx.lineTo(rx + 24, ry - 13); ctx.closePath(); ctx.fill();
  // Rider name label
  ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('Odysseus', rx, ry - 14);
  // Quote during deploying
  if (state.trojanPhase === 'deploying') {
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const flash = 0.7 + 0.3 * Math.sin(Date.now() / 1000 * 3);
    ctx.globalAlpha = flash;
    ctx.fillText('"纵有万般险阻，我亦勇往直前"', cx, cy - 70);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

