// @ts-nocheck
// @ts-nocheck
import { SiegeState } from '../types/SiegeState';
import { TankEntity, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H } from '../utils/Grid';
import { spawnExplosion } from '../entities/Particle';
import { playExplosion } from '../systems/Sound';

export function updateDragon(state: SiegeState, dt: number): void {
  if (state.dragonPhase === 'idle') return;

  // Dragon body center (fully revealed position: right-center of map)
  const targetX = MAP_W * 0.65;
  const targetY = MAP_H * 0.4;

  if (state.dragonPhase === 'entering') {
    state.dragonTimer -= dt;
    const progress = Math.min(1, (2 - state.dragonTimer) / 2);
    // Slide in from right, ease-out
    state.dragonReveal = progress;
    state.dragonX = MAP_W + 200 - (MAP_W + 200 - targetX) * progress * progress;
    state.dragonY = targetY;
    state.screenShake = Math.max(state.screenShake, 3 * (1 - progress));

    // Enemies flee from dragon
    fleeEnemies(state);

    if (state.dragonTimer <= 0) {
      state.dragonPhase = 'revealing';
      state.dragonTimer = 2;
      state.dragonReveal = 1;
    }
    return;
  }

  if (state.dragonPhase === 'revealing') {
    state.dragonTimer -= dt;
    state.dragonReveal = 1;

    // Find nearest enemy and slowly drift toward them
    let nearest: TankEntity | null = null;
    let nearestDist = Infinity;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - state.dragonX, e.pos.y - state.dragonY);
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if (nearest) {
      const toEnemy = nearest.pos.sub(new Vec2(state.dragonX, state.dragonY)).norm();
      state.dragonX += toEnemy.x * 40 * dt;
      state.dragonY += toEnemy.y * 40 * dt;
    }

    // Enemies flee
    fleeEnemies(state);

    if (state.dragonTimer <= 0) {
      state.dragonPhase = 'hugging';
      state.dragonTimer = 1;
    }
    return;
  }

  if (state.dragonPhase === 'hugging') {
    state.dragonTimer -= dt;
    state.screenShake = Math.max(state.screenShake, 8);

    // Enemies still flee
    fleeEnemies(state);

    // Hug: damage enemies within 120px + heart particles
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.isStatic) continue;
      const dist = Math.hypot(enemy.pos.x - state.dragonX, enemy.pos.y - state.dragonY);
      if (dist < 120) {
        takeDamage(enemy, 200 * dt); // 200 dps while hugging
        // Heart particles
        if (Math.random() < 0.6) {
          for (let h = 0; h < 3; h++) {
            const angle = Math.random() * Math.PI * 2;
            const r = dist * Math.random();
            state.particles.push({
              pos: new Vec2(enemy.pos.x + Math.cos(angle) * r, enemy.pos.y + Math.sin(angle) * r),
              vel: new Vec2((Math.random() - 0.5) * 60, -30 - Math.random() * 60),
              life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
              color: ['#ff69b4', '#ff1493', '#ff6b8a', '#ff4088', '#ff85a2'][Math.floor(Math.random() * 5)],
              radius: 3 + Math.random() * 4, alive: true, smokeExpand: false, isCross: false,
            });
          }
        }
        if (!enemy.alive) {
          state.particles.push(...spawnExplosion(enemy.pos));
          playExplosion();
        }
      }
    }

    if (state.dragonTimer <= 0) {
      state.dragonPhase = 'exiting';
      state.dragonTimer = 2;
    }
    return;
  }

  if (state.dragonPhase === 'exiting') {
    state.dragonTimer -= dt;
    const progress = Math.min(1, (2 - state.dragonTimer) / 2);
    // Slide out to the right, ease-in
    state.dragonReveal = 1 - progress;
    state.dragonX = targetX + (MAP_W + 200 - targetX) * progress * progress;
    state.dragonY = targetY;

    // Lingering heart particles
    if (Math.random() < 0.3) {
      state.particles.push({
        pos: new Vec2(state.dragonX + (Math.random() - 0.5) * 120, state.dragonY + (Math.random() - 0.5) * 80),
        vel: new Vec2((Math.random() - 0.5) * 20, -10 - Math.random() * 30),
        life: 0.5 + Math.random() * 0.5, maxLife: 1,
        color: ['#ff69b4', '#ffb6c1', '#ff85a2'][Math.floor(Math.random() * 3)],
        radius: 2 + Math.random() * 3, alive: true, smokeExpand: false, isCross: false,
      });
    }

    if (state.dragonTimer <= 0) {
      state.dragonPhase = 'idle';
      state.dragonReveal = 0;
    }
  }
}

/** Push enemies away from the dragon */
function fleeEnemies(state: SiegeState): void {
  const dragonPos = new Vec2(state.dragonX, state.dragonY);
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.isStatic) continue;
    const away = enemy.pos.sub(dragonPos);
    const dist = away.mag();
    if (dist < 10) {
      enemy.vel = new Vec2((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
    } else if (dist < 400) {
      const fleeSpeed = 120 + (1 - Math.min(1, dist / 400)) * 150;
      enemy.vel = away.norm().scale(fleeSpeed);
    }
  }
}

export function drawDragon(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.dragonPhase === 'idle' || state.dragonReveal <= 0.01) return;

  const cx = state.dragonX;
  const cy = state.dragonY;
  const reveal = state.dragonReveal;
  const isHugging = state.dragonPhase === 'hugging';
  const t = Date.now() / 1000;

  ctx.save();

  // Clip: dragon only visible where revealed (for entering/exiting)
  const clipLeft = reveal >= 1 ? 0 : MAP_W - MAP_W * reveal;
  if (reveal < 1) {
    ctx.beginPath();
    ctx.rect(clipLeft, 0, MAP_W, MAP_H);
    ctx.clip();
  }

  // Gentle idle bob
  const idleBob = Math.sin(t * 2.5) * 4;

  // === TAIL (drawn behind body) ===
  ctx.strokeStyle = '#5cb85c';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 35, cy + 15 + idleBob * 0.5);
  ctx.quadraticCurveTo(cx + 70, cy - 20 + idleBob, cx + 60, cy - 55 + idleBob);
  ctx.stroke();
  // Tail spade tip
  const tx = cx + 60, ty = cy - 55 + idleBob;
  ctx.fillStyle = '#4a9e3f';
  ctx.beginPath();
  ctx.moveTo(tx, ty - 10);
  ctx.quadraticCurveTo(tx + 16, ty - 2, tx, ty + 10);
  ctx.quadraticCurveTo(tx - 16, ty - 2, tx, ty - 10);
  ctx.fill();
  ctx.strokeStyle = '#3a7e2f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // === BACK SPIKES (along spine) ===
  ctx.fillStyle = '#f5c842';
  ctx.strokeStyle = '#d4a830';
  ctx.lineWidth = 1.5;
  const spikePositions = [
    { x: cx - 25, y: cy - 32, s: 0.7 },
    { x: cx - 5, y: cy - 38, s: 0.85 },
    { x: cx + 15, y: cy - 37, s: 0.8 },
    { x: cx + 33, y: cy - 28, s: 0.6 },
  ];
  for (const sp of spikePositions) {
    ctx.beginPath();
    ctx.moveTo(sp.x - 5, sp.y + 4);
    ctx.lineTo(sp.x, sp.y - 16 * sp.s);
    ctx.lineTo(sp.x + 5, sp.y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // === WINGS (small cute bat wings on back) ===
  const wingX = cx + 5, wingY = cy - 45 + idleBob;
  ctx.fillStyle = '#4aaf3c';
  ctx.strokeStyle = '#3a8a2f';
  ctx.lineWidth = 2;
  // Left wing
  ctx.beginPath();
  ctx.moveTo(wingX - 8, wingY);
  ctx.quadraticCurveTo(wingX - 35, wingY - 35, wingX - 25, wingY - 55);
  ctx.quadraticCurveTo(wingX - 10, wingY - 20, wingX - 8, wingY);
  ctx.fill();
  ctx.stroke();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(wingX + 8, wingY);
  ctx.quadraticCurveTo(wingX + 35, wingY - 35, wingX + 25, wingY - 55);
  ctx.quadraticCurveTo(wingX + 10, wingY - 20, wingX + 8, wingY);
  ctx.fill();
  ctx.stroke();

  // === LEGS (two short chubby legs) ===
  for (let leg = -1; leg <= 1; leg += 2) {
    const lx = cx + leg * 18;
    const ly = cy + 48;
    // Thigh
    ctx.fillStyle = '#5cb85c';
    ctx.strokeStyle = '#3a8a2f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(lx, ly - 5, 16, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Foot
    ctx.fillStyle = '#e8f0d0';
    ctx.beginPath();
    ctx.ellipse(lx, ly + 8, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Toes
    ctx.fillStyle = '#fff';
    for (let toe = -1; toe <= 1; toe++) {
      ctx.beginPath();
      ctx.arc(lx + toe * 6, ly + 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === BODY (one solid chubby pear shape) ===
  ctx.fillStyle = '#5cb85c';
  ctx.strokeStyle = '#3a8a2f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  // Pear-shaped body: narrower at top, wider at bottom
  ctx.moveTo(cx - 35, cy - 30);
  ctx.bezierCurveTo(cx - 50, cy - 5, cx - 48, cy + 35, cx - 25, cy + 48);
  ctx.lineTo(cx + 25, cy + 48);
  ctx.bezierCurveTo(cx + 48, cy + 35, cx + 50, cy - 5, cx + 35, cy - 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // === BELLY (cream-colored belly plate) ===
  ctx.fillStyle = '#e8f5c0';
  ctx.strokeStyle = '#c8d8a0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, 26, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Belly lines (horizontal segments like turtle belly)
  ctx.strokeStyle = '#d8e8b0';
  ctx.lineWidth = 1;
  for (let bl = -1; bl <= 1; bl++) {
    ctx.beginPath();
    const bly = cy + 12 + bl * 12;
    const blw = Math.sqrt(26 * 26 * (1 - (bl * 12 / 30) ** 2));
    ctx.moveTo(cx - blw + 5, bly);
    ctx.lineTo(cx + blw - 5, bly);
    ctx.stroke();
  }

  // === ARMS (extend during hugging) ===
  const armExtend = isHugging ? 50 : 15;
  for (let arm = -1; arm <= 1; arm += 2) {
    const ax = cx + arm * 28;
    const ay = cy - 2;
    // Upper arm
    ctx.strokeStyle = '#5cb85c';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + arm * armExtend * 0.5, ay + 12);
    ctx.stroke();
    // Forearm
    ctx.beginPath();
    ctx.moveTo(ax + arm * armExtend * 0.5, ay + 12);
    ctx.lineTo(ax + arm * armExtend, ay + 28);
    ctx.stroke();
    // Paw (round mitt)
    ctx.fillStyle = '#e8f0d0';
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax + arm * armExtend, ay + 28, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Finger lines on paw
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 1;
    for (let f = -1; f <= 1; f += 2) {
      ctx.beginPath();
      ctx.moveTo(ax + arm * armExtend, ay + 28);
      ctx.lineTo(ax + arm * armExtend + f * 5, ay + 28 - 6);
      ctx.stroke();
    }
    // Hugging: sparkle/heart particles at paw tips
    if (isHugging && Math.random() < 0.5) {
      const px2 = ax + arm * armExtend;
      const py2 = ay + 28;
      ctx.fillStyle = '#ff69b4';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
      ctx.beginPath();
      // Tiny heart at paw
      const hs = 5;
      ctx.moveTo(px2, py2 + hs * 0.3);
      ctx.bezierCurveTo(px2 - hs, py2 - hs * 0.5, px2 - hs * 0.5, py2 - hs, px2, py2);
      ctx.bezierCurveTo(px2 + hs * 0.5, py2 - hs, px2 + hs, py2 - hs * 0.5, px2, py2 + hs * 0.3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // === HEAD (big round cute head) ===
  const hx = cx - 25, hy = cy - 38 + idleBob;

  // Head shadow/drop
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.arc(hx + 2, hy + 3, 40, 0, Math.PI * 2);
  ctx.fill();

  // Main head
  ctx.fillStyle = '#5cb85c';
  ctx.strokeStyle = '#3a8a2f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hx, hy, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // === FACE ===
  // Snout (lighter green oval on lower half)
  ctx.fillStyle = '#7cc87c';
  ctx.strokeStyle = '#4a9e3f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(hx + 4, hy + 8, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Nostrils
  ctx.fillStyle = '#3a7e2f';
  ctx.beginPath();
  ctx.arc(hx - 4, hy + 10, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx + 6, hy + 12, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (happy "w" shape or smile)
  ctx.strokeStyle = '#3a7e2f';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy + 18);
  ctx.quadraticCurveTo(hx, hy + 25, hx + 6, hy + 18);
  ctx.stroke();
  // Tongue
  ctx.fillStyle = '#ff8888';
  ctx.beginPath();
  ctx.arc(hx, hy + 20, 4, 0, Math.PI);
  ctx.fill();

  // === EYES (massive cute anime eyes) ===
  for (let eye = -1; eye <= 1; eye += 2) {
    const ex = hx + eye * 15, ey = hy - 5;
    // Eye white
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 13, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Iris (big dark)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(ex + eye * 2, ey + 2, 9, 0, Math.PI * 2);
    ctx.fill();
    // Primary highlight (large)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + eye * 4 - 2, ey - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    // Secondary highlight (small)
    ctx.beginPath();
    ctx.arc(ex + eye * 5 + 1, ey + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blush marks
  for (let cheek = -1; cheek <= 1; cheek += 2) {
    ctx.fillStyle = 'rgba(255,150,150,0.35)';
    ctx.beginPath();
    ctx.ellipse(hx + cheek * 24, hy + 10, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrows
  ctx.strokeStyle = '#3a7e2f';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - 16, hy - 18);
  ctx.quadraticCurveTo(hx - 6, hy - 25, hx + 2, hy - 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 18, hy - 18);
  ctx.quadraticCurveTo(hx + 8, hy - 25, hx + 2, hy - 18);
  ctx.stroke();

  // === HORNS (small golden horns) ===
  for (let horn = -1; horn <= 1; horn += 2) {
    ctx.fillStyle = '#f5c842';
    ctx.strokeStyle = '#c8a020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx + horn * 14, hy - 36);
    ctx.quadraticCurveTo(hx + horn * 18, hy - 56, hx + horn * 24, hy - 60);
    ctx.quadraticCurveTo(hx + horn * 22, hy - 46, hx + horn * 12, hy - 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // === EARS (small fin-like ears on sides) ===
  for (let ear = -1; ear <= 1; ear += 2) {
    ctx.fillStyle = '#4aaf3c';
    ctx.strokeStyle = '#3a8a2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx + ear * 38, hy - 15);
    ctx.quadraticCurveTo(hx + ear * 55, hy - 30, hx + ear * 50, hy - 10);
    ctx.quadraticCurveTo(hx + ear * 45, hy - 5, hx + ear * 36, hy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Inner ear
    ctx.fillStyle = '#8cd88c';
    ctx.beginPath();
    ctx.moveTo(hx + ear * 38, hy - 14);
    ctx.quadraticCurveTo(hx + ear * 48, hy - 22, hx + ear * 46, hy - 11);
    ctx.quadraticCurveTo(hx + ear * 42, hy - 7, hx + ear * 36, hy - 9);
    ctx.closePath();
    ctx.fill();
  }

  // === "!" marks above fleeing enemies ===
  if (state.dragonPhase === 'entering' || state.dragonPhase === 'revealing' || state.dragonPhase === 'hugging') {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.pos.x, ey = enemy.pos.y - TANK_RADIUS - 22;
      const bounce = Math.sin(t * 6 + enemy.pos.x * 0.1) * 3;
      // Exclamation bubble
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey + bounce, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // "!"
      ctx.fillStyle = '#ff2222';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', ex, ey + bounce);
    }
  }

  ctx.restore();
}
