// ============================================================
// 零件系统 — 所有零件定义与坦克方程约束
// ============================================================

export type PartType = 'barrel' | 'turret' | 'chassis' | 'commander';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type WeightClass = 'light' | 'medium' | 'heavy';
export type BulletStyle = 'straight' | 'bounce' | 'pierce' | 'arc' | 'firework' | 'orbital' | 'rocket';

/** Core part definition */
export interface Part {
  id: string;
  name: string;
  type: PartType;
  rarity: Rarity;
  weight: number;
  description: string;
  /** Stats that affect gameplay */
  stats: PartStats;
}

export interface PartStats {
  // Barrel
  bulletStyle?: BulletStyle;
  bulletDamage?: number;    // base damage per hit
  bulletSpeed?: number;     // pixels per second
  bounces?: number;         // max wall bounces (0=none)
  pierces?: number;         // walls penetrable (0=none)
  cooldownMs?: number;      // ms between shots

  // Turret
  maxHp?: number;
  defenseRatio?: number;    // damage multiplier (0-1, lower=better defense)

  // Chassis
  speedRatio?: number;      // movement speed multiplier
  inertia?: number;         // 0=no slide, >0=slide distance in cells
  recoil?: number;          // 0=none, 1=1 cell kickback on fire
  crushWalls?: boolean;     // can destroy brick walls by touching
  instantTurn?: boolean;    // body turns instantly (no angular acceleration)

  // Turret specials
  invulnDurationMs?: number; // reactive armor: invulnerability window after hit (ms)
  invulnCooldownMs?: number; // reactive armor: cooldown between triggers (ms)

  // Commander (MVP phase 2, placeholder)
  skillCdMs?: number;
}

// ============================================================
// MVP 零件清单 (8个: 2炮管 + 2炮塔 + 2车身, 不含车长)
// ============================================================

export const MVP_BARRELS: Part[] = [
  {
    id: 'barrel_straight',
    name: '直射管',
    type: 'barrel',
    rarity: 'common',
    weight: 1,
    description: '直线子弹，碰墙反弹2次(第3次消失)，可靠通用',
    stats: {
      bulletStyle: 'straight',
      bulletDamage: 35,
      bulletSpeed: 400,
      bounces: 0,
      pierces: 0,
      cooldownMs: 800,
    },
  },
  {
    id: 'barrel_bounce',
    name: '反射管',
    type: 'barrel',
    rarity: 'rare',
    weight: 2,
    description: '专精反弹：碰墙反射角=入射角，可弹2次，反弹后伤害×0.8',
    stats: {
      bulletStyle: 'bounce',
      bulletDamage: 30,
      bulletSpeed: 350,
      bounces: 2,
      pierces: 0,
      cooldownMs: 1000,
    },
  },
  {
    id: 'barrel_pierce',
    name: '透射管',
    type: 'barrel',
    rarity: 'epic',
    weight: 2,
    description: '穿透砖墙1层(穿后伤害减半)，不可反弹，不可摧毁木块后的敌人',
    stats: {
      bulletStyle: 'pierce',
      bulletDamage: 40,
      bulletSpeed: 380,
      bounces: 0,
      pierces: 1,
      cooldownMs: 1100,
    },
  },
  {
    id: 'barrel_arc',
    name: '曲射管',
    type: 'barrel',
    rarity: 'epic',
    weight: 2,
    description: '抛物线飞越砖墙(不可反弹)，最高点伤害×2，绕过掩体攻击',
    stats: {
      bulletStyle: 'arc',
      bulletDamage: 25,
      bulletSpeed: 300,
      bounces: 0,
      pierces: 0,
      cooldownMs: 1200,
    },
  },
  {
    id: 'barrel_firework',
    name: '烟花炮管',
    type: 'barrel',
    rarity: 'legendary',
    weight: 3,
    description: '母弹缓慢飞行绽放6向子子弹(不可反弹)，2s后自动消失',
    stats: {
      bulletStyle: 'firework',
      bulletDamage: 12,
      bulletSpeed: 100,
      bounces: 0,
      pierces: 0,
      cooldownMs: 3000,
    },
  },
  {
    id: 'barrel_orbital',
    name: '粒子炮管',
    type: 'barrel',
    rarity: 'legendary',
    weight: 3,
    description: '双子星旋转弹道(不可反弹)，双弹180°相位差紧密缠绕',
    stats: {
      bulletStyle: 'orbital',
      bulletDamage: 22,
      bulletSpeed: 300,
      bounces: 0,
      pierces: 0,
      cooldownMs: 1600,
    },
  },
  {
    id: 'barrel_sniper',
    name: '狙击炮管',
    type: 'barrel',
    rarity: 'legendary',
    weight: 2,
    description: '一击必杀(伤害999)，击穿木墙铁墙，碰墙反弹2次',
    stats: {
      bulletStyle: 'straight',
      bulletDamage: 999,
      bulletSpeed: 800,
      bounces: 0,
      pierces: 0,
      cooldownMs: 4000,
    },
  },
  {
    id: 'barrel_gatling',
    name: '加特林机枪',
    type: 'barrel',
    rarity: 'epic',
    weight: 2,
    description: '超高射速(70ms)，弹幕倾泻，碰墙反弹2次，适合压制',
    stats: {
      bulletStyle: 'straight',
      bulletDamage: 6,
      bulletSpeed: 550,
      bounces: 0,
      pierces: 0,
      cooldownMs: 70,
    },
  },
  {
    id: 'barrel_rocket',
    name: '火箭炮',
    type: 'barrel',
    rarity: 'legendary',
    weight: 3,
    description: '发射火箭飞向瞄准点爆炸，留下火圈持续灼烧',
    stats: {
      bulletStyle: 'rocket',
      bulletDamage: 60,
      bulletSpeed: 250,
      bounces: 0,
      pierces: 0,
      cooldownMs: 2500,
    },
  },
];

export const MVP_TURRETS: Part[] = [
  {
    id: 'turret_light',
    name: '轻甲炮塔',
    type: 'turret',
    rarity: 'common',
    weight: 1,
    description: 'HP低但装填快',
    stats: {
      maxHp: 80,
      defenseRatio: 1.0,
    },
  },
  {
    id: 'turret_heavy',
    name: '重甲炮塔',
    type: 'turret',
    rarity: 'rare',
    weight: 3,
    description: 'HP高但装填慢',
    stats: {
      maxHp: 180,
      defenseRatio: 0.85,
    },
  },
  {
    id: 'turret_reactive',
    name: '反应装甲',
    type: 'turret',
    rarity: 'epic',
    weight: 2,
    description: '受击后0.5s无敌，CD 8s',
    stats: {
      maxHp: 90,
      defenseRatio: 1.0,
      invulnDurationMs: 500,
      invulnCooldownMs: 8000,
    },
  },
];

export const MVP_CHASSIS: Part[] = [
  {
    id: 'chassis_standard',
    name: '标准底盘',
    type: 'chassis',
    rarity: 'common',
    weight: 2,
    description: '均衡的移动速度，无特殊效果',
    stats: {
      speedRatio: 1.0,
      inertia: 0,
      recoil: 0,
      crushWalls: false,
    },
  },
  {
    id: 'chassis_inertia',
    name: '惯性底盘',
    type: 'chassis',
    rarity: 'rare',
    weight: 1,
    description: '松手后继续滑行，速度更快',
    stats: {
      speedRatio: 1.2,
      inertia: 3,
      recoil: 0,
      crushWalls: false,
    },
  },
  {
    id: 'chassis_heavy',
    name: '重型底盘',
    type: 'chassis',
    rarity: 'rare',
    weight: 3,
    description: '速度慢但能碾碎砖墙，不受后坐力',
    stats: {
      speedRatio: 0.7,
      inertia: 0,
      recoil: 0,
      crushWalls: true,
    },
  },
  {
    id: 'chassis_track',
    name: '履带底盘',
    type: 'chassis',
    rarity: 'epic',
    weight: 2,
    description: '可原地旋转，方向跟随移动瞬间切换',
    stats: {
      speedRatio: 0.9,
      inertia: 0,
      recoil: 0,
      crushWalls: false,
      instantTurn: true,
    },
  },
];

export const MVP_COMMANDERS: Part[] = [
  {
    id: 'commander_repair',
    name: '维修专家',
    type: 'commander',
    rarity: 'common',
    weight: 1,
    description: '立即恢复 40 HP',
    stats: { skillCdMs: 60000 },
  },
  {
    id: 'commander_sprint',
    name: '冲刺指挥官',
    type: 'commander',
    rarity: 'common',
    weight: 1,
    description: '2秒内速度翻倍',
    stats: { skillCdMs: 30000 },
  },
  {
    id: 'commander_barrage',
    name: '弹幕指挥官',
    type: 'commander',
    rarity: 'rare',
    weight: 1,
    description: '3秒内弹药无限',
    stats: { skillCdMs: 45000 },
  },
  {
    id: 'commander_smoke',
    name: '烟雾指挥官',
    type: 'commander',
    rarity: 'rare',
    weight: 1,
    description: '释放烟雾阻挡敌人视线 3 秒',
    stats: { skillCdMs: 25000 },
  },
  {
    id: 'commander_colonel',
    name: '空军上校',
    type: 'commander',
    rarity: 'legendary',
    weight: 2,
    description: '召唤3架轰炸机飞过投弹。🎯协同: 狙击管→精确打击(投弹频率×2)',
    stats: { skillCdMs: 60000 },
  },
  {
    id: 'commander_engineer',
    name: '炮塔工程师',
    type: 'commander',
    rarity: 'epic',
    weight: 2,
    description: '放置自动炮塔攻击敌军。🏰协同: 重型底盘→移动堡垒(炮塔HP+50%射程+30%)',
    stats: { skillCdMs: 40000 },
  },
  {
    id: 'commander_wizard',
    name: '巫师',
    type: 'commander',
    rarity: 'legendary',
    weight: 2,
    description: '复活死敌为友军作战。💀协同: 火箭炮→亡灵火箭(火箭击杀自动复活)',
    stats: { skillCdMs: 80000 },
  },
  {
    id: 'commander_ninja',
    name: '忍者大师',
    type: 'commander',
    rarity: 'epic',
    weight: 2,
    description: '分身同配友军坦克。🪞协同: 反射管→镜面分身(分身获得反射弹)',
    stats: { skillCdMs: 50000 },
  },
];

/** Default commander (no skill) */
export const DEFAULT_COMMANDER: Part = {
  id: 'commander_none',
  name: '无车长',
  type: 'commander',
  rarity: 'common',
  weight: 0,
  description: '无特殊技能',
  stats: {},
};

// ============================================================
// 坦克方程约束系统
// ============================================================

export interface TankConfig {
  barrel: Part;
  turret: Part;
  chassis: Part;
  commander: Part;
  totalWeight: number;
  weightClass: WeightClass;
}

export function computeWeightClass(totalWeight: number): WeightClass {
  if (totalWeight <= 4) return 'light';
  if (totalWeight <= 6) return 'medium';
  return 'heavy';
}

export function assembleTank(barrel: Part, turret: Part, chassis: Part, commander: Part = DEFAULT_COMMANDER): TankConfig {
  const totalWeight = barrel.weight + turret.weight + chassis.weight + commander.weight;
  return {
    barrel,
    turret,
    chassis,
    commander,
    totalWeight,
    weightClass: computeWeightClass(totalWeight),
  };
}

/** Get the effective cooldown after turret weight penalty */
export function effectiveCooldown(config: TankConfig): number {
  const base = config.barrel.stats.cooldownMs ?? 800;
  // Heavy turrets don't affect cooldown directly, but heavy weight class slows reload
  const wcMult = config.weightClass === 'heavy' ? 1.3 : config.weightClass === 'light' ? 0.85 : 1.0;
  return base * wcMult;
}

/** Get effective speed in pixels per second */
export function effectiveSpeed(config: TankConfig): number {
  const base = 160; // px/s
  const chassisMult = config.chassis.stats.speedRatio ?? 1.0;
  const wcMult = config.weightClass === 'light' ? 1.15 : config.weightClass === 'heavy' ? 0.85 : 1.0;
  return base * chassisMult * wcMult;
}

/** Get effective max HP */
export function effectiveMaxHp(config: TankConfig): number {
  return config.turret.stats.maxHp ?? 100;
}

/** Calculate damage dealt to a target with given defense ratio */
export function calcDamage(rawDamage: number, targetDefenseRatio: number): number {
  return Math.round(rawDamage * targetDefenseRatio);
}
