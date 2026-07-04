import { MAP_W, MAP_H } from '../utils/Grid';
import { SiegeState } from '../modes/Siege';
import { drawHUD as drawSiegeHUD } from './Renderer';

/**
 * Draw game HUD overlay (timer, wave info, etc.)
 * Rendered on a separate overlay canvas or directly on the game canvas.
 */
export function drawHUD(ctx: CanvasRenderingContext2D, state: SiegeState): void {
  // Semi-transparent top bar
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, MAP_W, 64);

  drawSiegeHUD(ctx, state);

  // Bottom hint
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WASD 移动 | 空格 开火 | 保护指挥所 3 分钟', MAP_W / 2, MAP_H - 8);
}
