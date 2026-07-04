import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, TileType, inBounds, MAP_W, MAP_H } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity, TANK_RADIUS } from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS } from '../entities/Bullet';

// ============================================================
// Collision helpers
// ============================================================

export interface CollisionResult {
  hit: boolean;
  normal: Vec2;      // surface normal of the hit
  tileX: number;      // grid cell that was hit
  tileY: number;
  tileType: TileType;
}

/** Check if a circle at `pos` with `radius` collides with any solid tile */
export function checkTileCollision(
  pos: Vec2,
  radius: number,
  map: TileGrid,
): CollisionResult {
  // Check surrounding 3x3 grid cells
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

      // AABB vs circle collision
      const tileLeft = tx * CELL_SIZE;
      const tileTop = ty * CELL_SIZE;
      const tileRight = tileLeft + CELL_SIZE;
      const tileBottom = tileTop + CELL_SIZE;

      // Closest point on AABB to circle center
      const closestX = Math.max(tileLeft, Math.min(pos.x, tileRight));
      const closestY = Math.max(tileTop, Math.min(pos.y, tileBottom));
      const distX = pos.x - closestX;
      const distY = pos.y - closestY;
      const distSq = distX * distX + distY * distY;

      if (distSq < radius * radius) {
        // Compute collision normal (from closest point to circle center)
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
// Tank movement with collision resolution
// ============================================================

export function moveTank(
  tank: TankEntity,
  moveDir: Vec2,
  speed: number,
  dt: number,
  map: TileGrid,
): void {
  if (moveDir.x === 0 && moveDir.y === 0) {
    // Apply inertia slide if chassis has it
    if (tank.slideSpeed > 0) {
      const slideAmount = tank.slideSpeed * dt;
      const newPos = tank.pos.add(tank.slideDir.scale(slideAmount));
      const clamped = clampToMapBounds(newPos);
      const col = checkTileCollision(clamped, TANK_RADIUS, map);
      if (!col.hit) {
        tank.pos = clamped;
      }
      // Decay slide
      tank.slideSpeed *= Math.pow(0.3, dt); // friction
      if (tank.slideSpeed < 5) {
        tank.slideSpeed = 0;
        tank.slideDir = Vec2.zero();
      }
    }
    return;
  }

  // Update facing direction
  tank.dir = moveDir.angle();

  // Move with collision
  const moveAmount = speed * dt;
  const desired = tank.pos.add(moveDir.scale(moveAmount));
  const clamped = clampToMapBounds(desired);

  const col = checkTileCollision(clamped, TANK_RADIUS, map);
  if (!col.hit) {
    tank.pos = clamped;
  } else {
    // Try sliding along wall (separate X and Y movement)
    const moveX = tank.pos.add(new Vec2(moveDir.x * moveAmount, 0));
    const colX = checkTileCollision(moveX, TANK_RADIUS, map);
    if (!colX.hit && Math.abs(moveDir.x) > 0.1) {
      tank.pos = moveX;
    }

    const moveY = tank.pos.add(new Vec2(0, moveDir.y * moveAmount));
    const colY = checkTileCollision(moveY, TANK_RADIUS, map);
    if (!colY.hit && Math.abs(moveDir.y) > 0.1) {
      tank.pos = moveY;
    }
  }

  // Heavy chassis crushes brick walls
  if (tank.config.chassis.stats.crushWalls) {
    crushNearbyWalls(tank, map);
  }

  // Store slide state if this chassis has inertia
  const inertia = tank.config.chassis.stats.inertia ?? 0;
  if (inertia > 0) {
    tank.slideDir = moveDir;
    tank.slideSpeed = speed * 0.8; // initial slide speed
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
  const moveAmount = bullet.vel.mag() * dt;
  const stepSize = CELL_SIZE / 4; // sub-step for accurate collision
  const steps = Math.ceil(moveAmount / stepSize);
  const stepVec = bullet.vel.norm().scale(stepSize);

  for (let i = 0; i < steps; i++) {
    const nextPos = bullet.pos.add(stepVec);

    // Check map bounds
    if (nextPos.x < 0 || nextPos.x > MAP_W || nextPos.y < 0 || nextPos.y > MAP_H) {
      bullet.alive = false;
      return { hitWall: true, hitTileX: -1, hitTileY: -1 };
    }

    const col = checkTileCollision(nextPos, BULLET_RADIUS, map);
    if (col.hit) {
      const gx = col.tileX;
      const gy = col.tileY;

      // Handle based on bullet style and tile type
      if (bullet.style === 'pierce' && col.tileType === TileType.BRICK && bullet.piercesLeft > 0) {
        // Pierce through brick wall
        bullet.piercesLeft--;
        map[gy][gx].hp = 0; // destroy brick
        bullet.pos = nextPos;
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      if (bullet.style === 'bounce' && bullet.bouncesLeft > 0) {
        // Reflect off wall
        bullet.bouncesLeft--;
        bullet.vel = bullet.vel.reflect(col.normal);
        // Push bullet outside wall
        bullet.pos = bullet.pos.add(col.normal.scale(CELL_SIZE / 4));
        // Reduce damage on bounce
        bullet.damage = Math.round(bullet.damage * 0.8);
        return { hitWall: true, hitTileX: gx, hitTileY: gy };
      }

      // Destroy brick walls on hit
      if (col.tileType === TileType.BRICK) {
        map[gy][gx].hp = 0;
      }

      // Bullet dies
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

function clampToMapBounds(pos: Vec2): Vec2 {
  return new Vec2(
    Math.max(TANK_RADIUS, Math.min(MAP_W - TANK_RADIUS, pos.x)),
    Math.max(TANK_RADIUS, Math.min(MAP_H - TANK_RADIUS, pos.y)),
  );
}
