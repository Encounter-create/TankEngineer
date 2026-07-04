import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H, gridToPixel } from '../utils/Grid';
import { TileGrid, createMap, pickRandomMap, MapName } from '../entities/Map';
import { TankEntity, createTank, takeDamage } from '../entities/Tank';
import { BulletEntity, createBullet, BULLET_RADIUS, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, FIREWORK_MAX_LIFE } from '../entities/Bullet';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS } from '../entities/Parts';
import { moveTank, moveBullet, checkBulletTankHit, resolveTankCollisions, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions } from '../core/Physics';
import { PhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { Input } from '../core/Input';
import { AIContext, createAIContext, updateAI } from '../ai/EnemyAI';
import { Random } from '../utils/Random';
import { BattleReward, generateReward } from '../systems/Reward';
import { Inventory } from '../systems/Inventory';
import { activateSkill, isBarrageActive, isSmokeActive, isSkillActive } from '../systems/Commander';
import { Particle, spawnParticles, spawnExplosion, updateParticles } from '../entities/Particle';
import { playShoot, playHitTank, playHitWall, playExplosion, playRepair, playSprint, playBarrage, playSmoke } from '../systems/Sound';

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
  mapName: MapName;
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
  skillMessage: string;
  skillMessageTime: number; // ms remaining
  particles: Particle[];
  /** Screen shake intensity (pixels, decays over time) */
  screenShake: number;
  /** Pushed-out physics blocks (brick/metal sliding freely) */
  physicsBlocks: PhysicsBlock[];
}

const COMMAND_CENTER_MAX_HP = 500;
const COMMAND_CENTER_GRID = { x: Math.floor(MAP_COLS / 2), y: Math.floor(MAP_ROWS / 2) };
const ENEMY_MAX = 12;

export function createSiegeState(playerConfig: TankConfig, inventory: Inventory, forceMapName?: MapName): SiegeState {
  const mapName = forceMapName ?? pickRandomMap();
  const map = createMap(mapName);
  const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);

  const player = createTank('player', centerPos, playerConfig, true);

  return {
    phase: 'intro',
    map,
    mapName,
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
    skillMessage: '',
    skillMessageTime: 0,
    particles: [],
    screenShake: 0,
    physicsBlocks: [],
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

  // Paused — check for resume
  if (state.phase === 'paused') {
    return; // main.ts handles pause menu clicks
  }

  // Intro countdown
  if (state.phase === 'intro') {
    if (input.isConfirmPressed() || input.isFirePressed()) {
      state.phase = 'playing';
    }
    return;
  }

  state.elapsedTime += dt;
  // Decay screen shake
  state.screenShake = Math.max(0, state.screenShake - dt * 50);
  if (state.screenShake < 0.5) state.screenShake = 0;

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

  // Tank-tank collisions
  resolveTankCollisions([state.player, ...state.enemies]);

  // Process physics blocks
  handlePhysicsBlocks(state, dt);

  // Move bullets
  handleBullets(state, dt);

  // Check bullet-tank collisions
  handleBulletTankCollisions(state, dt);

  // Update particles
  updateParticles(state.particles, dt);
  state.particles = state.particles.filter(p => p.alive);

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
  moveTank(state.player, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks);

  // Turret follows mouse cursor
  const toMouse = input.mousePos.sub(state.player.pos);
  if (toMouse.mag() > 1) {
    state.player.turretAngle = toMouse.angle();
  }

  // Sprint trail particles
  if (isSkillActive(state.player) && state.player.config.commander.id === 'commander_sprint' && input.isMoving()) {
    state.particles.push(...spawnParticles(state.player.pos, 'sprint', 2, 50));
  }

  // Smoke cloud particles (large, persistent, follows tank)
  if (isSmokeActive(state.player)) {
    state.particles.push(...spawnParticles(state.player.pos, 'smoke', 3, 15));
  }

  // Commander skill: E key
  if (input.wasJustPressed('KeyE')) {
    const result = activateSkill(state.player);
    state.skillMessage = result.message;
    state.skillMessageTime = 2000;
    // Skill VFX
    if (result.success) {
      const id = state.player.config.commander.id;
      if (id === 'commander_repair') {
        state.particles.push(...spawnParticles(state.player.pos, 'repair', 10, 50));
        playRepair();
      } else if (id === 'commander_sprint') {
        state.particles.push(...spawnParticles(state.player.pos, 'sprint', 6, 40));
        playSprint();
      } else if (id === 'commander_barrage') {
        state.particles.push(...spawnParticles(state.player.pos, 'barrage', 6, 40));
        playBarrage();
      } else if (id === 'commander_smoke') {
        state.particles.push(...spawnParticles(state.player.pos, 'smoke', 12, 30));
        playSmoke();
      }
    }
  }
}

function handlePlayerFire(state: SiegeState, input: Input, _dt: number): void {
  const barrageActive = isBarrageActive(state.player);
  if (!barrageActive) {
    state.playerCooldownRemaining -= _dt * 1000;
  }

  // Left-click or Space to fire
  const wantFire = input.isMouseDown() || input.isFirePressed();
  const canFire = barrageActive || state.playerCooldownRemaining <= 0;
  if (wantFire && canFire && state.player.alive) {
    const cfg = state.player.config;
    const cooldown = barrageActive ? 50 : effectiveCooldown(cfg); // 50ms during barrage
    state.playerCooldownRemaining = cooldown;

    const bulletStyle = cfg.barrel.stats.bulletStyle ?? 'straight';
    const bulletSpeed = cfg.barrel.stats.bulletSpeed ?? 400;
    const bulletDamage = cfg.barrel.stats.bulletDamage ?? 35;
    const bounces = cfg.barrel.stats.bounces ?? 0;
    const pierces = cfg.barrel.stats.pierces ?? 0;

    if (bulletStyle === 'orbital') {
      // Create pair of orbiting bullets
      for (let idx = 0; idx < 2; idx++) {
        const bullet = createBullet(
          state.player.pos, state.player.turretAngle,
          'orbital', bulletSpeed, bulletDamage, 0, 0,
          state.player.id, true, idx, 5,
        );
        state.bullets.push(bullet);
      }
    } else {
      const bullet = createBullet(
        state.player.pos, state.player.turretAngle,
        bulletStyle, bulletSpeed, bulletDamage, bounces, pierces,
        state.player.id, true,
      );
      state.bullets.push(bullet);
    }

    // Muzzle flash particles + sound
    const muzzlePos = state.player.pos.add(Vec2.fromAngle(state.player.turretAngle, 14));
    if (barrageActive) {
      state.particles.push(...spawnParticles(muzzlePos, 'barrage', 3, 50));
      playBarrage();
    } else {
      state.particles.push(...spawnParticles(muzzlePos, 'impact', 2, 40));
      playShoot();
    }

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
    const chassisHeavy = MVP_CHASSIS.find(p => p.id === 'chassis_heavy')!;
    const turretReactive = MVP_TURRETS.find(p => p.id === 'turret_reactive')!;
    const barrelPierce = MVP_BARRELS.find(p => p.id === 'barrel_pierce')!;
    const barrelArc = MVP_BARRELS.find(p => p.id === 'barrel_arc')!;
    const barrelSniper = MVP_BARRELS.find(p => p.id === 'barrel_sniper')!;
    configs.push(assembleTank(barrelStraight, turretHeavy, chassisStandard));
    configs.push(assembleTank(barrelStraight, turretLight, chassisInertia));
    configs.push(assembleTank(barrelPierce, turretLight, chassisHeavy));
    configs.push(assembleTank(barrelArc, turretReactive, chassisStandard));
    configs.push(assembleTank(barrelSniper, turretLight, chassisStandard));
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
    // Smoke: if player has smoke active, enemies can't see player → target CC instead
    const playerVisible = !isSmokeActive(state.player);
    const target = (state.player.alive && playerVisible) ? state.player.pos : centerPos;

    const moveDir = updateAI(ctx, target, state.map, dt);
    moveTank(enemy, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks);

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
// Physics blocks
// ============================================================

function handlePhysicsBlocks(state: SiegeState, dt: number): void {
  // Update movement + friction
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    updatePhysicsBlock(block, dt);
    block.pos = block.pos.add(block.vel.scale(dt));
    // Clamp to map
    const r = block.radius;
    block.pos = new Vec2(
      Math.max(r, Math.min(MAP_W - r, block.pos.x)),
      Math.max(r, Math.min(MAP_H - r, block.pos.y)),
    );
  }

  // Block collisions (block-block first, multi-pass to prevent wall interference)
  for (let pass = 0; pass < 3; pass++) {
    resolveBlockBlockCollisions(state.physicsBlocks);
  }
  // Block ↔ tank
  const allTanks = [state.player, ...state.enemies];
  resolveBlockTankCollisions(state.physicsBlocks, allTanks);
  // Block ↔ wall (last, after block-block resolved)
  resolveBlockWallCollisions(state.physicsBlocks, state.map);

  // Freeze stopped blocks at their exact position
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    if (block.vel.mag() < 2) {
      block.vel = Vec2.zero();
    }
  }

  state.physicsBlocks = state.physicsBlocks.filter(b => b.alive);
}

// ============================================================
// Bullets
// ============================================================

function handleBullets(state: SiegeState, dt: number): void {
  const newBullets: BulletEntity[] = [];

  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    // Check collision with physics blocks
    let hitBlock = false;
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      if (bullet.pos.dist(block.pos) < BLOCK_RADIUS + BULLET_RADIUS) {
        bullet.alive = false;
        state.particles.push(...spawnParticles(bullet.pos, 'impact', 6, 80));
        hitBlock = true;
        break;
      }
    }
    if (hitBlock) continue;

    // Firework: timer for child spawns, auto-destruct
    if (bullet.style === 'firework') {
      bullet.fireworkTimer -= dt;
      bullet.fireworkLife += dt;
      if (bullet.fireworkLife >= FIREWORK_MAX_LIFE) {
        // Final burst — 12 uniform directions
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 / 12) * i;
          const child = createBullet(
            bullet.pos, angle, 'straight', 120, 8, 0, 0,
            bullet.ownerId, bullet.isPlayerBullet,
          );
          child.fireworkLife = 999; // mark as short-lived child
          newBullets.push(child);
        }
        bullet.alive = false;
        state.particles.push(...spawnParticles(bullet.pos, 'explosion', 8, 60));
        continue;
      }
      if (bullet.fireworkTimer <= 0) {
        bullet.fireworkTimer = FIREWORK_INTERVAL;
        // Spawn 6 children uniformly at 60° intervals (geometric pattern)
        for (let i = 0; i < FIREWORK_CHILD_COUNT; i++) {
          const angle = (Math.PI * 2 / FIREWORK_CHILD_COUNT) * i;
          const child = createBullet(
            bullet.pos, angle, 'straight', 110, 7, 0, 0,
            bullet.ownerId, bullet.isPlayerBullet,
          );
          child.fireworkLife = 999;
          newBullets.push(child);
        }
        state.particles.push(...spawnParticles(bullet.pos, 'barrage', 3, 40));
      }
    }

    // Orbital: update rotation angle (faster for tight radius)
    if (bullet.style === 'orbital') {
      bullet.orbitalAngle += dt * 14; // fast rotation for visible binary-star effect
    }

    const result = moveBullet(bullet, dt, state.map);
    if (result.hitWall) {
      state.particles.push(...spawnParticles(bullet.pos, 'impact', 10, 100));
      playHitWall();
    }
  }

  state.bullets.push(...newBullets);

  // Filter: keep alive, and for firework children, limit lifetime
  state.bullets = state.bullets.filter(b => {
    if (!b.alive) return false;
    // Firework children die quickly
    if (b.fireworkLife >= 999) {
      b.fireworkLife += dt * 3; // use as decay timer
      if (b.fireworkLife >= 1000) return false;
    }
    return true;
  });
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
          state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
          playHitTank();
          bullet.alive = false;
          if (!enemy.alive) {
            state.enemiesKilled++;
            state.particles.push(...spawnExplosion(enemy.pos));
            playExplosion();
            state.screenShake = 8;
          }
          break;
        }
      }
    } else {
      // Check against player
      if (state.player.alive && checkBulletTankHit(bullet, state.player)) {
        takeDamage(state.player, bullet.damage);
        state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
        playHitTank();
        bullet.alive = false;
        if (!state.player.alive) {
          state.particles.push(...spawnExplosion(state.player.pos));
          playExplosion();
          state.screenShake = 12;
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

