import { CELL_SIZE, MAP_W, MAP_H, TileType, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity, TANK_RADIUS } from '../entities/Tank';
import { BulletEntity, BULLET_RADIUS } from '../entities/Bullet';
import { SiegeState, TOTAL_WAVES } from '../modes/Siege';
import { roundRect, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';
import { Particle } from '../entities/Particle';
import { PhysicsBlock } from '../entities/PhysicsBlock';
import { FireZone } from '../entities/FireZone';
import { isSmokeActive } from '../systems/Commander';

// ============================================================
// Color palette
// ============================================================

const C = {
  BG: '#1a1d23',
  GRID_LINE: '#2a2d35',
  BRICK: '#c4946a',
  BRICK_STROKE: '#8b6b4a',
  METAL: '#7a8296',
  METAL_STROKE: '#5a6276',
  PLAYER: '#4a9eff',
  PLAYER_DARK: '#2a6ecc',
  ENEMY: '#ff6b4a',
  ENEMY_DARK: '#cc3a22',
  BULLET_PLAYER: '#ffe066',
  BULLET_ENEMY: '#ff4444',
  BULLET_TRAIL: 'rgba(255,255,255,0.3)',
  COMMAND_CENTER: '#4ae0a0',
  COMMAND_CENTER_DMG: '#e0a04a',
  HP_BAR_BG: '#333',
  HP_BAR_OK: '#4a9eff',
  HP_BAR_LOW: '#ff4444',
  TEXT: '#e8e8e8',
  TEXT_DIM: '#888',
  OVERLAY: 'rgba(0,0,0,0.6)',
};

// ============================================================
// Main render function
// ============================================================

export function renderSiege(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  // Screen shake
  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 2 : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 2 : 0;

  ctx.save();
  if (shakeX !== 0 || shakeY !== 0) {
    ctx.translate(shakeX, shakeY);
  }

  clear(ctx);
  drawGrid(ctx);
  drawMap(ctx, state.map);
  drawCommandCenter(ctx, state);
  drawTank(ctx, state.player);
  // Smoke skill: large obscuring cloud around player
  if (isSmokeActive(state.player)) {
    drawSmokeCloud(ctx, state.player);
  }
  for (const enemy of state.enemies) {
    drawTank(ctx, enemy);
    // U-key debug: vision/fire radii (drawn after tank restore, in screen space)
    if (state.showDebug && enemy.alive) {
      const aiCtx = state.aiContexts.get(enemy.id);
      if (aiCtx) {
        // Fire radius (inner, red)
        ctx.strokeStyle = 'rgba(255,50,30,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.arc(enemy.pos.x, enemy.pos.y, aiCtx.fireRadius, 0, Math.PI * 2);
        ctx.stroke();
        // Vision radius (outer, blue)
        ctx.strokeStyle = 'rgba(74,180,255,0.6)';
        ctx.beginPath();
        ctx.arc(enemy.pos.x, enemy.pos.y, aiCtx.visionRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Labels
        ctx.fillStyle = 'rgba(255,50,30,0.8)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('射程', enemy.pos.x + aiCtx.fireRadius + 4, enemy.pos.y - 4);
        ctx.fillStyle = 'rgba(74,180,255,0.8)';
        ctx.fillText('视野', enemy.pos.x + aiCtx.visionRadius + 4, enemy.pos.y + 14);
      }
    }
  }
  for (const block of state.physicsBlocks) {
    drawPhysicsBlock(ctx, block);
  }
  for (const bullet of state.bullets) {
    drawBullet(ctx, bullet);
  }
  for (const p of state.particles) {
    drawParticle(ctx, p);
  }
  for (const zone of state.fireZones) {
    drawFireZone(ctx, zone);
  }

  ctx.restore(); // end screen shake — UI below is stable

  // Overlay for intro/victory/defeat
  if (state.phase === 'intro') {
    const mapLabel = {
      classic: '经典防线', arena: '角斗场', maze: '迷宫', crossfire: '交叉火力',
      rivers: '两河流域', fortress: '堡垒', spiral: '螺旋',
      icerink: '溜冰场', colosseum: '修罗场',
    }[state.mapName] ?? state.mapName;
    drawOverlay(ctx, ['🏰 围城模式', '', `地图: ${mapLabel}`, '保护指挥所，存活 3 分钟', '', '点击屏幕 或 按 Enter/Space 开始']);
  } else if (state.phase === 'victory') {
    drawOverlay(ctx, ['🎉 防守成功！', '', `击毁敌坦: ${state.enemiesKilled}`, ...rewardText(state)]);
    drawSiegeBackButton(ctx);
  } else if (state.phase === 'defeat') {
    drawOverlay(ctx, ['💀 指挥所沦陷', '', `坚持了 ${Math.floor(state.elapsedTime)} 秒`, ...rewardText(state)]);
    drawSiegeBackButton(ctx);
  } else if (state.phase === 'playing' || state.phase === 'paused') {
    // Gear button during gameplay
    drawGearButton(ctx);

    // Pause overlay
    if (state.phase === 'paused') {
      drawPauseOverlay(ctx);
    }
  }
}

// ============================================================
// Gear button + Pause overlay
// ============================================================

const GEAR_R = 14;
const GEAR_X = MAP_W - GEAR_R - 8;
const GEAR_Y = GEAR_R + 8;

function drawGearButton(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(GEAR_X, GEAR_Y, GEAR_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ccc';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚙', GEAR_X, GEAR_Y);
}

export function hitTestGearButton(px: number, py: number): boolean {
  const dx = px - GEAR_X;
  const dy = py - GEAR_Y;
  return dx * dx + dy * dy < GEAR_R * GEAR_R;
}

function drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
  // Dim background
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Pause panel
  const pw = 220;
  const ph = 140;
  const px = (MAP_W - pw) / 2;
  const py = (MAP_H - ph) / 2;

  ctx.fillStyle = '#2a2d35';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⏸ 已暂停', px + pw / 2, py + 32);

  // Resume button
  const resumeBtn: ButtonDef = {
    x: px + 20, y: py + 50, w: 180, h: 34,
    label: '▶ 继续游戏', color: '#3a6a3a',
  };
  drawButton(ctx, resumeBtn);

  // Quit button
  const quitBtn: ButtonDef = {
    x: px + 20, y: py + 92, w: 180, h: 34,
    label: '🚪 返回大厅', color: '#6a3a3a',
  };
  drawButton(ctx, quitBtn);
}

export function hitTestPauseResume(px: number, py: number): boolean {
  const pw = 220; const ph = 140;
  const ppx = (MAP_W - pw) / 2;
  const ppy = (MAP_H - ph) / 2;
  const btn: ButtonDef = { x: ppx + 20, y: ppy + 50, w: 180, h: 34, label: '', color: '' };
  return hitTestButton(px, py, btn);
}

export function hitTestPauseQuit(px: number, py: number): boolean {
  const pw = 220; const ph = 140;
  const ppx = (MAP_W - pw) / 2;
  const ppy = (MAP_H - ph) / 2;
  const btn: ButtonDef = { x: ppx + 20, y: ppy + 92, w: 180, h: 34, label: '', color: '' };
  return hitTestButton(px, py, btn);
}

// ============================================================
// Siege result button
// ============================================================

const SIEGE_BTN_W = 160;
const SIEGE_BTN_H = 40;

export function getSiegeBackButton(): ButtonDef {
  return {
    x: (MAP_W - SIEGE_BTN_W) / 2,
    y: MAP_H - SIEGE_BTN_H - 30,
    w: SIEGE_BTN_W,
    h: SIEGE_BTN_H,
    label: '← 返回车间',
    color: '#3a6a3a',
  };
}

function drawSiegeBackButton(ctx: CanvasRenderingContext2D): void {
  drawButton(ctx, getSiegeBackButton());
}

export function hitTestSiegeBackButton(px: number, py: number): boolean {
  return hitTestButton(px, py, getSiegeBackButton());
}

function rewardText(state: SiegeState): string[] {
  if (!state.pendingReward) return [];
  const r = state.pendingReward;
  return [
    '',
    `🪙 金币 +${r.gold}`,
    r.partDrop ? `📦 获得零件: ${r.partDrop.name}` : '📦 未掉落零件',
  ];
}

// ============================================================
// Drawing primitives
// ============================================================

function clear(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = C.GRID_LINE;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= MAP_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, MAP_H);
    ctx.stroke();
  }
  for (let y = 0; y <= MAP_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(MAP_W, y * CELL_SIZE);
    ctx.stroke();
  }
}

function drawMap(ctx: CanvasRenderingContext2D, map: TileGrid): void {
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const tile = map[y][x];
      if (tile.type === TileType.EMPTY) continue;

      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;

      if (tile.type === TileType.BRICK) {
        if (tile.hp <= 0) continue; // destroyed
        ctx.fillStyle = C.BRICK;
        ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeStyle = C.BRICK_STROKE;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        // Brick pattern line
        ctx.beginPath();
        ctx.moveTo(px + CELL_SIZE / 2, py + 1);
        ctx.lineTo(px + CELL_SIZE / 2, py + CELL_SIZE - 1);
        ctx.moveTo(px + 1, py + CELL_SIZE / 2);
        ctx.lineTo(px + CELL_SIZE - 1, py + CELL_SIZE / 2);
        ctx.stroke();
      } else if (tile.type === TileType.METAL) {
        ctx.fillStyle = C.METAL;
        ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeStyle = C.METAL_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        // Metal rivet dots
        ctx.fillStyle = C.METAL_STROKE;
        [
          [px + 6, py + 6],
          [px + CELL_SIZE - 6, py + 6],
          [px + 6, py + CELL_SIZE - 6],
          [px + CELL_SIZE - 6, py + CELL_SIZE - 6],
        ].forEach(([rx, ry]) => {
          ctx.beginPath();
          ctx.arc(rx, ry, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }
}

function drawCommandCenter(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  const cx = Math.floor(MAP_COLS / 2) * CELL_SIZE + CELL_SIZE / 2;
  const cy = Math.floor(MAP_ROWS / 2) * CELL_SIZE + CELL_SIZE / 2;
  const size = CELL_SIZE * 1.2;

  // Glow
  const hpRatio = state.commandCenterHp / 500;
  const color = hpRatio > 0.3 ? C.COMMAND_CENTER : C.COMMAND_CENTER_DMG;
  ctx.fillStyle = color + '30';
  ctx.beginPath();
  ctx.arc(cx, cy, size + 5, 0, Math.PI * 2);
  ctx.fill();

  // Hexagon
  ctx.fillStyle = color + '60';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i - Math.PI / 6;
    const x = cx + Math.cos(angle) * size * 0.7;
    const y = cy + Math.sin(angle) * size * 0.7;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // HP bar
  const barW = size * 1.5;
  const barH = 4;
  const barX = cx - barW / 2;
  const barY = cy - size - 10;
  ctx.fillStyle = C.HP_BAR_BG;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = hpRatio > 0.3 ? C.HP_BAR_OK : C.HP_BAR_LOW;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);
}

// ============================================================
// Part-specific drawing helpers
// ============================================================

function drawChassis(
  ctx: CanvasRenderingContext2D, r: number,
  chassisId: string, primary: string, dark: string,
): void {
  const phi = 0.618; // golden ratio
  const bw = r * 2;          // body width
  const bh = bw * phi;       // body height (golden ratio)
  const hw = bw / 2;         // half width
  const hh = bh / 2;         // half height

  const colors: Record<string, { body: string; accent: string }> = {
    chassis_standard: { body: primary, accent: dark },
    chassis_inertia: { body: '#66aadd', accent: '#336688' },
    chassis_heavy: { body: '#8B7355', accent: '#5C4A32' },
    chassis_track: { body: '#88aa66', accent: '#446633' },
  };
  const bc = colors[chassisId] ?? { body: primary, accent: dark };

  if (chassisId === 'chassis_heavy') {
    // Heavy: wide armored trapezoid with golden ratio
    ctx.fillStyle = bc.body;
    ctx.strokeStyle = bc.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + 3, -hh); ctx.lineTo(hw - 3, -hh);
    ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Rivets
    for (const [dx, dy] of [[-hw*0.5,-hh],[hw*0.5,-hh],[-hw*0.7,hh*0.7],[hw*0.7,hh*0.7]]) {
      ctx.fillStyle = '#fff3';
      ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI*2); ctx.fill();
    }
  } else if (chassisId === 'chassis_inertia') {
    // Streamlined: teardrop/ellipse with golden ratio
    ctx.fillStyle = bc.body;
    ctx.strokeStyle = bc.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Speed line
    ctx.strokeStyle = '#fff6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.3, -hh * 0.2); ctx.lineTo(hw * 0.5, -hh * 0.2);
    ctx.stroke();
  } else if (chassisId === 'chassis_track') {
    // Track: compact body, tall treads
    ctx.fillStyle = bc.body;
    ctx.strokeStyle = bc.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.75, hh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tread blocks
    ctx.fillStyle = bc.accent;
    for (let i = 0; i < 6; i++) {
      const ty = -hh * 0.8 + i * (bh * 0.9 / 5);
      ctx.fillRect(-hw - 2, ty, 5, bh * 0.12);
      ctx.fillRect(hw - 3, ty, 5, bh * 0.12);
    }
  } else {
    // Standard: rounded rectangle, golden ratio
    ctx.fillStyle = bc.body;
    ctx.strokeStyle = bc.accent;
    ctx.lineWidth = 1.5;
    roundRect(ctx, -hw, -hh, bw, bh, bh * 0.3);
    ctx.fill();
    ctx.stroke();
    // Subtle tread
    ctx.fillStyle = bc.accent;
    ctx.fillRect(-hw - 1, -hh, 3, bh);
    ctx.fillRect(hw - 2, -hh, 3, bh);
  }
}

function drawRegularPolygon(ctx: CanvasRenderingContext2D, sides: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTurretBase(
  ctx: CanvasRenderingContext2D, r: number,
  turretId: string, _primary: string, _dark: string,
): void {
  const turretR = r * 0.6;

  if (turretId === 'turret_reactive') {
    // Regular hexagon — balanced, defensive
    ctx.fillStyle = '#55aa77';
    ctx.strokeStyle = '#337744';
    ctx.lineWidth = 2;
    drawRegularPolygon(ctx, 6, turretR);
    ctx.fill();
    ctx.stroke();
  } else if (turretId === 'turret_heavy') {
    // Regular pentagon — heavy, imposing
    ctx.fillStyle = '#335577';
    ctx.strokeStyle = '#1a3344';
    ctx.lineWidth = 2.5;
    drawRegularPolygon(ctx, 5, turretR);
    ctx.fill();
    ctx.stroke();
    // Inner pentagon
    ctx.strokeStyle = '#fff2';
    ctx.lineWidth = 1;
    drawRegularPolygon(ctx, 5, turretR * 0.55);
    ctx.stroke();
  } else {
    // Light: equilateral triangle — agile, sharp
    ctx.fillStyle = '#88bbee';
    ctx.strokeStyle = '#5588aa';
    ctx.lineWidth = 2;
    drawRegularPolygon(ctx, 3, turretR);
    ctx.fill();
    ctx.stroke();
  }
}

function drawBarrel(
  ctx: CanvasRenderingContext2D, r: number,
  barrelId: string, _primary: string, _dark: string,
): void {
  const w = r; // scale with tank size
  const barrelSpecs: Record<string, { color: string; draw: () => void }> = {
    barrel_straight: {
      color: '#8899aa',
      draw: () => { ctx.fillRect(w * 0.4, -3, w * 1.2, 6); },
    },
    barrel_bounce: {
      color: '#aabbcc',
      draw: () => {
        ctx.fillRect(w * 0.4, -2.5, w, 5);
        ctx.beginPath();
        ctx.moveTo(w * 1.4, -2.5); ctx.lineTo(w * 1.9, -6); ctx.lineTo(w * 1.7, -2.5);
        ctx.closePath(); ctx.fill();
      },
    },
    barrel_pierce: {
      color: '#5588cc',
      draw: () => { ctx.fillRect(w * 0.3, -2, w * 1.8, 4); },
    },
    barrel_arc: {
      color: '#dd8844',
      draw: () => {
        ctx.fillRect(w * 0.3, -2, w * 0.6, 4);
        ctx.beginPath();
        ctx.moveTo(w * 0.9, -2); ctx.quadraticCurveTo(w * 1.2, -10, w * 1.5, -7);
        ctx.lineTo(w * 1.3, -3); ctx.quadraticCurveTo(w * 1.0, -5, w * 0.9, -2);
        ctx.fill();
      },
    },
    barrel_firework: {
      color: '#ffaa33',
      draw: () => {
        ctx.fillRect(w * 0.3, -4, w * 1.4, 8);
        ctx.fillStyle = '#cc7700';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(w * 0.5 + i * w * 0.38, -5, 3, 10);
        }
      },
    },
    barrel_orbital: {
      color: '#9966cc',
      draw: () => {
        ctx.fillRect(w * 0.3, -5, w * 1.2, 3);
        ctx.fillRect(w * 0.3, 2, w * 1.2, 3);
        ctx.fillStyle = '#7744aa';
        ctx.fillRect(w * 0.6, -3, 4, 6);
      },
    },
    barrel_sniper: {
      color: '#cc3333',
      draw: () => {
        ctx.fillRect(w * 0.2, -2, w * 2.2, 4);
        ctx.fillStyle = '#333';
        ctx.fillRect(w * 0.8, -5, w * 0.5, 3);
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(w * 0.85, -4.5, w * 0.4, 2);
      },
    },
    barrel_gatling: {
      color: '#667788',
      draw: () => {
        // Multiple rotating barrels
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i;
          const by = Math.sin(a) * 3;
          ctx.fillRect(w * 0.3, -2 + by, w * 1.1, 2);
        }
        // Barrel shroud
        ctx.strokeStyle = '#445566';
        ctx.lineWidth = 1;
        roundRect(ctx, w * 0.25, -4, w * 0.3, 8, 2);
        ctx.stroke();
      },
    },
    barrel_rocket: {
      color: '#44aa44',
      draw: () => {
        // Wide rocket tube
        ctx.fillRect(w * 0.3, -5, w * 1.0, 10);
        // Rocket inside
        ctx.fillStyle = '#cc3333';
        ctx.beginPath();
        ctx.moveTo(w * 1.4, 0);
        ctx.lineTo(w * 0.8, -4);
        ctx.lineTo(w * 0.8, 4);
        ctx.closePath();
        ctx.fill();
        // Fins
        ctx.fillStyle = '#226622';
        ctx.fillRect(w * 0.4, -7, 4, 3);
        ctx.fillRect(w * 0.4, 4, 4, 3);
      },
    },
  };

  const spec = barrelSpecs[barrelId] ?? barrelSpecs.barrel_straight;
  ctx.fillStyle = spec.color;
  spec.draw();
}

function drawTank(ctx: CanvasRenderingContext2D, tank: TankEntity): void {
  if (!tank.alive) return;

  const { x, y } = tank.pos;
  const r = TANK_RADIUS;
  const primary = tank.isPlayer ? C.PLAYER : C.ENEMY;
  const dark = tank.isPlayer ? C.PLAYER_DARK : C.ENEMY_DARK;
  const chassisId = tank.config.chassis.id;
  const turretId = tank.config.turret.id;
  const barrelId = tank.config.barrel.id;

  // ---- Body (rotates at tank.dir) ----
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tank.dir);

  drawChassis(ctx, r, chassisId, primary, dark);

  ctx.restore();

  // ---- Turret (rotates at tank.turretAngle) ----
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tank.turretAngle);

  drawTurretBase(ctx, r, turretId, primary, dark);
  drawBarrel(ctx, r, barrelId, primary, dark);

  ctx.restore();

  // ---- HP bar (screen space, no rotation) ----
  if (tank.hp < tank.maxHp) {
    const barW = r * 2;
    const barH = 3;
    const barX = x - barW / 2;
    const barY = y - r - 8;
    ctx.fillStyle = C.HP_BAR_BG;
    ctx.fillRect(barX, barY, barW, barH);
    const ratio = tank.hp / tank.maxHp;
    ctx.fillStyle = ratio > 0.3 ? C.HP_BAR_OK : C.HP_BAR_LOW;
    ctx.fillRect(barX, barY, barW * ratio, barH);
  }
}

function drawFireZone(ctx: CanvasRenderingContext2D, zone: FireZone): void {
  if (!zone.alive) return;
  const alpha = zone.lifetime / zone.maxLifetime;
  // Outer glow
  const grad = ctx.createRadialGradient(zone.pos.x, zone.pos.y, zone.radius * 0.3, zone.pos.x, zone.pos.y, zone.radius);
  grad.addColorStop(0, `rgba(255,80,0,${0.15 * alpha})`);
  grad.addColorStop(0.5, `rgba(255,40,0,${0.08 * alpha})`);
  grad.addColorStop(1, `rgba(255,0,0,0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(zone.pos.x, zone.pos.y, zone.radius, 0, Math.PI * 2);
  ctx.fill();
  // Border ring
  ctx.strokeStyle = `rgba(255,60,0,${0.5 * alpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.arc(zone.pos.x, zone.pos.y, zone.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  if (!p.alive) return;
  const alpha = p.life / p.maxLife;

  if (p.isCross) {
    // Green + cross for repair
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    const s = p.radius;
    ctx.beginPath();
    ctx.moveTo(p.pos.x - s, p.pos.y);
    ctx.lineTo(p.pos.x + s, p.pos.y);
    ctx.moveTo(p.pos.x, p.pos.y - s);
    ctx.lineTo(p.pos.x, p.pos.y + s);
    ctx.stroke();
    ctx.lineWidth = 1;
  } else if (p.smokeExpand) {
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSmokeCloud(ctx: CanvasRenderingContext2D, tank: TankEntity): void {
  const { x, y } = tank.pos;
  const r = TANK_RADIUS * 2.5;
  // Large soft gray cloud obscuring the tank
  const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  grad.addColorStop(0, 'rgba(150,150,150,0.5)');
  grad.addColorStop(0.5, 'rgba(130,130,130,0.3)');
  grad.addColorStop(1, 'rgba(100,100,100,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPhysicsBlock(ctx: CanvasRenderingContext2D, block: PhysicsBlock): void {
  if (!block.alive) return;
  ctx.save();
  ctx.translate(block.pos.x, block.pos.y);

  const s = block.radius;
  if (block.tileType === TileType.METAL) {
    ctx.fillStyle = C.METAL;
    ctx.strokeStyle = C.METAL_STROKE;
    ctx.lineWidth = 2;
    roundRect(ctx, -s, -s, s * 2, s * 2, 3);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = C.BRICK;
    ctx.strokeStyle = C.BRICK_STROKE;
    ctx.lineWidth = 1;
    roundRect(ctx, -s, -s, s * 2, s * 2, 3);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, bullet: BulletEntity): void {
  if (!bullet.alive) return;

  // Trail
  ctx.strokeStyle = bullet.isPlayerBullet ? C.BULLET_TRAIL : 'rgba(255,100,100,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bullet.pos.x, bullet.pos.y);
  ctx.lineTo(
    bullet.pos.x - bullet.vel.x * 0.02,
    bullet.pos.y - bullet.vel.y * 0.02,
  );
  ctx.stroke();

  // Bullet dot
  ctx.fillStyle = bullet.isPlayerBullet ? C.BULLET_PLAYER : C.BULLET_ENEMY;
  ctx.beginPath();
  ctx.arc(bullet.pos.x, bullet.pos.y, BULLET_RADIUS + 1, 0, Math.PI * 2);
  ctx.fill();

  // Glow
  ctx.fillStyle = bullet.isPlayerBullet ? 'rgba(255,224,102,0.4)' : 'rgba(255,68,68,0.4)';
  ctx.beginPath();
  ctx.arc(bullet.pos.x, bullet.pos.y, BULLET_RADIUS + 3, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// Overlay & UI helpers
// ============================================================

function drawOverlay(ctx: CanvasRenderingContext2D, lines: string[]): void {
  ctx.fillStyle = C.OVERLAY;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  ctx.fillStyle = C.TEXT;
  ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';

  const startY = MAP_H / 2 - lines.length * 14;
  lines.forEach((line, i) => {
    if (line.startsWith('🏰') || line.startsWith('🎉') || line.startsWith('💀')) {
      ctx.font = 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    } else {
      ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
    }
    ctx.fillText(line, MAP_W / 2, startY + i * 28);
  });
}

export function drawHUD(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  // Timer (center)
  const remaining = Math.max(0, 180 - state.elapsedTime);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  ctx.fillStyle = remaining <= 30 ? '#ff4444' : C.TEXT;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`⏱ ${timeStr}`, MAP_W / 2, 20);

  // Wave info
  const currentWave = state.wavesSpawned;
  ctx.fillStyle = C.TEXT_DIM;
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`波次: ${currentWave}/${TOTAL_WAVES}`, 12, 20);

  // Kill count
  ctx.fillText(`击毁: ${state.enemiesKilled}`, 12, 38);

  // Skill message
  if (state.skillMessageTime > 0 && state.skillMessage) {
    state.skillMessageTime -= 16; // ~60fps
    const alpha = Math.min(1, state.skillMessageTime / 500);
    ctx.fillStyle = `rgba(74, 224, 160, ${alpha})`;
    ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(state.skillMessage, MAP_W - 60, 38);
  }

  // Command center HP
  const ccHp = state.commandCenterHp;
  ctx.fillText(`指挥所: ${ccHp}/500`, 12, 56);
}

export { MAP_W as W, MAP_H as H };
