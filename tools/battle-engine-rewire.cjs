const fs = require('fs');
let src = fs.readFileSync('src/modes/Siege.ts', 'utf8');

// Find updateSiege function body
const startMarker = 'export function updateSiege(';
const endMarker = '\nfunction endSiege(';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) { console.log('Markers not found'); process.exit(1); }

// Find the opening brace of the function body
const bodyStart = src.indexOf('): void {', startIdx);
const bodyStartEnd = src.indexOf('\n', bodyStart) + 1;

// Build new body
const newBody = `): void {
  if (state.phase === 'victory' || state.phase === 'defeat') return;
  if (state.phase === 'paused') return;
  if (state.phase === 'intro') {
    if (input.isConfirmPressed() || input.isFirePressed()) {
      state.phase = 'playing';
      state.playerCooldownRemaining = 200;
    }
    return;
  }

  state.elapsedTime += dt;

  // O-key: spawn boss
  if (input.wasJustPressed('KeyO')) {
    const bossConfig = assembleTank(
      MVP_BARRELS.find(p => p.id === 'barrel_gatling')!,
      MVP_TURRETS.find(p => p.id === 'turret_heavy')!,
      MVP_CHASSIS.find(p => p.id === 'chassis_heavy')!,
    );
    const spit = gridToPixel(Math.floor(MAP_COLS/2), 2);
    const boss = createTank(\`boss_\${Date.now()}\`, spit, bossConfig, false);
    boss.hp = boss.maxHp * 2; boss.maxHp = boss.hp;
    state.enemies.push(boss);
    state.aiContexts.set(boss.id, createAIContext(boss, gridToPixel(Math.floor(MAP_COLS/2), Math.floor(MAP_ROWS/2)), 330, 150));
    state.waveAnnouncement = '⚠ WARNING! WARNING! ⚠';
    state.waveAnnouncementTime = 2.5;
  }

  // === Generic battle pipeline ===
  // Player movement + fire
  handlePlayerInput(state, input, dt);
  handlePlayerFire(state, input, dt);
  // Terrain effects
  applyTerrainEffects(state.player, state.map);
  for (const enemy of state.enemies) applyTerrainEffects(enemy, state.map);
  // Enemy + Ally AI
  handleEnemyAI(state, dt);
  handleAllies(state, dt);
  handleTurrets(state, dt);
  handlePlanes(state, dt);
  handleClones(state, dt);
  // Physics blocks
  handlePhysicsBlocks(state, dt);
  // Fire zones
  handleFireZones(state, dt);

  // === Shared battle engine (all skills, bullets, particles, collision, timers) ===
  updateBattle(state as any, input, dt);

  // === Siege-specific ===
  // Check time limit
  if (state.elapsedTime >= MATCH_DURATION) { endSiege(state, true); return; }
  // Spawn waves
  spawnWaves(state);
  // Auto-advance waves if all dead
  const noAliveEnemies = state.enemies.every(e => !e.alive);
  if (noAliveEnemies && state.wavesSpawned < TOTAL_WAVES && state.wavesSpawned > 0) {
    const nextWave = WAVES[state.wavesSpawned];
    if (nextWave && state.elapsedTime < nextWave.timeStart) state.elapsedTime = nextWave.timeStart;
  }
  // Wave announcement timer
  state.waveAnnouncementTime -= dt;
  // Combo timer + kill streak decay
  state.comboTimer -= dt;
  state.killStreakTimer -= dt;
  if (state.killStreakTimer <= 0) state.killStreak = 0;
  // CC auto-attack
  handleCCAttack(state, dt);
  // Check CC destroyed
  if (!DEV_MODE && state.commandCenterHp <= 0) { endSiege(state, false); return; }
  // Skill message handled by BattleEngine

function endSiege(`;

src = src.slice(0, bodyStart) + newBody + src.slice(endIdx + endMarker.length);
fs.writeFileSync('src/modes/Siege.ts', src);
console.log('Siege.ts rewired. Size: ' + src.split('\\n').length + ' lines');
