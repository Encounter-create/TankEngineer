// ============================================================
// Chess mode — turn-based tank strategy on 8x8 board
// ============================================================

import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { TankConfig } from '../entities/Parts';
import { Inventory } from '../systems/Inventory';
import { Random } from '../utils/Random';

// Board: 8×8, each chess cell = 64px (2× game cell)
export const CHESS_COLS = 8;
export const CHESS_ROWS = 8;
export const CHESS_CELL = 64; // pixels per chess cell
export const CHESS_W = CHESS_COLS * CHESS_CELL; // 512
export const CHESS_H = CHESS_ROWS * CHESS_CELL; // 512
export const CHESS_OFFSET_X = Math.floor((MAP_COLS * CELL_SIZE - CHESS_W) / 2); // 64
export const CHESS_OFFSET_Y = Math.floor((MAP_ROWS * CELL_SIZE - CHESS_H) / 2); // -16 → clamp

export interface ChessTank {
  id: string;
  gridX: number;
  gridY: number;
  hp: number;
  maxHp: number;
  config: TankConfig;
  alive: boolean;
  isPlayer: boolean;
}

export type ChessPhase = 'intro' | 'player_turn' | 'player_fire' | 'ai_turn' | 'animating' | 'victory' | 'defeat' | 'draw';

export interface ChessState {
  phase: ChessPhase;
  playerTanks: ChessTank[];
  aiTanks: ChessTank[];
  selectedTank: ChessTank | null;
  validMoves: { gx: number; gy: number }[];
  turnNumber: number;
  elapsedTime: number;
  inventory: Inventory;
  message: string;
}

export function createChessState(playerConfig: TankConfig, inventory: Inventory): ChessState {
  const tanks: ChessTank[] = [];
  // Player tanks: left side, columns 0-1
  for (let i = 0; i < 3; i++) {
    tanks.push({
      id: `p_${i}`,
      gridX: i % 2,
      gridY: 1 + i * 2,
      hp: playerConfig.turret.stats.maxHp ?? 100,
      maxHp: playerConfig.turret.stats.maxHp ?? 100,
      config: playerConfig,
      alive: true,
      isPlayer: true,
    });
  }
  // AI tanks: right side, columns 6-7
  for (let i = 0; i < 3; i++) {
    tanks.push({
      id: `e_${i}`,
      gridX: 7 - (i % 2),
      gridY: 1 + i * 2,
      hp: 100,
      maxHp: 100,
      config: playerConfig,
      alive: true,
      isPlayer: false,
    });
  }

  return {
    phase: 'intro',
    playerTanks: tanks.filter(t => t.isPlayer),
    aiTanks: tanks.filter(t => !t.isPlayer),
    selectedTank: null,
    validMoves: [],
    turnNumber: 0,
    elapsedTime: 0,
    inventory,
    message: '点击你的坦克开始',
  };
}

// ============================================================
// Actions
// ============================================================

/** Select a player tank. Returns valid move positions. */
export function selectChessTank(state: ChessState, gx: number, gy: number): void {
  if (state.phase !== 'player_turn') return;

  const tank = state.playerTanks.find(t => t.alive && t.gridX === gx && t.gridY === gy);
  if (!tank) {
    state.selectedTank = null;
    state.validMoves = [];
    return;
  }

  state.selectedTank = tank;
  state.validMoves = getValidMoves(tank, state);
}

/** Move selected tank to target cell */
export function moveChessTank(state: ChessState, gx: number, gy: number): boolean {
  if (!state.selectedTank || state.phase !== 'player_turn') return false;
  if (!state.validMoves.some(m => m.gx === gx && m.gy === gy)) return false;

  state.selectedTank.gridX = gx;
  state.selectedTank.gridY = gy;
  state.phase = 'player_fire';
  state.validMoves = getFireTargets(state.selectedTank, state);
  state.message = '点击目标方向开火';
  return true;
}

/** Fire from selected tank in a direction */
export function fireChessTank(state: ChessState, tgx: number, tgy: number): boolean {
  if (!state.selectedTank || state.phase !== 'player_fire') return false;
  if (!state.validMoves.some(m => m.gx === tgx && m.gy === tgy)) return false;

  // Raycast: bullet travels in straight line
  const dx = Math.sign(tgx - state.selectedTank.gridX);
  const dy = Math.sign(tgy - state.selectedTank.gridY);
  if (dx === 0 && dy === 0) return false;

  let cx = state.selectedTank.gridX + dx;
  let cy = state.selectedTank.gridY + dy;

  while (cx >= 0 && cx < CHESS_COLS && cy >= 0 && cy < CHESS_ROWS) {
    // Check if hit enemy
    const enemy = state.aiTanks.find(t => t.alive && t.gridX === cx && t.gridY === cy);
    if (enemy) {
      enemy.hp -= 35;
      if (enemy.hp <= 0) enemy.alive = false;
      break;
    }
    // Check if hit friendly (blocked by own tanks or walls at edges)
    const friendly = state.playerTanks.find(
      t => t.alive && t.id !== state.selectedTank!.id && t.gridX === cx && t.gridY === cy
    );
    if (friendly) break;
    cx += dx;
    cy += dy;
  }

  state.selectedTank = null;
  state.validMoves = [];
  state.turnNumber++;
  state.message = '敌方回合…';

  // Check win
  if (state.aiTanks.every(t => !t.alive)) {
    state.phase = 'victory';
    state.message = '全歼敌军！';
    return true;
  }

  state.phase = 'ai_turn';
  aiTurn(state);
  return true;
}

// ============================================================
// AI
// ============================================================

function aiTurn(state: ChessState): void {
  const rand = new Random();
  const aliveAi = state.aiTanks.filter(t => t.alive);
  const alivePlayer = state.playerTanks.filter(t => t.alive);
  if (aliveAi.length === 0 || alivePlayer.length === 0) return;

  const tank = rand.pick(aliveAi);
  const moves = getValidMoves(tank, state);

  if (moves.length > 0) {
    const move = rand.pick(moves);
    tank.gridX = move.gx;
    tank.gridY = move.gy;
  }

  // Find closest player tank and fire toward it
  let closest = alivePlayer[0];
  let minDist = Infinity;
  for (const p of alivePlayer) {
    const d = Math.abs(p.gridX - tank.gridX) + Math.abs(p.gridY - tank.gridY);
    if (d < minDist) { minDist = d; closest = p; }
  }

  const dx = Math.sign(closest.gridX - tank.gridX);
  const dy = Math.sign(closest.gridY - tank.gridY);
  const fireDx = dx !== 0 ? dx : (Math.random() > 0.5 ? 1 : -1);
  const fireDy = dy !== 0 ? dy : 0;

  let cx = tank.gridX + fireDx;
  let cy = tank.gridY + fireDy;
  while (cx >= 0 && cx < CHESS_COLS && cy >= 0 && cy < CHESS_ROWS) {
    const playerTank = state.playerTanks.find(t => t.alive && t.gridX === cx && t.gridY === cy);
    if (playerTank) {
      playerTank.hp -= 30;
      if (playerTank.hp <= 0) playerTank.alive = false;
      break;
    }
    const friendly = state.aiTanks.find(t => t.alive && t.id !== tank.id && t.gridX === cx && t.gridY === cy);
    if (friendly) break;
    cx += fireDx;
    cy += fireDy;
  }

  // Check defeat
  if (state.playerTanks.every(t => !t.alive)) {
    state.phase = 'defeat';
    state.message = '全军覆没！';
    return;
  }

  state.phase = 'player_turn';
  state.selectedTank = null;
  state.validMoves = [];
  state.message = '你的回合 — 点击坦克';
}

// ============================================================
// Movement validation
// ============================================================

function getValidMoves(tank: ChessTank, state: ChessState): { gx: number; gy: number }[] {
  const moves: { gx: number; gy: number }[] = [];
  const allTanks = [...state.playerTanks, ...state.aiTanks];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tank.gridX + dx;
      const ny = tank.gridY + dy;
      if (nx < 0 || nx >= CHESS_COLS || ny < 0 || ny >= CHESS_ROWS) continue;
      if (allTanks.some(t => t.alive && t.gridX === nx && t.gridY === ny)) continue;
      moves.push({ gx: nx, gy: ny });
    }
  }
  return moves;
}

function getFireTargets(tank: ChessTank, _state: ChessState): { gx: number; gy: number }[] {
  const targets: { gx: number; gy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      targets.push({ gx: tank.gridX + dx, gy: tank.gridY + dy });
    }
  }
  return targets;
}

// ============================================================
// Pixel helpers
// ============================================================

export function chessGridToPixel(gx: number, gy: number): Vec2 {
  return new Vec2(
    CHESS_OFFSET_X + gx * CHESS_CELL + CHESS_CELL / 2,
    CHESS_OFFSET_Y + gy * CHESS_CELL + CHESS_CELL / 2,
  );
}

export function pixelToChessGrid(px: number, py: number): { gx: number; gy: number } | null {
  const gx = Math.floor((px - CHESS_OFFSET_X) / CHESS_CELL);
  const gy = Math.floor((py - CHESS_OFFSET_Y) / CHESS_CELL);
  if (gx < 0 || gx >= CHESS_COLS || gy < 0 || gy >= CHESS_ROWS) return null;
  return { gx, gy };
}
