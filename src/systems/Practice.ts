// Practice mode — mini sandbox reusing real game systems
import { TankEntity, createTank, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { TankConfig } from '../entities/Parts';
import { BulletEntity, createBullet, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, FIREWORK_MAX_LIFE } from '../entities/Bullet';
import { FireZone, createFireZone, updateFireZone } from '../entities/FireZone';
import { Particle, spawnParticles, spawnExplosion, updateParticles } from '../entities/Particle';
import { TileGrid, createEmptyMap } from '../entities/Map';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { moveTank, moveBullet, checkBulletTankHit, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions } from '../core/Physics';
import { PhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { activateSkill } from '../systems/Commander';
import { Input } from '../core/Input';
import { Vec2 } from '../utils/Vector';
import { drawTank, drawFireZone } from '../ui/Renderer';

export interface PracticeState {
  player: TankEntity; enemy: TankEntity;
  bullets: BulletEntity[]; blocks: PhysicsBlock[];
  fireZones: FireZone[]; particles: Particle[];
  map: TileGrid;
  arenaX: number; arenaY: number; arenaW: number; arenaH: number;
  skillMessage: string; skillMessageTime: number;
  practiceTurret: any; practiceClone: any;
}

export function createPractice(config: TankConfig, ax: number, ay: number, aw: number, ah: number): PracticeState {
  const map = createEmptyMap();
  for (let x = 3; x < 11; x++) {
    const gx = Math.round((ax + aw * 0.4) / CELL_SIZE) + (x - 3);
    const gy = Math.round((ay + ah * 0.6) / CELL_SIZE);
    if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS)
      map[gy][gx] = { type: TileType.BRICK, hp: 50 };
  }
  const player = createTank('practice_p', new Vec2(ax + aw * 0.2, ay + ah * 0.5), config, true);
  const enemy = createTank('practice_e', new Vec2(ax + aw * 0.75, ay + ah * 0.35), config, false);
  return { player, enemy, bullets: [], blocks: [], fireZones: [], particles: [], map, arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah, skillMessage: '', skillMessageTime: 0, practiceTurret: null, practiceClone: null };
}

export function updatePractice(ps: PracticeState, input: Input, dt: number): void {
  if (!ps.player.alive) { ps.player.alive = true; ps.player.hp = ps.player.maxHp; }

  const md = input.getMoveDir();
  moveTank(ps.player, md, dt, ps.map, ps.blocks, ps.blocks);
  ps.player.turretAngle = Math.atan2(input.mousePos.y - ps.player.pos.y, input.mousePos.x - ps.player.pos.x);

  if (input.isMouseDown() || input.isFirePressed()) {
    if (ps.player.cooldownRemaining <= 0) {
      const cfg = ps.player.config;
      ps.player.cooldownRemaining = cfg.barrel.stats.cooldownMs ?? 800;
      const bullet = createBullet(ps.player.pos, ps.player.turretAngle,
        cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400,
        cfg.barrel.stats.bulletDamage ?? 35, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0,
        ps.player.id, true);
      if (bullet.style === 'firework') { bullet.fireworkLife = FIREWORK_MAX_LIFE; bullet.fireworkTimer = 0.25; }
      // Rocket: target the enemy
      // Rocket flies toward mouse position, not auto-homing enemy
      ps.bullets.push(bullet);
    }
  }
  ps.player.cooldownRemaining -= dt * 1000;

  if (input.wasJustPressed('KeyE')) {
    const r = activateSkill(ps.player);
    ps.skillMessage = r.message; ps.skillMessageTime = 2;
    if (r.success) {
      const id = ps.player.config.commander.id;
      // Repair/Sprint/Barrage/Smoke handled by activateSkill
      if (id === 'commander_colonel') { for (let i=0;i<5;i++) ps.particles.push(...spawnParticles(ps.enemy.pos, 'explosion', 15, 120)); takeDamage(ps.enemy, 60); }
      else if (id === 'commander_engineer') { ps.practiceTurret = { pos: new Vec2(ps.player.pos.x, ps.player.pos.y), alive: true, cooldown: 0 }; }
      else if (id === 'commander_wizard') { ps.enemy.alive = true; ps.enemy.hp = ps.enemy.maxHp; ps.enemy.pos = new Vec2(ps.arenaX + ps.arenaW * 0.5 + Math.random() * ps.arenaW * 0.3, ps.arenaY + ps.arenaH * 0.3 + Math.random() * 0.3); }
      else if (id === 'commander_ninja') { ps.practiceClone = { pos: new Vec2(ps.player.pos.x, ps.player.pos.y), turretAngle: 0, alive: true, cooldown: 0 }; }
      else if (id === 'commander_gravity') { ps.particles.push(...spawnParticles(ps.player.pos, 'hit', 3, 30)); ps.skillMessage = '重力井(演习简化)'; }
      else if (id === 'commander_time') { ps.particles.push(...spawnParticles(ps.player.pos, 'smoke', 5, 20)); ps.skillMessage = '时间减速!'; }
      else if (id === 'commander_lightning') { takeDamage(ps.enemy, 100); ps.particles.push(...spawnParticles(ps.enemy.pos, 'hit', 8, 80)); }
      else if (id === 'commander_restore') { ps.skillMessage = '演习中无砖墙可恢复'; }
    }
  }

  // Bullets — same handling as Siege.ts
  const newBullets: BulletEntity[] = [];
  for (const b of ps.bullets) {
    if (!b.alive) continue;

    // Rocket: steer toward enemy
    if (b.style === 'rocket') {
      const toTarget = ps.enemy.pos.sub(b.pos);
      if (toTarget.mag() > 1) b.vel = toTarget.norm().scale(b.vel.mag());
    }

    // Firework
    if (b.style === 'firework') {
      if (b.fireworkLife === 0) b.fireworkLife = FIREWORK_MAX_LIFE;
      b.fireworkTimer -= dt; b.fireworkLife -= dt;
      if (b.fireworkLife <= 0) { b.alive = false; ps.particles.push(...spawnExplosion(b.pos)); continue; }
      if (b.fireworkTimer <= 0) {
        b.fireworkTimer = FIREWORK_INTERVAL;
        for (let i = 0; i < FIREWORK_CHILD_COUNT; i++)
          newBullets.push(createBullet(b.pos, (Math.PI*2/FIREWORK_CHILD_COUNT)*i, 'straight', 110, 7, 0, 0, b.ownerId, b.isPlayerBullet));
      }
    }

    // Orbital
    if (b.style === 'orbital') b.orbitalAngle += dt * 14;

    // Arc: gravity + damage doubling
    if (b.style === 'arc') {
      b.arcVy += 600 * dt;
      if (!b.arcDescending && b.arcVy > 0) { b.arcDescending = true; b.damage = Math.round(b.damage * 2); }
    }

    const hitResult = moveBullet(b, dt, ps.map, ps.blocks);

    // Rocket hit wall → explode
    if (b.style === 'rocket' && hitResult.hitWall) {
      ps.fireZones.push(createFireZone(b.pos, 40, 2, 15));
      ps.particles.push(...spawnExplosion(b.pos));
      b.alive = false; ps.particles.push(...spawnParticles(b.pos, 'impact', 6, 60));
    }
    if (!b.alive) continue;

    // Hit enemy (with knockback matching Siege)
    if (ps.enemy.alive && b.isPlayerBullet && checkBulletTankHit(b, ps.enemy)) {
      takeDamage(ps.enemy, b.damage); ps.particles.push(...spawnParticles(b.pos, 'hit', 8, 80)); b.alive = false;
      if (!ps.enemy.alive) ps.particles.push(...spawnExplosion(ps.enemy.pos));
      if (b.style === 'rocket') { ps.fireZones.push(createFireZone(b.pos, 40, 2, 15)); takeDamage(ps.enemy, 40); }
    }
    if (!b.alive) ps.particles.push(...spawnParticles(b.pos, 'impact', 6, 60));
  }
  for (const nb of newBullets) ps.bullets.push(nb);
  ps.bullets = ps.bullets.filter(b => b.alive);

  // Fire zones
  if (!ps.fireZones) (ps as any).fireZones = [];
  for (const z of ps.fireZones) {
    updateFireZone(z, dt);
    if (z.alive && ps.enemy.alive && ps.enemy.pos.dist(z.pos) < z.radius) ps.enemy.hp -= z.dps * dt;
  }
  ps.fireZones = ps.fireZones.filter((z: FireZone) => z.alive);

  for (const b of ps.blocks) {
    if (!b.alive) continue;
    updatePhysicsBlock(b, dt, 1);
    b.pos = b.pos.add(b.vel.scale(dt));
    const r = b.radius;
    b.pos = new Vec2(Math.max(ps.arenaX + r, Math.min(ps.arenaX + ps.arenaW - r, b.pos.x)), Math.max(ps.arenaY + r, Math.min(ps.arenaY + ps.arenaH - r, b.pos.y)));
    if (b.pos.x <= ps.arenaX + r || b.pos.x >= ps.arenaX + ps.arenaW - r) b.vel = new Vec2(-b.vel.x * 0.6, b.vel.y);
    if (b.pos.y <= ps.arenaY + r || b.pos.y >= ps.arenaY + ps.arenaH - r) b.vel = new Vec2(b.vel.x, -b.vel.y * 0.6);
  }
  resolveBlockWallCollisions(ps.blocks, ps.map, ps.blocks);
  resolveBlockTankCollisions(ps.blocks, [ps.player, ps.enemy]);
  resolveBlockBlockCollisions(ps.blocks);
  for (const b of ps.blocks) {
    if (!b.alive || b.vel.mag() < 30) continue;
    if (ps.enemy.alive && ps.enemy.pos.dist(b.pos) < TANK_RADIUS + BLOCK_RADIUS + 4) takeDamage(ps.enemy, Math.round(b.vel.mag() * b.mass * 0.06));
    if (b.vel.mag() < 2) b.vel = Vec2.zero();
  }
  // Particles
  updateParticles(ps.particles, dt);
  ps.particles = ps.particles.filter(p => p.alive);
  // Fire zone particles
  for (const z of ps.fireZones) {
    if (z.alive && Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const r = z.radius * Math.sqrt(Math.random());
      ps.particles.push({ pos: new Vec2(z.pos.x + Math.cos(a) * r, z.pos.y + Math.sin(a) * r), vel: new Vec2((Math.random()-0.5)*20, (Math.random()-0.5)*20 - 10), life: 0.5 + Math.random() * 0.5, maxLife: 1, color: ['#ff4400','#ff6600','#ffaa00'][Math.floor(Math.random()*3)], radius: 2 + Math.random() * 3, alive: true, smokeExpand: false, isCross: false });
    }
  }

  ps.skillMessageTime -= dt;
  ps.player.pos = new Vec2(Math.max(ps.arenaX + TANK_RADIUS, Math.min(ps.arenaX + ps.arenaW - TANK_RADIUS, ps.player.pos.x)), Math.max(ps.arenaY + TANK_RADIUS, Math.min(ps.arenaY + ps.arenaH - TANK_RADIUS, ps.player.pos.y)));
}

export function renderPractice(ctx: CanvasRenderingContext2D, ps: PracticeState): void {
  const { arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah } = ps;
  ctx.fillStyle = '#1a1d15'; ctx.fillRect(ax, ay, aw, ah);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= Math.floor(aw / CELL_SIZE); gx++) { ctx.beginPath(); ctx.moveTo(ax + gx * CELL_SIZE, ay); ctx.lineTo(ax + gx * CELL_SIZE, ay + ah); ctx.stroke(); }
  for (let gy = 0; gy <= Math.floor(ah / CELL_SIZE); gy++) { ctx.beginPath(); ctx.moveTo(ax, ay + gy * CELL_SIZE); ctx.lineTo(ax + aw, ay + gy * CELL_SIZE); ctx.stroke(); }

  for (let gy = 0; gy < MAP_ROWS; gy++) for (let gx = 0; gx < MAP_COLS; gx++) {
    const t = ps.map[gy][gx]; if (t.type !== TileType.BRICK || t.hp <= 0) continue;
    const tx = gx * CELL_SIZE, ty = gy * CELL_SIZE;
    if (tx >= ax && tx <= ax + aw && ty >= ay && ty <= ay + ah) { ctx.fillStyle = '#8B7355'; ctx.strokeStyle = '#6B5335'; ctx.lineWidth = 1; ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2); ctx.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2); }
  }

  for (const b of ps.blocks) { if (!b.alive) continue; const s = b.radius; ctx.fillStyle = b.tileType === TileType.METAL ? '#666' : '#8B7355'; ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(b.pos.x - s, b.pos.y - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke(); }

  for (const p of ps.particles) { if (p.alive) { ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; } }
  for (const z of ps.fireZones) { drawFireZone(ctx, z); }
  drawTank(ctx, ps.enemy); drawTank(ctx, ps.player);

  for (const b of ps.bullets) { if (b.alive) { ctx.fillStyle = '#ffcc44'; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2); ctx.fill(); } }

  const exitX = ax + aw / 2 - 40, exitY = ay + ah - 32;
  ctx.fillStyle = '#6a3a3a'; ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(exitX, exitY, 80, 24, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⏹ 退出演习', exitX + 40, exitY + 12);

  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('🎯 靶子', ps.enemy.pos.x, ps.enemy.pos.y - 20);
  // Respawn button (only when enemy dead)
  if (!ps.enemy.alive) {
    const rx = ax + aw / 2 - 50, ry = ay + ah / 2 + 20;
    ctx.fillStyle = '#3a6a3a'; ctx.strokeStyle = '#4ae0a0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(rx, ry, 100, 28, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔄 复活靶子', rx + 50, ry + 14);
  }

  ctx.fillText('WASD 鼠标 左键 E技能', ax + aw / 2, ay + ah - 6);
  if (ps.skillMessageTime > 0) { ctx.fillStyle = '#4ae0a0'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(ps.skillMessage, ax + aw / 2, ay + ah / 2); }
}
