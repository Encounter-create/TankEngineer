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
import { drawTank } from '../ui/Renderer';

export interface PracticeState {
  player: TankEntity; enemy: TankEntity;
  bullets: BulletEntity[]; blocks: PhysicsBlock[];
  map: TileGrid;
  arenaX: number; arenaY: number; arenaW: number; arenaH: number;
  skillMessage: string; skillMessageTime: number;
}

export function createPractice(config: TankConfig, ax: number, ay: number, aw: number, ah: number): PracticeState {
  const map = createEmptyMap();
  for (let x = 3; x < 11; x++) {
    const gx = Math.round((ax + aw * 0.4) / CELL_SIZE) + (x - 3);
    const gy = Math.round((ay + ah * 0.6) / CELL_SIZE);
    if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS)
      map[gy][gx] = { type: TileType.BRICK, hp: 1 };
  }
  const player = createTank('practice_p', new Vec2(ax + aw * 0.2, ay + ah * 0.5), config, true);
  const enemy = createTank('practice_e', new Vec2(ax + aw * 0.75, ay + ah * 0.35), config, false);
  return { player, enemy, bullets: [], blocks: [], map, arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah, skillMessage: '', skillMessageTime: 0 };
}

export function updatePractice(ps: PracticeState, input: Input, dt: number): void {
  if (!ps.player.alive) { ps.player.alive = true; ps.player.hp = ps.player.maxHp; }
  if (!ps.enemy.alive) { ps.enemy.alive = true; ps.enemy.hp = ps.enemy.maxHp; }

  const md = input.getMoveDir();
  moveTank(ps.player, md, dt, ps.map, ps.blocks, ps.blocks);
  ps.player.turretAngle = Math.atan2(input.mousePos.y - ps.player.pos.y, input.mousePos.x - ps.player.pos.x);

  if (input.isMouseDown() || input.isFirePressed()) {
    if (ps.player.cooldownRemaining <= 0) {
      const cfg = ps.player.config;
      ps.player.cooldownRemaining = cfg.barrel.stats.cooldownMs ?? 800;
      ps.bullets.push(createBullet(ps.player.pos, ps.player.turretAngle,
        cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400,
        cfg.barrel.stats.bulletDamage ?? 35, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0,
        ps.player.id, true));
    }
  }
  ps.player.cooldownRemaining -= dt * 1000;

  if (input.wasJustPressed('KeyE')) {
    const r = activateSkill(ps.player);
    ps.skillMessage = r.message; ps.skillMessageTime = 2;
  }

  for (const b of ps.bullets) { if (b.alive) { moveBullet(b, dt, ps.map); if (b.alive && b.isPlayerBullet && checkBulletTankHit(b, ps.enemy)) { takeDamage(ps.enemy, b.damage); b.alive = false; } } }
  ps.bullets = ps.bullets.filter(b => b.alive);

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

  drawTank(ctx, ps.enemy); drawTank(ctx, ps.player);

  for (const b of ps.bullets) { if (b.alive) { ctx.fillStyle = '#ffcc44'; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2); ctx.fill(); } }

  const exitX = ax + aw - 82, exitY = ay + 6;
  ctx.fillStyle = '#6a3a3a'; ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(exitX, exitY, 76, 24, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⏹ 退出演习', exitX + 38, exitY + 12);

  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('🎯 靶子', ps.enemy.pos.x, ps.enemy.pos.y - 20);
  ctx.fillText('WASD 鼠标 左键 E技能', ax + aw / 2, ay + ah - 6);
  if (ps.skillMessageTime > 0) { ctx.fillStyle = '#4ae0a0'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(ps.skillMessage, ax + aw / 2, ay + ah / 2); }
}
