// ============================================================
// Procedural sound effects via Web Audio API
// No external files needed
// ============================================================

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

/** Global SFX volume (0-1). Sets master gain. */
export function setSfxVolume(v: number): void {
  if (!audioCtx) ctx();
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

/** Resume audio context after user interaction (browser policy) */
export function initSound(): void {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ============================================================
// Sound generators
// ============================================================

/** Short blip — player shoot */
export function playShoot(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** Metallic clang — bullet hit tank */
export function playHitTank(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.06);
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.12);
}

/** Dull thud — bullet hit wall */
export function playHitWall(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** Low boom — tank explosion */
export function playExplosion(): void {
  const c = ctx();
  const t = c.currentTime;
  // Low rumble
  const osc1 = c.createOscillator();
  const g1 = c.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(80, t);
  osc1.frequency.exponentialRampToValueAtTime(30, t + 0.4);
  g1.gain.setValueAtTime(0.2, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc1.connect(g1).connect(masterGain!);
  osc1.start(t);
  osc1.stop(t + 0.5);
  // Noise burst
  const osc2 = c.createOscillator();
  const g2 = c.createGain();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(200, t);
  osc2.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  g2.gain.setValueAtTime(0.08, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc2.connect(g2).connect(masterGain!);
  osc2.start(t);
  osc2.stop(t + 0.35);
}

/** Healing chime — repair skill */
export function playRepair(): void {
  const c = ctx();
  const t = c.currentTime;
  [523, 659, 784].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.08);
    gain.gain.setValueAtTime(0.1, t + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
    osc.connect(gain).connect(masterGain!);
    osc.start(t + i * 0.08);
    osc.stop(t + i * 0.08 + 0.2);
  });
}

/** Whoosh — sprint skill */
export function playSprint(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.35);
}

/** Rapid fire — barrage skill */
export function playBarrage(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.2);
}

/** Puff — smoke skill */
export function playSmoke(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.setValueAtTime(0.08, t + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.6);
}

/** Click — UI button */
export function playClick(): void {
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, t);
  gain.gain.setValueAtTime(0.04, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  osc.connect(gain).connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.03);
}
