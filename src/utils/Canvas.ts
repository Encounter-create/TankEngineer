/** Shared Canvas drawing utilities */

import { PartType, Rarity } from '../entities/Parts';

/** Draw a rounded rectangle path (must call ctx.beginPath() before, ctx.fill()/stroke() after) */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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

/** Color for part rarity */
export function rarityColor(rarity: Rarity | string): string {
  switch (rarity) {
    case 'common': return '#aaa';
    case 'rare': return '#4a9eff';
    case 'epic': return '#c04aff';
    case 'legendary': return '#ffaa00';
    default: return '#aaa';
  }
}

/** Emoji label for part type */
export function partTypeLabel(type: PartType | string): string {
  switch (type) {
    case 'barrel': return '🔫 炮管';
    case 'turret': return '🛡️ 炮塔';
    case 'chassis': return '🏎️ 车身';
    case 'commander': return '🎖️ 车长';
    default: return type;
  }
}
