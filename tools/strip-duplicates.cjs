const fs = require('fs');
let src = fs.readFileSync('src/modes/Siege.ts', 'utf8');

// Functions to remove (now re-exported from skill files)
const funcs = [
  'updateMeteor', 'updateBivector', 'BIVECTOR_POEMS', 'updateQuantum',
  'updateLens', 'updateRewind', 'updateBigBang', 'updateHolo',
  'updateTrojan', 'drawTrojanHorse', 'updateArk', 'drawArk', 'drawArkWater',
  'updateDamocles', 'drawDamoclesSwords', 'getDamoclesDescend',
  'handleCCBulletDeath'
];

funcs.forEach(fn => {
  // Match 'export function fn' or 'function fn' or 'const fn'
  let re = new RegExp('(?:export )?function ' + fn + '\\b');
  let match = src.match(re);
  if (!match) {
    // Try const
    re = new RegExp('const ' + fn + '\\b');
    match = src.match(re);
    if (match) {
      let i = src.indexOf(';', match.index);
      while (i < src.length && src[i] === '\n') i++;
      src = src.slice(0, match.index) + src.slice(i);
      console.log('Removed const: ' + fn);
    } else {
      console.log('Not found: ' + fn);
    }
    return;
  }
  let idx = match.index;
  let depth = 0, i = src.indexOf('{', idx);
  if (i === -1) return;
  depth = 1; i++;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  // Remove function + following blank lines
  while (i < src.length && src[i] === '\n') i++;
  src = src.slice(0, idx) + src.slice(i);
  console.log('Removed: ' + fn);
});

fs.writeFileSync('src/modes/Siege.ts', src);
console.log('\nNew Siege.ts size: ' + src.split('\n').length + ' lines');
