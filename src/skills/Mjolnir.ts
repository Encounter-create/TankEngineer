// @ts-nocheck
// @ts-nocheck
import { SiegeState } from '../types/SiegeState';
import { TankEntity, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H } from '../utils/Grid';
import { normalizeAngle } from '../core/Physics';
import { playExplosion } from '../systems/Sound';

const HAMMER_R = 14;
const ACCEL = 300;
const ANGULAR_VEL = Math.PI * 8;
const MASS = 50;

// Orbit ring physics
const ORBIT_R = 55;          // stable orbit distance from player
const CAPTURE_R = 480;       // capture zone radius
const SPRING_K = 7;          // radial spring constant (px/s² per px offset)
const DAMPING = 3;           // radial damping coefficient
const STORM_DURATION = 5;    // storm lasts 5s total
const THOR_SHOW_TIME = 5;    // Thor shows quote for 5s after arrival

const QUOTES: string[][] = [
  ['听着洛基，仔细听我说！', '天地间无人知晓，我们的铁锤被谁偷走了'],
  ['等你挨上我铁锤一击，', '我看你只会哀嚎求饶。'],
  ['我是托尔，战神，雷霆之主！'],
  ['锤落之处，正义降临'],
  ['勇士不必巧言，', '铁锤自有公道'],
  ['每日涉三寒川，', '赴世界之树裁决'],
  ['诸神黄昏，', '唯有托尔直面巨蛇耶梦加得'],
];

function rotateToward(state: SiegeState, targetAngle: number, dt: number): void {
  const diff = normalizeAngle(targetAngle - state.mjolnirAngle);
  const maxStep = ANGULAR_VEL * dt;
  if (Math.abs(diff) < maxStep) {
    state.mjolnirAngle = targetAngle;
  } else {
    state.mjolnirAngle = normalizeAngle(state.mjolnirAngle + Math.sign(diff) * maxStep);
  }
}

export function updateMjolnir(state: SiegeState, dt: number): void {
  if (state.mjolnirPhase === 'idle') return;
  state.mjolnirTimer += dt;
  const t = state.mjolnirTimer;

  // === Storm (rain + lightning) during first STORM_DURATION seconds ===
  if (t < STORM_DURATION) {
    const rainCount = t < 3 ? 4 : 2;
    for (let i = 0; i < rainCount; i++) {
      state.particles.push({
        pos: new Vec2(Math.random() * MAP_W, -10),
        vel: new Vec2(-30 - Math.random() * 40, 250 + Math.random() * 150),
        life: 1.5 + Math.random(), maxLife: 2.5,
        color: '#6699cc', radius: 1.5 + Math.random() * 2,
        alive: true, smokeExpand: false, isCross: false,
      });
    }
    state.mjolnirLightningTimer -= dt;
    if (state.mjolnirLightningTimer <= 0) {
      state.mjolnirLightningTimer = 0.4 + Math.random() * 1.2;
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
      state.mjolnirLightningBranches = [genBranch(lx)];
      for (let i = 0; i < 3; i++) {
        state.mjolnirLightningBranches.push(genBranch(lx + (Math.random() - 0.5) * 120));
      }
      state.screenShake = Math.max(state.screenShake, 12);
      for (let i = 0; i < 10; i++) {
        state.particles.push({
          pos: new Vec2(lx + (Math.random() - 0.5) * 80, 40 + Math.random() * 150),
          vel: new Vec2((Math.random() - 0.5) * 20, -5 - Math.random() * 20),
          life: 0.3 + Math.random() * 0.4, maxLife: 0.7,
          color: ['#ffdd44', '#ffaa00', '#ffcc00'][Math.floor(Math.random() * 3)],
          radius: 2 + Math.random() * 3, alive: true, smokeExpand: false, isCross: false,
        });
      }
    }
  } else {
    state.mjolnirLightningBranches = [];
  }

  const player = state.player;
  const target = player && player.alive ? player.pos : new Vec2(MAP_W / 2, MAP_H / 2);
  const toTarget = target.sub(state.mjolnirPos);
  const dist = toTarget.mag();
  const toward = dist > 0.01 ? toTarget.norm() : new Vec2(1, 0);

  if (state.mjolnirPhase === 'entering') {
    state.mjolnirVel = state.mjolnirVel.add(toward.scale(ACCEL * dt));
    state.mjolnirPos = state.mjolnirPos.add(state.mjolnirVel.scale(dt));
    rotateToward(state, Math.atan2(state.mjolnirVel.y, state.mjolnirVel.x) + Math.PI / 2, dt);
    handleCollisions(state);
    spawnTrail(state, 0.3);
    if (dist < 60 && state.mjolnirTimer > 1.5) {
      state.mjolnirPhase = 'active';
      state.mjolnirVel = state.mjolnirVel.scale(0.3); // bleed speed on arrival
      state.mjolnirThorStartTime = state.mjolnirTimer;
      // Pick random quote
      if (state.mjolnirThorQuote.length === 0) {
        state.mjolnirThorQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      }
    }
    return;
  }

  if (state.mjolnirPhase === 'active') {
    // Base pull: always accelerate toward player (1x)
    state.mjolnirVel = state.mjolnirVel.add(toward.scale(ACCEL * dt));

    if (dist < CAPTURE_R) {
      // Spring force toward orbit ring F = k * (dist - orbitR)
      // dist > orbitR → force inward; dist < orbitR → force outward
      const offset = dist - ORBIT_R;
      const springAccel = SPRING_K * offset;
      state.mjolnirVel = state.mjolnirVel.add(toward.scale(springAccel * dt));

      // Radial damping — only dampen radial oscillation, preserve tangential velocity
      const radialSpeed = state.mjolnirVel.dot(toward);
      const dampedRadial = radialSpeed * (1 - DAMPING * dt);
      state.mjolnirVel = state.mjolnirVel.add(toward.scale(dampedRadial - radialSpeed));
    }

    state.mjolnirPos = state.mjolnirPos.add(state.mjolnirVel.scale(dt));
    rotateToward(state, Math.atan2(state.mjolnirVel.y, state.mjolnirVel.x) + Math.PI / 2, dt);
    handleCollisions(state);
    spawnTrail(state, 0.4);
    return;
  }

  if (state.mjolnirPhase === 'exiting') {
    const exitTarget = new Vec2(MAP_W + 200, MAP_H + 200);
    const toExit = exitTarget.sub(state.mjolnirPos);
    state.mjolnirVel = state.mjolnirVel.add(toExit.norm().scale(ACCEL * 2 * dt));
    state.mjolnirPos = state.mjolnirPos.add(state.mjolnirVel.scale(dt));
    rotateToward(state, Math.atan2(state.mjolnirVel.y, state.mjolnirVel.x) + Math.PI / 2, dt);
    handleCollisions(state);
    spawnTrail(state, 0.4);
    if (state.mjolnirPos.x > MAP_W + 150 || state.mjolnirPos.y > MAP_H + 150) {
      state.mjolnirPhase = 'idle';
      state.mjolnirTimer = 0;
    }
  }
}

function handleCollisions(state: SiegeState): void {
  const hp = state.mjolnirPos;
  const hv = state.mjolnirVel;
  const speed = hv.mag();
  const dmg = Math.round(MASS * speed * 0.5);

  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.isStatic) continue;
    const dist = hp.dist(enemy.pos);
    if (dist < HAMMER_R + TANK_RADIUS) {
      enemy.vel = hv.scale(0.5);
      enemy.pos = enemy.pos.add(hv.norm().scale(25));
      takeDamage(enemy, Math.max(10, dmg));
      if (!enemy.alive) {
        playExplosion();
        state.screenShake = Math.max(state.screenShake, 6);
      }
      spark(state, enemy.pos);
    }
  }

  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    const dist = hp.dist(block.pos);
    if (dist < HAMMER_R + BLOCK_RADIUS) {
      block.vel = hv.scale(0.5);
      block.pos = block.pos.add(hv.norm().scale(20));
      spark(state, block.pos);
    }
  }
}

function spark(state: SiegeState, pos: Vec2): void {
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      pos,
      vel: new Vec2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200),
      life: 0.2 + Math.random() * 0.3, maxLife: 0.5,
      color: ['#fff8c0', '#ffdd44', '#ffaa00', '#4488ff'][Math.floor(Math.random() * 4)],
      radius: 2 + Math.random() * 3,
      alive: true, smokeExpand: false, isCross: false,
    });
  }
}

function spawnTrail(state: SiegeState, chance: number): void {
  if (Math.random() > chance) return;
  const p = state.mjolnirPos;
  const v = state.mjolnirVel;
  for (let i = 0; i < 2; i++) {
    state.particles.push({
      pos: new Vec2(p.x + (Math.random() - 0.5) * 10, p.y + (Math.random() - 0.5) * 10),
      vel: new Vec2(-v.x * 0.1 + (Math.random() - 0.5) * 30, -v.y * 0.1 + (Math.random() - 0.5) * 30),
      life: 0.15 + Math.random() * 0.25, maxLife: 0.4,
      color: ['#fff8c0', '#ffdd44', '#88bbff'][Math.floor(Math.random() * 3)],
      radius: 1.5 + Math.random() * 2.5,
      alive: true, smokeExpand: false, isCross: false,
    });
  }
}

export function drawMjolnir(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.mjolnirPhase === 'idle') return;

  // Storm overlay (lightning flashes on top of everything)
  drawStorm(ctx, state);

  // Thor figure (drawn near hammer, positioned relative to it)
  drawThor(ctx, state);

  // Orbit ring + capture zone visualization (U-key debug)
  if (state.showDebug && state.mjolnirPhase === 'active' && state.player.alive) {
    const px = state.player.pos.x, py = state.player.pos.y;
    // Capture zone
    ctx.strokeStyle = 'rgba(255,220,100,0.2)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(px, py, CAPTURE_R, 0, Math.PI * 2); ctx.stroke();
    // Orbit ring
    ctx.strokeStyle = 'rgba(255,220,100,0.5)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.arc(px, py, ORBIT_R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  const cx = state.mjolnirPos.x;
  const cy = state.mjolnirPos.y;
  const angle = state.mjolnirAngle;
  const t = Date.now() / 1000;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Outer glow
  const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 40);
  glow.addColorStop(0, 'rgba(255,220,100,0.5)');
  glow.addColorStop(0.5, 'rgba(255,180,40,0.2)');
  glow.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();

  // Handle
  const handleLen = 28;
  ctx.fillStyle = '#5a3a1a';
  ctx.strokeStyle = '#3a1a00';
  ctx.lineWidth = 2;
  ctx.fillRect(-3, -8, 6, handleLen);
  ctx.strokeRect(-3, -8, 6, handleLen);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 1;
  for (let w = 0; w < 5; w++) {
    const wy = -4 + w * 6;
    ctx.beginPath();
    ctx.moveTo(-3, wy); ctx.lineTo(3, wy);
    ctx.stroke();
  }
  // Pommel
  ctx.fillStyle = '#c8a840';
  ctx.strokeStyle = '#8a6a20';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, handleLen - 6, 5, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Hammer head
  const hw = 22, hh = 16;
  const hx = -hw, hy = -8 - hh;
  ctx.fillStyle = '#d4b850';
  ctx.strokeStyle = '#8a6a20';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(hx, hy, hw * 2, hh, 5);
  ctx.fill();
  ctx.stroke();
  const hGrad = ctx.createLinearGradient(0, hy, 0, hy + hh);
  hGrad.addColorStop(0, 'rgba(255,240,200,0.7)');
  hGrad.addColorStop(0.3, 'rgba(220,190,80,0.4)');
  hGrad.addColorStop(0.7, 'rgba(180,140,50,0.1)');
  hGrad.addColorStop(1, 'rgba(140,100,30,0.4)');
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.roundRect(hx + 2, hy + 2, hw * 2 - 4, hh - 4, 4);
  ctx.fill();

  // Rune markings
  ctx.strokeStyle = `rgba(255,220,100,${0.5 + 0.3 * Math.sin(t * 3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-12, hy + 4); ctx.lineTo(-12, hy + hh - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, hy + 4); ctx.lineTo(-6, hy + hh - 6);
  ctx.moveTo(-6, hy + hh - 6); ctx.lineTo(2, hy + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, hy + 4); ctx.lineTo(4, hy + hh - 4);
  ctx.stroke();

  // Impact face glow
  const faceGlow = ctx.createLinearGradient(-hw, 0, -hw + 8, 0);
  faceGlow.addColorStop(0, 'rgba(255,240,200,0.6)');
  faceGlow.addColorStop(1, 'rgba(255,220,100,0)');
  ctx.fillStyle = faceGlow;
  ctx.fillRect(-hw, hy + 2, 8, hh - 4);

  ctx.restore();
}

/** Lightning branches + white flash overlay */
function drawStorm(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.mjolnirLightningBranches.length === 0) return;
  if (state.mjolnirTimer >= STORM_DURATION) return;

  const flashAlpha = 0.35 * Math.min(1, state.mjolnirLightningTimer / 0.6);
  ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const branchAlpha = Math.min(1, state.mjolnirLightningTimer / 0.3);
  for (const branch of state.mjolnirLightningBranches) {
    ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 5;
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20;
    ctx.globalAlpha = branchAlpha;
    ctx.beginPath(); ctx.moveTo(branch[0].x, branch[0].y);
    for (let i = 1; i < branch.length; i++) ctx.lineTo(branch[i].x, branch[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

/** Thor — winged helmet, red cape, armored body */
function drawThor(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  const thorStart = state.mjolnirThorStartTime;
  if (thorStart < 0) return;
  const elapsed = state.mjolnirTimer - thorStart;
  if (elapsed > THOR_SHOW_TIME + 1) return; // fully gone

  const isShowing = elapsed < THOR_SHOW_TIME;
  const exitProgress = isShowing ? 0 : Math.min(1, (elapsed - THOR_SHOW_TIME) / 1);
  const alpha = isShowing ? 1 : 1 - exitProgress;

  // Thor floats above the hammer
  const hx = state.mjolnirPos.x;
  const hy = state.mjolnirPos.y - 45 - exitProgress * 120; // rise upward on exit

  ctx.save();
  ctx.globalAlpha = alpha;
  const bob = Math.sin(Date.now() / 1000 * 3) * 2;

  // === Norse Helmet ===
  const headY = hy - 4 + bob;
  // Dome — rounded with slight peak
  ctx.fillStyle = '#b8a060'; ctx.strokeStyle = '#7a5a20'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hx - 8, headY - 2);
  ctx.quadraticCurveTo(hx - 7, headY - 15, hx, headY - 17);
  ctx.quadraticCurveTo(hx + 7, headY - 15, hx + 8, headY - 2);
  ctx.lineTo(hx + 8, headY + 2);
  ctx.lineTo(hx - 8, headY + 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Helmet rim
  ctx.strokeStyle = '#8a6a20'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx - 8, headY - 2); ctx.lineTo(hx + 8, headY - 2); ctx.stroke();
  // Brow ridge / nasal guard
  ctx.fillStyle = '#8a6a20';
  ctx.beginPath();
  ctx.moveTo(hx - 1, headY - 8);
  ctx.lineTo(hx + 1, headY - 8);
  ctx.lineTo(hx + 2, headY + 4);
  ctx.lineTo(hx - 2, headY + 4);
  ctx.closePath();
  ctx.fill();
  // Helmet band
  ctx.strokeStyle = '#c8a840'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx - 7, headY + 0); ctx.quadraticCurveTo(hx, headY - 4, hx + 7, headY + 0); ctx.stroke();
  // Wings — smaller, sleeker, swept back
  for (let w = -1; w <= 1; w += 2) {
    ctx.fillStyle = '#e8e0c0';
    ctx.strokeStyle = '#b0a080'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + w * 7, headY - 6);
    ctx.quadraticCurveTo(hx + w * 16, headY - 18, hx + w * 20, headY - 10);
    ctx.quadraticCurveTo(hx + w * 16, headY - 2, hx + w * 7, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Inner feather line
    ctx.strokeStyle = '#d0c8b0'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx + w * 9, headY - 4);
    ctx.quadraticCurveTo(hx + w * 14, headY - 12, hx + w * 16, headY - 7);
    ctx.stroke();
  }

  // === Face ===
  ctx.fillStyle = '#f0e0c0';
  ctx.beginPath(); ctx.arc(hx, headY + 1, 5, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(hx - 3, headY - 1, 2, 2); ctx.fillRect(hx + 1, headY - 1, 2, 2);
  // Beard (short, Norse style)
  ctx.fillStyle = '#c88040';
  ctx.beginPath();
  ctx.moveTo(hx - 4, headY + 5);
  ctx.quadraticCurveTo(hx, headY + 12, hx + 4, headY + 5);
  ctx.quadraticCurveTo(hx, headY + 8, hx - 4, headY + 5);
  ctx.fill();

  // === Body (armored torso) ===
  const bodyTop = headY + 8;
  ctx.fillStyle = '#8a8a9a'; ctx.strokeStyle = '#5a5a6a'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hx - 6, bodyTop);
  ctx.lineTo(hx - 7, bodyTop + 18);
  ctx.lineTo(hx + 7, bodyTop + 18);
  ctx.lineTo(hx + 6, bodyTop);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Chest plate detail
  ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx, bodyTop + 2); ctx.lineTo(hx, bodyTop + 16); ctx.stroke();

  // === Red Cape ===
  ctx.fillStyle = '#cc3333'; ctx.strokeStyle = '#991111'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 5, bodyTop + 2);
  ctx.quadraticCurveTo(hx - 14, bodyTop + 8, hx - 16, bodyTop + 20);
  ctx.lineTo(hx - 8, bodyTop + 18);
  ctx.lineTo(hx - 5, bodyTop + 6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // === Right arm (holding hammer pose) ===
  ctx.strokeStyle = '#d0c8b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx + 4, bodyTop + 4);
  ctx.quadraticCurveTo(hx + 12, bodyTop + 2, hx + 14, bodyTop - 6);
  ctx.stroke();
  // Fist
  ctx.fillStyle = '#f0e0c0';
  ctx.beginPath(); ctx.arc(hx + 14, bodyTop - 6, 3, 0, Math.PI * 2); ctx.fill();

  // === Left arm ===
  ctx.strokeStyle = '#d0c8b0'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - 4, bodyTop + 4);
  ctx.quadraticCurveTo(hx - 10, bodyTop + 6, hx - 12, bodyTop + 12);
  ctx.stroke();

  // === Legs ===
  ctx.fillStyle = '#6a6a7a'; ctx.strokeStyle = '#4a4a5a'; ctx.lineWidth = 1;
  ctx.fillRect(hx - 4, bodyTop + 18, 4, 8); ctx.strokeRect(hx - 4, bodyTop + 18, 4, 8);
  ctx.fillRect(hx + 1, bodyTop + 18, 4, 8); ctx.strokeRect(hx + 1, bodyTop + 18, 4, 8);
  // Boots
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(hx - 5, bodyTop + 25, 6, 3); ctx.fillRect(hx, bodyTop + 25, 6, 3);

  // === Golden quote above Thor ===
  if (isShowing && state.mjolnirThorQuote.length > 0) {
    const quoteAlpha = Math.min(1, elapsed / 0.3) * alpha;
    ctx.globalAlpha = quoteAlpha;
    const qy = headY - 30;
    ctx.fillStyle = '#ffd466';
    ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let qi = 0; qi < state.mjolnirThorQuote.length; qi++) {
      ctx.fillText(state.mjolnirThorQuote[qi], hx, qy - (state.mjolnirThorQuote.length - 1 - qi) * 16);
    }
  }

  ctx.restore();
}
