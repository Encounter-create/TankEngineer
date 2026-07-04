import { Shop, ShopSlot } from '../systems/Shop';

/** Shop screen state */
export interface ShopUIState {
  visible: boolean;
  slots: ShopSlot[];
  message: string;
  messageColor: string;
}

export function createShopUIState(): ShopUIState {
  return {
    visible: false,
    slots: [],
    message: '',
    messageColor: '#e8e8e8',
  };
}

export function refreshShop(shopUi: ShopUIState, shop: Shop): void {
  shopUi.slots = shop.getSlots();
  shopUi.message = '';
}

export function attemptBuy(shopUi: ShopUIState, shop: Shop, partId: string): void {
  const result = shop.buy(partId);
  if (result.success) {
    shopUi.message = '✅ 购买成功！';
    shopUi.messageColor = '#4ae0a0';
  } else {
    shopUi.message = `❌ ${result.reason}`;
    shopUi.messageColor = '#ff6b4a';
  }
}

// ============================================================
// Canvas rendering for shop screen
// ============================================================

export function renderShop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shopUi: ShopUIState,
  gold: number,
): void {
  // Background
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏪 每日商店', w / 2, 30);

  // Gold
  ctx.fillStyle = '#ffaa00';
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`🪙 ${gold} 金币`, w / 2, 54);

  // Message
  if (shopUi.message) {
    ctx.fillStyle = shopUi.messageColor;
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(shopUi.message, w / 2, h - 40);
  }

  // Shop slots
  const cardW = 160;
  const cardH = 100;
  const gap = 16;
  const totalW = shopUi.slots.length * cardW + (shopUi.slots.length - 1) * gap;
  const startX = (w - totalW) / 2;
  const startY = 80;

  shopUi.slots.forEach((slot, i) => {
    const cx = startX + i * (cardW + gap);

    // Card
    ctx.fillStyle = '#2a2d35';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    roundRect(ctx, cx, startY, cardW, cardH, 8);
    ctx.fill();
    ctx.stroke();

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(slot.part.name, cx + cardW / 2, startY + 28);

    // Type badge
    ctx.fillStyle = '#666';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(typeLabel(slot.part.type), cx + cardW / 2, startY + 46);

    // Rarity color
    ctx.fillStyle = rarityColor(slot.part.rarity);
    ctx.fillText(slot.part.rarity, cx + cardW / 2, startY + 62);

    // Price button
    const btnY = startY + cardH - 20;
    ctx.fillStyle = '#3a6a3a';
    ctx.fillRect(cx + cardW / 2 - 40, btnY - 10, 80, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`🪙 ${slot.price}`, cx + cardW / 2, btnY + 6);
  });

  // Hint
  ctx.fillStyle = '#666';
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('点击零件购买 | Esc 返回', w / 2, startY + cardH + 30);
}

// Helpers

function typeLabel(type: string): string {
  switch (type) {
    case 'barrel': return '🔫 炮管';
    case 'turret': return '🛡️ 炮塔';
    case 'chassis': return '🏎️ 车身';
    case 'commander': return '🎖️ 车长';
    default: return type;
  }
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#aaa';
    case 'rare': return '#4a9eff';
    case 'epic': return '#c04aff';
    case 'legendary': return '#ffaa00';
    default: return '#aaa';
  }
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
