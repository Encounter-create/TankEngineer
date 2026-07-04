import { Vec2 } from '../utils/Vector';

export type ParticleType = 'impact' | 'hit' | 'explosion' | 'sprint' | 'repair' | 'barrage' | 'smoke';

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
  alive: boolean;
  /** Smoke particles expand over time instead of shrinking */
  smokeExpand: boolean;
}

const COLORS: Record<ParticleType, string[]> = {
  impact: ['#ffaa44', '#ff8833', '#ffcc66', '#ff6600', '#ffdd88'],
  hit: ['#ff4444', '#ff6666', '#ff2222', '#cc0000', '#ff8888'],
  explosion: ['#ff6600', '#ff4400', '#ffaa00', '#ff2200', '#ffff00', '#ff8800', '#ff3300', '#ffcc00'],
  sprint: ['#4a9eff', '#88ccff', '#66aaff'],
  repair: ['#4ae0a0', '#88ffcc', '#44cc88'],
  barrage: ['#ffdd44', '#ffcc00', '#ffff66'],
  smoke: ['#999999', '#bbbbbb', '#777777', '#aaaaaa', '#888888', '#cccccc'],
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
    const spd = speed * (0.4 + Math.random() * 0.8);
    const isSmoke = type === 'smoke';
    const isExplosion = type === 'explosion';

    let life: number;
    if (isSmoke) life = 2.0 + Math.random() * 1.5;
    else if (isExplosion) life = 0.5 + Math.random() * 0.6;
    else life = 0.4 + Math.random() * 0.5;

    let radius: number;
    if (isSmoke) radius = 8 + Math.random() * 14;
    else if (isExplosion) radius = 3 + Math.random() * 7;
    else if (type === 'hit') radius = 2 + Math.random() * 4;
    else if (type === 'impact') radius = 2 + Math.random() * 5;
    else radius = 2 + Math.random() * 3;

    particles.push({
      pos,
      vel: Vec2.fromAngle(angle, spd),
      life,
      maxLife: life,
      color: COLORS[type][Math.floor(Math.random() * COLORS[type].length)],
      radius,
      alive: true,
      smokeExpand: isSmoke,
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
    p.vel = p.vel.scale(Math.pow(0.08, dt));
    // Smoke expands, other particles shrink slowly
    if (p.smokeExpand) {
      p.radius *= 1 + dt * 1.5; // smoke grows
    } else {
      p.radius *= Math.pow(0.5, dt); // slower shrink
    }
  }
}

/** Create a tank-sized explosion burst */
export function spawnExplosion(pos: Vec2): Particle[] {
  const particles: Particle[] = [];
  // Multiple rings for a more dramatic effect
  for (let i = 0; i < 35; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 200;
    const life = 0.4 + Math.random() * 0.7;
    particles.push({
      pos,
      vel: Vec2.fromAngle(angle, spd),
      life,
      maxLife: life,
      color: COLORS.explosion[Math.floor(Math.random() * COLORS.explosion.length)],
      radius: 3 + Math.random() * 8,
      alive: true,
      smokeExpand: false,
    });
  }
  return particles;
}
