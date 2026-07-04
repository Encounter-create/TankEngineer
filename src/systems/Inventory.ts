import { Part, PartType, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, MVP_COMMANDERS } from '../entities/Parts';

/** Persisted player inventory */
export interface InventoryData {
  gold: number;
  ownedPartIds: string[];
  lastShopRefresh: number; // timestamp ms
  shopPartIds: string[];
}

const STORAGE_KEY = 'tank_engineer_inventory';

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
      'turret_light',
      'turret_heavy',
      'turret_reactive',
      'chassis_standard',
      'chassis_inertia',
      'chassis_heavy',
      'chassis_track',
      'commander_repair',
      'commander_sprint',
      'commander_barrage',
      'commander_smoke',
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
        // Validate critical fields to prevent corruption crash
        if (
          typeof parsed.gold === 'number' &&
          Array.isArray(parsed.ownedPartIds) &&
          Array.isArray(parsed.shopPartIds)
        ) {
          // Merge: keep old data but also include all default parts (catches new parts added in updates)
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
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
