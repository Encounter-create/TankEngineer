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
import { renderAllEffects } from './ui/EffectRenderer';

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
// Offscreen canvas for lens effect (imported from RenderContext)

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

  // Restore Bivector + BigBang canvas transforms (pre-render wraps)
  if (bv && isCompressing) ctx.restore();
  if (bb) ctx.restore();

  // All skill visual effects — each draw function checks its own phase internally
  if (app.siege) renderAllEffects(ctx, app.siege);
  if (app.practice) renderAllEffects(ctx, app.practice);

  // Quote player (independent of skills)
  renderQuote(ctx);
}
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
    const so = (app.garage.scrollOffset ?? 0) + wheel;
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
