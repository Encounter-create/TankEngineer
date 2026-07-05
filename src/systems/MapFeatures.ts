// Terrain interactions: water, grass, ice, barrel
import { TileType, pixelToGrid, inBounds } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity } from '../entities/Tank';
import { FireZone, createFireZone } from '../entities/FireZone';
import { Particle, spawnParticles } from '../entities/Particle';
import { Vec2 } from '../utils/Vector';

/** Apply terrain effects for a tank (water stop, ice slide, grass ignored by AI elsewhere) */
export function applyTerrainEffects(
  tank: TankEntity, map: TileGrid,
): void {
  const g = pixelToGrid(tank.pos.x, tank.pos.y);
  if (!g || !inBounds(g.x, g.y)) return;
  const tile = map[g.y]?.[g.x];
  if (!tile) return;

  if (tile.type === TileType.WATER) {
    // Water: push tank back to previous position + stop velocity
    tank.vel = Vec2.zero();
    // Find nearest non-water cell and push toward it
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = g.x + dx, ny = g.y + dy;
        if (!inBounds(nx, ny)) continue;
        if (map[ny][nx].type !== TileType.WATER) {
          tank.pos = tank.pos.add(new Vec2(dx * 8, dy * 8));
          return;
        }
      }
    }
  }

  if (tile.type === TileType.ICE) {
    // Ice: no friction, slide continuously in locked direction
    if (tank.vel.mag() < 2) {
      tank.vel = Vec2.zero();
    } else {
      // Lock direction and maintain speed (even slightly accelerate)
      tank.vel = Vec2.fromAngle(tank.dir, tank.vel.mag() * 1.005);
      tank.dir = Math.atan2(tank.vel.y, tank.vel.x);
    }
  }
}

/** Check if a tank is standing in grass → hidden from enemy AI */
export function isTankInGrass(tank: TankEntity, map: TileGrid): boolean {
  const g = pixelToGrid(tank.pos.x, tank.pos.y);
  if (!g || !inBounds(g.x, g.y)) return false;
  return map[g.y]?.[g.x]?.type === TileType.GRASS;
}

/** Check if barrel was hit by a bullet (blow it up) */
export function checkBarrelBullet(
  gx: number, gy: number, map: TileGrid,
  fireZones: FireZone[], particles: Particle[],
): void {
  if (!inBounds(gx, gy)) return;
  const tile = map[gy][gx];
  if (tile.type === TileType.BARREL && tile.hp > 0) {
    tile.hp = 0; // destroyed
    tile.type = TileType.EMPTY; // disappear
    fireZones.push(createFireZone(
      new Vec2(gx * 32 + 16, gy * 32 + 16), 50, 3, 25,
    ));
    particles.push(...spawnParticles(
      new Vec2(gx * 32 + 16, gy * 32 + 16), 'explosion', 15, 130,
    ));
  }
}
