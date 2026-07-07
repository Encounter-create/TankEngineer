const fs = require('fs');
let src = fs.readFileSync('src/modes/Siege.ts', 'utf8');

// Add re-exports at the end of imports (after all existing imports)
const importEnd = src.lastIndexOf('import ');
const importLineEnd = src.indexOf('\n', importEnd);
let importsBlock = src.slice(0, importLineEnd + 1);

const reexports = `
// Skill module re-exports
export { updateMeteor } from '../skills/Trisolaran';
export { updateBivector, BIVECTOR_POEMS } from '../skills/Bivector';
export { updateQuantum } from '../skills/Quantum';
export { updateLens } from '../skills/Lens';
export { updateRewind } from '../skills/Poincare';
export { updateBigBang } from '../skills/BigBang';
export { updateHolo } from '../skills/Holo';
export { updateTrojan, drawTrojanHorse } from '../skills/Trojan';
export { updateArk, drawArk, drawArkWater } from '../skills/Noah';
export { updateDamocles, drawDamoclesSwords } from '../skills/Damocles';
`;

src = importsBlock + reexports + src.slice(importLineEnd + 1);

// Remove the original function bodies (but keep the 'export function' signature line)
// Actually, just remove entire functions that are now in skill files
const toRemove = [
  'updateMeteor', 'updateBivector', 'BIVECTOR_POEMS', 'updateQuantum',
  'updateLens', 'updateRewind', 'updateBigBang', 'updateHolo',
  'updateTrojan', 'drawTrojanHorse', 'updateArk', 'drawArk', 'drawArkWater',
  'updateDamocles', 'drawDamoclesSwords', 'getDamoclesDescend',
  'handleCCBulletDeath'
];

toRemove.forEach(fn => {
  const re = new RegExp('(?:export )?function ' + fn + '\\b');
  const idx = src.search(re);
  if (idx === -1) {
    // Check for const
    const constRe = new RegExp('const ' + fn);
    const cIdx = src.search(constRe);
    if (cIdx >= 0) {
      let i = src.indexOf(';', cIdx);
      src = src.slice(0, cIdx) + src.slice(i + 1);
    }
    return;
  }
  // Skip if it's inside the re-export block we just added
  let depth = 0, i = src.indexOf('{', idx);
  if (i === -1) return;
  depth = 1; i++;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  // Remove including trailing whitespace
  let end = i;
  while (end < src.length && src[end] === '\n') end++;
  src = src.slice(0, idx) + src.slice(end);
});

// Remove BIVECTOR_POEMS const
const poemsIdx = src.indexOf('const BIVECTOR_POEMS');
if (poemsIdx >= 0) {
  let i = src.indexOf(';', poemsIdx);
  src = src.slice(0, poemsIdx) + src.slice(i + 1);
}

fs.writeFileSync('src/modes/Siege.ts', src);
console.log('Siege.ts rewired. New size: ' + src.split('\n').length + ' lines');
