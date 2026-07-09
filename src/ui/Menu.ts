// Main menu — rendered over a live AI vs AI demo battle

import { MAP_W, MAP_H } from '../utils/Grid';
import { drawButton, ButtonDef, hitTestButton } from '../utils/Canvas';
import { DemoState, createDemoState, updateDemo, drawDemoState } from '../modes/Demo';

export interface MenuState { demo: DemoState; }

export function createMenuState(): MenuState { return { demo: createDemoState() }; }
export function updateMenu(menu: MenuState, dt: number): void { updateDemo(menu.demo, dt); }

export function renderMenu(ctx: CanvasRenderingContext2D, menu: MenuState, mx?: number, my?: number): void {
  ctx.fillStyle = '#080c12'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  drawDemoState(ctx, menu.demo);

  // Dark gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, MAP_H);
  grad.addColorStop(0, 'rgba(0,0,0,0.1)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.15)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Decorative top-left accent
  ctx.fillStyle = 'rgba(74,158,255,0.08)';
  ctx.fillRect(0, 0, MAP_W, 4);
  ctx.fillStyle = 'rgba(74,158,255,0.04)';
  ctx.fillRect(0, 0, MAP_W, 2);

  // Title area
  const ty = MAP_H * 0.25;
  // Glow behind title
  ctx.fillStyle = 'rgba(74,158,255,0.06)';
  ctx.beginPath(); ctx.arc(MAP_W/2, ty-10, 180, 0, Math.PI*2); ctx.fill();

  // Main title — two-color
  ctx.font = 'bold 46px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  const fullW = ctx.measureText('TANK ENGINEER').width;
  const tankW = ctx.measureText('TANK ').width;
  let x = MAP_W/2 - fullW/2;
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText('TANK ', x, ty); x += tankW;
  ctx.fillStyle = '#4a9eff';
  ctx.fillText('ENGINEER', x, ty);

  // Decorative line
  const lineY = ty + 20, lineW = 200;
  ctx.strokeStyle = 'rgba(74,158,255,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MAP_W/2 - lineW/2, lineY); ctx.lineTo(MAP_W/2 + lineW/2, lineY); ctx.stroke();
  ctx.fillStyle = '#4a9eff';
  ctx.beginPath(); ctx.arc(MAP_W/2, lineY, 3, 0, Math.PI*2); ctx.fill();

  // Subtitle
  ctx.fillStyle = '#8899aa';
  ctx.font = '14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('BUILD  ·  BATTLE  ·  CONQUER', MAP_W/2, lineY + 28);

  // Demo hint
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.font = '10px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('LIVE DEMO  —  TROJAN HORSE  ·  DAMOCLES SWORD', MAP_W/2, MAP_H * 0.72);

  // Buttons
  const btnW = 240, btnH = 40, btnGap = 10;
  const btnCX = MAP_W / 2 - btnW / 2;
  const btnStartY = MAP_H * 0.77;
  const btns: ButtonDef[] = [
    { x: btnCX, y: btnStartY, w: btnW, h: btnH, label: 'START GAME', color: '#3a5a8c', textColor: '#e0e8f0' },
    { x: btnCX, y: btnStartY + btnH + btnGap, w: btnW, h: btnH, label: 'SETTINGS', color: '#2a2d35', textColor: '#889' },
    { x: btnCX, y: btnStartY + (btnH + btnGap) * 2, w: btnW, h: btnH, label: 'CREDITS', color: '#2a2d35', textColor: '#889' },
  ];
  for (const btn of btns) drawButton(ctx, btn, mx, my);

  // Version
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '9px monospace';
  ctx.fillText('v0.5  ·  MVP', MAP_W / 2, MAP_H - 10);
}

export function hitTestMenuButtons(mx: number, my: number): number {
  const btnW = 240, btnH = 40, btnGap = 10;
  const btnCX = MAP_W / 2 - btnW / 2;
  const btnStartY = MAP_H * 0.77;
  const btns: ButtonDef[] = [
    { x: btnCX, y: btnStartY, w: btnW, h: btnH, label: '', color: '' },
    { x: btnCX, y: btnStartY + btnH + btnGap, w: btnW, h: btnH, label: '', color: '' },
    { x: btnCX, y: btnStartY + (btnH + btnGap) * 2, w: btnW, h: btnH, label: '', color: '' },
  ];
  for (let i = 0; i < btns.length; i++) { if (hitTestButton(mx, my, btns[i])) return i; }
  return -1;
}
