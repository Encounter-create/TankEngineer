// ============================================================
// Two Kings War (双王战争) — symmetrical 3-lane PvE mode
// ============================================================

import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, TileType } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity, createTank, TURRET_ANGULAR_VEL, getBerserkerMultiplier } from '../entities/Tank';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS } from '../entities/Parts';
import { BulletEntity, createBullet, BULLET_RADIUS } from '../entities/Bullet';
import { PhysicsBlock } from '../entities/PhysicsBlock';
import { Particle, spawnParticles } from '../entities/Particle';
import { AllyTank, createAllyTank } from '../entities/Ally';
import { AIContext, createAIContext, updateAI, shouldFire } from '../ai/EnemyAI';
import { Input } from '../core/Input';
import { moveTank, normalizeAngle, SolidStructure } from '../core/Physics';
import { handleBullets, handleBulletTankCollisions, handleSkillActivation } from './Siege';
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
const BLUE_TOWER_POS  = [
  new Vec2(9 * CELL_SIZE + CELL_SIZE/2, 5 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(9 * CELL_SIZE + CELL_SIZE/2, 11 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(9 * CELL_SIZE + CELL_SIZE/2, 17 * CELL_SIZE + CELL_SIZE/2),
];
const RED_TOWER_POS   = [
  new Vec2(21 * CELL_SIZE + CELL_SIZE/2, 5 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(21 * CELL_SIZE + CELL_SIZE/2, 11 * CELL_SIZE + CELL_SIZE/2),
  new Vec2(21 * CELL_SIZE + CELL_SIZE/2, 17 * CELL_SIZE + CELL_SIZE/2),
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

interface SpawnWave {
  timeStart: number;
  tanksPerLane: number;
  barrelId: string;
  turretId: string;
  chassisId: string;
}

const SPAWN_WAVES: SpawnWave[] = [
  { timeStart: 5,   tanksPerLane: 1, barrelId: 'barrel_straight', turretId: 'turret_light', chassisId: 'chassis_standard' },
  { timeStart: 35,  tanksPerLane: 1, barrelId: 'barrel_straight', turretId: 'turret_heavy', chassisId: 'chassis_standard' },
  { timeStart: 65,  tanksPerLane: 1, barrelId: 'barrel_bounce',  turretId: 'turret_light', chassisId: 'chassis_standard' },
  { timeStart: 100, tanksPerLane: 1, barrelId: 'barrel_pierce',  turretId: 'turret_heavy', chassisId: 'chassis_heavy' },
  { timeStart: 140, tanksPerLane: 2, barrelId: 'barrel_pierce',  turretId: 'turret_heavy', chassisId: 'chassis_heavy' },
];

const MATCH_DURATION = 240;

// Lane spawn positions (blue side, per lane) — red side is mirrored
const BLUE_SPAWNS = [
  new Vec2(2.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE/2),  // center, lanes branch from here
];
const RED_SPAWNS = [
  new Vec2(27.5 * CELL_SIZE, 11 * CELL_SIZE + CELL_SIZE/2),
];

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

function createTwoKingsMap(): TileGrid {
  const map: TileGrid = [];
  for (let y = 0; y < MAP_ROWS; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      map[y][x] = { type: TileType.EMPTY, hp: 0 };
    }
  }

  // River (water columns)
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let c = RIVER_COL; c <= RIVER_COL_END; c++) {
      let isBridge = false;
      for (const b of BRIDGES) {
        if (y >= b.rowStart && y <= b.rowEnd) { isBridge = true; break; }
      }
      if (!isBridge) {
        map[y][c] = { type: TileType.WATER, hp: 0 };
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

  // Borders
  for (let x = 0; x < MAP_COLS; x++) {
    map[0][x] = { type: TileType.METAL, hp: 200 };
    map[MAP_ROWS - 1][x] = { type: TileType.METAL, hp: 200 };
  }
  for (let y = 1; y < MAP_ROWS - 1; y++) {
    if (map[y][0].type === TileType.EMPTY) map[y][0] = { type: TileType.METAL, hp: 200 };
    if (map[y][MAP_COLS - 1].type === TileType.EMPTY) map[y][MAP_COLS - 1] = { type: TileType.METAL, hp: 200 };
  }

  return map;
}

// ============================================================
// State creation
// ============================================================

import { updateParticles } from '../entities/Particle';

export function createTwoKingsState(playerConfig: TankConfig): TwoKingsState {
  const map = createTwoKingsMap();
  const playerSpawn = BLUE_SPAWNS[0];
  const player = createTank('player', playerSpawn, playerConfig, true);
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
    bullets: [], particles: [], physicsBlocks: [],
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
    bullets.push(createBullet(spawnPos, angle, 'straight', 450, tower.bulletDamage, 0, 0, tower.id, true));
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
    bullets.push(createBullet(spawnPos, angle, 'straight', 480, base.bulletDamage, 0, 0, `base_${base.side}`, true));
    base.fireCooldown = base.fireCooldownMax;
  }
}

// ============================================================
// Wave spawning
// ============================================================

function spawnWaves(state: TwoKingsState): void {
  for (let w = state.wavesSpawned; w < SPAWN_WAVES.length; w++) {
    const wave = SPAWN_WAVES[w];
    if (state.elapsedTime < wave.timeStart) break;
    const barrel = MVP_BARRELS.find(p => p.id === wave.barrelId)!;
    const turret = MVP_TURRETS.find(p => p.id === wave.turretId)!;
    const chassis = MVP_CHASSIS.find(p => p.id === wave.chassisId)!;
    const config = assembleTank(barrel, turret, chassis);

    // Spawn blue allies — spread across lanes
    for (let lane = 0; lane < 3; lane++) {
      const laneY = [5, 11, 17][lane] * CELL_SIZE + CELL_SIZE / 2;
      for (let i = 0; i < wave.tanksPerLane; i++) {
        const spawnPos = new Vec2(BLUE_SPAWNS[0].x, laneY + (i - (wave.tanksPerLane - 1) / 2) * CELL_SIZE * 1.5);
        const id = `blue_${twokingsId++}`;
        const ally = createAllyTank(id, spawnPos, config, 'guard_player');
        ally.hp = ally.maxHp * 1.5; ally.maxHp = ally.hp;
        state.blueAiContexts.set(id, createAIContext(ally, RED_BASE_POS, 330, 200));
        state.blueTanks.push(ally);
        state.allies.push(ally);
      }
    }

    // Spawn red enemies
    for (let lane = 0; lane < 3; lane++) {
      const laneY = [5, 11, 17][lane] * CELL_SIZE + CELL_SIZE / 2;
      for (let i = 0; i < wave.tanksPerLane; i++) {
        const spawnPos = new Vec2(RED_SPAWNS[0].x, laneY + (i - (wave.tanksPerLane - 1) / 2) * CELL_SIZE * 1.5);
        const id = `red_${twokingsId++}`;
        const enemy = createTank(id, spawnPos, config, false);
        enemy.hp = enemy.maxHp * 1.2; enemy.maxHp = enemy.hp;
        state.redAiContexts.set(id, createAIContext(enemy, BLUE_BASE_POS, 330, 200));
        state.enemies.push(enemy);
      }
    }
    state.wavesSpawned = w + 1;
  }
}

// ============================================================
// AI update (Siege pattern: updateAI + moveTank + shouldFire)
// ============================================================

function updateAllAI(state: TwoKingsState, dt: number): void {
  // Blue allies: target red enemies → red towers → red base
  for (const ally of state.blueTanks) {
    if (!ally.alive) continue;
    const ctx = state.blueAiContexts.get(ally.id);
    if (!ctx) continue;

    let target: Vec2 = RED_BASE_POS;
    const nearestEnemy = state.enemies.find(e => e.alive && e.pos.dist(ally.pos) < ctx.visionRadius);
    if (nearestEnemy) target = nearestEnemy.pos;
    else {
      const nearestTower = state.redTowers.find(t => t.alive && t.pos.dist(ally.pos) < ctx.visionRadius);
      if (nearestTower) target = nearestTower.pos;
    }

    const moveDir = updateAI(ctx, target, state.map, dt);
    moveTank(ally as any, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks, state._structures);
    const maxSpd = effectiveSpeed(ally.config) * 0.65;
    if (ally.vel.mag() > maxSpd) ally.vel = ally.vel.norm().scale(maxSpd);

    // Turret
    const toTarget = target.sub(ally.pos);
    if (toTarget.mag() > 1) {
      const ta = toTarget.angle();
      const diff = normalizeAngle(ta - ally.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      ally.turretAngle = Math.abs(diff) < maxStep ? ta : normalizeAngle(ally.turretAngle + Math.sign(diff) * maxStep);
    }

    if (shouldFire(ctx, target)) {
      const cfg = ally.config;
      state.bullets.push(createBullet(ally.pos, ally.turretAngle, cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400, cfg.barrel.stats.bulletDamage ?? 25, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0, ally.id, true));
      ctx.fireCooldown = cfg.barrel.stats.cooldownMs ?? 800;
    }
  }

  // Red enemies: target blue allies → blue towers → blue base
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const ctx = state.redAiContexts.get(enemy.id);
    if (!ctx) continue;

    const allBlueCombatants = [...state.blueTanks.filter(a => a.alive), state.player].filter(t => t.alive);
    let target: Vec2 = BLUE_BASE_POS;
    const nearestAlly = allBlueCombatants.find(t => t.pos.dist(enemy.pos) < ctx.visionRadius);
    if (nearestAlly) target = nearestAlly.pos;
    else {
      const nearestTower = state.blueTowers.find(t => t.alive && t.pos.dist(enemy.pos) < ctx.visionRadius);
      if (nearestTower) target = nearestTower.pos;
    }

    const moveDir = updateAI(ctx, target, state.map, dt);
    moveTank(enemy, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks, state._structures);
    const maxSpd = effectiveSpeed(enemy.config) * 0.55;
    if (enemy.vel.mag() > maxSpd) enemy.vel = enemy.vel.norm().scale(maxSpd);

    const toTarget = target.sub(enemy.pos);
    if (toTarget.mag() > 1) {
      const ta = toTarget.angle();
      const diff = normalizeAngle(ta - enemy.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      enemy.turretAngle = Math.abs(diff) < maxStep ? ta : normalizeAngle(enemy.turretAngle + Math.sign(diff) * maxStep);
    }

    if (shouldFire(ctx, target)) {
      const cfg = enemy.config;
      state.bullets.push(createBullet(enemy.pos, enemy.turretAngle, cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 350, cfg.barrel.stats.bulletDamage ?? 25, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0, enemy.id, false));
      ctx.fireCooldown = cfg.barrel.stats.cooldownMs ?? 2000;
    }
  }
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

    // Commander skill (E key — Siege handler)
    if (input.wasJustPressed('KeyE')) {
      handleSkillActivation(state as any, input);
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

  // === AI update ===
  updateAllAI(state, dt);

  // === Tower + base auto-attack ===
  const allRed = state.enemies.filter(e => e.alive);
  const allBlue = [...state.blueTanks.filter(a => a.alive), state.player].filter(t => t.alive);
  for (const t of state.blueTowers) towerAttack(t, allRed, state.bullets, dt);
  for (const t of state.redTowers) towerAttack(t as any, allBlue, state.bullets, dt);
  baseAttack(state.blueBase, allRed, state.bullets, dt);
  baseAttack(state.redBase, allBlue, state.bullets, dt);

  // === Bullets ===
  handleBullets(state as any, dt, true);
  handleBulletTankCollisions(state as any, dt);
  checkBulletStructureCollisions(state);

  // === Particles ===
  updateParticles(state.particles, dt);
  state.particles = state.particles.filter((p: any) => p.alive);
  state.skillMessageTime -= 16;

  // === Win/loss ===
  if (state.blueBase.hp <= 0) { state.blueBase.alive = false; state.phase = 'defeat'; }
  if (state.redBase.hp <= 0) { state.redBase.alive = false; state.phase = 'victory'; }
  if (!state.player.alive) state.phase = 'defeat';
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
          bullet.alive = false;
          state.particles.push(...spawnParticles(bullet.pos, 'explosion', 5, 50));
        }
        break;
      }
    }
  }
}
