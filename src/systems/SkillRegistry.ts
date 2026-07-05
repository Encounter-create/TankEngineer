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
