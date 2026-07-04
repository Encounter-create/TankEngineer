import { PartType, TankConfig } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { tryAssemble, AssemblyResult } from '../systems/Assembly';
import { roundRect, rarityColor, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';

/** Garage screen state */
export interface GarageState {
  selectedBarrelId: string;
  selectedTurretId: string;
  selectedChassisId: string;
  selectedCommanderId: string;
  assemblyResult: AssemblyResult;
  visible: boolean;
}

export function createGarageState(inventory: Inventory): GarageState {
  const barrels = inventory.getOwnedByType('barrel');
  const turrets = inventory.getOwnedByType('turret');
  const chassis = inventory.getOwnedByType('chassis');
  const commanders = inventory.getOwnedByType('commander');

  const state: GarageState = {
    selectedBarrelId: barrels[0]?.id ?? '',
    selectedTurretId: turrets[0]?.id ?? '',
    selectedChassisId: chassis[0]?.id ?? '',
    selectedCommanderId: commanders[0]?.id ?? '',
    assemblyResult: { valid: false, config: null, errors: ['请选择零件'] },
    visible: false,
  };

  state.assemblyResult = tryAssemble(
    state.selectedBarrelId,
    state.selectedTurretId,
    state.selectedChassisId,
    state.selectedCommanderId,
    inventory,
  );
  return state;
}

export function selectPart(garage: GarageState, type: PartType, partId: string, inventory: Inventory): void {
  switch (type) {
    case 'barrel': garage.selectedBarrelId = partId; break;
    case 'turret': garage.selectedTurretId = partId; break;
    case 'chassis': garage.selectedChassisId = partId; break;
    case 'commander': garage.selectedCommanderId = partId; break;
  }
  garage.assemblyResult = tryAssemble(
    garage.selectedBarrelId,
    garage.selectedTurretId,
    garage.selectedChassisId,
    garage.selectedCommanderId,
    inventory,
  );
}

export function getCurrentConfig(garage: GarageState): TankConfig | null {
  return garage.assemblyResult.config;
}

// ============================================================
// Canvas rendering for garage screen
// ============================================================

export function renderGarage(ctx: CanvasRenderingContext2D, _w: number, _h: number, garage: GarageState, inventory: Inventory): void {
  // Background
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, _w, _h);

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔧 坦克组装车间', _w / 2, 30);

  // Four columns: Barrel | Turret | Chassis | Commander
  const types: { type: PartType; label: string; selectedId: string }[] = [
    { type: 'barrel', label: '🔫 炮管', selectedId: garage.selectedBarrelId },
    { type: 'turret', label: '🛡️ 炮塔', selectedId: garage.selectedTurretId },
    { type: 'chassis', label: '🏎️ 车身', selectedId: garage.selectedChassisId },
    { type: 'commander', label: '🎖️ 车长', selectedId: garage.selectedCommanderId },
  ];

  const colW = _w / 4;
  types.forEach((col, ci) => {
    const cx = colW * ci + colW / 2;
    renderPartColumn(ctx, cx, col.label, col.type, col.selectedId, inventory, garage);
  });

  // Bottom: tank stats
  renderTankStats(ctx, _w, _h, garage);

  // Buttons
  drawGarageButtons(ctx, _w, _h);
}

function renderPartColumn(
  ctx: CanvasRenderingContext2D,
  cx: number,
  label: string,
  type: PartType,
  selectedId: string,
  inventory: Inventory,
  _garage: GarageState,
): void {
  const parts = inventory.getOwnedByType(type);

  // Column header
  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, 60);

  // Part cards
  const cardW = 140;
  const cardH = 80;
  const startY = 80;
  const gap = 12;

  parts.forEach((part, i) => {
    const cy = startY + i * (cardH + gap);
    const selected = part.id === selectedId;

    // Card background
    ctx.fillStyle = selected ? '#2a4a6a' : '#2a2d35';
    ctx.strokeStyle = selected ? '#4a9eff' : '#444';
    ctx.lineWidth = selected ? 2 : 1;
    roundRect(ctx, cx - cardW / 2, cy, cardW, cardH, 6);
    ctx.fill();
    ctx.stroke();

    // Part name
    ctx.fillStyle = selected ? '#fff' : '#ccc';
    ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(part.name, cx, cy + 22);

    // Rarity
    ctx.fillStyle = rarityColor(part.rarity);
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(part.rarity, cx, cy + 40);

    // Weight
    ctx.fillStyle = '#888';
    ctx.fillText(`重量: ${part.weight}`, cx, cy + 56);

    // Description (truncated)
    ctx.fillStyle = '#777';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(part.description.slice(0, 16), cx, cy + 70);
  });
}

function renderTankStats(ctx: CanvasRenderingContext2D, w: number, h: number, garage: GarageState): void {
  const result = garage.assemblyResult;
  const y = h - 80;

  if (result.valid && result.config) {
    const c = result.config;
    const wcLabel = { light: '🪶 轻量级', medium: '⚖️ 中量级', heavy: '🏋️ 重量级' }[c.weightClass];

    ctx.fillStyle = '#4ae0a0';
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`总重: ${c.totalWeight} → ${wcLabel}`, w / 2, y);
  } else {
    ctx.fillStyle = '#ff6b4a';
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    result.errors.forEach((err, i) => {
      ctx.fillText(`⚠ ${err}`, w / 2, y + i * 18);
    });
  }
}

// ============================================================
// Garage buttons
// ============================================================

const BTN_W = 150;
const BTN_H = 36;

export function getGarageButtons(w: number, h: number): ButtonDef[] {
  const btnY = h - BTN_H - 12;
  return [
    { x: (w - BTN_W) / 2, y: btnY, w: BTN_W, h: BTN_H, label: '← 返回大厅', color: '#444' },
  ];
}

function drawGarageButtons(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const btn of getGarageButtons(w, h)) {
    drawButton(ctx, btn);
  }
}

export function hitTestGarageButtons(px: number, py: number, w: number, h: number): number {
  const buttons = getGarageButtons(w, h);
  for (let i = 0; i < buttons.length; i++) {
    if (hitTestButton(px, py, buttons[i])) return i;
  }
  return -1; // 0 = start game, 1 = shop
}

// ============================================================
// Mouse hit-testing (part cards)
// ============================================================

export interface GarageClickResult {
  type: PartType;
  partIndex: number;
  partId: string;
}

const GARAGE_CARD_W = 140;
const GARAGE_CARD_H = 80;
const GARAGE_GAP = 12;
const GARAGE_START_Y = 80;

/**
 * Given a click position on the garage screen, return the clicked part.
 * Returns null if the click didn't land on any part card.
 */
export function hitTestGarage(
  px: number,
  py: number,
  w: number,
  inventory: Inventory,
): GarageClickResult | null {
  const types: PartType[] = ['barrel', 'turret', 'chassis', 'commander'];
  const colW = w / 4;

  for (let ci = 0; ci < 4; ci++) {
    const cx = colW * ci + colW / 2;
    const parts = inventory.getOwnedByType(types[ci]);

    for (let i = 0; i < parts.length; i++) {
      const cy = GARAGE_START_Y + i * (GARAGE_CARD_H + GARAGE_GAP);
      const left = cx - GARAGE_CARD_W / 2;
      const top = cy;

      if (px >= left && px <= left + GARAGE_CARD_W &&
          py >= top && py <= top + GARAGE_CARD_H) {
        return { type: types[ci], partIndex: i, partId: parts[i].id };
      }
    }
  }

  return null;
}

