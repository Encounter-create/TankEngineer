import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, TileType, inBounds, MAP_W, MAP_H } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import {
  TankEntity, TANK_RADIUS,
  ACCEL_RATE, FRICTION, MIN_SPEED,
  ANGULAR_ACCEL,
} from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS, ARC_GRAVITY } from '../entities/Bullet';
import { PhysicsBlock, createPhysicsBlock, BLOCK_RADIUS, BRICK_MASS, METAL_MASS } from '../entities/PhysicsBlock';
import { effectiveSpeed } from '../entities/Parts';
import { getSkillSpeedMultiplier } from '../systems/Commander';

// ============================================================
// Collision helpers
// ============================================================

export interface CollisionResult {
  hit: boolean;
  normal: Vec2;
  tileX: number;
  tileY: number;
  tileType: TileType;
}

export function checkTileCollision(pos: Vec2, radius: number, map: TileGrid): CollisionResult {
  const cx = Math.floor(pos.x / CELL_SIZE);
  const cy = Math.floor(pos.y / CELL_SIZE);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = cx + dx; const ty = cy + dy;
      if (!inBounds(tx, ty)) continue;
      const tile = map[ty][tx];
      if (tile.type === TileType.EMPTY) continue;
      if (tile.type === TileType.BRICK && tile.hp <= 0) continue;
      const tl = tx * CELL_SIZE, tt = ty * CELL_SIZE;
      const tr = tl + CELL_SIZE, tb = tt + CELL_SIZE;
      const closestX = Math.max(tl, Math.min(pos.x, tr));
      const closestY = Math.max(tt, Math.min(pos.y, tb));
      const dx2 = pos.x - closestX, dy2 = pos.y - closestY;
      if (dx2 * dx2 + dy2 * dy2 < radius * radius) {
        const nx = Math.abs(dx2) > Math.abs(dy2) ? (dx2 > 0 ? 1 : -1) : 0;
        const ny = nx === 0 ? (dy2 > 0 ? 1 : -1) : 0;
        return { hit: true, normal: new Vec2(nx, ny), tileX: tx, tileY: ty, tileType: tile.type };
      }
    }
  }
  return { hit: false, normal: Vec2.zero(), tileX: -1, tileY: -1, tileType: TileType.EMPTY };
}

// ============================================================
// Generic elastic collision (momentum + kinetic energy conserved)
// ============================================================

interface CollisionBody {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  mass: number;
  alive: boolean;
}

/** Apply 1D elastic collision along the normal between two bodies */
export function applyElasticCollision(a: CollisionBody, b: CollisionBody, normal: Vec2): void {
  const vRel = a.vel.dot(normal) - b.vel.dot(normal);
  if (vRel <= 0) return; // separating
  const ma = a.mass, mb = b.mass;
  const J = 2 * vRel / (1 / ma + 1 / mb);
  a.vel = a.vel.sub(normal.scale(J / ma));
  b.vel = b.vel.add(normal.scale(J / mb));
}

function separateBodies(a: CollisionBody, b: CollisionBody, normal: Vec2, overlap: number): void {
  const totalMass = a.mass + b.mass;
  const sepA = overlap * (b.mass / totalMass) + 0.5;
  const sepB = overlap * (a.mass / totalMass) + 0.5;
  a.pos = a.pos.sub(normal.scale(sepA));
  b.pos = b.pos.add(normal.scale(sepB));
}

// ============================================================
// Tank movement
// ============================================================

export function moveTank(
  tank: TankEntity, moveDir: Vec2, dt: number, map: TileGrid,
  newBlocks: PhysicsBlock[],
): void {
  const maxSpeed = effectiveSpeed(tank.config) * getSkillSpeedMultiplier(tank);
  const isMoving = moveDir.x !== 0 || moveDir.y !== 0;

  // Angular movement
  if (isMoving) {
    const targetAngle = moveDir.angle();
    if (tank.config.chassis.stats.instantTurn) {
      tank.dir = targetAngle;
    } else {
      const diff = normalizeAngle(targetAngle - tank.dir);
      const step = ANGULAR_ACCEL * dt;
      if (Math.abs(diff) < step) tank.dir = targetAngle;
      else tank.dir += Math.sign(diff) * step;
      tank.dir = normalizeAngle(tank.dir);
    }
  }

  // Linear movement
  if (isMoving) {
    const accel = maxSpeed * ACCEL_RATE;
    tank.vel = tank.vel.add(moveDir.scale(accel * dt));
    const s = tank.vel.mag();
    if (s > maxSpeed) tank.vel = tank.vel.norm().scale(maxSpeed);
  } else {
    const s = tank.vel.mag();
    if (s > 0) {
      const decel = maxSpeed * FRICTION * dt;
      const ns = Math.max(0, s - decel);
      tank.vel = ns < MIN_SPEED ? Vec2.zero() : tank.vel.norm().scale(ns);
    }
  }

  // Apply velocity
  if (tank.vel.mag() > 0) {
    const desired = tank.pos.add(tank.vel.scale(dt));
    const clamped = clampToMapBounds(desired);
    const col = checkTileCollision(clamped, TANK_RADIUS, map);

    if (!col.hit) {
      tank.pos = clamped;
    } else {
      const normal = col.normal;
      const velDotNormal = tank.vel.dot(normal);
      if (velDotNormal < 0) {
        const tankMass = tank.config.totalWeight;
        const tileMass = col.tileType === TileType.METAL ? METAL_MASS : BRICK_MASS;

        // Compute post-collision velocities via elastic collision
        // v1' = (m1-m2)/(m1+m2) * v1 + 2*m2/(m1+m2) * v2  (v2=0)
        const v1n = -velDotNormal; // impact speed (positive)
        const v1nPrime = (tankMass - tileMass) / (tankMass + tileMass) * v1n;
        const v2nPrime = 2 * tankMass / (tankMass + tileMass) * v1n;

        // Tank loses normal velocity component, gains back the post-collision value
        tank.vel = tank.vel.sub(normal.scale(velDotNormal)); // remove old
        tank.vel = tank.vel.add(normal.scale(-v1nPrime));    // add new (reversed direction)

        // Tile becomes a physics block with the transferred momentum
        const blockVel = normal.scale(-v2nPrime); // opposite direction
        const tilePos = new Vec2(
          (col.tileX + 0.5) * CELL_SIZE,
          (col.tileY + 0.5) * CELL_SIZE,
        );
        const block = createPhysicsBlock(tilePos, blockVel, col.tileType);
        newBlocks.push(block);
        // Remove tile from grid
        map[col.tileY][col.tileX] = { type: TileType.EMPTY, hp: 0 };
      }
      // Slide
      const slidePos = tank.pos.add(tank.vel.scale(dt));
      const sc = checkTileCollision(clampToMapBounds(slidePos), TANK_RADIUS, map);
      if (!sc.hit) tank.pos = clampToMapBounds(slidePos);
    }
  }
}

// ============================================================
// Physics block collisions with walls
// ============================================================

export function resolveBlockWallCollisions(blocks: PhysicsBlock[], map: TileGrid): void {
  for (const block of blocks) {
    if (!block.alive) continue;
    const col = checkTileCollision(block.pos, block.radius, map);
    if (col.hit) {
      const normal = col.normal;
      const vn = block.vel.dot(normal);
      if (vn < 0) {
        // Elastic reflection with wall (massive object)
        block.vel = block.vel.sub(normal.scale(vn * 2));
      }
      // Push out of wall
      block.pos = block.pos.add(normal.scale(block.radius));
    }
  }
}

// ============================================================
// Generic body-to-body collision resolver
// ============================================================

function bodyCollisions(bodies: CollisionBody[], minDist: number): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (!a.alive || !b.alive) continue;
      const diff = b.pos.sub(a.pos);
      const dist = diff.mag();
      if (dist >= minDist || dist < 0.01) continue;
      const normal = diff.norm();
      const overlap = minDist - dist;
      applyElasticCollision(a, b, normal);
      separateBodies(a, b, normal, overlap);
    }
  }
}

function collisionBody(tank: TankEntity): CollisionBody {
  return { pos: tank.pos, vel: tank.vel, radius: TANK_RADIUS, mass: tank.config.totalWeight, alive: tank.alive };
}

function blockBody(b: PhysicsBlock): CollisionBody {
  return { pos: b.pos, vel: b.vel, radius: b.radius, mass: b.mass, alive: b.alive };
}

/** Tank-tank collisions */
export function resolveTankCollisions(tanks: TankEntity[]): void {
  const alive = tanks.filter(t => t.alive);
  bodyCollisions(alive.map(collisionBody), TANK_RADIUS * 2);
}

/** Block-tank collisions */
export function resolveBlockTankCollisions(blocks: PhysicsBlock[], tanks: TankEntity[]): void {
  const aliveTanks = tanks.filter(t => t.alive).map(collisionBody);
  const aliveBlocks = blocks.filter(b => b.alive).map(blockBody);
  const all: CollisionBody[] = [];
  for (const t of aliveTanks) all.push(t);
  for (const b of aliveBlocks) all.push(b);
  bodyCollisions(all, BLOCK_RADIUS + TANK_RADIUS);
}

/** Block-block collisions */
export function resolveBlockBlockCollisions(blocks: PhysicsBlock[]): void {
  const alive = blocks.filter(b => b.alive).map(blockBody);
  bodyCollisions(alive, BLOCK_RADIUS * 2);
}

// ============================================================
// Bullet movement
// ============================================================

export function moveBullet(
  bullet: BulletEntity, dt: number, map: TileGrid,
): { hitWall: boolean; hitTileX: number; hitTileY: number } {
  if (bullet.style === 'arc') {
    bullet.arcVy += ARC_GRAVITY * dt;
    if (!bullet.arcDescending && bullet.arcVy > 0) {
      bullet.arcDescending = true;
      bullet.damage = Math.round(bullet.damage * 2);
    }
  }

  if (bullet.style === 'orbital') {
    bullet.orbitalCenter = bullet.orbitalCenter.add(bullet.vel.scale(dt));
    const offset = Vec2.fromAngle(bullet.orbitalAngle, bullet.orbitalRadius);
    bullet.pos = bullet.orbitalCenter.add(offset);
  }

  if (bullet.style === 'orbital') {
    if (bullet.pos.x < 0 || bullet.pos.x > MAP_W || bullet.pos.y < 0 || bullet.pos.y > MAP_H) {
      bullet.alive = false;
      return { hitWall: true, hitTileX: -1, hitTileY: -1 };
    }
    const col = checkTileCollision(bullet.pos, BULLET_RADIUS, map);
    if (col.hit) { bullet.alive = false; return { hitWall: true, hitTileX: col.tileX, hitTileY: col.tileY }; }
    return { hitWall: false, hitTileX: -1, hitTileY: -1 };
  }

  const moveAmount = bullet.vel.mag() * dt;
  const stepSize = CELL_SIZE / 4;
  const steps = Math.ceil(moveAmount / stepSize);
  if (steps === 0) return { hitWall: false, hitTileX: -1, hitTileY: -1 };
  const stepVec = bullet.vel.norm().scale(stepSize);

  for (let i = 0; i < steps; i++) {
    const nextPos = bullet.pos.add(stepVec);
    if (nextPos.x < 0 || nextPos.x > MAP_W || nextPos.y < 0 || nextPos.y > MAP_H) {
      bullet.alive = false; return { hitWall: true, hitTileX: -1, hitTileY: -1 };
    }
    const col = checkTileCollision(nextPos, BULLET_RADIUS, map);
    if (col.hit) {
      const gx = col.tileX, gy = col.tileY;
      if (bullet.style === 'firework') {
        bullet.alive = false; bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (bullet.style === 'arc' && col.tileType === TileType.BRICK) {
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (bullet.style === 'pierce' && col.tileType === TileType.BRICK && bullet.piercesLeft > 0) {
        bullet.piercesLeft--; map[gy][gx].hp = 0;
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (bullet.style === 'bounce' && bullet.bouncesLeft > 0) {
        bullet.bouncesLeft--;
        bullet.vel = bullet.vel.reflect(col.normal);
        bullet.pos = bullet.pos.add(col.normal.scale(CELL_SIZE / 4));
        bullet.damage = Math.round(bullet.damage * 0.8);
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (bullet.damage >= 500) {
        map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (col.tileType === TileType.BRICK) map[gy][gx].hp = 0;
      bullet.alive = false; bullet.pos = nextPos;
      return { hitWall: true, hitTileX: gx, hitTileY: gy };
    }
    bullet.pos = nextPos;
  }
  return { hitWall: false, hitTileX: -1, hitTileY: -1 };
}

export function checkBulletTankHit(bullet: BulletEntity, tank: TankEntity): boolean {
  return bullet.pos.dist(tank.pos) < TANK_RADIUS + BULLET_RADIUS;
}

// ============================================================
// Utils
// ============================================================

function clampToMapBounds(pos: Vec2): Vec2 {
  return new Vec2(
    Math.max(TANK_RADIUS, Math.min(MAP_W - TANK_RADIUS, pos.x)),
    Math.max(TANK_RADIUS, Math.min(MAP_H - TANK_RADIUS, pos.y)),
  );
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
