import { Vec2, Dir } from '../utils/Vector';

/** Tracked keyboard + mouse state for game input */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

  // Mouse state
  mousePos: Vec2 = Vec2.zero();
  private mouseDown_ = false;
  private mouseJustPressed_ = false;
  private mouseJustReleased_ = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
        // Also mark prevKeys so endFrame doesn't re-add
        this.prevKeys.add(e.code);
      }
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      e.preventDefault();
    });

    // Mouse events
    window.addEventListener('mousemove', (e) => {
      if (this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        this.mousePos = new Vec2(
          (e.clientX - rect.left) * scaleX,
          (e.clientY - rect.top) * scaleY,
        );
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown_ = true;
        this.mouseJustPressed_ = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown_ = false;
        this.mouseJustReleased_ = true;
      }
    });
    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Attach canvas for coordinate transform */
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  // ---- Mouse queries ----

  isMouseDown(): boolean {
    return this.mouseDown_;
  }

  /** True only on the frame the left button was first pressed */
  isMouseJustPressed(): boolean {
    return this.mouseJustPressed_;
  }

  isMouseJustReleased(): boolean {
    return this.mouseJustReleased_;
  }

  // ---- Frame lifecycle ----

  /** Call at end of each frame */
  endFrame() {
    // Keyboard
    this.justPressed.clear();
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) {
        this.justPressed.add(k);
      }
    }
    this.prevKeys = new Set(this.keys);

    // Mouse
    this.mouseJustPressed_ = false;
    this.mouseJustReleased_ = false;
  }

  // ---- Helpers ----

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

  isConfirmPressed(): boolean {
    return this.wasJustPressed('Enter');
  }

  isEscapePressed(): boolean {
    return this.wasJustPressed('Escape');
  }

  isMoving(): boolean {
    return this.isDown('KeyW') || this.isDown('KeyS') || this.isDown('KeyA') || this.isDown('KeyD') ||
           this.isDown('ArrowUp') || this.isDown('ArrowDown') || this.isDown('ArrowLeft') || this.isDown('ArrowRight');
  }
}
