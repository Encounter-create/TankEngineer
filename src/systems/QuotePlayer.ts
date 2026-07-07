// ============================================================
// 独立台词系统 — 模块级单例，技能层一句调用即可
// ============================================================

import { MAP_W, MAP_H } from '../utils/Grid';

interface QuoteState {
  lines: string[];
  idx: number;
  alpha: number;
  fadeOut: boolean;
}

const state: QuoteState = { lines: [], idx: 0, alpha: 0, fadeOut: false };

export function playQuote(lines: string[]): void {
  state.lines = lines;
  state.idx = 0;
  state.alpha = 0;
  state.fadeOut = false;
}

export function updateQuote(dt: number): void {
  if (state.lines.length === 0) return;
  if (!state.fadeOut) {
    state.alpha = Math.min(1, state.alpha + dt / 2);
    if (state.alpha >= 1) {
      state.idx++;
      state.alpha = 0.05; // avoid flicker — new line visible immediately
      if (state.idx >= state.lines.length) {
        state.fadeOut = true;
        state.alpha = 1;
      }
    }
  } else {
    state.alpha = Math.max(0, state.alpha - dt / 5);
    if (state.alpha <= 0) {
      state.lines = [];
      state.idx = 0;
      state.fadeOut = false;
    }
  }
}

export function renderQuote(ctx: CanvasRenderingContext2D): void {
  if (state.lines.length === 0 || state.alpha <= 0.01) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cx = MAP_W / 2, startY = MAP_H / 2 - 60, lineH = 28;
  const totalLines = state.lines.length;
  const visibleLines = state.fadeOut ? totalLines : state.idx + 1;
  for (let i = 0; i < visibleLines; i++) {
    let a = state.alpha;
    if (!state.fadeOut && i === state.idx) { /* current line alpha */ }
    else if (!state.fadeOut && i < state.idx) a = 1;
    ctx.fillStyle = `rgba(255,220,100,${a})`;
    ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", serif';
    ctx.fillText(state.lines[i], cx, startY + i * lineH);
  }
}
