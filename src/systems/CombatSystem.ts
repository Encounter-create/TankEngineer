// CombatSystem — shared combat physics: bullets, blocks, bullet-tank collisions
// All game modes (Siege, TwoKings, Practice) use these functions.

import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H, TileType } from '../utils/Grid';
import { TankEntity, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { BulletEntity, createBullet, BULLET_RADIUS, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, FIREWORK_MAX_LIFE } from '../entities/Bullet';
import { updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { moveBullet, checkBulletTankHit, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions, bodyRef, elasticBounce, SolidStructure } from '../core/Physics';
import { createFireZone } from '../entities/FireZone';
import { createAllyTank } from '../entities/Ally';
import { spawnParticles, spawnExplosion } from '../entities/Particle';
import { spawnDamageNumber } from '../entities/DamageNumber';
import { calcKillMultiplier } from './DamageMultiplier';
import { hasSynergy } from './Synergy';
import { isBarrageActive } from './Commander';
import { playHitTank, playHitWall, playExplosion } from './Sound';

/** Called when a tank is killed in combat. Mode-specific: Siege tracks kills, TwoKings ignores. */
type OnKillFn = (enemy: TankEntity, multiplier: number) => void;

// ============================================================
// Rocket explosion
// ============================================================

function explodeRocket(bullet: BulletEntity, state: any, _onKill?: OnKillFn): void {
  bullet.alive = false;
  state.particles.push(...spawnExplosion(bullet.pos));
  playExplosion();
  state.screenShake = 6;
  const zone = createFireZone(bullet.pos, 50, 5, 25);
  state.fireZones.push(zone);
  const undead = hasSynergy(state.player.config, 'undead_rocket');
  for (const tank of [state.player, ...state.enemies]) {
    if (!tank.alive) continue;
    if (tank.pos.dist(bullet.pos) < zone.radius) {
      takeDamage(tank, bullet.isPlayerBullet ? 60 : 40);
      if (undead && !tank.alive && !tank.isPlayer) {
        const ally = createAllyTank(`undead_${Date.now()}_${Math.random()}`, tank.pos, tank.config, 'guard_player');
        state.allies.push(ally);
      }
    }
  }
}

// ============================================================
// Physics blocks
// ============================================================

export function handlePhysicsBlocks(state: any, dt: number, structures?: SolidStructure[], onKill?: OnKillFn): void {
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    const nextBg = { x: Math.floor((block.pos.x + block.vel.x * dt) / CELL_SIZE), y: Math.floor((block.pos.y + block.vel.y * dt) / CELL_SIZE) };
    if (nextBg && nextBg.x >= 0 && nextBg.x < MAP_COLS && nextBg.y >= 0 && nextBg.y < MAP_ROWS && state.map[nextBg.y]?.[nextBg.x]?.type === TileType.WATER) {
      block.vel = Vec2.zero();
    }
    // Solid structures: blocks collide
    if (structures) {
      for (const s of structures) {
        const toS = block.pos.sub(s.pos);
        const dist = toS.mag();
        if (dist < s.radius + BLOCK_RADIUS) {
          const n = dist > 0.01 ? toS.norm() : new Vec2(1, 0);
          const vn = block.vel.dot(n);
          if (vn < 0) block.vel = block.vel.sub(n.scale(vn * 1.5));
          block.pos = block.pos.add(n.scale(s.radius + BLOCK_RADIUS - dist + 1));
        }
      }
    }
    // Ice effect
    const bg = { x: Math.floor(block.pos.x / CELL_SIZE), y: Math.floor(block.pos.y / CELL_SIZE) };
    const onIce = bg.x >= 0 && bg.x < MAP_COLS && bg.y >= 0 && bg.y < MAP_ROWS && state.map[bg.y]?.[bg.x]?.type === TileType.ICE;
    const frictionMul = state.frictionMul ?? 1;
    if (!onIce) updatePhysicsBlock(block, dt, frictionMul);
    block.pos = block.pos.add(block.vel.scale(dt));
    if (onIce && block.vel.mag() > 5) {
      block.vel = Vec2.fromAngle(Math.atan2(block.vel.y, block.vel.x), block.vel.mag());
    }
    // Clamp to map
    const r = block.radius;
    block.pos = new Vec2(
      Math.max(r, Math.min(MAP_W - r, block.pos.x)),
      Math.max(r, Math.min(MAP_H - r, block.pos.y)),
    );
  }

  // Block-block collisions
  for (let pass = 0; pass < 3; pass++) {
    resolveBlockBlockCollisions(state.physicsBlocks);
  }
  // Block damage to tanks
  const allTanks = [state.player, ...state.enemies, ...(state.allies || [])];
  for (const block of state.physicsBlocks) {
    if (!block.alive || block.vel.mag() < 25) continue;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.pos.sub(block.pos);
      const dist = toEnemy.mag();
      if (dist > TANK_RADIUS + BLOCK_RADIUS + 6) continue;
      const approach = block.vel.dot(toEnemy.norm());
      if (approach < 10) continue;
      if (dist < TANK_RADIUS + BLOCK_RADIUS + 6) {
        const ctx = calcKillMultiplier('block', 0, block.chainLength);
        const baseDmg = Math.round(block.vel.mag() * block.mass * 0.08);
        const dmg = takeDamage(enemy, Math.max(10, baseDmg * ctx.multiplier));
        (state.damageNumbers || []).push(spawnDamageNumber(enemy.pos, dmg, ctx.multiplier >= 3));
        state.particles.push(...spawnParticles(enemy.pos, 'hit', 12, 120));
        // Combo text for block kills
        if (ctx.multiplier >= 2) {
          state.comboText = ctx.label;
          state.comboColor = ctx.color;
          state.comboMultiplier = ctx.multiplier;
          state.comboTimer = 2.5;
        }
        // Mode-specific kill callback
        if (!enemy.alive && onKill) onKill(enemy, ctx.multiplier);
      }
    }
  }
  resolveBlockTankCollisions(state.physicsBlocks, allTanks);
  resolveBlockWallCollisions(state.physicsBlocks, state.map, state.physicsBlocks);

  // Cleanup
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    if (block.hp !== -1 && block.hp <= 0) block.alive = false;
    if (block.vel.mag() < 2) block.vel = Vec2.zero();
  }
  state.physicsBlocks = state.physicsBlocks.filter((b: any) => b.alive);
}

// ============================================================
// Bullets
// ============================================================

export function handleBullets(state: any, dt: number, structures?: SolidStructure[], onKill?: OnKillFn): void {
  const newBullets: BulletEntity[] = [];

  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    // Rocket: steer toward target
    if (bullet.style === 'rocket') {
      const toTarget = bullet.targetPos.sub(bullet.pos);
      if (toTarget.mag() < 10) { explodeRocket(bullet, state, onKill); continue; }
      bullet.vel = toTarget.norm().scale(bullet.vel.mag());
    }

    // Block collision
    let hitBlock = false;
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      if (block.vel.mag() < 0.5 && bullet.pos.dist(block.pos) > BLOCK_RADIUS * 2) continue;
      if (bullet.pos.dist(block.pos) < BLOCK_RADIUS + BULLET_RADIUS) {
        if (bullet.style === 'rocket' || block.tileType === TileType.BARREL) {
          if (block.tileType === TileType.BARREL) {
            block.alive = false;
            state.fireZones.push(createFireZone(block.pos, 55, 3, 25));
            state.particles.push(...spawnParticles(block.pos, 'explosion', 18, 150));
            playExplosion(); state.screenShake = 8;
            for (const enemy of state.enemies) {
              if (!enemy.alive) continue;
              if (enemy.pos.dist(block.pos) < 60) {
                takeDamage(enemy, 40);
                if (!enemy.alive && onKill) onKill(enemy, 1);
              }
            }
          }
          if (bullet.style === 'rocket') explodeRocket(bullet, state, onKill);
          else bullet.alive = false;
        } else {
          const bulletBody = bodyRef(bullet.pos, bullet.vel);
          const blockBody = bodyRef(block.pos, block.vel);
          elasticBounce(bulletBody, bullet.mass, BULLET_RADIUS, blockBody, block.mass, BLOCK_RADIUS);
          block.pos = blockBody.pos; block.vel = blockBody.vel;
          bullet.pos = bulletBody.pos; bullet.vel = bulletBody.vel;
          if (block.hp > 0) block.hp -= bullet.damage;
          if (!bullet.isPlayerBullet && block.hp > 0 && block.hp <= 0) block.alive = false;
          state.particles.push(...spawnParticles(bullet.pos, 'impact', 6, 80));
          if (bullet.bouncesLeft > 0) {
            bullet.bouncesLeft--;
            bullet.bounceCount++;
            bullet.damage = Math.round(bullet.damage * 0.8);
          } else {
            bullet.alive = false;
          }
        }
        hitBlock = true;
        break;
      }
    }
    if (hitBlock) continue;

    // Solid structure collision (bases, towers, CC, etc.) — bullet dies on contact
    if (structures) {
      let hitStructure = false;
      for (const s of structures) {
        if (bullet.pos.dist(s.pos) < s.radius + BULLET_RADIUS) {
          state.particles.push(...spawnParticles(bullet.pos, 'explosion', 8, 80));
          bullet.alive = false;
          hitStructure = true;
          break;
        }
      }
      if (hitStructure) continue;
    }

    // Magnetic modifier
    if (!bullet.isPlayerBullet && state.activeModifiers?.some((m: any) => m.id === 'magnetic')) {
      const toPlayer = state.player.pos.sub(bullet.pos);
      if (toPlayer.mag() > 1) {
        const desired = toPlayer.norm();
        bullet.vel = bullet.vel.add(desired.scale(30 * dt)).norm().scale(bullet.vel.mag());
      }
    }

    // Firework
    if (bullet.style === 'firework') {
      if (bullet.fireworkLife === 0) bullet.fireworkLife = FIREWORK_MAX_LIFE;
      bullet.fireworkTimer -= dt;
      bullet.fireworkLife -= dt;
      if (bullet.fireworkLife <= 0) { bullet.alive = false; state.particles.push(...spawnExplosion(bullet.pos)); continue; }
      if (bullet.fireworkTimer <= 0) {
        const fwRate = (hasSynergy(state.player.config, 'firework_fest') && isBarrageActive(state.player))
          ? FIREWORK_INTERVAL * 0.5 : FIREWORK_INTERVAL;
        bullet.fireworkTimer = fwRate;
        for (let i = 0; i < FIREWORK_CHILD_COUNT; i++) {
          const angle = (Math.PI * 2 / FIREWORK_CHILD_COUNT) * i;
          const child = createBullet(bullet.pos, angle, 'straight', 110, 7, 0, 0, bullet.ownerId, bullet.isPlayerBullet);
          child.fireworkLife = 999;
          newBullets.push(child);
        }
        state.particles.push(...spawnParticles(bullet.pos, 'barrage', 3, 40));
      }
    }

    // Orbital
    if (bullet.style === 'orbital') {
      bullet.orbitalAngle += dt * 14;
    }

    const result = moveBullet(bullet, dt, state.map, state.physicsBlocks);
    if (result.hitWall) {
      if (bullet.style === 'rocket') {
        explodeRocket(bullet, state, onKill);
      } else {
        const gx2 = result.hitTileX, gy2 = result.hitTileY;
        if (gx2 >= 0 && gy2 >= 0 && state.map[gy2]?.[gx2]?.type === TileType.BARREL) {
          state.map[gy2][gx2] = { type: TileType.EMPTY, hp: 0 };
          state.fireZones.push(createFireZone(bullet.pos, 55, 3, 25));
          state.particles.push(...spawnParticles(bullet.pos, 'explosion', 18, 150));
          playExplosion(); state.screenShake = 8;
          for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            if (enemy.pos.dist(bullet.pos) < 60) {
              takeDamage(enemy, 40);
              if (!enemy.alive && onKill) onKill(enemy, 1);
            }
          }
        }
        state.particles.push(...spawnParticles(bullet.pos, 'impact', 10, 100));
        playHitWall();
      }
    }
  }

  state.bullets.push(...newBullets);
  state.bullets = state.bullets.filter((b: any) => b.alive);
}

// ============================================================
// Bullet ↔ Tank collisions
// ============================================================

export function handleBulletTankCollisions(state: any, _dt: number, onKill?: OnKillFn): void {
  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    if (bullet.isPlayerBullet) {
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (checkBulletTankHit(bullet, enemy)) {
          const killCtx = bullet.style === 'rocket'
            ? calcKillMultiplier('bullet', 0, 0)
            : calcKillMultiplier('bullet', bullet.bounceCount, 0);

          if (bullet.style === 'rocket') {
            explodeRocket(bullet, state, onKill);
          } else {
            const bulletBody = bodyRef(bullet.pos, bullet.vel);
            const enemyBody = bodyRef(enemy.pos, enemy.vel);
            elasticBounce(bulletBody, bullet.mass, BULLET_RADIUS, enemyBody, enemy.config.totalWeight, TANK_RADIUS);
            enemy.pos = enemyBody.pos; enemy.vel = enemyBody.vel;
            bullet.pos = bulletBody.pos; bullet.vel = bulletBody.vel;

            const dmg = takeDamage(enemy, bullet.damage * killCtx.multiplier);
            (state.damageNumbers || []).push(spawnDamageNumber(enemy.pos, dmg, killCtx.multiplier >= 3));
            state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
            if (killCtx.multiplier > 1) {
              state.comboText = killCtx.label;
              state.comboColor = killCtx.color;
              state.comboMultiplier = killCtx.multiplier;
              state.comboTimer = 2.0;
            }
            playHitTank();
            bullet.alive = false;
          }
          if (!enemy.alive && onKill) onKill(enemy, killCtx.multiplier);
          break;
        }
      }
    } else {
      // Enemy bullets: check allies + clones first
      let hitFriendly = false;
      for (const ally of (state.allies || [])) {
        if (!ally.alive) continue;
        if (bullet.pos.dist(ally.pos) < TANK_RADIUS + BULLET_RADIUS) {
          takeDamage(ally, bullet.damage);
          state.particles.push(...spawnParticles(ally.pos, 'hit', 8, 80));
          (state.damageNumbers || []).push(spawnDamageNumber(ally.pos, bullet.damage, false));
          playHitTank();
          bullet.alive = false; hitFriendly = true; break;
        }
      }
      if (!hitFriendly) {
        for (const clone of (state.clones || [])) {
          if (!clone.alive) continue;
          if (bullet.pos.dist(clone.pos) < TANK_RADIUS + BULLET_RADIUS) {
            clone.hp -= bullet.damage;
            if (clone.hp <= 0) clone.alive = false;
            state.particles.push(...spawnParticles(clone.pos, 'hit', 8, 80));
            (state.damageNumbers || []).push(spawnDamageNumber(clone.pos, bullet.damage, false));
            bullet.alive = false; hitFriendly = true; break;
          }
        }
      }
      if (hitFriendly) continue;
      if (state.player.alive && checkBulletTankHit(bullet, state.player)) {
        if (bullet.style === 'rocket') {
          explodeRocket(bullet, state, onKill);
        } else {
          const dmg = takeDamage(state.player, bullet.damage);
          (state.damageNumbers || []).push(spawnDamageNumber(state.player.pos, dmg, dmg >= 50));
          state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
          playHitTank();
          bullet.alive = false;
        }
        // Player death — handled by each mode's own update loop (no endSiege here)
      }
    }
  }
}
