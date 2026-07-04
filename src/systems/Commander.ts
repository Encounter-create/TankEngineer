import { TankEntity } from '../entities/Tank';

// ============================================================
// Commander ability system
// ============================================================

export interface AbilityResult {
  success: boolean;
  message: string;
}

/** Activate commander skill. Returns result with message. */
export function activateSkill(tank: TankEntity): AbilityResult {
  const commander = tank.config.commander;
  const now = performance.now();

  if (commander.id === 'commander_none') {
    return { success: false, message: '未装备车长' };
  }

  if (now < tank.skillCooldownUntil) {
    const remain = Math.ceil((tank.skillCooldownUntil - now) / 1000);
    return { success: false, message: `冷却中… ${remain}s` };
  }

  const cdMs = commander.stats.skillCdMs ?? 30000;

  switch (commander.id) {
    case 'commander_repair':
      tank.hp = Math.min(tank.maxHp, tank.hp + 40);
      tank.skillCooldownUntil = now + cdMs;
      tank.skillActiveUntil = 0;
      return { success: true, message: '+40 HP 修复' };

    case 'commander_sprint':
      tank.skillCooldownUntil = now + cdMs;
      tank.skillActiveUntil = now + 2000; // 2s duration
      return { success: true, message: '速度翻倍 2s' };

    case 'commander_barrage':
      tank.skillCooldownUntil = now + cdMs;
      tank.skillActiveUntil = now + 3000; // 3s duration
      return { success: true, message: '无限弹药 3s' };

    case 'commander_smoke':
      tank.skillCooldownUntil = now + cdMs;
      tank.skillActiveUntil = now + 3000;
      return { success: true, message: '烟雾弹 3s' };

    case 'commander_colonel':
      tank.skillCooldownUntil = now + cdMs;
      return { success: true, message: '轰炸机出击！' };

    case 'commander_engineer':
      tank.skillCooldownUntil = now + cdMs;
      return { success: true, message: '炮塔已部署' };

    case 'commander_wizard':
      tank.skillCooldownUntil = now + cdMs;
      return { success: true, message: '亡灵复苏！' };

    case 'commander_ninja':
      tank.skillCooldownUntil = now + cdMs;
      return { success: true, message: '分身出击！' };

    default:
      return { success: false, message: '未知技能' };
  }
}

/** Check if a skill is currently active */
export function isSkillActive(tank: TankEntity): boolean {
  return performance.now() < tank.skillActiveUntil;
}

/** Get the speed multiplier from active sprint skill */
export function getSkillSpeedMultiplier(tank: TankEntity): number {
  if (tank.config.commander.id === 'commander_sprint' && isSkillActive(tank)) {
    return 2.0;
  }
  return 1.0;
}

/** Check if barrage (infinite ammo) is active */
export function isBarrageActive(tank: TankEntity): boolean {
  return tank.config.commander.id === 'commander_barrage' && isSkillActive(tank);
}

/** Check if smoke is active — enemies near this tank can't see */
export function isSmokeActive(tank: TankEntity): boolean {
  return tank.config.commander.id === 'commander_smoke' && isSkillActive(tank);
}
