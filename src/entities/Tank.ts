import { Vec2 } from '../utils/Vector';
import { CELL_SIZE } from '../utils/Grid';
import { TankConfig, effectiveMaxHp } from './Parts';

/** Runtime tank entity on the battlefield */
export interface TankEntity {
  id: string;
  pos: Vec2;
  /** Current velocity vector (px/s) — used for acceleration-based movement */
  vel: Vec2;
  /** Body facing angle in radians (changes gradually with angular velocity) */
  dir: number;
  /** Turret facing angle — independent from body. Player: follows mouse; enemy: follows target */
  turretAngle: number;
  config: TankConfig;
  hp: number;
  maxHp: number;
  cooldownRemaining: number; // ms until can fire again
  alive: boolean;
  isPlayer: boolean;
}

export function createTank(
  id: string,
  pos: Vec2,
  config: TankConfig,
  isPlayer: boolean,
): TankEntity {
  const maxHp = effectiveMaxHp(config);
  return {
    id,
    pos,
    vel: Vec2.zero(),
    dir: isPlayer ? 0 : Math.PI,
    turretAngle: isPlayer ? 0 : Math.PI,
    config,
    hp: maxHp,
    maxHp,
    cooldownRemaining: 0,
    alive: true,
    isPlayer,
  };
}

export function takeDamage(tank: TankEntity, rawDamage: number): number {
  const actual = Math.round(rawDamage * (tank.config.turret.stats.defenseRatio ?? 1.0));
  tank.hp = Math.max(0, tank.hp - actual);
  if (tank.hp <= 0) {
    tank.alive = false;
  }
  return actual;
}

/** Tank radius in pixels for collision */
export const TANK_RADIUS = CELL_SIZE / 2 - 2; // 14px, fits inside a cell

// ============================================================
// Physics constants
// ============================================================

/** Base acceleration rate (fraction of max speed per second) */
export const ACCEL_RATE = 4.0; // reaches max in ~0.25s
/** Friction factor per second when no input (1.0 = instant stop, 0.0 = no friction) */
export const FRICTION = 3.0;
/** Max angular velocity in rad/s */
export const MAX_ANGULAR_VEL = Math.PI * 3; // ~540°/s
/** Angular acceleration in rad/s² */
export const ANGULAR_ACCEL = MAX_ANGULAR_VEL * 4;
/** Angular friction (for body; turret snaps instantly) */
export const ANGULAR_FRICTION = MAX_ANGULAR_VEL * 5;
/** Minimum speed to stop completely (below this = zero) */
export const MIN_SPEED = 5;
