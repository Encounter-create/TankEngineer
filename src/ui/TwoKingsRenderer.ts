// ============================================================
// TwoKingsRenderer — map/entities/HUD for 双王战争 mode
// ============================================================

import { MAP_W, MAP_H, MAP_ROWS, CELL_SIZE, TileType } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { PhysicsBlock } from '../entities/PhysicsBlock';
import { TwoKingsState, DefenseTower, WarBase, BLUE_LANE_WAYPOINTS, RED_LANE_WAYPOINTS } from '../modes/TwoKings';
import { TANK_RADIUS } from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS } from '../entities/Bullet';
import { drawTank, drawSkillEntities } from './Renderer';
import { drawGearButton, drawPauseOverlay } from './BattleUI';

// ============================================================
// Colors
// ============================================================

const C = {
  BG: '#1a1d23',
  GRID: '#2a2d35',
  BRICK: '#c4946a',
  METAL: '#7a8296',
  WATER: '#3a6090',
  BRIDGE: '#8b7355',
  BLUE: '#4a9eff',
  BLUE_DARK: '#2a6ecc',
  RED: '#ff5555',
  RED_DARK: '#cc3333',
  TOWER_BLUE: '#3366cc',
  TOWER_RED: '#cc3333',
  BASE_BLUE: '#2244aa',
  BASE_RED: '#aa2222',
  HP_OK: '#4a9eff',
  HP_LOW: '#ff4444',
  TEXT: '#e8e8e8',
  TEXT_DIM: '#888',
  OVERLAY: 'rgba(0,0,0,0.6)',
  HP_BAR_BG: '#333',
};

// ============================================================
// Main render
// ============================================================

export function renderTwoKings(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  // Screen shake
  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 2 : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 2 : 0;

  ctx.save();
  if (shakeX !== 0 || shakeY !== 0) ctx.translate(shakeX, shakeY);

  drawBackground(ctx);
  drawTiles(ctx, state.map);
  drawRiverWater(ctx);     // Noah-style animated water over river
  drawBases(ctx, state);
  drawTowers(ctx, state);
  // Lane attack routes (white dashed lines, always visible)
  drawLaneRoutes(ctx);

  drawTanksLayer(ctx, state);
  // Skill-spawned entities (shared with Siege)
  drawSkillEntities(ctx, state);
  drawPhysicsBlocks(ctx, state.physicsBlocks);
  drawBullets(ctx, state.bullets);
  drawParticles(ctx, state.particles);

  ctx.restore();
}

/** Overlay for intro/victory/defeat */
export function drawTwoKingsOverlay(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  if (state.phase === 'intro') {
    drawOverlay(ctx, ['👑 双王战争', '', '蓝方 AI vs 红方 AI', '你操控蓝方坦克参与战斗', '摧毁敌方主基地即为胜利', '', '点击屏幕 或 按 Enter/Space 开始']);
  } else if (state.phase === 'victory') {
    drawOverlay(ctx, ['🏆 胜利！', '', `摧毁了敌方基地`, `耗时 ${Math.floor(state.elapsedTime)}s`, '', '点击返回大厅']);
  } else if (state.phase === 'defeat') {
    drawOverlay(ctx, ['💀 失败', '', `己方基地被摧毁`, `坚持了 ${Math.floor(state.elapsedTime)}s`, '', '点击返回大厅']);
  }
}

// ============================================================
// Background + tiles
// ============================================================

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Grid lines
  ctx.strokeStyle = C.GRID;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= MAP_W; x += CELL_SIZE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let y = 0; y <= MAP_H; y += CELL_SIZE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, map: TileGrid): void {
  // River area: blue background (cols 14-15, except bridge rows)
  const bridgeRows = new Set([4,5,6,10,11,12,16,17,18]);
  for (let y = 0; y < MAP_ROWS; y++) {
    if (!bridgeRows.has(y)) {
      for (let c = 14; c <= 15; c++) {
        ctx.fillStyle = C.WATER;
        ctx.fillRect(c * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tile = map[y][x];
      const tx = x * CELL_SIZE, ty = y * CELL_SIZE;
      if (tile.type === TileType.METAL) {
        ctx.fillStyle = C.METAL;
        ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeStyle = '#5a6276'; ctx.lineWidth = 1;
        ctx.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      } else if (tile.type === TileType.BRICK) {
        ctx.fillStyle = C.BRICK;
        ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
  }

  // Bridge highlights — 3-row wood planks over river
  const bridgeDefs = [{ rowStart: 4, rowEnd: 6 }, { rowStart: 10, rowEnd: 12 }, { rowStart: 16, rowEnd: 18 }];
  for (const b of bridgeDefs) {
    const bx = 14 * CELL_SIZE;
    const by = b.rowStart * CELL_SIZE;
    const bw = 2 * CELL_SIZE;
    const bh = (b.rowEnd - b.rowStart + 1) * CELL_SIZE;
    // Wood plank base
    ctx.fillStyle = C.BRIDGE;
    ctx.fillRect(bx, by, bw, bh);
    // Horizontal plank lines
    ctx.strokeStyle = '#6a5540'; ctx.lineWidth = 1;
    for (let r = b.rowStart; r <= b.rowEnd; r++) {
      const py = r * CELL_SIZE;
      ctx.beginPath(); ctx.moveTo(bx, py); ctx.lineTo(bx + bw, py); ctx.stroke();
    }
    // Bridge border
    ctx.strokeStyle = '#5a4530'; ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  }
}

// ============================================================
// Structures: bases + towers
// ============================================================

function drawBases(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  drawWarBase(ctx, state.blueBase, 'blue');
  drawWarBase(ctx, state.redBase, 'red');
}

function drawTowers(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  for (const t of state.blueTowers) drawDefenseTower(ctx, t);
  for (const t of state.redTowers) drawDefenseTower(ctx, t);
}

function drawWarBase(ctx: CanvasRenderingContext2D, base: WarBase, side: 'blue' | 'red'): void {
  if (!base.alive) return;
  const cx = base.pos.x, cy = base.pos.y;
  const size = CELL_SIZE * 1.3;
  const color = side === 'blue' ? C.BASE_BLUE : C.BASE_RED;

  // Glow
  ctx.fillStyle = color + '30';
  ctx.beginPath(); ctx.arc(cx, cy, size + 6, 0, Math.PI * 2); ctx.fill();

  // Hexagon
  ctx.fillStyle = color + '60';
  ctx.strokeStyle = side === 'blue' ? C.BLUE : C.RED;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i - Math.PI / 6;
    const px = cx + Math.cos(angle) * size * 0.8;
    const py = cy + Math.sin(angle) * size * 0.8;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Flag marker
  ctx.fillStyle = side === 'blue' ? '#ffffff' : '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = side === 'blue' ? C.BLUE : C.RED;
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

  // HP bar
  drawHPBar(ctx, cx, cy - size - 12, size * 1.6, base.hp / base.maxHp);
}

function drawDefenseTower(ctx: CanvasRenderingContext2D, tower: DefenseTower): void {
  if (!tower.alive) return;
  const cx = tower.pos.x, cy = tower.pos.y;
  const size = CELL_SIZE * 0.9;
  const color = tower.side === 'blue' ? C.TOWER_BLUE : C.TOWER_RED;
  const stroke = tower.side === 'blue' ? C.BLUE : C.RED;

  // Body
  ctx.fillStyle = color + '80';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i - Math.PI / 6;
    const px = cx + Math.cos(angle) * size * 0.6;
    const py = cy + Math.sin(angle) * size * 0.6;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Inner circle
  ctx.fillStyle = stroke;
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

  // HP bar
  drawHPBar(ctx, cx, cy - size - 8, size * 1.2, tower.hp / tower.maxHp);
}

// ============================================================
// Entities: tanks, bullets, particles
// ============================================================

function drawTanksLayer(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  // Player (blue with highlight)
  if (state.player.alive) {
    drawTank(ctx, state.player);
    // Player highlight ring
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(state.player.pos.x, state.player.pos.y, TANK_RADIUS + 4, 0, Math.PI * 2); ctx.stroke();
  }

  // Blue AI allies
  for (const ally of state.blueTanks) {
    if (!ally.alive) continue;
    drawTank(ctx, ally as any);
  }

  // Red enemies
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    drawTank(ctx, enemy);
  }

  // Debug: attack ranges (Siege pattern: fire radius inner + vision radius outer)
  if (state.showDebug) {
    ctx.font = '10px monospace';
    // Tower attack ranges
    ctx.setLineDash([6, 4]);
    for (const t of state.blueTowers) {
      if (!t.alive) continue;
      ctx.strokeStyle = 'rgba(74,158,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.fireRange, 0, Math.PI * 2); ctx.stroke();
    }
    for (const t of state.redTowers) {
      if (!t.alive) continue;
      ctx.strokeStyle = 'rgba(255,85,85,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.fireRange, 0, Math.PI * 2); ctx.stroke();
    }
    // Base attack ranges (thicker)
    ctx.strokeStyle = 'rgba(74,158,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(state.blueBase.pos.x, state.blueBase.pos.y, state.blueBase.fireRange, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,85,85,0.6)';
    ctx.beginPath(); ctx.arc(state.redBase.pos.x, state.redBase.pos.y, state.redBase.fireRange, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(74,158,255,0.8)'; ctx.fillText('蓝基地', state.blueBase.pos.x + state.blueBase.fireRange + 4, state.blueBase.pos.y);
    ctx.fillStyle = 'rgba(255,85,85,0.8)'; ctx.fillText('红基地', state.redBase.pos.x + state.redBase.fireRange + 4, state.redBase.pos.y);
    ctx.setLineDash([]);
    // AI tank debug: fire radius (red, inner) + vision radius (blue, outer)
    const allAI = [
      ...state.blueTanks.map(t => ({ tank: t, ctx: state.blueAiContexts.get(t.id), color: '#4a9eff' })),
      ...state.enemies.map(t => ({ tank: t, ctx: state.redAiContexts.get(t.id), color: '#ff6b4a' })),
    ];
    for (const ai of allAI) {
      if (!ai.tank.alive || !ai.ctx) continue;
      const t = ai.tank, c = ai.ctx;
      ctx.setLineDash([6, 3]);
      // Fire radius (inner, red)
      ctx.strokeStyle = 'rgba(255,50,30,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, c.fireRadius, 0, Math.PI * 2); ctx.stroke();
      // Vision radius (outer, blue)
      ctx.strokeStyle = 'rgba(74,180,255,0.6)';
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, c.visionRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Labels
      ctx.fillStyle = 'rgba(255,50,30,0.8)'; ctx.textAlign = 'left';
      ctx.fillText('射程', t.pos.x + c.fireRadius + 4, t.pos.y - 4);
      ctx.fillStyle = 'rgba(74,180,255,0.8)';
      ctx.fillText('视野', t.pos.x + c.visionRadius + 4, t.pos.y + 14);
    }
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, bullets: BulletEntity[]): void {
  for (const b of bullets) {
    if (!b.alive) continue;
    // Trail
    ctx.strokeStyle = b.isPlayerBullet ? 'rgba(255,224,102,0.4)' : 'rgba(255,100,100,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.pos.x, b.pos.y);
    ctx.lineTo(b.pos.x - b.vel.x * 0.02, b.pos.y - b.vel.y * 0.02);
    ctx.stroke();
    // Dot
    ctx.fillStyle = b.isPlayerBullet ? '#ffe066' : '#ff4444';
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, BULLET_RADIUS + 1, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.fillStyle = b.isPlayerBullet ? 'rgba(255,224,102,0.3)' : 'rgba(255,68,68,0.3)';
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, BULLET_RADIUS + 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRiverWater(ctx: CanvasRenderingContext2D): void {
  const t = Date.now() / 1000;
  const riverX = 14 * CELL_SIZE;
  const riverW = 2 * CELL_SIZE;
  // Clip to river region
  ctx.save();
  ctx.beginPath(); ctx.rect(riverX, 0, riverW, MAP_H); ctx.clip();
  // 3 wave layers (Noah-style sine waves)
  for (let layer = 0; layer < 3; layer++) {
    const alpha = [0.6, 0.4, 0.3][layer];
    const r = [5, 10, 20][layer], g = [15, 30, 50][layer], b = [50, 80, 120][layer];
    const amp = [14, 11, 8][layer], freq = [0.03, 0.05, 0.07][layer];
    const speed = [5.4, 8.4, 12][layer];
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    for (let y = 0; y < MAP_H; y += 2) {
      const wave = Math.sin(y * freq + t * speed) * amp + Math.sin(y * (freq*2.3) + t * (speed*1.4)) * (amp*0.57);
      ctx.fillRect(riverX + wave, y, 2, 2);
    }
  }
  // Wave crest highlights
  ctx.strokeStyle = 'rgba(140,210,255,0.4)'; ctx.lineWidth = 2;
  for (let y = 0; y < MAP_H; y += 3) {
    const wy = Math.sin(y * 0.05 + t * 8.4) * 10 + Math.sin(y * 0.1 + t * 12) * 6;
    ctx.beginPath(); ctx.moveTo(riverX + wy, y); ctx.lineTo(riverX + wy + 2, y); ctx.stroke();
  }
  // Surface spray particles
  for (let i = 0; i < 4; i++) {
    const sy = Math.random() * MAP_H;
    const sx = riverX + Math.random() * riverW;
    const c = Math.random() < 0.5 ? '#ffffff' : '#88ccff';
    ctx.fillStyle = c; ctx.globalAlpha = 0.5 + Math.random() * 0.4;
    ctx.beginPath(); ctx.arc(sx, sy, 2 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLaneRoutes(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
  // Blue → Red and Red → Blue (symmetric)
  const allRoutes = [...BLUE_LANE_WAYPOINTS, ...RED_LANE_WAYPOINTS];
  for (const waypoints of allRoutes) {
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPhysicsBlocks(ctx: CanvasRenderingContext2D, blocks: PhysicsBlock[]): void {
  for (const b of blocks) {
    if (!b.alive) continue;
    const s = b.radius;
    if (b.tileType === TileType.METAL) {
      ctx.fillStyle = C.METAL; ctx.strokeStyle = '#5a6276'; ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = C.BRICK; ctx.strokeStyle = '#6b5530'; ctx.lineWidth = 1;
    }
    ctx.fillRect(b.pos.x - s, b.pos.y - s, s * 2, s * 2);
    ctx.strokeRect(b.pos.x - s, b.pos.y - s, s * 2, s * 2);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: any[]): void {
  for (const p of particles) {
    if (!p.alive) continue;
    const alpha = p.maxLife > 0 ? Math.min(1, p.life / p.maxLife) : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// HUD
// ============================================================

export function drawTwoKingsHUD(ctx: CanvasRenderingContext2D, state: TwoKingsState): void {
  // Top bar background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, MAP_W, 48);

  // Timer
  const remaining = Math.max(0, 240 - state.elapsedTime);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  ctx.fillStyle = remaining < 30 ? '#ff4444' : '#ffffff';
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`⏱ ${timeStr}`, MAP_W / 2, 30);

  // Blue base HP (left)
  ctx.fillStyle = C.BLUE;
  ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`🟦 基地 ${Math.ceil(state.blueBase.hp)}/${state.blueBase.maxHp}`, 10, 30);
  // Blue towers
  let towerStr = '塔: ';
  for (const t of state.blueTowers) towerStr += t.alive ? '✅' : '❌';
  ctx.fillText(towerStr, 10, 44);

  // Red base HP (right)
  ctx.fillStyle = C.RED;
  ctx.textAlign = 'right';
  ctx.fillText(`🟥 基地 ${Math.ceil(state.redBase.hp)}/${state.redBase.maxHp}`, MAP_W - 10, 30);
  towerStr = '塔: ';
  for (let i = 2; i >= 0; i--) towerStr += state.redTowers[i].alive ? '✅' : '❌';
  ctx.fillText(towerStr, MAP_W - 10, 44);

  // Wave info
  ctx.fillStyle = C.TEXT_DIM;
  ctx.textAlign = 'center';
  ctx.font = '11px monospace';
  ctx.fillText(`波次 ${state.wavesSpawned}/5 | 蓝方 ${state.blueTanks.filter(t=>t.alive).length} vs 红方 ${state.enemies.filter(e=>e.alive).length}`, MAP_W / 2, 44);

  // Skill message
  if (state.skillMessageTime > 0 && state.skillMessage) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.skillMessage, MAP_W / 2, MAP_H - 20);
  }

  // Gear button during playing
  if (state.phase === 'playing') {
    drawGearButton(ctx);
  }

  // Pause overlay
  if (state.phase === 'paused') {
    drawPauseOverlay(ctx);
  }
}

// ============================================================
// Overlay helper
// ============================================================

function drawOverlay(ctx: CanvasRenderingContext2D, lines: string[]): void {
  ctx.fillStyle = C.OVERLAY;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  ctx.fillStyle = C.TEXT;
  ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';

  const startY = MAP_H / 2 - lines.length * 14;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], MAP_W / 2, startY + i * 28);
  }
}

// ============================================================
// Hit testing
// ============================================================

export function hitTestTwoKingsBackButton(mx: number, my: number): boolean {
  // Bottom-center back button
  const bx = MAP_W / 2 - 50, by = MAP_H - 40;
  return mx >= bx && mx <= bx + 100 && my >= by && my <= by + 30;
}

function drawHPBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, ratio: number): void {
  const h = 3;
  ctx.fillStyle = C.HP_BAR_BG;
  ctx.fillRect(cx - w / 2, cy, w, h);
  ctx.fillStyle = ratio > 0.3 ? C.HP_OK : C.HP_LOW;
  ctx.fillRect(cx - w / 2, cy, w * Math.max(0, ratio), h);
}
