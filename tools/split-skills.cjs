const fs = require('fs');
const src = fs.readFileSync('src/modes/Siege.ts', 'utf8');

const skills = [
  ['Damocles', ['updateDamocles', 'drawDamoclesSwords', 'getDamoclesDescend']],
  ['Quantum', ['updateQuantum']],
  ['Poincare', ['updateRewind']],
  ['BigBang', ['updateBigBang']],
  ['Holo', ['updateHolo']],
  ['Trisolaran', ['updateMeteor']],
  ['Bivector', ['updateBivector']],
  ['Lens', ['updateLens']],
  ['Trojan', ['updateTrojan', 'drawTrojanHorse']],
  ['Noah', ['updateArk', 'drawArk', 'drawArkWater']],
];

const header = `import { SiegeState } from '../types/SiegeState';
import { TankEntity, takeDamage, TANK_RADIUS, getBerserkerMultiplier } from '../entities/Tank';
import { TankConfig, effectiveSpeed, effectiveCooldown, assembleTank, MVP_BARRELS, MVP_TURRETS, MVP_CHASSIS, DEFAULT_COMMANDER } from '../entities/Parts';
import { BulletEntity, createBullet, FIREWORK_MAX_LIFE, FIREWORK_INTERVAL, FIREWORK_CHILD_COUNT, BULLET_RADIUS } from '../entities/Bullet';
import { FireZone, createFireZone, updateFireZone } from '../entities/FireZone';
import { Particle, spawnParticles, spawnExplosion, updateParticles } from '../entities/Particle';
import { DamageNumber, spawnDamageNumber, updateDamageNumbers } from '../entities/DamageNumber';
import { PhysicsBlock, createPhysicsBlock, updatePhysicsBlock, BLOCK_RADIUS } from '../entities/PhysicsBlock';
import { AllyTank, CloneEntity, TurretEntity, Plane, createAllyTank, createTurret, createPlanes, createClone } from '../entities/Ally';
import { TileType, CELL_SIZE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H, gridToPixel, pixelToGrid, inBounds } from '../utils/Grid';
import { Vec2 } from '../utils/Vector';
import { hasSynergy } from '../systems/Synergy';
import { AIContext, createAIContext } from '../ai/EnemyAI';
import { moveTank } from '../core/Physics';
import { playExplosion } from '../systems/Sound';
`;

skills.forEach(([name, funcs]) => {
  let extracted = '';
  funcs.forEach(fn => {
    const idx = src.search(new RegExp('(?:export )?function ' + fn + '\\b'));
    if (idx === -1) { console.log('NOT FOUND:', fn); return; }
    let depth = 0, i = src.indexOf('{', idx);
    if (i === -1) return;
    depth = 1; i++;
    while (depth > 0 && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    extracted += src.slice(idx, i) + '\n\n';
  });
  const content = header + '\n' + extracted;
  fs.writeFileSync('src/skills/' + name + '.ts', content);
  console.log(name + ': ' + content.split('\n').length + ' lines');
});

// Also extract the BIVECTOR_POEMS constant
const poemsIdx = src.indexOf('const BIVECTOR_POEMS');
if (poemsIdx >= 0) {
  let i = src.indexOf(';', poemsIdx);
  let bc = fs.readFileSync('src/skills/Bivector.ts', 'utf8');
  bc = bc.replace('// Code moved from Siege.ts', '// Code moved from Siege.ts\n' + src.slice(poemsIdx, i + 1));
  fs.writeFileSync('src/skills/Bivector.ts', bc);
}

// Extract CC attack helper (used by CC green fire zone)
const ccDeathIdx = src.indexOf('function handleCCBulletDeath');
if (ccDeathIdx >= 0) {
  let depth = 0, i = src.indexOf('{', ccDeathIdx);
  depth = 1; i++;
  while (depth > 0 && i < src.length) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
  let cc = 'import { SiegeState } from "../types/SiegeState";\nimport { Vec2 } from "../utils/Vector";\nimport { createFireZone } from "../entities/FireZone";\nimport { spawnParticles, spawnExplosion } from "../entities/Particle";\nimport { takeDamage } from "../entities/Tank";\n\n' + src.slice(ccDeathIdx, i);
  fs.writeFileSync('src/skills/CCAttack.ts', cc);
  console.log('CCAttack: ' + cc.split('\n').length + ' lines');
}

console.log('\nDone!');
