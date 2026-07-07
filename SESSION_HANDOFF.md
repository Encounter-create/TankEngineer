# Session Handoff — 2026-07-08

## Current State

This project is a Canvas 2D tank battle game with 22 commanders (9 new this session). All code compiles clean (`npx tsc --noEmit` passes).

## What We Built This Session

### 8 Brainhole Skills (all live in `src/modes/Siege.ts`)

| Commander | Skill | Visual Tech | Phase |
|-----------|-------|-------------|-------|
| 三体人 | Meteor Strike | Fireball accelerate, screen flash, crosshair | done |
| 歌者 | Bivector Foil | Canvas `ctx.transform` shear+scale | done |
| 薛定谔 | Quantum Cat | Red/blue double exposure, cat sprite animation | done |
| 爱因斯坦 | Spacetime Lens | Pixel displacement (`getImageData` at 1/3 res) | done |
| 庞加莱 | Poincaré Recurrence | Velocity reversal + anti-friction boost | done |
| 奇点 | Big Bang | `ctx.scale` implosion → explosion + shockwave | done |
| 投影者 | Holographic Universe | Sphere projection (circle clip + shading + grid lines) | done |
| 奥德修斯 | Trojan Horse | Horse sprite (ellipse body + neck + legs + wheels) + allies | done |
| 诺亚 | Noah's Ark | Triple wave layer fill + sticky surface + lightning | **in progress** |

### System Improvements
- Encyclopedia scroll UI + text wrapping
- Garage scroll UI + wheel input
- Practice mode shares ALL Siege handlers (zero duplication)
- Ally tank design finalized: `isPlayer:false, isAlly:true`, blue color, guard_player AI

### Noah's Ark Current Issues
1. Blocks don't disappear when swept off-screen during receding
2. Player tank can still move below water surface
3. Water timing: 11s rise → 1s peak → 11s fall (23s total)

## Architecture Rules (from memory)

1. **Practice = Siege**: All skills/weapons only in Siege, Practice calls same handlers
2. **New mode = Siege - CC + diff**: Siege minus Command Center is the base framework
3. **Subtract, don't add**: Identify existing wheels → copy → subtract what you don't need → add new
4. Export `update*` and `draw*` functions from Siege.ts for reuse

## Key Files
- `src/modes/Siege.ts` (~2200 lines) — All skill update functions + handlers + drawing
- `src/systems/Practice.ts` (~600 lines) — Mirrors SiegeState fields, calls Siege handlers
- `src/main.ts` (~900 lines) — Global rendering (bivector transform, lens, water, horse, etc.)
- `src/entities/Ally.ts` — CloneEntity, TurretEntity, AllyTank, Plane types
- `src/ui/Encyclopedia.ts` — Scrollable part cards with text wrapping

## Next Steps (if continuing Noah's Ark)
1. Fix blocks not disappearing off-map during flood receding
2. Prevent player from going below water surface
3. Test the sticky-surface mechanic end-to-end
