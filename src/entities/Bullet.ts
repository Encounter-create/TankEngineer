import { Vec2 } from '../utils/Vector';
import { BulletStyle } from './Parts';

export interface BulletEntity {
  id: string;
  pos: Vec2;
  vel: Vec2;
  style: BulletStyle;       // straight | bounce | pierce
  damage: number;
  bouncesLeft: number;       // remaining bounces (bounce style)
  piercesLeft: number;       // remaining pierces (pierce style)
  ownerId: string;           // tank ID that fired
  isPlayerBullet: boolean;
  alive: boolean;
  /** Arc bullets have gravity; for MVP, we simplify arc to high-angle bounce trajectory */
  arcPeak: boolean;          // for future arc implementation
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
  return {
    id: `bullet_${++bulletIdCounter}`,
    pos,
    vel: Vec2.fromAngle(dir, speed),
    style,
    damage,
    bouncesLeft: bounces,
    piercesLeft: pierces,
    ownerId,
    isPlayerBullet,
    alive: true,
    arcPeak: false,
  };
}

export const BULLET_RADIUS = 3;
