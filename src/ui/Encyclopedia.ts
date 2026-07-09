// ============================================================
// 零件图鉴 — browse all parts (owned + unowned)
// ============================================================

import { PartType } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { roundRect, rarityColor, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';

export interface EncyclopediaState {
  visible: boolean;
  selectedType: PartType;
  scrollOffset: number;
}

export function createEncyclopediaState(): EncyclopediaState {
  return { visible: false, selectedType: 'barrel', scrollOffset: 0 };
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
  mx?: number, my?: number,
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
    const hovered = mx !== undefined && my !== undefined &&
      mx >= tx && mx <= tx + tabW && my >= tabY && my <= tabY + tabH;
    ctx.fillStyle = active ? '#3a6a3a' : (hovered ? '#333840' : '#2a2d35');
    ctx.strokeStyle = active ? '#4ae0a0' : (hovered ? '#888' : '#444');
    ctx.lineWidth = hovered ? 1.5 : 1;
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

  // Part cards (scrollable)
  const cardW = 300;
  const cardH = 120;
  const startY = 100;
  const gap = 8;
  const listH = h - startY - 60; // visible area
  const totalH = allParts.length * (cardH + gap);
  const maxScroll = Math.max(0, totalH - listH);
  const so = Math.max(0, Math.min(maxScroll, state.scrollOffset));
  const startX = (w - cardW) / 2;

  // Scroll area background
  ctx.fillStyle = '#22252c';
  roundRect(ctx, startX - 8, startY - 8, cardW + 16, listH + 16, 6);
  ctx.fill();

  // Clip card area
  ctx.save();
  ctx.beginPath(); ctx.rect(startX - 8, startY, cardW + 16, listH); ctx.clip();

  allParts.forEach((part, i) => {
    const cy = startY + i * (cardH + gap) - so;
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

    // Description (wrapped)
    ctx.fillStyle = '#999';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    const words = part.description;
    const maxDescW = cardW - 24;
    let descLine = '', descY = cy + 36;
    for (const char of words) {
      const test = descLine + char;
      if (ctx.measureText(test).width > maxDescW) {
        ctx.fillText(descLine, startX + 16, descY);
        descLine = char; descY += 15;
        if (descY > cy + 70) break;
      } else descLine = test;
    }
    if (descLine && descY <= cy + 70) ctx.fillText(descLine, startX + 16, descY);

    // Weight + owned status
    ctx.fillStyle = '#777';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(
      `重量: ${part.weight}  |  ${owned ? '✅ 已拥有' : '🔒 未获取'}`,
      startX + 16,
      cy + 88,
    );

    // Stats
    const stats = part.stats;
    let statText = '';
    if (part.type === 'barrel') {
      statText = `伤害:${stats.bulletDamage ?? '?'}  射速:${stats.bulletSpeed ?? '?'}  CD:${(stats.cooldownMs ?? 0) / 1000}s`;
      if (stats.bounces) statText += `  反弹×${stats.bounces}`;
    } else if (part.type === 'turret') {
      statText = `HP:${stats.maxHp ?? '?'}  防御:${Math.round((1 - (stats.defenseRatio ?? 1)) * 100)}%`;
      if (stats.invulnDurationMs) statText += `  无敌${stats.invulnDurationMs / 1000}s`;
    } else if (part.type === 'chassis') {
      statText = `速度:${(stats.speedRatio ?? 1) * 100}%`;
      if (stats.crushWalls) statText += '  碾墙';
      if (stats.instantTurn) statText += '  瞬转';
    } else if (part.type === 'commander') {
      const cd = (stats.skillCdMs ?? 0) / 1000;
      statText = `技能CD: ${cd}s`;
    }
    ctx.fillStyle = '#888';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(statText, startX + 16, cy + 106);
  });

  // Scrollbar
  if (maxScroll > 0) {
    const sbW = 4, sbX = startX + cardW + 4;
    const sbH = Math.max(24, listH * listH / totalH);
    const sbY = startY + (so / maxScroll) * (listH - sbH);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, sbX, sbY, sbW, sbH, 2); ctx.fill();
  }
  ctx.restore();

  // Back button
  const backBtn: ButtonDef = {
    x: (w - 140) / 2,
    y: h - 44,
    w: 140,
    h: 32,
    label: '← 返回大厅',
    color: '#444',
  };
  drawButton(ctx, backBtn, mx, my);
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
