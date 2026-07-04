import { Part, Rarity } from '../entities/Parts';
import { Inventory } from './Inventory';
import { Random } from '../utils/Random';

export interface ShopSlot {
  part: Part;
  price: number;
}

const RARITY_PRICES: Record<Rarity, number> = {
  common: 200,
  rare: 800,
  epic: 3000,
  legendary: 12000,
};

const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // daily

export class Shop {
  private inventory: Inventory;
  private rand = new Random();

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /** Check if daily refresh is needed */
  needsRefresh(): boolean {
    const elapsed = Date.now() - this.inventory.data.lastShopRefresh;
    return elapsed >= REFRESH_COOLDOWN_MS || this.inventory.data.shopPartIds.length === 0;
  }

  /** Generate daily shop (3 random parts) */
  refresh(): ShopSlot[] {
    const allParts = Inventory.getAllParts();
    // Weight: filter out already-owned parts to reduce duplicates
    const candidates = allParts.filter(p => !this.inventory.owns(p.id));
    const pool = candidates.length >= 3 ? candidates : allParts;

    // Pick 3 random parts
    const indices = new Set<number>();
    while (indices.size < Math.min(3, pool.length)) {
      indices.add(this.rand.int(0, pool.length - 1));
    }

    const slots: ShopSlot[] = [];
    for (const idx of indices) {
      const part = pool[idx];
      slots.push({
        part,
        price: RARITY_PRICES[part.rarity],
      });
    }

    this.inventory.data.shopPartIds = slots.map(s => s.part.id);
    this.inventory.data.lastShopRefresh = Date.now();
    this.inventory.save();

    return slots;
  }

  /** Get current shop slots (don't regenerate) */
  getSlots(): ShopSlot[] {
    if (this.needsRefresh()) {
      return this.refresh();
    }
    return this.inventory.data.shopPartIds
      .map(id => Inventory.getPart(id))
      .filter((p): p is Part => p !== undefined)
      .map(part => ({
        part,
        price: RARITY_PRICES[part.rarity],
      }));
  }

  /** Attempt to buy a part */
  buy(partId: string): { success: boolean; reason?: string } {
    const part = Inventory.getPart(partId);
    if (!part) return { success: false, reason: '零件不存在' };

    if (!this.inventory.data.shopPartIds.includes(partId)) {
      return { success: false, reason: '该零件不在今日商店中' };
    }

    if (this.inventory.owns(partId)) {
      return { success: false, reason: '已拥有该零件' };
    }

    const price = RARITY_PRICES[part.rarity];
    if (!this.inventory.spendGold(price)) {
      return { success: false, reason: `金币不足（需要 ${price}）` };
    }

    this.inventory.addPart(partId);
    this.inventory.save();
    return { success: true };
  }
}
