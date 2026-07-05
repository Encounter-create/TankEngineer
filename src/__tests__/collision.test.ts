// Collision physics unit tests (console.assert based, no test framework)
import { Vec2 } from '../utils/Vector';
import { elasticBounce, bodyRef } from '../core/Physics';
import { createTank, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { createPhysicsBlock, BRICK_MASS } from '../entities/PhysicsBlock';
import { TileType } from '../utils/Grid';
import { createBullet } from '../entities/Bullet';
import { assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS } from '../entities/Parts';

function assert(cond: boolean, msg: string) {
  if (!cond) console.error('❌ FAIL:', msg);
  else console.log('✅ PASS:', msg);
}

// ---- Test elasticBounce formula ----

const b1 = createTank('t1', new Vec2(100, 200), assembleTank(MVP_BARRELS[0], MVP_TURRETS[0], MVP_CHASSIS[0]), true);
const b2 = createTank('t2', new Vec2(140, 200), assembleTank(MVP_BARRELS[0], MVP_TURRETS[0], MVP_CHASSIS[0]), false);
b1.vel = new Vec2(50, 0); b2.vel = new Vec2(0, 0);
const ra = bodyRef(b1.pos, b1.vel), rb = bodyRef(b2.pos, b2.vel);
elasticBounce(ra, b1.config.totalWeight, TANK_RADIUS, rb, b2.config.totalWeight, TANK_RADIUS);
b1.pos = ra.pos; b1.vel = ra.vel; b2.pos = rb.pos; b2.vel = rb.vel;
// Equal mass: v1'=0, v2'=50 (perfect transfer)
assert(Math.abs(b1.vel.mag()) < 1, `Equal mass elastic: A should stop, got ${b1.vel.mag().toFixed(1)}`);
assert(Math.abs(b2.vel.mag() - 50) < 1, `Equal mass elastic: B should get 50, got ${b2.vel.mag().toFixed(1)}`);

// ---- Test bullet mass = damage × 0.01 ----
const bullet = createBullet(new Vec2(0, 0), 0, 'straight', 400, 35, 2, 0, 'test', true);
assert(Math.abs(bullet.mass - 0.35) < 0.01, `Bullet mass: 35×0.01=0.35, got ${bullet.mass}`);

const sniperBullet = createBullet(new Vec2(0, 0), 0, 'straight', 800, 999, 2, 0, 'test', true);
assert(Math.abs(sniperBullet.mass - 9.99) < 0.01, `Sniper mass: 999×0.01=9.99, got ${sniperBullet.mass}`);

// ---- Test brick HP from tile creation ----
const block = createPhysicsBlock(new Vec2(0, 0), new Vec2(0, 0), TileType.BRICK);
assert(block.mass === BRICK_MASS, `Brick mass: should be ${BRICK_MASS}, got ${block.mass}`);

// ---- Test takeDamage ----
const tank = createTank('test', new Vec2(0, 0), assembleTank(MVP_BARRELS[0], MVP_TURRETS[0], MVP_CHASSIS[0]), true);
tank.isPlayer = false; // disable debug invulnerability
const hp0 = tank.hp;
const actual = takeDamage(tank, 35);
assert(tank.hp === hp0 - 35, `Damage: 35dmg should leave ${hp0-35}HP, got ${tank.hp}HP`);
assert(actual === 35, `Damage return: should be 35, got ${actual}`);

console.log('\n🧪 Collision test complete.');
