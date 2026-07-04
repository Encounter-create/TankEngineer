import { Part, Rarity } from '../entities/Parts';
import { Inventory } from './Inventory';
import { Random } from '../utils/Random';

export interface BattleReward {
  gold: number;
  partDrop: Part | null;
  survived: boolean;
}

const RARITY_DROP_WEIGHTS: { rarity: Rarity; weight: number }[] = [
  { rarity: 'common', weight: 60 },
  { rarity: 'rare', weight: 30 },
  { rarity: 'epic', weight: 8 },
  { rarity: 'legendary', weight: 2 },
];

/**
 * Generate post-battle rewards.
 * Rewards scale with waves survived (siege) or performance.
 */
export function generateReward(
  wavesSurvived: number,
  totalWaves: number,
  survived: boolean,
  inventory: Inventory,
): BattleReward {
  const rand = new Random();

  // Base gold + per-wave bonus
  const baseGold = survived ? 200 : 50;
  const waveGold = wavesSurvived * 30;
  const gold = baseGold + waveGold;

  // Part drop chance based on performance
  const dropChance = survived ? 0.8 : Math.min(0.5, wavesSurvived / totalWaves * 0.5);
  let partDrop: Part | null = null;

  if (rand.next() < dropChance) {
    partDrop = rollRandomPart(rand, inventory);
  }

  // Apply rewards
  inventory.addGold(gold);
  if (partDrop) {
    inventory.addPart(partDrop.id);
  }

  return { gold, partDrop, survived };
}

function rollRandomPart(rand: Random, _inventory: Inventory): Part {
  // Weighted roll for rarity
  const roll = rand.next() * 100;
  let cumulative = 0;
  let targetRarity: Rarity = 'common';

  for (const { rarity, weight } of RARITY_DROP_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) {
      targetRarity = rarity;
      break;
    }
  }

  const allParts = Inventory.getAllParts();
  const candidates = allParts.filter(p => p.rarity === targetRarity);

  if (candidates.length === 0) {
    // Fallback to any part
    return rand.pick(allParts);
  }

  return rand.pick(candidates);
}
