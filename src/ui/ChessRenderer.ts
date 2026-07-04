// ============================================================
// Chess mode renderer
// ============================================================

import { ChessState, ChessTank, CHESS_COLS, CHESS_ROWS, CHESS_CELL, CHESS_OFFSET_X, CHESS_OFFSET_Y, chessGridToPixel } from '../modes/Chess';
import { drawButton, ButtonDef, hitTestButton, roundRect } from '../utils/Canvas';
import { MAP_W, MAP_H } from '../utils/Grid';

export function renderChess(ctx: CanvasRenderingContext2D, state: ChessState): void {
  // Background
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Board
  ctx.fillStyle = '#2a2d20';
  ctx.fillRect(CHESS_OFFSET_X, CHESS_OFFSET_Y, CHESS_COLS * CHESS_CELL, CHESS_ROWS * CHESS_CELL);

  // Grid lines
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let x = 0; x <= CHESS_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(CHESS_OFFSET_X + x * CHESS_CELL, CHESS_OFFSET_Y);
    ctx.lineTo(CHESS_OFFSET_X + x * CHESS_CELL, CHESS_OFFSET_Y + CHESS_ROWS * CHESS_CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= CHESS_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(CHESS_OFFSET_X, CHESS_OFFSET_Y + y * CHESS_CELL);
    ctx.lineTo(CHESS_OFFSET_X + CHESS_COLS * CHESS_CELL, CHESS_OFFSET_Y + y * CHESS_CELL);
    ctx.stroke();
  }

  // Valid move highlights
  if (state.selectedTank && state.validMoves.length > 0) {
    for (const m of state.validMoves) {
      const px = CHESS_OFFSET_X + m.gx * CHESS_CELL + CHESS_CELL / 2;
      const py = CHESS_OFFSET_Y + m.gy * CHESS_CELL + CHESS_CELL / 2;
      ctx.fillStyle = state.phase === 'player_fire' ? 'rgba(255,100,50,0.4)' : 'rgba(74,158,255,0.4)';
      ctx.beginPath();
      ctx.arc(px, py, CHESS_CELL * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw tanks
  for (const t of state.playerTanks) drawChessTank(ctx, t, true, state.selectedTank?.id === t.id);
  for (const t of state.aiTanks) drawChessTank(ctx, t, false, false);

  // HUD
  drawChessHUD(ctx, state);

  // Gear button (during gameplay)
  if (state.phase === 'player_turn' || state.phase === 'player_fire' || state.phase === 'ai_turn') {
    drawChessGearButton(ctx);
  }

  // Overlays
  if (state.phase === 'intro') {
    drawOverlay(ctx, ['♟️ 棋类对战', '', '回合制策略对决', '移动1步+开1枪 vs 不动+开2枪', '', '点击屏幕开始']);
  } else if (state.phase === 'victory') {
    drawOverlay(ctx, ['🎉 全歼敌军！', '', `回合数: ${state.turnNumber}`]);
    drawChessBackButton(ctx);
  } else if (state.phase === 'defeat') {
    drawOverlay(ctx, ['💀 全军覆没', '', `回合数: ${state.turnNumber}`]);
    drawChessBackButton(ctx);
  }
}

function drawChessTank(ctx: CanvasRenderingContext2D, t: ChessTank, isPlayer: boolean, selected: boolean): void {
  if (!t.alive) return;
  const { x, y } = chessGridToPixel(t.gridX, t.gridY);
  const r = CHESS_CELL * 0.4;
  const phi = 0.618;

  // Body (golden ratio)
  const bw = r * 2;
  const bh = bw * phi;
  ctx.fillStyle = isPlayer ? '#4a9eff' : '#ff6b4a';
  ctx.strokeStyle = selected ? '#fff' : (isPlayer ? '#2a6ecc' : '#cc4422');
  ctx.lineWidth = selected ? 2.5 : 1.5;
  roundRect(ctx, x - bw/2, y - bh/2, bw, bh, bh * 0.3);
  ctx.fill();
  ctx.stroke();

  // Turret (triangle for player, pentagon for AI)
  const turretR = r * 0.55;
  ctx.fillStyle = isPlayer ? '#88bbee' : '#ff8866';
  ctx.strokeStyle = isPlayer ? '#5588aa' : '#aa4422';
  ctx.lineWidth = 1.5;
  const sides = isPlayer ? 3 : 5;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
    const px = x + Math.cos(a) * turretR;
    const py = y + Math.sin(a) * turretR;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Barrel
  ctx.fillStyle = '#222';
  const barrelLen = r * 1.2;
  if (isPlayer) {
    ctx.fillRect(x + r * 0.3, y - 3, barrelLen, 6);
  } else {
    ctx.fillRect(x - r * 0.3 - barrelLen, y - 3, barrelLen, 6);
  }

  // Selected highlight
  if (selected) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // HP bar
  if (t.hp < t.maxHp) {
    const barW = r * 2;
    const barH = 3;
    const barY = y - r - 10;
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    const ratio = t.hp / t.maxHp;
    ctx.fillStyle = ratio > 0.3 ? '#4ae0a0' : '#ff4444';
    ctx.fillRect(x - barW / 2, barY, barW * ratio, barH);
  }
}

function drawChessHUD(ctx: CanvasRenderingContext2D, state: ChessState): void {
  // Top info
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, MAP_W, 40);

  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(state.message, MAP_W / 2, 16);

  // Turn number
  ctx.fillStyle = '#888';
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`回合 ${state.turnNumber}`, MAP_W / 2, 34);

  // Alive counts
  const pAlive = state.playerTanks.filter(t => t.alive).length;
  const eAlive = state.aiTanks.filter(t => t.alive).length;
  ctx.fillStyle = '#4a9eff';
  ctx.textAlign = 'left';
  ctx.fillText(`🔵 ×${pAlive}`, 12, 28);
  ctx.fillStyle = '#ff6b4a';
  ctx.textAlign = 'right';
  ctx.fillText(`🔴 ×${eAlive}`, MAP_W - 12, 28);
}

function drawOverlay(ctx: CanvasRenderingContext2D, lines: string[]): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    if (line.startsWith('🎉') || line.startsWith('💀') || line.startsWith('♟️')) {
      ctx.font = 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    } else {
      ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
    }
    ctx.fillText(line, MAP_W / 2, MAP_H / 2 - 60 + i * 32);
  });
}

// Back button
const CHESS_BTN_W = 160;
const CHESS_BTN_H = 36;

function drawChessBackButton(ctx: CanvasRenderingContext2D): void {
  const btn: ButtonDef = {
    x: (MAP_W - CHESS_BTN_W) / 2,
    y: MAP_H - CHESS_BTN_H - 30,
    w: CHESS_BTN_W,
    h: CHESS_BTN_H,
    label: '← 返回大厅',
    color: '#444',
  };
  drawButton(ctx, btn);
}

export function hitTestChessBackButton(px: number, py: number): boolean {
  const btn: ButtonDef = {
    x: (MAP_W - CHESS_BTN_W) / 2,
    y: MAP_H - CHESS_BTN_H - 30,
    w: CHESS_BTN_W,
    h: CHESS_BTN_H,
    label: '', color: '',
  };
  return hitTestButton(px, py, btn);
}

// ============================================================
// Gear button (quit mid-game)
// ============================================================

const GEAR_R = 14;
const GEAR_X = MAP_W - GEAR_R - 8;
const GEAR_Y = GEAR_R + 8;

function drawChessGearButton(ctx: CanvasRenderingContext2D): void {
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

export function hitTestChessGearButton(px: number, py: number): boolean {
  const dx = px - GEAR_X;
  const dy = py - GEAR_Y;
  return dx * dx + dy * dy < GEAR_R * GEAR_R;
}
