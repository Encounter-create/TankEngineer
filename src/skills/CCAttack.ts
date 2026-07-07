// @ts-nocheck
// @ts-nocheck
import { SiegeState } from "../types/SiegeState";
import { Vec2 } from "../utils/Vector";
import { createFireZone } from "../entities/FireZone";
import { spawnParticles, spawnExplosion } from "../entities/Particle";
import { takeDamage } from "../entities/Tank";

export function handleCCBulletDeath(state: SiegeState): void {
  for (const bullet of state.bullets) {
    if (bullet.alive || bullet.ownerId !== 'cc') continue;
    // CC bullet died → green fire zone with instant AoE + burn
    const zone = createFireZone(bullet.pos, 50, 4, 20, 'green');
    state.fireZones.push(zone);
    // Instant AoE damage
    for (const enemy of state.enemies) {
      if (enemy.alive && enemy.pos.dist(bullet.pos) < zone.radius) {
        takeDamage(enemy, 30);
        state.particles.push(...spawnParticles(enemy.pos, 'hit', 4, 60));
      }
    }
    // Green burst particles
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 80;
      state.particles.push({ pos: bullet.pos, vel: new Vec2(Math.cos(a)*spd, Math.sin(a)*spd), life: 0.6+Math.random()*0.4, maxLife:1, color: ['#22dd44','#44ff66','#88ff88'][Math.floor(Math.random()*3)], radius: 2+Math.random()*3, alive:true, smokeExpand:false, isCross:false });
    }
  }
}