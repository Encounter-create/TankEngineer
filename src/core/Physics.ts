import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, TileType, inBounds, MAP_W, MAP_H } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import {
  TankEntity, TANK_RADIUS,
  ACCEL_RATE, FRICTION, MIN_SPEED,
  ANGULAR_ACCEL,
} from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS, ARC_GRAVITY } from '../entities/Bullet';
import { PhysicsBlock, createPhysicsBlock, BRICK_MASS, METAL_MASS } from '../entities/PhysicsBlock';
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
// Tank movement
// ============================================================

export function moveTank(
  tank: TankEntity, moveDir: Vec2, dt: number, map: TileGrid,
  newBlocks: PhysicsBlock[],
  allBlocks: PhysicsBlock[],
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

    // Check map grid
    const col = checkTileCollision(clamped, TANK_RADIUS, map);
    // Check physics blocks
    let blockCol: { block: PhysicsBlock; normal: Vec2 } | null = null;
    for (const b of allBlocks) {
      if (!b.alive) continue;
      const diff = clamped.sub(b.pos);
      const dist = diff.mag();
      if (dist < TANK_RADIUS + b.radius) {
        blockCol = { block: b, normal: dist > 0.01 ? diff.norm() : new Vec2(1, 0) };
        break;
      }
    }

    if (!col.hit && !blockCol) {
      tank.pos = clamped;
    } else if (blockCol && (!col.hit || true)) {
      // Elastic collision with physics block
      const normal = blockCol.normal;
      const velDotNormal = tank.vel.dot(normal);
      if (velDotNormal < 0) {
        const tankMass = tank.config.totalWeight;
        const blockMass = blockCol.block.mass;
        const v1n = -velDotNormal;
        const v1nPrime = (tankMass - blockMass) / (tankMass + blockMass) * v1n;
        const v2nPrime = 2 * tankMass / (tankMass + blockMass) * v1n;
        tank.vel = tank.vel.sub(normal.scale(velDotNormal));
        tank.vel = tank.vel.add(normal.scale(-v1nPrime));
        blockCol.block.vel = blockCol.block.vel.add(normal.scale(-v2nPrime));
      }
      // Slide
      const slidePos = tank.pos.add(tank.vel.scale(dt));
      tank.pos = clampToMapBounds(slidePos);
    } else {
      // Map wall collision (momentum transfer to tile)
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
        block.pushedByTankId = tank.id; // track who pushed it
        block.chainLength = 0;
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

export function resolveBlockWallCollisions(
  blocks: PhysicsBlock[], map: TileGrid, newBlocks: PhysicsBlock[],
): void {
  for (const block of blocks) {
    if (!block.alive) continue;
    const col = checkTileCollision(block.pos, block.radius, map);
    if (col.hit) {
      const normal = col.normal;
      const vn = block.vel.dot(normal);
      if (vn < 0) {
        // Elastic collision: block ↔ tile (tile starts at rest, v2=0)
        const tileMass = col.tileType === TileType.METAL ? METAL_MASS : BRICK_MASS;
        const v1n = -vn; // impact speed (positive)
        const v1nPrime = (block.mass - tileMass) / (block.mass + tileMass) * v1n;
        const v2nPrime = 2 * block.mass / (block.mass + tileMass) * v1n;

        // Update block velocity
        block.vel = block.vel.sub(normal.scale(vn));            // remove old normal component
        block.vel = block.vel.add(normal.scale(-v1nPrime));     // add post-collision velocity

        // Tile becomes a physics block
        const tilePos = new Vec2(
          (col.tileX + 0.5) * CELL_SIZE,
          (col.tileY + 0.5) * CELL_SIZE,
        );
        const tileVel = normal.scale(-v2nPrime);
        const newBlock = createPhysicsBlock(tilePos, tileVel, col.tileType);
        newBlock.pushedByTankId = block.pushedByTankId; // inherit pusher
        newBlock.chainLength = block.chainLength + 1; // chain grows
        newBlocks.push(newBlock);
        map[col.tileY][col.tileX] = { type: TileType.EMPTY, hp: 0 };
      }
      // Push block out of wall
      block.pos = block.pos.add(col.normal.scale(block.radius + 1));
    }
  }
}

// ============================================================
// Generic body-to-body collision resolver
// ============================================================

/** Wrapper for an entity with mutable pos/vel via reassignment */
interface BodyRef {
  get pos(): Vec2;
  set pos(v: Vec2);
  get vel(): Vec2;
  set vel(v: Vec2);
}

function bodyRef(pos: Vec2, vel: Vec2): BodyRef {
  let p = pos, v = vel;
  return {
    get pos() { return p; }, set pos(v2: Vec2) { p = v2; },
    get vel() { return v; }, set vel(v2: Vec2) { v = v2; },
  };
}

/** Generic elastic collision: directly updates vel and pos on a and b */
function elasticBounce(
  a: BodyRef, aMass: number, aRadius: number,
  b: BodyRef, bMass: number, bRadius: number,
): void {
  const diff = b.pos.sub(a.pos);
  const dist = diff.mag();
  const minDist = aRadius + bRadius;
  if (dist >= minDist) return;
  // Handle exact overlap (dist ≈ 0) by using arbitrary separation direction
  const normal = dist < 0.01 ? new Vec2(1, 0) : diff.norm();
  const overlap = minDist - dist + 0.5;

  // Apply velocity change (elastic collision along normal)
  const vRel = a.vel.dot(normal) - b.vel.dot(normal);
  if (vRel > 0) {
    // Approaching: apply elastic impulse
    const totalMass = aMass + bMass;
    const J = 2 * vRel / (1 / aMass + 1 / bMass);
    a.vel = a.vel.sub(normal.scale(J / aMass));
    b.vel = b.vel.add(normal.scale(J / bMass));
    // Mass-weighted separation
    a.pos = a.pos.sub(normal.scale(overlap * (bMass / totalMass)));
    b.pos = b.pos.add(normal.scale(overlap * (aMass / totalMass)));
  } else {
    // Separating or stationary but overlapping: just push apart (no velocity change)
    const totalMass = aMass + bMass;
    a.pos = a.pos.sub(normal.scale(overlap * (bMass / totalMass)));
    b.pos = b.pos.add(normal.scale(overlap * (aMass / totalMass)));
  }
}

/** Tank-tank collisions */
export function resolveTankCollisions(tanks: TankEntity[]): void {
  for (let i = 0; i < tanks.length; i++) {
    for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i], b = tanks[j];
      if (!a.alive || !b.alive) continue;
      const ra = bodyRef(a.pos, a.vel), rb = bodyRef(b.pos, b.vel);
      elasticBounce(ra, a.config.totalWeight, TANK_RADIUS, rb, b.config.totalWeight, TANK_RADIUS);
      a.pos = ra.pos; a.vel = ra.vel;
      b.pos = rb.pos; b.vel = rb.vel;
    }
  }
}

/** Block-tank collisions */
export function resolveBlockTankCollisions(blocks: PhysicsBlock[], tanks: TankEntity[]): void {
  for (const block of blocks) {
    if (!block.alive) continue;
    for (const tank of tanks) {
      if (!tank.alive) continue;
      const rb = bodyRef(block.pos, block.vel), rt = bodyRef(tank.pos, tank.vel);
      elasticBounce(rb, block.mass, block.radius, rt, tank.config.totalWeight, TANK_RADIUS);
      block.pos = rb.pos; block.vel = rb.vel;
      tank.pos = rt.pos; tank.vel = rt.vel;
    }
  }
}

/** Block-block collisions */
export function resolveBlockBlockCollisions(blocks: PhysicsBlock[]): void {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (!a.alive || !b.alive) continue;
      const ra = bodyRef(a.pos, a.vel), rb = bodyRef(b.pos, b.vel);
      elasticBounce(ra, a.mass, a.radius, rb, b.mass, b.radius);
      a.pos = ra.pos; a.vel = ra.vel;
      b.pos = rb.pos; b.vel = rb.vel;
    }
  }
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
      // Rocket blows up on any wall hit
      if (bullet.style === 'rocket') {
        bullet.alive = false; bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      if (bullet.style === 'firework') {
        bullet.alive = false; bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (bullet.style === 'arc' && col.tileType === TileType.BRICK) {
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Magnetic/rail: slide along metal walls
      if (bullet.style === 'magnetic' && col.tileType === TileType.METAL) {
        // Project velocity onto wall tangent (perpendicular to normal)
        const tangent = new Vec2(-col.normal.y, col.normal.x);
        const vAlong = bullet.vel.dot(tangent);
        bullet.vel = tangent.scale(Math.sign(vAlong) * bullet.vel.mag());
        bullet.pos = bullet.pos.add(col.normal.scale(CELL_SIZE / 4));
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Sniper (damage >= 500): ALWAYS destroys walls and continues — never bounces
      if (bullet.damage >= 500) {
        map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Pierce: chip brick HP, bullet continues
      if (bullet.style === 'pierce' && col.tileType === TileType.BRICK && bullet.piercesLeft > 0) {
        bullet.piercesLeft--;
        map[gy][gx].hp -= bullet.damage;
        if (map[gy][gx].hp <= 0) map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
        bullet.pos = nextPos; return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Bounce: don't damage brick, just reflect (regular bullets, NOT sniper)
      if (bullet.bouncesLeft > 0) {
        bullet.bouncesLeft--;
        bullet.bounceCount++;
        bullet.vel = bullet.vel.reflect(col.normal);
        bullet.pos = bullet.pos.add(col.normal.scale(CELL_SIZE / 4));
        bullet.damage = Math.round(bullet.damage * 0.8);
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Metal: only sniper can damage it
      if (col.tileType === TileType.METAL) {
        bullet.alive = false; bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      // Brick: subtract bullet damage from HP
      if (col.tileType === TileType.BRICK) {
        map[gy][gx].hp -= bullet.damage;
        if (map[gy][gx].hp <= 0) map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
      }
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
