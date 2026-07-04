import { Vec2, Dir } from '../utils/Vector';

/** Tracked keyboard state for game input */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Mark as just-pressed immediately (no 1-frame delay)
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
      }
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      e.preventDefault();
    });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True only on the first frame the key is pressed */
  wasJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** Call at end of each frame */
  endFrame() {
    this.justPressed.clear();
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) {
        this.justPressed.add(k);
      }
    }
    this.prevKeys = new Set(this.keys);
  }

  /** Get movement direction from WASD/Arrow keys */
  getMoveDir(): Vec2 {
    let dx = 0, dy = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    dy -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  dy += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  dx -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) dx += 1;

    if (dx === 0 && dy === 0) return Dir.NONE;
    return new Vec2(dx, dy).norm();
  }

  /** Fire key pressed this frame */
  isFirePressed(): boolean {
    return this.wasJustPressed('Space') || this.wasJustPressed('KeyJ');
  }

  /** Start / confirm */
  isConfirmPressed(): boolean {
    return this.wasJustPressed('Enter');
  }

  isEscapePressed(): boolean {
    return this.wasJustPressed('Escape');
  }

  /** Any directional key held */
  isMoving(): boolean {
    return this.isDown('KeyW') || this.isDown('KeyS') || this.isDown('KeyA') || this.isDown('KeyD') ||
           this.isDown('ArrowUp') || this.isDown('ArrowDown') || this.isDown('ArrowLeft') || this.isDown('ArrowRight');
  }
}
