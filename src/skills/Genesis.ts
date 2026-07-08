// @ts-nocheck
// @ts-nocheck
import { SiegeState } from '../types/SiegeState';
import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H } from '../utils/Grid';
import { spawnExplosion } from '../entities/Particle';
import { playExplosion } from '../systems/Sound';
import { registerEffect } from '../ui/EffectRenderer';

const SKILL_END = 15;
const MAX_R = Math.sqrt(MAP_W * MAP_W + MAP_H * MAP_H) / 2 + 50;
const SMALL_R = 120; // small circle radius at 8s

export function updateGenesis(state: SiegeState, dt: number): void {
  if (state.genesisPhase === 'idle') return;
  state.genesisTimer += dt;
  const t = state.genesisTimer;

  if (state.genesisPhase === 'darkening') {
    // Clear at 6s
    if (t >= 6 && !state.genesisCleared) {
      state.genesisCleared = true;
      for (const enemy of state.enemies) {
        if (enemy && enemy.alive) {
          enemy.alive = false;
          state.particles.push(...spawnExplosion(enemy.pos));
        }
      }
      for (const block of state.physicsBlocks) {
        if (block && block.alive) block.alive = false;
      }
      playExplosion();
    }
    if (t >= 7) {
      state.genesisPhase = 'ignition';
    }
    return;
  }

  if (state.genesisPhase === 'ignition') {
    // Fire particles at center (7-15s, density drops after 12s)
    const fireAlpha = t >= 12 ? Math.max(0, 1 - (t - 12) / 3) : 1;
    if (Math.random() < 0.7 * fireAlpha) {
      const cx = MAP_W / 2, cy = MAP_H / 2;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 8;
      state.particles.push({
        pos: new Vec2(cx + Math.cos(a) * r, cy + Math.sin(a) * r),
        vel: new Vec2((Math.random() - 0.5) * 30, -40 - Math.random() * 80),
        life: 0.3 + Math.random() * 0.5, maxLife: 0.8,
        color: ['#ff4400', '#ff8800', '#ffcc00', '#ffaa00'][Math.floor(Math.random() * 4)],
        radius: 2 + Math.random() * 4,
        alive: true, smokeExpand: false, isCross: false,
      });
    }

    // Compute light radius from elapsed time
    const e = t - 7; // time since fire appeared
    let lightR: number;
    if (e < 0) {
      lightR = 0;
    } else if (e < 1) {
      // 7-8s: expand to small circle
      lightR = 30 + (SMALL_R - 30) * e;
    } else if (e < 2) {
      // 8-9s: pause at small circle
      lightR = SMALL_R;
    } else if (e < 5) {
      // 9-12s: expand to full screen
      lightR = SMALL_R + (MAX_R - SMALL_R) * ((e - 2) / 3);
    } else {
      // 12-15s: full screen
      lightR = MAX_R;
    }
    state.genesisFireRadius = lightR;

    if (t >= SKILL_END) {
      state.genesisPhase = 'idle';
      state.genesisCleared = false;
      state.genesisFireRadius = 0;
      state.genesisTimer = 0;
    }
  }
}

export function drawGenesis(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  if (state.genesisPhase === 'idle') return;
  const t = state.genesisTimer;
  const cx = MAP_W / 2, cy = MAP_H / 2;

  // === BLACK OVERLAY ===
  if (state.genesisPhase === 'darkening') {
    // 0-2s fade in, 2-7s hold full black
    const alpha = Math.min(1, t / 2);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // === TEXT: 3-5s show, 5-6s fade ===
    if (t >= 3 && t < 6) {
      let textAlpha: number;
      if (t < 3.3) textAlpha = (t - 3) / 0.3;
      else if (t < 5) textAlpha = 1;
      else textAlpha = 1 - (t - 5);

      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = '#ffd466';
      ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('There shall be light', cx, cy);
      ctx.restore();
    }
    return;
  }

  if (state.genesisPhase === 'ignition') {
    const r = state.genesisFireRadius;
    const fireAlpha = t >= 12 ? Math.max(0, 1 - (t - 12) / 3) : 1;

    // Expanding light circle (radial gradient: transparent center → black edge)
    if (r > 0.1) {
      const transition = Math.min(80, r * 0.4);
      const innerR = Math.max(0, r - transition);
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    } else {
      // Still fully black (6-7s)
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }

    // === FIRE (7-15s, fades 12-15s) ===
    if (fireAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = fireAlpha;
      drawFire(ctx, cx, cy);
      ctx.restore();
    }
  }
}

function drawFire(ctx: CanvasRenderingContext2D, fx: number, fy: number): void {
  const t = Date.now() / 1000;

  // Outer glow
  const glow = ctx.createRadialGradient(fx, fy, 4, fx, fy, 35);
  glow.addColorStop(0, 'rgba(255,200,50,0.7)');
  glow.addColorStop(0.5, 'rgba(255,100,20,0.3)');
  glow.addColorStop(1, 'rgba(255,30,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(fx, fy, 35, 0, Math.PI * 2); ctx.fill();

  // Flame tongues
  for (let i = 0; i < 5; i++) {
    const fx2 = fx + Math.sin(t * 12 + i * 1.3) * 3;
    const fy2 = fy - 5 + Math.cos(t * 15 + i * 0.8) * 3;
    const flameH = 8 + Math.random() * 12;
    const flameW = 3 + Math.random() * 4;
    ctx.fillStyle = i < 2 ? '#fff8c0' : i < 4 ? '#ffaa00' : '#ff5500';
    ctx.beginPath();
    ctx.moveTo(fx2 - flameW, fy2);
    ctx.quadraticCurveTo(fx2 - flameW * 0.5, fy2 - flameH * 0.6, fx2, fy2 - flameH);
    ctx.quadraticCurveTo(fx2 + flameW * 0.5, fy2 - flameH * 0.6, fx2 + flameW, fy2);
    ctx.closePath();
    ctx.fill();
  }

  // Center spark
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(fx, fy - 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

registerEffect('genesis', drawGenesis);
