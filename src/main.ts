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
}

// ============================================================
// Canvas setup
// ============================================================

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.width = MAP_W;
canvas.height = MAP_H;
const ctx = canvas.getContext('2d')!;

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
    updateGarage();
  } else if (app.screen === 'shop') {
    updateShop();
  } else if (app.screen === 'encyclopedia') {
    updateEncyclopedia();
  }
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

  if (app.screen === 'siege' && app.siege) {
    renderSiege(ctx, app.siege);
    if (app.siege.phase === 'playing' || app.siege.phase === 'paused') {
      drawHUD(ctx, app.siege);
    }
  } else if (app.screen === 'chess' && app.chess) {
    renderChess(ctx, app.chess);
  } else if (app.screen === 'lobby') {
    const config = getCurrentConfig(app.garage);
    renderLobby(ctx, MAP_W, MAP_H, app.lobby, config, app.garage.assemblyResult.valid);
  } else if (app.screen === 'garage') {
    renderGarage(ctx, MAP_W, MAP_H, app.garage, app.inventory, app.garageMessage, app.garageMessageTimer);
    if (app.practice) renderPractice(ctx, app.practice);
  } else if (app.screen === 'shop') {
    renderShop(ctx, MAP_W, MAP_H, app.shopUI, app.inventory.data.gold);
  } else if (app.screen === 'encyclopedia') {
    renderEncyclopedia(ctx, MAP_W, MAP_H, app.encyclopedia, app.inventory);
  }
}

// ============================================================
// Lobby
// ============================================================

function updateLobby(): void {
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
  // Practice mode active — bypass normal garage UI
  if (app.practice) {
    updatePractice(app.practice, input, 0.016);
    if (input.isMouseJustPressed()) {
      // Check practice exit button (top-right of preview)
      const px = 284, py = 46, pw = 470;
      const bx = px + pw - 76, by = py + 4;
      if (input.mousePos.x >= bx && input.mousePos.x <= bx + 70 && input.mousePos.y >= by && input.mousePos.y <= by + 22) {
        app.practice = null;
        app.garage.practiceMode = false;
      }
    }
    return;
  }

  if (input.isMouseJustPressed()) {
    // Practice button (top-right of preview area)
    const px = 284, py = 46, pw = 470;
    const bx = px + pw - 76, by = py + 4;
    if (input.mousePos.x >= bx && input.mousePos.x <= bx + 70 && input.mousePos.y >= by && input.mousePos.y <= by + 22) {
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
    app.garage = createGarageState(app.inventory);
  }
}

// ============================================================
// Encyclopedia
// ============================================================

function updateEncyclopedia(): void {
  if (!input.isMouseJustPressed()) return;

  if (hitTestEncyclopediaButton(input.mousePos.x, input.mousePos.y, MAP_W, MAP_H)) {
    app.screen = 'lobby';
    return;
  }

  const type = hitTestEncyclopediaTabs(input.mousePos.x, input.mousePos.y, MAP_W);
  if (type) {
    app.encyclopedia.selectedType = type;
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
      app.garage = createGarageState(app.inventory);
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
      app.garage = createGarageState(app.inventory);
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
      app.garage = createGarageState(app.inventory);
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
