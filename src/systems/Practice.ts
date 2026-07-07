// Practice mode — mini sandbox reusing real game systems
import { TankEntity, createTank, takeDamage, TANK_RADIUS, getBerserkerMultiplier } from '../entities/Tank';
import { TankConfig, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, DEFAULT_COMMANDER, effectiveCooldown } from '../entities/Parts';
import { BulletEntity, createBullet, FIREWORK_MAX_LIFE } from '../entities/Bullet';
import { FireZone, updateFireZone } from '../entities/FireZone';
import { Particle, spawnParticles, spawnExplosion, updateParticles } from '../entities/Particle';
import { updateDamageNumbers } from '../entities/DamageNumber';
import { TileGrid, createEmptyMap } from '../entities/Map';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS, gridToPixel } from '../utils/Grid';
import { moveTank, resolveBlockWallCollisions, resolveBlockTankCollisions, resolveBlockBlockCollisions, resolveTankCollisions } from '../core/Physics';
import { PhysicsBlock, createPhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { handleSkillActivation, handleAllies, handleTurrets, handlePlanes, handleBullets, handleBulletTankCollisions, handleEnemyAI, updateMeteor, updateBivector, updateQuantum, updateLens, updateRewind, updateBigBang, updateHolo, updateTrojan, updateArk, updateDamocles } from '../modes/Siege';
import { CloneEntity } from '../entities/Ally';
import { Input } from '../core/Input';
import { Vec2 } from '../utils/Vector';
import { drawTank, drawFireZone, drawDamageNumber, drawTurret, drawPlane } from '../ui/Renderer';
import { isSkillActive, isBarrageActive, isSmokeActive } from '../systems/Commander';
import { hasSynergy } from '../systems/Synergy';
import { AIContext, createAIContext } from '../ai/EnemyAI';

export interface PracticeState {
  player: TankEntity; enemy: TankEntity; movingEnemy: TankEntity;
  bullets: BulletEntity[]; blocks: PhysicsBlock[];
  fireZones: FireZone[]; particles: Particle[];
  map: TileGrid;
  arenaX: number; arenaY: number; arenaW: number; arenaH: number;
  skillMessage: string; skillMessageTime: number;
  // Entity arrays so Siege's skill handler works here too
  planes: any[]; turrets: any[]; allies: any[]; clones: CloneEntity[];
  gravityPos: Vec2; gravityTimer: number;
  slowMoTimer: number; timeSlowTimer: number;
  lightningBranches: Vec2[][]; lightningTimer: number;
  enemies: TankEntity[];
  // Skill effect state (mirrors SiegeState for shared handleSkillActivation)
  damageNumbers: any[]; restoreTimer: number;
  enemiesKilled: number; activeModifiers: any[];
  // SiegeState compatibility for shared handlers
  physicsBlocks: PhysicsBlock[];
  screenShake: number; killStreak: number; killStreakTimer: number;
  maxMultiplier: number; comboTimer: number; comboText: string; comboColor: string;
  commandCenterHp: number; comboMultiplier: number;
  showDebug: boolean;
  aiContexts: Map<string, AIContext>;
  // Meteor strike
  meteorPhase: string; meteorTimer: number; meteorTarget: Vec2; meteorPos: Vec2;
  meteorVel: number; meteorImpactTime: number; meteorFlashAlpha: number;
  bivectorPhase: string; bivectorTimer: number; bivectorProgress: number;
  bivectorShear: number; bivectorScale: number; bivectorWhiteAlpha: number; bivectorDestroyed: boolean;
  bivectorText: string; bivectorTextColor: string;
  quantumPhase: string; quantumTimer: number; quantumRedAlpha: number; quantumBlueAlpha: number;
  quantumDestroyed: boolean;
  lensPhase: string; lensTimer: number; lensTarget: Vec2; lensStrength: number; lensRadius: number;
  rewindPhase: string; rewindTimer: number; rewindBlueAlpha: number;
  bigbangPhase: string; bigbangTimer: number; bigbangScale: number; bigbangWhiteAlpha: number;
  holoPhase: string; holoTimer: number; holoRotation: number; holoRadius: number; holoCracks: number;
  trojanPhase: string; trojanTimer: number; trojanX: number; trojanDoor: number; trojanSpawned: number;
  arkPhase: string; arkTimer: number; arkWaterH: number;
  arkLightningBranches: any; arkLightningTimer: number;
  damoclesPhase: string; damoclesTimer: number;
  // Reset
  config: TankConfig; doReset: boolean;
}

function randomPick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function createPractice(config: TankConfig, ax: number, ay: number, aw: number, ah: number): PracticeState {
  const map = createEmptyMap();
  const blocks: PhysicsBlock[] = [];

  // Pre-spawn bricks (8 blocks, HP 500)
  const brickGy = Math.round((ay + ah * 0.6) / CELL_SIZE);
  for (let x = 3; x < 11; x++) {
    const gx = Math.round((ax + aw * 0.4) / CELL_SIZE) + (x - 3);
    if (gx >= 0 && gx < MAP_COLS && brickGy >= 0 && brickGy < MAP_ROWS) {
      const brickPos = new Vec2(gx * CELL_SIZE + CELL_SIZE / 2, brickGy * CELL_SIZE + CELL_SIZE / 2);
      blocks.push(createPhysicsBlock(brickPos, Vec2.zero(), TileType.BRICK, 500));
    }
  }

  // 1 grass tile (stealth)
  const grassGx = Math.round((ax + aw * 0.1) / CELL_SIZE);
  const grassGy = Math.round((ay + ah * 0.8) / CELL_SIZE);
  if (grassGx >= 0 && grassGx < MAP_COLS && grassGy >= 0 && grassGy < MAP_ROWS) {
    map[grassGy][grassGx] = { type: TileType.GRASS, hp: 0 };
  }

  // 1 barrel
  const barrelX = ax + aw * 0.5;
  const barrelY = ay + ah * 0.7;
  blocks.push(createPhysicsBlock(new Vec2(barrelX, barrelY), Vec2.zero(), TileType.BARREL, 30));

  // 3 metal blocks
  blocks.push(createPhysicsBlock(new Vec2(ax + aw * 0.3, ay + ah * 0.2), Vec2.zero(), TileType.METAL, 200));
  blocks.push(createPhysicsBlock(new Vec2(ax + aw * 0.5, ay + ah * 0.15), Vec2.zero(), TileType.METAL, 200));
  blocks.push(createPhysicsBlock(new Vec2(ax + aw * 0.7, ay + ah * 0.2), Vec2.zero(), TileType.METAL, 200));

  // Fixed target (static, invincible, shows damage numbers)
  const enemy = createTank('practice_fixed', new Vec2(ax + aw * 0.75, ay + ah * 0.35), config, false);
  enemy.isStatic = true;

  // Moving target (random config, AI-enabled)
  const movingCfg = assembleTank(
    randomPick(MVP_BARRELS), randomPick(MVP_TURRETS), randomPick(MVP_CHASSIS), DEFAULT_COMMANDER,
  );
  const movingEnemy = createTank('practice_moving', new Vec2(ax + aw * 0.6, ay + ah * 0.2), movingCfg, false);
  const aiContexts = new Map<string, AIContext>();
  const centerPos = gridToPixel(Math.floor(MAP_COLS / 2), Math.floor(MAP_ROWS / 2));
  aiContexts.set(movingEnemy.id, createAIContext(movingEnemy, centerPos, 330, 150));

  const player = createTank('practice_p', new Vec2(ax + aw * 0.2, ay + ah * 0.5), config, true);
  const enemies = [enemy, movingEnemy];

  return { player, enemy, movingEnemy, bullets: [], blocks, fireZones: [], particles: [], map,
    arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah, skillMessage: '', skillMessageTime: 0,
    planes: [], turrets: [], allies: [], clones: [], enemies,
    gravityPos: new Vec2(0,0), gravityTimer: 0,
    slowMoTimer: 0, timeSlowTimer: 0,
    lightningBranches: [], lightningTimer: 0,
    meteorPhase: 'idle', meteorTimer: 0, meteorTarget: new Vec2(0,0), meteorPos: new Vec2(0,0),
    meteorVel: 0, meteorImpactTime: 0, meteorFlashAlpha: 0,
    bivectorPhase: 'idle', bivectorTimer: 0, bivectorProgress: 0,
    bivectorShear: 0, bivectorScale: 1, bivectorWhiteAlpha: 0, bivectorDestroyed: false,
    bivectorText: '', bivectorTextColor: '#000',
    quantumPhase: 'idle', quantumTimer: 0, quantumRedAlpha: 0, quantumBlueAlpha: 0,
    quantumDestroyed: false,
    lensPhase: 'idle', lensTimer: 0, lensTarget: new Vec2(0,0), lensStrength: 0, lensRadius: 0,
    rewindPhase: 'idle', rewindTimer: 0, rewindBlueAlpha: 0,
    bigbangPhase: 'idle', bigbangTimer: 0, bigbangScale: 1, bigbangWhiteAlpha: 0,
    holoPhase: 'idle', holoTimer: 0, holoRotation: 0, holoRadius: 0, holoCracks: 0,
    trojanPhase: 'idle', trojanTimer: 0, trojanX: 0, trojanDoor: 0, trojanSpawned: 0,
    arkPhase: 'idle', arkTimer: 0, arkWaterH: 0,
    arkLightningBranches: [], arkLightningTimer: 0,
    damoclesPhase: 'idle', damoclesTimer: 0,
    damageNumbers: [], restoreTimer: 0,
    enemiesKilled: 0, activeModifiers: [],
    physicsBlocks: blocks,
    screenShake: 0, killStreak: 0, killStreakTimer: 0,
    maxMultiplier: 1, comboTimer: 0, comboText: '', comboColor: '#ffcc44',
    commandCenterHp: 100, comboMultiplier: 1,
    showDebug: false, aiContexts,
    config, doReset: false,
  };
}

export function updatePractice(ps: PracticeState, input: Input, dt: number): void {
  if (!ps.player.alive) { ps.player.alive = true; ps.player.hp = ps.player.maxHp; }

  // Rewind must run BEFORE physics
  updateRewind(ps as any, dt);
  updateBigBang(ps as any, dt);
  updateHolo(ps as any, dt);
  updateTrojan(ps as any, dt);
  updateArk(ps as any, dt);
  updateDamocles(ps as any, dt);

  const md = input.getMoveDir();
  moveTank(ps.player, md, dt, ps.map, ps.blocks, ps.blocks, true);
  ps.player.turretAngle = Math.atan2(input.mousePos.y - ps.player.pos.y, input.mousePos.x - ps.player.pos.x);

  // Firing (matches Siege handlePlayerFire)
  const barrageActive = isBarrageActive(ps.player);
  if (!barrageActive) {
    ps.player.cooldownRemaining -= dt * 1000;
  }
  const wantFire = input.isMouseDown() || input.isFirePressed();
  const canFire = barrageActive || ps.player.cooldownRemaining <= 0;
  if (wantFire && canFire && ps.player.alive) {
    const cfg = ps.player.config;
    const cooldown = barrageActive ? 50 : effectiveCooldown(cfg);
    ps.player.cooldownRemaining = cooldown;
    const bulletStyle = cfg.barrel.stats.bulletStyle ?? 'straight';
    const bulletSpeed = cfg.barrel.stats.bulletSpeed ?? 400;
    const berserkerMul = getBerserkerMultiplier(ps.player);
    const bulletDamage = (cfg.barrel.stats.bulletDamage ?? 35) * 2 * berserkerMul;
    const bounces = cfg.barrel.stats.bounces ?? 0;
    const pierces = cfg.barrel.stats.pierces ?? 0;

    // Scatter: fire 3 bullets in a 15° fan
    if (bulletStyle === 'scatter') {
      for (let j = -1; j <= 1; j++) {
        const angle = ps.player.turretAngle + j * (Math.PI / 12);
        ps.bullets.push(createBullet(ps.player.pos, angle, 'straight', bulletSpeed, bulletDamage, 2, 0, ps.player.id, true));
      }
    } else if (bulletStyle === 'rocket') {
      const bullet = createBullet(ps.player.pos, ps.player.turretAngle, 'rocket', bulletSpeed, bulletDamage, 0, 0, ps.player.id, true);
      bullet.targetPos = input.mousePos;
      ps.bullets.push(bullet);
    } else if (bulletStyle === 'orbital') {
      for (let idx = 0; idx < 2; idx++) {
        ps.bullets.push(createBullet(ps.player.pos, ps.player.turretAngle, 'orbital', bulletSpeed, bulletDamage, 0, 0, ps.player.id, true, idx, 5));
      }
    } else {
      const bullet = createBullet(ps.player.pos, ps.player.turretAngle, bulletStyle, bulletSpeed, bulletDamage, bounces, pierces, ps.player.id, true);
      if (bullet.style === 'firework') { bullet.fireworkLife = FIREWORK_MAX_LIFE; bullet.fireworkTimer = 0.25; }
      if (bullet.style === 'arc') { bullet.arcVy = -bulletSpeed * 0.5; }
      if (barrageActive) { ps.particles.push(...spawnParticles(ps.player.pos, 'barrage', 3, 50)); }
      ps.bullets.push(bullet);
    }
  }

  if (input.wasJustPressed('KeyE')) {
    handleSkillActivation(ps as any, input);
    // Practice mode: override to 1s cooldown for testing
    ps.player.skillCooldownUntil = performance.now() + 1000;
  }

  // Debug toggle + O-key boss spawn
  if (input.wasJustPressed('KeyU')) { ps.showDebug = !ps.showDebug; }
  if (input.wasJustPressed('KeyO')) {
    const bossConfig = assembleTank(
      MVP_BARRELS.find(p => p.id === 'barrel_gatling')!,
      MVP_TURRETS.find(p => p.id === 'turret_heavy')!,
      MVP_CHASSIS.find(p => p.id === 'chassis_heavy')!,
    );
    const spit = gridToPixel(Math.floor(MAP_COLS / 2), 2);
    const boss = createTank(`boss_${Date.now()}`, spit, bossConfig, false);
    boss.hp = boss.maxHp * 2; boss.maxHp = boss.hp;
    ps.enemies.push(boss);
    ps.aiContexts.set(boss.id, createAIContext(boss, gridToPixel(Math.floor(MAP_COLS/2), Math.floor(MAP_ROWS/2)), 330, 150));
  }

  // Enemy AI (skips static targets)
  handleEnemyAI(ps as any, dt);

  // Bullets + bullet-tank collisions — shared with Siege
  handleBullets(ps as any, dt, true);
  handleBulletTankCollisions(ps as any, dt);

  // Turret collision: push tanks out + block bounce
  for (const turret of ps.turrets) {
    if (!turret.alive) continue;
    const turretR = 14;
    for (const tank of [ps.player, ...ps.enemies, ...ps.allies]) {
      if (!tank.alive) continue;
      const diff = tank.pos.sub(turret.pos);
      if (diff.mag() < turretR + TANK_RADIUS) {
        tank.pos = tank.pos.add(diff.norm().scale(turretR + TANK_RADIUS - diff.mag() + 1));
      }
    }
    for (const block of ps.blocks) {
      if (!block.alive) continue;
      const diff = block.pos.sub(turret.pos);
      const dist = diff.mag();
      if (dist < turretR + BLOCK_RADIUS) {
        const n = dist > 0.01 ? diff.norm() : new Vec2(1, 0);
        block.pos = turret.pos.add(n.scale(turretR + BLOCK_RADIUS + 1));
        const vn = block.vel.dot(n);
        if (vn < 0) block.vel = block.vel.sub(n.scale(2 * vn)).scale(0.4);
      }
    }
  }

  // Tank-tank collisions
  const allCombatants = [ps.player, ...ps.enemies, ...ps.allies].filter(t => t.alive);
  resolveTankCollisions(allCombatants);

  // Fire zones
  for (const z of ps.fireZones) {
    updateFireZone(z, dt);
    for (const e of ps.enemies) {
      if (z.alive && e.alive && !e.isStatic && e.pos.dist(z.pos) < z.radius) e.hp -= z.dps * dt;
    }
  }
  ps.fireZones = ps.fireZones.filter((z: FireZone) => z.alive);

  for (const b of ps.blocks) {
    if (!b.alive) continue;
    updatePhysicsBlock(b, dt, 1);
    b.pos = b.pos.add(b.vel.scale(dt));
    const r = b.radius;
    b.pos = new Vec2(Math.max(ps.arenaX + r, Math.min(ps.arenaX + ps.arenaW - r, b.pos.x)), Math.max(ps.arenaY + r, Math.min(ps.arenaY + ps.arenaH - r, b.pos.y)));
    if (b.pos.x <= ps.arenaX + r || b.pos.x >= ps.arenaX + ps.arenaW - r) b.vel = new Vec2(-b.vel.x * 0.6, b.vel.y);
    if (b.pos.y <= ps.arenaY + r || b.pos.y >= ps.arenaY + ps.arenaH - r) b.vel = new Vec2(b.vel.x, -b.vel.y * 0.6);
  }
  resolveBlockWallCollisions(ps.blocks, ps.map, ps.blocks);
  resolveBlockTankCollisions(ps.blocks, [ps.player, ...ps.enemies, ...ps.allies]);
  resolveBlockBlockCollisions(ps.blocks);
  // Block-tank damage with proper kill effects (matches Siege handlePhysicsBlocks)
  for (const b of ps.blocks) {
    if (!b.alive || b.vel.mag() < 25) continue;
    for (const e of ps.enemies) {
      if (!e.alive || e.isStatic) continue;
      const toEnemy = e.pos.sub(b.pos);
      const dist = toEnemy.mag();
      if (dist < TANK_RADIUS + BLOCK_RADIUS + 6) {
        const vRel = b.vel.dot(toEnemy.norm());
        if (vRel > 0) {
          const dmg = Math.round(b.vel.mag() * b.mass * 0.06);
          takeDamage(e, dmg);
          ps.particles.push(...spawnParticles(e.pos, 'hit', 8, 80));
          if (!e.alive) {
            ps.particles.push(...spawnExplosion(e.pos));
            ps.enemiesKilled++;
            ps.screenShake = 4;
          }
        }
      }
    }
    if (b.vel.mag() < 2) b.vel = Vec2.zero();
  }
  // Particles
  updateParticles(ps.particles, dt);
  ps.particles = ps.particles.filter(p => p.alive);
  updateDamageNumbers(ps.damageNumbers, dt);
  ps.damageNumbers = ps.damageNumbers.filter((n: any) => n.alive);
  // Fire zone particles
  for (const z of ps.fireZones) {
    if (z.alive && Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const r = z.radius * Math.sqrt(Math.random());
      const isGreen = z.color === 'green';
      const colors = isGreen ? ['#22cc44','#44ee66','#88ff88'] : ['#ff4400','#ff6600','#ffaa00'];
      ps.particles.push({ pos: new Vec2(z.pos.x + Math.cos(a) * r, z.pos.y + Math.sin(a) * r), vel: new Vec2((Math.random()-0.5)*20, (Math.random()-0.5)*20 - 10), life: 0.5 + Math.random() * 0.5, maxLife: 1, color: colors[Math.floor(Math.random()*3)], radius: 2 + Math.random() * 3, alive: true, smokeExpand: false, isCross: false });
    }
  }

  // === Skill ongoing effects (mirrors Siege.ts update) ===

  // Meteor strike + Bivector
  updateMeteor(ps as any, dt);
  updateBivector(ps as any, dt);
  updateQuantum(ps as any, dt);
  updateLens(ps as any, dt);

  // Gravity well
  if (ps.gravityTimer > 0) {
    ps.gravityTimer -= dt;
    const gPos = ps.gravityPos;
    for (const e of ps.enemies) {
      if (!e.alive || e.isStatic) continue;
      const to = gPos.sub(e.pos);
      const d = to.mag();
      if (d > 20) e.vel = e.vel.add(to.norm().scale(200 * dt));
      if (d < 30) takeDamage(e, 10 * dt, ps.player);
    }
    for (const block of ps.blocks) {
      if (!block.alive) continue;
      block.vel = block.vel.add(gPos.sub(block.pos).norm().scale(300 * dt));
    }
    ps.particles.push(...spawnParticles(gPos, 'hit', 1, 30));
  }

  // Time slow: player compensation
  if (ps.timeSlowTimer > 0) {
    ps.player.vel = ps.player.vel.scale(3.3);
  }

  // Sprint trail + smoke particles
  if (isSkillActive(ps.player) && ps.player.config.commander.id === 'commander_sprint' && input.isMoving()) {
    ps.particles.push(...spawnParticles(ps.player.pos, 'sprint', 2, 50));
  }
  if (isSmokeActive(ps.player)) {
    ps.particles.push(...spawnParticles(ps.player.pos, 'smoke', 3, 15));
  }

  // Timer decrements
  if (ps.timeSlowTimer > 0) ps.timeSlowTimer -= dt;
  if (ps.restoreTimer > 0) ps.restoreTimer -= dt;
  if (ps.lightningTimer > 0) ps.lightningTimer -= dt;
  if (ps.slowMoTimer > 0) ps.slowMoTimer -= dt;
  if (ps.comboTimer > 0) ps.comboTimer -= dt;
  if (ps.killStreakTimer > 0) { ps.killStreakTimer -= dt; if (ps.killStreakTimer <= 0) ps.killStreak = 0; }

  // Entity update (planes, turrets, allies) — shared with Siege
  handleAllies(ps as any, dt);
  handleTurrets(ps as any, dt);
  handlePlanes(ps as any, dt);

  // Clones: mirror player + fire
  const now = performance.now();
  for (const clone of ps.clones) {
    if (!clone.alive) continue;
    if (now > clone.expireTime) { clone.alive = false; continue; }
    const angle = ps.player.dir + clone.offsetAngle;
    const offset = Vec2.fromAngle(angle, TANK_RADIUS * 2 + 8);
    clone.pos = ps.player.pos.add(offset);
    clone.dir = ps.player.dir;
    clone.turretAngle = ps.player.turretAngle;
    clone.cooldownRemaining -= dt * 1000;
    if (Math.random() < 0.6) {
      ps.particles.push({ pos: new Vec2(clone.pos.x+(Math.random()-0.5)*10, clone.pos.y+(Math.random()-0.5)*10), vel: new Vec2(0, -5-Math.random()*10), life: 0.2+Math.random()*0.3, maxLife:0.5, color: ['#ffdd44','#ffcc00','#ffffff'][Math.floor(Math.random()*3)], radius: 1.5+Math.random()*2.5, alive:true, smokeExpand:false, isCross:false });
    }
    if (wantFire && clone.cooldownRemaining <= 0) {
      const cfg = clone.config;
      ps.bullets.push(createBullet(clone.pos, clone.turretAngle,
        cfg.barrel.stats.bulletStyle ?? 'straight', cfg.barrel.stats.bulletSpeed ?? 400,
        (cfg.barrel.stats.bulletDamage ?? 35) * 2, cfg.barrel.stats.bounces ?? 0, cfg.barrel.stats.pierces ?? 0,
        ps.player.id, true));
      clone.cooldownRemaining = cfg.barrel.stats.cooldownMs ?? 800;
    }
  }
  ps.clones = ps.clones.filter(c => c.alive);

  ps.skillMessageTime -= dt * 1000;
  ps.player.pos = new Vec2(Math.max(ps.arenaX + TANK_RADIUS, Math.min(ps.arenaX + ps.arenaW - TANK_RADIUS, ps.player.pos.x)), Math.max(ps.arenaY + TANK_RADIUS, Math.min(ps.arenaY + ps.arenaH - TANK_RADIUS, ps.player.pos.y)));
}

export function renderPractice(ctx: CanvasRenderingContext2D, ps: PracticeState): void {
  const { arenaX: ax, arenaY: ay, arenaW: aw, arenaH: ah } = ps;
  ctx.fillStyle = '#1a1d15'; ctx.fillRect(ax, ay, aw, ah);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= Math.floor(aw / CELL_SIZE); gx++) { ctx.beginPath(); ctx.moveTo(ax + gx * CELL_SIZE, ay); ctx.lineTo(ax + gx * CELL_SIZE, ay + ah); ctx.stroke(); }
  for (let gy = 0; gy <= Math.floor(ah / CELL_SIZE); gy++) { ctx.beginPath(); ctx.moveTo(ax, ay + gy * CELL_SIZE); ctx.lineTo(ax + aw, ay + gy * CELL_SIZE); ctx.stroke(); }

  for (let gy = 0; gy < MAP_ROWS; gy++) for (let gx = 0; gx < MAP_COLS; gx++) {
    const t = ps.map[gy][gx]; if (t.type !== TileType.BRICK || t.hp <= 0) continue;
    const tx = gx * CELL_SIZE, ty = gy * CELL_SIZE;
    if (tx >= ax && tx <= ax + aw && ty >= ay && ty <= ay + ah) { ctx.fillStyle = '#8B7355'; ctx.strokeStyle = '#6B5335'; ctx.lineWidth = 1; ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2); ctx.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2); }
  }

  for (const b of ps.blocks) {
    if (!b.alive) continue;
    const s = b.radius;
    ctx.fillStyle = b.tileType === TileType.METAL ? '#666' : '#8B7355';
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(b.pos.x - s, b.pos.y - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
    // Debug: block HP bars
    if (ps.showDebug && b.hp > 0 && b.tileType === TileType.BRICK) {
      const barW = s * 2, barH = 3;
      const barX = b.pos.x - barW / 2, barY = b.pos.y - s - 8;
      const ratio = b.hp / 500;
      ctx.fillStyle = '#333'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ratio > 0.3 ? '#4ae0a0' : '#ff4444';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
  }

  // Grass terrain rendering
  for (let gy = 0; gy < MAP_ROWS; gy++) for (let gx = 0; gx < MAP_COLS; gx++) {
    const t = ps.map[gy][gx]; if (t.type !== TileType.GRASS) continue;
    const tx = gx * CELL_SIZE, ty = gy * CELL_SIZE;
    if (tx >= ax && tx <= ax + aw && ty >= ay && ty <= ay + ah) {
      ctx.fillStyle = '#3a5a2a88'; ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      ctx.strokeStyle = '#4a7a3a66'; ctx.lineWidth = 1;
      for (let wy = 2; wy < CELL_SIZE - 2; wy += 6) { ctx.beginPath(); ctx.moveTo(tx + 2, ty + wy); ctx.lineTo(tx + CELL_SIZE - 2, ty + wy); ctx.stroke(); }
    }
  }

  for (const p of ps.particles) { if (p.alive) { ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; } }
  for (const z of ps.fireZones) { drawFireZone(ctx, z); }
  for (const e of ps.enemies) {
    drawTank(ctx, e);
    // Debug: vision + fire range circles
    if (ps.showDebug && e.alive && !e.isStatic) {
      const aiCtx = ps.aiContexts.get(e.id);
      if (aiCtx) {
        ctx.strokeStyle = 'rgba(255,50,30,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, aiCtx.fireRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(74,180,255,0.6)';
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, aiCtx.visionRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  drawTank(ctx, ps.player);

  for (const b of ps.bullets) { if (b.alive) { ctx.fillStyle = '#ffcc44'; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2); ctx.fill(); } }
  for (const n of ps.damageNumbers) { drawDamageNumber(ctx, n); }

  // Turrets + range circles
  const hasFortress = hasSynergy(ps.player.config, 'mobile_fortress');
  for (const t of ps.turrets) {
    drawTurret(ctx, t);
    if (!t.alive) continue;
    // Heal range (always visible when synergy active)
    if (hasFortress) {
      ctx.strokeStyle = 'rgba(74,224,160,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.fireRange, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Debug: fire range
    if (ps.showDebug) {
      ctx.strokeStyle = 'rgba(255,80,50,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.fireRange, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // Planes
  for (const p of ps.planes) { drawPlane(ctx, p); }
  // Allies
  for (const a of ps.allies) {
    drawTank(ctx, a);
    if (ps.showDebug && a.alive) {
      ctx.strokeStyle = 'rgba(255,100,40,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, a.visionRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(74,224,160,0.5)';
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, a.followRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const c of ps.clones) { if (c.alive) { ctx.globalAlpha = 0.4; drawTank(ctx, c as any); ctx.globalAlpha = 1; } }

  // Lightning branches
  if (ps.lightningTimer > 0) {
    for (const branch of ps.lightningBranches) {
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(branch[0].x, branch[0].y);
      for (let i = 1; i < branch.length; i++) ctx.lineTo(branch[i].x, branch[i].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Gravity well visual
  if (ps.gravityTimer > 0) {
    const gPos = ps.gravityPos;
    const alpha = Math.min(1, ps.gravityTimer / 0.5);
    const rx = 40 * (1 + (3 - ps.gravityTimer) * 0.2);
    const ry = 25 * (1 + (3 - ps.gravityTimer) * 0.2);
    const grad = ctx.createRadialGradient(gPos.x, gPos.y, rx*0.3, gPos.x, gPos.y, rx);
    grad.addColorStop(0, `rgba(20,0,30,${0.85*alpha})`);
    grad.addColorStop(0.5, `rgba(60,0,100,${0.55*alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(gPos.x, gPos.y, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = `rgba(160,60,255,${0.6*alpha})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(gPos.x, gPos.y, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = performance.now()/1000 * 3 + i * Math.PI/4;
      const px = gPos.x + Math.cos(a) * rx * 0.85;
      const py = gPos.y + Math.sin(a) * ry * 0.85;
      ctx.fillStyle = `rgba(180,100,255,${0.7*alpha})`;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.fill();
    }
  }

  // Meteor visuals
  if (ps.meteorPhase === 'targeting' || ps.meteorPhase === 'incoming') {
    const mt = ps.meteorTarget;
    const flash = ps.meteorPhase === 'targeting' ? Math.abs(Math.sin(performance.now()/1000 * 8)) : 1;
    ctx.strokeStyle = `rgba(255,40,0,${0.3+0.5*flash})`; ctx.lineWidth = 3; ctx.setLineDash([10,6]);
    ctx.beginPath(); ctx.arc(mt.x, mt.y, 360, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    const cs = 360;
    ctx.strokeStyle = `rgba(255,255,255,${0.4+0.4*flash})`; ctx.lineWidth = 1.5;
    ctx.setLineDash([20,10]); ctx.beginPath(); ctx.moveTo(mt.x-cs, mt.y); ctx.lineTo(mt.x+cs, mt.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mt.x, mt.y-cs); ctx.lineTo(mt.x, mt.y+cs); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,30,30,${0.5+0.5*flash})`;
    ctx.font = `bold ${28+flash*8}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('世界属于三体！！！', ax + aw / 2, ay + ah / 2);
  }
  if (ps.meteorPhase === 'incoming') {
    const mp = ps.meteorPos;
    const glow = ctx.createRadialGradient(mp.x, mp.y, 15, mp.x, mp.y, 120);
    glow.addColorStop(0, 'rgba(255,200,50,0.9)'); glow.addColorStop(0.5, 'rgba(255,80,0,0.6)'); glow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mp.x, mp.y, 120, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(mp.x, mp.y, 36, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mp.x, mp.y, 15, 0, Math.PI*2); ctx.fill();
  }
  if (ps.meteorFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${ps.meteorFlashAlpha})`;
    ctx.fillRect(ax, ay, aw, ah);
  }

  // Time slow arrows
  if (ps.timeSlowTimer > 0 && ps.enemy.alive) {
    const arrowY = ps.enemy.pos.y - TANK_RADIUS - 22;
    ctx.fillStyle = '#4488ff'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
    const bounce = Math.sin(performance.now()/1000 * 8) * 4;
    ctx.fillText('↓↓', ps.enemy.pos.x, arrowY + bounce);
  }

  // Reset button (top-right)
  const rstX = ax + aw - 64, rstY = ay + 4;
  ctx.fillStyle = '#3a4a6a'; ctx.strokeStyle = '#6a8aff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(rstX, rstY, 58, 22, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🔄 重置', rstX + 29, rstY + 11);

  // Exit button (bottom)
  const exitX = ax + aw / 2 - 40, exitY = ay + ah - 32;
  ctx.fillStyle = '#6a3a3a'; ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(exitX, exitY, 80, 24, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⏹ 退出演习', exitX + 40, exitY + 12);

  // Enemy labels
  for (const e of ps.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    const label = e.isStatic ? '🎯 固定靶' : (e.id.startsWith('boss') ? '👑 BOSS' : '🏃 活动靶');
    ctx.fillText(label, e.pos.x, e.pos.y - 20);
  }
  // Respawn button (when moving target dead)
  if (!ps.movingEnemy.alive) {
    const rx = ax + aw / 2 - 50, ry = ay + ah / 2 + 20;
    ctx.fillStyle = '#3a6a3a'; ctx.strokeStyle = '#4ae0a0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(rx, ry, 100, 28, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔄 复活活动靶', rx + 50, ry + 14);
  }

  const hintText = ps.showDebug ? '🐛 调试模式 (U切换) | O召唤BOSS' : 'WASD 鼠标 左键 E技能 | O:boss U:调试';
  ctx.fillText(hintText, ax + aw / 2, ay + ah - 6);
  if (ps.skillMessageTime > 0) { ctx.fillStyle = '#4ae0a0'; ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(ps.skillMessage, ax + aw / 2, ay + ah / 2); }
}
