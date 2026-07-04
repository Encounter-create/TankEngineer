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
  const spacing = 45;
  // Start position: behind the player (opposite to flight direction)
  const startX = origin.x - Math.cos(flightDir) * (mapW + 40);
  const startY = origin.y - Math.sin(flightDir) * (mapH + 40);
  const speed = 250;
  return [
    { x: startX + Math.cos(perpDir) * spacing, y: startY + Math.sin(perpDir) * spacing, velX: Math.cos(flightDir) * speed, velY: Math.sin(flightDir) * speed, alive: true, bombCooldown: 0.3 },
    { x: startX, y: startY, velX: Math.cos(flightDir) * speed, velY: Math.sin(flightDir) * speed, alive: true, bombCooldown: 0 },
    { x: startX - Math.cos(perpDir) * spacing, y: startY - Math.sin(perpDir) * spacing, velX: Math.cos(flightDir) * speed, velY: Math.sin(flightDir) * speed, alive: true, bombCooldown: 0.3 },
  ];
}
