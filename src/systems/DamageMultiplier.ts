// ============================================================
// Environmental kill multiplier system
// ============================================================

export interface KillContext {
  sourceType: 'direct' | 'bounce' | 'block' | 'domino' | 'bounce_chain';
  bounceCount: number;
  chainLength: number;
  multiplier: number;
  label: string;
  color: string;
}

export function calcKillMultiplier(
  source: 'bullet' | 'block',
  bounceCount: number,
  chainLength: number,
): KillContext {
  if (source === 'bullet') {
    if (bounceCount >= 1) {
      // Bullet bounced off wall(s) — bounce kill
      return {
        sourceType: 'bounce', bounceCount, chainLength: 0,
        multiplier: 1.5,
        label: bounceCount >= 2 ? `TRICK SHOT x1.5` : 'BOUNCE x1.5',
        color: '#4a9eff',
      };
    }
    return {
      sourceType: 'direct', bounceCount: 0, chainLength: 0,
      multiplier: 1.0, label: '', color: '#ffffff',
    };
  }

  // Block kill
  if (chainLength >= 2) {
    // Multi-hop domino chain
    return {
      sourceType: 'domino', bounceCount: 0, chainLength,
      multiplier: 3.0,
      label: `DOMINO x3!`,
      color: '#ffaa00',
    };
  }
  if (chainLength >= 1) {
    return {
      sourceType: 'block', bounceCount: 0, chainLength,
      multiplier: 2.0,
      label: 'BLOCK SMASH x2',
      color: '#ff6600',
    };
  }
  return {
    sourceType: 'block', bounceCount: 0, chainLength: 0,
    multiplier: 2.0,
    label: 'BLOCK SMASH x2',
    color: '#ff6600',
  };
}

/** Super combo: bounce bullet triggered a domino chain */
export function calcBounceChainMultiplier(bounceCount: number, chainLength: number): KillContext {
  return {
    sourceType: 'bounce_chain', bounceCount, chainLength,
    multiplier: 5.0,
    label: '🔥 CHAIN KILL x5! 🔥',
    color: '#ff4444',
  };
}
