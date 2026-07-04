/** Two-dimensional vector with immutable math operations */
export class Vec2 {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  /** Magnitude (length) of the vector */
  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /** Normalize to unit vector (returns zero vector if magnitude is 0) */
  norm(): Vec2 {
    const m = this.mag();
    if (m < 1e-9) return Vec2.zero();
    return this.scale(1 / m);
  }

  /** Dot product */
  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  /** Reflect this vector off a surface with the given normal */
  reflect(normal: Vec2): Vec2 {
    const n = normal.norm();
    return this.sub(n.scale(2 * this.dot(n)));
  }

  /** Distance to another vector */
  dist(v: Vec2): number {
    return this.sub(v).mag();
  }

  /** Angle in radians */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /** Create from angle and magnitude */
  static fromAngle(angle: number, mag: number = 1): Vec2 {
    return new Vec2(Math.cos(angle) * mag, Math.sin(angle) * mag);
  }

  /** Linear interpolation */
  lerp(target: Vec2, t: number): Vec2 {
    return new Vec2(
      this.x + (target.x - this.x) * t,
      this.y + (target.y - this.y) * t,
    );
  }

  /** Component-wise equality with tolerance */
  equals(v: Vec2, eps: number = 0.001): boolean {
    return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps;
  }

  /** Snapped to grid cell coordinates */
  toGrid(cellSize: number): Vec2 {
    return new Vec2(Math.floor(this.x / cellSize), Math.floor(this.y / cellSize));
  }
}

/** Cardinal and diagonal directions as unit vectors */
export const Dir = {
  UP: new Vec2(0, -1),
  DOWN: new Vec2(0, 1),
  LEFT: new Vec2(-1, 0),
  RIGHT: new Vec2(1, 0),
  NONE: Vec2.zero(),
} as const;

export const DIR4: Vec2[] = [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT];
