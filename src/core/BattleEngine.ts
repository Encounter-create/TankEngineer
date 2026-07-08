// BattleEngine — shared update pipeline for all game modes
import { Input } from './Input';
import { Vec2 } from '../utils/Vector';
import { takeDamage, TANK_RADIUS } from '../entities/Tank';
import { BULLET_RADIUS } from '../entities/Bullet';
import { BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { resolveTankCollisions } from './Physics';
import { updateParticles, spawnParticles } from '../entities/Particle';
import { updateDamageNumbers } from '../entities/DamageNumber';

// All shared handlers are imported from Siege.ts (circular dependency avoided via lazy function passing)
export function updateBattle(
  state: any, input: Input, dt: number,
  handlers: {
    playerInput: (s: any, i: Input, d: number) => void;
    playerFire: (s: any, i: Input, d: number) => void;
    terrain: (t: any, m: any) => void;
    enemyAI: (s: any, d: number) => void;
    allies: (s: any, d: number) => void;
    turrets: (s: any, d: number) => void;
    planes: (s: any, d: number) => void;
    clones: (s: any, d: number) => void;
    physics: (s: any, d: number) => void;
    bullets: (s: any, d: number, skipCC?: boolean) => void;
    bulletTank: (s: any, d: number) => void;
    skills: ((s: any, d: number) => void)[];
    skipCC?: boolean;
  },
): void {
  const s = state;

  // Screen shake decay
  s.screenShake = Math.max(0, s.screenShake - dt * 50);

  // Player
  handlers.playerInput(s, input, dt);
  handlers.playerFire(s, input, dt);

  // Terrain
  handlers.terrain(s.player, s.map);
  for (const e of s.enemies) handlers.terrain(e, s.map);

  // AI + Entities
  handlers.enemyAI(s, dt);
  handlers.allies(s, dt);
  handlers.turrets(s, dt);
  handlers.planes(s, dt);
  handlers.clones(s, dt);

  // Turret collision
  const tr = 14;
  for (const t of s.turrets) {
    if (!t.alive) continue;
    for (const tk of [s.player, ...s.enemies, ...s.allies]) {
      if (!tk.alive) continue;
      const d = tk.pos.sub(t.pos); const dist = d.mag();
      if (dist < tr + TANK_RADIUS) tk.pos = tk.pos.add(d.norm().scale(tr + TANK_RADIUS - dist + 1));
    }
    for (const b of s.bullets) {
      if (!b.alive) continue;
      if (b.ownerId === t.id) continue; // skip own bullets
      if (b.pos.dist(t.pos) < tr + BULLET_RADIUS) { t.hp -= b.isPlayerBullet ? 0 : b.damage; b.alive = false; if (t.hp <= 0) t.alive = false; }
    }
    for (const bk of s.physicsBlocks) {
      if (!bk.alive) continue;
      const d = bk.pos.sub(t.pos); const dist = d.mag();
      if (dist < tr + BLOCK_RADIUS) {
        const n = dist > 0.01 ? d.norm() : new Vec2(1, 0);
        bk.pos = t.pos.add(n.scale(tr + BLOCK_RADIUS + 1));
        const vn = bk.vel.dot(n);
        if (vn < 0) bk.vel = bk.vel.sub(n.scale(2 * vn)).scale(0.4);
      }
    }
  }

  // Tank-tank
  resolveTankCollisions([s.player, ...s.enemies, ...s.allies].filter((t: any) => t.alive));

  // Physics + bullets
  handlers.physics(s, dt);
  handlers.bullets(s, dt, handlers.skipCC ?? false);
  handlers.bulletTank(s, dt);

  // All skills
  for (const sk of handlers.skills) sk(s, dt);

  // Gravity
  if (s.gravityTimer > 0) {
    s.gravityTimer -= dt;
    for (const e of s.enemies) { if (e.alive && !e.isStatic) { const to = s.gravityPos.sub(e.pos); const d = to.mag(); if (d > 20) e.vel = e.vel.add(to.norm().scale(200 * dt)); if (d < 30) takeDamage(e, 10 * dt, s.player); } }
    for (const bk of s.physicsBlocks) { if (bk.alive) bk.vel = bk.vel.add(s.gravityPos.sub(bk.pos).norm().scale(300 * dt)); }
    s.particles.push(...spawnParticles(s.gravityPos, 'hit', 1, 30));
  }

  // Particles + damage numbers + timers
  updateParticles(s.particles, dt); s.particles = s.particles.filter((p: any) => p.alive);
  updateDamageNumbers(s.damageNumbers, dt); s.damageNumbers = s.damageNumbers.filter((n: any) => n.alive);
  s.skillMessageTime -= 16;
  if (s.timeSlowTimer > 0) s.timeSlowTimer -= dt;
  if (s.restoreTimer > 0) s.restoreTimer -= dt;
  if (s.lightningTimer > 0) s.lightningTimer -= dt;
  if (s.slowMoTimer > 0) s.slowMoTimer -= dt;
}
