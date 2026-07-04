import { Vec2 } from '../utils/Vector';

export type ParticleType = 'impact' | 'hit' | 'explosion' | 'sprint' | 'repair' | 'barrage' | 'smoke';

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;     // remaining seconds
  maxLife: number;   // initial life
  color: string;
  radius: number;
  alive: boolean;
}

const COLORS: Record<ParticleType, string[]> = {
  impact: ['#ffaa44', '#ff8833', '#ffcc66', '#ff6600'],
  hit: ['#ff4444', '#ff6666', '#ff2222', '#cc0000'],
  explosion: ['#ff6600', '#ff4400', '#ffaa00', '#ff2200', '#ffff00', '#ff8800'],
  sprint: ['#4a9eff', '#88ccff', '#66aaff'],
  repair: ['#4ae0a0', '#88ffcc', '#44cc88'],
  barrage: ['#ffdd44', '#ffcc00', '#ffff66'],
  smoke: ['#888888', '#aaaaaa', '#666666', '#999999'],
};

export function spawnParticles(
  pos: Vec2,
  type: ParticleType,
  count: number = 8,
  speed: number = 80,
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.5 + Math.random());
    const life = type === 'smoke' ? 1.5 + Math.random() : 0.3 + Math.random() * 0.4;
    particles.push({
      pos,
      vel: Vec2.fromAngle(angle, spd),
      life,
      maxLife: life,
      color: COLORS[type][Math.floor(Math.random() * COLORS[type].length)],
      radius: type === 'explosion' ? 2 + Math.random() * 3 : 0.8 + Math.random() * 1.5,
      alive: true,
    });
  }
  return particles;
}

export function updateParticles(particles: Particle[], dt: number): void {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    p.pos = p.pos.add(p.vel.scale(dt));
    // Friction
    p.vel = p.vel.scale(Math.pow(0.1, dt));
    // Shrink
    p.radius *= Math.pow(0.3, dt);
  }
}
