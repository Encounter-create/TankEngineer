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
    description: '射出标准直线子弹。碰墙可反弹2次后消失。适用所有场景的通用炮管。',
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
    description: '专为反弹设计的炮管。子弹碰墙严格按入射角=反射角弹射，最多弹2次。每次反弹后子弹伤害降为原来的80%。适合在交叉火力等金属墙密集地图打出几何弹道。🪞协同「镜面分身」: 装备忍者大师时分身也使用反射弹。',
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
    description: '子弹可穿透1层砖墙，穿过后伤害减半但继续飞行。可攻击躲在墙后的敌人。不可反弹。适合迷宫等砖墙密集地图，直接穿墙击杀掩体后的目标。',
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
    description: '子弹以抛物线轨迹飞行，可越过砖墙攻击后方敌人。子弹到达抛物线最高点时伤害翻倍。不可反弹。适合在有砖墙障碍的场景中曲线射击掩体后目标。',
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
    description: '发射一颗缓慢飞行的母弹。母弹每0.28秒向正六边形6个方向各发射一颗子子弹，形成几何烟花图案。母弹2秒后自动消失。不可反弹。适合大范围压制和封锁敌人走位。🎆协同「烟花祭」: 装备弹幕指挥官时弹幕期间母弹分裂频率翻倍。',
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
    description: '一次射出两颗子弹。两颗子弹以5px半径互相环绕旋转前进，始终保持180°相位差（永远在中心两侧对称位置）。不可反弹。几何对称之美，覆盖宽度比普通子弹大一倍。',
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
    description: '超高伤害(999)一击必杀。子弹速度极快(800)，可击穿木质和金属墙体后继续飞行。射速极慢(4秒一发)作为平衡。碰墙可反弹2次。适合精准狙击，一枪一个。🎯协同「精确打击」: 装备空军上校时飞机投弹频率翻倍。',
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
    description: '极高射速(70ms一发)的弹幕武器。每发伤害低(6)但火力密度极大。按住鼠标可连续倾泻子弹。碰墙反弹2次。六管旋转枪管外观。适合火力压制和近距离速射。',
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
    description: '发射一枚火箭飞向鼠标方向。撞击任何物体(敌人/墙/方块)后爆炸，留下半径50px的火圈持续5秒。火圈内所有单位每秒受25点伤害。爆炸本身造成60点范围伤害。不可反弹。💀协同「亡灵火箭」: 装备巫师时火箭击杀的敌人自动复活为友军。',
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
    description: '轻型炮塔(正三角△)。HP仅80但重量轻(1)，使坦克总重降低从而获得轻量级速度加成(+15%)。装填速度不受重量惩罚。适合追求速度和机动性的玻璃大炮build。',
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
    description: '重型炮塔(正五边⬠)。HP高达180，防御系数0.85（实际承受伤害减少15%）。但重量大(3)，搭配其他重零件可能进入重量级(-15%速度)。适合正面硬抗的肉盾build。',
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
    description: '反应式装甲(正六边⬡)。受击瞬间触发0.5秒无敌帧（CD 8秒）。无敌期间所有伤害降为0。HP仅90但关键时刻的无敌可以抵挡致命一击。适合高手预判操作。',
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
    description: '均衡的圆角矩形底盘。速度1.0倍标准，无特殊效果。重量适中(2)，与大多数零件搭配可保持中量级。适合新手入门。',
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
    description: '流线型椭圆底盘。松手后坦克因惯性继续滑行一段距离（类似冰面效果）。速度1.2倍比标准更快，重量仅1有助于保持轻量级。适合hit-and-run游击战术。',
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
    description: '梯形重装甲底盘。速度仅0.7倍但能直接碾碎接触的砖墙（无需开火）。不受开火后坐力影响。重量大(3)，配合重甲炮塔可达到重量级。适合推进式打法：碾碎掩体、推动方块砸敌人。🏰协同「移动堡垒」: 装备炮塔工程师时炮塔HP+50%、射程+30%。',
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
    description: '椭圆体紧凑底盘配大号履带。车身方向瞬间跟随移动方向切换（无转向延迟，普通底盘需角速度逐渐转向）。速度0.9倍略慢但转向灵活度极高。适合需要快速调整射击角度的场景。',
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
    description: '立即恢复自身40点HP，冷却60秒。简单直接的自愈能力，适合新手车长。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_sprint',
    name: '冲刺指挥官',
    type: 'commander',
    rarity: 'common',
    weight: 1,
    description: '2秒内自身移动速度翻倍，冷却30秒。适合快速突进、脱离包围或追击残血敌人。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_barrage',
    name: '弹幕指挥官',
    type: 'commander',
    rarity: 'rare',
    weight: 1,
    description: '3秒内弹药无限（装填时间降为50ms），冷却45秒。按住鼠标疯狂倾泻火力。🎆协同: 装备烟花炮管时触发「烟花祭」——弹幕期间母弹分裂频率翻倍，铺天盖地的子子弹覆盖全场。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_smoke',
    name: '烟雾指挥官',
    type: 'commander',
    rarity: 'rare',
    weight: 1,
    description: '释放烟雾笼罩自身3秒，冷却25秒。烟雾期间敌方AI无法追踪你的位置，转而攻击指挥所。适合脱离战斗或保护指挥所时分担火力。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_colonel',
    name: '空军上校',
    type: 'commander',
    rarity: 'legendary',
    weight: 2,
    description: '召唤3架轰炸机呈三角阵型，沿炮塔朝向飞过战场投弹轰炸。飞机投下的炸弹造成范围伤害并留下火圈，冷却60秒。🎯协同「精确打击」: 装备狙击炮管时投弹频率翻倍(间隔0.6秒→密集轰炸)。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_engineer',
    name: '炮塔工程师',
    type: 'commander',
    rarity: 'epic',
    weight: 2,
    description: '在当前位置部署一个自动炮塔，射程180px内自动索敌开火。炮塔有120HP，可被敌方攻击摧毁。冷却40秒。🏰协同「移动堡垒」: 装备重型底盘时炮塔HP提升50%(180)、射程扩大30%(234px)，变成真正的前线堡垒。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_wizard',
    name: '巫师',
    type: 'commander',
    rarity: 'legendary',
    weight: 2,
    description: '复活最多3辆已被击毁的敌方坦克，转化为我方友军。复活的友军保留原配置，使用巡逻+追击+开火AI自动攻击敌军。冷却80秒。💀协同「亡灵火箭」: 装备火箭炮时，火箭直接击杀的敌人自动复活为友军（无需手动按技能）。',
    stats: { skillCdMs: 20000 },
  },
  {
    id: 'commander_ninja',
    name: '忍者大师',
    type: 'commander',
    rarity: 'epic',
    weight: 2,
    description: '分出一辆与自身完全相同配置的友军坦克。分身使用三态AI：追随玩家(100px内)→侦察巡逻→发现敌人开火(200px内)。冷却50秒。🪞协同「镜面分身」: 装备反射管时，分身的炮管替换为反射管，双倍反弹火力覆盖战场。',
    stats: { skillCdMs: 20000 },
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
