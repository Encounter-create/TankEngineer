import { Tile, TileType, createEmptyTile, createBrickTile, createMetalTile, MAP_COLS, MAP_ROWS } from '../utils/Grid';

/** 2D grid of tiles representing the battlefield */
export type TileGrid = Tile[][];

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

/**
 * Siege mode map layout.
 * Center: command post (3x3 area marked as empty but special-rendered).
 * Scattered brick walls for cover.
 * Metal walls forming key choke points.
 */
export function createSiegeMap(): TileGrid {
  const map = createEmptyMap();

  // Border metal walls
  for (let x = 0; x < MAP_COLS; x++) {
    map[0][x] = createMetalTile();
    map[MAP_ROWS - 1][x] = createMetalTile();
  }
  for (let y = 1; y < MAP_ROWS - 1; y++) {
    map[y][0] = createMetalTile();
    map[y][MAP_COLS - 1] = createMetalTile();
  }

  // Open spawn gates at midpoints of each edge
  const midX = Math.floor(MAP_COLS / 2);
  const midY = Math.floor(MAP_ROWS / 2);
  map[0][midX] = createEmptyTile();
  map[MAP_ROWS - 1][midX] = createEmptyTile();
  map[midY][0] = createEmptyTile();
  map[midY][MAP_COLS - 1] = createEmptyTile();

  const cx = midX, cy = midY;

  // ---- Inner defensive ring (brick walls) ----
  // Diamond-shaped ring with openings at corners — protects CC but leaves firing lanes

  // Top-left brick L
  placeBrick(map, cx - 3, cy - 2);
  placeBrick(map, cx - 2, cy - 2);
  placeBrick(map, cx - 2, cy - 3);
  // Top-right brick L
  placeBrick(map, cx + 3, cy - 2);
  placeBrick(map, cx + 2, cy - 2);
  placeBrick(map, cx + 2, cy - 3);
  // Bottom-left brick L
  placeBrick(map, cx - 3, cy + 2);
  placeBrick(map, cx - 2, cy + 2);
  placeBrick(map, cx - 2, cy + 3);
  // Bottom-right brick L
  placeBrick(map, cx + 3, cy + 2);
  placeBrick(map, cx + 2, cy + 2);
  placeBrick(map, cx + 2, cy + 3);

  // ---- Outer scattered cover (brick) ----
  // Provides cover for player to maneuver outside the inner ring
  placeBrick(map, cx - 5, cy - 1);
  placeBrick(map, cx + 5, cy - 1);
  placeBrick(map, cx - 5, cy + 1);
  placeBrick(map, cx + 5, cy + 1);
  placeBrick(map, cx - 1, cy - 4);
  placeBrick(map, cx + 1, cy - 4);
  placeBrick(map, cx - 1, cy + 4);
  placeBrick(map, cx + 1, cy + 4);

  // Extra scattered singles for geometric shooting angles
  placeBrick(map, cx - 4, cy);
  placeBrick(map, cx + 4, cy);
  placeBrick(map, cx, cy - 4);
  placeBrick(map, cx, cy + 4);

  // ---- Metal pillars (indestructible — great for bounce shots) ----
  // Near each spawn gate — provides cover for newly-spawned enemies AND the player
  placeMetal(map, cx - 3, 2);
  placeMetal(map, cx + 3, 2);
  placeMetal(map, cx - 3, MAP_ROWS - 3);
  placeMetal(map, cx + 3, MAP_ROWS - 3);

  // Mid-lane metal pillars — create bounce shot opportunities
  placeMetal(map, cx - 6, cy - 3);
  placeMetal(map, cx + 6, cy - 3);
  placeMetal(map, cx - 6, cy + 3);
  placeMetal(map, cx + 6, cy + 3);

  return map;
}

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
