// Main menu — rendered over a live AI vs AI demo battle

import { MAP_W, MAP_H } from '../utils/Grid';
import { drawButton, roundRect, ButtonDef, hitTestButton, UI } from '../utils/Canvas';
import { DemoState, createDemoState, updateDemo, drawDemoState } from '../modes/Demo';
import { TUTORIAL_LINES } from '../data/TutorialText';
import { CREDITS_LINES } from '../data/CreditsText';

export type SubScreen = 'main' | 'settings' | 'tutorial' | 'credits';

export interface MenuState {
  demo: DemoState;
  subScreen: SubScreen;
  musicVol: number;   // 0-100
  sfxVol: number;     // 0-100
  textScrollOffset: number;
  draggingSlider: 'music' | 'sfx' | null;
  draggingScrollbar: boolean;
  /** Total wrapped text height (set during render) */
  _textTotalH: number;
  /** Max scroll (set during render) */
  _textMaxScroll: number;
}

export function createMenuState(): MenuState {
  return {
    demo: createDemoState(),
    subScreen: 'main',
    musicVol: 30,
    sfxVol: 80,
    textScrollOffset: 0,
    draggingSlider: null,
    draggingScrollbar: false,
    _textTotalH: 0,
    _textMaxScroll: 0,
  };
}

export function updateMenu(menu: MenuState, dt: number): void {
  updateDemo(menu.demo, dt);
}

// ============================================================
// Main render — delegates to sub-screens
// ============================================================

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
  ctx.fillStyle = 'rgba(74,158,255,0.06)';
  ctx.beginPath(); ctx.arc(MAP_W / 2, ty - 10, 180, 0, Math.PI * 2); ctx.fill();

  // Main title — two-color
  ctx.font = 'bold 46px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  const fullW = ctx.measureText('TANK ENGINEER').width;
  const tankW = ctx.measureText('TANK ').width;
  let x = MAP_W / 2 - fullW / 2;
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText('TANK ', x, ty); x += tankW;
  ctx.fillStyle = '#4a9eff';
  ctx.fillText('ENGINEER', x, ty);

  // Decorative line
  const lineY = ty + 20, lineW = 200;
  ctx.strokeStyle = 'rgba(74,158,255,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MAP_W / 2 - lineW / 2, lineY); ctx.lineTo(MAP_W / 2 + lineW / 2, lineY); ctx.stroke();
  ctx.fillStyle = '#4a9eff';
  ctx.beginPath(); ctx.arc(MAP_W / 2, lineY, 3, 0, Math.PI * 2); ctx.fill();

  // Subtitle
  ctx.fillStyle = '#8899aa';
  ctx.font = '14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUILD  ·  BATTLE  ·  CONQUER', MAP_W / 2, lineY + 28);

  // Demo hint
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.font = '10px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('LIVE DEMO  —  TROJAN HORSE  ·  DAMOCLES SWORD', MAP_W / 2, MAP_H * 0.72);

  // Main menu buttons
  const btnW = 240, btnH = 40, btnGap = 10;
  const btnCX = MAP_W / 2 - btnW / 2;
  const btnStartY = MAP_H * 0.77;
  const btns: ButtonDef[] = [
    { x: btnCX, y: btnStartY, w: btnW, h: btnH, label: 'START GAME', color: UI.BTN_PRIMARY, textColor: '#e0e8f0' },
    { x: btnCX, y: btnStartY + btnH + btnGap, w: btnW, h: btnH, label: 'SETTINGS', color: UI.CARD, textColor: '#889' },
    { x: btnCX, y: btnStartY + (btnH + btnGap) * 2, w: btnW, h: btnH, label: '制作团队', color: UI.CARD, textColor: '#889' },
  ];
  for (const btn of btns) drawButton(ctx, btn, mx, my);

  // Version
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('v0.5  ·  MVP', MAP_W / 2, MAP_H - 10);

  // Sub-panels drawn on top of main menu
  if (menu.subScreen === 'settings') renderSettingsPanel(ctx, menu, mx, my);
  else if (menu.subScreen === 'tutorial') renderTextPanel(ctx, menu, '新手教程', TUTORIAL_LINES, mx, my);
  else if (menu.subScreen === 'credits') renderTextPanel(ctx, menu, '制作团队', CREDITS_LINES, mx, my);
}

// ============================================================
// Hit testing — main menu buttons
// ============================================================

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

// ============================================================
// Settings panel — overlay + centered card
// ============================================================

const SETTINGS_PW = 480, SETTINGS_PH = 320;
const SETTINGS_PX = (MAP_W - SETTINGS_PW) / 2, SETTINGS_PY = (MAP_H - SETTINGS_PH) / 2;

// Slider geometry (relative to panel left/top)
const SLIDER1_Y = 115, SLIDER2_Y = 175;
const SLIDER_X = 90, SLIDER_W = 300, SLIDER_H = 8;
const THUMB_R = 7;

export interface SettingsHitResult { type: 'back' | 'tutorial' | 'slider_music' | 'slider_sfx' | 'none'; }

function renderSettingsPanel(ctx: CanvasRenderingContext2D, menu: MenuState, mx?: number, my?: number): void {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, MAP_W, MAP_H);

  const px = SETTINGS_PX, py = SETTINGS_PY, pw = SETTINGS_PW, ph = SETTINGS_PH;

  // Panel background
  ctx.fillStyle = UI.PANEL; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, 10); ctx.fill(); ctx.stroke();

  // Title
  ctx.fillStyle = UI.TEXT; ctx.font = `bold ${UI.TITLE_SIZE}px ${UI.FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('⚙ 设置', px + pw / 2, py + 20);

  // Separator line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px + 30, py + 52); ctx.lineTo(px + pw - 30, py + 52); ctx.stroke();

  // -- Music volume slider --
  ctx.fillStyle = UI.TEXT; ctx.font = `bold ${UI.BODY_SIZE}px ${UI.FONT}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🎵 音乐音量', px + 40, py + SLIDER1_Y);
  drawSlider(ctx, px + SLIDER_X, py + SLIDER1_Y - SLIDER_H / 2, SLIDER_W, SLIDER_H, menu.musicVol, mx, my);

  // -- SFX volume slider --
  ctx.fillText('🔊 音效音量', px + 40, py + SLIDER2_Y);
  drawSlider(ctx, px + SLIDER_X, py + SLIDER2_Y - SLIDER_H / 2, SLIDER_W, SLIDER_H, menu.sfxVol, mx, my);

  // -- Tutorial button --
  const tBtn: ButtonDef = { x: px + 40, y: py + ph - 72, w: pw - 80, h: 36, label: '📖 新手教程', color: UI.BTN_DEFAULT, textColor: UI.TEXT };
  drawButton(ctx, tBtn, mx, my);

  // -- Back button --
  const bBtn: ButtonDef = { x: px + pw / 2 - 60, y: py + ph - 32, w: 120, h: 24, label: '← 返回', color: 'transparent', textColor: UI.TEXT_DIM };
  drawButton(ctx, bBtn, mx, my);
}

function drawSlider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: number, mx?: number, my?: number): void {
  // Track
  ctx.fillStyle = '#444';
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();

  // Filled portion
  const fillW = w * (value / 100);
  if (fillW > 0) {
    ctx.fillStyle = UI.BTN_PRIMARY;
    roundRect(ctx, x, y, fillW, h, h / 2); ctx.fill();
  }

  // Thumb
  const thumbX = x + fillW;
  const thumbY = y + h / 2;
  const hovered = mx !== undefined && my !== undefined && Math.hypot(mx - thumbX, my - thumbY) < THUMB_R + 4;
  const r = hovered ? THUMB_R + 2 : THUMB_R;

  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath(); ctx.arc(thumbX, thumbY, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(thumbX, thumbY, r, 0, Math.PI * 2); ctx.stroke();
}

export function hitTestSettings(mx: number, my: number): SettingsHitResult {
  const px = SETTINGS_PX, py = SETTINGS_PY, pw = SETTINGS_PW, ph = SETTINGS_PH;

  // Outside panel → none
  if (mx < px || mx > px + pw || my < py || my > py + ph) return { type: 'none' };

  // Back button
  const bX = px + pw / 2 - 60, bY = py + ph - 32, bW = 120, bH = 24;
  if (mx >= bX && mx <= bX + bW && my >= bY && my <= bY + bH) return { type: 'back' };

  // Tutorial button
  const tX = px + 40, tY = py + ph - 72, tW = pw - 80, tH = 36;
  if (mx >= tX && mx <= tX + tW && my >= tY && my <= tY + tH) return { type: 'tutorial' };

  // Music slider thumb area
  const s1x = px + SLIDER_X, s1y = py + SLIDER1_Y - SLIDER_H / 2;
  if (mx >= s1x - 10 && mx <= s1x + SLIDER_W + 10 && my >= s1y - 10 && my <= s1y + SLIDER_H + 10) return { type: 'slider_music' };

  // SFX slider thumb area
  const s2x = px + SLIDER_X, s2y = py + SLIDER2_Y - SLIDER_H / 2;
  if (mx >= s2x - 10 && mx <= s2x + SLIDER_W + 10 && my >= s2y - 10 && my <= s2y + SLIDER_H + 10) return { type: 'slider_sfx' };

  return { type: 'none' };
}

export function sliderValue(mx: number, _sliderY: number): number {
  const sx = SETTINGS_PX + SLIDER_X;
  return Math.round(Math.max(0, Math.min(100, ((mx - sx) / SLIDER_W) * 100)));
}

export function getMusicSliderY(): number { return SETTINGS_PY + SLIDER1_Y; }
export function getSfxSliderY(): number { return SETTINGS_PY + SLIDER2_Y; }

// ============================================================
// Text panel — scrollable text viewer (shared by tutorial + credits)
// ============================================================

const TEXT_PW = 700, TEXT_PH = 500;
const TEXT_PX = (MAP_W - TEXT_PW) / 2, TEXT_PY = (MAP_H - TEXT_PH) / 2;
const TEXT_AREA_X = TEXT_PX + 25, TEXT_AREA_Y = TEXT_PY + 55;
const TEXT_AREA_W = TEXT_PW - 50, TEXT_AREA_H = TEXT_PH - 110;
const LINE_H = 22;
const FONT_SIZE = 14;

function renderTextPanel(ctx: CanvasRenderingContext2D, menu: MenuState, title: string, lines: string[], mx?: number, my?: number): void {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, MAP_W, MAP_H);

  const px = TEXT_PX, py = TEXT_PY, pw = TEXT_PW, ph = TEXT_PH;

  // Panel background
  ctx.fillStyle = UI.PANEL; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, 10); ctx.fill(); ctx.stroke();

  // Title
  ctx.fillStyle = UI.TEXT; ctx.font = `bold ${UI.TITLE_SIZE}px ${UI.FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(title, px + pw / 2, py + 18);

  // Separator
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px + 30, py + 48); ctx.lineTo(px + pw - 30, py + 48); ctx.stroke();

  // Text area with clipping
  ctx.save();
  ctx.beginPath(); ctx.rect(TEXT_AREA_X, TEXT_AREA_Y, TEXT_AREA_W, TEXT_AREA_H); ctx.clip();

  // Measure total height of all wrapped lines
  const wrapped = wrapLines(ctx, lines, TEXT_AREA_W);
  const totalH = wrapped.length * LINE_H;
  const maxScroll = Math.max(0, totalH - TEXT_AREA_H);
  menu._textTotalH = totalH;
  menu._textMaxScroll = maxScroll;
  const so = Math.max(0, Math.min(maxScroll, menu.textScrollOffset));

  let drawY = TEXT_AREA_Y - so;
  for (const wline of wrapped) {
    if (drawY + LINE_H < TEXT_AREA_Y) { drawY += LINE_H; continue; }
    if (drawY > TEXT_AREA_Y + TEXT_AREA_H) break;

    const isHeader = wline.startsWith('# ');
    const isSubHeader = wline.startsWith('## ');

    if (isHeader) {
      ctx.fillStyle = UI.TEXT_ACCENT;
      ctx.font = `bold ${FONT_SIZE + 2}px ${UI.FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(wline.slice(2), TEXT_AREA_X, drawY + LINE_H / 2);
    } else if (isSubHeader) {
      ctx.fillStyle = UI.TEXT_SUCCESS;
      ctx.font = `bold ${FONT_SIZE}px ${UI.FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(wline.slice(3), TEXT_AREA_X, drawY + LINE_H / 2);
    } else if (wline === '---') {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(TEXT_AREA_X, drawY + LINE_H / 2); ctx.lineTo(TEXT_AREA_X + TEXT_AREA_W, drawY + LINE_H / 2); ctx.stroke();
    } else {
      ctx.fillStyle = UI.TEXT_DIM;
      ctx.font = `${FONT_SIZE}px ${UI.FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(wline, TEXT_AREA_X, drawY + LINE_H / 2);
    }
    drawY += LINE_H;
  }
  ctx.restore();

  // Scrollbar (draggable)
  if (maxScroll > 0) {
    const sbW = 4, sbX = px + pw - 12;
    const sbH = Math.max(24, TEXT_AREA_H * TEXT_AREA_H / totalH);
    const sbY = TEXT_AREA_Y + (so / maxScroll) * (TEXT_AREA_H - sbH);
    const sbHovered = mx !== undefined && my !== undefined
      && mx >= sbX - 6 && mx <= sbX + sbW + 6 && my >= sbY && my <= sbY + sbH;
    const dragging = menu.draggingScrollbar;
    ctx.fillStyle = (sbHovered || dragging) ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
    roundRect(ctx, sbX, sbY, sbW, sbH, 2); ctx.fill();
  }

  // Back button
  const bBtn: ButtonDef = { x: px + pw / 2 - 60, y: py + ph - 32, w: 120, h: 24, label: '← 返回', color: 'transparent', textColor: UI.TEXT_DIM };
  drawButton(ctx, bBtn, mx, my);
}

/** Wrap lines array into display lines fitting maxWidth pixels. */
function wrapLines(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  const result: string[] = [];
  ctx.font = `${FONT_SIZE}px ${UI.FONT}`;
  for (const line of lines) {
    if (line === '' || line === '---') { result.push(line); continue; }
    // For simplicity, push each line and let the renderer handle it
    // Long lines get word-wrapped
    const displayText = line.startsWith('# ') ? line.slice(2) : line.startsWith('## ') ? line.slice(3) : line;
    const measured = ctx.measureText(displayText).width;
    if (measured <= maxWidth || line.startsWith('#')) {
      result.push(line); // headers don't wrap
    } else {
      // Character-by-character wrap for long lines
      let current = '';
      for (const ch of displayText) {
        if (ctx.measureText(current + ch).width > maxWidth) {
          result.push(current);
          current = ch;
        } else {
          current += ch;
        }
      }
      if (current) result.push(current);
    }
  }
  return result;
}

export function hitTestTextPanelBack(mx: number, my: number): boolean {
  const px = TEXT_PX, py = TEXT_PY, pw = TEXT_PW, ph = TEXT_PH;
  const bX = px + pw / 2 - 60, bY = py + ph - 32, bW = 120, bH = 24;
  return mx >= bX && mx <= bX + bW && my >= bY && my <= bY + bH;
}

export function isOutsideTextPanel(mx: number, my: number): boolean {
  return mx < TEXT_PX || mx > TEXT_PX + TEXT_PW || my < TEXT_PY || my > TEXT_PY + TEXT_PH;
}

/** Check if mouse is on the text panel scrollbar. */
export function hitTestTextPanelScrollbar(mx: number, my: number): boolean {
  const sbX = TEXT_PX + TEXT_PW - 12, sbW = 4;
  return mx >= sbX - 6 && mx <= sbX + sbW + 6 && my >= TEXT_AREA_Y && my <= TEXT_AREA_Y + TEXT_AREA_H;
}

/** Calculate text scroll offset from mouse Y position. */
export function textScrollFromMouse(my: number, menu: MenuState): number {
  if (menu._textMaxScroll <= 0) return 0;
  const sbH = Math.max(24, TEXT_AREA_H * TEXT_AREA_H / menu._textTotalH);
  const ratio = (my - TEXT_AREA_Y - sbH / 2) / (TEXT_AREA_H - sbH);
  return Math.round(Math.max(0, Math.min(menu._textMaxScroll, ratio * menu._textMaxScroll)));
}

