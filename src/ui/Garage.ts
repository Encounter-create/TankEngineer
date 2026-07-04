import { PartType, TankConfig } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { tryAssemble, AssemblyResult } from '../systems/Assembly';
import { roundRect, rarityColor, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';
import { loadBuildSlots, saveBuildSlot } from '../systems/BuildSlots';

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
  ctx.fillText('🔧 坦克组装车间', _w / 2, 28);

  // ---- Build slots bar ----
  drawBuildSlotsBar(ctx, _w, garage, inventory);

  // Four columns (offset down for build slots bar)
  const colOffsetY = 48;

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
    renderPartColumn(ctx, cx, col.label, col.type, col.selectedId, inventory, garage, colOffsetY);
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
  offY: number = 0,
): void {
  const parts = inventory.getOwnedByType(type);

  // Column header
  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, offY + 20);

  // Part cards
  const cardW = 140;
  const cardH = 70;
  const startY = offY + 36;
  const gap = 8;

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
    // Commander portrait
    if (part.type === 'commander') {
      drawCommanderFace(ctx, cx + cardW / 2 - 60, cy + 10, part.id);
    }

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

// ============================================================
// Build slots bar
// ============================================================

function drawBuildSlotsBar(
  ctx: CanvasRenderingContext2D, w: number,
  _garage: GarageState, _inventory: Inventory,
): void {
  const slots = loadBuildSlots();
  const barY = 36;
  const slotW = (w - 40) / 3;
  const slotH = 28;

  for (let i = 0; i < 3; i++) {
    const sx = 12 + i * (slotW + 8);
    const slot = slots[i];
    const filled = slot.barrelId !== '';

    ctx.fillStyle = filled ? '#2a3a3a' : '#2a2d35';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, barY, slotW, slotH, 4);
    ctx.fill();
    ctx.stroke();

    // Slot label
    ctx.fillStyle = filled ? '#4ae0a0' : '#666';
    ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(filled ? slot.name : `空位 ${i + 1}`, sx + slotW / 2, barY + slotH / 2);
  }

  // Save / Load labels
  ctx.fillStyle = '#555';
  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Shift+1/2/3 保存 | 1/2/3 加载', w / 2, barY + slotH + 12);
}

export function getBuildSlotHitIndex(px: number, py: number, w: number): number {
  const barY = 36;
  const slotW = (w - 40) / 3;
  const slotH = 28;
  for (let i = 0; i < 3; i++) {
    const sx = 12 + i * (slotW + 8);
    if (px >= sx && px <= sx + slotW && py >= barY && py <= barY + slotH) return i;
  }
  return -1;
}

export function applyBuildSlot(garage: GarageState, inventory: Inventory, index: number): void {
  const slots = loadBuildSlots();
  const slot = slots[index];
  if (!slot.barrelId) return;
  selectPart(garage, 'barrel', slot.barrelId, inventory);
  selectPart(garage, 'turret', slot.turretId, inventory);
  selectPart(garage, 'chassis', slot.chassisId, inventory);
  if (slot.commanderId) selectPart(garage, 'commander', slot.commanderId, inventory);
}

export function saveToBuildSlot(garage: GarageState, index: number): void {
  saveBuildSlot(
    index,
    `配置 ${index + 1}`,
    garage.selectedBarrelId,
    garage.selectedTurretId,
    garage.selectedChassisId,
    garage.selectedCommanderId,
  );
}

function drawGarageButtons(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const btn of getGarageButtons(w, h)) {
    drawButton(ctx, btn);
  }
}

// ============================================================
// Commander pixel portraits
// ============================================================

function drawCommanderFace(ctx: CanvasRenderingContext2D, x: number, y: number, id: string): void {
  const s = 8;
  const faces: Record<string, number[][]> = {
    commander_none: [
      [0,0,0,0,0],[0,1,0,1,0],[0,0,0,0,0],[0,1,1,1,0],[0,0,0,0,0],
    ],
    commander_repair: [
      [0,1,0,1,0],[0,0,0,0,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1],
    ],
    commander_sprint: [
      [1,0,0,0,1],[0,1,0,1,0],[0,0,0,0,0],[0,1,1,1,0],[1,0,0,0,1],
    ],
    commander_barrage: [
      [0,1,0,1,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[1,1,1,1,1],
    ],
    commander_smoke: [
      [0,1,0,1,0],[1,0,0,0,1],[0,0,1,0,0],[0,1,0,1,0],[0,0,1,0,0],
    ],
  };

  const face = faces[id] ?? faces.commander_none;
  let color = '#4ae0a0';
  if (id === 'commander_sprint') color = '#4a9eff';
  else if (id === 'commander_barrage') color = '#ffaa33';
  else if (id === 'commander_smoke') color = '#aaa';

  for (let row = 0; row < face.length; row++) {
    for (let col = 0; col < face[row].length; col++) {
      ctx.fillStyle = face[row][col] ? color : '#2a2d35';
      ctx.fillRect(x + col * s, y + row * s, s - 1, s - 1);
    }
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

const GARAGE_OFF_Y = 48;
const GARAGE_CARD_W = 140;
const GARAGE_CARD_H = 70;
const GARAGE_GAP = 8;
const GARAGE_START_Y = GARAGE_OFF_Y + 36;

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

