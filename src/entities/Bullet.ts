import { Vec2 } from '../utils/Vector';
import { BulletStyle } from './Parts';

export interface BulletEntity {
  id: string;
  pos: Vec2;
  vel: Vec2;
  style: BulletStyle;
  damage: number;
  bouncesLeft: number;
  piercesLeft: number;
  ownerId: string;
  isPlayerBullet: boolean;
  alive: boolean;
  /** Arc only: vertical velocity component for parabolic motion */
  arcVy: number;
  /** Arc only: true after the bullet has passed its peak */
  arcDescending: boolean;
  /** Firework only: time until next child spawn (seconds) */
  fireworkTimer: number;
  /** Firework only: total lifetime for self-destruct (seconds) */
  fireworkLife: number;
  /** Orbital only: current orbit angle in radians */
  orbitalAngle: number;
  /** Orbital only: orbit radius */
  orbitalRadius: number;
  /** Orbital only: which one of the pair (0 or 1, offset by PI) */
  orbitalIndex: number;
  /** Orbital only: virtual center position (moves forward, bullets orbit around it) */
  orbitalCenter: Vec2;
}

let bulletIdCounter = 0;

export function createBullet(
  pos: Vec2,
  dir: number,
  style: BulletStyle,
  speed: number,
  damage: number,
  bounces: number,
  pierces: number,
  ownerId: string,
  isPlayerBullet: boolean,
  /** For orbital: index in pair (0 or 1) */
  orbitalIndex?: number,
  /** For orbital: orbit radius */
  orbitalRadius?: number,
): BulletEntity {
  let vel = Vec2.fromAngle(dir, speed);
  if (style === 'arc') vel = vel.scale(0.7);
  // Firework: slower mother bullet (already 100 speed in config)
  if (style === 'firework') vel = vel.scale(0.5);

  return {
    id: `bullet_${++bulletIdCounter}`,
    pos,
    vel,
    style,
    damage,
    bouncesLeft: bounces,
    piercesLeft: pierces,
    ownerId,
    isPlayerBullet,
    alive: true,
    arcVy: style === 'arc' ? -speed * 0.5 : 0,
    arcDescending: false,
    fireworkTimer: style === 'firework' ? 0.25 : 0,
    fireworkLife: style === 'firework' ? 0 : 0,
    orbitalAngle: style === 'orbital' ? (orbitalIndex ?? 0) * Math.PI : 0,
    orbitalRadius: orbitalRadius ?? 16,
    orbitalIndex: orbitalIndex ?? 0,
    orbitalCenter: pos,
  };
}

export const BULLET_RADIUS = 3;
export const ARC_GRAVITY = 600;
/** Firework: interval between child spawns */
export const FIREWORK_INTERVAL = 0.28;
/** Firework: child bullet count per burst (uniformly spaced) */
export const FIREWORK_CHILD_COUNT = 6;
/** Firework: mother bullet max lifetime */
export const FIREWORK_MAX_LIFE = 2.0;
