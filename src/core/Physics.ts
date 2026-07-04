import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, TileType, inBounds, MAP_W, MAP_H } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import {
  TankEntity, TANK_RADIUS,
  ACCEL_RATE, FRICTION, MIN_SPEED,
  ANGULAR_ACCEL,
} from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS, ARC_GRAVITY } from '../entities/Bullet';
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

/** Check if a circle at `pos` with `radius` collides with any solid tile */
export function checkTileCollision(
  pos: Vec2,
  radius: number,
  map: TileGrid,
): CollisionResult {
  const cx = Math.floor(pos.x / CELL_SIZE);
  const cy = Math.floor(pos.y / CELL_SIZE);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!inBounds(tx, ty)) continue;
      const tile = map[ty][tx];
      if (tile.type === TileType.EMPTY) continue;
      if (tile.type === TileType.BRICK && tile.hp <= 0) continue;

      const tileLeft = tx * CELL_SIZE;
      const tileTop = ty * CELL_SIZE;
      const tileRight = tileLeft + CELL_SIZE;
      const tileBottom = tileTop + CELL_SIZE;

      const closestX = Math.max(tileLeft, Math.min(pos.x, tileRight));
      const closestY = Math.max(tileTop, Math.min(pos.y, tileBottom));
      const distX = pos.x - closestX;
      const distY = pos.y - closestY;
      const distSq = distX * distX + distY * distY;

      if (distSq < radius * radius) {
        let nx = 0, ny = 0;
        if (Math.abs(distX) > Math.abs(distY)) {
          nx = distX > 0 ? 1 : -1;
        } else {
          ny = distY > 0 ? 1 : -1;
        }
        return {
          hit: true,
          normal: new Vec2(nx, ny),
          tileX: tx,
          tileY: ty,
          tileType: tile.type,
        };
      }
    }
  }

  return { hit: false, normal: Vec2.zero(), tileX: -1, tileY: -1, tileType: TileType.EMPTY };
}

// ============================================================
// Tank movement — acceleration-based with angular velocity
// ============================================================

/**
 * Update tank physics for one frame.
 * - Accelerates toward `moveDir` up to max speed
 * - Applies friction when no input
 * - Rotates body toward target angle with angular velocity
 * - Resolves wall collisions
 */
export function moveTank(
  tank: TankEntity,
  moveDir: Vec2,
  dt: number,
  map: TileGrid,
): void {
  const maxSpeed = effectiveSpeed(tank.config) * getSkillSpeedMultiplier(tank);
  const isMoving = moveDir.x !== 0 || moveDir.y !== 0;

  // ---- Angular movement (body rotation) ----
  if (isMoving) {
    const targetAngle = moveDir.angle();
    // Instant turn chassis (履带底盘)
    if (tank.config.chassis.stats.instantTurn) {
      tank.dir = targetAngle;
    } else {
      const angleDiff = normalizeAngle(targetAngle - tank.dir);
      const maxAngStep = ANGULAR_ACCEL * dt;
      if (Math.abs(angleDiff) < maxAngStep) {
        tank.dir = targetAngle;
      } else {
        tank.dir += Math.sign(angleDiff) * maxAngStep;
        tank.dir = normalizeAngle(tank.dir);
      }
    }
  }

  // ---- Linear movement (acceleration model) ----
  if (isMoving) {
    // Accelerate toward desired direction
    const accel = maxSpeed * ACCEL_RATE;
    tank.vel = tank.vel.add(moveDir.scale(accel * dt));

    // Clamp to max speed
    const speed = tank.vel.mag();
    if (speed > maxSpeed) {
      tank.vel = tank.vel.norm().scale(maxSpeed);
    }
  } else {
    // Friction / deceleration
    const speed = tank.vel.mag();
    if (speed > 0) {
      const frictionDecel = maxSpeed * FRICTION * dt;
      const newSpeed = Math.max(0, speed - frictionDecel);
      if (newSpeed < MIN_SPEED) {
        tank.vel = Vec2.zero();
      } else {
        tank.vel = tank.vel.norm().scale(newSpeed);
      }
    }
  }

  // ---- Apply velocity with collision ----
  if (tank.vel.mag() > 0) {
    const desired = tank.pos.add(tank.vel.scale(dt));
    const clamped = clampToMapBounds(desired);

    const col = checkTileCollision(clamped, TANK_RADIUS, map);
    if (!col.hit) {
      tank.pos = clamped;
    } else {
      // Wall collision: zero out velocity component along normal, slide along wall
      const normal = col.normal;
      const velDotNormal = tank.vel.dot(normal);
      if (velDotNormal < 0) {
        // Reflect velocity off wall (damped)
        tank.vel = tank.vel.sub(normal.scale(velDotNormal * 1.2));
      }
      // Try sliding along wall
      const slidePos = tank.pos.add(tank.vel.scale(dt));
      const clampedSlide = clampToMapBounds(slidePos);
      const col2 = checkTileCollision(clampedSlide, TANK_RADIUS, map);
      if (!col2.hit) {
        tank.pos = clampedSlide;
      }
    }
  }

  // Heavy chassis crushes brick walls
  if (tank.config.chassis.stats.crushWalls) {
    crushNearbyWalls(tank, map);
  }
}

function crushNearbyWalls(tank: TankEntity, map: TileGrid): void {
  const gx = Math.floor(tank.pos.x / CELL_SIZE);
  const gy = Math.floor(tank.pos.y / CELL_SIZE);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (!inBounds(tx, ty)) continue;
      const tile = map[ty][tx];
      if (tile.type === TileType.BRICK && tile.hp > 0) {
        tile.hp = 0;
      }
    }
  }
}

// ============================================================
// Bullet movement with wall interaction
// ============================================================

export function moveBullet(
  bullet: BulletEntity,
  dt: number,
  map: TileGrid,
): { hitWall: boolean; hitTileX: number; hitTileY: number } {
  // ---- Arc bullet: apply gravity, track peak for damage bonus ----
  if (bullet.style === 'arc') {
    bullet.arcVy += ARC_GRAVITY * dt;
    if (!bullet.arcDescending && bullet.arcVy > 0) {
      bullet.arcDescending = true;
      bullet.damage = Math.round(bullet.damage * 2);
    }
  }

  // ---- Orbital: compute position from virtual center + rotated offset ----
  if (bullet.style === 'orbital') {
    const offset = Vec2.fromAngle(bullet.orbitalAngle, bullet.orbitalRadius);
    const actualOffset = bullet.orbitalIndex === 1 ? offset.scale(-1) : offset;
    bullet.pos = bullet.pos.add(actualOffset);
  }

  const moveAmount = bullet.vel.mag() * dt;
  const stepSize = CELL_SIZE / 4;
  const steps = Math.ceil(moveAmount / stepSize);
  if (steps === 0) return { hitWall: false, hitTileX: -1, hitTileY: -1 };
  const stepVec = bullet.vel.norm().scale(stepSize);

  for (let i = 0; i < steps; i++) {
    const nextPos = bullet.pos.add(stepVec);

    if (nextPos.x < 0 || nextPos.x > MAP_W || nextPos.y < 0 || nextPos.y > MAP_H) {
      bullet.alive = false;
      return { hitWall: true, hitTileX: -1, hitTileY: -1 };
    }

    const col = checkTileCollision(nextPos, BULLET_RADIUS, map);
    if (col.hit) {
      const gx = col.tileX;
      const gy = col.tileY;

      // Firework mother: wall = final burst
      if (bullet.style === 'firework') {
        bullet.alive = false;
        bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      // Arc bullets fly OVER brick walls
      if (bullet.style === 'arc' && col.tileType === TileType.BRICK) {
        bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      if (bullet.style === 'pierce' && col.tileType === TileType.BRICK && bullet.piercesLeft > 0) {
        bullet.piercesLeft--;
        map[gy][gx].hp = 0;
        bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      if (bullet.style === 'bounce' && bullet.bouncesLeft > 0) {
        bullet.bouncesLeft--;
        bullet.vel = bullet.vel.reflect(col.normal);
        bullet.pos = bullet.pos.add(col.normal.scale(CELL_SIZE / 4));
        bullet.damage = Math.round(bullet.damage * 0.8);
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      // Sniper (damage >= 500): destroys metal and keeps going
      if (bullet.damage >= 500 && col.tileType === TileType.METAL) {
        map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
        bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }
      if (col.tileType === TileType.BRICK) {
        map[gy][gx].hp = 0;
      }

      bullet.alive = false;
      bullet.pos = nextPos;
      return { hitWall: true, hitTileX: gx, hitTileY: gy };
    }

    bullet.pos = nextPos;
  }

  return { hitWall: false, hitTileX: -1, hitTileY: -1 };
}

// ============================================================
// Bullet vs Tank hit detection
// ============================================================

export function checkBulletTankHit(bullet: BulletEntity, tank: TankEntity): boolean {
  return bullet.pos.dist(tank.pos) < TANK_RADIUS + BULLET_RADIUS;
}

// ============================================================
// Utilities
// ============================================================

function clampToMapBounds(pos: Vec2): Vec2 {
  return new Vec2(
    Math.max(TANK_RADIUS, Math.min(MAP_W - TANK_RADIUS, pos.x)),
    Math.max(TANK_RADIUS, Math.min(MAP_H - TANK_RADIUS, pos.y)),
  );
}

/** Normalize angle to [-PI, PI] */
export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
