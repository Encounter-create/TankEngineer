// SiegeState type — extracted for skill module imports
import { TankEntity } from '../entities/Tank';
import { BulletEntity } from '../entities/Bullet';
import { TileGrid, MapName } from '../entities/Map';
import { PhysicsBlock } from '../entities/PhysicsBlock';
import { FireZone } from '../entities/FireZone';
import { Particle } from '../entities/Particle';
import { DamageNumber } from '../entities/DamageNumber';
import { AllyTank, CloneEntity, TurretEntity, Plane } from '../entities/Ally';
import { AIContext } from '../ai/EnemyAI';
import { Inventory } from '../systems/Inventory';
import { BattleReward } from '../systems/Reward';
import { WaveModifier } from '../systems/WaveModifiers';
import { SkillStates } from './SkillStates';

export type SiegePhase = 'intro' | 'playing' | 'paused' | 'victory' | 'defeat';

export interface SiegeState extends SkillStates {
  phase: SiegePhase; map: TileGrid; mapName: MapName;
  /** Primary player tank (backward compat). Use playerTanks[activePlayerIndex] for current. */
  player: TankEntity;
  /** All player tanks when multi-tank mode is active */
  playerTanks: TankEntity[];
  /** Index into playerTanks for the currently controlled tank */
  activePlayerIndex: number;
  enemies: TankEntity[]; bullets: BulletEntity[];
  aiContexts: Map<string, AIContext>; inventory: Inventory;
  elapsedTime: number; wavesSpawned: number; enemiesKilled: number;
  commandCenterHp: number; playerCooldownRemaining: number;
  pendingReward: BattleReward | null;
  skillMessage: string; skillMessageTime: number;
  particles: Particle[]; screenShake: number;
  physicsBlocks: PhysicsBlock[]; showDebug: boolean; frictionMul: number;
  fireZones: FireZone[]; allies: AllyTank[]; clones: CloneEntity[];
  turrets: TurretEntity[]; planes: Plane[]; damageNumbers: DamageNumber[];
  waveAnnouncement: string; waveAnnouncementTime: number;
  comboTimer: number; comboText: string; comboColor: string; comboMultiplier: number;
  killStreak: number; killStreakTimer: number; maxMultiplier: number;
  activeModifiers: WaveModifier[];
}
