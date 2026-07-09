// Centralized skill registry — activation + effect handling for all game modes
import { TankEntity, takeDamage } from '../entities/Tank';
import { Input } from '../core/Input';
import { Vec2 } from '../utils/Vector';
import { MAP_W, MAP_H, MAP_COLS, MAP_ROWS, CELL_SIZE, TileType } from '../utils/Grid';
import { createPlanes, createTurret, createAllyTank, createClone } from '../entities/Ally';
import { spawnParticles } from '../entities/Particle';
import { spawnDamageNumber } from '../entities/DamageNumber';
import { hasSynergy } from './Synergy';
import { playRepair, playSprint, playBarrage, playSmoke } from './Sound';
import { playQuote } from './QuotePlayer';

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

  commander_dragon: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 80000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '🐉 叶公好龙！' };
  },

  commander_genesis: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 100000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '✨ 要有光！' };
  },

  commander_thor: (tank, now) => {
    const cd = tank.config.commander.stats.skillCdMs ?? 100000;
    tank.skillCooldownUntil = now + cd;
    return { success: true, message: '⚡ Mjolnir!' };
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

/** Shared skill activation — sets skill phases/creates entities. All modes use this. */
export function handleSkillActivation(state: any, input: Input): void {
  const result = activateSkill(state.player);
  state.skillMessage = result.message;
  state.skillMessageTime = 2000;
  if (!result.success) return;
  const id = state.player.config.commander.id;
  if (id === 'commander_repair') {
    state.particles.push(...spawnParticles(state.player.pos, 'repair', 10, 50)); playRepair();
  } else if (id === 'commander_sprint') {
    state.particles.push(...spawnParticles(state.player.pos, 'sprint', 6, 40)); playSprint();
  } else if (id === 'commander_barrage') {
    state.particles.push(...spawnParticles(state.player.pos, 'barrage', 6, 40)); playBarrage();
  } else if (id === 'commander_smoke') {
    state.particles.push(...spawnParticles(state.player.pos, 'smoke', 12, 30)); playSmoke();
  } else if (id === 'commander_colonel') {
    state.planes.push(...createPlanes(state.player.pos, state.player.turretAngle, MAP_W, MAP_H));
    if (hasSynergy(state.player.config, 'precision_strike')) {
      state.planes.push(...createPlanes(state.player.pos, state.player.turretAngle + Math.PI / 2, MAP_W, MAP_H));
      state.skillMessage = '精确打击! 双航线轰炸';
    }
  } else if (id === 'commander_engineer') {
    const turret = createTurret(state.player.pos);
    if (hasSynergy(state.player.config, 'mobile_fortress')) {
      turret.hp = Math.round(turret.hp * 1.5); turret.maxHp = turret.hp;
      turret.fireRange = Math.round(turret.fireRange * 1.3);
    }
    state.turrets.push(turret);
  } else if (id === 'commander_wizard') {
    const deadEnemies = state.enemies.filter((e: any) => !e.alive);
    if (deadEnemies.length > 0) {
      let count = 0;
      for (const dead of deadEnemies.slice(0, 3)) {
        const ally = createAllyTank(`ally_${Date.now()}_${count}`, dead.pos, dead.config, 'guard_player');
        const ctx = state.aiContexts.get(dead.id);
        if (ctx) { ally.followRadius = ctx.fireRadius; ally.visionRadius = ctx.visionRadius; }
        state.allies.push(ally);
        count++;
      }
      state.skillMessage = `复活了${count}辆`;
    } else state.skillMessage = '没有可复活的敌军';
  } else if (id === 'commander_ninja') {
    const hasSyn = hasSynergy(state.player.config, 'shadow_clones');
    state.clones.push(createClone(state.player, Math.PI / 2, 10000));
    state.clones.push(createClone(state.player, -Math.PI / 2, 10000));
    if (hasSyn) { state.clones.push(createClone(state.player, 0, 10000)); state.clones.push(createClone(state.player, Math.PI, 10000)); }
    state.skillMessage = hasSyn ? '影分身之术·四重!' : '影分身之术!';
  } else if (id === 'commander_gravity') {
    state.gravityPos = input.mousePos; state.gravityTimer = 3;
  } else if (id === 'commander_time') {
    state.slowMoTimer = 3; state.timeSlowTimer = 3;
  } else if (id === 'commander_lightning') {
    const aliveEnemies = state.enemies.filter((e: any) => e.alive); const branches: Vec2[][] = []; const hit: Set<string> = new Set();
    for (let b = 0; b < 5; b++) {
      let nearest: any = null; let nearestDist = 600;
      for (const e of aliveEnemies) { if (hit.has(e.id)) continue; const d = e.pos.dist(state.player.pos); if (d < nearestDist) { nearestDist = d; nearest = e; } }
      if (!nearest) break; hit.add(nearest.id);
      takeDamage(nearest, 100, state.player); state.damageNumbers.push(spawnDamageNumber(nearest.pos, 100, true)); state.particles.push(...spawnParticles(nearest.pos, 'hit', 8, 80));
      const dx = nearest.pos.x-state.player.pos.x, dy = nearest.pos.y-state.player.pos.y;
      branches.push([state.player.pos, new Vec2(state.player.pos.x+dx*0.5+dy*0.15, state.player.pos.y+dy*0.5-dx*0.15), nearest.pos]);
    }
    state.lightningBranches = branches; state.lightningTimer = 1.5;
    if (hasSynergy(state.player.config, 'shadow_clones')) { state.clones.push(createClone(state.player, 0, 10000)); state.clones.push(createClone(state.player, Math.PI, 10000)); state.skillMessage = '⚡影分身!'; }
  } else if (id === 'commander_restore') {
    let count = 0;
    for (let gy = 0; gy < MAP_ROWS; gy++) for (let gx = 0; gx < MAP_COLS; gx++) {
      const tile = state.map[gy][gx];
      if (tile && tile.type === TileType.BRICK && tile.hp <= 0 && Math.hypot(gx*CELL_SIZE+CELL_SIZE/2-state.player.pos.x, gy*CELL_SIZE+CELL_SIZE/2-state.player.pos.y) < 150) { state.map[gy][gx] = { type: TileType.BRICK, hp: 500 }; count++; }
    }
    state.restoreTimer = 3; state.skillMessage = `恢复了${count}块砖墙`;
  } else if (id === 'commander_trisolaran') {
    state.meteorPhase = 'targeting'; state.meteorTimer = 2.0; state.meteorTarget = input.mousePos;
    state.meteorPos = new Vec2(-200, -200); state.meteorVel = 200; state.meteorFlashAlpha = 0;
    state.skillMessage = '☄️ 陨石锁定中…';
  } else if (id === 'commander_bivector') {
    state.bivectorPhase = 'compressing'; state.bivectorTimer = 12; state.bivectorProgress = 0;
    state.bivectorShear = 0; state.bivectorScale = 1; state.bivectorWhiteAlpha = 0;
    state.bivectorDestroyed = false; state.bivectorText = ''; state.bivectorTextColor = '#000';
    state.skillMessage = '📐 二向箔展开！';
  } else if (id === 'commander_quantum') {
    state.quantumPhase = 'superposing'; state.quantumTimer = 5;
    state.quantumRedAlpha = 0; state.quantumBlueAlpha = 0; state.quantumDestroyed = false;
    state.skillMessage = '🐱 叠加态展开！';
  } else if (id === 'commander_lens') {
    state.lensPhase = 'forming'; state.lensTimer = 2; state.lensTarget = input.mousePos;
    state.lensStrength = 0; state.lensRadius = 0;
    state.skillMessage = '🌀 引力透镜展开！';
  } else if (id === 'commander_poincare') {
    state.rewindPhase = 'rewinding'; state.rewindTimer = 5;
    state.rewindBlueAlpha = 0; state.rewindReversed = false;
    state.skillMessage = '⏪ 时间倒流！';
  } else if (id === 'commander_bigbang') {
    state.bigbangPhase = 'imploding'; state.bigbangTimer = 3;
    state.bigbangScale = 1; state.bigbangWhiteAlpha = 0;
    state.skillMessage = '💥 宇宙坍缩！';
  } else if (id === 'commander_holo') {
    state.holoPhase = 'projecting'; state.holoTimer = 3;
    state.holoRotation = 0; state.holoRadius = 0; state.holoCracks = 0;
    state.skillMessage = '🌐 全息投影！';
  } else if (id === 'commander_trojan') {
    state.trojanPhase = 'entering'; state.trojanTimer = 2;
    state.trojanX = -120; state.trojanDoor = 0; state.trojanSpawned = 0;
    state.skillMessage = '🏛️ 木马计！';
  } else if (id === 'commander_noah') {
    state.arkPhase = 'raining'; state.arkTimer = 9.5; state.arkWaterH = 0;
    state.arkLightningBranches = []; state.arkLightningTimer = 1;
    const nq = [['你和你的全家都要进入方舟，','因为在这世代中，我见你在我面前是义人。'],['再过七天，我要降雨在地上四十昼夜，','把我所造的各种活物，都从地上除灭。'],['水势比山高过十五肘，山岭都淹没了。','凡在地上有血肉的动物，就是飞鸟牲畜走兽','和爬在地上的昆虫，以及所有的人，都死了。'],['Noah was a righteous man,','blameless in his generation,','Noah walked with God.'],['我把虹放在云彩中，','这就可作我与地立约的记号了。'],['凡流人血的，他的血也必被人所流，','因为神造人，是照自己的形像造的。']];
    playQuote(nq[Math.floor(Math.random() * nq.length)]);
    state.skillMessage = '🌊 大洪水！';
  } else if (id === 'commander_damocles') {
    state.damoclesPhase = 'hovering'; state.damoclesTimer = 4.7;
    const dq = [['你看见我的幸运了吗？','这把利剑时时刻刻悬在我的头顶，','世人所见的王权荣华，不过是浮于表面的幻象。','身居高位者，永远活在随时坠落的恐惧之中。'],['终日活在死亡威胁下的人，','不可能拥有真正的幸福；','权力越大，头顶悬剑越锋利。'],['Damocles neither dared to look at the servants','nor touch the feast, and begged instantly to depart,','for he had no wish for such good fortune.','What clearer proof that constant fear destroys all happiness?']];
    playQuote(dq[Math.floor(Math.random() * dq.length)]);
    state.skillMessage = '⚔️ 达摩克利斯之剑！';
  } else if (id === 'commander_dragon') {
    state.dragonPhase = 'entering'; state.dragonTimer = 2;
    state.dragonX = MAP_W + 200; state.dragonY = MAP_H * 0.4; state.dragonReveal = 0;
    state.skillMessage = '🐉 叶公好龙！';
  } else if (id === 'commander_genesis') {
    state.genesisPhase = 'darkening'; state.genesisTimer = 0;
    state.genesisFireRadius = 0; state.genesisCleared = false;
    state.skillMessage = '✨ 要有光！';
  } else if (id === 'commander_thor') {
    state.mjolnirPhase = 'entering'; state.mjolnirTimer = 0;
    state.mjolnirPos = new Vec2(-100, -100); state.mjolnirVel = new Vec2(0, 0);
    state.mjolnirAngle = 0; state.mjolnirHoverBounce = 0;
    state.mjolnirLightningTimer = 0.2; state.mjolnirLightningBranches = [];
    state.mjolnirThorStartTime = -1;
    state.skillMessage = '⚡ Mjolnir!';
  }
}
