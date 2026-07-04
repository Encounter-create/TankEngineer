// ============================================================
// 零件协同效应系统 — hidden synergies between parts
// ============================================================

import { TankConfig } from '../entities/Parts';

export interface Synergy {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

const SYNERGIES: { id: string; name: string; icon: string; desc: string; check: (c: TankConfig) => boolean }[] = [
  {
    id: 'precision_strike',
    name: '精确打击',
    icon: '🎯',
    desc: '空军轰炸更密集',
    check: c => c.barrel.id === 'barrel_sniper' && c.commander.id === 'commander_colonel',
  },
  {
    id: 'firework_fest',
    name: '烟花祭',
    icon: '🎆',
    desc: '弹幕期间母弹分裂频率×2',
    check: c => c.barrel.id === 'barrel_firework' && c.commander.id === 'commander_barrage',
  },
  {
    id: 'mirror_clone',
    name: '镜面分身',
    icon: '🪞',
    desc: '忍者分身获得反射弹',
    check: c => c.barrel.id === 'barrel_bounce' && c.commander.id === 'commander_ninja',
  },
  {
    id: 'undead_rocket',
    name: '亡灵火箭',
    icon: '💀',
    desc: '火箭击杀自动复活为盟友',
    check: c => c.barrel.id === 'barrel_rocket' && c.commander.id === 'commander_wizard',
  },
  {
    id: 'mobile_fortress',
    name: '移动堡垒',
    icon: '🏰',
    desc: '炮塔生命+50% 射程+30%',
    check: c => c.chassis.id === 'chassis_heavy' && c.commander.id === 'commander_engineer',
  },
];

export function checkSynergies(config: TankConfig): Synergy[] {
  return SYNERGIES.filter(s => s.check(config)).map(({ id, name, icon, desc }) => ({ id, name, icon, desc }));
}

export function hasSynergy(config: TankConfig, synergyId: string): boolean {
  return SYNERGIES.find(s => s.id === synergyId)?.check(config) ?? false;
}
