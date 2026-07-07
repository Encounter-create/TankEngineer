// ============================================================
// 对战大厅 — mode select + map select + tank preview
// ============================================================

import { TankConfig } from '../entities/Parts';
import { MapName, ALL_MAPS, createMap } from '../entities/Map';
import { roundRect, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';
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
  devMode: boolean = false,
): void {
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  // Developer mode toggle (top-right)
  const devX = w - 130, devY = 4, devW = 120, devH = 22;
  ctx.fillStyle = devMode ? '#2a6a2a' : '#4a3a3a';
  ctx.strokeStyle = devMode ? '#4ae0a0' : '#ff6b4a';
  ctx.lineWidth = 2;
  roundRect(ctx, devX, devY, devW, devH, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = devMode ? '#4ae0a0' : '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(devMode ? '🛡️ DEV ON' : '🔧 DEV OFF', devX + devW/2, devY + devH/2);

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚔️ 对战大厅', w / 2, 28);

  // ---- Left panel: Mode selection ----
  const leftX = 12;
  const leftW = 200;

  ctx.fillStyle = '#22252c';
  roundRect(ctx, leftX, 50, leftW, 220, 6);
  ctx.fill();

  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('游戏模式', leftX + 12, 72);

  MODES.forEach((mode, i) => {
    const my = 86 + i * 44;
    const selected = lobby.selectedMode === mode.id;

    ctx.fillStyle = selected ? '#2a4a6a' : '#2a2d35';
    ctx.strokeStyle = selected ? '#4a9eff' : mode.available ? '#444' : '#333';
    ctx.lineWidth = 1;
    roundRect(ctx, leftX + 6, my, leftW - 12, 36, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = mode.available ? '#fff' : '#555';
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mode.label, leftX + 18, my + 16);

    ctx.fillStyle = mode.available ? '#888' : '#555';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(mode.available ? mode.desc : '即将开放', leftX + 18, my + 30);
  });

  // ---- Right panel: Map selection ----
  const rightX = 224;
  const rightW = w - rightX - 12;
  const mapPreviewW = 72;
  const mapPreviewH = 52;
  const mapCols = 3;

  ctx.fillStyle = '#22252c';
  roundRect(ctx, rightX, 50, rightW, 300, 6);
  ctx.fill();

  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('地图选择 (7张)', rightX + 12, 72);

  ALL_MAPS.forEach((mapName, i) => {
    const col = i % mapCols;
    const row = Math.floor(i / mapCols);
    const mx = rightX + 16 + col * (mapPreviewW + 16);
    const my = 86 + row * (mapPreviewH + 28);
    const selected = lobby.selectedMap === mapName;

    // Map thumbnail
    ctx.fillStyle = selected ? '#2a4a6a' : '#2a2d35';
    ctx.strokeStyle = selected ? '#4a9eff' : '#555';
    ctx.lineWidth = selected ? 2 : 1;
    roundRect(ctx, mx, my, mapPreviewW, mapPreviewH, 4);
    ctx.fill();
    ctx.stroke();

    // Mini map preview
    drawMiniMap(ctx, mx + 4, my + 4, mapPreviewW - 8, mapPreviewH - 8, mapName);

    // Map name
    ctx.fillStyle = selected ? '#fff' : '#ccc';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(MAP_LABELS[mapName], mx + mapPreviewW / 2, my + mapPreviewH + 14);

    // Description (only for selected)
    if (selected) {
      ctx.fillStyle = '#888';
      ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(MAP_DESCS[mapName], rightX + 16, my + mapPreviewH + 30);
    }
  });

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

  // Buttons
  const btnY = barY + 36;
  const buttons: ButtonDef[] = [
    { x: 12, y: btnY, w: 100, h: 30, label: '🔧 组装', color: '#3a5a3a' },
    { x: 120, y: btnY, w: 100, h: 30, label: '🏪 商店', color: '#2a3a5a' },
    { x: 228, y: btnY, w: 110, h: 30, label: '📚 图鉴', color: '#3a3a4a' },
  ];
  for (const btn of buttons) drawButton(ctx, btn);

  // Start battle button (right side)
  const startBtn: ButtonDef = {
    x: w - 150 - 12, y: barY + 16, w: 150, h: 44,
    label: configValid ? '⚔️ 开始对战' : '⚔️ (未就绪)',
    color: configValid ? '#4a7a4a' : '#3a3a3a',
  };
  drawButton(ctx, startBtn);
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
    const my = 86 + i * 44;
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
    const my = 86 + row * (mapH + 28);
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
    { x: 12, y: btnY, w: 100, h: 30, label: '', color: '' },        // 0: garage
    { x: 120, y: btnY, w: 100, h: 30, label: '', color: '' },       // 1: shop
    { x: 228, y: btnY, w: 110, h: 30, label: '', color: '' },       // 2: encyclopedia
    { x: w - 150 - 12, y: barY + 16, w: 150, h: 44, label: '', color: '' }, // 3: start
  ];
  for (let i = 0; i < btns.length; i++) {
    if (hitTestButton(px, py, btns[i])) return i;
  }
  return -1;
}
