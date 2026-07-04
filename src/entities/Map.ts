import { Tile, TileType, createEmptyTile, createBrickTile, createMetalTile, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { rand } from '../utils/Random';

/** 2D grid of tiles representing the battlefield */
export type TileGrid = Tile[][];

export type MapName = 'classic' | 'arena' | 'maze' | 'crossfire';

export const ALL_MAPS: MapName[] = ['classic', 'arena', 'maze', 'crossfire'];

export function pickRandomMap(): MapName {
  return rand.pick(ALL_MAPS);
}

export function createEmptyMap(): TileGrid {
  const map: TileGrid = [];
  for (let y = 0; y < MAP_ROWS; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      map[y][x] = createEmptyTile();
    }
  }
  return map;
}

export function createMap(name: MapName): TileGrid {
  switch (name) {
    case 'classic': return createClassicMap();
    case 'arena': return createArenaMap();
    case 'maze': return createMazeMap();
    case 'crossfire': return createCrossfireMap();
  }
}

// ============================================================
// Map generators
// ============================================================

function addBorders(map: TileGrid): { midX: number; midY: number } {
  for (let x = 0; x < MAP_COLS; x++) {
    map[0][x] = createMetalTile();
    map[MAP_ROWS - 1][x] = createMetalTile();
  }
  for (let y = 1; y < MAP_ROWS - 1; y++) {
    map[y][0] = createMetalTile();
    map[y][MAP_COLS - 1] = createMetalTile();
  }
  const midX = Math.floor(MAP_COLS / 2);
  const midY = Math.floor(MAP_ROWS / 2);
  // Spawn gates
  map[0][midX] = createEmptyTile();
  map[MAP_ROWS - 1][midX] = createEmptyTile();
  map[midY][0] = createEmptyTile();
  map[midY][MAP_COLS - 1] = createEmptyTile();
  return { midX, midY };
}

/** Classic: defensive ring + scattered cover + metal pillars for bounce shots */
function createClassicMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Inner diamond ring
  placeBrick(map, cx - 3, cy - 2); placeBrick(map, cx - 2, cy - 2); placeBrick(map, cx - 2, cy - 3);
  placeBrick(map, cx + 3, cy - 2); placeBrick(map, cx + 2, cy - 2); placeBrick(map, cx + 2, cy - 3);
  placeBrick(map, cx - 3, cy + 2); placeBrick(map, cx - 2, cy + 2); placeBrick(map, cx - 2, cy + 3);
  placeBrick(map, cx + 3, cy + 2); placeBrick(map, cx + 2, cy + 2); placeBrick(map, cx + 2, cy + 3);

  // Scattered cover
  placeBrick(map, cx - 5, cy - 1); placeBrick(map, cx + 5, cy - 1);
  placeBrick(map, cx - 5, cy + 1); placeBrick(map, cx + 5, cy + 1);
  placeBrick(map, cx - 1, cy - 4); placeBrick(map, cx + 1, cy - 4);
  placeBrick(map, cx - 1, cy + 4); placeBrick(map, cx + 1, cy + 4);
  placeBrick(map, cx - 4, cy);     placeBrick(map, cx + 4, cy);
  placeBrick(map, cx, cy - 4);     placeBrick(map, cx, cy + 4);

  // Metal pillars for bounce shots
  placeMetal(map, cx - 3, 2); placeMetal(map, cx + 3, 2);
  placeMetal(map, cx - 3, MAP_ROWS - 3); placeMetal(map, cx + 3, MAP_ROWS - 3);
  placeMetal(map, cx - 6, cy - 3); placeMetal(map, cx + 6, cy - 3);
  placeMetal(map, cx - 6, cy + 3); placeMetal(map, cx + 6, cy + 3);

  return map;
}

/** Arena: wide open with minimal cover — pure movement and aim skill */
function createArenaMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Sparse metal pillars only — no brick walls
  for (const [dx, dy] of [[-4, 0], [4, 0], [0, -3], [0, 3], [-3, -2], [3, -2], [-3, 2], [3, 2]]) {
    placeMetal(map, cx + dx, cy + dy);
  }

  // A few brick corners near edges for emergency cover
  placeBrick(map, 3, 3); placeBrick(map, MAP_COLS - 4, 3);
  placeBrick(map, 3, MAP_ROWS - 4); placeBrick(map, MAP_COLS - 4, MAP_ROWS - 4);

  return map;
}

/** Maze: dense brick corridors — rewards pierce and bounce barrels */
function createMazeMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Open center area (safe zone around CC)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const tx = cx + dx, ty = cy + dy;
      if (tx >= 0 && tx < MAP_COLS && ty >= 0 && ty < MAP_ROWS) {
        map[ty][tx] = createEmptyTile(); // ensure open
      }
    }
  }

  // Horizontal brick corridors
  for (let row = 2; row < MAP_ROWS - 2; row += 3) {
    for (let col = 1; col < MAP_COLS - 1; col++) {
      if (col % 3 !== 0) placeBrick(map, col, row);
    }
  }
  // Vertical brick corridors
  for (let col = 2; col < MAP_COLS - 2; col += 3) {
    for (let row = 1; row < MAP_ROWS - 1; row++) {
      if (row % 3 !== 0) placeBrick(map, col, row);
    }
  }

  // Metal pillars at corridor intersections
  for (let row = 3; row < MAP_ROWS - 3; row += 3) {
    for (let col = 3; col < MAP_COLS - 3; col += 3) {
      placeMetal(map, col, row);
    }
  }

  return map;
}

/** Crossfire: diagonal metal walls forming X pattern — rewards bounce shots */
function createCrossfireMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Diagonal metal walls forming X
  for (let i = -6; i <= 6; i++) {
    if (Math.abs(i) < 2) continue; // gap near center
    placeMetal(map, cx + i, cy + i);
    placeMetal(map, cx + i, cy - i);
  }

  // Brick corners for cover
  placeBrick(map, cx - 5, cy); placeBrick(map, cx + 5, cy);
  placeBrick(map, cx, cy - 5); placeBrick(map, cx, cy + 5);
  placeBrick(map, cx - 3, cy - 4); placeBrick(map, cx + 3, cy - 4);
  placeBrick(map, cx - 3, cy + 4); placeBrick(map, cx + 3, cy + 4);

  return map;
}

// ============================================================
// Helpers
// ============================================================

function placeBrick(map: TileGrid, x: number, y: number) {
  if (x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS && map[y][x].type === TileType.EMPTY) {
    map[y][x] = createBrickTile();
  }
}

function placeMetal(map: TileGrid, x: number, y: number) {
  if (x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS && map[y][x].type === TileType.EMPTY) {
    map[y][x] = createMetalTile();
  }
}
