import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, TileType } from '../utils/Grid';

/** A tile pushed out of the grid, now a free physics object */
export interface PhysicsBlock {
  id: string;
  pos: Vec2;
  vel: Vec2;
  mass: number;        // 5 = brick, 8 = metal
  radius: number;      // collision radius (~CELL_SIZE/2)
  tileType: TileType;  // BRICK or METAL
  alive: boolean;
}

let blockId = 0;

export const BRICK_MASS = 5;
export const METAL_MASS = 8;
export const BLOCK_RADIUS = CELL_SIZE / 2 - 2; // same as tank
export const GROUND_FRICTION = 2.5; // per-second friction factor

export function createPhysicsBlock(
  pos: Vec2, vel: Vec2, tileType: TileType,
): PhysicsBlock {
  return {
    id: `block_${++blockId}`,
    pos, vel,
    mass: tileType === TileType.METAL ? METAL_MASS : BRICK_MASS,
    radius: BLOCK_RADIUS,
    tileType,
    alive: true,
  };
}

export function updatePhysicsBlock(block: PhysicsBlock, dt: number): void {
  if (!block.alive) return;
  // Apply friction
  const speed = block.vel.mag();
  if (speed > 0) {
    const friction = GROUND_FRICTION * dt;
    const newSpeed = Math.max(0, speed - friction * 60); // friction deceleration
    if (newSpeed < 2) {
      block.vel = Vec2.zero();
    } else {
      block.vel = block.vel.norm().scale(newSpeed);
    }
  }
}
