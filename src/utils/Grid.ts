import { Vec2 } from './Vector';

export const CELL_SIZE = 32; // pixels per grid cell
export const MAP_COLS = 30;
export const MAP_ROWS = 22;
export const MAP_W = MAP_COLS * CELL_SIZE; // 960
export const MAP_H = MAP_ROWS * CELL_SIZE; // 704

export enum TileType {
  EMPTY = 0,
  BRICK = 1,   // destroyable (500 HP)
  METAL = 2,   // indestructible, reflects
  WATER = 3,   // tanks can't enter, bullets fly over
  GRASS = 4,   // tanks can enter, hides vision
  ICE = 5,     // tanks slide with inertia
  BARREL = 6,  // explodes when hit, AoE damage
}

export interface Tile {
  type: TileType;
  hp: number; // only meaningful for BRICK (1 = intact, 0 = destroyed)
}

export function createEmptyTile(): Tile {
  return { type: TileType.EMPTY, hp: 0 };
}

export function createBrickTile(): Tile {
  return { type: TileType.BRICK, hp: 500 }; // 500 HP — brick is primarily for bouncing/knocking
}

export function createMetalTile(): Tile {
  return { type: TileType.METAL, hp: 200 };
}

export function createWaterTile(): Tile {
  return { type: TileType.WATER, hp: -1 };
}

export function createGrassTile(): Tile {
  return { type: TileType.GRASS, hp: -1 };
}

export function createIceTile(): Tile {
  return { type: TileType.ICE, hp: -1 };
}

export function createBarrelTile(): Tile {
  return { type: TileType.BARREL, hp: 30 }; // low HP, explodes on destroy
}

/** Convert pixel position to grid cell coordinate */
export function pixelToGrid(px: number, py: number): Vec2 {
  return new Vec2(Math.floor(px / CELL_SIZE), Math.floor(py / CELL_SIZE));
}

/** Convert grid cell top-left to pixel position (centered) */
export function gridToPixel(gx: number, gy: number): Vec2 {
  return new Vec2(gx * CELL_SIZE + CELL_SIZE / 2, gy * CELL_SIZE + CELL_SIZE / 2);
}

/** Clamp pixel position to map bounds */
export function clampToMap(pos: Vec2, margin: number = CELL_SIZE / 2): Vec2 {
  return new Vec2(
    Math.max(margin, Math.min(MAP_W - margin, pos.x)),
    Math.max(margin, Math.min(MAP_H - margin, pos.y)),
  );
}

/** Check if grid coordinate is within map bounds */
export function inBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS;
}

/** Manhattan distance between two grid cells */
export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
