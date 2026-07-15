// VirtualJoystick — mobile touch control overlay rendered on canvas

import { MAP_W, MAP_H } from '../utils/Grid';
import { Input } from '../core/Input';

const JX = 110, JY = MAP_H - 150, JR = 58, JT = 22;
const FX = MAP_W - 120, FY = MAP_H - 160, FR = 55, FT = 20;
const SX = FX - FR - 12 - 28, SY = FY, SR = 28;        // skill: left of fire
const UX = FX, UY = FY - FR - 12 - 28, UR = 28;         // U: above fire
const T1X = MAP_W - 35, T1Y = 190, T2X = MAP_W - 35, T2Y = 240, T3X = MAP_W - 35, T3Y = 290, TR = 20;

export function renderJoystick(ctx: CanvasRenderingContext2D, input: Input, skillCdMs: number, multiTank: boolean, activeTankIdx: number): void {
  if (!input.isTouchDevice()) return;

  drawSmallBtn(ctx, UX, UY, UR, 'U', false, 0);
  drawJoy(ctx, JX, JY, JR, JT, input.getMoveJoy());
  drawJoy(ctx, FX, FY, FR, FT, input.getFireJoy());

  const inCd = skillCdMs > 0, sp = input.isTouchSkill();
  const cdSec = inCd && skillCdMs < 99900 ? Math.ceil(skillCdMs / 1000) : 0;
  drawSmallBtn(ctx, SX, SY, SR, 'E', sp, cdSec);

  // Multi-tank switch buttons (right edge, vertical)
  if (multiTank) {
    drawTankBtn(ctx, T1X, T1Y, '1', activeTankIdx === 0);
    drawTankBtn(ctx, T2X, T2Y, '2', activeTankIdx === 1);
    drawTankBtn(ctx, T3X, T3Y, '3', activeTankIdx === 2);
  }

  // Fire aim indicator: red circle at mousePos when firing (mobile cursor visual)
  if (input.isMouseDown()) {
    const mx = input.mousePos.x, my = input.mousePos.y;
    ctx.strokeStyle = 'rgba(255,60,30,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,30,0.3)';
    ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSmallBtn(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, pressed: boolean, cdSec: number): void {
  const inCd = cdSec > 0;
  const cr = pressed ? r * 0.85 : r;
  const isU = label === 'U';
  ctx.fillStyle = inCd ? 'rgba(200,150,20,0.12)' : pressed ? 'rgba(255,200,40,0.45)' : isU ? 'rgba(255,255,255,0.08)' : 'rgba(200,150,20,0.3)';
  ctx.beginPath(); ctx.arc(cx, cy, cr + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isU ? 'rgba(255,255,255,0.10)' : inCd ? 'rgba(200,150,20,0.15)' : pressed ? 'rgba(200,150,20,0.5)' : 'rgba(200,150,20,0.3)';
  ctx.strokeStyle = isU ? 'rgba(255,255,255,0.2)' : inCd ? 'rgba(150,150,150,0.3)' : 'rgba(255,200,80,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = inCd ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)';
  ctx.font = `bold ${cr * 0.65}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(inCd ? cdSec.toString() : label, cx, cy);
}

function drawTankBtn(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, active: boolean): void {
  const r = TR;
  ctx.fillStyle = active ? 'rgba(74,158,255,0.35)' : 'rgba(255,255,255,0.08)';
  ctx.strokeStyle = active ? 'rgba(74,158,255,0.6)' : 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = active ? '#4a9eff' : 'rgba(255,255,255,0.5)';
  ctx.font = `bold 14px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

function drawJoy(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, thumbR: number, state: { sx: number; sy: number; active: boolean; dx: number; dy: number } | null): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - outerR + 10, cy); ctx.lineTo(cx + outerR - 10, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - outerR + 10); ctx.lineTo(cx, cy + outerR - 10); ctx.stroke();
  let tx = cx, ty = cy;
  if (state && state.active) {
    const d = Math.hypot(state.dx, state.dy);
    if (d > 0) { const clamp = Math.min(outerR - thumbR, d); tx = cx + (state.dx / d) * clamp; ty = cy + (state.dy / d) * clamp; }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tx, ty, thumbR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
