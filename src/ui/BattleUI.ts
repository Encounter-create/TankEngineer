// BattleUI — shared battle-mode UI elements (gear button, pause, back-to-lobby)
// Import from here instead of reimplementing per mode.

import { MAP_W, MAP_H } from '../utils/Grid';

const GEAR_R = 14;
const GEAR_X = MAP_W - GEAR_R - 8;
const GEAR_Y = GEAR_R + 8;

/** Gear/pause button (top-right) */
export function drawGearButton(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(GEAR_X, GEAR_Y, GEAR_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ccc';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚙', GEAR_X, GEAR_Y);
}

export function hitTestGearButton(px: number, py: number): boolean {
  const dx = px - GEAR_X, dy = py - GEAR_Y;
  return dx * dx + dy * dy < GEAR_R * GEAR_R;
}

/** Pause overlay */
export function drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const pw = 220, ph = 140;
  const px = (MAP_W - pw) / 2, py = (MAP_H - ph) / 2;

  ctx.fillStyle = '#2a2d35';
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, 8);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⏸ 已暂停', px + pw / 2, py + 32);

  // Resume button
  const bx = px + 20, by = py + 50, bw = 180, bh = 34;
  ctx.fillStyle = '#3a6a3a'; ctx.strokeStyle = '#5a8a5a'; ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('▶ 继续游戏', px + pw / 2, by + 22);

  // Quit button
  const qx = px + 20, qy = py + 92, qw = 180, qh = 34;
  ctx.fillStyle = '#6a3a3a'; ctx.strokeStyle = '#8a5a5a'; ctx.lineWidth = 1;
  roundRect(ctx, qx, qy, qw, qh, 4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f88';
  ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('🚪 返回大厅', px + pw / 2, qy + 22);
}

export function hitTestPauseResume(px: number, py: number): boolean {
  const pw = 220, ph = 140;
  const ppx = (MAP_W - pw) / 2, ppy = (MAP_H - ph) / 2;
  const bx = ppx + 20, by = ppy + 50, bw = 180, bh = 34;
  return px >= bx && px <= bx + bw && py >= by && py <= by + bh;
}

export function hitTestPauseQuit(px: number, py: number): boolean {
  const pw = 220, ph = 140;
  const ppx = (MAP_W - pw) / 2, ppy = (MAP_H - ph) / 2;
  const qx = ppx + 20, qy = ppy + 92, qw = 180, qh = 34;
  return px >= qx && px <= qx + qw && py >= qy && py <= qy + qh;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
