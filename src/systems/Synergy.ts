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
    desc: '轰炸频率翻倍+垂直方向第二波轰炸',
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
    id: 'shadow_clones',
    name: '影分身之术',
    icon: '👥',
    desc: '影分身数量翻倍（忍者4个/闪电2个）',
    check: c => (c.commander.id === 'commander_ninja' || c.commander.id === 'commander_lightning') && c.chassis.id === 'chassis_sprint',
  },
  {
    id: 'undead_rocket',
    name: '亡灵火箭',
    icon: '💀',
    desc: '火箭击杀自动复活(保留原武器+AI参数)',
    check: c => c.barrel.id === 'barrel_rocket' && c.commander.id === 'commander_wizard',
  },
  {
    id: 'mobile_fortress',
    name: '前线堡垒',
    icon: '🏰',
    desc: '处于炮塔范围内时每秒回复8HP',
    check: c => c.chassis.id === 'chassis_heavy' && c.commander.id === 'commander_engineer',
  },
];

export function checkSynergies(config: TankConfig): Synergy[] {
  return SYNERGIES.filter(s => s.check(config)).map(({ id, name, icon, desc }) => ({ id, name, icon, desc }));
}

export function hasSynergy(config: TankConfig, synergyId: string): boolean {
  return SYNERGIES.find(s => s.id === synergyId)?.check(config) ?? false;
}
