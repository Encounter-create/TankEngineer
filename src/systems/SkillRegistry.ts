// Centralized skill registry — add new skills here only
import { TankEntity } from '../entities/Tank';

export interface AbilityResult {
  success: boolean;
  message: string;
}

export const SKILLS: Record<string, (tank: TankEntity, now: number) => AbilityResult> = {
  commander_none: () => ({ success: false, message: '未装备车长' }),

  commander_repair: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.hp = Math.min(tank.maxHp, tank.hp + 40);
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '+40 HP 修复' };
  },

  commander_sprint: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    tank.skillActiveUntil = now + 2000;
    return { success: true, message: '速度翻倍 2s' };
  },

  commander_barrage: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    tank.skillActiveUntil = now + 3000;
    return { success: true, message: '无限弹药 3s' };
  },

  commander_smoke: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    tank.skillActiveUntil = now + 3000;
    return { success: true, message: '烟雾弹 3s' };
  },

  commander_colonel: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '轰炸机出击！' };
  },

  commander_engineer: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '炮塔已部署' };
  },

  commander_wizard: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '亡灵复苏！' };
  },

  commander_ninja: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '分身出击！' };
  },

  commander_gravity: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '重力井！' };
  },

  commander_time: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '时间扭曲！' };
  },

  commander_lightning: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '连锁闪电！' };
  },

  commander_restore: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 20000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '砖墙复苏！' };
  },

  commander_trisolaran: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 30000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '☄️ 陨石天降！' };
  },

  commander_bivector: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 60000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '📐 二向箔展开！' };
  },

  commander_quantum: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 60000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🐱 叠加态展开！' };
  },

  commander_lens: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 80000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🌀 引力透镜展开！' };
  },

  commander_poincare: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 90000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '⏪ 时间倒流！' };
  },

  commander_bigbang: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 100000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '💥 大爆炸！' };
  },

  commander_holo: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 120000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🌐 全息投影！' };
  },

  commander_trojan: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 80000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🏛️ 木马计！' };
  },

  commander_noah: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 90000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🌊 大洪水！' };
  },

  commander_damocles: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 75000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '⚔️ 达摩克利斯之剑！' };
  },
};

/** Activate skill via registry */
export function activateSkill(tank: TankEntity): AbilityResult {
  const id = tank.config.commander.id;
  const now = performance.now();
  if (now < tank.skillCooldownUntil) {
    const remain = Math.ceil((tank.skillCooldownUntil - now) / 1000);
    return { success: false, message: `冷却中… ${remain}s` };
  }
  const fn = SKILLS[id];
  if (!fn) return { success: false, message: '未知技能' };
  return fn(tank, now);
}

/** Shared skill effect handler — call this from both Siege and Practice */
export function executeSkillEffect(
  id: string, player: TankEntity,
  ctx: {
    particles: any[]; fireZones: any[]; planes: any[]; turrets: any[];
    allies: any[]; enemies: any[]; // add as needed
    addParticle: (p: any) => void;
    addFireZone: (z: any) => void;
    addPlane: (p: any) => void;
    addTurret: (t: any) => void;
    addAlly: (a: any) => void;
    setGravity: (pos: any) => void;
    setSlowMo: () => void;
    lightningDamage: (enemy: any, dmg: number) => void;
    restoreBricks: () => number;
    ninjaClone: () => void;
    wizardResurrect: () => number;
    getMessage: () => string;
  },
): string | null {
  if (id === 'commander_repair') {
    ctx.addParticle({ type: 'repair', pos: player.pos, count: 10, speed: 50 });
    return null;
  }
  if (id === 'commander_colonel') {
    ctx.addPlane({ pos: player.pos, dir: player.turretAngle });
    return null;
  }
  if (id === 'commander_engineer') {
    ctx.addTurret({ pos: player.pos });
    return '炮塔已部署';
  }
  if (id === 'commander_wizard') {
    const n = ctx.wizardResurrect();
    return n > 0 ? `复活了${n}辆敌军` : '没有可复活的敌军';
  }
  if (id === 'commander_ninja') {
    ctx.ninjaClone();
    return '分身已出击';
  }
  if (id === 'commander_gravity') {
    ctx.setGravity(player); // uses player as marker
    return null;
  }
  if (id === 'commander_time') {
    ctx.setSlowMo();
    return null;
  }
  if (id === 'commander_lightning') {
    ctx.lightningDamage(null, 100);
    return null;
  }
  if (id === 'commander_restore') {
    const n = ctx.restoreBricks();
    return `恢复了${n}块砖墙`;
  }
  return null;
}
