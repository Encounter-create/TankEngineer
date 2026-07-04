// ============================================================
// Build slot system — save/load tank configurations
// ============================================================

const STORAGE_KEY = 'tank_engineer_builds';

export interface BuildSlot {
  name: string;
  barrelId: string;
  turretId: string;
  chassisId: string;
  commanderId: string;
}

const DEFAULT_NAMES = ['主力坦克', '备用坦克', '实验坦克'];

export function loadBuildSlots(): BuildSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 3) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return [
    { name: DEFAULT_NAMES[0], barrelId: '', turretId: '', chassisId: '', commanderId: '' },
    { name: DEFAULT_NAMES[1], barrelId: '', turretId: '', chassisId: '', commanderId: '' },
    { name: DEFAULT_NAMES[2], barrelId: '', turretId: '', chassisId: '', commanderId: '' },
  ];
}

export function saveBuildSlots(slots: BuildSlot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch { /* ignore */ }
}

export function saveBuildSlot(index: number, name: string, barrelId: string, turretId: string, chassisId: string, commanderId: string): BuildSlot[] {
  const slots = loadBuildSlots();
  slots[index] = { name, barrelId, turretId, chassisId, commanderId };
  saveBuildSlots(slots);
  return slots;
}
