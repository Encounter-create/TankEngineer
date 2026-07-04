import { Tile, TileType, createEmptyTile, createBrickTile, createMetalTile, MAP_COLS, MAP_ROWS } from '../utils/Grid';
import { rand } from '../utils/Random';

export type TileGrid = Tile[][];

export type MapName = 'classic' | 'arena' | 'maze' | 'crossfire' | 'rivers' | 'fortress' | 'spiral';

export const ALL_MAPS: MapName[] = ['classic', 'arena', 'maze', 'crossfire', 'rivers', 'fortress', 'spiral'];

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
    case 'rivers': return createRiversMap();
    case 'fortress': return createFortressMap();
    case 'spiral': return createSpiralMap();
  }
}

// ============================================================
// Shared: border + spawn gates
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
  // 4 spawn gates
  map[0][midX] = createEmptyTile();
  map[MAP_ROWS - 1][midX] = createEmptyTile();
  map[midY][0] = createEmptyTile();
  map[midY][MAP_COLS - 1] = createEmptyTile();
  // Extra gates at thirds
  const tx1 = Math.floor(MAP_COLS / 3);
  const tx2 = Math.floor(MAP_COLS * 2 / 3);
  const ty1 = Math.floor(MAP_ROWS / 3);
  const ty2 = Math.floor(MAP_ROWS * 2 / 3);
  map[0][tx1] = createEmptyTile(); map[0][tx2] = createEmptyTile();
  map[MAP_ROWS - 1][tx1] = createEmptyTile(); map[MAP_ROWS - 1][tx2] = createEmptyTile();
  map[ty1][0] = createEmptyTile(); map[ty2][0] = createEmptyTile();
  map[ty1][MAP_COLS - 1] = createEmptyTile(); map[ty2][MAP_COLS - 1] = createEmptyTile();
  return { midX, midY };
}

// ============================================================
// 1. Classic — defensive ring + scattered cover
// ============================================================

function createClassicMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Inner diamond ring (scaled)
  const r = 5;
  placeBrick(map, cx - r, cy - 3); placeBrick(map, cx - 3, cy - 3); placeBrick(map, cx - 3, cy - r);
  placeBrick(map, cx + r, cy - 3); placeBrick(map, cx + 3, cy - 3); placeBrick(map, cx + 3, cy - r);
  placeBrick(map, cx - r, cy + 3); placeBrick(map, cx - 3, cy + 3); placeBrick(map, cx - 3, cy + r);
  placeBrick(map, cx + r, cy + 3); placeBrick(map, cx + 3, cy + 3); placeBrick(map, cx + 3, cy + r);

  // Scattered cover
  for (const [dx, dy] of [[-7,-2],[7,-2],[-7,2],[7,2],[-2,-6],[2,-6],[-2,6],[2,6],[-6,0],[6,0],[0,-6],[0,6]]) {
    placeBrick(map, cx + dx, cy + dy);
  }

  // Metal pillars for bounce shots
  for (const [dx, dy] of [[-5,3],[5,3],[-5,MAP_ROWS-4],[5,MAP_ROWS-4],[-9,-5],[9,-5],[-9,5],[9,5]]) {
    placeMetal(map, cx + dx, cy + dy);
  }

  return map;
}

// ============================================================
// 2. Arena — open, sparse cover
// ============================================================

function createArenaMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Few metal pillars in elegant pattern
  for (const [dx, dy] of [[-6,0],[6,0],[0,-5],[0,5],[-5,-3],[5,-3],[-5,3],[5,3]]) {
    placeMetal(map, cx + dx, cy + dy);
  }
  // Sparse brick corners
  for (const [dx, dy] of [[4,4],[MAP_COLS-5,4],[4,MAP_ROWS-5],[MAP_COLS-5,MAP_ROWS-5]]) {
    placeBrick(map, dx, dy);
  }

  return map;
}

// ============================================================
// 3. Maze — dense brick corridors
// ============================================================

function createMazeMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Open center
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++)
      if (cx + dx >= 0 && cx + dx < MAP_COLS && cy + dy >= 0 && cy + dy < MAP_ROWS)
        map[cy + dy][cx + dx] = createEmptyTile();

  // Horizontal corridors (scaled)
  for (let row = 2; row < MAP_ROWS - 2; row += 4)
    for (let col = 1; col < MAP_COLS - 1; col++)
      if (col % 4 !== 0) placeBrick(map, col, row);

  // Vertical corridors
  for (let col = 2; col < MAP_COLS - 2; col += 4)
    for (let row = 1; row < MAP_ROWS - 1; row++)
      if (row % 4 !== 0) placeBrick(map, col, row);

  // Metal pillars at intersections
  for (let row = 4; row < MAP_ROWS - 4; row += 4)
    for (let col = 4; col < MAP_COLS - 4; col += 4)
      placeMetal(map, col, row);

  return map;
}

// ============================================================
// 4. Crossfire — X-shaped metal walls
// ============================================================

function createCrossfireMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Diagonal metal X (scaled)
  for (let i = -10; i <= 10; i++) {
    if (Math.abs(i) < 3) continue;
    placeMetal(map, cx + i, cy + i);
    placeMetal(map, cx + i, cy - i);
  }

  // Brick cover
  for (const [dx, dy] of [[-8,0],[8,0],[0,-8],[0,8],[-5,-6],[5,-6],[-5,6],[5,6]]) {
    placeBrick(map, cx + dx, cy + dy);
  }

  return map;
}

// ============================================================
// 5. Rivers — two water channels splitting the map
// ============================================================

function createRiversMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Two parallel rivers (gaps in walls act as "water" visually)
  for (let x = 5; x < MAP_COLS - 5; x++) {
    if (x === cx - 2 || x === cx + 2) continue; // bridges
    placeMetal(map, x, cy - 5);
    placeMetal(map, x, cy + 5);
  }
  for (let y = cy - 4; y <= cy + 4; y++) {
    if (y === cy) continue; // center passage
    placeMetal(map, cx - 6, y);
    placeMetal(map, cx + 6, y);
  }

  // Scattered brick islands
  for (const [dx, dy] of [[-8,-3],[8,-3],[-8,3],[8,3],[0,-8],[0,8]]) {
    placeBrick(map, cx + dx, cy + dy);
  }

  return map;
}

// ============================================================
// 6. Fortress — heavy fortifications around center
// ============================================================

function createFortressMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Outer wall ring (brick)
  for (let i = -7; i <= 7; i++) {
    if (Math.abs(i) === 0 || Math.abs(i) === 7) {
      placeBrick(map, cx + i, cy - 7);
      placeBrick(map, cx + i, cy + 7);
      placeBrick(map, cx - 7, cy + i);
      placeBrick(map, cx + 7, cy + i);
    }
  }

  // Inner metal pillars
  for (const [dx, dy] of [[-3,-3],[3,-3],[-3,3],[3,3]]) {
    placeMetal(map, cx + dx, cy + dy);
  }

  // Corner bastions
  for (const [dx, dy] of [[-9,-9],[9,-9],[-9,9],[9,9]]) {
    placeBrick(map, cx + dx, cy + dy);
    placeBrick(map, cx + dx + 1, cy + dy);
    placeBrick(map, cx + dx, cy + dy + 1);
  }

  return map;
}

// ============================================================
// 7. Spiral — elegant spiral of metal walls
// ============================================================

function createSpiralMap(): TileGrid {
  const map = createEmptyMap();
  const { midX: cx, midY: cy } = addBorders(map);

  // Spiral pattern (Fibonacci-like radius growth)
  let x = 0, y = 0, dir = 0;
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]];
  let stepLen = 2, stepsLeft = 2, lenCount = 0;

  for (let i = 0; i < 80; i++) {
    x += dirs[dir][0];
    y += dirs[dir][1];
    stepsLeft--;
    if (stepsLeft === 0) {
      dir = (dir + 1) % 4;
      lenCount++;
      stepLen = lenCount % 2 === 0 ? stepLen + 1 : stepLen;
      stepsLeft = stepLen;
    }
    const tx = cx + x, ty = cy + y;
    if (tx >= 1 && tx < MAP_COLS - 1 && ty >= 1 && ty < MAP_ROWS - 1) {
      placeMetal(map, tx, ty);
    }
  }

  // A few brick blocks for cover
  for (const [dx, dy] of [[-6,-2],[6,-2],[-6,2],[6,2]]) {
    placeBrick(map, cx + dx * 2, cy + dy);
  }

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
