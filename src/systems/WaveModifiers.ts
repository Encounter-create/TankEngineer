// ============================================================
// Wave modifier system — random modifiers per wave
// ============================================================

import { Random } from '../utils/Random';

export type ModifierId = 'explosive' | 'cloaked' | 'magnetic' | 'overclocked' | 'armored' | 'bomb_blocks';

export interface WaveModifier {
  id: ModifierId;
  name: string;
  icon: string;
  desc: string;
  color: string;
}

export const ALL_MODIFIERS: WaveModifier[] = [
  { id: 'explosive', name: '自爆兵', icon: '💥', desc: '敌人死亡时爆炸', color: '#ff4444' },
  { id: 'cloaked', name: '隐身', icon: '👻', desc: '敌人不开火时半透明', color: '#8888cc' },
  { id: 'magnetic', name: '磁力弹', icon: '🧲', desc: '敌方子弹轻微追踪', color: '#cc44cc' },
  { id: 'overclocked', name: '超速', icon: '⚡', desc: '敌人移速×1.4', color: '#44ccff' },
  { id: 'armored', name: '铁壁', icon: '🛡️', desc: '敌人HP+50%', color: '#ccaa44' },
  { id: 'bomb_blocks', name: '炸弹方块', icon: '💣', desc: '砖块被摧毁时爆炸', color: '#ff8800' },
];

const rand = new Random();

/** Pick random modifiers for a wave (1 for early, 2 for late) */
export function pickWaveModifiers(waveIndex: number): WaveModifier[] {
  const count = waveIndex >= 3 ? 2 : 1;
  const shuffled = rand.shuffle([...ALL_MODIFIERS]);
  return shuffled.slice(0, count);
}
