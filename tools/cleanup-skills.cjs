const fs = require('fs');

const files = fs.readdirSync('src/skills').filter(f => f.endsWith('.ts'));
files.forEach(f => {
  let content = fs.readFileSync('src/skills/' + f, 'utf8');
  // Remove unused import lines by finding what's actually used
  const usedTypes = new Set();
  const typeRe = /\b([A-Z][a-zA-Z0-9]+)\b/g;
  let m;
  const bodyStart = content.indexOf('export function');
  const body = bodyStart >= 0 ? content.slice(bodyStart) : content;
  while ((m = typeRe.exec(body)) !== null) {
    usedTypes.add(m[1]);
  }
  // Keep only used imports
  const lines = content.split('\n');
  const newLines = [];
  for (const line of lines) {
    if (line.startsWith('import {')) {
      // Check each imported name
      const names = line.match(/\b([A-Z][a-zA-Z0-9]+)\b/g) || [];
      const used = names.filter(n => usedTypes.has(n));
      if (used.length > 0 || line.includes('SiegeState') || line.includes('Vec2') || line.includes('MAP_')) {
        // Keep: it's type-only or has used exports
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }
  fs.writeFileSync('src/skills/' + f, newLines.join('\n'));
  console.log(f + ': ' + newLines.length + ' lines (was ' + lines.length + ')');
});
console.log('Done cleaning imports');
