// Demo mode — AI vs AI for menu background. Two factions: random red vs Trojan blue.

import { Vec2 } from '../utils/Vector';
import { MAP_COLS, MAP_ROWS, MAP_W, MAP_H, TileType } from '../utils/Grid';
import { TileGrid } from '../entities/Map';
import { TankEntity, createTank, TURRET_ANGULAR_VEL } from '../entities/Tank';
import { assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, MVP_COMMANDERS } from '../entities/Parts';
import { BulletEntity, createBullet } from '../entities/Bullet';
import { PhysicsBlock } from '../entities/PhysicsBlock';
import { Particle } from '../entities/Particle';
import { AIContext, createAIContext, updateAI, shouldFire } from '../ai/EnemyAI';
import { updateTrojan, drawTrojanHorse } from '../skills/Trojan';
import { updateDamocles, drawDamoclesSwords } from '../skills/Damocles';
import { updateParticles } from '../entities/Particle';
import { normalizeAngle } from '../core/Physics';
import { drawTank } from '../ui/Renderer';
import { playQuote } from '../systems/QuotePlayer';

const MAX_RED = 5;
const SPAWN_INTERVAL = 6;
let demoId = 0;

function randomPart(parts: any[]) { return parts[Math.floor(Math.random() * parts.length)]; }
function basicCfg() { return assembleTank(MVP_BARRELS[0], randomPart(MVP_TURRETS), randomPart(MVP_CHASSIS), MVP_COMMANDERS[0]); }

function createDemoMap(): TileGrid {
  const m: TileGrid = [];
  for (let y = 0; y < MAP_ROWS; y++) { m[y] = []; for (let x = 0; x < MAP_COLS; x++) m[y][x] = { type: TileType.EMPTY, hp: 0 }; }
  return m;
}

export interface DemoState {
  map: TileGrid; bullets: BulletEntity[]; particles: Particle[];
  enemies: TankEntity[];       // RED: random spawns (max 5)
  allies: TankEntity[];         // BLUE: Trojan-spawned
  aiContexts: Map<string, AIContext>; // AIContexts for ALL tanks (both factions)
  elapsed: number; nextSpawn: number;
  trojanPhase: string; trojanTimer: number; trojanX: number; trojanDoor: number; trojanSpawned: number;
  damoclesPhase: string; damoclesTimer: number;
  physicsBlocks: PhysicsBlock[]; fireZones: any[]; turrets: any[]; planes: any[]; clones: any[];
  screenShake: number;
}

export function createDemoState(): DemoState {
  const map = createDemoMap();
  const enemies: TankEntity[] = []; const allies: TankEntity[] = [];
  const ai = new Map<string, AIContext>();
  // Initial 3 red
  for (let i = 0; i < 3; i++) {
    const e = createTank(`r${demoId++}`, new Vec2(MAP_W/2+60+Math.random()*(MAP_W/2-120), 60+Math.random()*(MAP_H-120)), basicCfg(), false);
    e.hp = e.maxHp * 1.5; e.maxHp = e.hp; enemies.push(e); ai.set(e.id, createAIContext(e, new Vec2(80, MAP_H/2), 200, 120));
  }
  return { map, bullets: [], particles: [], enemies, allies, aiContexts: ai,
    elapsed: 0, nextSpawn: SPAWN_INTERVAL,
    trojanPhase: 'idle', trojanTimer: 0, trojanX: -120, trojanDoor: 0, trojanSpawned: 0,
    damoclesPhase: 'idle', damoclesTimer: 0,
    physicsBlocks: [], fireZones: [], turrets: [], planes: [], clones: [], screenShake: 0 };
}

export function updateDemo(state: DemoState, dt: number): void {
  state.elapsed += dt;
  // Spawn red (non-Trojan), max 5
  if (state.elapsed >= state.nextSpawn && state.enemies.filter(e=>e.alive).length < MAX_RED) {
    state.nextSpawn = state.elapsed + SPAWN_INTERVAL;
    const e = createTank(`r${demoId++}`, new Vec2(MAP_W/2+60+Math.random()*(MAP_W/2-120), 60+Math.random()*(MAP_H-120)), basicCfg(), false);
    e.hp = e.maxHp * 1.5; e.maxHp = e.hp; state.enemies.push(e); state.aiContexts.set(e.id, createAIContext(e, new Vec2(80, MAP_H/2), 200, 120));
  }

  // Damocles: total tanks >= 6 → kill ALL (both factions) + quote
  const totalAlive = state.allies.filter(a=>a.alive).length + state.enemies.filter(e=>e.alive).length;
  if (totalAlive >= 8 && state.damoclesPhase === 'idle') {
    state.damoclesPhase = 'hovering'; state.damoclesTimer = 4.7;
    const dq = [['你看见我的幸运了吗？','这把利剑时时刻刻悬在我的头顶，','世人所见的王权荣华，不过是浮于表面的幻象。','身居高位者，永远活在随时坠落的恐惧之中。'],['终日活在死亡威胁下的人，','不可能拥有真正的幸福；','权力越大，头顶悬剑越锋利。']];
    playQuote(dq[Math.floor(Math.random() * dq.length)]);
  }

  // Auto Trojan every 20s, max 8 blue, first at t=0
  if (state.trojanPhase === 'idle' && state.allies.filter(a=>a.alive).length < 8) {
    const lastRelease = (state as any)._lastTrojan ?? -20;
    if (state.elapsed - lastRelease >= 20) {
      (state as any)._lastTrojan = state.elapsed;
      state.trojanPhase = 'entering'; state.trojanTimer = 2; state.trojanX = -120; state.trojanDoor = 0; state.trojanSpawned = 0;
    }
  }
  // Run Trojan/Damocles skill updates
  const snapshot = state.allies.length;
  const s = state as any;
  s.player = { pos: new Vec2(MAP_W/2, MAP_H/2), alive: true, config: { commander: { id: 'commander_trojan' } } };
  s.particles = state.particles; s.enemies = state.enemies; s.allies = state.allies;
  s.physicsBlocks = []; // disable Trojan collision (prevents lag)
  s.fireZones = state.fireZones; s.turrets = state.turrets; s.planes = state.planes; s.clones = state.clones;
  s.aiContexts = state.aiContexts; s.map = state.map;
  updateTrojan(s, dt);
  // Damocles kills both factions — merge allies into enemies temporarily for update
  const damoEnemies = [...s.enemies, ...s.allies.filter((a:any)=>a.alive)];
  const origEnemies = s.enemies;
  s.enemies = damoEnemies;
  updateDamocles(s, dt);
  s.enemies = origEnemies; // restore for AI targeting
  (s as any)._damoAll = damoEnemies; // for draw
  // Give new Trojan-spawned allies AIContexts
  for (let i = snapshot; i < state.allies.length; i++) {
    const a = state.allies[i];
    if (!state.aiContexts.has(a.id)) state.aiContexts.set(a.id, createAIContext(a as any, new Vec2(MAP_W-60, MAP_H/2), 200, 120));
  }

  // AI update — both factions use EnemyAI (same as Siege/TwoKings)
  for (const a of state.allies) {
    if (!a.alive) continue; const c = state.aiContexts.get(a.id); if (!c) continue;
    const tgt = state.enemies.find(e => e.alive && a.pos.dist(e.pos) < c.visionRadius)?.pos || new Vec2(MAP_W-80, MAP_H/2);
    const md = updateAI(c, tgt, state.map, dt);
    a.vel = md.scale(100 * 0.55); a.pos = a.pos.add(a.vel.scale(dt)); a.dir = md.mag() > 0 ? md.angle() : a.dir;
    a.pos = new Vec2(Math.max(20, Math.min(MAP_W-20, a.pos.x)), Math.max(20, Math.min(MAP_H-20, a.pos.y)));
    const toT = tgt.sub(a.pos); if (toT.mag() > 1) { const ta = toT.angle(); const d = normalizeAngle(ta - a.turretAngle); const ms = TURRET_ANGULAR_VEL * dt; a.turretAngle = Math.abs(d) < ms ? ta : normalizeAngle(a.turretAngle + Math.sign(d) * ms); }
    if (shouldFire(c, tgt)) { const st = a.config.barrel.stats; state.bullets.push(createBullet(a.pos, a.turretAngle, st.bulletStyle??'straight', st.bulletSpeed??400, st.bulletDamage??25, 0, 0, a.id, true)); c.fireCooldown = st.cooldownMs??800; }
  }
  for (const e of state.enemies) {
    if (!e.alive) continue; const c = state.aiContexts.get(e.id); if (!c) continue;
    const tgt = state.allies.find(a => a.alive && e.pos.dist(a.pos) < c.visionRadius)?.pos || new Vec2(80, MAP_H/2);
    const md = updateAI(c, tgt, state.map, dt);
    e.vel = md.scale(100 * 0.55); e.pos = e.pos.add(e.vel.scale(dt)); e.dir = md.mag() > 0 ? md.angle() : e.dir;
    e.pos = new Vec2(Math.max(20, Math.min(MAP_W-20, e.pos.x)), Math.max(20, Math.min(MAP_H-20, e.pos.y)));
    const toT = tgt.sub(e.pos); if (toT.mag() > 1) { const ta = toT.angle(); const d = normalizeAngle(ta - e.turretAngle); const ms = TURRET_ANGULAR_VEL * dt; e.turretAngle = Math.abs(d) < ms ? ta : normalizeAngle(e.turretAngle + Math.sign(d) * ms); }
    if (shouldFire(c, tgt)) { const st = e.config.barrel.stats; state.bullets.push(createBullet(e.pos, e.turretAngle, st.bulletStyle??'straight', st.bulletSpeed??350, st.bulletDamage??20, 0, 0, e.id, false)); c.fireCooldown = st.cooldownMs??2000; }
  }

  // Lightweight bullets: move + die off-screen (no sound, no block collision)
  for (const b of state.bullets) {
    if (!b.alive) continue;
    b.pos = b.pos.add(b.vel.scale(dt));
    if (b.pos.x < -100 || b.pos.x > MAP_W+100 || b.pos.y < -100 || b.pos.y > MAP_H+100) b.alive = false;
  }
  // Simple bullet-tank hit (no sound)
  for (const b of state.bullets) { if (!b.alive) continue;
    const targets = b.isPlayerBullet ? state.enemies : state.allies;
    for (const t of targets) { if (!t.alive) continue;
      if (b.pos.dist(t.pos) < 20) { t.hp -= b.damage; if (t.hp <= 0) { t.alive = false; for (let i=0;i<8;i++) { const a=Math.random()*Math.PI*2; state.particles.push({pos:new Vec2(t.pos.x,t.pos.y),vel:new Vec2(Math.cos(a)*(40+Math.random()*60),Math.sin(a)*(40+Math.random()*60)),life:0.3+Math.random()*0.4,maxLife:0.6,color:['#ff4400','#ff8800','#ffcc00'][Math.floor(Math.random()*3)],radius:2+Math.random()*3,alive:true,smokeExpand:true,isCross:false});} } b.alive = false; break; }
    }
  }
  updateParticles(state.particles, dt); state.particles = state.particles.filter((p:any)=>p.alive);
  if (state.bullets.length > 200) state.bullets = state.bullets.slice(-150);
  // Cap particles (higher during Damocles kill bursts)
  if (state.particles.length > 1000) state.particles = state.particles.slice(-800);
  state.bullets = state.bullets.filter((b:any)=>b.alive);
  state.allies = state.allies.filter((a:any)=>a.alive); state.enemies = state.enemies.filter((e:any)=>e.alive);
  for (const [id] of state.aiContexts) { if (![...state.allies, ...state.enemies].find(t => t.id === id)) state.aiContexts.delete(id); }
}

export function drawDemoState(ctx: CanvasRenderingContext2D, state: DemoState): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < MAP_W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,MAP_H); ctx.stroke(); }
  for (let y = 0; y < MAP_H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(MAP_W,y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(120,120,130,0.3)'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, MAP_W-4, MAP_H-4);
  for (const b of state.bullets) { if (!b.alive) continue; ctx.fillStyle = b.isPlayerBullet?'#ffe066':'#ff4444'; ctx.beginPath(); ctx.arc(b.pos.x,b.pos.y,4,0,Math.PI*2); ctx.fill(); }
  for (const p of state.particles) { if (!p.alive) continue; ctx.fillStyle = p.color; ctx.globalAlpha = p.life/p.maxLife; ctx.beginPath(); ctx.arc(p.pos.x,p.pos.y,p.radius,0,Math.PI*2); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const a of state.allies) { if (a.alive) drawTank(ctx, a); }
  for (const e of state.enemies) { if (e.alive) drawTank(ctx, e); }
  if (state.trojanPhase !== 'idle') drawTrojanHorse(ctx, state as any);
  if (state.damoclesPhase !== 'idle') {
    const s = state as any;
    const orig = s.enemies;
    s.enemies = s._damoAll || orig;
    drawDamoclesSwords(ctx, s);
    s.enemies = orig;
  }
}
