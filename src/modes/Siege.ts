import { Vec2 } from '../utils/Vector';
import { CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H, TileType, gridToPixel, pixelToGrid, inBounds } from '../utils/Grid';
import { TileGrid, createMap, pickRandomMap, getMapFriction, MapName } from '../entities/Map';
import { TankEntity, createTank, takeDamage, TANK_RADIUS, TURRET_ANGULAR_VEL, getBerserkerMultiplier } from '../entities/Tank';
import { BulletEntity, createBullet, BULLET_RADIUS, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, FIREWORK_MAX_LIFE } from '../entities/Bullet';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS } from '../entities/Parts';
import { moveTank, moveBullet, checkBulletTankHit, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions, normalizeAngle, bodyRef, elasticBounce } from '../core/Physics';
import { PhysicsBlock, createPhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { Input } from '../core/Input';
import { AIContext, createAIContext, updateAI, shouldFire } from '../ai/EnemyAI';
import { Random } from '../utils/Random';
import { BattleReward, generateReward } from '../systems/Reward';
import { Inventory } from '../systems/Inventory';
import { activateSkill, isBarrageActive, isSmokeActive, isSkillActive } from '../systems/Commander';
import { Particle, spawnParticles, spawnExplosion } from '../entities/Particle';
import { FireZone, createFireZone, updateFireZone } from '../entities/FireZone';
import { AllyTank, CloneEntity, TurretEntity, Plane, createAllyTank, createTurret, createPlanes, createClone } from '../entities/Ally';
import { DamageNumber, spawnDamageNumber } from '../entities/DamageNumber';
import { calcKillMultiplier } from '../systems/DamageMultiplier';
import { WaveModifier, pickWaveModifiers } from '../systems/WaveModifiers';
import { hasSynergy } from '../systems/Synergy';
import { applyTerrainEffects, isTankInGrass } from '../systems/MapFeatures';
import { playShoot, playHitTank, playHitWall, playExplosion, playRepair, playSprint, playBarrage, playSmoke } from '../systems/Sound';
import { playQuote } from '../systems/QuotePlayer';
import { updateBattle } from '../core/BattleEngine';
// Skill module imports + re-exports
import { updateMeteor } from '../skills/Trisolaran';
import { updateBivector } from '../skills/Bivector';
import { updateQuantum } from '../skills/Quantum';
import { updateLens } from '../skills/Lens';
import { updateRewind } from '../skills/Poincare';
import { updateBigBang } from '../skills/BigBang';
import { updateHolo } from '../skills/Holo';
import { updateTrojan, drawTrojanHorse } from '../skills/Trojan';
import { updateArk, drawArk, drawArkWater } from '../skills/Noah';
import { updateDamocles, drawDamoclesSwords } from '../skills/Damocles';
export { updateMeteor, updateBivector, updateQuantum, updateLens, updateRewind, updateBigBang, updateHolo, updateTrojan, drawTrojanHorse, updateArk, drawArk, drawArkWater, updateDamocles, drawDamoclesSwords };

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
  /** U-key debug: show enemy vision/fire radii */
  showDebug: boolean;
  frictionMul: number;
  fireZones: FireZone[];
  allies: AllyTank[];
  clones: CloneEntity[];
  turrets: TurretEntity[];
  planes: Plane[];
  damageNumbers: DamageNumber[];
  waveAnnouncement: string;
  waveAnnouncementTime: number;
  /** Combo kill display */
  comboTimer: number;
  comboText: string;
  comboColor: string;
  comboMultiplier: number;
  /** Kill streak counter */
  killStreak: number;
  killStreakTimer: number;
  /** Max multiplier achieved this match (for gold bonus) */
  maxMultiplier: number;
  /** Slow-motion timer (seconds remaining) */
  slowMoTimer: number;
  /** Active wave modifiers */
  activeModifiers: WaveModifier[];
  /** Gravity well position + timer */
  gravityPos: Vec2; gravityTimer: number;
  /** Time slow timer (enemy-only) */
  timeSlowTimer: number;
  /** Restore pulse timer */
  restoreTimer: number;
  /** Lightning chain branches + timer */
  lightningBranches: Vec2[][]; lightningTimer: number;
  meteorPhase: 'idle' | 'targeting' | 'incoming' | 'impact' | 'burning';
  meteorTimer: number; meteorTarget: Vec2; meteorPos: Vec2; meteorVel: number;
  meteorImpactTime: number; meteorFlashAlpha: number;
  bivectorPhase: 'idle' | 'compressing' | 'whiteout' | 'recovering';
  bivectorTimer: number; bivectorProgress: number;
  bivectorShear: number; bivectorScale: number; bivectorWhiteAlpha: number;
  bivectorDestroyed: boolean; bivectorText: string; bivectorTextColor: string;
  quantumPhase: 'idle' | 'superposing' | 'collapsed' | 'aftermath';
  quantumTimer: number; quantumRedAlpha: number; quantumBlueAlpha: number; quantumDestroyed: boolean;
  lensPhase: 'idle' | 'forming' | 'active' | 'collapsing';
  lensTimer: number; lensTarget: Vec2; lensStrength: number; lensRadius: number;
  rewindPhase: 'idle' | 'rewinding' | 'recovering';
  rewindTimer: number; rewindBlueAlpha: number; rewindReversed: boolean;
  bigbangPhase: 'idle' | 'imploding' | 'exploding' | 'aftermath';
  bigbangTimer: number; bigbangScale: number; bigbangWhiteAlpha: number;
  holoPhase: 'idle' | 'projecting' | 'rotating' | 'shattering' | 'aftermath';
  holoTimer: number; holoRotation: number; holoRadius: number; holoCracks: number;
  trojanPhase: 'idle' | 'entering' | 'opening' | 'deploying' | 'shattering';
  trojanTimer: number; trojanX: number; trojanDoor: number; trojanSpawned: number;
  arkPhase: 'idle' | 'raining' | 'peaking' | 'receding';
  arkTimer: number; arkWaterH: number;
  arkLightningBranches: Vec2[][]; arkLightningTimer: number;
  damoclesPhase: 'idle' | 'hovering' | 'dropping' | 'aftermath'; damoclesTimer: number;
}

const COMMAND_CENTER_MAX_HP = 500;
const COMMAND_CENTER_GRID = { x: Math.floor(MAP_COLS / 2), y: Math.floor(MAP_ROWS / 2) };
const ENEMY_MAX = 12;

export function createSiegeState(playerConfig: TankConfig, inventory: Inventory, forceMapName?: MapName): SiegeState {
  const mapName = forceMapName ?? pickRandomMap();
  const map = createMap(mapName);
  const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);

  // Convert all bricks and barrels to physics blocks (pre-spawn, not tile→block on collision)
  const initialBlocks: PhysicsBlock[] = [];
  for (let gy = 0; gy < MAP_ROWS; gy++) {
    for (let gx = 0; gx < MAP_COLS; gx++) {
      const tile = map[gy][gx];
      if ((tile.type === TileType.BRICK || tile.type === TileType.BARREL || tile.type === TileType.METAL) && tile.hp > 0) {
        const pos = new Vec2((gx + 0.5) * CELL_SIZE, (gy + 0.5) * CELL_SIZE);
        const block = createPhysicsBlock(pos, Vec2.zero(), tile.type, tile.hp);
        initialBlocks.push(block);
        map[gy][gx] = { type: TileType.EMPTY, hp: 0 };
      }
    }
  }

  // Random spawn near base in an empty cell
  const ccGx = Math.floor(MAP_COLS / 2), ccGy = Math.floor(MAP_ROWS / 2);
  let playerSpawn = centerPos;
  const offsets = [[0,3],[3,0],[0,-3],[-3,0],[2,2],[-2,2],[2,-2],[-2,-2]];
  for (const [dx, dy] of offsets) {
    const gx = ccGx + dx, gy = ccGy + dy;
    if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS && map[gy][gx].type === TileType.EMPTY) {
      playerSpawn = gridToPixel(gx, gy); break;
    }
  }
  const player = createTank('player', playerSpawn, playerConfig, true);
  player.hp = player.maxHp * 3; // player HP buff
  player.maxHp = player.hp;

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
    physicsBlocks: initialBlocks,
    showDebug: false,
    frictionMul: getMapFriction(mapName),
    fireZones: [],
    allies: [], clones: [],
    turrets: [],
    planes: [],
    damageNumbers: [],
    waveAnnouncement: '',
    waveAnnouncementTime: 0,
    comboTimer: 0,
    comboText: '',
    comboColor: '#fff',
    comboMultiplier: 1,
    killStreak: 0,
    killStreakTimer: 0,
    maxMultiplier: 1,
    slowMoTimer: 0,
    activeModifiers: [],
    gravityPos: new Vec2(0, 0), gravityTimer: 0,
    timeSlowTimer: 0,
    restoreTimer: 0,
    lightningBranches: [], lightningTimer: 0,
    meteorPhase: 'idle', meteorTimer: 0, meteorTarget: new Vec2(0,0), meteorPos: new Vec2(0,0), meteorVel: 0, meteorImpactTime: 0, meteorFlashAlpha: 0,
    bivectorPhase: 'idle', bivectorTimer: 0, bivectorProgress: 0, bivectorShear: 0, bivectorScale: 1, bivectorWhiteAlpha: 0, bivectorDestroyed: false, bivectorText: '', bivectorTextColor: '#000',
    quantumPhase: 'idle', quantumTimer: 0, quantumRedAlpha: 0, quantumBlueAlpha: 0, quantumDestroyed: false,
    lensPhase: 'idle', lensTimer: 0, lensTarget: new Vec2(0,0), lensStrength: 0, lensRadius: 0,
    rewindPhase: 'idle', rewindTimer: 0, rewindBlueAlpha: 0, rewindReversed: false,
    bigbangPhase: 'idle', bigbangTimer: 0, bigbangScale: 1, bigbangWhiteAlpha: 0,
    holoPhase: 'idle', holoTimer: 0, holoRotation: 0, holoRadius: 0, holoCracks: 0,
    trojanPhase: 'idle', trojanTimer: 0, trojanX: 0, trojanDoor: 0, trojanSpawned: 0,
    arkPhase: 'idle', arkTimer: 0, arkWaterH: 0, arkLightningBranches: [], arkLightningTimer: 0,
    damoclesPhase: 'idle', damoclesTimer: 0,
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
      // Consume fire input so first frame doesn't auto-shoot
      state.playerCooldownRemaining = 200;
    }
    return;
  }

  state.elapsedTime += dt;
  // U-key: toggle debug visualization
  if (input.wasJustPressed('KeyU')) {
    state.showDebug = !state.showDebug;
  }
  // O-key: spawn boss with WARNING
  if (input.wasJustPressed('KeyO')) {
    const bossConfig = assembleTank(
      MVP_BARRELS.find(p => p.id === 'barrel_gatling')!,
      MVP_TURRETS.find(p => p.id === 'turret_heavy')!,
      MVP_CHASSIS.find(p => p.id === 'chassis_heavy')!,
    );
    const spit = gridToPixel(Math.floor(MAP_COLS/2), 2);
    const boss = createTank(`boss_${Date.now()}`, spit, bossConfig, false);
    boss.hp = boss.maxHp * 2; boss.maxHp = boss.hp;
    state.enemies.push(boss);
    state.aiContexts.set(boss.id, createAIContext(boss, gridToPixel(Math.floor(MAP_COLS/2), Math.floor(MAP_ROWS/2)), 330, 150));
    state.waveAnnouncement = '⚠ WARNING! WARNING! ⚠';
    state.waveAnnouncementTime = 2.5;
  }
  // Check time limit
  if (state.elapsedTime >= MATCH_DURATION) { endSiege(state, true); return; }
  // Spawn waves
  spawnWaves(state);
  const noAliveEnemies = state.enemies.every(e => !e.alive);
  if (noAliveEnemies && state.wavesSpawned < TOTAL_WAVES && state.wavesSpawned > 0) {
    const nextWave = WAVES[state.wavesSpawned];
    if (nextWave && state.elapsedTime < nextWave.timeStart) state.elapsedTime = nextWave.timeStart;
  }

  // === Shared battle engine ===
  updateBattle(state as any, input, dt, {
    playerInput: handlePlayerInput, playerFire: handlePlayerFire,
    terrain: applyTerrainEffects, enemyAI: handleEnemyAI,
    allies: handleAllies, turrets: handleTurrets, planes: handlePlanes, clones: handleClones,
    physics: handlePhysicsBlocks, bullets: handleBullets, bulletTank: handleBulletTankCollisions,
    skills: [updateMeteor, updateBivector, updateQuantum, updateLens, updateRewind, updateBigBang, updateHolo, updateTrojan, updateArk, updateDamocles],
  });

  // === Siege-specific ===
  state.waveAnnouncementTime -= dt;
  state.comboTimer -= dt; state.killStreakTimer -= dt;
  if (state.killStreakTimer <= 0) state.killStreak = 0;

  // Command Center auto-attack
  handleCCAttack(state, dt);

  // Update fire zones
  handleFireZones(state, dt);

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

  // Time slow compensation: boost player velocity to counteract global slowdown
  if (state.timeSlowTimer > 0) {
    state.player.vel = state.player.vel.scale(3.3); // compensate for 0.3x timeScale
  }

  // Sprint chassis: speed ramps up while moving
  if (state.player.config.chassis.id === 'chassis_sprint') {
    if (moveDir.x !== 0 || moveDir.y !== 0) {
      (state.player as any).sprintT ??= 0;
      (state.player as any).sprintT += dt;
      const sprintMul = 1 + Math.min(0.5, (state.player as any).sprintT * 0.5);
      (state.player as any).sprintMul = sprintMul;
    } else {
      (state.player as any).sprintT = 0;
      (state.player as any).sprintMul = 1.0;
    }
  }
  moveTank(state.player, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks);

  // Turret follows mouse cursor with angular velocity limit
  const toMouse = input.mousePos.sub(state.player.pos);
  if (toMouse.mag() > 1) {
    const targetAngle = toMouse.angle();
    const diff = normalizeAngle(targetAngle - state.player.turretAngle);
    const maxStep = TURRET_ANGULAR_VEL * dt;
    if (Math.abs(diff) < maxStep) {
      state.player.turretAngle = targetAngle;
    } else {
      state.player.turretAngle += Math.sign(diff) * maxStep;
      state.player.turretAngle = normalizeAngle(state.player.turretAngle);
    }
  }

  // Sprint trail particles
  if (isSkillActive(state.player) && state.player.config.commander.id === 'commander_sprint' && input.isMoving()) {
    state.particles.push(...spawnParticles(state.player.pos, 'sprint', 2, 50));
  }

  // Smoke cloud particles (large, persistent, follows tank)
  if (isSmokeActive(state.player)) {
    state.particles.push(...spawnParticles(state.player.pos, 'smoke', 3, 15));
  }

  // Blink chassis: Shift to teleport toward mouse
  if (state.player.config.chassis.id === 'chassis_blink' && input.wasJustPressed('ShiftLeft')) {
    const dir = input.mousePos.sub(state.player.pos).norm();
    state.player.pos = state.player.pos.add(dir.scale(CELL_SIZE * 3));
    state.player.invulnUntil = performance.now() + 300;
  }

  // Repair armor: out-of-combat regen
  if (state.player.config.turret.id === 'turret_repair') {
    const now = performance.now();
    if (!state.player.lastHitAt) state.player.lastHitAt = 0;
    if (now - state.player.lastHitAt > 3000 && state.player.hp < state.player.maxHp) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + dt * 5);
    }
  }

  // Commander skill: E key
  if (input.wasJustPressed('KeyE')) {
    handleSkillActivation(state, input);
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
    const berserkerMul = getBerserkerMultiplier(state.player);
    const bulletDamage = (cfg.barrel.stats.bulletDamage ?? 35) * 2 * berserkerMul; // player buff + berserker
    const bounces = cfg.barrel.stats.bounces ?? 0;
    const pierces = cfg.barrel.stats.pierces ?? 0;

    // Scatter: fire 3 bullets in a 15° fan
    if (bulletStyle === 'scatter') {
      for (let j = -1; j <= 1; j++) {
        const angle = state.player.turretAngle + j * (Math.PI / 12); // 15° spread
        const bullet = createBullet(state.player.pos, angle, 'straight', bulletSpeed, bulletDamage, 2, 0, state.player.id, true);
        state.bullets.push(bullet);
      }
    } else if (bulletStyle === 'rocket') {
      const bullet = createBullet(
        state.player.pos, state.player.turretAngle,
        'rocket', bulletSpeed, bulletDamage, 0, 0,
        state.player.id, true,
      );
      bullet.targetPos = input.mousePos;
      state.bullets.push(bullet);
    } else if (bulletStyle === 'orbital') {
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
      spawnWave(state, wave, i === TOTAL_WAVES - 1);
      state.wavesSpawned = i + 1;
      // Pick wave modifiers
      state.activeModifiers = pickWaveModifiers(i);
      const modText = state.activeModifiers.map(m => `${m.icon}${m.name}`).join(' ');
      const isFinal = i === TOTAL_WAVES - 1;
      state.waveAnnouncement = isFinal
        ? `⚠️ 最终波次 — BOSS来袭！ ${modText}`
        : `第 ${i + 1} 波  ${modText}`;
      state.waveAnnouncementTime = isFinal ? 3.0 : 2.0;
      // Apply armored: extra HP
      if (state.activeModifiers.some(m => m.id === 'armored')) {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const bonus = Math.round(e.maxHp * 0.5);
          e.hp += bonus;
          e.maxHp += bonus;
        }
      }
    }
  }
}

function spawnWave(state: SiegeState, wave: WaveDef, isFinal: boolean = false): void {
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

    // Boss = first enemy of the last wave
    const isBoss = isFinal && i === 0;
    const enemyConfig = isBoss
      ? assembleTank(MVP_BARRELS.find(p => p.id === 'barrel_gatling')!, MVP_TURRETS.find(p => p.id === 'turret_heavy')!, MVP_CHASSIS.find(p => p.id === 'chassis_heavy')!)
      : config;
    const enemy = createTank(
      `enemy_${state.enemies.length}_${Date.now()}`,
      spawnPos,
      enemyConfig,
      false,
    );
    if (isBoss) {
      enemy.hp = enemy.maxHp * 3;
      enemy.maxHp = enemy.hp;
      console.log('BOSS SPAWNED!', enemy.id, enemy.hp);
    }
    state.enemies.push(enemy);

    const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);
    state.aiContexts.set(enemy.id, createAIContext(enemy, centerPos, 330, 150));
  }
}

export function handleEnemyAI(state: SiegeState, dt: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;

    const ctx = state.aiContexts.get(enemy.id);
    if (!ctx) continue;

    const centerPos = gridToPixel(COMMAND_CENTER_GRID.x, COMMAND_CENTER_GRID.y);
    // Target priority: ally/turret > clone > player > command center
    const playerHidden = isSmokeActive(state.player) || isTankInGrass(state.player, state.map);
    const vRadius = ctx.visionRadius || 220;
    const nearestAlly = state.allies.find(a => a.alive && enemy.pos.dist(a.pos) <= vRadius);
    const nearestTurret = state.turrets.find(t => t.alive && enemy.pos.dist(t.pos) <= vRadius);
    const nearestClone = state.clones.find(c => c.alive && enemy.pos.dist(c.pos) <= vRadius);
    const playerInVision = state.player.alive && !playerHidden && enemy.pos.dist(state.player.pos) <= vRadius;
    let target: Vec2;
    if (nearestAlly) target = nearestAlly.pos;
    else if (nearestTurret) target = nearestTurret.pos;
    else if (nearestClone) target = nearestClone.pos;
    else if (playerInVision) target = state.player.pos;
    else target = centerPos;

    // Enemy speed: 55% base, ×1.4 if overclocked, ×0.3 if time-slowed
    let speedMul = state.activeModifiers.some(m => m.id === 'overclocked') ? 0.75 : 0.55;
    if (state.timeSlowTimer > 0) speedMul *= 0.3;
    const moveDir = updateAI(ctx, target, state.map, dt);
    moveTank(enemy, moveDir, dt, state.map, state.physicsBlocks, state.physicsBlocks);
    const maxEnemySpeed = effectiveSpeed(enemy.config) * speedMul;
    if (enemy.vel.mag() > maxEnemySpeed) {
      enemy.vel = enemy.vel.norm().scale(maxEnemySpeed);
    }

    // Turret follows target with gradual rotation (same as player)
    const toTarget = target.sub(enemy.pos);
    if (toTarget.mag() > 1) {
      const targetAngle = toTarget.angle();
      const diff = normalizeAngle(targetAngle - enemy.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      if (Math.abs(diff) < maxStep) {
        enemy.turretAngle = targetAngle;
      } else {
        enemy.turretAngle += Math.sign(diff) * maxStep;
        enemy.turretAngle = normalizeAngle(enemy.turretAngle);
      }
    }

    // Enemy fire logic (AI state machine driven)
    if (shouldFire(ctx, target)) {
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
      ctx.fireCooldown = enemy.config.barrel.stats.cooldownMs ?? 2000;
    }
  }

  // Don't filter dead enemies — wizard needs them for resurrect
}

// ============================================================
// Rocket + Fire zones
// ============================================================

function explodeRocket(bullet: BulletEntity, state: SiegeState): void {
  bullet.alive = false;
  state.particles.push(...spawnExplosion(bullet.pos));
  playExplosion();
  state.screenShake = 6;
  const zone = createFireZone(bullet.pos, 50, 5, 25);
  state.fireZones.push(zone);
  // 亡灵火箭 synergy: killed enemies auto-resurrect
  const undead = hasSynergy(state.player.config, 'undead_rocket');
  // Damage tanks in blast radius
  for (const tank of [state.player, ...state.enemies]) {
    if (!tank.alive) continue;
    if (tank.pos.dist(bullet.pos) < zone.radius) {
      takeDamage(tank, bullet.isPlayerBullet ? 60 : 40);
      // 亡灵火箭: killed enemies become allies
      if (undead && !tank.alive && !tank.isPlayer) {
        const ally = createAllyTank(`undead_${Date.now()}_${Math.random()}`, tank.pos, tank.config, 'guard_player');
        state.allies.push(ally);
      }
    }
  }
}

function handleFireZones(state: SiegeState, dt: number): void {
  for (const zone of state.fireZones) {
    if (!zone.alive) continue;
    updateFireZone(zone, dt);
    // Spawn fire particles
    if (zone.lifetime > 0 && Math.random() < 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const r = zone.radius * Math.sqrt(Math.random());
      const px = zone.pos.x + Math.cos(angle) * r;
      const py = zone.pos.y + Math.sin(angle) * r;
      state.particles.push({
        pos: new Vec2(px, py), vel: new Vec2((Math.random()-0.5)*20, (Math.random()-0.5)*20 - 10),
        life: 0.5 + Math.random() * 0.5, maxLife: 1,
        color: ['#ff4400','#ff6600','#ffaa00','#ff2200'][Math.floor(Math.random()*4)],
        radius: 2 + Math.random() * 4, alive: true, smokeExpand: false, isCross: false,
      });
    }
    // Damage tanks inside
    for (const tank of [state.player, ...state.enemies]) {
      if (!tank.alive) continue;
      if (tank.pos.dist(zone.pos) < zone.radius) {
        tank.hp -= zone.dps * dt;
        if (tank.hp <= 0) {
          tank.alive = false;
          state.particles.push(...spawnExplosion(tank.pos));
        }
      }
    }
  }
  state.fireZones = state.fireZones.filter(z => z.alive);
}

// ============================================================
// Allies
// ============================================================

export function handleAllies(state: SiegeState, dt: number): void {
  for (const ally of state.allies) {
    if (!ally.alive) continue;
    ally.fireCooldown -= dt * 1000;

    const distToPlayer = ally.pos.dist(state.player.pos);
    const nearestEnemy = state.enemies.find(e => e.alive && e.pos.dist(ally.pos) < ally.visionRadius);

    // Aim turret at nearest enemy if visible (gradual rotation)
    if (nearestEnemy) {
      const targetAngle = nearestEnemy.pos.sub(ally.pos).angle();
      const diff = normalizeAngle(targetAngle - ally.turretAngle);
      const maxStep = TURRET_ANGULAR_VEL * dt;
      if (Math.abs(diff) < maxStep) ally.turretAngle = targetAngle;
      else ally.turretAngle += Math.sign(diff) * maxStep;
      ally.turretAngle = normalizeAngle(ally.turretAngle);
    }

    // Fire using ally's OWN config
    const fireAllyBullet = () => {
      if (ally.fireCooldown > 0 || !nearestEnemy) return;
      const cfg = ally.config;
      const style = cfg.barrel.stats.bulletStyle ?? 'straight';
      const speed = cfg.barrel.stats.bulletSpeed ?? 400;
      const dmg = cfg.barrel.stats.bulletDamage ?? 35;
      const bounces = cfg.barrel.stats.bounces ?? 0;
      const pierces = cfg.barrel.stats.pierces ?? 0;
      const cd = cfg.barrel.stats.cooldownMs ?? 800;
      if (style === 'orbital') {
        for (let idx = 0; idx < 2; idx++) {
          state.bullets.push(createBullet(ally.pos, ally.turretAngle, 'orbital', speed, dmg, 0, 0, ally.id, true, idx, 5));
        }
      } else {
        state.bullets.push(createBullet(ally.pos, ally.turretAngle, style, speed, dmg, bounces, pierces, ally.id, true));
      }
      ally.fireCooldown = cd;
    };

    if (ally.aiMode === 'guard_player') {
      // Wizard resurrect: follow player, attack enemies in vision
      if (distToPlayer > ally.followRadius) {
        ally.aiState = 'follow';
        const toPlayer = state.player.pos.sub(ally.pos).norm();
        moveTank(ally, toPlayer, dt, state.map, state.physicsBlocks, state.physicsBlocks);
      } else {
        ally.aiState = 'fire';
        ally.vel = Vec2.zero();
        if (nearestEnemy && nearestEnemy.pos.dist(ally.pos) < 100) {
          const away = ally.pos.sub(nearestEnemy.pos).norm();
          moveTank(ally, away, dt, state.map, state.physicsBlocks, state.physicsBlocks);
        }
      }
      fireAllyBullet();
    } else {
      // Ninja clone: follow player, attack enemies in vision
      if (nearestEnemy && nearestEnemy.pos.dist(ally.pos) < 100) {
        const away = ally.pos.sub(nearestEnemy.pos).norm();
        moveTank(ally, away, dt, state.map, state.physicsBlocks, state.physicsBlocks);
      } else if (distToPlayer > ally.followRadius) {
        const toPlayer = state.player.pos.sub(ally.pos).norm();
        moveTank(ally, toPlayer, dt, state.map, state.physicsBlocks, state.physicsBlocks);
      } else {
        ally.vel = Vec2.zero();
      }
      fireAllyBullet();
    }
  }
  state.allies = state.allies.filter(a => a.alive);
}

// ============================================================
// Turrets
// ============================================================

export function handleTurrets(state: SiegeState, dt: number): void {
  for (const turret of state.turrets) {
    if (!turret.alive) continue;
    turret.fireCooldown -= dt * 1000;

    const target = state.enemies.find(e => e.alive && e.pos.dist(turret.pos) < turret.fireRange);
    if (target) {
      turret.angle = target.pos.sub(turret.pos).angle();
      if (turret.fireCooldown <= 0) {
        const bullet = createBullet(turret.pos, turret.angle, 'straight', 450, 25, 0, 0, turret.id, true);
        state.bullets.push(bullet);
        turret.fireCooldown = 600;
      }
    }
  }
  state.turrets = state.turrets.filter(t => t.alive);
}

// ============================================================
// Planes
// ============================================================

export function handleClones(state: SiegeState, dt: number): void {
  const now = performance.now();
  const playerJustFired = state.playerCooldownRemaining > 0 && state.playerCooldownRemaining >= 400;
  for (const clone of state.clones) {
    if (!clone.alive) continue;
    if (now > clone.expireTime) { clone.alive = false; continue; }
    const angle = state.player.dir + clone.offsetAngle;
    const offset = Vec2.fromAngle(angle, TANK_RADIUS * 2 + 8);
    clone.pos = state.player.pos.add(offset);
    clone.dir = state.player.dir;
    clone.turretAngle = state.player.turretAngle;
    clone.cooldownRemaining -= dt * 1000;
    if (Math.random() < 0.6) {
      state.particles.push({ pos: new Vec2(clone.pos.x+(Math.random()-0.5)*10, clone.pos.y+(Math.random()-0.5)*10), vel: new Vec2(0, -5-Math.random()*10), life: 0.2+Math.random()*0.3, maxLife:0.5, color: ['#ffdd44','#ffcc00','#ffffff'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2.5, alive:true, smokeExpand:false, isCross:false });
    }
    if (playerJustFired && clone.cooldownRemaining <= 0) {
      const cfg = clone.config;
      state.bullets.push(createBullet(clone.pos, clone.turretAngle, cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400, (cfg.barrel.stats.bulletDamage ?? 35) * 2, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0, state.player.id, true));
      clone.cooldownRemaining = cfg.barrel.stats.cooldownMs ?? 800;
    }
  }
  state.clones = state.clones.filter(c => c.alive);
}

export function handlePlanes(state: SiegeState, dt: number): void {
  for (const plane of state.planes) {
    if (!plane.alive) continue;
    plane.x += plane.velX * dt;
    plane.y += plane.velY * dt;
    plane.bombCooldown -= dt;
    // Remove if far off-screen (planes start outside map, fly across)
    if (plane.x < -MAP_W * 2 || plane.x > MAP_W * 3 || plane.y < -MAP_H * 2 || plane.y > MAP_H * 3) {
      plane.alive = false; continue;
    }

    // Drop bomb
    // 精确打击 synergy: faster bomb rate
    const precisionStrike = hasSynergy(state.player.config, 'precision_strike');
    const bombInterval = precisionStrike ? 0.6 : 1.2;

    if (plane.bombCooldown <= 0 && plane.x > 10 && plane.x < MAP_W - 10 && plane.y > 10 && plane.y < MAP_H - 10) {
      plane.bombCooldown = bombInterval;
      const bombPos = new Vec2(plane.x, plane.y);
      const zone = createFireZone(bombPos, 35, 3, 20);
      state.fireZones.push(zone);
      state.particles.push(...spawnExplosion(bombPos));
      playExplosion();
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (enemy.pos.dist(bombPos) < 40) {
          takeDamage(enemy, 30);
          if (!enemy.alive) onEnemyKilled(state, enemy, 1.0);
        }
      }
    }
  }
  state.planes = state.planes.filter(p => p.alive);
}

// ============================================================
// Kill chain rewards
// ============================================================

function onEnemyKilled(state: SiegeState, enemy: TankEntity, multiplier: number): void {
  state.enemiesKilled++;
  state.particles.push(...spawnExplosion(enemy.pos));
  playExplosion();
  // Explosive modifier: bigger boom + AoE damage
  if (state.activeModifiers.some(m => m.id === 'explosive')) {
    state.particles.push(...spawnParticles(enemy.pos, 'explosion', 10, 150));
    const zone = createFireZone(enemy.pos, 30, 1.5, 15);
    state.fireZones.push(zone);
    // Damage nearby enemies
    for (const other of state.enemies) {
      if (!other.alive || other.id === enemy.id) continue;
      if (other.pos.dist(enemy.pos) < 50) {
        takeDamage(other, 25);
      }
    }
  }
  state.screenShake = 4 + multiplier * 2;

  // Track max multiplier for gold bonus
  if (multiplier > state.maxMultiplier) {
    state.maxMultiplier = multiplier;
  }

  // Kill streak
  state.killStreak++;
  state.killStreakTimer = 2.0; // reset window

  // ×3.0+ : invincibility
  if (multiplier >= 3.0) {
    state.player.invulnUntil = performance.now() + 1500;
  }

  // ×5.0 : slow motion
  if (multiplier >= 5.0) {
    state.slowMoTimer = 1.0;
  }

  // Combo text
  let streakLabel = '';
  if (state.killStreak >= 5) streakLabel = 'MEGA KILL!';
  else if (state.killStreak >= 3) streakLabel = 'TRIPLE KILL!';
  else if (state.killStreak >= 2) streakLabel = 'DOUBLE KILL!';

  if (streakLabel) {
    state.comboText = state.comboText ? `${state.comboText} ${streakLabel}` : streakLabel;
    state.comboTimer = 2.5;
    state.comboColor = multiplier >= 5 ? '#ff4444' : multiplier >= 3 ? '#ffaa00' : '#ffcc44';
  }
}

// ============================================================
// Physics blocks
// ============================================================

function handlePhysicsBlocks(state: SiegeState, dt: number): void {
  // Update movement + friction
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    // Water + Command Center: check BEFORE moving (solid obstacles)
    const nextBg = pixelToGrid(block.pos.x + block.vel.x * dt, block.pos.y + block.vel.y * dt);
    if (nextBg && inBounds(nextBg.x, nextBg.y) && state.map[nextBg.y]?.[nextBg.x]?.type === TileType.WATER) {
      block.vel = Vec2.zero();
    }
    // Command center: blocks bounce off (like brick wall), tanks stop (handled in Physics)
    const ccX = Math.floor(MAP_COLS / 2) * CELL_SIZE + CELL_SIZE / 2;
    const ccY = Math.floor(MAP_ROWS / 2) * CELL_SIZE + CELL_SIZE / 2;
    const toCc = block.pos.sub(new Vec2(ccX, ccY));
    const ccDist = toCc.mag();
    if (ccDist < CELL_SIZE * 1.5 + BLOCK_RADIUS) {
      const n = ccDist > 0.01 ? toCc.norm() : new Vec2(1, 0);
      const vn = block.vel.dot(n);
      if (vn < 0) block.vel = block.vel.sub(n.scale(vn * 1.5)); // elastic reflection
      block.pos = block.pos.add(n.scale(CELL_SIZE * 1.5 + BLOCK_RADIUS - ccDist + 1));
    }
    const bg = pixelToGrid(block.pos.x, block.pos.y);
    const onIce = bg && inBounds(bg.x, bg.y) && state.map[bg.y]?.[bg.x]?.type === TileType.ICE;
    if (!onIce) updatePhysicsBlock(block, dt, state.frictionMul);
    block.pos = block.pos.add(block.vel.scale(dt));
    // Ice: lock direction, no deceleration
    if (onIce && block.vel.mag() > 5) {
      block.vel = Vec2.fromAngle(Math.atan2(block.vel.y, block.vel.x), block.vel.mag());
    }
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
  // Block damage: only if block is moving TOWARD the enemy (not enemy walking into block)
  const allTanks = [state.player, ...state.enemies, ...state.allies];
  for (const block of state.physicsBlocks) {
    if (!block.alive || block.vel.mag() < 25) continue;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      // Block must be approaching the enemy (not the other way around)
      const toEnemy = enemy.pos.sub(block.pos);
      const dist = toEnemy.mag();
      if (dist > TANK_RADIUS + BLOCK_RADIUS + 6) continue;
      // Check if block is moving toward enemy (relative velocity along block→enemy direction)
      const approach = block.vel.dot(toEnemy.norm());
      if (approach < 10) continue; // block not moving toward enemy → no damage

      if (dist < TANK_RADIUS + BLOCK_RADIUS + 6) {
        const ctx = calcKillMultiplier('block', 0, block.chainLength);
        const baseDmg = Math.round(block.vel.mag() * block.mass * 0.08);
        const dmg = takeDamage(enemy, Math.max(10, baseDmg * ctx.multiplier));
        state.damageNumbers.push(spawnDamageNumber(enemy.pos, dmg, ctx.multiplier >= 3));
        state.particles.push(...spawnParticles(enemy.pos, 'hit', 12, 120));
        if (ctx.multiplier >= 2) {
          state.comboText = ctx.label;
          state.comboColor = ctx.color;
          state.comboMultiplier = ctx.multiplier;
          state.comboTimer = 2.5;
        }
        if (!enemy.alive) {
          onEnemyKilled(state, enemy, ctx.multiplier);
        }
      }
    }
  }
  // Now resolve elastic collision
  resolveBlockTankCollisions(state.physicsBlocks, allTanks);
  // Block ↔ wall (last, after block-block resolved)
  resolveBlockWallCollisions(state.physicsBlocks, state.map, state.physicsBlocks);

  // Freeze stopped blocks, destroy hp-depleted blocks
  for (const block of state.physicsBlocks) {
    if (!block.alive) continue;
    // Destroy bullet-hit blocks whose HP is depleted (hp != -1 means tracked by bullet system)
    if (block.hp !== -1 && block.hp <= 0) block.alive = false;
    if (block.vel.mag() < 2) {
      block.vel = Vec2.zero();
    }
  }

  state.physicsBlocks = state.physicsBlocks.filter(b => b.alive);
}

// ============================================================
// Bullets
// ============================================================

export function handleBullets(state: SiegeState, dt: number, skipCC: boolean = false): void {
  const newBullets: BulletEntity[] = [];

  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    // Rocket: steer toward target
    if (bullet.style === 'rocket') {
      const toTarget = bullet.targetPos.sub(bullet.pos);
      if (toTarget.mag() < 10) {
        // Reached target — explode
        explodeRocket(bullet, state);
        continue;
      }
      // Steer toward target
      bullet.vel = toTarget.norm().scale(bullet.vel.mag());
    }

    // Check collision with physics blocks (only nearby blocks)
    let hitBlock = false;
    for (const block of state.physicsBlocks) {
      if (!block.alive) continue;
      if (block.vel.mag() < 0.5 && bullet.pos.dist(block.pos) > BLOCK_RADIUS * 2) continue; // far stationary block
      if (bullet.pos.dist(block.pos) < BLOCK_RADIUS + BULLET_RADIUS) {
        if (bullet.style === 'rocket' || block.tileType === TileType.BARREL) {
          // Rocket or barrel: explode
          if (block.tileType === TileType.BARREL) {
            block.alive = false;
            state.fireZones.push(createFireZone(block.pos, 55, 3, 25));
            state.particles.push(...spawnParticles(block.pos, 'explosion', 18, 150));
            playExplosion(); state.screenShake = 8;
            for (const enemy of state.enemies) {
              if (!enemy.alive) continue;
              if (enemy.pos.dist(block.pos) < 60) {
                takeDamage(enemy, 40);
                if (!enemy.alive) onEnemyKilled(state, enemy, 1);
              }
            }
          }
          if (bullet.style === 'rocket') explodeRocket(bullet, state);
          else bullet.alive = false;
        } else {
          // Knockback: bullet momentum to block (bounce if can, die if can't)
          const bulletBody = bodyRef(bullet.pos, bullet.vel);
          const blockBody = bodyRef(block.pos, block.vel);
          elasticBounce(bulletBody, bullet.mass, BULLET_RADIUS, blockBody, block.mass, BLOCK_RADIUS);
          block.pos = blockBody.pos; block.vel = blockBody.vel;
          bullet.pos = bulletBody.pos; bullet.vel = bulletBody.vel;
          // Subtract HP from block if it has HP
          if (block.hp > 0) block.hp -= bullet.damage;
          if (!bullet.isPlayerBullet && block.hp > 0 && block.hp <= 0) block.alive = false;
          state.particles.push(...spawnParticles(bullet.pos, 'impact', 6, 80));
          if (bullet.bouncesLeft > 0) {
            bullet.bouncesLeft--;
            bullet.bounceCount++;
            bullet.damage = Math.round(bullet.damage * 0.8);
          } else {
            bullet.alive = false;
          }
        }
        hitBlock = true;
        break;
      }
    }
    if (hitBlock) continue;

    // Command center collision: blocks all bullets, only enemy bullets deal damage
    if (!skipCC) {
      const ccX = Math.floor(MAP_COLS / 2) * CELL_SIZE + CELL_SIZE / 2;
      const ccY = Math.floor(MAP_ROWS / 2) * CELL_SIZE + CELL_SIZE / 2;
      if (bullet.ownerId !== 'cc' && Math.hypot(bullet.pos.x - ccX, bullet.pos.y - ccY) < CELL_SIZE * 1.5 + BULLET_RADIUS) {
        state.particles.push(...spawnParticles(bullet.pos, 'explosion', 8, 80));
        if (!bullet.isPlayerBullet) {
          state.commandCenterHp -= bullet.damage;
          playExplosion();
          state.screenShake = 3;
        }
        bullet.alive = false;
        continue;
      }
    }

    // Magnetic modifier: enemy bullets home toward player
    if (!bullet.isPlayerBullet && state.activeModifiers.some(m => m.id === 'magnetic')) {
      const toPlayer = state.player.pos.sub(bullet.pos);
      if (toPlayer.mag() > 1) {
        const desired = toPlayer.norm();
        bullet.vel = bullet.vel.add(desired.scale(30 * dt)).norm().scale(bullet.vel.mag());
      }
    }

    // Firework: timer for child spawns, auto-destruct
    if (bullet.style === 'firework') {
      if (bullet.fireworkLife === 0) bullet.fireworkLife = FIREWORK_MAX_LIFE;
      bullet.fireworkTimer -= dt;
      bullet.fireworkLife -= dt;
      if (bullet.fireworkLife <= 0) {
        bullet.alive = false; state.particles.push(...spawnExplosion(bullet.pos)); continue; }
      if (bullet.fireworkTimer <= 0) {
        // 烟花祭 synergy: double child spawn rate during barrage
        const fwRate = (hasSynergy(state.player.config, 'firework_fest') && isBarrageActive(state.player))
          ? FIREWORK_INTERVAL * 0.5 : FIREWORK_INTERVAL;
        bullet.fireworkTimer = fwRate;
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

    const result = moveBullet(bullet, dt, state.map, state.physicsBlocks);
    if (result.hitWall) {
      if (bullet.style === 'rocket') {
        explodeRocket(bullet, state);
      } else {
        // Barrel explosion
        const gx2 = result.hitTileX, gy2 = result.hitTileY;
        if (gx2 >= 0 && gy2 >= 0 && state.map[gy2]?.[gx2]?.type === TileType.BARREL) {
          state.map[gy2][gx2] = { type: TileType.EMPTY, hp: 0 };
          state.fireZones.push(createFireZone(bullet.pos, 55, 3, 25));
          state.particles.push(...spawnParticles(bullet.pos, 'explosion', 18, 150));
          playExplosion(); state.screenShake = 8;
          for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            if (enemy.pos.dist(bullet.pos) < 60) {
              takeDamage(enemy, 40);
              if (!enemy.alive) onEnemyKilled(state, enemy, 1);
            }
          }
        }
        state.particles.push(...spawnParticles(bullet.pos, 'impact', 10, 100));
        playHitWall();
      }
    }
  }

  state.bullets.push(...newBullets);

  // Filter: keep alive, and for firework children, limit lifetime
  state.bullets = state.bullets.filter(b => {
    if (!b.alive) return false;
    // Firework children die quickly
return true;
  });
}

export function handleBulletTankCollisions(state: SiegeState, _dt: number): void {
  for (const bullet of state.bullets) {
    if (!bullet.alive) continue;

    if (bullet.isPlayerBullet) {
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (checkBulletTankHit(bullet, enemy)) {
          const killCtx = bullet.style === 'rocket'
            ? calcKillMultiplier('bullet', 0, 0)
            : calcKillMultiplier('bullet', bullet.bounceCount, 0);

          if (bullet.style === 'rocket') {
            explodeRocket(bullet, state);
          } else {
            // Knockback: elastic momentum transfer from bullet to enemy
            const bulletBody = bodyRef(bullet.pos, bullet.vel);
            const enemyBody = bodyRef(enemy.pos, enemy.vel);
            elasticBounce(bulletBody, bullet.mass, BULLET_RADIUS, enemyBody, enemy.config.totalWeight, TANK_RADIUS);
            enemy.pos = enemyBody.pos; enemy.vel = enemyBody.vel;
            bullet.pos = bulletBody.pos; bullet.vel = bulletBody.vel;

            const dmg = takeDamage(enemy, bullet.damage * killCtx.multiplier);
            state.damageNumbers.push(spawnDamageNumber(enemy.pos, dmg, killCtx.multiplier >= 3));
            state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
            if (killCtx.multiplier > 1) {
              state.comboText = killCtx.label;
              state.comboColor = killCtx.color;
              state.comboMultiplier = killCtx.multiplier;
              state.comboTimer = 2.0;
            }
            playHitTank();
            bullet.alive = false;
          }
          if (!enemy.alive) {
            onEnemyKilled(state, enemy, killCtx.multiplier);
          }
          break;
        }
      }
    } else {
      // Enemy bullets: check allies + clones first (priority decoys)
      let hitFriendly = false;
      for (const ally of state.allies) {
        if (!ally.alive) continue;
        if (bullet.pos.dist(ally.pos) < TANK_RADIUS + BULLET_RADIUS) {
          takeDamage(ally, bullet.damage);
          state.particles.push(...spawnParticles(ally.pos, 'hit', 8, 80));
          state.damageNumbers.push(spawnDamageNumber(ally.pos, bullet.damage, false));
          playHitTank();
          bullet.alive = false; hitFriendly = true; break;
        }
      }
      if (!hitFriendly) {
        for (const clone of state.clones) {
          if (!clone.alive) continue;
          if (bullet.pos.dist(clone.pos) < TANK_RADIUS + BULLET_RADIUS) {
            clone.hp -= bullet.damage;
            if (clone.hp <= 0) clone.alive = false;
            state.particles.push(...spawnParticles(clone.pos, 'hit', 8, 80));
            state.damageNumbers.push(spawnDamageNumber(clone.pos, bullet.damage, false));
            bullet.alive = false; hitFriendly = true; break;
          }
        }
      }
      if (hitFriendly) continue;
      if (state.player.alive && checkBulletTankHit(bullet, state.player)) {
        if (bullet.style === 'rocket') {
          explodeRocket(bullet, state);
        } else {
          const dmg = takeDamage(state.player, bullet.damage);
          state.damageNumbers.push(spawnDamageNumber(state.player.pos, dmg, dmg >= 50));
          state.particles.push(...spawnParticles(bullet.pos, 'hit', 10, 100));
          playHitTank();
          bullet.alive = false;
        }
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

// ============================================================
// Command Center auto-attack
// ============================================================

const CC_ATTACK_RANGE = 200;
let ccFireCooldown = 0;

function handleCCAttack(state: SiegeState, dt: number): void {
  ccFireCooldown -= dt * 1000;
  if (ccFireCooldown > 0) return;

  const ccX = Math.floor(MAP_COLS / 2) * CELL_SIZE + CELL_SIZE / 2;
  const ccY = Math.floor(MAP_ROWS / 2) * CELL_SIZE + CELL_SIZE / 2;
  const ccPos = new Vec2(ccX, ccY);

  let nearestEnemy: TankEntity | null = null;
  let nearestDist = CC_ATTACK_RANGE;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = e.pos.dist(ccPos);
    if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
  }

  if (nearestEnemy) {
    const angle = nearestEnemy.pos.sub(ccPos).angle();
    const bullet = createBullet(ccPos, angle, 'straight', 450, 20, 0, 0, 'cc', true);
    state.bullets.push(bullet);
    ccFireCooldown = 800; // fire every 0.8s
  }
}

/** Shared skill handler — called from both Siege and Practice */
export function handleSkillActivation(state: SiegeState, input: Input): void {
  const result = activateSkill(state.player);
  state.skillMessage = result.message;
  state.skillMessageTime = 2000;
  if (!result.success) return;
  const id = state.player.config.commander.id;
  if (id === 'commander_repair') {
    state.particles.push(...spawnParticles(state.player.pos, 'repair', 10, 50)); playRepair();
  } else if (id === 'commander_sprint') {
    state.particles.push(...spawnParticles(state.player.pos, 'sprint', 6, 40)); playSprint();
  } else if (id === 'commander_barrage') {
    state.particles.push(...spawnParticles(state.player.pos, 'barrage', 6, 40)); playBarrage();
  } else if (id === 'commander_smoke') {
    state.particles.push(...spawnParticles(state.player.pos, 'smoke', 12, 30)); playSmoke();
  } else if (id === 'commander_colonel') {
    (state as any).planes.push(...createPlanes(state.player.pos, state.player.turretAngle, MAP_W, MAP_H));
    if (hasSynergy(state.player.config, 'precision_strike')) {
      (state as any).planes.push(...createPlanes(state.player.pos, state.player.turretAngle + Math.PI / 2, MAP_W, MAP_H));
      state.skillMessage = '精确打击! 双航线轰炸';
    }
  } else if (id === 'commander_engineer') {
    const turret = createTurret(state.player.pos);
    (state as any).turrets.push(turret);
  } else if (id === 'commander_wizard') {
    const deadEnemies = state.enemies.filter(e => !e.alive);
    if (deadEnemies.length > 0) {
      let count = 0;
      for (const dead of deadEnemies.slice(0, 3)) {
        const ally = createAllyTank(`ally_${Date.now()}_${count}`, dead.pos, dead.config, 'guard_player');
        const ctx = state.aiContexts.get(dead.id);
        if (ctx) { ally.followRadius = ctx.fireRadius; ally.visionRadius = ctx.visionRadius; }
        (state as any).allies.push(ally);
        count++;
      }
      state.skillMessage = `复活了${count}辆`;
    } else state.skillMessage = '没有可复活的敌军';
  } else if (id === 'commander_ninja') {
    const hasSyn = hasSynergy(state.player.config, 'shadow_clones');
    state.clones.push(createClone(state.player, Math.PI / 2, 10000));
    state.clones.push(createClone(state.player, -Math.PI / 2, 10000));
    if (hasSyn) { state.clones.push(createClone(state.player, 0, 10000)); state.clones.push(createClone(state.player, Math.PI, 10000)); }
    state.skillMessage = hasSyn ? '影分身之术·四重!' : '影分身之术!';
  } else if (id === 'commander_gravity') {
    state.gravityPos = input.mousePos; state.gravityTimer = 3;
  } else if (id === 'commander_time') {
    state.slowMoTimer = 3; state.timeSlowTimer = 3;
  } else if (id === 'commander_lightning') {
    const aliveEnemies = state.enemies.filter(e => e.alive); const branches: Vec2[][] = []; const hit: Set<string> = new Set();
    for (let b = 0; b < 5; b++) {
      let nearest: TankEntity | null = null; let nearestDist = 600;
      for (const e of aliveEnemies) { if (hit.has(e.id)) continue; const d = e.pos.dist(state.player.pos); if (d < nearestDist) { nearestDist = d; nearest = e; } }
      if (!nearest) break; hit.add(nearest.id);
      takeDamage(nearest, 100, state.player); state.damageNumbers.push(spawnDamageNumber(nearest.pos, 100, true)); state.particles.push(...spawnParticles(nearest.pos, 'hit', 8, 80));
      if (!nearest.alive) onEnemyKilled(state, nearest, 1);
      const dx = nearest.pos.x-state.player.pos.x, dy = nearest.pos.y-state.player.pos.y;
      branches.push([state.player.pos, new Vec2(state.player.pos.x+dx*0.5+dy*0.15, state.player.pos.y+dy*0.5-dx*0.15), nearest.pos]);
    }
    state.lightningBranches = branches; state.lightningTimer = 1.5;
    if (hasSynergy(state.player.config, 'shadow_clones')) { state.clones.push(createClone(state.player, 0, 10000)); state.clones.push(createClone(state.player, Math.PI, 10000)); state.skillMessage = '⚡影分身!'; }
  } else if (id === 'commander_restore') {
    let count = 0;
    for (let gy = 0; gy < MAP_ROWS; gy++) for (let gx = 0; gx < MAP_COLS; gx++) {
      const tile = state.map[gy][gx];
      if (tile.type === TileType.BRICK && tile.hp <= 0 && Math.hypot(gx*CELL_SIZE+CELL_SIZE/2-state.player.pos.x, gy*CELL_SIZE+CELL_SIZE/2-state.player.pos.y) < 150) { state.map[gy][gx] = { type: TileType.BRICK, hp: 500 }; count++; }
    }
    state.restoreTimer = 3; state.skillMessage = `恢复了${count}块砖墙`;
  } else if (id === 'commander_trisolaran') {
    state.meteorPhase = 'targeting'; state.meteorTimer = 2.0; state.meteorTarget = input.mousePos;
    state.meteorPos = new Vec2(-200, -200); state.meteorVel = 200; state.meteorFlashAlpha = 0;
    state.skillMessage = '☄️ 陨石锁定中…';
  } else if (id === 'commander_bivector') {
    state.bivectorPhase = 'compressing'; state.bivectorTimer = 12; state.bivectorProgress = 0;
    state.bivectorShear = 0; state.bivectorScale = 1; state.bivectorWhiteAlpha = 0;
    state.bivectorDestroyed = false; state.bivectorText = ''; state.bivectorTextColor = '#000';
    state.skillMessage = '📐 二向箔展开！';
  } else if (id === 'commander_quantum') {
    state.quantumPhase = 'superposing'; state.quantumTimer = 5;
    state.quantumRedAlpha = 0; state.quantumBlueAlpha = 0; state.quantumDestroyed = false;
    state.skillMessage = '🐱 叠加态展开！';
  } else if (id === 'commander_lens') {
    state.lensPhase = 'forming'; state.lensTimer = 2; state.lensTarget = input.mousePos;
    state.lensStrength = 0; state.lensRadius = 0;
    state.skillMessage = '🌀 引力透镜展开！';
  } else if (id === 'commander_poincare') {
    state.rewindPhase = 'rewinding'; state.rewindTimer = 5;
    state.rewindBlueAlpha = 0; state.rewindReversed = false;
    state.skillMessage = '⏪ 时间倒流！';
  } else if (id === 'commander_bigbang') {
    state.bigbangPhase = 'imploding'; state.bigbangTimer = 3;
    state.bigbangScale = 1; state.bigbangWhiteAlpha = 0;
    state.skillMessage = '💥 宇宙坍缩！';
  } else if (id === 'commander_holo') {
    state.holoPhase = 'projecting'; state.holoTimer = 3;
    state.holoRotation = 0; state.holoRadius = 0; state.holoCracks = 0;
    state.skillMessage = '🌐 全息投影！';
  } else if (id === 'commander_trojan') {
    state.trojanPhase = 'entering'; state.trojanTimer = 2;
    state.trojanX = -120; state.trojanDoor = 0; state.trojanSpawned = 0;
    state.skillMessage = '🏛️ 木马计！';
  } else if (id === 'commander_noah') {
    state.arkPhase = 'raining'; state.arkTimer = 9.5; state.arkWaterH = 0;
    state.arkLightningBranches = []; state.arkLightningTimer = 1;
    const nq = [['你和你的全家都要进入方舟，','因为在这世代中，我见你在我面前是义人。'],['再过七天，我要降雨在地上四十昼夜，','把我所造的各种活物，都从地上除灭。'],['水势比山高过十五肘，山岭都淹没了。','凡在地上有血肉的动物，就是飞鸟牲畜走兽','和爬在地上的昆虫，以及所有的人，都死了。'],['Noah was a righteous man,','blameless in his generation,','Noah walked with God.'],['我把虹放在云彩中，','这就可作我与地立约的记号了。'],['凡流人血的，他的血也必被人所流，','因为神造人，是照自己的形像造的。']];
    playQuote(nq[Math.floor(Math.random() * nq.length)]);
    state.skillMessage = '🌊 大洪水！';
  } else if (id === 'commander_damocles') {
    state.damoclesPhase = 'hovering'; state.damoclesTimer = 4.7;
    const dq = [['你看见我的幸运了吗？','这把利剑时时刻刻悬在我的头顶，','世人所见的王权荣华，不过是浮于表面的幻象。','身居高位者，永远活在随时坠落的恐惧之中。'],['终日活在死亡威胁下的人，','不可能拥有真正的幸福；','权力越大，头顶悬剑越锋利。'],['Damocles neither dared to look at the servants','nor touch the feast, and begged instantly to depart,','for he had no wish for such good fortune.','What clearer proof that constant fear destroys all happiness?']];
    playQuote(dq[Math.floor(Math.random() * dq.length)]);
    state.skillMessage = '⚔️ 达摩克利斯之剑！';
  }
}

// Enemy-CC collision handled by moveTank + bullet-CC in handleBullets

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
    state.maxMultiplier,
  );
}

