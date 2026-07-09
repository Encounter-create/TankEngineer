// ============================================================
// 对战大厅 — mode select + map select + tank preview
// ============================================================

import { TankConfig } from '../entities/Parts';
import { MapName, ALL_MAPS, createMap } from '../entities/Map';
import { roundRect, drawButton, ButtonDef, hitTestButton, UI } from '../utils/Canvas';
import { MAP_COLS, MAP_ROWS } from '../utils/Grid';

export interface LobbyState {
  selectedMode: string;     // 'siege' | 'chess' | 'territory' | 'pvp'
  selectedMap: MapName;
  selectedMapPreview: ImageData | null;
}

export function createLobbyState(): LobbyState {
  return {
    selectedMode: 'siege',
    selectedMap: 'classic',
    selectedMapPreview: null,
  };
}

const MODES = [
  { id: 'siege', label: '🏰 围城', desc: '防守指挥所3分钟', available: true },
  { id: 'twokings', label: '👑 双王战争', desc: '三路推进摧毁敌方基地', available: true },
  { id: 'chess', label: '♟️ 棋类', desc: '回合制策略对决', available: true },
  { id: 'territory', label: '🎨 涂地', desc: '区域控制拉锯战', available: false },
  { id: 'pvp', label: '🤖 PvP', desc: '异步编程对战', available: false },
];

const MAP_LABELS: Record<MapName, string> = {
  classic: '经典防线',
  arena: '角斗场',
  maze: '迷宫',
  crossfire: '交叉火力',
  rivers: '两河流域',
  fortress: '堡垒',
  spiral: '螺旋',
  icerink: '溜冰场',
  colosseum: '修罗场',
  testgrounds: '试验场',
};

const MAP_DESCS: Record<MapName, string> = {
  classic: '防御环+散落掩体，适合所有战术',
  arena: '开阔少掩体，纯走位和枪法比拼',
  maze: '密集砖墙走廊，透射/反射管大显身手',
  crossfire: 'X形金属墙，反弹射击的天堂',
  rivers: '两条金属河流分割战场，桥梁争夺战',
  fortress: '重装防御工事，攻城拔寨',
  spiral: '螺旋金属阵，弹道轨迹的几何艺术',
  icerink: '冰面零摩擦，方块永动，多米诺骨牌天堂',
  colosseum: '完全空旷，无任何掩体，硬碰硬死斗',
  testgrounds: '全地形测试: 水域·草丛·冰面·爆桶',
};

export function renderLobby(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lobby: LobbyState,
  config: TankConfig | null,
  configValid: boolean,
  mx?: number, my?: number,
  devMode: boolean = false,
): void {
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  // Developer mode toggle (top-right)
  const devX = w - 130, devY = 4, devW = 120, devH = 22;
  const devHover = mx !== undefined && my !== undefined && mx >= devX && mx <= devX + devW && my >= devY && my <= devY + devH;
  ctx.fillStyle = devMode ? (devHover ? '#3a8a3a' : '#2a6a2a') : (devHover ? '#6a4a4a' : '#4a3a3a');
  ctx.strokeStyle = devMode ? '#4ae0a0' : '#ff6b4a';
  ctx.lineWidth = devHover ? 3 : 2;
  roundRect(ctx, devX, devY, devW, devH, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = devMode ? '#4ae0a0' : '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(devMode ? '🛡️ DEV ON' : '🔧 DEV OFF', devX + devW/2, devY + devH/2);

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚔️ 对战大厅', w / 2, 28);

  const barTop = h - 80;
  const panelTop = 46;
  const panelH = barTop - panelTop - 6;

  // ---- Left panel: Mode selection ----
  const leftX = 12;
  const leftW = 200;

  ctx.fillStyle = '#22252c';
  roundRect(ctx, leftX, panelTop, leftW, panelH, 6);
  ctx.fill();

  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('游戏模式', leftX + 12, panelTop + 22);

  MODES.forEach((mode, i) => {
    const cardY = panelTop + 36 + i * 44;
    const selected = lobby.selectedMode === mode.id;
    const hovered = mx !== undefined && my !== undefined &&
      mx >= leftX + 6 && mx <= leftX + 6 + leftW - 12 && my >= cardY && my <= cardY + 36;

    ctx.fillStyle = selected ? '#2a4a6a' : (hovered ? '#333840' : '#2a2d35');
    ctx.strokeStyle = selected ? '#4a9eff' : (hovered ? '#888' : (mode.available ? '#444' : '#333'));
    ctx.lineWidth = hovered ? 1.5 : 1;
    roundRect(ctx, leftX + 6, cardY, leftW - 12, 36, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = mode.available ? '#fff' : '#555';
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mode.label, leftX + 18, cardY + 16);

    ctx.fillStyle = mode.available ? '#888' : '#555';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(mode.available ? mode.desc : '即将开放', leftX + 18, cardY + 30);
  });

  // ---- Right panel: Map/Mode preview ----
  const rightX = 224;
  const rightW = w - rightX - 12;

  ctx.fillStyle = '#22252c';
  roundRect(ctx, rightX, panelTop, rightW, panelH, 6);
  ctx.fill();

  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lobby.selectedMode === 'twokings' ? '👑 双王战争 — 对称三路地图' : lobby.selectedMode === 'chess' ? '♟️ 棋类 — 8×8棋盘' : '地图选择', rightX + 12, panelTop + 22);

  if (lobby.selectedMode === 'siege' || lobby.selectedMode === 'twokings') {
    const isSiege = lobby.selectedMode === 'siege';
    if (isSiege) {
      // Left: small thumbnail grid (3 cols, compact)
      const gridX = rightX + 12, gridW = 280, mapW = 72, mapH = 52, gapX = 12, gapY = 22, cols = 3;
      ALL_MAPS.forEach((mapName, i) => {
        const col = i % cols; const row = Math.floor(i / cols);
        const cx = gridX + col * (mapW + gapX);
        const cy = panelTop + 36 + row * (mapH + gapY);
        const selected = lobby.selectedMap === mapName;
        const hovered = mx !== undefined && my !== undefined && mx >= cx && mx <= cx + mapW && my >= cy && my <= cy + mapH;
        ctx.fillStyle = selected ? '#2a4a6a' : (hovered ? '#333840' : '#2a2d35');
        ctx.strokeStyle = selected ? '#4a9eff' : (hovered ? '#777' : '#555');
        ctx.lineWidth = selected ? 2 : (hovered ? 1.5 : 1);
        roundRect(ctx, cx, cy, mapW, mapH, 4); ctx.fill(); ctx.stroke();
        drawMiniMap(ctx, cx + 3, cy + 3, mapW - 6, mapH - 6, mapName);
        ctx.fillStyle = selected ? '#fff' : '#ccc'; ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(MAP_LABELS[mapName], cx + mapW/2, cy + mapH + 10);
      });
      // Right: large selected map preview + description
      const detailX = gridX + gridW + 12, detailW = rightW - gridW - 36;
      const detailY = panelTop + 36;
      const detailH = panelH - 80;
      ctx.fillStyle = '#2a2d35';
      roundRect(ctx, detailX, detailY, detailW, detailH, 4); ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
      roundRect(ctx, detailX, detailY, detailW, detailH, 4); ctx.stroke();
      const selMap = lobby.selectedMap;
      const lw = detailW - 16, lh = detailH - 50;
      drawMiniMap(ctx, detailX + 8, detailY + 8, lw, lh, selMap);
      ctx.fillStyle = '#4a9eff'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(MAP_LABELS[selMap], detailX + detailW/2, detailY + lh + 18);
      ctx.fillStyle = '#aaa'; ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(MAP_DESCS[selMap], detailX + detailW/2, detailY + lh + 34);
    } else {
      // TwoKings: show large static minimap
      const mw = rightW - 32, mh = panelH - 80;
      const mx2 = rightX + 16, my2 = panelTop + 36;
      drawTwoKingsMinimap(ctx, mx2, my2, mw, mh);
      ctx.fillStyle = '#888'; ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('对称三路推进 · 河流 · 桥梁 · 基地 · 防御塔', rightX + rightW/2, my2 + mh + 20);
    }
  } else if (lobby.selectedMode === 'chess') {
    // Chess: draw 8x8 board
    const boardSize = Math.min(rightW - 32, panelH - 80);
    const bx = rightX + (rightW - boardSize)/2, by = panelTop + 36;
    const cell = boardSize / 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#d4b896' : '#8b5e3c';
        ctx.fillRect(bx + c*cell, by + r*cell, cell, cell);
      }
    }
    ctx.fillStyle = '#888'; ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('回合制策略 · 8×8棋盘 · 三步一杀', rightX + rightW/2, by + boardSize + 20);
  } else {
    ctx.fillStyle = '#555'; ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('即将开放', rightX + rightW/2, panelTop + panelH/2);
  }

  // ---- Bottom bar: tank summary + buttons ----
  const barY = h - 80;
  ctx.fillStyle = '#22252c';
  ctx.fillRect(0, barY, w, 80);

  // Tank config summary
  if (config) {
    const wcEmoji = { light: '🪶', medium: '⚖️', heavy: '🏋️' }[config.weightClass];
    ctx.fillStyle = '#ccc';
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${wcEmoji} ${config.barrel.name} | ${config.turret.name} | ${config.chassis.name} | ${config.commander.name}  (总重:${config.totalWeight})`,
      12,
      barY + 28,
    );

    if (!configValid) {
      ctx.fillStyle = '#ff6b4a';
      ctx.textAlign = 'right';
      ctx.fillText('⚠ 请先完成坦克组装', w - 12, barY + 28);
    }
  }

  // Shortcut hints
  ctx.fillStyle = UI.TEXT_DIM;
  ctx.font = `10px ${UI.FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('键盘: O键快速测试双王 | 鼠标点击选择模式和地图 | 回车确认', w / 2, barY + 14);

  // Buttons
  const btnY = barY + 36;
  const buttons: ButtonDef[] = [
    { x: 8, y: btnY, w: 65, h: 30, label: '← 返回', color: '#444' },
    { x: 78, y: btnY, w: 82, h: 30, label: '🔧 组装', color: '#3a5a3a' },
    { x: 165, y: btnY, w: 82, h: 30, label: '🏪 商店', color: '#2a3a5a' },
    { x: 252, y: btnY, w: 82, h: 30, label: '📚 图鉴', color: '#3a3a4a' },
  ];
  for (const btn of buttons) drawButton(ctx, btn, mx, my);

  // Start battle button (right side)
  const startBtn: ButtonDef = {
    x: w - 150 - 12, y: barY + 16, w: 150, h: 44,
    label: configValid ? '⚔️ 开始对战' : '⚔️ (未就绪)',
    color: configValid ? '#4a7a4a' : '#3a3a3a',
  };
  drawButton(ctx, startBtn, mx, my);
}

// ============================================================
// TwoKings minimap preview
// ============================================================

function drawTwoKingsMinimap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cc = w / MAP_COLS, cr = h / MAP_ROWS;
  // Background
  ctx.fillStyle = '#1a1d23'; ctx.fillRect(x, y, w, h);
  // River (blue)
  ctx.fillStyle = '#3a6090';
  ctx.fillRect(x + 14*cc, y, 2*cc, h);
  // Bridges
  for (const row of [5, 11, 17]) {
    ctx.fillStyle = '#8b7355';
    ctx.fillRect(x + 14*cc, y + row*cr, 2*cc, cr);
  }
  // Blue base
  ctx.fillStyle = '#4a9eff';
  ctx.fillRect(x + 2*cc, y + 10*cr, cc, 3*cr);
  // Red base
  ctx.fillStyle = '#ff6b4a';
  ctx.fillRect(x + 27*cc, y + 10*cr, cc, 3*cr);
  // Blue towers
  ctx.fillStyle = '#3366cc';
  for (const tr of [3, 11, 19]) ctx.fillRect(x + 9*cc, y + tr*cr, cc, cr);
  // Red towers
  ctx.fillStyle = '#cc3333';
  for (const tr of [3, 11, 19]) ctx.fillRect(x + 20*cc, y + tr*cr, cc, cr);
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
}

// ============================================================
// Mini map thumbnail renderer
// ============================================================

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  mapName: MapName,
): void {
  const map = createMap(mapName);
  const cellW = w / MAP_COLS;
  const cellH = h / MAP_ROWS;

  for (let gy = 0; gy < MAP_ROWS; gy++) {
    for (let gx = 0; gx < MAP_COLS; gx++) {
      const tile = map[gy][gx];
      if (tile.type === 0) continue; // empty
      const tx = x + gx * cellW;
      const ty = y + gy * cellH;

      if (tile.type === 1) {
        ctx.fillStyle = '#8B7355'; // brick
      } else if (tile.type === 2) {
        ctx.fillStyle = '#666'; // metal
      }
      ctx.fillRect(tx, ty, Math.ceil(cellW), Math.ceil(cellH));
    }
  }
}

// ============================================================
// Hit testing
// ============================================================

export function hitTestLobbyMode(px: number, py: number): string | null {
  const leftX = 12;
  const leftW = 200;
  if (px < leftX || px > leftX + leftW) return null;

  for (let i = 0; i < MODES.length; i++) {
    const my = 82 + i * 44;
    if (py >= my && py <= my + 36) {
      return MODES[i].available ? MODES[i].id : null;
    }
  }
  return null;
}

export function hitTestLobbyMap(px: number, py: number, _w: number): MapName | null {
  const rightX = 224;
  const mapW = 72; const mapH = 52;
  const mapCols = 3;

  for (let i = 0; i < ALL_MAPS.length; i++) {
    const col = i % mapCols;
    const row = Math.floor(i / mapCols);
    const mx = rightX + 16 + col * (mapW + 16);
    const my = 82 + row * (mapH + 28);
    if (px >= mx && px <= mx + mapW && py >= my && py <= my + mapH + 14) {
      return ALL_MAPS[i];
    }
  }
  return null;
}

export function hitTestLobbyButtons(px: number, py: number, w: number, h: number): number {
  const barY = h - 80;
  const btnY = barY + 36;
  const btns: ButtonDef[] = [
    { x: 8, y: btnY, w: 65, h: 30, label: '', color: '' },          // 0: return
    { x: 78, y: btnY, w: 82, h: 30, label: '', color: '' },         // 1: garage
    { x: 165, y: btnY, w: 82, h: 30, label: '', color: '' },        // 2: shop
    { x: 252, y: btnY, w: 82, h: 30, label: '', color: '' },        // 3: encyclopedia
    { x: w - 150 - 12, y: barY + 16, w: 150, h: 44, label: '', color: '' }, // 4: start
  ];
  for (let i = 0; i < btns.length; i++) {
    if (hitTestButton(px, py, btns[i])) return i;
  }
  return -1;
}
