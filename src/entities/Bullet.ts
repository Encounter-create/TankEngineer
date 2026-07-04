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
): BulletEntity {
  const vel = Vec2.fromAngle(dir, speed);
  return {
    id: `bullet_${++bulletIdCounter}`,
    pos,
    vel: style === 'arc' ? vel.scale(0.7) : vel, // arc: 70% horizontal, 30% as vertical
    style,
    damage,
    bouncesLeft: bounces,
    piercesLeft: pierces,
    ownerId,
    isPlayerBullet,
    alive: true,
    arcVy: style === 'arc' ? -speed * 0.5 : 0,  // initial upward velocity
    arcDescending: false,
  };
}

export const BULLET_RADIUS = 3;
/** Arc gravity constant (px/s²) */
export const ARC_GRAVITY = 600;
