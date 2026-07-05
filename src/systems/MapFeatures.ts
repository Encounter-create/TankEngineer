// Water/grass/ice/barrel terrain interactions
import { TileType, pixelToGrid, inBounds } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity } from '../entities/Tank';
import { FireZone, createFireZone } from '../entities/FireZone';
import { Particle, spawnParticles } from '../entities/Particle';
import { Vec2 } from '../utils/Vector';

/** Apply water blocking + ice inertia + barrel contact for a tank */
export function applyTerrainEffects(
  tank: TankEntity, map: TileGrid,
  fireZones: FireZone[], particles: Particle[],
): void {
  const g = pixelToGrid(tank.pos.x, tank.pos.y);
  if (!g || !inBounds(g.x, g.y)) return;
  const tile = map[g.y]?.[g.x];
  if (!tile) return;

  if (tile.type === TileType.WATER) {
    // Push tank away from water
    tank.pos = tank.pos.add(tank.vel.scale(-0.5));
    tank.vel = Vec2.zero();
  }

  if (tile.type === TileType.ICE) {
    // Reduced friction: slow decay
    if (tank.vel.mag() > 2) {
      tank.vel = tank.vel.scale(1.01); // slight acceleration
    }
  }

  // Barrel: explode on contact
  if (tile.type === TileType.BARREL && tile.hp > 0) {
    tile.hp = 0;
    fireZones.push(createFireZone(tank.pos, 45, 2, 20));
    particles.push(...spawnParticles(tank.pos, 'explosion', 12, 120));
    tank.hp -= 20; // barrel hurts the tank
    if (tank.hp <= 0) tank.alive = false;
  }
}

/** Bullet hits barrel → explode */
export function checkMapFeatureBullet(
  bulletPos: Vec2, map: TileGrid,
  fireZones: FireZone[], particles: Particle[],
): void {
  const g = pixelToGrid(bulletPos.x, bulletPos.y);
  if (!g || !inBounds(g.x, g.y)) return;
  const tile = map[g.y]?.[g.x];
  if (!tile) return;

  if (tile.type === TileType.BARREL && tile.hp > 0) {
    tile.hp = 0;
    fireZones.push(createFireZone(bulletPos, 45, 2, 20));
    particles.push(...spawnParticles(bulletPos, 'explosion', 12, 120));
  }
}
