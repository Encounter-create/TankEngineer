/** Simple fixed-timestep game loop with render callback */
export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedDt = 1 / 60; // 60 Hz physics
  private running = false;
  /** Global time scale: 1.0 = normal, 0.3 = slow motion */
  timeScale = 1.0;
  targetTimeScale = 1.0;

  constructor(
    private update: UpdateFn,
    private render: RenderFn,
  ) {}

  /** Trigger slow motion for duration seconds */
  triggerSlowMo(duration: number, scale: number = 0.3): void {
    this.targetTimeScale = scale;
    setTimeout(() => { this.targetTimeScale = 1.0; }, duration * 1000);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    this.tick(this.lastTime);
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const time = now / 1000;
    let frameTime = time - this.lastTime;
    this.lastTime = time;

    // Clamp to avoid spiral of death
    if (frameTime > 0.25) frameTime = 0.25;

    this.accumulator += frameTime;

    // Smooth timeScale interpolation
    this.timeScale += (this.targetTimeScale - this.timeScale) * Math.min(1, frameTime * 8);

    // Fixed timestep updates (scaled by timeScale)
    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt * this.timeScale);
      this.accumulator -= this.fixedDt;
    }

    // Render with interpolation alpha
    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);
  };
}
