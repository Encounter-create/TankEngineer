import { PartType, TankConfig } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { tryAssemble, AssemblyResult } from '../systems/Assembly';
import { roundRect, rarityColor, drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';
import { loadBuildSlots, saveBuildSlot } from '../systems/BuildSlots';
import { checkSynergies } from '../systems/Synergy';
import { TANK_RADIUS } from '../entities/Tank';

// ============================================================
// Garage state
// ============================================================

export interface GarageState {
  selectedBarrelId: string;
  selectedTurretId: string;
  selectedChassisId: string;
  selectedCommanderId: string;
  assemblyResult: AssemblyResult;
  visible: boolean;
  /** Currently viewing this type in the left panel */
  activeType: PartType;
  /** Part ID being inspected (shows tooltip) */
  detailPartId: string | null;
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
    activeType: 'barrel',
    detailPartId: null,
  };

  state.assemblyResult = tryAssemble(
    state.selectedBarrelId, state.selectedTurretId, state.selectedChassisId, state.selectedCommanderId, inventory,
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
    garage.selectedBarrelId, garage.selectedTurretId, garage.selectedChassisId, garage.selectedCommanderId, inventory,
  );
}

export function getCurrentConfig(garage: GarageState): TankConfig | null {
  return garage.assemblyResult.config;
}

// ============================================================
// Layout constants
// ============================================================

const LEFT_W = 240;
const LEFT_X = 12;
const CENTER_X = LEFT_X + LEFT_W + 12;
const CENTER_W = 280;
const DETAIL_X = CENTER_X + CENTER_W + 12;
const DETAIL_W = 640 - DETAIL_X - 12; // ~96px, right panel

const TYPE_TABS: { type: PartType; label: string }[] = [
  { type: 'barrel', label: '🔫 炮管' },
  { type: 'turret', label: '🛡️ 炮塔' },
  { type: 'chassis', label: '🏎️ 车身' },
  { type: 'commander', label: '🎖️ 车长' },
];

// ============================================================
// Render
// ============================================================

export function renderGarage(ctx: CanvasRenderingContext2D, w: number, h: number, garage: GarageState, inventory: Inventory, message?: string, messageTimer?: number): void {
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  // Message toast (above buttons)
  if (message && (messageTimer ?? 0) > 0) {
    ctx.fillStyle = `rgba(74,224,160,${Math.min(1, (messageTimer ?? 0))})`;
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, w / 2, h - 60);
  }

  // Title
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔧 坦克组装车间', 16, 26);

  // Build slots bar (top right)
  drawBuildSlotsBar(ctx, w, garage, inventory);

  // ---- Left panel ----
  drawLeftPanel(ctx, w, h, garage, inventory);

  // ---- Right panel ----
  drawRightPanel(ctx, w, h, garage, inventory);

  // ---- Detail tooltip ----
  if (garage.detailPartId) {
    drawDetailTooltip(ctx, w, h, garage.detailPartId);
  }
}

// ============================================================
// Left panel — part list
// ============================================================

function drawLeftPanel(ctx: CanvasRenderingContext2D, _w: number, h: number, garage: GarageState, inventory: Inventory): void {
  // Panel background
  ctx.fillStyle = '#22252c';
  roundRect(ctx, LEFT_X, 46, LEFT_W, h - 100, 6);
  ctx.fill();

  // Type tabs
  const tabW = (LEFT_W - 8) / 4;
  TYPE_TABS.forEach((t, i) => {
    const tx = LEFT_X + 4 + i * tabW;
    const active = garage.activeType === t.type;
    ctx.fillStyle = active ? '#3a5a3a' : '#2a2d35';
    ctx.strokeStyle = active ? '#4ae0a0' : '#444';
    ctx.lineWidth = 1;
    roundRect(ctx, tx, 52, tabW - 2, 26, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, tx + (tabW - 2) / 2, 65);
  });

  // Part list
  const allParts = Inventory.getAllParts().filter(p => p.type === garage.activeType);
  const listY = 86;
  const rowH = 28;
  const selectedId = garage.activeType === 'barrel' ? garage.selectedBarrelId
    : garage.activeType === 'turret' ? garage.selectedTurretId
    : garage.activeType === 'chassis' ? garage.selectedChassisId
    : garage.selectedCommanderId;

  allParts.forEach((part, i) => {
    const ry = listY + i * rowH;
    const selected = part.id === selectedId;
    const owned = inventory.owns(part.id);

    // Row bg
    if (selected) {
      ctx.fillStyle = '#2a4a6a';
      roundRect(ctx, LEFT_X + 4, ry, LEFT_W - 8, rowH - 2, 3);
      ctx.fill();
    }

    // Rarity dot
    ctx.fillStyle = rarityColor(part.rarity);
    ctx.beginPath();
    ctx.arc(LEFT_X + 16, ry + rowH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.fillStyle = owned ? (selected ? '#fff' : '#ccc') : '#555';
    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(part.name, LEFT_X + 30, ry + rowH / 2);

    // Weight badge
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`重${part.weight}`, LEFT_X + LEFT_W - 14, ry + rowH / 2);

    // Selected border
    if (selected) {
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1.5;
      roundRect(ctx, LEFT_X + 4, ry, LEFT_W - 8, rowH - 2, 3);
      ctx.stroke();
    }
  });
}

// ============================================================
// Right panel — tank preview + stats + buttons
// ============================================================

function drawRightPanel(ctx: CanvasRenderingContext2D, _w: number, h: number, garage: GarageState, _inventory: Inventory): void {
  // Preview area
  const previewX = CENTER_X;
  const previewY = 46;
  const previewW = CENTER_W;
  const previewH = h - 160; // matches left panel height

  ctx.fillStyle = '#22252c';
  roundRect(ctx, previewX, previewY, previewW, previewH, 6);
  ctx.fill();

  // Draw mini tank preview
  if (garage.assemblyResult.valid && garage.assemblyResult.config) {
    drawTankPreview(ctx, previewX + previewW / 2, previewY + previewH / 2, garage.assemblyResult.config);
  } else {
    ctx.fillStyle = '#555';
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('请完成零件选择', previewX + previewW / 2, previewY + previewH / 2);
  }

  // Tank stats
  const statsY = previewY + previewH + 10;
  const config = garage.assemblyResult.config;
  if (config && garage.assemblyResult.valid) {
    const wcLabel = { light: '🪶 轻量级', medium: '⚖️ 中量级', heavy: '🏋️ 重量级' }[config.weightClass];
    ctx.fillStyle = '#4ae0a0';
    ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`总重: ${config.totalWeight} → ${wcLabel}`, previewX + 8, statsY + 16);

    // Synergies
    const syns = checkSynergies(config);
    if (syns.length > 0) {
      ctx.fillStyle = '#ffaa33';
      ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(syns.map(s => `${s.icon}${s.name}`).join('  '), previewX + 8, statsY + 36);
    }
  }

  // Buttons
  const btnY = h - 50;
  const buttons: ButtonDef[] = [
    { x: previewX, y: btnY, w: 100, h: 32, label: '💾 保存', color: '#3a5a3a' },
    { x: previewX + 110, y: btnY, w: 100, h: 32, label: '📂 加载', color: '#3a4a5a' },
    { x: previewX + 220, y: btnY, w: 120, h: 32, label: '← 返回大厅', color: '#444' },
  ];
  for (const btn of buttons) drawButton(ctx, btn);
}

// ============================================================
// Tank preview renderer
// ============================================================

function drawTankPreview(ctx: CanvasRenderingContext2D, cx: number, cy: number, config: TankConfig): void {
  const r = TANK_RADIUS * 1.5;
  const phi = 0.618;
  const bw = r * 2;
  const bh = bw * phi;

  // Chassis
  const chassisColors: Record<string, string> = {
    chassis_standard: '#4a9eff', chassis_inertia: '#66aadd', chassis_heavy: '#8B7355', chassis_track: '#88aa66',
  };
  ctx.fillStyle = chassisColors[config.chassis.id] ?? '#4a9eff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - bw/2, cy - bh/2, bw, bh, bh * 0.3);
  ctx.fill(); ctx.stroke();

  // Turret
  const turretR = r * 0.55;
  if (config.turret.id === 'turret_reactive') {
    const sides = 6;
    ctx.fillStyle = '#55aa77'; ctx.strokeStyle = '#337744'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const px = cx + Math.cos(a) * turretR, py = cy + Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (config.turret.id === 'turret_heavy') {
    ctx.fillStyle = '#335577'; ctx.strokeStyle = '#1a3344'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
      const px = cx + Math.cos(a) * turretR, py = cy + Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = '#88bbee'; ctx.strokeStyle = '#5588aa'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
      const px = cx + Math.cos(a) * turretR, py = cy + Math.sin(a) * turretR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Barrel
  const barrelColors: Record<string, string> = {
    barrel_straight: '#667788', barrel_bounce: '#99aabb', barrel_pierce: '#5588cc', barrel_arc: '#dd8844',
    barrel_firework: '#ffaa33', barrel_orbital: '#9966cc', barrel_sniper: '#cc3333',
    barrel_gatling: '#667788', barrel_rocket: '#44aa44',
  };
  ctx.fillStyle = barrelColors[config.barrel.id] ?? '#667788';
  ctx.fillRect(cx + turretR * 0.5, cy - 3, r * 1.1, 6);
}

// ============================================================
// Detail tooltip
// ============================================================

function drawDetailTooltip(ctx: CanvasRenderingContext2D, _w: number, h: number, partId: string): void {
  const part = Inventory.getPart(partId);
  if (!part) return;

  // Right panel detail area
  const tx = DETAIL_X + 4, ty = 46, tw = DETAIL_W - 8, th = h - 160;

  ctx.fillStyle = '#22252c';
  ctx.strokeStyle = rarityColor(part.rarity);
  ctx.lineWidth = 2;
  roundRect(ctx, tx, ty, tw, th, 6);
  ctx.fill(); ctx.stroke();

  // Header
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📋 零件详情', tx + tw / 2, ty + 22);

  // Rarity circle
  ctx.fillStyle = rarityColor(part.rarity);
  ctx.beginPath();
  ctx.arc(tx + tw / 2, ty + 46, 8, 0, Math.PI * 2);
  ctx.fill();

  // Name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(part.name, tx + tw / 2, ty + 66);

  // Rarity + weight
  ctx.fillStyle = rarityColor(part.rarity);
  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${part.rarity.toUpperCase()} · 重${part.weight}`, tx + tw / 2, ty + 82);

  // Stats line by line
  const stats = part.stats;
  let lineY = ty + 104;
  ctx.fillStyle = '#aaa';
  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';

  if (part.type === 'barrel') {
    ctx.fillText(`伤害: ${stats.bulletDamage}`, tx + tw / 2, lineY); lineY += 16;
    ctx.fillText(`射速: ${stats.bulletSpeed}`, tx + tw / 2, lineY); lineY += 16;
    ctx.fillText(`CD: ${(stats.cooldownMs ?? 0) / 1000}s`, tx + tw / 2, lineY); lineY += 16;
    if (stats.bounces) { ctx.fillText(`反弹 ×${stats.bounces}`, tx + tw / 2, lineY); lineY += 16; }
    if (stats.pierces) { ctx.fillText(`穿透 ×${stats.pierces}`, tx + tw / 2, lineY); lineY += 16; }
  } else if (part.type === 'turret') {
    ctx.fillText(`HP: ${stats.maxHp}`, tx + tw / 2, lineY); lineY += 16;
    ctx.fillText(`防御: ${Math.round((1 - (stats.defenseRatio ?? 1)) * 100)}%`, tx + tw / 2, lineY); lineY += 16;
    if (stats.invulnDurationMs) { ctx.fillText(`无敌 ${stats.invulnDurationMs/1000}s`, tx + tw / 2, lineY); lineY += 16; }
  } else if (part.type === 'chassis') {
    ctx.fillText(`速度: ${Math.round((stats.speedRatio ?? 1) * 100)}%`, tx + tw / 2, lineY); lineY += 16;
    if (stats.crushWalls) { ctx.fillText('碾墙', tx + tw / 2, lineY); lineY += 16; }
    if (stats.instantTurn) { ctx.fillText('瞬转', tx + tw / 2, lineY); lineY += 16; }
    if ((stats.inertia ?? 0) > 0) { ctx.fillText('滑行', tx + tw / 2, lineY); lineY += 16; }
  } else if (part.type === 'commander') {
    ctx.fillText(`CD: ${(stats.skillCdMs ?? 0) / 1000}s`, tx + tw / 2, lineY); lineY += 16;
  }

  // Description
  ctx.fillStyle = '#888';
  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(part.description.slice(0, 12), tx + tw / 2, lineY + 12);

  // Synergy hint
  const hint = getPartHint(part);
  if (hint) {
    ctx.fillStyle = hint.color;
    ctx.font = 'bold 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(hint.text, tx + tw / 2, lineY + 30);
  }
}

// ============================================================
// Hit testing
// ============================================================

export function hitTestGarage(px: number, py: number, _w: number, inventory: Inventory, garage: GarageState): { type: PartType; partId: string } | null {
  // Type tabs (52-78)
  const tabW = (LEFT_W - 8) / 4;
  const tabH = 26;
  if (py >= 52 && py <= 52 + tabH && px >= LEFT_X && px <= LEFT_X + LEFT_W) {
    const idx = Math.floor((px - LEFT_X) / tabW);
    if (idx >= 0 && idx < 4) {
      garage.activeType = TYPE_TABS[idx].type;
      garage.detailPartId = null;
      return null;
    }
  }

  // Part list (86+)
  const allParts = Inventory.getAllParts().filter(p => p.type === garage.activeType);
  const listY = 86, rowH = 28;
  for (let i = 0; i < allParts.length; i++) {
    const ry = listY + i * rowH;
    if (px >= LEFT_X && px <= LEFT_X + LEFT_W && py >= ry && py <= ry + rowH) {
      const part = allParts[i];
      // Toggle detail
      if (garage.detailPartId === part.id) {
        garage.detailPartId = null;
      } else {
        garage.detailPartId = part.id;
        if (inventory.owns(part.id)) {
          return { type: part.type, partId: part.id };
        }
      }
      return null;
    }
  }

  // Close detail if clicking elsewhere
  if (garage.detailPartId) {
    garage.detailPartId = null;
  }
  return null;
}

export function hitTestGarageButtons(px: number, py: number, _w: number, h: number): number {
  const previewX = CENTER_X;
  const btnY = h - 50;
  const btns: ButtonDef[] = [
    { x: previewX, y: btnY, w: 100, h: 32, label: '', color: '' },
    { x: previewX + 110, y: btnY, w: 100, h: 32, label: '', color: '' },
    { x: previewX + 220, y: btnY, w: 120, h: 32, label: '', color: '' },
  ];
  for (let i = 0; i < btns.length; i++) {
    if (hitTestButton(px, py, btns[i])) return i;
  }
  return -1;
}

// ============================================================
// Build slots bar
// ============================================================

function drawBuildSlotsBar(ctx: CanvasRenderingContext2D, w: number, _garage: GarageState, _inventory: Inventory): void {
  const slots = loadBuildSlots();
  const slotW = 110, slotH = 24, barY = 6, gap = 6;
  const startX = w - (slotW * 3 + gap * 2) - 12;

  for (let i = 0; i < 3; i++) {
    const sx = startX + i * (slotW + gap);
    const slot = slots[i];
    const filled = slot.barrelId !== '';

    ctx.fillStyle = filled ? '#2a3a3a' : '#2a2d35';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, barY, slotW, slotH, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = filled ? '#4ae0a0' : '#666';
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(filled ? slot.name : `空位${i + 1}`, sx + slotW / 2, barY + slotH / 2);
  }
}

export function getBuildSlotHitIndex(px: number, py: number, w: number): number {
  const slotW = 110, slotH = 24, barY = 6, gap = 6;
  const startX = w - (slotW * 3 + gap * 2) - 12;
  for (let i = 0; i < 3; i++) {
    const sx = startX + i * (slotW + gap);
    if (px >= sx && px <= sx + slotW && py >= barY && py <= barY + slotH) return i;
  }
  return -1;
}

export { loadBuildSlots as getBuildSlots, saveBuildSlot as saveBuild };

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
  saveBuildSlot(index, `配置 ${index + 1}`, garage.selectedBarrelId, garage.selectedTurretId, garage.selectedChassisId, garage.selectedCommanderId);
}

// ============================================================
// Part hints
// ============================================================

function getPartHint(part: { id: string }): { text: string; color: string } | null {
  const hints: Record<string, { text: string; color: string }> = {
    barrel_bounce: { text: '🔵 反弹 ×1.5', color: '#4a9eff' },
    chassis_heavy: { text: '🟠 方块 ×2.0', color: '#ff6600' },
    barrel_firework: { text: '🟡 多米诺 ×3.0', color: '#ffaa00' },
    barrel_pierce: { text: '🔵 穿墙袭杀', color: '#4a9eff' },
    barrel_arc: { text: '🔵 越墙打击', color: '#4a9eff' },
  };
  return hints[part.id] ?? null;
}

// Commander portrait helper (from old code, kept for reference)
