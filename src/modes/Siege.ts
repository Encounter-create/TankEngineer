import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, gridToPixel } from '../utils/Grid';
import { TileGrid, createSiegeMap } from '../entities/Map';
import { TankEntity, createTank, takeDamage } from '../entities/Tank';
import { BulletEntity, createBullet } from '../entities/Bullet';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS } from '../entities/Parts';
import { moveTank, moveBullet, checkBulletTankHit } from '../core/Physics';
import { Input } from '../core/Input';
import { AIContext, createAIContext, updateAI } from '../ai/EnemyAI';
import { Random } from '../utils/Random';
import { BattleReward, generateReward } from '../systems/Reward';
import { Inventory } from '../systems/Inventory';

// ============================================================
// Siege mode — 3 minute defense
// ============================================================

export type SiegePhase = 'intro' | 'playing' | 'victory' | 'defeat' | 'paused';

export interface WaveDef {
  timeStart: number;    // seconds
  enemyCount: number;
  /** Enemy config overwrites (null = use default) */
  hasBounceBarrel: boolean;
  hasHeavyTank: boolean;
}

export const TOTAL_WAVES = 6;
const MATCH_DURATION = 180; // 3 minutes

export const WAVES: WaveDef[] = [
  { timeStart: 0,   enemyCount: 2, hasBounceBarrel: false, hasHeavyTank: false },
  { timeStart: 30,  enemyCount: 3, hasBounceBarrel: true,  hasHeavyTank: false },
  { timeStart: 60,  enemyCount: 4, hasBounceBarrel: true,  hasHeavyTank: true  },
  { timeStart: 90,  enemyCount: 5, hasBounceBarrel: true,  hasHeavyTank: true  },
  { timeStart: 120, enemyCount: 6, hasBounceBarrel: true,  hasHeavyTank: true  },
  { timeStart: 150, enemyCount: 8, hasBounceBarrel: true,  hasHeavyTank: true  },
];

export interface SiegeState {
  phase: SiegePhase;
  map: TileGrid;
  player: TankEntity;
  enemies: TankEntity[];
  bullets: BulletEntity[];
  aiContexts: Map<string, AIContext>;
  inventory: Inventory;
  elapsedTime: number;          // seconds
  wavesSpawned: number;         // 0-6
  enemiesKilled: number;
  commandCenterHp: number;
  playerCooldownRemaining: number; // ms
  pendingReward: BattleReward | null;
}

const COMMAND_CENTER_MAX_HP = 500;
const COMMAND_CENTER_GRID = { x: Math.floor(MAP_COLS / 2), y: Math.floor(MAP_ROWS / 2) };
const ENEMY_MAX = 12;

export function createSiegeState(playerConfig: TankConfig, inventory: Inventory): SiegeState {
  const map = createSiegeMap();
  const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);

  const player = createTank('player', centerPos, playerConfig, true);

  return {
    phase: 'intro',
    map,
    player,
    enemies: [],
    bullets: [],
    aiContexts: new Map(),
    inventory,
    elapsedTime: 0,
    wavesSpawned: 0,
    enemiesKilled: 0,
    commandCenterHp: COMMAND_CENTER_MAX_HP,
    playerCooldownRemaining: 0,
    pendingReward: null,
  };
}

// ============================================================
// Update tick
// ============================================================

export function updateSiege(
  state: SiegeState,
  input: Input,
  dt: number,
): void {
  if (state.phase === 'victory' || state.phase === 'defeat') return;

  // Intro countdown
  if (state.phase === 'intro') {
    if (input.isConfirmPressed() || input.isFirePressed()) {
      state.phase = 'playing';
    }
    return;
  }

  state.elapsedTime += dt;

  // Check time limit
  if (state.elapsedTime >= MATCH_DURATION) {
    endSiege(state, true);
    return;
  }

  // Spawn waves
  spawnWaves(state);

  // Player movement
  handlePlayerInput(state, input, dt);

  // Player firing
  handlePlayerFire(state, input, dt);

  // Enemy AI
  handleEnemyAI(state, dt);

  // Move bullets
  handleBullets(state, dt);

  // Check bullet-tank collisions
  handleBulletTankCollisions(state, dt);

  // Check enemies reaching command center (must run before HP check!)
  handleEnemyReachCenter(state);

  // Check command center destroyed
  if (state.commandCenterHp <= 0) {
    endSiege(state, false);
    return;
  }
}

// ============================================================
// Player
// ============================================================

function handlePlayerInput(state: SiegeState, input: Input, dt: number): void {
  if (!state.player.alive) {
    endSiege(state, false);
    return;
  }

  const moveDir = input.getMoveDir();
  moveTank(state.player, moveDir, dt, state.map);

  // Turret follows mouse cursor
  const toMouse = input.mousePos.sub(state.player.pos);
  if (toMouse.mag() > 1) {
    state.player.turretAngle = toMouse.angle();
  }
}

function handlePlayerFire(state: SiegeState, input: Input, _dt: number): void {
  state.playerCooldownRemaining -= _dt * 1000;

  // Left-click or Space to fire
  const wantFire = input.isMouseJustPressed() || input.isFirePressed();
  if (wantFire && state.playerCooldownRemaining <= 0 && state.player.alive) {
    const cfg = state.player.config;
    const cooldown = effectiveCooldown(cfg);
    state.playerCooldownRemaining = cooldown;

    const bullet = createBullet(
      state.player.pos,
      state.player.turretAngle,
      cfg.barrel.stats.bulletStyle ?? 'straight',
      cfg.barrel.stats.bulletSpeed ?? 400,
      cfg.barrel.stats.bulletDamage ?? 35,
      cfg.barrel.stats.bounces ?? 0,
      cfg.barrel.stats.pierces ?? 0,
      state.player.id,
      true,
    );
    state.bullets.push(bullet);

    // Lightweight recoil (opposite to turret)
    if (state.player.config.weightClass === 'light') {
      const recoilDir = Vec2.fromAngle(state.player.turretAngle + Math.PI, 1);
      state.player.vel = state.player.vel.add(recoilDir.scale(effectiveSpeed(state.player.config) * 0.5));
    }
  }
}

// ============================================================
// Enemies
// ============================================================

function spawnWaves(state: SiegeState): void {
  for (let i = state.wavesSpawned; i < TOTAL_WAVES; i++) {
    const wave = WAVES[i];
    if (state.elapsedTime >= wave.timeStart) {
      spawnWave(state, wave);
      state.wavesSpawned = i + 1;
    }
  }
}

function spawnWave(state: SiegeState, wave: WaveDef): void {
  const rand = new Random();
  const spawnEdges = [
    { x: Math.floor(MAP_COLS / 2), y: 1 },
    { x: Math.floor(MAP_COLS / 2), y: MAP_ROWS - 2 },
    { x: 1, y: Math.floor(MAP_ROWS / 2) },
    { x: MAP_COLS - 2, y: Math.floor(MAP_ROWS / 2) },
  ];

  const shuffledEdges = rand.shuffle([...spawnEdges]);

  // Build enemy config pool based on wave type
  const configs: TankConfig[] = [];

  // Basic config — always available
  const barrelStraight = MVP_BARRELS.find(p => p.id === 'barrel_straight')!;
  const turretLight = MVP_TURRETS.find(p => p.id === 'turret_light')!;
  const chassisStandard = MVP_CHASSIS.find(p => p.id === 'chassis_standard')!;
  configs.push(assembleTank(barrelStraight, turretLight, chassisStandard));

  // Bounce barrel variant
  if (wave.hasBounceBarrel) {
    const barrelBounce = MVP_BARRELS.find(p => p.id === 'barrel_bounce')!;
    configs.push(assembleTank(barrelBounce, turretLight, chassisStandard));
  }

  // Heavy tank variant
  if (wave.hasHeavyTank) {
    const turretHeavy = MVP_TURRETS.find(p => p.id === 'turret_heavy')!;
    const chassisInertia = MVP_CHASSIS.find(p => p.id === 'chassis_inertia')!;
    configs.push(assembleTank(barrelStraight, turretHeavy, chassisStandard));
    configs.push(assembleTank(barrelStraight, turretLight, chassisInertia));
  }

  for (let i = 0; i < wave.enemyCount && state.enemies.length < ENEMY_MAX; i++) {
    const edge = shuffledEdges[i % shuffledEdges.length];
    const spawnPos = gridToPixel(edge.x, edge.y);

    const config = configs[i % configs.length];

    const enemy = createTank(
      `enemy_${state.enemies.length}_${Date.now()}`,
      spawnPos,
      config,
      false,
    );
    state.enemies.push(enemy);

    const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);
    state.aiContexts.set(enemy.id, createAIContext(enemy, centerPos));
  }
}

function handleEnemyAI(state: SiegeState, dt: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;

    const ctx = state.aiContexts.get(enemy.id);
    if (!ctx) continue;

    const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);
    // AI can chase either the player or the command center
    const target = state.player.alive ? state.player.pos : centerPos;

    const moveDir = updateAI(ctx, target, state.map, dt);
    moveTank(enemy, moveDir, dt, state.map);

    // Turret follows target
    const toTarget = target.sub(enemy.pos);
    if (toTarget.mag() > 1) {
      enemy.turretAngle = toTarget.angle();
    }

    // Enemy fire logic
    if (ctx.fireCooldown <= 0 && moveDir.x === 0 && moveDir.y === 0) {
      // Enemy is aiming — fire toward target
      if (toTarget.mag() < 400) {
        const bullet = createBullet(
          enemy.pos,
          enemy.turretAngle,
          enemy.config.barrel.stats.bulletStyle ?? 'straight',
          enemy.config.barrel.stats.bulletSpeed ?? 350,
          enemy.config.barrel.stats.bulletDamage ?? 25,
          enemy.config.barrel.stats.bounces ?? 0,
          enemy.config.barrel.stats.pierces ?? 0,
          enemy.id,
          false,
        );
        state.bullets.push(bullet);
        ctx.fireCooldown = 2000 + Math.random() * 1000; // Enemies fire slower
      }
    }
  }

  // Remove dead enemies
  state.enemies = state.enemies.filter(e => e.alive);
}

// ============================================================
// Bullets
// ============================================================

function handleBullets(state: SiegeState, dt: number): void {
  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;
    moveBullet(bullet, dt, state.map);
  }
  state.bullets = state.bullets.filter(b => b.alive);
}

function handleBulletTankCollisions(state: SiegeState, _dt: number): void {
  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    if (bullet.isPlayerBullet) {
      // Check against enemies
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (checkBulletTankHit(bullet, enemy)) {
          takeDamage(enemy, bullet.damage);
          bullet.alive = false;
          if (!enemy.alive) {
            state.enemiesKilled++;
          }
          break;
        }
      }
    } else {
      // Check against player
      if (state.player.alive && checkBulletTankHit(bullet, state.player)) {
        takeDamage(state.player, bullet.damage);
        bullet.alive = false;
        if (!state.player.alive) {
          endSiege(state, false);
          return;
        }
      }
    }
  }
}

// ============================================================
// Command Center
// ============================================================

function handleEnemyReachCenter(state: SiegeState): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);
    const dist = enemy.pos.dist(centerPos);
    if (dist < CELL_SIZE * 2) {
      // Enemy is at the command center — deal damage over time
      state.commandCenterHp -= 10;
      // Push enemy away (handle zero-distance edge case)
      if (dist > 0.01) {
        const away = enemy.pos.sub(centerPos).norm();
        enemy.pos = enemy.pos.add(away.scale(CELL_SIZE * 2));
      } else {
        // Enemy exactly at center — push in random direction
        enemy.pos = enemy.pos.add(new Vec2(CELL_SIZE * 2, 0));
      }
    }
  }
}

// ============================================================
// Victory / Defeat
// ============================================================

function endSiege(state: SiegeState, survived: boolean): void {
  if (state.pendingReward) return; // already ended

  state.phase = survived ? 'victory' : 'defeat';
  state.pendingReward = generateReward(
    state.wavesSpawned,
    TOTAL_WAVES,
    survived,
    state.inventory,
  );
}

