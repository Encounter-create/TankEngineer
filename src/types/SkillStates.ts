// SkillStates — all skill-related fields shared between SiegeState and PracticeState
// Add new skill fields here ONCE; both game modes pick them up automatically.
import { Vec2 } from '../utils/Vector';

export interface SkillStates {
  // Trisolaran (meteor)
  meteorPhase: 'idle' | 'targeting' | 'incoming' | 'impact' | 'burning';
  meteorTimer: number; meteorTarget: Vec2; meteorPos: Vec2; meteorVel: number;
  meteorImpactTime: number; meteorFlashAlpha: number;
  // Bivector (二向箔)
  bivectorPhase: 'idle' | 'compressing' | 'whiteout' | 'recovering';
  bivectorTimer: number; bivectorProgress: number;
  bivectorShear: number; bivectorScale: number; bivectorWhiteAlpha: number;
  bivectorDestroyed: boolean; bivectorText: string; bivectorTextColor: string;
  // Quantum (薛定谔)
  quantumPhase: 'idle' | 'superposing' | 'collapsed' | 'aftermath';
  quantumTimer: number; quantumRedAlpha: number; quantumBlueAlpha: number;
  quantumDestroyed: boolean;
  // Lens (引力透镜)
  lensPhase: 'idle' | 'forming' | 'active' | 'collapsing';
  lensTimer: number; lensTarget: Vec2; lensStrength: number; lensRadius: number;
  // Rewind / Poincaré (时间倒流)
  rewindPhase: 'idle' | 'rewinding' | 'recovering';
  rewindTimer: number; rewindBlueAlpha: number; rewindReversed: boolean;
  // BigBang (大爆炸)
  bigbangPhase: 'idle' | 'imploding' | 'exploding' | 'aftermath';
  bigbangTimer: number; bigbangScale: number; bigbangWhiteAlpha: number;
  // Holo (全息宇宙)
  holoPhase: 'idle' | 'projecting' | 'rotating' | 'shattering' | 'aftermath';
  holoTimer: number; holoRotation: number; holoRadius: number; holoCracks: number;
  // Trojan (特洛伊木马)
  trojanPhase: 'idle' | 'entering' | 'opening' | 'deploying' | 'shattering';
  trojanTimer: number; trojanX: number; trojanDoor: number; trojanSpawned: number;
  // Noah (诺亚方舟)
  arkPhase: 'idle' | 'raining' | 'peaking' | 'receding';
  arkTimer: number; arkWaterH: number;
  arkLightningBranches: Vec2[][]; arkLightningTimer: number;
  // Damocles (达摩克利斯之剑)
  damoclesPhase: 'idle' | 'hovering' | 'dropping' | 'aftermath'; damoclesTimer: number;
  // Dragon (叶公好龙)
  dragonPhase: 'idle' | 'entering' | 'revealing' | 'hugging' | 'exiting';
  dragonTimer: number; dragonX: number; dragonY: number; dragonReveal: number;
  // Genesis (要有光)
  genesisPhase: 'idle' | 'darkening' | 'ignition';
  genesisTimer: number; genesisFireRadius: number; genesisCleared: boolean;
  // Mjolnir (雷神之锤)
  mjolnirPhase: 'idle' | 'entering' | 'active' | 'exiting';
  mjolnirPos: Vec2; mjolnirVel: Vec2; mjolnirAngle: number;
  mjolnirTimer: number; mjolnirHoverBounce: number;
  mjolnirLightningTimer: number; mjolnirLightningBranches: Vec2[][];
  mjolnirThorQuote: string[]; mjolnirThorStartTime: number;
  // Shared skill helpers
  gravityPos: Vec2; gravityTimer: number;
  timeSlowTimer: number; restoreTimer: number;
  slowMoTimer: number;
  lightningBranches: Vec2[][]; lightningTimer: number;
}
