// ============================================================
// 坦克工程师 — Tank Engineer
// MVP 主入口
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
} from './ui/Garage';
import {
  ShopUIState,
  createShopUIState,
  attemptBuy,
  renderShop,
  hitTestShop,
} from './ui/ShopUI';
import {
  SiegeState,
  createSiegeState,
  updateSiege,
} from './modes/Siege';
import { renderSiege, drawHUD } from './ui/Renderer';
import { MAP_W, MAP_H } from './utils/Grid';

// ============================================================
// App state machine
// ============================================================

type AppScreen = 'garage' | 'shop' | 'siege';

interface AppState {
  screen: AppScreen;
  inventory: Inventory;
  shop: Shop;
  garage: GarageState;
  shopUI: ShopUIState;
  siege: SiegeState | null;
  selectedCol: number; // 0=barrel, 1=turret, 2=chassis in garage
  selectedRow: number; // which part in column
  shopSelected: number; // which shop slot
}

// ============================================================
// Canvas setup
// ============================================================

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.width = MAP_W;
canvas.height = MAP_H;
const ctx = canvas.getContext('2d')!;

// ============================================================
// Initialize systems
// ============================================================

const input = new Input();
input.attachCanvas(canvas);
const inventory = new Inventory();
const shop = new Shop(inventory);
const garage = createGarageState(inventory);
const shopUI = createShopUIState();

const app: AppState = {
  screen: 'garage',
  inventory,
  shop,
  garage,
  shopUI,
  siege: null,
  selectedCol: 0,
  selectedRow: 0,
  shopSelected: 0,
};

// ============================================================
// Game loop
// ============================================================

function update(dt: number): void {
  switch (app.screen) {
    case 'garage':
      updateGarage(dt);
      break;
    case 'shop':
      updateShop(dt);
      break;
    case 'siege':
      if (app.siege) {
        updateSiege(app.siege, input, dt);
        handleSiegeTransitions();
      }
      break;
  }

  input.endFrame();
}

function render(_alpha: number): void {
  ctx.clearRect(0, 0, MAP_W, MAP_H);

  switch (app.screen) {
    case 'garage':
      renderGarage(ctx, MAP_W, MAP_H, app.garage, app.inventory);
      break;
    case 'shop':
      renderShop(ctx, MAP_W, MAP_H, app.shopUI, app.inventory.data.gold);
      break;
    case 'siege':
      if (app.siege) {
        renderSiege(ctx, app.siege);
        if (app.siege.phase === 'playing') {
          drawHUD(ctx, app.siege);
        }
      }
      break;
  }
}

// ============================================================
// Garage screen logic
// ============================================================

function updateGarage(_dt: number): void {
  // ---- Mouse click on part cards ----
  if (input.isMouseJustPressed()) {
    const hit = hitTestGarage(input.mousePos.x, input.mousePos.y, MAP_W, app.inventory);
    if (hit) {
      selectPart(app.garage, hit.type, hit.partId, app.inventory);
    }
  }

  // Navigate columns
  if (input.wasJustPressed('KeyA') || input.wasJustPressed('ArrowLeft')) {
    app.selectedCol = Math.max(0, app.selectedCol - 1);
    app.selectedRow = 0;
  }
  if (input.wasJustPressed('KeyD') || input.wasJustPressed('ArrowRight')) {
    app.selectedCol = Math.min(2, app.selectedCol + 1);
    app.selectedRow = 0;
  }

  // Navigate rows within column
  const parts = getPartsForCol(app.selectedCol);
  if (input.wasJustPressed('KeyW') || input.wasJustPressed('ArrowUp')) {
    app.selectedRow = Math.max(0, app.selectedRow - 1);
  }
  if (input.wasJustPressed('KeyS') || input.wasJustPressed('ArrowDown')) {
    app.selectedRow = Math.min(parts.length - 1, app.selectedRow + 1);
  }

  // Select part
  if (input.isConfirmPressed() && parts.length > 0) {
    const part = parts[app.selectedRow];
    const types: ['barrel', 'turret', 'chassis'] = ['barrel', 'turret', 'chassis'];
    selectPart(app.garage, types[app.selectedCol], part.id, app.inventory);
  }

  // Start game
  if (input.isFirePressed()) {
    const config = getCurrentConfig(app.garage);
    if (config && app.garage.assemblyResult.valid) {
      startSiege(config);
    }
  }

  // Open shop
  if (input.wasJustPressed('KeyB') || input.wasJustPressed('Tab')) {
    app.screen = 'shop';
    shopUI.message = '';
    shopUI.slots = app.shop.getSlots();
  }
}

function getPartsForCol(col: number) {
  switch (col) {
    case 0: return app.inventory.getOwnedByType('barrel');
    case 1: return app.inventory.getOwnedByType('turret');
    case 2: return app.inventory.getOwnedByType('chassis');
    default: return [];
  }
}

// ============================================================
// Shop screen logic
// ============================================================

function updateShop(_dt: number): void {
  // ---- Mouse click on shop slots ----
  if (input.isMouseJustPressed()) {
    const idx = hitTestShop(input.mousePos.x, input.mousePos.y, MAP_W, shopUI.slots.length);
    if (idx >= 0 && shopUI.slots[idx]) {
      attemptBuy(shopUI, app.shop, shopUI.slots[idx].part.id);
      app.garage = createGarageState(app.inventory);
    }
  }

  // Navigate
  if (input.wasJustPressed('KeyA') || input.wasJustPressed('ArrowLeft')) {
    app.shopSelected = Math.max(0, app.shopSelected - 1);
  }
  if (input.wasJustPressed('KeyD') || input.wasJustPressed('ArrowRight')) {
    app.shopSelected = Math.min(shopUI.slots.length - 1, app.shopSelected + 1);
  }

  // Buy
  if (input.isConfirmPressed() && shopUI.slots.length > 0) {
    const slot = shopUI.slots[app.shopSelected];
    if (slot) {
      attemptBuy(shopUI, app.shop, slot.part.id);
      app.garage = createGarageState(app.inventory);
    }
  }

  // Reroll
  if (input.wasJustPressed('KeyR')) {
    shopUI.slots = app.shop.refresh();
    shopUI.message = '🔄 已刷新';
    shopUI.messageColor = '#e8e8e8';
    app.shopSelected = 0;
  }

  // Back to garage
  if (input.isEscapePressed()) {
    app.screen = 'garage';
    shopUI.message = '';
  }
}

// ============================================================
// Siege transitions
// ============================================================

function startSiege(config: TankConfig): void {
  app.siege = createSiegeState(config, app.inventory);
  app.screen = 'siege';
}

function handleSiegeTransitions(): void {
  if (!app.siege) return;

  // Return to garage after seeing results
  if (
    (app.siege.phase === 'victory' || app.siege.phase === 'defeat') &&
    input.isConfirmPressed()
  ) {
    app.screen = 'garage';
    // Refresh garage to show new parts
    app.garage = createGarageState(app.inventory);
    app.siege = null;
  }
}

// ============================================================
// Start
// ============================================================

const loop = new GameLoop(update, render);
loop.start();

console.log('🔧 坦克工程师 MVP 已启动');
console.log('  WASD/Arrow: 移动 & 导航');
console.log('  Enter: 确认选择');
console.log('  Space: 开火 / 开始游戏');
console.log('  B/Tab: 打开商店');
console.log('  Esc: 返回');
console.log('  R: 刷新商店');
