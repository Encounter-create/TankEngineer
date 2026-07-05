import { TankEntity } from '../entities/Tank';

// Re-export from SkillRegistry for backward compatibility
export { activateSkill } from './SkillRegistry';
export type { AbilityResult } from './SkillRegistry';

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
