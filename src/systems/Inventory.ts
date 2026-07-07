import { Part, PartType, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, MVP_COMMANDERS } from '../entities/Parts';

/** Persisted player inventory */
export interface InventoryData {
  gold: number;
  ownedPartIds: string[];
  lastShopRefresh: number; // timestamp ms
  shopPartIds: string[];
}

const STORAGE_KEY = 'tank_engineer_inventory';
const DATA_VERSION = 5; // bump when adding new parts to force refresh

function defaultInventory(): InventoryData {
  return {
    gold: 50000,
    ownedPartIds: [
      'barrel_straight',
      'barrel_bounce',
      'barrel_pierce',
      'barrel_arc',
      'barrel_firework',
      'barrel_orbital',
      'barrel_sniper',
      'barrel_gatling',
      'barrel_rocket',
      'barrel_scatter',
      'barrel_magnetic',
      'turret_light',
      'turret_heavy',
      'turret_reactive',
      'turret_repair',
      'turret_mirror',
      'turret_berserker',
      'chassis_standard',
      'chassis_inertia',
      'chassis_heavy',
      'chassis_track',
      'chassis_blink',
      'chassis_sprint',
      'chassis_hover',
      'commander_repair',
      'commander_sprint',
      'commander_barrage',
      'commander_smoke',
      'commander_colonel',
      'commander_engineer',
      'commander_wizard',
      'commander_ninja',
      'commander_gravity',
      'commander_time',
      'commander_lightning',
      'commander_restore',
      'commander_trisolaran',
      'commander_bivector',
      'commander_quantum',
      'commander_lens',
      'commander_poincare',
      'commander_bigbang',
      'commander_holo',
      'commander_trojan',
      'commander_noah',
      'commander_damocles',
    ],
    lastShopRefresh: 0,
    shopPartIds: [],
  };
}

export class Inventory {
  data: InventoryData;

  constructor() {
    this.data = this.load();
  }

  // ---- persistence ----

  private load(): InventoryData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Check version — if outdated, reset to defaults
        if (parsed.version !== DATA_VERSION) return defaultInventory();
        // Validate critical fields
        if (
          typeof parsed.gold === 'number' &&
          Array.isArray(parsed.ownedPartIds) &&
          Array.isArray(parsed.shopPartIds)
        ) {
          const defaults = defaultInventory();
          const mergedIds = [...new Set([...defaults.ownedPartIds, ...parsed.ownedPartIds])];
          return { ...defaults, ...parsed, ownedPartIds: mergedIds };
        }
      }
    } catch {
      // corrupted data, reset
    }
    return defaultInventory();
  }

  save(): void {
    try {
      const toSave = { ...this.data, version: DATA_VERSION };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // storage full or unavailable - silently fail
    }
  }

  // ---- queries ----

  owns(partId: string): boolean {
    return this.data.ownedPartIds.includes(partId);
  }

  getOwnedParts(): Part[] {
    const allParts = [...MVP_BARRELS, ...MVP_TURRETS, ...MVP_CHASSIS, ...MVP_COMMANDERS];
    return allParts.filter(p => this.owns(p.id));
  }

  getOwnedByType(type: PartType): Part[] {
    return this.getOwnedParts().filter(p => p.type === type);
  }

  // ---- mutations ----

  addGold(amount: number): void {
    this.data.gold += amount;
    this.save();
  }

  spendGold(amount: number): boolean {
    if (this.data.gold < amount) return false;
    this.data.gold -= amount;
    this.save();
    return true;
  }

  addPart(partId: string): void {
    if (this.owns(partId)) {
      // Duplicate → convert to gold
      this.addGold(50);
      return;
    }
    this.data.ownedPartIds.push(partId);
    this.save();
  }

  /** Get all parts (for shop generation and encyclopedia) */
  static getAllParts(): Part[] {
    return [...MVP_BARRELS, ...MVP_TURRETS, ...MVP_CHASSIS, ...MVP_COMMANDERS];
  }

  /** Get a part by ID */
  static getPart(partId: string): Part | undefined {
    return Inventory.getAllParts().find(p => p.id === partId);
  }
}
