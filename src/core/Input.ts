import { Vec2, Dir } from '../utils/Vector';

/** Tracked keyboard + mouse + touch state for game input */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

  // Mouse
  mousePos: Vec2 = Vec2.zero();
  private mouseDown_ = false;
  private mouseJustPressed_ = false;
  private mouseJustReleased_ = false;
  private canvas: HTMLCanvasElement | null = null;
  private wheelDelta_ = 0;

  // Virtual joystick (mobile touch)
  joystickDir = Vec2.zero();
  joystickActive = false;
  private virtualFire_ = false;
  private virtualSkillPending = false;
  private touchDevice_ = false;

  // Multi-touch tracking
  private touches = new Map<number, { sx: number; sy: number; zone: 'j' | 'f' | 's' | 'a' }>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) { this.justPressed.add(e.code); this.prevKeys.add(e.code); }
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); e.preventDefault(); });

    window.addEventListener('mousemove', (e) => {
      if (!this.canvas) return;
      const r = this.canvas.getBoundingClientRect();
      this.mousePos = new Vec2((e.clientX - r.left) * this.canvas.width / r.width, (e.clientY - r.top) * this.canvas.height / r.height);
    });
    window.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouseDown_ = true; this.mouseJustPressed_ = true; } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) { this.mouseDown_ = false; this.mouseJustReleased_ = true; } });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheelDelta_ += e.deltaY; e.preventDefault(); }, { passive: false });

    // Touch (mobile)
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e));
    window.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
  }

  // ---- Touch internals ----

  private cp(cx: number, cy: number): Vec2 {
    if (!this.canvas) return Vec2.zero();
    const r = this.canvas.getBoundingClientRect();
    return new Vec2((cx - r.left) * this.canvas.width / r.width, (cy - r.top) * this.canvas.height / r.height);
  }

  private z(pos: Vec2): 'j' | 'f' | 's' | 'a' {
    if (pos.x < 320 && pos.y > 340) return 'j';
    if (pos.x > 700 && pos.y > 500) return 'f';
    if (pos.x > 700 && pos.y > 380 && pos.y <= 500) return 's';
    return 'a';
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault(); this.touchDevice_ = true;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], p = this.cp(t.clientX, t.clientY), zn = this.z(p);
      this.touches.set(t.identifier, { sx: p.x, sy: p.y, zone: zn });
      if (zn === 'j') { this.joystickActive = true; this.joystickDir = p; }
      else if (zn === 'f') this.virtualFire_ = true;
      else if (zn === 's') this.virtualSkillPending = true;
      else if (zn === 'a') { this.mousePos = p; }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], rec = this.touches.get(t.identifier);
      if (!rec) continue;
      const p = this.cp(t.clientX, t.clientY);
      if (rec.zone === 'j') { this.joystickActive = true; this.joystickDir = p; }
      else if (rec.zone === 'a') { this.mousePos = p; }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], rec = this.touches.get(t.identifier);
      if (!rec) continue;
      if (rec.zone === 'j') { this.joystickActive = false; this.joystickDir = Vec2.zero(); }
      else if (rec.zone === 'f') this.virtualFire_ = false;
      this.touches.delete(t.identifier);
    }
  }

  // ---- Touch queries (for VirtualJoystick renderer) ----

  getTouchJoy(): { sx: number; sy: number; active: boolean; dx: number; dy: number } | null {
    for (const [, r] of this.touches) if (r.zone === 'j') return { sx: r.sx, sy: r.sy, active: true, dx: this.joystickDir.x, dy: this.joystickDir.y };
    return null;
  }
  isTouchFire(): boolean { return this.virtualFire_; }
  isTouchSkill(): boolean { for (const [, r] of this.touches) if (r.zone === 's') return true; return false; }

  // ---- Public API ----

  attachCanvas(c: HTMLCanvasElement): void { this.canvas = c; }

  isDown(code: string): boolean { return this.keys.has(code); }

  wasJustPressed(code: string): boolean {
    if (code === 'KeyE' && this.virtualSkillPending) { this.virtualSkillPending = false; return true; }
    return this.justPressed.has(code);
  }

  isMouseDown(): boolean { return this.mouseDown_ || this.virtualFire_; }
  isMouseJustPressed(): boolean { return this.mouseJustPressed_; }
  isMouseJustReleased(): boolean { return this.mouseJustReleased_; }
  consumeWheel(): number { const d = this.wheelDelta_; this.wheelDelta_ = 0; return d; }

  endFrame() {
    this.justPressed.clear();
    for (const k of this.keys) { if (!this.prevKeys.has(k)) this.justPressed.add(k); }
    this.prevKeys = new Set(this.keys);
    this.mouseJustPressed_ = false;
    this.mouseJustReleased_ = false;
    this.virtualSkillPending = false;
  }

  getMoveDir(): Vec2 {
    if (this.joystickActive) return this.joystickDir;
    let dx = 0, dy = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) dy -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) dy += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) dx -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) dx += 1;
    if (dx === 0 && dy === 0) return Dir.NONE;
    return new Vec2(dx, dy).norm();
  }

  isFirePressed(): boolean { return this.wasJustPressed('Space') || this.wasJustPressed('KeyJ'); }
  isConfirmPressed(): boolean { return this.wasJustPressed('Enter'); }
  isEscapePressed(): boolean { return this.wasJustPressed('Escape'); }

  isMoving(): boolean {
    return this.joystickActive || this.isDown('KeyW') || this.isDown('KeyS') || this.isDown('KeyA') || this.isDown('KeyD')
      || this.isDown('ArrowUp') || this.isDown('ArrowDown') || this.isDown('ArrowLeft') || this.isDown('ArrowRight');
  }

  isTouchDevice(): boolean { return this.touchDevice_ || ('ontouchstart' in window && navigator.maxTouchPoints > 0); }
}
