// ============================================================
// 坦克工程师 — Tank Engineer MVP
// 主入口 — 对战大厅中心
// ============================================================

import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Inventory } from './systems/Inventory';
import { Shop } from './systems/Shop';
import { TankConfig } from './entities/Parts';
import {
  GarageState,
  createGarageState,
  selectPart,
  getCurrentConfig,
  renderGarage,
  hitTestGarage,
  hitTestGarageButtons,
  applyBuildSlot,
  saveToBuildSlot,
  getBuildSlotHitIndex,
} from './ui/Garage';
import { PracticeState, createPractice, updatePractice, renderPractice } from './systems/Practice';
import { updateQuote, renderQuote } from './systems/QuotePlayer';
import {
  ShopUIState,
  createShopUIState,
  attemptBuy,
  renderShop,
  hitTestShop,
  hitTestShopButtons,
} from './ui/ShopUI';
import {
  EncyclopediaState,
  createEncyclopediaState,
  renderEncyclopedia,
  hitTestEncyclopediaTabs,
  hitTestEncyclopediaButton,
} from './ui/Encyclopedia';
import {
  LobbyState,
  createLobbyState,
  renderLobby,
  hitTestLobbyMode,
  hitTestLobbyMap,
  hitTestLobbyButtons,
} from './ui/Lobby';
import {
  SiegeState,
  createSiegeState,
  updateSiege,
  drawTrojanHorse,
  drawArk,
  drawArkWater,
  drawDamoclesSwords,
  drawDragon,
  drawGenesis,
} from './modes/Siege';
import {
  renderSiege, drawHUD,
  hitTestSiegeBackButton,
  hitTestGearButton,
  hitTestPauseResume,
  hitTestPauseQuit,
} from './ui/Renderer';
import {
  ChessState,
  createChessState,
  selectChessTank, moveChessTank, fireChessTank,
  pixelToChessGrid,
} from './modes/Chess';
import { renderChess, hitTestChessBackButton, hitTestChessGearButton } from './ui/ChessRenderer';
import { Vec2 } from './utils/Vector';
import { MAP_W, MAP_H } from './utils/Grid';

// ============================================================
// App state machine
// ============================================================

type AppScreen = 'lobby' | 'garage' | 'shop' | 'encyclopedia' | 'siege' | 'chess';

interface AppState {
  screen: AppScreen;
  inventory: Inventory;
  shop: Shop;
  lobby: LobbyState;
  garage: GarageState;
  shopUI: ShopUIState;
  encyclopedia: EncyclopediaState;
  siege: SiegeState | null;
  chess: ChessState | null;
  practice: PracticeState | null;
  shopSelected: number;
  selectedCol: number;
  selectedRow: number;
  garageMessage: string;
  garageMessageTimer: number;
  devMode: boolean;
}

// ============================================================
// Canvas setup
// ============================================================

export let DEV_MODE = false;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.width = MAP_W;
canvas.height = MAP_H;
const ctx = canvas.getContext('2d')!;
// Offscreen canvas for lens effect
// Downscaled canvas for lens pixel displacement (1/3 resolution)
const LENS_W = Math.floor(MAP_W / 3), LENS_H = Math.floor(MAP_H / 3);
const lensCanvas = document.createElement('canvas');
lensCanvas.width = LENS_W; lensCanvas.height = LENS_H;
const lensCtx = lensCanvas.getContext('2d')!;

// ============================================================
// Initialize
// ============================================================

const input = new Input();
input.attachCanvas(canvas);
const inventory = new Inventory();
const shop = new Shop(inventory);

const app: AppState = {
  screen: 'lobby',
  inventory,
  shop,
  lobby: createLobbyState(),
  garage: createGarageState(inventory),
  shopUI: createShopUIState(),
  encyclopedia: createEncyclopediaState(),
  siege: null,
  chess: null,
  practice: null,
  shopSelected: 0,
  selectedCol: 0,
  selectedRow: 0,
  garageMessage: '',
  garageMessageTimer: 0,
  devMode: false,
};

// ============================================================
// Game loop
// ============================================================

function update(dt: number): void {
  if (app.screen === 'siege' && app.siege) {
    updateSiege(app.siege, input, dt);
    handleSiegeUI();
  } else if (app.screen === 'chess' && app.chess) {
    updateChess();
  } else if (app.screen === 'lobby') {
    updateLobby();
  } else if (app.screen === 'garage') {
    if (app.practice) {
      const ps = app.practice;
      updatePractice(ps, input, dt);
      if (input.isMouseJustPressed()) {
        const ax = 284, ay = 46, aw = 470, ah = 640 - 160;
        // Exit button
        const bx = ax + aw / 2 - 40, by = ay + ah - 32;
        if (input.mousePos.x >= bx && input.mousePos.x <= bx + 80 && input.mousePos.y >= by && input.mousePos.y <= by + 24) {
          app.practice = null; app.garage.practiceMode = false; return;
        }
        // Reset button
        const rstX = ax + aw - 64, rstY = ay + 4;
        if (input.mousePos.x >= rstX && input.mousePos.x <= rstX + 58 && input.mousePos.y >= rstY && input.mousePos.y <= rstY + 22) {
          ps.doReset = true;
        }
        // Respawn moving target
        const rx = ax + aw / 2 - 50, ry = ay + ah / 2 + 20;
        if (!ps.movingEnemy.alive && input.mousePos.x >= rx && input.mousePos.x <= rx + 100 && input.mousePos.y >= ry && input.mousePos.y <= ry + 28) {
          ps.movingEnemy.alive = true; ps.movingEnemy.hp = ps.movingEnemy.maxHp;
          ps.movingEnemy.pos = new Vec2(ax + aw * (0.5 + Math.random() * 0.4), ay + ah * (0.2 + Math.random() * 0.5));
        }
      }
      // Handle reset
      if (ps.doReset) {
        const newPs = createPractice(ps.config, ps.arenaX, ps.arenaY, ps.arenaW, ps.arenaH);
        app.practice = newPs;
      }
    } else {
      updateGarage();
    }
  } else if (app.screen === 'shop') {
    updateShop();
  } else if (app.screen === 'encyclopedia') {
    updateEncyclopedia();
  }
  updateQuote(dt);
  input.endFrame();
}

function render(_alpha: number): void {
  // Slow-motion from siege
  if (app.siege && app.siege.slowMoTimer > 0) {
    loop.targetTimeScale = 0.3;
  } else {
    loop.targetTimeScale = 1.0;
  }

  ctx.clearRect(0, 0, MAP_W, MAP_H);

  // Big Bang: screen scale transform before game rendering
  const bb = (app.siege && app.siege.bigbangPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.bigbangPhase !== 'idle') ? app.practice : null;
  if (bb) {
    const b = bb as any;
    const s = b.bigbangScale;
    const px = b.player?.pos?.x ?? MAP_W / 2;
    const py = b.player?.pos?.y ?? MAP_H / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.translate(-px, -py);
  }

  // Bivector foil: global shear+scale transform during compression
  const bv = (app.siege && app.siege.bivectorPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.bivectorPhase !== 'idle') ? app.practice : null;
  const isCompressing = bv && (bv as any).bivectorPhase === 'compressing';
  if (isCompressing) {
    const cy = MAP_H / 2;
    const s = (bv as any).bivectorShear, sc = Math.max(0.001, (bv as any).bivectorScale);
    ctx.save();
    ctx.transform(1, 0, s, sc, -s * cy, cy * (1 - sc));
  }

  if (app.screen === 'siege' && app.siege) {
    renderSiege(ctx, app.siege);
    if (app.siege.phase === 'playing' || app.siege.phase === 'paused') {
      drawHUD(ctx, app.siege);
    }
  } else if (app.screen === 'chess' && app.chess) {
    renderChess(ctx, app.chess);
  } else if (app.screen === 'lobby') {
    const config = getCurrentConfig(app.garage);
    renderLobby(ctx, MAP_W, MAP_H, app.lobby, config, app.garage.assemblyResult.valid, app.devMode);
  } else if (app.screen === 'garage') {
    renderGarage(ctx, MAP_W, MAP_H, app.garage, app.inventory, app.garageMessage, app.garageMessageTimer);
    if (app.practice) renderPractice(ctx, app.practice);
  } else if (app.screen === 'shop') {
    renderShop(ctx, MAP_W, MAP_H, app.shopUI, app.inventory.data.gold);
  } else if (app.screen === 'encyclopedia') {
    renderEncyclopedia(ctx, MAP_W, MAP_H, app.encyclopedia, app.inventory);
  }

  // Bivector text on top of transform (during compression)
  if (bv && (bv as any).bivectorText) {
    ctx.fillStyle = (bv as any).bivectorTextColor;
    ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((bv as any).bivectorText, MAP_W / 2, MAP_H / 2);
  }

  // End bivector transform + white overlay + text
  if (bv) {
    if (isCompressing) ctx.restore();
    const wa = (bv as any).bivectorWhiteAlpha;
    if (wa > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${wa})`;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
    if ((bv as any).bivectorText) {
      ctx.fillStyle = (bv as any).bivectorTextColor;
      ctx.font = 'bold 28px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((bv as any).bivectorText, MAP_W / 2, MAP_H / 2);
    }
  }

  // Quantum superposition: red/blue double exposure + cat
  const qv = (app.siege && app.siege.quantumPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.quantumPhase !== 'idle') ? app.practice : null;
  if (qv) {
    const q = qv as any;
    let elapsed: number;
    if (q.quantumPhase === 'superposing') elapsed = 5 - q.quantumTimer;
    else if (q.quantumPhase === 'collapsed') elapsed = 5 + (3 - q.quantumTimer);
    else elapsed = 0;
    // Red/blue tint layers
    if (q.quantumPhase !== 'collapsed' || q.quantumPhase === 'collapsed') {
      const hasOverlay = q.quantumRedAlpha > 0.01 || q.quantumBlueAlpha > 0.01 || q.quantumPhase === 'collapsed';
      if (hasOverlay && q.quantumPhase !== 'collapsed') {
        ctx.fillStyle = `rgba(255,60,60,${Math.max(0, q.quantumRedAlpha * 0.5)})`;
        ctx.fillRect(0, 0, MAP_W, MAP_H);
        ctx.fillStyle = `rgba(60,60,255,${Math.max(0, q.quantumBlueAlpha * 0.5)})`;
        ctx.fillRect(0, 0, MAP_W, MAP_H);
      }
    }
    // Cat animation
    drawQuantumCat(ctx, elapsed);
  }

  // Spacetime curvature lens
  const lv = (app.siege && app.siege.lensPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.lensPhase !== 'idle') ? app.practice : null;
  if (lv) {
    const l = lv as any;
    const cx = l.lensTarget.x, cy = l.lensTarget.y, r = l.lensRadius;
    if (r > 5) {
      // Pixel displacement: capture at 1/3 res, distort, stretch back
      const llx = Math.round(cx * LENS_W / MAP_W), lly = Math.round(cy * LENS_H / MAP_H);
      const lr = Math.round(r * LENS_W / MAP_W);
      lensCtx.drawImage(canvas, 0, 0, MAP_W, MAP_H, 0, 0, LENS_W, LENS_H);
      const src = lensCtx.getImageData(0, 0, LENS_W, LENS_H);
      const dst = new ImageData(LENS_W, LENS_H);
      const strength = l.lensStrength;
      for (let py = 0; py < LENS_H; py++) {
        for (let px = 0; px < LENS_W; px++) {
          const dx = px - llx, dy = py - lly;
          const d = Math.sqrt(dx * dx + dy * dy);
          const idx = (py * LENS_W + px) * 4;
          if (d < lr && d > 0 && lr > 1) {
            const disp = strength * (lr * lr / d) * (1 - d / lr) * 0.7;
            const ndx = dx / d, ndy = dy / d;
            const tangX = -ndy * disp * 0.3, tangY = ndx * disp * 0.3;
            let sx = Math.round(px + ndx * disp + tangX);
            let sy = Math.round(py + ndy * disp + tangY);
            sx = Math.max(0, Math.min(LENS_W - 1, sx));
            sy = Math.max(0, Math.min(LENS_H - 1, sy));
            const si = (sy * LENS_W + sx) * 4;
            const ratio = d / Math.max(1, lr);
            const rMul = 1 - ratio * 0.5;
            const gMul = 1 - Math.abs(ratio - 0.5) * 0.4;
            const bMul = 0.6 + ratio * 0.6;
            const bright = d < lr * 0.15 ? 1.5 : 1;
            dst.data[idx] = Math.min(255, src.data[si] * rMul * bright);
            dst.data[idx + 1] = Math.min(255, src.data[si + 1] * gMul * bright);
            dst.data[idx + 2] = Math.min(255, src.data[si + 2] * bMul * bright);
            dst.data[idx + 3] = 255;
          } else {
            dst.data[idx] = src.data[idx];
            dst.data[idx + 1] = src.data[idx + 1];
            dst.data[idx + 2] = src.data[idx + 2];
            dst.data[idx + 3] = 255;
          }
        }
      }
      lensCtx.putImageData(dst, 0, 0);
      ctx.drawImage(lensCanvas, 0, 0, LENS_W, LENS_H, 0, 0, MAP_W, MAP_H);
      ctx.strokeStyle = `rgba(180,120,255,${0.4 * strength})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Poincaré rewind: blue filter + afterimage
  const rv = (app.siege && app.siege.rewindPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.rewindPhase !== 'idle') ? app.practice : null;
  if (rv) {
    const rw = rv as any;
    // Save current frame for afterimage
    lensCtx.drawImage(canvas, 0, 0, MAP_W, MAP_H, 0, 0, LENS_W, LENS_H);
    // Blue overlay
    if (rw.rewindPhase !== 'idle') {
      ctx.fillStyle = `rgba(30,60,180,${rw.rewindBlueAlpha})`;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
    // Shockwave ring during recovering
    if (rw.rewindPhase === 'recovering' && rw.rewindTimer > 0) {
      const elapsed = 3 - rw.rewindTimer;
      const waveR = elapsed * 300;
      const alpha = Math.max(0, 1 - elapsed / 3) * 0.6;
      ctx.strokeStyle = `rgba(150,200,255,${alpha})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(MAP_W/2, MAP_H/2, waveR, 0, Math.PI*2); ctx.stroke();
      const grad = ctx.createRadialGradient(MAP_W/2, MAP_H/2, waveR*0.8, MAP_W/2, MAP_H/2, waveR);
      grad.addColorStop(0, `rgba(100,160,255,${alpha*0.3})`);
      grad.addColorStop(1, 'rgba(0,0,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(MAP_W/2, MAP_H/2, waveR, 0, Math.PI*2); ctx.fill();
    }
  }

  // End Big Bang transform + white overlay + shockwave
  if (bb) {
    ctx.restore();
    const wa = (bb as any).bigbangWhiteAlpha;
    if (wa > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${wa})`;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
    if ((bb as any).bigbangPhase === 'aftermath') {
      const px2 = (bb as any).player?.pos?.x ?? MAP_W/2;
      const py2 = (bb as any).player?.pos?.y ?? MAP_H/2;
      const et = 3 - (bb as any).bigbangTimer;
      const waveR = et * 350;
      const alpha = Math.max(0, 1 - et / 3) * 0.7;
      ctx.strokeStyle = `rgba(255,220,180,${alpha})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(px2, py2, waveR, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Trojan horse: draw on top of game
  const tr = (app.siege && app.siege.trojanPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.trojanPhase !== 'idle') ? app.practice : null;
  if (tr) drawTrojanHorse(ctx, tr as any);

  // Damocles swords
  const dm = (app.siege && app.siege.damoclesPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.damoclesPhase !== 'idle') ? app.practice : null;
  if (dm) drawDamoclesSwords(ctx, dm as any);

  // Ye Gong's dragon
  const dr = (app.siege && app.siege.dragonPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.dragonPhase !== 'idle') ? app.practice : null;
  if (dr) drawDragon(ctx, dr as any);

  // Genesis: "Let there be light" — must run AFTER game rendering (overlays black + light)
  const gn = (app.siege && app.siege.genesisPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.genesisPhase !== 'idle') ? app.practice : null;
  if (gn) drawGenesis(ctx, gn as any);

  // Noah's ark: water + ark
  const ark = (app.siege && app.siege.arkPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.arkPhase !== 'idle') ? app.practice : null;
  if (ark) { drawArkWater(ctx, ark as any); drawArk(ctx, ark as any); }

  // Holographic universe: sphere projection
  const hv = (app.siege && app.siege.holoPhase !== 'idle') ? app.siege :
    (app.practice && app.practice.holoPhase !== 'idle') ? app.practice : null;
  if (hv) {
    const h = hv as any;
    const cx = MAP_W / 2, cy = MAP_H / 2, r = h.holoRadius;
    if (r > 5 && h.holoPhase !== 'aftermath') {
      // Save current frame
      lensCtx.drawImage(canvas, 0, 0, MAP_W, MAP_H, 0, 0, LENS_W, LENS_H);
      // Clear and redraw inside sphere
      ctx.clearRect(0, 0, MAP_W, MAP_H);
      // Draw game inside circle
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(lensCanvas, 0, 0, LENS_W, LENS_H, 0, 0, MAP_W, MAP_H);
      // 3D sphere shading (light offset simulates rotation)
      const lightX = cx + Math.cos(h.holoRotation) * r * 0.3;
      const lightY = cy + Math.sin(h.holoRotation * 0.7) * r * 0.3;
      const shade = ctx.createRadialGradient(lightX, lightY, r * 0.1, cx, cy, r);
      shade.addColorStop(0, 'rgba(255,255,255,0)');
      shade.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      shade.addColorStop(0.7, 'rgba(0,0,20,0.3)');
      shade.addColorStop(1, 'rgba(0,0,40,0.7)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      // Longitude lines (vertical arcs rotating)
      ctx.strokeStyle = 'rgba(100,200,255,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const angle = h.holoRotation + i * Math.PI / 3;
        const ex = cx + Math.cos(angle) * r;
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(ex, cy, cx, cy + r); ctx.stroke();
      }
      // Latitude lines (horizontal)
      for (let i = 1; i < 4; i++) {
        const ly = cy - r + i * r * 0.5;
        const lr = Math.sqrt(r * r - (ly - cy) * (ly - cy));
        ctx.beginPath(); ctx.ellipse(cx, ly, lr, lr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // Border ring
      ctx.strokeStyle = 'rgba(100,200,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      // Cracks during shattering
      if (h.holoPhase === 'shattering') {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
        for (let i = 0; i < h.holoCracks; i++) {
          const a1 = (i / h.holoCracks) * Math.PI * 2 + h.holoRotation * 0.1;
          const a2 = a1 + 0.3 + Math.random() * 0.5;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a1) * r * 0.3, cy + Math.sin(a1) * r * 0.3);
          ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
          ctx.stroke();
        }
      }
    } else if (h.holoPhase === 'aftermath') {
      // Fading fragments
      const alpha = h.holoTimer / 2;
      ctx.strokeStyle = `rgba(100,200,255,${alpha})`; ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8;
        const fr = h.holoRadius * (0.3 + Math.random() * 0.7);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * fr, cy + Math.sin(a) * fr);
        ctx.stroke();
      }
    }
  }

  // Quote player (independent of skills)
  renderQuote(ctx);
}

/** Draw pixel-art cat crossing the screen during quantum superposition */
function drawQuantumCat(ctx: CanvasRenderingContext2D, elapsed: number): void {
  let cx: number, cy = MAP_H / 2;
  if (elapsed <= 4) {
    cx = -30 + (MAP_W / 2 + 30) * (elapsed / 4); // left edge → center
  } else if (elapsed <= 5) {
    cx = MAP_W / 2; // center
  } else {
    cx = MAP_W / 2 + (MAP_W / 2 + 30) * ((elapsed - 5) / 3); // center → right
  }
  const walking = elapsed <= 4 || elapsed > 5;
  const bounce = walking ? Math.abs(Math.sin(elapsed * 8)) * 4 : 0;
  const lookUp = elapsed > 4 && elapsed <= 5;

  ctx.save();
  ctx.translate(cx, cy + bounce);
  // Body (ellipse)
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.ellipse(0, 5, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
  // Head (circle)
  ctx.beginPath(); ctx.arc(lookUp ? 2 : 0, -10, 10, 0, Math.PI * 2); ctx.fill();
  // Ears (triangles)
  ctx.beginPath(); ctx.moveTo(-7, -18); ctx.lineTo(-3, -28); ctx.lineTo(2, -18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2, -18); ctx.lineTo(3, -28); ctx.lineTo(7, -18); ctx.closePath(); ctx.fill();
  // Inner ears (pink)
  ctx.fillStyle = '#f8a0c0';
  ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(-2, -25); ctx.lineTo(0, -18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(2, -25); ctx.lineTo(5, -18); ctx.closePath(); ctx.fill();
  // Eyes
  ctx.fillStyle = '#44dd44';
  if (lookUp) {
    ctx.beginPath(); ctx.arc(-4, -13, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -13, 3, 0, Math.PI * 2); ctx.fill();
    // Meow bubble
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(14, -35, 50, 20, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('喵呜~', 20, -22);
  } else {
    ctx.beginPath(); ctx.arc(-4, -10, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -10, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Pupils
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-4, -10, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -10, 1.2, 0, Math.PI * 2); ctx.fill();
  // Nose
  ctx.fillStyle = '#f8a0c0';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-2, -5); ctx.lineTo(2, -5); ctx.closePath(); ctx.fill();
  // Tail (only when walking)
  if (walking) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-16, 3);
    const tailWave = Math.sin(elapsed * 12) * 15;
    ctx.quadraticCurveTo(-26, -5 + tailWave, -30, -12 + tailWave);
    ctx.stroke();
  }
  // Whiskers
  ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8;
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath(); ctx.moveTo(s * 5, -6); ctx.lineTo(s * 18, s * 3 - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 5, -5); ctx.lineTo(s * 18, -6); ctx.stroke();
  }
  // Legs
  if (walking) {
    ctx.fillStyle = '#333';
    const legOff = Math.sin(elapsed * 12) * 5;
    ctx.fillRect(-10, 14, 5, 8 + legOff); ctx.fillRect(-2, 14, 5, 8 - legOff);
    ctx.fillRect(3, 14, 5, 8 + legOff); ctx.fillRect(9, 14, 5, 8 - legOff);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(-10, 14, 5, 8); ctx.fillRect(-2, 14, 5, 8);
    ctx.fillRect(3, 14, 5, 8); ctx.fillRect(9, 14, 5, 8);
  }
  ctx.restore();
}

// ============================================================
// Lobby
// ============================================================

function updateLobby(): void {
  // Developer mode toggle (top-right button)
  if (input.isMouseJustPressed()) {
    const devX = MAP_W - 130, devY = 4, devW = 120, devH = 22;
    if (input.mousePos.x >= devX && input.mousePos.x <= devX + devW &&
        input.mousePos.y >= devY && input.mousePos.y <= devY + devH) {
      app.devMode = !app.devMode;
      DEV_MODE = app.devMode;
      return;
    }
  }
  if (!input.isMouseJustPressed()) return;

  // Mode selection
  const mode = hitTestLobbyMode(input.mousePos.x, input.mousePos.y);
  if (mode) {
    app.lobby.selectedMode = mode;
    return;
  }

  // Map selection
  const mapName = hitTestLobbyMap(input.mousePos.x, input.mousePos.y, MAP_W);
  if (mapName) {
    app.lobby.selectedMap = mapName;
    return;
  }

  // Buttons
  const btnIdx = hitTestLobbyButtons(input.mousePos.x, input.mousePos.y, MAP_W, MAP_H);
  if (btnIdx === 0) {
    app.screen = 'garage'; // open garage
  } else if (btnIdx === 1) {
    app.shopUI.message = '';
    app.shopUI.slots = app.shop.getSlots();
    app.screen = 'shop';
  } else if (btnIdx === 2) {
    app.encyclopedia = createEncyclopediaState();
    app.screen = 'encyclopedia';
  } else if (btnIdx === 3) {
    // Start battle
    const config = getCurrentConfig(app.garage);
    if (config && app.garage.assemblyResult.valid) {
      if (app.lobby.selectedMode === 'chess') {
        startChess(config);
      } else {
        startSiege(config);
      }
    }
  }
}

// ============================================================
// Garage (reachable from lobby)
// ============================================================

function updateGarage(): void {
  // Scroll wheel for part list
  const wheel = input.consumeWheel();
  if (wheel !== 0) {
    const allParts = Inventory.getAllParts().filter(p => p.type === app.garage.activeType);
    const maxScroll = Math.max(0, allParts.length * 28 - (MAP_H - 86 - 16));
    const so = (app.garage.scrollOffset ?? 0) + wheel * 0.5;
    app.garage.scrollOffset = Math.max(0, Math.min(maxScroll, so));
  }
  if (input.isMouseJustPressed()) {
    // Practice button (top-right of preview area)
    const px = 284, py = 46, pw = 470;
    const bx = px + pw - 82, by = py + 6;
    if (input.mousePos.x >= bx && input.mousePos.x <= bx + 76 && input.mousePos.y >= by && input.mousePos.y <= by + 24) {
      const config = getCurrentConfig(app.garage);
      if (config && app.garage.assemblyResult.valid) {
        app.garage.practiceMode = true;
        app.practice = createPractice(config, px, py, pw, 640 - 160);
      }
      return;
    }
    // Back button
    if (hitTestGarageButtons(input.mousePos.x, input.mousePos.y, MAP_W, MAP_H)) {
      app.screen = 'lobby'; return;
    }

    // Build slot: click=load, shift+click=save
    const slotIdx = getBuildSlotHitIndex(input.mousePos.x, input.mousePos.y, MAP_W);
    if (slotIdx >= 0) {
      const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      if (shift) {
        saveToBuildSlot(app.garage, slotIdx);
        app.garageMessage = `✅ 已保存到配置${slotIdx + 1}`; app.garageMessageTimer = 2;
      } else {
        applyBuildSlot(app.garage, app.inventory, slotIdx);
        app.garageMessage = `📂 已加载配置${slotIdx + 1}`; app.garageMessageTimer = 2;
      }
      return;
    }

    // Part cards
    const hit = hitTestGarage(input.mousePos.x, input.mousePos.y, MAP_W, app.inventory, app.garage);
    if (hit) { selectPart(app.garage, hit.type, hit.partId, app.inventory); }
  }

  // Keyboard: 1/2/3 = load, Shift+1/2/3 = save
  for (let i = 0; i < 3; i++) {
    const key = `Digit${i + 1}`;
    if (input.wasJustPressed(key)) {
      if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) {
        saveToBuildSlot(app.garage, i); app.garageMessage = `✅ 已保存配置${i + 1}`; app.garageMessageTimer = 2;
      } else {
        applyBuildSlot(app.garage, app.inventory, i); app.garageMessage = `📂 已加载配置${i + 1}`; app.garageMessageTimer = 2;
      }
    }
  }
  app.garageMessageTimer -= 0.016;
}

// ============================================================
// Shop
// ============================================================

function updateShop(): void {
  if (!input.isMouseJustPressed()) return;

  if (hitTestShopButtons(input.mousePos.x, input.mousePos.y, MAP_W, MAP_H)) {
    app.screen = 'lobby';
    return;
  }

  const idx = hitTestShop(input.mousePos.x, input.mousePos.y, MAP_W, app.shopUI.slots.length);
  if (idx >= 0 && app.shopUI.slots[idx]) {
    attemptBuy(app.shopUI, app.shop, app.shopUI.slots[idx].part.id);
  }
}

// ============================================================
// Encyclopedia
// ============================================================

function updateEncyclopedia(): void {
  // Scroll wheel for part cards
  const wheel = input.consumeWheel();
  if (wheel !== 0 && !input.isMouseJustPressed()) {
    const allParts = Inventory.getAllParts().filter(p => p.type === app.encyclopedia.selectedType);
    const totalH = allParts.length * (120 + 8);
    const listH = MAP_H - 100 - 60;
    const maxScroll = Math.max(0, totalH - listH);
    const so = app.encyclopedia.scrollOffset + wheel * 0.5;
    app.encyclopedia.scrollOffset = Math.max(0, Math.min(maxScroll, so));
  }
  if (!input.isMouseJustPressed()) return;

  if (hitTestEncyclopediaButton(input.mousePos.x, input.mousePos.y, MAP_W, MAP_H)) {
    app.screen = 'lobby';
    return;
  }

  const type = hitTestEncyclopediaTabs(input.mousePos.x, input.mousePos.y, MAP_W);
  if (type) {
    app.encyclopedia.selectedType = type;
    app.encyclopedia.scrollOffset = 0;
  }
}

// ============================================================
// Siege
// ============================================================

function startSiege(config: TankConfig): void {
  app.siege = createSiegeState(config, app.inventory, app.lobby.selectedMap);
  app.screen = 'siege';
}

function handleSiegeUI(): void {
  if (!app.siege || !input.isMouseJustPressed()) return;

  const phase = app.siege.phase;
  const mx = input.mousePos.x;
  const my = input.mousePos.y;

  // Gear button during playing
  if (phase === 'playing' && hitTestGearButton(mx, my)) {
    app.siege.phase = 'paused';
    return;
  }

  // Pause menu
  if (phase === 'paused') {
    if (hitTestPauseResume(mx, my)) {
      app.siege.phase = 'playing';
    } else if (hitTestPauseQuit(mx, my)) {
      app.screen = 'lobby';
      app.siege = null;
    }
    return;
  }

  // Intro screen
  if (phase === 'intro') {
    app.siege.phase = 'playing';
    return;
  }

  // Result screens
  if (phase === 'victory' || phase === 'defeat') {
    if (hitTestSiegeBackButton(mx, my)) {
      app.screen = 'lobby';
      app.siege = null;
    }
  }
}

// ============================================================
// Start
// ============================================================

// ============================================================
// Chess mode
// ============================================================

function startChess(config: TankConfig): void {
  app.chess = createChessState(config, app.inventory);
  app.screen = 'chess';
}

function updateChess(): void {
  if (!app.chess || !input.isMouseJustPressed()) return;

  const state = app.chess;
  const mx = input.mousePos.x;
  const my = input.mousePos.y;

  // Gear button — quit to lobby
  if (hitTestChessGearButton(mx, my)) {
    app.screen = 'lobby';
    app.chess = null;
    return;
  }

  // Result screens
  if (state.phase === 'victory' || state.phase === 'defeat') {
    if (hitTestChessBackButton(mx, my)) {
      app.screen = 'lobby';
      app.chess = null;
    }
    return;
  }

  // Intro → start
  if (state.phase === 'intro') {
    state.phase = 'player_turn';
    state.message = '你的回合 — 点击坦克';
    return;
  }

  const grid = pixelToChessGrid(mx, my);
  if (!grid) return;

  if (state.phase === 'player_turn') {
    // If clicked on own tank, select it
    const ownTank = state.playerTanks.find(t => t.alive && t.gridX === grid.gx && t.gridY === grid.gy);
    if (ownTank) {
      selectChessTank(state, grid.gx, grid.gy);
      return;
    }
    // If tank selected and clicked valid move, move there
    if (state.selectedTank && state.validMoves.some(m => m.gx === grid.gx && m.gy === grid.gy)) {
      moveChessTank(state, grid.gx, grid.gy);
      return;
    }
  }

  if (state.phase === 'player_fire') {
    if (state.validMoves.some(m => m.gx === grid.gx && m.gy === grid.gy)) {
      fireChessTank(state, grid.gx, grid.gy);
    }
  }
}

// ============================================================
// Start
// ============================================================

const loop = new GameLoop(update, render);
loop.start();

console.log('🔧 坦克工程师 MVP 已启动');
console.log('  大厅 — 选择模式和地图，点击按钮导航');
