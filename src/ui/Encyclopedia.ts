// ============================================================
// 零件图鉴 — browse all parts (owned + unowned)
// ============================================================

import { PartType } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { roundRect, rarityColor, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';

export interface EncyclopediaState {
  visible: boolean;
  selectedType: PartType;
}

export function createEncyclopediaState(): EncyclopediaState {
  return { visible: false, selectedType: 'barrel' };
}

const TYPES: { type: PartType; label: string }[] = [
  { type: 'barrel', label: '🔫 炮管' },
  { type: 'turret', label: '🛡️ 炮塔' },
  { type: 'chassis', label: '🏎️ 车身' },
  { type: 'commander', label: '🎖️ 车长' },
];

export function renderEncyclopedia(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: EncyclopediaState,
  inventory: Inventory,
): void {
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📚 零件图鉴', w / 2, 30);

  // Type tabs
  const tabW = 100;
  const tabH = 30;
  const tabY = 50;
  const tabStartX = (w - TYPES.length * (tabW + 8)) / 2;

  TYPES.forEach((t, i) => {
    const tx = tabStartX + i * (tabW + 8);
    const active = state.selectedType === t.type;
    ctx.fillStyle = active ? '#3a6a3a' : '#2a2d35';
    ctx.strokeStyle = active ? '#4ae0a0' : '#444';
    ctx.lineWidth = 1;
    roundRect(ctx, tx, tabY, tabW, tabH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, tx + tabW / 2, tabY + tabH / 2);
  });

  // Get ALL parts of selected type (not just owned)
  const allParts = Inventory.getAllParts().filter(p => p.type === state.selectedType);

  // Part cards
  const cardW = 300;
  const cardH = 80;
  const startY = 100;
  const gap = 8;
  const cardsPerCol = Math.min(allParts.length, 7);
  const totalH = cardsPerCol * (cardH + gap);
  const startX = (w - cardW) / 2;

  // Scroll area background
  ctx.fillStyle = '#22252c';
  ctx.fillRect(startX - 8, startY - 8, cardW + 16, totalH + 16);

  allParts.forEach((part, i) => {
    const cy = startY + i * (cardH + gap);
    const owned = inventory.owns(part.id);

    // Card
    ctx.fillStyle = owned ? '#2a3a4a' : '#252a32';
    ctx.strokeStyle = owned ? '#4a9eff' : '#333';
    ctx.lineWidth = owned ? 1.5 : 0.5;
    roundRect(ctx, startX, cy, cardW, cardH, 6);
    ctx.fill();
    ctx.stroke();

    // Rarity color stripe
    ctx.fillStyle = rarityColor(part.rarity);
    ctx.fillRect(startX, cy, 4, cardH);

    // Name + rarity badge
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(part.name, startX + 16, cy + 22);

    ctx.fillStyle = rarityColor(part.rarity);
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(part.rarity.toUpperCase(), startX + cardW - 12, cy + 22);

    // Description
    ctx.fillStyle = '#999';
    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(part.description, startX + 16, cy + 42);

    // Weight + owned status
    ctx.fillStyle = '#777';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(
      `重量: ${part.weight}  |  ${owned ? '✅ 已拥有' : '🔒 未获取'}`,
      startX + 16,
      cy + 60,
    );

    // Stats
    const stats = part.stats;
    let statText = '';
    if (part.type === 'barrel') {
      statText = `伤害:${stats.bulletDamage ?? '?'}  射速:${stats.bulletSpeed ?? '?'}  CD:${(stats.cooldownMs ?? 0) / 1000}s`;
      if (stats.bounces) statText += `  反弹×${stats.bounces}`;
      if (stats.pierces) statText += `  穿透×${stats.pierces}`;
    } else if (part.type === 'turret') {
      statText = `HP:${stats.maxHp ?? '?'}  防御:${Math.round((1 - (stats.defenseRatio ?? 1)) * 100)}%`;
      if (stats.invulnDurationMs) statText += `  无敌${stats.invulnDurationMs / 1000}s/CD${(stats.invulnCooldownMs ?? 0) / 1000}s`;
    } else if (part.type === 'chassis') {
      statText = `速度:${(stats.speedRatio ?? 1) * 100}%`;
      if (stats.crushWalls) statText += '  碾墙';
      if (stats.instantTurn) statText += '  瞬间转向';
      if ((stats.inertia ?? 0) > 0) statText += '  惯性滑行';
    } else if (part.type === 'commander') {
      const cd = (stats.skillCdMs ?? 0) / 1000;
      statText = `技能CD: ${cd}s`;
    }
    ctx.fillStyle = '#888';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(statText, startX + 16, cy + 74);
  });

  // Back button
  const backBtn: ButtonDef = {
    x: (w - 140) / 2,
    y: h - 44,
    w: 140,
    h: 32,
    label: '← 返回大厅',
    color: '#444',
  };
  drawButton(ctx, backBtn);
}

// ============================================================
// Hit testing
// ============================================================

export function hitTestEncyclopediaTabs(px: number, py: number, w: number): PartType | null {
  const tabW = 100;
  const tabH = 30;
  const tabY = 50;
  const tabStartX = (w - TYPES.length * (tabW + 8)) / 2;
  const TYPES_LIST: PartType[] = ['barrel', 'turret', 'chassis', 'commander'];

  for (let i = 0; i < TYPES.length; i++) {
    const tx = tabStartX + i * (tabW + 8);
    if (px >= tx && px <= tx + tabW && py >= tabY && py <= tabY + tabH) {
      return TYPES_LIST[i];
    }
  }
  return null;
}

export function hitTestEncyclopediaButton(px: number, py: number, w: number, h: number): boolean {
  const backBtn: ButtonDef = { x: (w - 140) / 2, y: h - 44, w: 140, h: 32, label: '', color: '' };
  return hitTestButton(px, py, backBtn);
}
