import { Vec2 } from '../utils/Vector';
import { TankConfig, effectiveMaxHp } from './Parts';
import { TankEntity } from './Tank';

/** Friendly ally tank (clone, resurrected) */
export interface AllyTank extends TankEntity {
  /** AI: current behavior */
  aiMode: 'follow_player' | 'patrol_chase';
  followTarget: Vec2;
  fireCooldown: number;
}

export function createAllyTank(
  id: string, pos: Vec2, config: TankConfig, aiMode: 'follow_player' | 'patrol_chase',
): AllyTank {
  const maxHp = effectiveMaxHp(config);
  return {
    id, pos, vel: Vec2.zero(), dir: 0, turretAngle: 0,
    config, hp: maxHp, maxHp, cooldownRemaining: 0, alive: true, isPlayer: true,
    invulnUntil: 0, invulnCooldownUntil: 0, skillCooldownUntil: 0, skillActiveUntil: 0,
    aiMode, followTarget: pos, fireCooldown: 0,
  };
}

/** Placed turret — auto-attacks enemies */
export interface TurretEntity {
  id: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  fireRange: number;
  fireCooldown: number;
  alive: boolean;
  angle: number;
}

let turretId = 0;

export function createTurret(pos: Vec2): TurretEntity {
  return {
    id: `turret_${++turretId}`, pos,
    hp: 120, maxHp: 120,
    fireRange: 180, fireCooldown: 0,
    alive: true, angle: 0,
  };
}

/** Airstrike plane */
export interface Plane {
  x: number; y: number;
  alive: boolean;
  bombCooldown: number;
}

export function createPlanes(mapH: number): Plane[] {
  const midY = mapH / 2;
  return [
    { x: -20, y: midY - 40, alive: true, bombCooldown: 0.3 },
    { x: -40, y: midY, alive: true, bombCooldown: 0 },
    { x: -20, y: midY + 40, alive: true, bombCooldown: 0.3 },
  ];
}
