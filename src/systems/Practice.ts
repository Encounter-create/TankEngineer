// Practice mode — mini sandbox reusing real game systems
import { TankEntity, createTank, takeDamage, TANK_RADIUS } from '../entities/Tank';
import { TankConfig } from '../entities/Parts';
import { BulletEntity, createBullet } from '../entities/Bullet';
import { TileGrid, createEmptyMap } from '../entities/Map';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { moveTank, moveBullet, checkBulletTankHit } from '../core/Physics';
import { activateSkill } from '../systems/Commander';
import { Input } from '../core/Input';
import { Vec2 } from '../utils/Vector';

export interface PracticeState {
  player: TankEntity;
  enemy: TankEntity;
  bullets: BulletEntity[];
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

  return { player, enemy, bullets: [], map, arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah, skillMessage: '', skillMessageTime: 0 };
}

export function updatePractice(ps: PracticeState, input: Input, dt: number): void {
  if (!ps.player.alive) { ps.player.alive = true; ps.player.hp = ps.player.maxHp; }
  if (!ps.enemy.alive) { ps.enemy.alive = true; ps.enemy.hp = ps.enemy.maxHp; }

  // Player movement
  const md = input.getMoveDir();
  moveTank(ps.player, md, dt, ps.map, [], []);

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

  // Labels
  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('🎯 靶子', ps.enemy.pos.x, ps.enemy.pos.y - 20);
  ctx.fillText('WASD 鼠标 E技能', ax + aw / 2, ay + ah - 6);
  if (ps.skillMessageTime > 0) {
    ctx.fillStyle = '#4ae0a0'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(ps.skillMessage, ax + aw / 2, ay + ah / 2);
  }
}

function drawSimpleTank(ctx: CanvasRenderingContext2D, t: TankEntity, body: string, dark: string): void {
  if (!t.alive) return;
  const r = TANK_RADIUS, x = t.pos.x, y = t.pos.y;
  ctx.save(); ctx.translate(x, y);
  // Body (golden ratio)
  const bw = r * 2, bh = bw * 0.618;
  ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-bw/2, -bh/2, bw, bh, bh * 0.3); ctx.fill(); ctx.stroke();
  // Turret + barrel
  ctx.rotate(t.turretAngle);
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark; ctx.fillRect(r * 0.3, -3, r * 1.1, 6);
  ctx.restore();
  // HP
  if (t.hp < t.maxHp) {
    ctx.fillStyle = '#333'; ctx.fillRect(x - r, y - r - 10, r * 2, 3);
    ctx.fillStyle = '#4ae0a0'; ctx.fillRect(x - r, y - r - 10, r * 2 * (t.hp / t.maxHp), 3);
  }
}
