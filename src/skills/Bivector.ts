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

const BIVECTOR_POEMS = [
  '其中我看到了我的爱恋', '我飞到她的身边', '我捧出给她的礼物',
  '那是一小块凝固的时间', '时间上有美丽的条纹', '摸起来像浅泥一样柔软',
];

export function updateBivector(state: SiegeState, dt: number): void {
  if (!state || state.bivectorPhase === 'idle') return;

  if (state.bivectorPhase === 'compressing') {
    state.bivectorTimer -= dt;
    const elapsed = 12 - state.bivectorTimer;
    const progress = Math.min(1, elapsed / 12);
    state.bivectorProgress = progress;
    state.bivectorShear = 0.8 * progress * progress;
    state.bivectorScale = Math.max(0.001, 1 - progress);
    state.bivectorWhiteAlpha = 0.8 * progress;
    state.screenShake = Math.max(state.screenShake, 40 * progress);
    if (BIVECTOR_POEMS && BIVECTOR_POEMS.length > 0) {
      const idx = Math.min(BIVECTOR_POEMS.length - 1, Math.floor(elapsed / 2));
      state.bivectorText = BIVECTOR_POEMS[idx] || '';
    }
    if (state.bivectorTimer <= 0) {
      state.bivectorPhase = 'whiteout';
      state.bivectorTimer = 8;
      state.bivectorShear = 0;
      state.bivectorScale = 1;
      state.bivectorWhiteAlpha = 1.0;
      state.screenShake = 0;
      state.bivectorText = '';
      if (!state.bivectorDestroyed && state.enemies && state.physicsBlocks && state.map) {
        state.bivectorDestroyed = true;
        for (const enemy of state.enemies) {
          if (enemy && enemy.alive) { takeDamage(enemy, 999); if (state.particles) state.particles.push(...spawnExplosion(enemy.pos)); }
        }
        for (const block of state.physicsBlocks) {
          if (block && block.alive) block.alive = false;
        }
        for (let gy = 0; gy < MAP_ROWS; gy++) {
          for (let gx = 0; gx < MAP_COLS; gx++) {
            if (state.map[gy] && state.map[gy][gx] && state.map[gy][gx].type !== TileType.EMPTY) state.map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
          }
        }
      }
    }
    return;
  }

  if (state.bivectorPhase === 'whiteout') {
    state.bivectorTimer -= dt;
    const wElapsed = 8 - state.bivectorTimer;
    if (wElapsed < 2) state.bivectorText = '';
    else if (wElapsed < 5) { state.bivectorText = '弱小和无知不是生存的障碍'; state.bivectorTextColor = '#4488ff'; }
    else { state.bivectorText = '傲慢才是'; state.bivectorTextColor = '#ff3333'; }
    if (state.bivectorTimer <= 0) { state.bivectorPhase = 'recovering'; state.bivectorTimer = 5; }
    return;
  }

  if (state.bivectorPhase === 'recovering') {
    state.bivectorTimer -= dt;
    state.bivectorWhiteAlpha = Math.max(0, state.bivectorTimer / 5);
    state.bivectorTextColor = '#ff3333';
    if (state.bivectorTimer <= 0) {
      state.bivectorPhase = 'idle';
      state.bivectorProgress = 0;
      state.bivectorShear = 0;
      state.bivectorScale = 1;
      state.bivectorDestroyed = false;
      state.bivectorText = '';
    }
  }
}

