// VirtualJoystick — mobile touch control overlay rendered on canvas
// Touch input is handled by Input.ts; this file only draws visual feedback.

import { MAP_W, MAP_H } from '../utils/Grid';
import { Input } from '../core/Input';

// Left joystick (bottom-left)
const JX = 110, JY = MAP_H - 150, JR = 58, JT = 22;

// Fire button (bottom-right)
const FX = MAP_W - 100, FY = MAP_H - 140, FR = 42;

// Skill button (above fire)
const SX = MAP_W - 100, SY = MAP_H - 240, SR = 32;

export function renderJoystick(ctx: CanvasRenderingContext2D, input: Input, skillCdMs: number): void {
  if (!input.isTouchDevice()) return;

  // ---- Left joystick ----
  const j = input.getTouchJoy();
  // Outer ring
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(JX, JY, JR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Crosshair guides
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(JX - JR + 10, JY); ctx.lineTo(JX + JR - 10, JY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(JX, JY - JR + 10); ctx.lineTo(JX, JY + JR - 10); ctx.stroke();
  // Thumb
  let tx = JX, ty = JY;
  if (j && j.active) {
    const d = Math.hypot(j.dx, j.dy);
    if (d > 0) {
      const clamp = Math.min(JR - JT, d);
      tx = JX + (j.dx / d) * clamp;
      ty = JY + (j.dy / d) * clamp;
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tx, ty, JT, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // ---- Fire button ----
  const fp = input.isTouchFire();
  const fr = fp ? FR * 0.85 : FR;
  ctx.fillStyle = fp ? 'rgba(255,60,30,0.45)' : 'rgba(255,40,20,0.22)';
  ctx.beginPath(); ctx.arc(FX, FY, fr + 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fp ? 'rgba(200,40,20,0.55)' : 'rgba(180,30,10,0.35)';
  ctx.strokeStyle = 'rgba(255,100,80,0.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(FX, FY, fr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Crosshair icon
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
  const s = fr * 0.4;
  ctx.beginPath(); ctx.moveTo(FX - s, FY); ctx.lineTo(FX + s, FY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(FX, FY - s); ctx.lineTo(FX, FY + s); ctx.stroke();
  ctx.beginPath(); ctx.arc(FX, FY, s * 0.5, 0, Math.PI * 2); ctx.stroke();

  // ---- Skill button ----
  const inCd = skillCdMs > 0;
  const sp = input.isTouchSkill();
  const sr = sp ? SR * 0.85 : SR;
  ctx.fillStyle = inCd ? 'rgba(200,150,20,0.12)' : sp ? 'rgba(255,200,40,0.45)' : 'rgba(200,150,20,0.3)';
  ctx.beginPath(); ctx.arc(SX, SY, sr + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = inCd ? 'rgba(200,150,20,0.15)' : sp ? 'rgba(200,150,20,0.5)' : 'rgba(200,150,20,0.3)';
  ctx.strokeStyle = inCd ? 'rgba(150,150,150,0.3)' : 'rgba(255,200,80,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(SX, SY, sr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // "E" label or CD number
  ctx.fillStyle = inCd ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (inCd && skillCdMs < 99900) {
    ctx.font = `bold ${sr * 0.55}px sans-serif`;
    ctx.fillText(Math.ceil(skillCdMs / 1000).toString(), SX, SY);
  } else {
    ctx.font = `bold ${sr * 0.8}px sans-serif`;
    ctx.fillText('E', SX, SY);
  }

  // Zone labels
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.font = '10px sans-serif';
  ctx.fillText('MOVE', JX, JY + JR + 18);
  ctx.fillText('FIRE', FX, FY + FR + 16);
  ctx.fillText('SKILL', SX, SY - SR - 12);
}
