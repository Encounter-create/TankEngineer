// Practice mode — mini sandbox reusing real game systems
import { TankEntity, createTank, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { TankConfig } from '../entities/Parts';
import { BulletEntity, createBullet } from '../entities/Bullet';
import { TileGrid, createEmptyMap } from '../entities/Map';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { moveTank, moveBullet, checkBulletTankHit, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions } from '../core/Physics';
import { PhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { activateSkill } from '../systems/Commander';
import { Input } from '../core/Input';
import { Vec2 } from '../utils/Vector';

export interface PracticeState {
  player: TankEntity;
  enemy: TankEntity;
  bullets: BulletEntity[];
  blocks: PhysicsBlock[];
  map: TileGrid;
  arenaX: number; arenaY: number; arenaW: number; arenaH: number;
  skillMessage: string; skillMessageTime: number;
}

export function createPractice(config: TankConfig, ax: number, ay: number, aw: number, ah: number): PracticeState {
  const map = createEmptyMap();
  // Brick wall row
  for (let x = 2; x < 12; x++) {
    const gx = Math.round((ax + aw * 0.4) / CELL_SIZE) + (x - 2);
    const gy = Math.round((ay + ah * 0.65) / CELL_SIZE);
    if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS) {
      map[gy][gx] = { type: TileType.BRICK, hp: 1 };
    }
  }

  const player = createTank('practice_p', new Vec2(ax + aw * 0.25, ay + ah * 0.5), config, true);
  const enemy = createTank('practice_e', new Vec2(ax + aw * 0.75, ay + ah * 0.35), config, false);
  enemy.hp = enemy.maxHp;

  return { player, enemy, bullets: [], blocks: [], map, arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah, skillMessage: '', skillMessageTime: 0 };
}

export function updatePractice(ps: PracticeState, input: Input, dt: number): void {
  if (!ps.player.alive) { ps.player.alive = true; ps.player.hp = ps.player.maxHp; }
  if (!ps.enemy.alive) { ps.enemy.alive = true; ps.enemy.hp = ps.enemy.maxHp; }

  // Player movement
  const md = input.getMoveDir();
  moveTank(ps.player, md, dt, ps.map, ps.blocks, ps.blocks);

  // Turret follows mouse
  const m = input.mousePos;
  ps.player.turretAngle = Math.atan2(m.y - ps.player.pos.y, m.x - ps.player.pos.x);

  // Fire
  if (input.isMouseDown() || input.isFirePressed()) {
    if (ps.player.cooldownRemaining <= 0) {
      const cfg = ps.player.config;
      const cd = cfg.barrel.stats.cooldownMs ?? 800;
      ps.player.cooldownRemaining = cd;
      const bullet = createBullet(ps.player.pos, ps.player.turretAngle,
        cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400,
        cfg.barrel.stats.bulletDamage ?? 35, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0,
        ps.player.id, true);
      ps.bullets.push(bullet);
    }
  }
  ps.player.cooldownRemaining -= dt * 1000;

  // Skill (E key, no CD in practice)
  if (input.wasJustPressed('KeyE')) {
    const result = activateSkill(ps.player);
    ps.skillMessage = result.message; ps.skillMessageTime = 2;
  }

  // Update bullets
  for (const b of ps.bullets) {
    if (!b.alive) continue;
    moveBullet(b, dt, ps.map);
    if (!b.alive) continue;
    if (b.isPlayerBullet && checkBulletTankHit(b, ps.enemy)) {
      takeDamage(ps.enemy, b.damage);
      b.alive = false;
    }
  }
  ps.bullets = ps.bullets.filter(b => b.alive);

  // Physics block updates
  for (const block of ps.blocks) {
    if (!block.alive) continue;
    updatePhysicsBlock(block, dt, 1);
    block.pos = block.pos.add(block.vel.scale(dt));
    // Clamp to arena bounds
    const r = block.radius;
    block.pos = new Vec2(
      Math.max(ps.arenaX + r, Math.min(ps.arenaX + ps.arenaW - r, block.pos.x)),
      Math.max(ps.arenaY + r, Math.min(ps.arenaY + ps.arenaH - r, block.pos.y)),
    );
    // Bounce off arena edges
    if (block.pos.x <= ps.arenaX + r || block.pos.x >= ps.arenaX + ps.arenaW - r) block.vel = new Vec2(-block.vel.x * 0.6, block.vel.y);
    if (block.pos.y <= ps.arenaY + r || block.pos.y >= ps.arenaY + ps.arenaH - r) block.vel = new Vec2(block.vel.x, -block.vel.y * 0.6);
  }
  resolveBlockWallCollisions(ps.blocks, ps.map, ps.blocks);
  resolveBlockTankCollisions(ps.blocks, [ps.player, ps.enemy]);
  resolveBlockBlockCollisions(ps.blocks);
  // Block damage to enemy
  for (const block of ps.blocks) {
    if (!block.alive || block.vel.mag() < 30) continue;
    if (ps.enemy.alive && ps.enemy.pos.dist(block.pos) < TANK_RADIUS + BLOCK_RADIUS + 4) {
      takeDamage(ps.enemy, Math.round(block.vel.mag() * block.mass * 0.06));
    }
  }
  // Freeze stopped blocks
  for (const block of ps.blocks) {
    if (block.vel.mag() < 2) block.vel = Vec2.zero();
  }

  ps.skillMessageTime -= dt;

  // Clamp player to arena
  ps.player.pos = new Vec2(
    Math.max(ps.arenaX + TANK_RADIUS, Math.min(ps.arenaX + ps.arenaW - TANK_RADIUS, ps.player.pos.x)),
    Math.max(ps.arenaY + TANK_RADIUS, Math.min(ps.arenaY + ps.arenaH - TANK_RADIUS, ps.player.pos.y)),
  );
}

export function renderPractice(ctx: CanvasRenderingContext2D, ps: PracticeState): void {
  const { arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah } = ps;
  // BG
  ctx.fillStyle = '#1a1d15';
  ctx.fillRect(ax, ay, aw, ah);
  // Grid
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= Math.floor(aw / CELL_SIZE); gx++) {
    ctx.beginPath(); ctx.moveTo(ax + gx * CELL_SIZE, ay); ctx.lineTo(ax + gx * CELL_SIZE, ay + ah); ctx.stroke();
  }
  for (let gy = 0; gy <= Math.floor(ah / CELL_SIZE); gy++) {
    ctx.beginPath(); ctx.moveTo(ax, ay + gy * CELL_SIZE); ctx.lineTo(ax + aw, ay + gy * CELL_SIZE); ctx.stroke();
  }
  // Map tiles (bricks)
  for (let gy = 0; gy < MAP_ROWS; gy++) {
    for (let gx = 0; gx < MAP_COLS; gx++) {
      const tile = ps.map[gy][gx];
      if (tile.type !== TileType.BRICK || tile.hp <= 0) continue;
      const tx = gx * CELL_SIZE, ty = gy * CELL_SIZE;
      if (tx < ax - CELL_SIZE || tx > ax + aw || ty < ay - CELL_SIZE || ty > ay + ah) continue;
      ctx.fillStyle = '#8B7355'; ctx.strokeStyle = '#6B5335'; ctx.lineWidth = 1;
      ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      ctx.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }

  // Bullets
  for (const b of ps.bullets) {
    if (!b.alive) continue;
    ctx.fillStyle = '#ffcc44';
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Draw tanks (simple version using real TANK_RADIUS)
  drawSimpleTank(ctx, ps.enemy, '#ff6b4a', '#cc4422');
  drawSimpleTank(ctx, ps.player, '#4a9eff', '#2a6ecc');

  // Physics blocks
  for (const block of ps.blocks) {
    if (!block.alive) continue;
    const s = block.radius;
    ctx.fillStyle = block.tileType === TileType.METAL ? '#666' : '#8B7355';
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(block.pos.x - s, block.pos.y - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
  }

  // Exit button (visible)
  const exitX = ax + aw - 82, exitY = ay + 6, exitW = 76, exitH = 24;
  ctx.fillStyle = '#6a3a3a'; ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(exitX, exitY, exitW, exitH, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⏹ 退出演习', exitX + exitW / 2, exitY + exitH / 2);

  // Labels
  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('🎯 靶子', ps.enemy.pos.x, ps.enemy.pos.y - 20);
  ctx.fillText('WASD 鼠标 左键 E技能', ax + aw / 2, ay + ah - 6);
  if (ps.skillMessageTime > 0) {
    ctx.fillStyle = '#4ae0a0'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(ps.skillMessage, ax + aw / 2, ay + ah / 2);
  }
}

function drawSimpleTank(ctx: CanvasRenderingContext2D, t: TankEntity, body: string, dark: string): void {
  if (!t.alive) return;
  const r = TANK_RADIUS, x = t.pos.x, y = t.pos.y;
  const cfg = t.config;
  const phi = 0.618;
  const bw = r * 2, bh = bw * phi;

  // Chassis (config-specific colors)
  const chassisColors: Record<string, string> = { chassis_standard: body, chassis_inertia: '#66aadd', chassis_heavy: '#8B7355', chassis_track: '#88aa66' };
  const chassisColor = chassisColors[cfg.chassis.id] ?? body;

  ctx.save(); ctx.translate(x, y);
  // Body
  ctx.fillStyle = chassisColor; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-bw/2, -bh/2, bw, bh, bh * 0.3); ctx.fill(); ctx.stroke();
  // Tread accent for standard
  if (cfg.chassis.id === 'chassis_standard') {
    ctx.fillStyle = dark; ctx.fillRect(-bw/2 - 1, -bh/2, 3, bh); ctx.fillRect(bw/2 - 2, -bh/2, 3, bh);
  }

  // Turret (config-specific shape)
  ctx.rotate(t.turretAngle);
  const turretR = r * 0.55;
  if (cfg.turret.id === 'turret_reactive') {
    ctx.fillStyle = '#55aa77'; ctx.strokeStyle = '#337744'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 / 6 * i - Math.PI / 2;
      const px = Math.cos(a) * turretR, py = Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (cfg.turret.id === 'turret_heavy') {
    ctx.fillStyle = '#335577'; ctx.strokeStyle = '#1a3344'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 / 5 * i - Math.PI / 2;
      const px = Math.cos(a) * turretR, py = Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = '#88bbee'; ctx.strokeStyle = '#5588aa'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 2 / 3 * i - Math.PI / 2;
      const px = Math.cos(a) * turretR, py = Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Barrel (config-specific color)
  const barrelColors: Record<string, string> = {
    barrel_straight: '#667788', barrel_bounce: '#99aabb', barrel_pierce: '#5588cc', barrel_arc: '#dd8844',
    barrel_firework: '#ffaa33', barrel_orbital: '#9966cc', barrel_sniper: '#cc3333',
    barrel_gatling: '#667788', barrel_rocket: '#44aa44',
  };
  ctx.fillStyle = barrelColors[cfg.barrel.id] ?? '#667788';
  ctx.fillRect(r * 0.3, -3, r * 1.1, 6);
  ctx.restore();

  // HP
  if (t.hp < t.maxHp) {
    ctx.fillStyle = '#333'; ctx.fillRect(x - r, y - r - 10, r * 2, 3);
    ctx.fillStyle = '#4ae0a0'; ctx.fillRect(x - r, y - r - 10, r * 2 * (t.hp / t.maxHp), 3);
  }
}
