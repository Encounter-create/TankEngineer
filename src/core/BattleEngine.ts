// BattleEngine — shared update pipeline for all game modes
// Extracted from Siege.ts updateSiege. Generic battle logic, no mode-specific code.

import { TankEntity, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { Input } from './Input';
import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H, TileType } from '../utils/Grid';
import { PhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { BULLET_RADIUS } from '../entities/Bullet';
import { resolveTankCollisions } from './Physics';
import { updateParticles } from '../entities/Particle';
import { updateDamageNumbers } from '../entities/DamageNumber';
import {
  handleEnemyAI, handleAllies, handleTurrets, handlePlanes, handleClones,
  handleBullets, handleBulletTankCollisions, handleSkillActivation,
  updateMeteor, updateBivector, updateQuantum, updateLens,
  updateRewind, updateBigBang, updateHolo,
  updateTrojan, updateArk, updateDamocles,
} from '../modes/Siege';
import { spawnParticles } from '../entities/Particle';

export interface BattleState {
  player: TankEntity; enemies: TankEntity[];
  bullets: any[]; physicsBlocks: PhysicsBlock[];
  particles: any[]; damageNumbers: any[];
  fireZones: any[]; allies: any[]; clones: any[];
  turrets: any[]; planes: any[];
  map: any; screenShake: number;
  skillMessage: string; skillMessageTime: number;
  showDebug: boolean; elapsedTime: number;
  gravityPos: Vec2; gravityTimer: number;
  slowMoTimer: number; timeSlowTimer: number;
  lightningBranches: Vec2[][]; lightningTimer: number;
  restoreTimer: number;
  trojanPhase: string; trojanX: number;
  arkPhase: string; arkWaterH: number;
  // Skill fields (mirror SiegeState)
  meteorPhase: string; meteorTimer: number; meteorTarget: Vec2; meteorPos: Vec2; meteorVel: number; meteorImpactTime: number; meteorFlashAlpha: number;
  bivectorPhase: string; bivectorTimer: number; bivectorProgress: number; bivectorShear: number; bivectorScale: number; bivectorWhiteAlpha: number; bivectorDestroyed: boolean; bivectorText: string; bivectorTextColor: string;
  quantumPhase: string; quantumTimer: number; quantumRedAlpha: number; quantumBlueAlpha: number; quantumDestroyed: boolean;
  lensPhase: string; lensTimer: number; lensTarget: Vec2; lensStrength: number; lensRadius: number;
  rewindPhase: string; rewindTimer: number; rewindBlueAlpha: number; rewindReversed: boolean;
  bigbangPhase: string; bigbangTimer: number; bigbangScale: number; bigbangWhiteAlpha: number;
  holoPhase: string; holoTimer: number; holoRotation: number; holoRadius: number; holoCracks: number;
  damoclesPhase: string; damoclesTimer: number;
  [key: string]: any; // allow mode-specific fields
}

export function updateBattle(state: BattleState, input: Input, dt: number): void {
  // U-key debug toggle
  if (input.wasJustPressed('KeyU')) state.showDebug = !state.showDebug;

  // Pre-physics skill updates
  updateRewind(state as any, dt);
  updateBigBang(state as any, dt);
  updateHolo(state as any, dt);
  updateTrojan(state as any, dt);
  updateArk(state as any, dt);
  updateDamocles(state as any, dt);

  // Screen shake decay
  state.screenShake = Math.max(0, state.screenShake - dt * 50);

  // Player firing (caller handles movement + fire separately if mode-specific)
  handleBullets(state as any, dt, false);
  handleBulletTankCollisions(state as any, dt);

  // Turret collision: push tanks + bullet + block
  const turretR = 14;
  for (const turret of state.turrets) {
    if (!turret.alive) continue;
    for (const tank of [state.player, ...state.enemies, ...state.allies]) {
      if (!tank.alive) continue;
      const diff = tank.pos.sub(turret.pos);
      const dist = diff.mag();
      if (dist < turretR + TANK_RADIUS) {
        tank.pos = tank.pos.add(diff.norm().scale(turretR + TANK_RADIUS - dist + 1));
      }
    }
    for (const bullet of state.bullets) {
      if (!bullet.alive) continue;
      if (bullet.pos.dist(turret.pos) < turretR + BULLET_RADIUS) {
        turret.hp -= bullet.isPlayerBullet ? 0 : bullet.damage;
        bullet.alive = false;
        if (turret.hp <= 0) turret.alive = false;
      }
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      const diff = block.pos.sub(turret.pos); const dist = diff.mag();
      if (dist < turretR + BLOCK_RADIUS) {
        const n = dist > 0.01 ? diff.norm() : new Vec2(1, 0);
        block.pos = turret.pos.add(n.scale(turretR + BLOCK_RADIUS + 1));
        const vn = block.vel.dot(n);
        if (vn < 0) block.vel = block.vel.sub(n.scale(2 * vn)).scale(0.4);
      }
    }
  }

  // Tank-tank collisions
  const combatants = [state.player, ...state.enemies, ...state.allies].filter((t: any) => t.alive);
  resolveTankCollisions(combatants);

  // Post-physics skill updates
  updateMeteor(state as any, dt);
  updateBivector(state as any, dt);
  updateQuantum(state as any, dt);
  updateLens(state as any, dt);

  // Gravity well
  if (state.gravityTimer > 0) {
    state.gravityTimer -= dt;
    const gPos = state.gravityPos;
    for (const enemy of state.enemies) {
      if (!enemy.alive || (enemy as any).isStatic) continue;
      const to = gPos.sub(enemy.pos); const d = to.mag();
      if (d > 20) enemy.vel = enemy.vel.add(to.norm().scale(200 * dt));
      if (d < 30) takeDamage(enemy, 10 * dt, state.player);
    }
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      block.vel = block.vel.add(gPos.sub(block.pos).norm().scale(300 * dt));
    }
    state.particles.push(...spawnParticles(gPos, 'hit', 1, 30));
  }

  // Particles + damage numbers
  updateParticles(state.particles, dt);
  state.particles = state.particles.filter((p: any) => p.alive);
  updateDamageNumbers(state.damageNumbers, dt);
  state.damageNumbers = state.damageNumbers.filter((n: any) => n.alive);

  // Timer decrements
  if (state.timeSlowTimer > 0) state.timeSlowTimer -= dt;
  if (state.restoreTimer > 0) state.restoreTimer -= dt;
  if (state.lightningTimer > 0) state.lightningTimer -= dt;
  if (state.slowMoTimer > 0) state.slowMoTimer -= dt;
  state.skillMessageTime -= 16;
}
