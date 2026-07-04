// ============================================================
// 零件系统 — 所有零件定义与坦克方程约束
// ============================================================

export type PartType = 'barrel' | 'turret' | 'chassis' | 'commander';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type WeightClass = 'light' | 'medium' | 'heavy';
export type BulletStyle = 'straight' | 'bounce' | 'pierce' | 'arc' | 'firework' | 'orbital' | 'rocket' | 'scatter' | 'magnetic';

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
    description: '碰墙反弹2次后消失。反弹不伤墙体。子弹伤害35，2发可摧毁木块(HP50)。不反弹：第3次碰墙消失。',
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
    description: '碰墙反弹2次（反射角=入射角）。反弹不伤墙体。每次反弹后伤害×0.8。最多弹2次，第3次碰墙消失。🪞协同「镜面分身」: 忍者大师的分身使用反射弹。',
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
    description: '穿透砖墙1层：伤害40→穿墙后减半(20)并继续飞行。可攻击墙后敌人。不可反弹。对木块造成伤害可摧毁(2发)。不穿透铁块。',
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
    description: '抛物线飞越砖墙（不碰撞砖块）。最高点伤害×2(50)。不可反弹。落点处若命中木块则造成伤害可摧毁。碰到铁块消失。',
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
    description: '母弹不可反弹，碰墙即消失。飞行中每0.28s向6方向发射子子弹(伤害7)。母弹2s后自毁。子子弹可反弹2次。🎆协同「烟花祭」: 弹幕指挥官→分裂频率翻倍。',
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
    description: '双弹环绕(半径5px,180°相位差)，覆盖宽度×2。不可反弹，碰墙消失。每发伤害22，需3发摧毁木块。几何对称弹道。',
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
    description: '伤害999一击必杀。穿透一切墙体(木块铁块一击摧毁)，子弹穿透后继续飞行。永不反弹。CD 2s。🎯协同「精确打击」: 空军上校→轰炸加倍。',
    stats: {
      bulletStyle: 'straight',
      bulletDamage: 999,
      bulletSpeed: 800,
      bounces: 0,
      pierces: 0,
      cooldownMs: 2000,
    },
  },
  {
    id: 'barrel_gatling',
    name: '加特林机枪',
    type: 'barrel',
    rarity: 'epic',
    weight: 2,
    description: '射速70ms弹幕倾泻。每发伤害6，碰墙反弹2次后消失。反弹不伤墙体。需9发摧毁木块(HP50)。按住连射。',
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
    description: '火箭飞向鼠标方向。撞击任意物体(敌/墙/方块)→爆炸(AoE 60伤害)+半径50px火圈(5秒,25dps)。不可反弹。爆炸摧毁范围内木块。💀协同「亡灵火箭」: 巫师→击杀自动复活。',
    stats: {
      bulletStyle: 'rocket',
      bulletDamage: 60,
      bulletSpeed: 250,
      bounces: 0,
      pierces: 0,
      cooldownMs: 2500,
    },
  },
  {
    id: 'barrel_scatter',
    name: '散射管',
    type: 'barrel',
    rarity: 'legendary',
    weight: 3,
    description: '一次射出3颗子弹呈15°扇形散布。每发伤害25。碰墙反弹2次后消失，反弹不伤墙体。中近距离覆盖范围大。',
    stats: {
      bulletStyle: 'scatter',
      bulletDamage: 25,
      bulletSpeed: 380,
      bounces: 0,
      pierces: 0,
      cooldownMs: 1200,
    },
  },
  {
    id: 'barrel_magnetic',
    name: '磁轨管',
    type: 'barrel',
    rarity: 'legendary',
    weight: 3,
    description: '子弹碰到金属墙后沿墙表面滑行(不反弹)，滑行速度不变。碰木块反弹2次。适合交叉火力等金属墙密集地图，子弹沿铁轨滑动直击墙后敌人。',
    stats: {
      bulletStyle: 'magnetic',
      bulletDamage: 35,
      bulletSpeed: 350,
      bounces: 2,
      pierces: 0,
      cooldownMs: 1400,
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
  {
    id: 'turret_repair',
    name: '修复装甲',
    type: 'turret',
    rarity: 'rare',
    weight: 2,
    description: '脱离战斗3秒后缓慢回血(每秒5HP)。HP 100。适合打游击——受伤后撤，等回血再出击。',
    stats: {
      maxHp: 100,
      defenseRatio: 1.0,
    },
  },
  {
    id: 'turret_mirror',
    name: '镜像装甲',
    type: 'turret',
    rarity: 'legendary',
    weight: 1,
    description: '30%概率将受到的伤害反弹给攻击者(自身仍受伤害)。HP仅60但关键时刻反弹可反杀。重量仅1。',
    stats: {
      maxHp: 60,
      defenseRatio: 1.0,
    },
  },
  {
    id: 'turret_berserker',
    name: '狂战装甲',
    type: 'turret',
    rarity: 'epic',
    weight: 2,
    description: 'HP越低伤害越高。满血时伤害×1.0，半血×1.5，残血×2.0。HP 70适合高风险高回报打法。',
    stats: {
      maxHp: 70,
      defenseRatio: 1.0,
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
  {
    id: 'chassis_blink',
    name: '闪现底盘',
    type: 'chassis',
    rarity: 'legendary',
    weight: 2,
    description: 'Shift键向鼠标方向瞬移3格(96px)。落地0.3s无敌。适合高风险高机动战术。',
    stats: {
      speedRatio: 0.85,
      inertia: 0,
      recoil: 0,
      crushWalls: false,
    },
  },
  {
    id: 'chassis_sprint',
    name: '冲刺底盘',
    type: 'chassis',
    rarity: 'rare',
    weight: 2,
    description: '持续移动时速度逐步提升，最高1.5倍。停止移动后加速重置。适合长距离奔袭和追击。',
    stats: {
      speedRatio: 0.9,
      inertia: 0,
      recoil: 0,
      crushWalls: false,
    },
  },
  {
    id: 'chassis_hover',
    name: '悬浮底盘',
    type: 'chassis',
    rarity: 'epic',
    weight: 1,
    description: '全地形滑行(类似冰面效果)，松手后持续滑行。速度1.1倍。所有地面均无摩擦。适合惯性漂移操作。',
    stats: {
      speedRatio: 1.1,
      inertia: 4,
      recoil: 0,
      crushWalls: false,
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
