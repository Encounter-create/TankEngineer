// ============================================================
// Two Kings War (双王战争) — symmetrical 3-lane PvE mode
// ============================================================

import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, TileType } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity, createTank, TURRET_ANGULAR_VEL, getBerserkerMultiplier } from '../entities/Tank';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, MVP_COMMANDERS } from '../entities/Parts';
import { BulletEntity, createBullet, BULLET_RADIUS } from '../entities/Bullet';
import { PhysicsBlock, createPhysicsBlock } from '../entities/PhysicsBlock';
import { Particle, spawnParticles } from '../entities/Particle';
import { AllyTank, createAllyTank } from '../entities/Ally';
import { AIContext, createAIContext, shouldFire } from '../ai/EnemyAI';
import { Input } from '../core/Input';
import { moveTank, normalizeAngle, resolveTankCollisions, SolidStructure } from '../core/Physics';
import { handleBullets, handlePhysicsBlocks, handleBulletTankCollisions } from '../systems/CombatSystem';
import { handleAllies, handlePlanes } from '../systems/SkillEntities';
import { handleSkillActivation } from '../systems/SkillRegistry';
import { updateMeteor } from '../skills/Trisolaran';
import { updateBivector } from '../skills/Bivector';
import { updateQuantum } from '../skills/Quantum';
import { updateLens } from '../skills/Lens';
import { updateRewind } from '../skills/Poincare';
import { updateBigBang } from '../skills/BigBang';
import { updateHolo } from '../skills/Holo';
import { updateTrojan } from '../skills/Trojan';
import { updateArk } from '../skills/Noah';
import { updateDamocles } from '../skills/Damocles';
import { updateDragon } from '../skills/Dragon';
import { updateGenesis } from '../skills/Genesis';
import { updateMjolnir } from '../skills/Mjolnir';
import { applyTerrainEffects } from '../systems/MapFeatures';
import { SkillStates } from '../types/SkillStates';

// ============================================================
// Constants
// ============================================================

type Side = 'blue' | 'red';

const RIVER_COL = 14;          // left river column
const RIVER_COL_END = 15;      // right river column

// Bridges: 3-row-wide wood planks over water
const BRIDGES = [
  { rowStart: 4, rowEnd: 6 },   // top
  { rowStart: 10, rowEnd: 12 }, // middle
  { rowStart: 16, rowEnd: 18 }, // bottom
];

const BLUE_BASE_POS   = new Vec2(2.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE / 2);
const RED_BASE_POS    = new Vec2(27.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE / 2);
const TOWER_X = 10 * CELL_SIZE;            // 320px = 4 cells from river (symmetric)
const BLUE_TOWER_POS  = [
  new Vec2(TOWER_X, 3 * CELL_SIZE + CELL_SIZE/2),   // top: 2 above lane
  new Vec2(TOWER_X, 11 * CELL_SIZE + CELL_SIZE/2),  // middle
  new Vec2(TOWER_X, 19 * CELL_SIZE + CELL_SIZE/2),  // bottom: 2 below lane
];
const RED_TOWER_POS   = [
  new Vec2(MAP_W - TOWER_X, 3 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(MAP_W - TOWER_X, 11 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(MAP_W - TOWER_X, 19 * CELL_SIZE + CELL_SIZE/2),
];

// ============================================================
// Defense Tower & Base entities
// ============================================================

export interface DefenseTower {
  id: string; pos: Vec2; hp: number; maxHp: number;
  fireRange: number; fireCooldown: number; fireCooldownMax: number;
  bulletDamage: number; alive: boolean;
  side: Side; lane: number;
}

export interface WarBase {
  pos: Vec2; hp: number; maxHp: number;
  fireRange: number; fireCooldown: number; fireCooldownMax: number;
  bulletDamage: number; alive: boolean;
  side: Side;
}

function createDefenseTower(pos: Vec2, side: Side, lane: number): DefenseTower {
  return { id: `tower_${side}_${lane}`, pos, hp: 400, maxHp: 400,
    fireRange: 160, fireCooldown: 0, fireCooldownMax: 900,
    bulletDamage: 18, alive: true, side, lane };
}

function createWarBase(pos: Vec2, side: Side): WarBase {
  return { pos, hp: 1000, maxHp: 1000, fireRange: 220,
    fireCooldown: 0, fireCooldownMax: 1100, bulletDamage: 30, alive: true, side };
}

// ============================================================
// Wave system
// ============================================================

const WAVE_INTERVAL = 10; // seconds between waves

function randomPart(parts: any[]): any {
  return parts[Math.floor(Math.random() * parts.length)];
}

function randomConfig(): TankConfig {
  const barrel = randomPart(MVP_BARRELS);
  const turret = randomPart(MVP_TURRETS);
  const chassis = randomPart(MVP_CHASSIS);
  return assembleTank(barrel, turret, chassis);
}

const MATCH_DURATION = 240;

// Lane spawn positions (blue side, per lane) — red side is mirrored
const PLAYER_SPAWN = new Vec2(4.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE / 2);

// ============================================================
// Game State
// ============================================================

export type TwoKingsPhase = 'intro' | 'playing' | 'paused' | 'victory' | 'defeat';

export interface TwoKingsState extends SkillStates {
  phase: TwoKingsPhase;
  map: TileGrid;
  player: TankEntity;
  blueBase: WarBase;
  redBase: WarBase;
  blueTowers: DefenseTower[];
  redTowers: DefenseTower[];
  blueTanks: AllyTank[];
  enemies: TankEntity[];
  blueAiContexts: Map<string, AIContext>;
  redAiContexts: Map<string, AIContext>;
  bullets: BulletEntity[];
  particles: Particle[];
  physicsBlocks: PhysicsBlock[];
  elapsedTime: number;
  wavesSpawned: number;
  skillMessage: string;
  skillMessageTime: number;
  screenShake: number;
  showDebug: boolean;
  // Solid structures for tank collision (bases + towers)
  _structures: SolidStructure[];
  // BattleEngine compat stubs
  allies: AllyTank[];
  turrets: any[];
  clones: any[];
  planes: any[];
  damageNumbers: any[];
  aiContexts: Map<string, AIContext>;
  fireZones: any[];
  commandCenterHp: number;
  enemiesKilled: number;
  comboTimer: number; comboText: string; comboColor: string; comboMultiplier: number;
  killStreak: number; killStreakTimer: number; maxMultiplier: number;
  slowMoTimer: number; activeModifiers: any[];
  playerCooldownRemaining: number;
}

let twokingsId = 0;

// ============================================================
// Map generation
// ============================================================

function createTwoKingsMap(blocks: PhysicsBlock[]): TileGrid {
  const map: TileGrid = [];
  for (let y = 0; y < MAP_ROWS; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      map[y][x] = { type: TileType.EMPTY, hp: 0 };
    }
  }

  // River — EMPTY tiles (blue visual) + SolidStructure walls (no sticky water)
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let c = RIVER_COL; c <= RIVER_COL_END; c++) {
      let isBridge = false;
      for (const b of BRIDGES) {
        if (y >= b.rowStart && y <= b.rowEnd) { isBridge = true; break; }
      }
      if (!isBridge) {
        map[y][c] = { type: TileType.EMPTY, hp: 0 };
      }
    }
  }

  // Bridge floors — 3-row wood planks, water on both sides, no metal
  for (const b of BRIDGES) {
    for (let y = b.rowStart; y <= b.rowEnd; y++) {
      for (let c = RIVER_COL; c <= RIVER_COL_END; c++) {
        map[y][c] = { type: TileType.EMPTY, hp: 0 };
      }
    }
  }

  // Borders as physics blocks (same approach as Siege: tiles → blocks, not tile collision)
  for (let x = 0; x < MAP_COLS; x++) {
    blocks.push(createPhysicsBlock(new Vec2((x + 0.5) * CELL_SIZE, 0.5 * CELL_SIZE), Vec2.zero(), TileType.METAL, 200));
    blocks.push(createPhysicsBlock(new Vec2((x + 0.5) * CELL_SIZE, (MAP_ROWS - 0.5) * CELL_SIZE), Vec2.zero(), TileType.METAL, 200));
  }
  for (let y = 1; y < MAP_ROWS - 1; y++) {
    if (map[y][0].type === TileType.EMPTY) blocks.push(createPhysicsBlock(new Vec2(0.5 * CELL_SIZE, (y + 0.5) * CELL_SIZE), Vec2.zero(), TileType.METAL, 200));
    if (map[y][MAP_COLS - 1].type === TileType.EMPTY) blocks.push(createPhysicsBlock(new Vec2((MAP_COLS - 0.5) * CELL_SIZE, (y + 0.5) * CELL_SIZE), Vec2.zero(), TileType.METAL, 200));
  }

  return map;
}

// ============================================================
// State creation
// ============================================================

import { updateParticles } from '../entities/Particle';

function ensureCommander(config: TankConfig): TankConfig {
  if (config.commander.id !== 'commander_none') return config;
  const repair = MVP_COMMANDERS.find(c => c.id === 'commander_repair')!;
  return assembleTank(config.barrel, config.turret, config.chassis, repair);
}

export function createTwoKingsState(playerConfig: TankConfig): TwoKingsState {
  playerConfig = ensureCommander(playerConfig);
  const blocks: PhysicsBlock[] = [];
  const map = createTwoKingsMap(blocks);
  const player = createTank('player', PLAYER_SPAWN, playerConfig, true);
  player.hp = player.maxHp * 3;
  player.maxHp = player.hp;

  const structures: SolidStructure[] = [
    { pos: BLUE_BASE_POS, radius: CELL_SIZE * 1.3 },
    { pos: RED_BASE_POS, radius: CELL_SIZE * 1.3 },
    ...BLUE_TOWER_POS.map(p => ({ pos: p, radius: CELL_SIZE * 0.9 })),
    ...RED_TOWER_POS.map(p => ({ pos: p, radius: CELL_SIZE * 0.9 })),
  ];

  return {
    phase: 'intro', map, player,
    _structures: structures,
    blueBase: createWarBase(BLUE_BASE_POS, 'blue'),
    redBase: createWarBase(RED_BASE_POS, 'red'),
    blueTowers: [0, 1, 2].map(i => createDefenseTower(BLUE_TOWER_POS[i], 'blue', i)),
    redTowers: [0, 1, 2].map(i => createDefenseTower(RED_TOWER_POS[i], 'red', i)),
    blueTanks: [], enemies: [],
    blueAiContexts: new Map(), redAiContexts: new Map(),
    bullets: [], particles: [], physicsBlocks: blocks,
    elapsedTime: 0, wavesSpawned: 0,
    skillMessage: '', skillMessageTime: 0, screenShake: 0, showDebug: false,
    allies: [], turrets: [], clones: [], planes: [],
    damageNumbers: [], aiContexts: new Map(), fireZones: [],
    commandCenterHp: 100, enemiesKilled: 0,
    comboTimer: 0, comboText: '', comboColor: '#fff', comboMultiplier: 1,
    killStreak: 0, killStreakTimer: 0, maxMultiplier: 1,
    slowMoTimer: 0, activeModifiers: [], playerCooldownRemaining: 0,
    // SkillStates (idle everything)
    meteorPhase: 'idle', meteorTimer: 0, meteorTarget: Vec2.zero(), meteorPos: Vec2.zero(), meteorVel: 0, meteorImpactTime: 0, meteorFlashAlpha: 0,
    bivectorPhase: 'idle', bivectorTimer: 0, bivectorProgress: 0, bivectorShear: 0, bivectorScale: 1, bivectorWhiteAlpha: 0, bivectorDestroyed: false, bivectorText: '', bivectorTextColor: '#000',
    quantumPhase: 'idle', quantumTimer: 0, quantumRedAlpha: 0, quantumBlueAlpha: 0, quantumDestroyed: false,
    lensPhase: 'idle', lensTimer: 0, lensTarget: Vec2.zero(), lensStrength: 0, lensRadius: 0,
    rewindPhase: 'idle', rewindTimer: 0, rewindBlueAlpha: 0, rewindReversed: false,
    bigbangPhase: 'idle', bigbangTimer: 0, bigbangScale: 1, bigbangWhiteAlpha: 0,
    holoPhase: 'idle', holoTimer: 0, holoRotation: 0, holoRadius: 0, holoCracks: 0,
    trojanPhase: 'idle', trojanTimer: 0, trojanX: 0, trojanDoor: 0, trojanSpawned: 0,
    arkPhase: 'idle', arkTimer: 0, arkWaterH: 0, arkLightningBranches: [], arkLightningTimer: 0,
    damoclesPhase: 'idle', damoclesTimer: 0,
    dragonPhase: 'idle', dragonTimer: 0, dragonX: 0, dragonY: 0, dragonReveal: 0,
    genesisPhase: 'idle', genesisTimer: 0, genesisFireRadius: 0, genesisCleared: false,
    mjolnirPhase: 'idle', mjolnirPos: Vec2.zero(), mjolnirVel: Vec2.zero(), mjolnirAngle: 0, mjolnirTimer: 0, mjolnirHoverBounce: 0, mjolnirLightningTimer: 1, mjolnirLightningBranches: [], mjolnirThorQuote: [], mjolnirThorStartTime: -1,
    gravityPos: Vec2.zero(), gravityTimer: 0, timeSlowTimer: 0, restoreTimer: 0, lightningBranches: [], lightningTimer: 0,
  };
}

// ============================================================
// Auto-attack: defense towers + bases
// ============================================================

function towerAttack(tower: DefenseTower, targets: TankEntity[], bullets: BulletEntity[], dt: number): void {
  if (!tower.alive) return;
  tower.fireCooldown -= dt * 1000;
  if (tower.fireCooldown > 0) return;
  let nearest: TankEntity | null = null; let nearestDist = tower.fireRange;
  for (const t of targets) { if (t.alive && t.pos.dist(tower.pos) < nearestDist) { nearestDist = t.pos.dist(tower.pos); nearest = t; } }
  if (nearest) {
    const angle = nearest.pos.sub(tower.pos).angle();
    const spawnPos = tower.pos.add(Vec2.fromAngle(angle, BULLET_RADIUS + 14));
    const isBlue = tower.side === 'blue';
    bullets.push(createBullet(spawnPos, angle, 'straight', 450, tower.bulletDamage, 0, 0, tower.id, isBlue));
    tower.fireCooldown = tower.fireCooldownMax;
  }
}

function baseAttack(base: WarBase, targets: TankEntity[], bullets: BulletEntity[], dt: number): void {
  if (!base.alive) return;
  base.fireCooldown -= dt * 1000;
  if (base.fireCooldown > 0) return;
  let nearest: TankEntity | null = null; let nearestDist = base.fireRange;
  for (const t of targets) { if (t.alive && t.pos.dist(base.pos) < nearestDist) { nearestDist = t.pos.dist(base.pos); nearest = t; } }
  if (nearest) {
    const angle = nearest.pos.sub(base.pos).angle();
    const spawnPos = base.pos.add(Vec2.fromAngle(angle, BULLET_RADIUS + 14));
    const isBlue = base.side === 'blue';
    bullets.push(createBullet(spawnPos, angle, 'straight', 480, base.bulletDamage, 0, 0, `base_${base.side}`, isBlue));
    base.fireCooldown = base.fireCooldownMax;
  }
}

// ============================================================
// Wave spawning
// ============================================================

function spawnWaves(state: TwoKingsState): void {
  // First wave immediately, then every WAVE_INTERVAL
  if (state.wavesSpawned > 0 && state.elapsedTime < state.wavesSpawned * WAVE_INTERVAL) return;

  // Spawn blue allies — 1 per lane, random config, spread per lane Y
  const laneYs = [5, 11, 17];
  const blueSpawnX = 5 * CELL_SIZE; // offset from base to avoid getting stuck
  for (let lane = 0; lane < 3; lane++) {
    const config = randomConfig();
    const spawnPos = new Vec2(blueSpawnX, laneYs[lane] * CELL_SIZE + CELL_SIZE / 2);
    const id = `blue_${twokingsId++}`;
    const ally = createAllyTank(id, spawnPos, config, 'guard_player');
    ally.hp = ally.maxHp * 1.5; ally.maxHp = ally.hp;
    (ally as any)._lane = lane; (ally as any)._wpIndex = 0;
    state.blueAiContexts.set(id, createAIContext(ally, RED_BASE_POS, 165, 100));
    state.blueTanks.push(ally);
    // NOT state.allies — lane tanks use updateAllAI, not handleAllies
  }

  // Spawn red enemies — 1 per lane, random config
  const redSpawnX = (MAP_COLS - 5) * CELL_SIZE;
  for (let lane = 0; lane < 3; lane++) {
    const config = randomConfig();
    const spawnPos = new Vec2(redSpawnX, laneYs[lane] * CELL_SIZE + CELL_SIZE / 2);
    const id = `red_${twokingsId++}`;
    const enemy = createTank(id, spawnPos, config, false);
    enemy.hp = enemy.maxHp * 1.2; enemy.maxHp = enemy.hp;
    (enemy as any)._lane = lane; (enemy as any)._wpIndex = 0;
    state.redAiContexts.set(id, createAIContext(enemy, BLUE_BASE_POS, 165, 100));
    state.enemies.push(enemy);
  }

  state.wavesSpawned++;
}

// ============================================================
// Lane waypoints for AI navigation (3 routes)
// ============================================================

/** Blue side → Red side — 5-point lane routes for AI navigation + visual */
export const BLUE_LANE_WAYPOINTS: Vec2[][] = [
  [ // Lane 0 (top): y=5
    new Vec2(5 * CELL_SIZE, 5 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(TOWER_X, 5 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(14.5 * CELL_SIZE, 5 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(MAP_W - TOWER_X, 5 * CELL_SIZE + CELL_SIZE / 2),
    RED_BASE_POS,
  ],
  [ // Lane 1 (middle): y=11
    new Vec2(5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(TOWER_X, 11 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(14.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(MAP_W - TOWER_X, 11 * CELL_SIZE + CELL_SIZE / 2),
    RED_BASE_POS,
  ],
  [ // Lane 2 (bottom): y=17
    new Vec2(5 * CELL_SIZE, 17 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(TOWER_X, 17 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(14.5 * CELL_SIZE, 17 * CELL_SIZE + CELL_SIZE / 2),
    new Vec2(MAP_W - TOWER_X, 17 * CELL_SIZE + CELL_SIZE / 2),
    RED_BASE_POS,
  ],
];

/** Red side → Blue side (mirror) */
export const RED_LANE_WAYPOINTS: Vec2[][] = BLUE_LANE_WAYPOINTS.map(lane =>
  [...lane].reverse().map(wp => new Vec2(MAP_W - wp.x, wp.y))
);

// ============================================================
// AI update — lane nav + layered targeting + moveTank collision
// ============================================================

function aiTargetAndMove(
  tank: TankEntity, lane: number, waypoints: Vec2[][],
  enemies: TankEntity[], towers: any[], player: TankEntity | null,
  state: TwoKingsState, ctx: AIContext, dt: number, isBlue: boolean,
): void {
  const visionR = ctx.visionRadius || 165;
  const fireR = ctx.fireRadius || 100;
  const wps = waypoints[lane];
  const wpIndex = (tank as any)._wpIndex as number ?? 0;

  // 1. Lock: keep current target unless dead or out of vision
  let lockId = (tank as any)._lockId as string | undefined;
  let fireTarget: any = null;
  if (lockId) {
    const allPossible = [...enemies, ...towers] as any[];
    if (player) allPossible.push(player);
    const locked = allPossible.find((t: any) => (t.id || 'player') === lockId && t.alive && tank.pos.dist(t.pos) < visionR);
    if (locked) { fireTarget = locked; }
    else { lockId = undefined; (tank as any)._lockId = undefined; }
  }

  // 2. New target: first enemy/player in vision, else own-lane tower, else any tower
  if (!lockId) {
    const inVision = [...enemies.filter(e => e.alive && tank.pos.dist(e.pos) < visionR)] as any[];
    if (player && player.alive && tank.pos.dist(player.pos) < visionR) inVision.push(player);
    // Enemy units first, then own-lane tower, then other towers
    if (inVision.length > 0) {
      fireTarget = inVision[0];
      lockId = fireTarget.id || 'player';
      (tank as any)._lockId = lockId;
    } else {
      const ownTower = towers[lane];
      if (ownTower && ownTower.alive && tank.pos.dist(ownTower.pos) < visionR) {
        fireTarget = ownTower; lockId = ownTower.id; (tank as any)._lockId = lockId;
      } else {
        const anyTower = towers.find(t => t.alive && tank.pos.dist(t.pos) < visionR);
        if (anyTower) { fireTarget = anyTower; lockId = anyTower.id; (tank as any)._lockId = lockId; }
      }
    }
  }

  // 3. Movement: Siege doFire pattern — keep optimal range, chase/retreat
  let moveTarget: Vec2;
  if (fireTarget) {
    const dist = tank.pos.dist(fireTarget.pos);
    if (dist < fireR * 0.5) {
      // Too close — back away (Siege doFire pattern)
      moveTarget = tank.pos.add(tank.pos.sub(fireTarget.pos).norm().scale(80));
    } else if (dist > fireR - 10) {
      // Outside optimal range — chase
      moveTarget = fireTarget.pos;
    } else {
      // Optimal range — stand and shoot
      moveTarget = tank.pos;
    }
  } else {
    const i = Math.min(wpIndex, wps.length - 1);
    if (tank.pos.dist(wps[i]) < 100 && wpIndex < wps.length - 1) (tank as any)._wpIndex = wpIndex + 1;
    moveTarget = wps[Math.min((tank as any)._wpIndex, wps.length - 1)];
  }

  // 4. Move — grid-based 4-direction (Siege pattern: DIR4 cardinal movement)
  const toTgt = moveTarget.sub(tank.pos);
  let moveDir = Vec2.zero();
  if (toTgt.mag() > 20) {
    const gx = Math.floor(tank.pos.x / CELL_SIZE);
    const gy = Math.floor(tank.pos.y / CELL_SIZE);
    const tgx = Math.floor(moveTarget.x / CELL_SIZE);
    const tgy = Math.floor(moveTarget.y / CELL_SIZE);
    const dx = tgx - gx, dy = tgy - gy;
    // Pick best cardinal direction toward target
    if (Math.abs(dx) > Math.abs(dy)) moveDir = new Vec2(dx > 0 ? 1 : -1, 0);
    else if (Math.abs(dy) > 0) moveDir = new Vec2(0, dy > 0 ? 1 : -1);
  }
  moveTank(tank as any, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks, state._structures);
  const maxSpd = effectiveSpeed(tank.config) * 0.55;
  if (tank.vel.mag() > maxSpd) tank.vel = tank.vel.norm().scale(maxSpd);

  // 5. Turret
  const aimAt = fireTarget ? fireTarget.pos : moveTarget;
  const toAim = aimAt.sub(tank.pos);
  if (toAim.mag() > 1) {
    const ta = toAim.angle();
    const diff = normalizeAngle(ta - tank.turretAngle);
    const maxStep = TURRET_ANGULAR_VEL * dt;
    tank.turretAngle = Math.abs(diff) < maxStep ? ta : normalizeAngle(tank.turretAngle + Math.sign(diff) * maxStep);
  }

  // 6. Fire (cooldown decrement first — same as updateAI in Siege)
  ctx.fireCooldown -= dt * 1000;
  if (fireTarget && shouldFire(ctx, fireTarget.pos)) {
    const cfg = tank.config;
    state.bullets.push(createBullet(
      tank.pos, tank.turretAngle,
      cfg.barrel.stats.bulletStyle ?? 'straight',
      cfg.barrel.stats.bulletSpeed ?? (isBlue ? 400 : 350),
      cfg.barrel.stats.bulletDamage ?? 25,
      cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0,
      tank.id, isBlue,
    ));
    ctx.fireCooldown = cfg.barrel.stats.cooldownMs ?? (isBlue ? 800 : 2000);
  }
}

function updateAllAI(state: TwoKingsState, dt: number): void {
  for (const ally of state.blueTanks) {
    if (!ally.alive) continue;
    const ctx = state.blueAiContexts.get(ally.id);
    if (!ctx) continue;
    const lane = (ally as any)._lane as number ?? 1;
    aiTargetAndMove(ally as any, lane, BLUE_LANE_WAYPOINTS,
      state.enemies, state.redTowers, null,
      state, ctx, dt, true);
  }
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const ctx = state.redAiContexts.get(enemy.id);
    if (!ctx) continue;
    const lane = (enemy as any)._lane as number ?? 1;
    aiTargetAndMove(enemy as any, lane, RED_LANE_WAYPOINTS,
      [...state.blueTanks, state.player], state.blueTowers, state.player,
      state, ctx, dt, false);
  }

  // Tank-tank collision
  const allAlive = [state.player, ...state.blueTanks, ...state.enemies].filter((t: any) => t.alive);
  resolveTankCollisions(allAlive);
}
// ============================================================
// Main update
// ============================================================

export function updateTwoKings(state: TwoKingsState, input: Input, dt: number): void {
  if (state.phase === 'victory' || state.phase === 'defeat') return;
  if (state.phase === 'paused') return;

  if (state.phase === 'intro') {
    if (input.isConfirmPressed() || input.isFirePressed()) { state.phase = 'playing'; state.player.cooldownRemaining = 200; }
    return;
  }

  state.elapsedTime += dt;
  if (state.elapsedTime >= MATCH_DURATION) { state.phase = 'defeat'; return; }

  // U-key debug toggle (TwoKings doesn't use BattleEngine.updateBattle)
  if (input.wasJustPressed('KeyU')) state.showDebug = !state.showDebug;

  state.screenShake = Math.max(0, state.screenShake - dt * 50);

  // === Player movement (Siege pattern via moveTank) ===
  if (state.player.alive) {
    const moveDir = new Vec2(
      (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0),
    );
    moveTank(state.player, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks, state._structures);

    // Turret follows mouse
    const toMouse = input.mousePos.sub(state.player.pos);
    if (toMouse.mag() > 1) {
      const targetAngle = toMouse.angle();
      const diff = normalizeAngle(targetAngle - state.player.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      if (Math.abs(diff) < maxStep) state.player.turretAngle = targetAngle;
      else state.player.turretAngle = normalizeAngle(state.player.turretAngle + Math.sign(diff) * maxStep);
    }

    // Commander skill (E key — Siege handler, test cooldown 1s)
    if (input.wasJustPressed('KeyE')) {
      handleSkillActivation(state as any, input);
      state.player.skillCooldownUntil = performance.now() + 1000;
    }

    state.playerCooldownRemaining -= dt * 1000;
    const wantFire = input.isMouseDown() || input.isDown('Space');
    if (wantFire && state.playerCooldownRemaining <= 0) {
      const cfg = state.player.config;
      const cooldown = effectiveCooldown(cfg);
      state.playerCooldownRemaining = cooldown;
      const bulletStyle = cfg.barrel.stats.bulletStyle ?? 'straight';
      const bulletSpeed = cfg.barrel.stats.bulletSpeed ?? 400;
      const berserkerMul = getBerserkerMultiplier(state.player);
      const bulletDamage = (cfg.barrel.stats.bulletDamage ?? 35) * 2 * berserkerMul;
      const bounces = cfg.barrel.stats.bounces ?? 0;
      const pierces = cfg.barrel.stats.pierces ?? 0;

      if (bulletStyle === 'scatter') {
        for (let j = -1; j <= 1; j++) {
          const b = createBullet(state.player.pos, state.player.turretAngle + j * (Math.PI / 12), 'straight', bulletSpeed, bulletDamage, 2, 0, state.player.id, true);
          state.bullets.push(b);
        }
      } else if (bulletStyle === 'rocket') {
        const b = createBullet(state.player.pos, state.player.turretAngle, 'rocket', bulletSpeed, bulletDamage, 0, 0, state.player.id, true);
        (b as any).targetPos = input.mousePos;
        state.bullets.push(b);
      } else if (bulletStyle === 'orbital') {
        for (let idx = 0; idx < 2; idx++) {
          state.bullets.push(createBullet(state.player.pos, state.player.turretAngle, 'orbital', bulletSpeed, bulletDamage, 0, 0, state.player.id, true, idx, 5));
        }
      } else {
        state.bullets.push(createBullet(state.player.pos, state.player.turretAngle, bulletStyle, bulletSpeed, bulletDamage, bounces, pierces, state.player.id, true));
      }
      // Muzzle flash
      const muzzlePos = state.player.pos.add(Vec2.fromAngle(state.player.turretAngle, 14));
      state.particles.push(...spawnParticles(muzzlePos, 'hit', 2, 40));
    }
  }

  // === Terrain ===
  applyTerrainEffects(state.player, state.map);
  for (const e of state.enemies) applyTerrainEffects(e, state.map);
  for (const a of state.blueTanks) applyTerrainEffects(a, state.map);

  // === Wave spawning ===
  spawnWaves(state);

  // Bases + river walls block tanks. Towers are walk-through.
  state._structures = [
    { pos: state.blueBase.pos, radius: CELL_SIZE * 1.3 },
    { pos: state.redBase.pos, radius: CELL_SIZE * 1.3 },
  ];
  // River walls: 1-block-wide vertical strip left + right of river
  for (let y = 0; y < MAP_ROWS; y++) {
    let isBridge = false;
    for (const b of BRIDGES) {
      if (y >= b.rowStart && y <= b.rowEnd) { isBridge = true; break; }
    }
    if (!isBridge) {
      state._structures.push({ pos: new Vec2(RIVER_COL * CELL_SIZE + CELL_SIZE/2, y * CELL_SIZE + CELL_SIZE/2), radius: CELL_SIZE/2 });
      state._structures.push({ pos: new Vec2((RIVER_COL_END+1) * CELL_SIZE - CELL_SIZE/2, y * CELL_SIZE + CELL_SIZE/2), radius: CELL_SIZE/2 });
    }
  }

  // === AI update ===
  updateAllAI(state, dt);

  // === Skill entities (allies, planes) ===
  handleAllies(state as any, dt, state._structures);
  handlePlanes(state as any, dt);

  // === Tower + base auto-attack ===
  const allRed = state.enemies.filter(e => e.alive);
  const allBlue = [...state.blueTanks.filter(a => a.alive), state.player].filter(t => t.alive);
  for (const t of state.blueTowers) towerAttack(t, allRed, state.bullets, dt);
  for (const t of state.redTowers) towerAttack(t as any, allBlue, state.bullets, dt);
  baseAttack(state.blueBase, allRed, state.bullets, dt);
  baseAttack(state.redBase, allBlue, state.bullets, dt);

  // === Physics blocks (border walls etc.) ===
  handlePhysicsBlocks(state as any, dt);

  // === Bullets ===
  handleBullets(state as any, dt);
  // Blue lane tanks need to be in allies for red bullet collision
  const savedAllies = state.allies;
  state.allies = [...savedAllies, ...state.blueTanks];
  handleBulletTankCollisions(state as any, dt);
  state.allies = savedAllies;
  // Player death → respawn (TwoKings mode-specific, not game over)
  if (!state.player.alive && state.blueBase.alive && state.redBase.alive) {
    state.player.alive = true;
    state.player.hp = state.player.maxHp;
    state.player.pos = PLAYER_SPAWN;
    state.player.vel = Vec2.zero();
    state.particles.push(...spawnParticles(PLAYER_SPAWN, 'repair', 15, 80));
  }
  checkBulletStructureCollisions(state);

  // === Particles ===
  updateParticles(state.particles, dt);
  state.particles = state.particles.filter((p: any) => p.alive);
  state.skillMessageTime -= 16;

  // === All skill updates (same as Siege pipeline) ===
  updateMeteor(state as any, dt);
  updateBivector(state as any, dt);
  updateQuantum(state as any, dt);
  updateLens(state as any, dt);
  updateRewind(state as any, dt);
  updateBigBang(state as any, dt);
  updateHolo(state as any, dt);
  updateTrojan(state as any, dt);
  updateArk(state as any, dt);
  updateDamocles(state as any, dt);
  updateDragon(state as any, dt);
  updateGenesis(state as any, dt);
  updateMjolnir(state as any, dt);

  // === Win/loss ===
  if (state.blueBase.hp <= 0) { state.blueBase.alive = false; state.phase = 'defeat'; }
  if (state.redBase.hp <= 0) { state.redBase.alive = false; state.phase = 'victory'; }
}

// ============================================================
// Bullet ↔ structure collision
// ============================================================

function checkBulletStructureCollisions(state: TwoKingsState): void {
  interface SC { pos: Vec2; hp: number; alive: boolean; side: Side; radius: number; entity: any };
  const structures: SC[] = [];
  for (const t of state.blueTowers) structures.push({ pos: t.pos, hp: t.hp, alive: t.alive, side: 'blue', radius: 20, entity: t });
  for (const t of state.redTowers) structures.push({ pos: t.pos, hp: t.hp, alive: t.alive, side: 'red', radius: 20, entity: t });
  structures.push({ pos: state.blueBase.pos, hp: state.blueBase.hp, alive: state.blueBase.alive, side: 'blue', radius: 28, entity: state.blueBase });
  structures.push({ pos: state.redBase.pos, hp: state.redBase.hp, alive: state.redBase.alive, side: 'red', radius: 28, entity: state.redBase });

  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;
    for (const s of structures) {
      if (!s.alive) continue;
      if (bullet.pos.dist(s.pos) < s.radius + BULLET_RADIUS) {
        const bulletSide: Side = bullet.isPlayerBullet ? 'blue' : 'red';
        if (bulletSide !== s.side) {
          s.entity.hp -= bullet.damage;
          if (s.entity.hp <= 0) s.entity.alive = false;
          bullet.alive = false;
          state.particles.push(...spawnParticles(bullet.pos, 'explosion', 5, 50));
        }
        break;
      }
    }
  }
}
