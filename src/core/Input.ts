import { Vec2, Dir } from '../utils/Vector';

// Joystick geometry — shared with VirtualJoystick.ts
const JX = 110, JY = 554;   // move joystick center
const FX = 840, FY = 544;   // fire joystick center
const SX = 745, SY = 544;   // skill button (left of fire)
const UX = 840, UY = 449;   // U debug button (above fire)
const T1X = 930, T1Y = 190; // tank switch 1
const T2X = 930, T2Y = 240; // tank switch 2
const T3X = 930, T3Y = 290; // tank switch 3

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

  // Move joystick (left)
  moveActive = false;
  moveDir = Vec2.zero();    // normalized
  moveRaw = Vec2.zero();    // raw offset from JX,JY for rendering

  // Fire joystick (right) — replaces old virtualFire
  fireActive = false;
  fireRaw = Vec2.zero();    // raw offset from FX,FY

  // Skill button
  private virtualSkillPending = false;
  private touchDevice_ = false;
  private battleMode_ = false;
  private touchPrevY_ = -1;
  private touchDy_ = 0;
  setBattleMode(on: boolean): void { this.battleMode_ = on; }

  // Multi-touch tracking
  private touches = new Map<number, { sx: number; sy: number; zone: 'j' | 'f' | 's' | 'u' | '1' | '2' | '3' | 'a' }>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) { this.justPressed.add(e.code); this.prevKeys.add(e.code); }
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); e.preventDefault(); });

    window.addEventListener('mousemove', (e) => { this.mousePos = this.cp(e.clientX, e.clientY); });
    window.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouseDown_ = true; this.mouseJustPressed_ = true; } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) { this.mouseDown_ = false; this.mouseJustReleased_ = true; } });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheelDelta_ += e.deltaY; e.preventDefault(); }, { passive: false });

    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e));
    window.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
  }

  // ---- Touch internals ----

  private cp(cx: number, cy: number): Vec2 {
    if (!this.canvas) return Vec2.zero();
    const r = this.canvas.getBoundingClientRect();
    if (r.width < r.height) {
      const vx = (cx - r.left) * this.canvas.height / r.width;
      const vy = (cy - r.top) * this.canvas.width / r.height;
      return new Vec2(vy, this.canvas.height - vx);
    }
    return new Vec2((cx - r.left) * this.canvas.width / r.width, (cy - r.top) * this.canvas.height / r.height);
  }

  private zone(pos: Vec2): 'j' | 'f' | 's' | 'u' | '1' | '2' | '3' | 'a' {
    if (!this.battleMode_) return 'a';
    if (pos.x < 220 && pos.y > 380) return 'j';
    if (Math.hypot(pos.x - UX, pos.y - UY) < 45) return 'u';
    if (Math.hypot(pos.x - SX, pos.y - SY) < 45) return 's';
    if (Math.hypot(pos.x - T1X, pos.y - T1Y) < 24) return '1';
    if (Math.hypot(pos.x - T2X, pos.y - T2Y) < 24) return '2';
    if (Math.hypot(pos.x - T3X, pos.y - T3Y) < 24) return '3';
    if (pos.x > 620 && pos.y > 350) return 'f';
    return 'a';
  }

  private onTouchStart(e: TouchEvent): void {
    this.touchDevice_ = true;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], p = this.cp(t.clientX, t.clientY), zn = this.zone(p);
      this.touches.set(t.identifier, { sx: p.x, sy: p.y, zone: zn });
      if (zn !== 'a') e.preventDefault();
      if (zn === 'j') { this.moveActive = true; this.moveRaw = p.sub(new Vec2(JX, JY)); this.moveDir = this.moveRaw.norm(); }
      else if (zn === 'f') { this.fireActive = true; this.fireRaw = p.sub(new Vec2(FX, FY)); this.mousePos = new Vec2(FX + this.fireRaw.x * 10, FY + this.fireRaw.y * 10); }
      else if (zn === 's') this.virtualSkillPending = true;
      else if (zn === 'u') { this.justPressed.add('KeyU'); }
      else if (zn === '1') { this.justPressed.add('Digit1'); }
      else if (zn === '2') { this.justPressed.add('Digit2'); }
      else if (zn === '3') { this.justPressed.add('Digit3'); }
      else if (zn === 'a') { this.mousePos = p; this.mouseDown_ = true; this.mouseJustPressed_ = true; this.touchPrevY_ = p.y; }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], rec = this.touches.get(t.identifier);
      if (!rec) continue;
      if (rec.zone !== 'a') e.preventDefault();
      const p = this.cp(t.clientX, t.clientY);
      if (rec.zone === 'j') { this.moveActive = true; this.moveRaw = p.sub(new Vec2(JX, JY)); this.moveDir = this.moveRaw.norm(); }
      else if (rec.zone === 'f') { this.fireActive = true; this.fireRaw = p.sub(new Vec2(FX, FY)); this.mousePos = new Vec2(FX + this.fireRaw.x * 10, FY + this.fireRaw.y * 10); }
      else if (rec.zone === 'a') { this.mousePos = p; if (this.touchPrevY_ >= 0) { this.touchDy_ += this.touchPrevY_ - p.y; } this.touchPrevY_ = p.y; }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i], rec = this.touches.get(t.identifier);
      if (!rec) continue;
      if (rec.zone === 'j') { this.moveActive = false; this.moveDir = Vec2.zero(); this.moveRaw = Vec2.zero(); }
      else if (rec.zone === 'f') { this.fireActive = false; this.fireRaw = Vec2.zero(); }
      else if (rec.zone === 'a') this.mouseDown_ = false;
      this.touches.delete(t.identifier);
    }
  }

  // ---- Touch queries (for VirtualJoystick renderer) ----

  getMoveJoy(): { sx: number; sy: number; active: boolean; dx: number; dy: number } | null {
    for (const [, r] of this.touches) if (r.zone === 'j') return { sx: JX, sy: JY, active: true, dx: this.moveRaw.x, dy: this.moveRaw.y };
    return null;
  }
  getFireJoy(): { sx: number; sy: number; active: boolean; dx: number; dy: number } | null {
    for (const [, r] of this.touches) if (r.zone === 'f') return { sx: FX, sy: FY, active: true, dx: this.fireRaw.x, dy: this.fireRaw.y };
    return null;
  }
  isTouchSkill(): boolean { for (const [, r] of this.touches) if (r.zone === 's') return true; return false; }

  // ---- Public API ----

  attachCanvas(c: HTMLCanvasElement): void { this.canvas = c; }
  isDown(code: string): boolean { return this.keys.has(code); }

  wasJustPressed(code: string): boolean {
    if (code === 'KeyE' && this.virtualSkillPending) { this.virtualSkillPending = false; return true; }
    return this.justPressed.has(code);
  }

  isMouseDown(): boolean { return this.mouseDown_ || this.fireActive; }
  isMouseJustPressed(): boolean { return this.mouseJustPressed_; }
  isMouseJustReleased(): boolean { return this.mouseJustReleased_; }
  consumeWheel(): number { const d = this.wheelDelta_; this.wheelDelta_ = 0; return d; }
  consumeTouchScroll(): number { const d = this.touchDy_; this.touchDy_ = 0; return d; }

  endFrame() {
    this.justPressed.clear();
    for (const k of this.keys) { if (!this.prevKeys.has(k)) this.justPressed.add(k); }
    this.prevKeys = new Set(this.keys);
    this.mouseJustPressed_ = false;
    this.mouseJustReleased_ = false;
    this.virtualSkillPending = false;
  }

  getMoveDir(): Vec2 { if (this.moveActive) return this.moveDir; let dx=0,dy=0; if (this.isDown('KeyW')||this.isDown('ArrowUp'))dy-=1; if (this.isDown('KeyS')||this.isDown('ArrowDown'))dy+=1; if (this.isDown('KeyA')||this.isDown('ArrowLeft'))dx-=1; if (this.isDown('KeyD')||this.isDown('ArrowRight'))dx+=1; if (dx===0&&dy===0) return Dir.NONE; return new Vec2(dx,dy).norm(); }
  isFirePressed(): boolean { return this.wasJustPressed('Space') || this.wasJustPressed('KeyJ'); }
  isConfirmPressed(): boolean { return this.wasJustPressed('Enter'); }
  isEscapePressed(): boolean { return this.wasJustPressed('Escape'); }
  isMoving(): boolean { return this.moveActive || this.isDown('KeyW')||this.isDown('KeyS')||this.isDown('KeyA')||this.isDown('KeyD')||this.isDown('ArrowUp')||this.isDown('ArrowDown')||this.isDown('ArrowLeft')||this.isDown('ArrowRight'); }
  isTouchDevice(): boolean { return this.touchDevice_ || ('ontouchstart' in window && navigator.maxTouchPoints > 0); }
}
