import { Vec2 } from '../utils/Vector';

export interface DamageNumber {
  pos: Vec2;
  value: number;
  life: number;
  maxLife: number;
  color: string;
  alive: boolean;
}

export function spawnDamageNumber(pos: Vec2, value: number, isCrit: boolean = false): DamageNumber {
  return {
    pos,
    value: Math.round(value),
    life: 1.0,
    maxLife: 1.0,
    color: isCrit ? '#ff4444' : '#ffcc44',
    alive: true,
  };
}

export function updateDamageNumbers(nums: DamageNumber[], dt: number): void {
  for (const n of nums) {
    n.life -= dt;
    if (n.life <= 0) { n.alive = false; continue; }
    // Float upward
    n.pos = n.pos.sub(new Vec2(0, 40 * dt));
    // Fade
    n.color = n.color.replace(/[\d.]+\)$/, `${n.life})`);
  }
}
