import { Vec2 } from '../utils/Vector';
import { TankConfig, effectiveMaxHp } from './Parts';
import { TankEntity } from './Tank';

/** Ninja clone AI states */
export type AllyAIState = 'follow' | 'scout' | 'fire';

/** Friendly ally tank (clone, resurrected) */
export interface AllyTank extends TankEntity {
  /** AI state for ninja clones */
  aiState: AllyAIState;
  /** Original behavior mode */
  aiMode: 'follow_player' | 'patrol_chase';
  followTarget: Vec2;
  fireCooldown: number;
  /** Ninja: follow radius (inner circle) */
  followRadius: number;
  /** Ninja: vision/fire radius (outer circle) */
  visionRadius: number;
}

export function createAllyTank(
  id: string, pos: Vec2, config: TankConfig, aiMode: 'follow_player' | 'patrol_chase',
): AllyTank {
  const maxHp = effectiveMaxHp(config);
  return {
    id, pos, vel: Vec2.zero(), dir: 0, turretAngle: 0,
    config, hp: maxHp, maxHp, cooldownRemaining: 0, alive: true, isPlayer: true,
    invulnUntil: 0, invulnCooldownUntil: 0, skillCooldownUntil: 0, skillActiveUntil: 0,
    aiState: 'scout', aiMode, followTarget: pos, fireCooldown: 0,
    followRadius: 100, visionRadius: 200,
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
  velX: number; velY: number;
  alive: boolean;
  bombCooldown: number;
}

export function createPlanes(origin: Vec2, flightDir: number, mapW: number, mapH: number): Plane[] {
  const perpDir = flightDir + Math.PI / 2;
  const spacing = 40;
  const trailDist = 50; // wingmen trail behind leader
  const speed = 250;
  const vx = Math.cos(flightDir) * speed;
  const vy = Math.sin(flightDir) * speed;

  // Leader (center, ahead)
  const leadX = origin.x - Math.cos(flightDir) * (mapW + 40);
  const leadY = origin.y - Math.sin(flightDir) * (mapH + 40);

  // Left wingman (trails behind leader, offset perpendicular)
  const leftX = leadX - Math.cos(flightDir) * trailDist + Math.cos(perpDir) * spacing;
  const leftY = leadY - Math.sin(flightDir) * trailDist + Math.sin(perpDir) * spacing;

  // Right wingman (trails behind leader, offset perpendicular)
  const rightX = leadX - Math.cos(flightDir) * trailDist - Math.cos(perpDir) * spacing;
  const rightY = leadY - Math.sin(flightDir) * trailDist - Math.sin(perpDir) * spacing;

  return [
    { x: leftX, y: leftY, velX: vx, velY: vy, alive: true, bombCooldown: 0.3 },
    { x: leadX, y: leadY, velX: vx, velY: vy, alive: true, bombCooldown: 0 },
    { x: rightX, y: rightY, velX: vx, velY: vy, alive: true, bombCooldown: 0.3 },
  ];
}
