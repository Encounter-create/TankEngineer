import { Vec2, Dir, DIR4 } from '../utils/Vector';
import { inBounds, pixelToGrid } from '../utils/Grid';
import { TankEntity } from '../entities/Tank';
import { TileGrid } from '../entities/Map';
import { TileType } from '../utils/Grid';
import { Random } from '../utils/Random';

// ============================================================
// Enemy AI — patrol / chase / fire state machine
// ============================================================

export enum AIState {
  PATROL,   // Random wandering when player outside vision
  CHASE,    // Move toward player when in vision but out of fire range
  FIRE,     // Aim and shoot when player in fire range
}

export interface AIContext {
  tank: TankEntity;
  state: AIState;
  stateTimer: number;          // ms remaining in current patrol direction
  targetPos: Vec2;
  lastSeenPlayerPos: Vec2;
  fireCooldown: number;        // ms until next shot
  stuckTimer: number;
  lastPos: Vec2;
  patrolDir: Vec2;             // current patrol direction
  /** Vision radius — detects player within this range */
  visionRadius: number;
  /** Fire radius — starts shooting within this range */
  fireRadius: number;
}

const rand = new Random();

export function createAIContext(
  tank: TankEntity,
  targetPos: Vec2,
  visionRadius: number = 220,
  fireRadius: number = 150,
): AIContext {
  return {
    tank,
    state: AIState.PATROL,
    stateTimer: 2000 + Math.random() * 2000,
    targetPos,
    lastSeenPlayerPos: targetPos,
    fireCooldown: 500 + Math.random() * 1000,
    stuckTimer: 0,
    lastPos: tank.pos,
    patrolDir: rand.pick(DIR4),
    visionRadius,
    fireRadius,
  };
}

// ============================================================
// Main update
// ============================================================

export function updateAI(ctx: AIContext, playerPos: Vec2, map: TileGrid, dt: number): Vec2 {
  const tank = ctx.tank;

  // Stuck detection
  const moved = tank.pos.dist(ctx.lastPos);
  ctx.lastPos = tank.pos;
  ctx.stuckTimer = moved < 1 ? ctx.stuckTimer + dt * 1000 : 0;

  ctx.fireCooldown -= dt * 1000;
  ctx.stateTimer -= dt * 1000;

  const distToPlayer = tank.pos.dist(playerPos);

  // ---- State transitions ----
  if (distToPlayer <= ctx.fireRadius) {
    ctx.state = AIState.FIRE;
  } else if (distToPlayer <= ctx.visionRadius) {
    ctx.state = AIState.CHASE;
  } else {
    // Player outside vision → go back to patrol
    ctx.state = AIState.PATROL;
  }

  if (ctx.stuckTimer > 2000) {
    // Give up current direction, pick new one
    ctx.patrolDir = rand.pick(DIR4);
    ctx.stateTimer = 1000 + Math.random() * 1000;
    ctx.stuckTimer = 0;
  }

  // Update last seen position when in vision
  if (distToPlayer <= ctx.visionRadius) {
    ctx.lastSeenPlayerPos = playerPos;
  }

  // ---- Execute state ----
  switch (ctx.state) {
    case AIState.PATROL:
      return doPatrol(ctx, map);
    case AIState.CHASE:
      return doChase(ctx, playerPos, map);
    case AIState.FIRE:
      return doFire(ctx, playerPos, map);
    default:
      return Dir.NONE;
  }
}

// ============================================================
// Patrol — random wandering
// ============================================================

function doPatrol(ctx: AIContext, map: TileGrid): Vec2 {
  // Pick new random direction periodically
  if (ctx.stateTimer <= 0) {
    ctx.patrolDir = rand.pick(DIR4);
    ctx.stateTimer = 2000 + Math.random() * 3000;
  }

  const myGrid = pixelToGrid(ctx.tank.pos.x, ctx.tank.pos.y);
  const nx = myGrid.x + ctx.patrolDir.x;
  const ny = myGrid.y + ctx.patrolDir.y;

  if (inBounds(nx, ny)) {
    const tile = map[ny][nx];
    if (tile.type === TileType.EMPTY || (tile.type === TileType.BRICK && tile.hp <= 0)) return ctx.patrolDir;
    if (tile.type === TileType.BRICK && ctx.tank.config.chassis.stats.crushWalls) return ctx.patrolDir;
  }

  ctx.patrolDir = rand.pick(DIR4);
  ctx.stateTimer = 1000;
  return Dir.NONE;
}

// ============================================================
// Chase — move toward player
// ============================================================

function doChase(ctx: AIContext, playerPos: Vec2, map: TileGrid): Vec2 {
  const myGrid = pixelToGrid(ctx.tank.pos.x, ctx.tank.pos.y);
  const targetGrid = pixelToGrid(playerPos.x, playerPos.y);

  // Greedy pathfinding toward player
  const candidates = DIR4.map(dir => {
    const nx = myGrid.x + dir.x, ny = myGrid.y + dir.y;
    if (!inBounds(nx, ny)) return { dir, score: Infinity };
    const tile = map[ny][nx];
    if (tile.type === TileType.METAL) return { dir, score: Infinity };
    if (tile.type === TileType.BRICK && tile.hp > 0) {
      if (ctx.tank.config.chassis.stats.crushWalls) return { dir, score: Math.abs(nx - targetGrid.x) + Math.abs(ny - targetGrid.y) + 3 };
      return { dir, score: Infinity };
    }
    return { dir, score: Math.abs(nx - targetGrid.x) + Math.abs(ny - targetGrid.y) };
  });

  candidates.sort((a, b) => a.score - b.score);
  if (candidates[0].score === Infinity) return Dir.NONE;
  return candidates[0].dir;
}

// ============================================================
// Fire — aim and shoot
// ============================================================

function doFire(ctx: AIContext, playerPos: Vec2, map: TileGrid): Vec2 {
  // Face the player
  const toPlayer = playerPos.sub(ctx.tank.pos);
  ctx.tank.turretAngle = toPlayer.angle();

  // Strafe to maintain distance
  const dist = toPlayer.mag();
  if (dist < ctx.fireRadius * 0.5) {
    // Too close — back away
    const away = ctx.tank.pos.sub(playerPos).norm();
    return avoidWalls(away, ctx.tank.pos, map);
  }

  return Dir.NONE;
}

// ============================================================
// Helpers
// ============================================================

function avoidWalls(desiredDir: Vec2, pos: Vec2, map: TileGrid): Vec2 {
  const myGrid = pixelToGrid(pos.x, pos.y);
  const nx = myGrid.x + Math.round(desiredDir.x);
  const ny = myGrid.y + Math.round(desiredDir.y);
  if (inBounds(nx, ny)) {
    const tile = map[ny][nx];
    if (tile.type === TileType.EMPTY || (tile.type === TileType.BRICK && tile.hp <= 0)) return desiredDir;
  }
  return Dir.NONE;
}

/** Check if enemy can fire (used by Siege.ts) */
export function shouldFire(ctx: AIContext, playerPos: Vec2): boolean {
  if (ctx.fireCooldown > 0) return false;
  const dist = ctx.tank.pos.dist(playerPos);
  return dist <= ctx.fireRadius;
}

