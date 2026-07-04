import { Vec2 } from '../utils/Vector';

/** Persistent fire zone — damages anything inside over time */
export interface FireZone {
  pos: Vec2;
  radius: number;
  lifetime: number;    // seconds remaining
  maxLifetime: number;
  dps: number;         // damage per second to entities inside
  alive: boolean;
}

export function createFireZone(pos: Vec2, radius: number = 50, lifetime: number = 5, dps: number = 25): FireZone {
  return { pos, radius, lifetime, maxLifetime: lifetime, dps, alive: true };
}

export function updateFireZone(zone: FireZone, dt: number): void {
  zone.lifetime -= dt;
  if (zone.lifetime <= 0) zone.alive = false;
}
