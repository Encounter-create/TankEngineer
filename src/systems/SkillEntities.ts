// SkillEntities — AI behavior for skill-spawned entities (allies, turrets, clones, planes)
// Called by all game modes after skill activation creates these entities.

import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H } from '../utils/Grid';
import { TankEntity, takeDamage, TANK_RADIUS, TURRET_ANGULAR_VEL } from '../entities/Tank';
import { createBullet, BULLET_RADIUS } from '../entities/Bullet';
import { moveTank, normalizeAngle, SolidStructure } from '../core/Physics';
import { createFireZone } from '../entities/FireZone';
import { spawnExplosion } from '../entities/Particle';
import { hasSynergy } from './Synergy';
import { playExplosion } from './Sound';

type OnKillFn = (enemy: TankEntity, multiplier: number) => void;

// ============================================================
// Ally AI (Wizard resurrect, Trojan, etc.)
// ============================================================

export function handleAllies(state: any, dt: number, structures?: SolidStructure[]): void {
  for (const ally of (state.allies || [])) {
    if (!ally.alive) continue;
    ally.fireCooldown -= dt * 1000;
    const distToPlayer = ally.pos.dist(state.player.pos);
    const enemyStructs: any[] = (state as any)._enemyStructures || [];
    const visionR = ally.visionRadius || 200;

    // Target lock: keep current target unless dead or out of vision
    let lockId = (ally as any)._lockId as string | undefined;
    let fireTarget: any = null;
    if (lockId) {
      const lockedEnemy = state.enemies.find((e: any) => e.id === lockId && e.alive && e.pos.dist(ally.pos) < visionR);
      const lockedStruct = enemyStructs.find((s: any) => (s.id || '') === lockId && s.alive && ally.pos.dist(s.pos) < visionR);
      if (lockedEnemy) { fireTarget = lockedEnemy; }
      else if (lockedStruct) { fireTarget = lockedStruct; }
      else { lockId = undefined; (ally as any)._lockId = undefined; }
    }
    // Find new target: enemy > structure (priority order)
    if (!lockId) {
      const enemiesInRange = state.enemies.filter((e: any) => e.alive && e.pos.dist(ally.pos) < visionR);
      if (enemiesInRange.length > 0) {
        fireTarget = enemiesInRange[0]; lockId = fireTarget.id; (ally as any)._lockId = lockId;
      } else {
        const structsInRange = enemyStructs.filter((s: any) => s.alive && ally.pos.dist(s.pos) < visionR);
        if (structsInRange.length > 0) {
          fireTarget = structsInRange[0]; lockId = fireTarget.id || fireTarget.side + '_base'; (ally as any)._lockId = lockId;
        }
      }
    }

    if (fireTarget) {
      const targetAngle = fireTarget.pos.sub(ally.pos).angle();
      const diff = normalizeAngle(targetAngle - ally.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      if (Math.abs(diff) < maxStep) ally.turretAngle = targetAngle;
      else ally.turretAngle += Math.sign(diff) * maxStep;
      ally.turretAngle = normalizeAngle(ally.turretAngle);
    }

    const fireAllyBullet = () => {
      if (ally.fireCooldown > 0 || !fireTarget) return;
      const cfg = ally.config;
      const style = cfg.barrel.stats.bulletStyle ?? 'straight';
      const speed = cfg.barrel.stats.bulletSpeed ?? 400;
      const dmg = cfg.barrel.stats.bulletDamage ?? 35;
      const bounces = cfg.barrel.stats.bounces ?? 0;
      const pierces = cfg.barrel.stats.pierces ?? 0;
      const cd = cfg.barrel.stats.cooldownMs ?? 800;
      if (style === 'orbital') {
        for (let idx = 0; idx < 2; idx++) {
          state.bullets.push(createBullet(ally.pos, ally.turretAngle, 'orbital', speed, dmg, 0, 0, ally.id, true, idx, 5));
        }
      } else {
        state.bullets.push(createBullet(ally.pos, ally.turretAngle, style, speed, dmg, bounces, pierces, ally.id, true));
      }
      ally.fireCooldown = cd;
    };

    if (ally.aiMode === 'guard_player') {
      if (distToPlayer > ally.followRadius) {
        ally.aiState = 'follow';
        const toPlayer = state.player.pos.sub(ally.pos).norm();
        moveTank(ally as any, toPlayer, dt, state.map, state.physicsBlocks, state.physicsBlocks, structures);
      } else {
        ally.aiState = 'fire';
        ally.vel = Vec2.zero();
        if (fireTarget && fireTarget.pos.dist(ally.pos) < 100) {
          const away = ally.pos.sub(fireTarget.pos).norm();
          moveTank(ally as any, away, dt, state.map, state.physicsBlocks, state.physicsBlocks, structures);
        }
      }
      fireAllyBullet();
    } else {
      if (fireTarget && fireTarget.pos.dist(ally.pos) < 100) {
        const away = ally.pos.sub(fireTarget.pos).norm();
        moveTank(ally as any, away, dt, state.map, state.physicsBlocks, state.physicsBlocks, structures);
      } else if (distToPlayer > ally.followRadius) {
        const toPlayer = state.player.pos.sub(ally.pos).norm();
        moveTank(ally as any, toPlayer, dt, state.map, state.physicsBlocks, state.physicsBlocks, structures);
      } else {
        ally.vel = Vec2.zero();
      }
      fireAllyBullet();
    }
  }
  state.allies = (state.allies || []).filter((a: any) => a.alive);
}

// ============================================================
// Skill-spawned turrets (Engineer commander)
// ============================================================

export function handleTurrets(state: any, dt: number): void {
  const hasFortress = hasSynergy(state.player.config, 'mobile_fortress');
  for (const turret of (state.turrets || [])) {
    if (!turret.alive) continue;
    turret.fireCooldown -= dt * 1000;
    const target = state.enemies.find((e: any) => e.alive && e.pos.dist(turret.pos) < turret.fireRange);
    if (target) {
      turret.angle = target.pos.sub(turret.pos).angle();
      if (turret.fireCooldown <= 0) {
        const spawnPos = turret.pos.add(Vec2.fromAngle(turret.angle, BULLET_RADIUS + 14));
        const bullet = createBullet(spawnPos, turret.angle, 'straight', 450, 25, 0, 0, turret.id, true);
        state.bullets.push(bullet);
        turret.fireCooldown = 600;
      }
    }
    if (hasFortress && state.player.alive) {
      const d = state.player.pos.dist(turret.pos);
      if (d < turret.fireRange) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 8 * dt);
        if (Math.random() < 0.4) {
          state.particles.push({
            pos: new Vec2(state.player.pos.x + (Math.random() - 0.5) * 20, state.player.pos.y + (Math.random() - 0.5) * 20),
            vel: new Vec2((Math.random() - 0.5) * 10, -15 - Math.random() * 20),
            life: 0.5 + Math.random() * 0.5, maxLife: 1,
            color: ['#44ff88', '#66ffaa', '#88ffcc', '#22dd66'][Math.floor(Math.random() * 4)],
            radius: 2 + Math.random() * 3, alive: true, smokeExpand: false, isCross: false,
          });
        }
      }
    }
  }
  state.turrets = (state.turrets || []).filter((t: any) => t.alive);
}

// ============================================================
// Clones (Ninja commander)
// ============================================================

export function handleClones(state: any, dt: number): void {
  const now = performance.now();
  const playerJustFired = state.playerCooldownRemaining > 0 && state.playerCooldownRemaining >= 400;
  for (const clone of (state.clones || [])) {
    if (!clone.alive) continue;
    if (now > clone.expireTime) { clone.alive = false; continue; }
    const angle = state.player.dir + clone.offsetAngle;
    const offset = Vec2.fromAngle(angle, TANK_RADIUS * 2 + 8);
    clone.pos = state.player.pos.add(offset);
    clone.dir = state.player.dir;
    clone.turretAngle = state.player.turretAngle;
    clone.cooldownRemaining -= dt * 1000;
    if (Math.random() < 0.6) {
      state.particles.push({ pos: new Vec2(clone.pos.x+(Math.random()-0.5)*10, clone.pos.y+(Math.random()-0.5)*10), vel: new Vec2(0, -5-Math.random()*10), life: 0.2+Math.random()*0.3, maxLife:0.5, color: ['#ffdd44','#ffcc00','#ffffff'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2.5, alive:true, smokeExpand:false, isCross:false });
    }
    if (playerJustFired && clone.cooldownRemaining <= 0) {
      const cfg = clone.config;
      state.bullets.push(createBullet(clone.pos, clone.turretAngle, cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400, (cfg.barrel.stats.bulletDamage ?? 35) * 2, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0, state.player.id, true));
      clone.cooldownRemaining = cfg.barrel.stats.cooldownMs ?? 800;
    }
  }
  state.clones = (state.clones || []).filter((c: any) => c.alive);
}

// ============================================================
// Planes (Colonel commander)
// ============================================================

export function handlePlanes(state: any, dt: number, onKill?: OnKillFn): void {
  for (const plane of (state.planes || [])) {
    if (!plane.alive) continue;
    plane.x += plane.velX * dt;
    plane.y += plane.velY * dt;
    plane.bombCooldown -= dt;
    if (plane.x < -MAP_W * 2 || plane.x > MAP_W * 3 || plane.y < -MAP_H * 2 || plane.y > MAP_H * 3) {
      plane.alive = false; continue;
    }
    const precisionStrike = hasSynergy(state.player.config, 'precision_strike');
    const bombInterval = precisionStrike ? 0.6 : 1.2;
    if (plane.bombCooldown <= 0 && plane.x > 10 && plane.x < MAP_W - 10 && plane.y > 10 && plane.y < MAP_H - 10) {
      plane.bombCooldown = bombInterval;
      const bombPos = new Vec2(plane.x, plane.y);
      const zone = createFireZone(bombPos, 35, 3, 20);
      state.fireZones.push(zone);
      state.particles.push(...spawnExplosion(bombPos));
      playExplosion();
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (enemy.pos.dist(bombPos) < 40) {
          takeDamage(enemy, 30);
          if (!enemy.alive && onKill) onKill(enemy, 1);
        }
      }
    }
  }
  state.planes = (state.planes || []).filter((p: any) => p.alive);
}
