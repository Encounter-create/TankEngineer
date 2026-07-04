import { Vec2 } from '../utils/Vector';
import { CELL_SIZE } from '../utils/Grid';
import { TankConfig, effectiveMaxHp } from './Parts';

/** Runtime tank entity on the battlefield */
export interface TankEntity {
  id: string;
  pos: Vec2;
  dir: number;          // facing angle in radians
  config: TankConfig;
  hp: number;
  maxHp: number;
  cooldownRemaining: number; // ms until can fire again
  alive: boolean;
  isPlayer: boolean;
  // Inertia sliding state
  slideDir: Vec2;
  slideSpeed: number;
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
    dir: isPlayer ? 0 : Math.PI, // player faces right, enemy faces left
    config,
    hp: maxHp,
    maxHp,
    cooldownRemaining: 0,
    alive: true,
    isPlayer,
    slideDir: Vec2.zero(),
    slideSpeed: 0,
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
