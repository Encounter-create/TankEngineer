import { Vec2, Dir, DIR4 } from '../utils/Vector';
import { CELL_SIZE, inBounds, pixelToGrid, manhattan } from '../utils/Grid';
import { TankEntity } from '../entities/Tank';
import { TileGrid } from '../entities/Map';
import { TileType } from '../utils/Grid';
import { Random } from '../utils/Random';

/** Behavior state for enemy tanks */
export enum AIState {
  MOVING_TO_TARGET,   // Path toward command center or player
  AIMING,             // Lined up, about to fire
  EVADING,            // Dodging after being hit
  STUCK,              // Try to wiggle free
}

export interface AIContext {
  tank: TankEntity;
  state: AIState;
  stateTimer: number;        // ms remaining in current state
  targetPos: Vec2;           // where it's trying to go
  lastSeenPlayerPos: Vec2;   // last known player position
  fireCooldown: number;      // ms until next fire check
  stuckTimer: number;        // how long stuck
  lastPos: Vec2;             // for stuck detection
}

export function createAIContext(tank: TankEntity, targetPos: Vec2): AIContext {
  return {
    tank,
    state: AIState.MOVING_TO_TARGET,
    stateTimer: 0,
    targetPos,
    lastSeenPlayerPos: targetPos,
    fireCooldown: 500 + Math.random() * 1000,
    stuckTimer: 0,
    lastPos: tank.pos,
  };
}

const rand = new Random();

/** Update AI decision-making. Returns the desired move direction. */
export function updateAI(ctx: AIContext, playerPos: Vec2, map: TileGrid, dt: number): Vec2 {
  const tank = ctx.tank;
  ctx.lastSeenPlayerPos = playerPos;

  // Update stuck detection
  const moved = tank.pos.dist(ctx.lastPos);
  ctx.lastPos = tank.pos;
  if (moved < 0.5) {
    ctx.stuckTimer += dt * 1000;
  } else {
    ctx.stuckTimer = 0;
  }

  ctx.fireCooldown -= dt * 1000;
  ctx.stateTimer -= dt * 1000;

  // State transitions
  if (ctx.stuckTimer > 1000) {
    ctx.state = AIState.STUCK;
    ctx.stateTimer = 500;
    ctx.stuckTimer = 0;
  }

  switch (ctx.state) {
    case AIState.MOVING_TO_TARGET:
      return moveToward(ctx, playerPos, map);
    case AIState.AIMING:
      return aimAndFire(ctx, playerPos, map);
    case AIState.EVADING:
      return evade(ctx, map, dt);
    case AIState.STUCK:
      return wiggle(ctx, map);
    default:
      return Dir.NONE;
  }
}

function moveToward(ctx: AIContext, playerPos: Vec2, map: TileGrid): Vec2 {
  // If we have line of sight to target, switch to aiming
  if (hasLineOfSight(ctx.tank.pos, playerPos, map)) {
    ctx.state = AIState.AIMING;
    ctx.stateTimer = 1500;
    return Dir.NONE;
  }

  // Simple greedy pathfinding toward target
  const myGrid = pixelToGrid(ctx.tank.pos.x, ctx.tank.pos.y);
  const targetGrid = pixelToGrid(playerPos.x, playerPos.y);

  // Try all 4 directions, pick the one that reduces manhattan distance
  // and is passable
  const candidates = DIR4.map(dir => {
    const nx = myGrid.x + dir.x;
    const ny = myGrid.y + dir.y;
    if (!inBounds(nx, ny)) return { dir, score: Infinity };
    const tile = map[ny][nx];
    if (tile.type !== TileType.EMPTY && tile.type !== TileType.BRICK) {
      return { dir, score: Infinity };
    }
    if (tile.type === TileType.BRICK && ctx.tank.config.chassis.stats.crushWalls) {
      // Heavy tank can crush, still prefer not to
      return { dir, score: manhattan(new Vec2(nx, ny), targetGrid) + 2 };
    }
    return { dir, score: manhattan(new Vec2(nx, ny), targetGrid) };
  });

  // Sort by score, pick best
  candidates.sort((a, b) => a.score - b.score);

  // Add some randomness: if best score isn't much better than second, randomly pick
  const bestScore = candidates[0].score;
  const goodOptions = candidates.filter(c => c.score <= bestScore + 2);

  return rand.pick(goodOptions).dir;
}

function aimAndFire(ctx: AIContext, playerPos: Vec2, _map: TileGrid): Vec2 {
  // Face the player
  const toPlayer = playerPos.sub(ctx.tank.pos);
  ctx.tank.dir = toPlayer.angle();

  // Fire if cooldown allows and we have line of sight
  if (ctx.fireCooldown <= 0 && hasLineOfSight(ctx.tank.pos, playerPos, _map)) {
    ctx.fireCooldown = ctx.tank.config.barrel.stats.cooldownMs ?? 1000;
    ctx.state = AIState.MOVING_TO_TARGET; // cycle after shooting
    return Dir.NONE; // signal to fire — handled in Siege mode
  }

  // Strafe slightly to keep distance
  const dist = ctx.tank.pos.dist(playerPos);
  if (dist < 5 * CELL_SIZE) {
    // Too close, back away
    const away = ctx.tank.pos.sub(playerPos).norm();
    return avoidWalls(away, ctx.tank.pos, _map);
  }

  if (ctx.stateTimer <= 0) {
    ctx.state = AIState.MOVING_TO_TARGET;
  }

  return Dir.NONE;
}

function evade(ctx: AIContext, map: TileGrid, _dt: number): Vec2 {
  // Move perpendicular to line toward player
  const toPlayer = ctx.tank.pos.sub(ctx.lastSeenPlayerPos);
  const perp = new Vec2(-toPlayer.y, toPlayer.x).norm();
  const result = avoidWalls(perp, ctx.tank.pos, map);

  if (ctx.stateTimer <= 0) {
    ctx.state = AIState.MOVING_TO_TARGET;
  }
  return result;
}

function wiggle(ctx: AIContext, _map: TileGrid): Vec2 {
  const dirs = [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT];
  const choice = rand.pick(dirs);

  if (ctx.stateTimer <= 0) {
    ctx.state = AIState.MOVING_TO_TARGET;
  }
  return choice;
}

/** Check if there's an unobstructed line between two points */
function hasLineOfSight(from: Vec2, to: Vec2, map: TileGrid): boolean {
  const dir = to.sub(from);
  const dist = dir.mag();
  const step = dir.norm().scale(CELL_SIZE / 2);
  const steps = Math.ceil(dist / (CELL_SIZE / 2));
  let pos = from;

  for (let i = 0; i < steps; i++) {
    pos = pos.add(step);
    const gx = Math.floor(pos.x / CELL_SIZE);
    const gy = Math.floor(pos.y / CELL_SIZE);
    if (!inBounds(gx, gy)) return false;
    const tile = map[gy][gx];
    if (tile.type === TileType.METAL || (tile.type === TileType.BRICK && tile.hp > 0)) {
      return false;
    }
  }
  return true;
}

function avoidWalls(desiredDir: Vec2, pos: Vec2, map: TileGrid): Vec2 {
  // Try desired direction; if blocked, try adjacent
  const myGrid = pixelToGrid(pos.x, pos.y);
  const nx = myGrid.x + Math.round(desiredDir.x);
  const ny = myGrid.y + Math.round(desiredDir.y);

  if (inBounds(nx, ny)) {
    const tile = map[ny][nx];
    if (tile.type === TileType.EMPTY || (tile.type === TileType.BRICK && tile.hp <= 0)) {
      return desiredDir;
    }
  }

  // Try clockwise rotation
  const rotCW = new Vec2(-desiredDir.y, desiredDir.x);
  const nxCw = myGrid.x + Math.round(rotCW.x);
  const nyCw = myGrid.y + Math.round(rotCW.y);
  if (inBounds(nxCw, nyCw)) {
    const tile = map[nyCw][nxCw];
    if (tile.type === TileType.EMPTY || (tile.type === TileType.BRICK && tile.hp <= 0)) {
      return rotCW;
    }
  }

  // Try counter-clockwise
  const rotCCW = new Vec2(desiredDir.y, -desiredDir.x);
  const nxCCW = myGrid.x + Math.round(rotCCW.x);
  const nyCCW = myGrid.y + Math.round(rotCCW.y);
  if (inBounds(nxCCW, nyCCW)) {
    const tile = map[nyCCW][nxCCW];
    if (tile.type === TileType.EMPTY || (tile.type === TileType.BRICK && tile.hp <= 0)) {
      return rotCCW;
    }
  }

  return Dir.NONE; // completely boxed in
}
