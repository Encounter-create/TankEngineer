// Music player — random playlist per category, auto-next on end

const VOLUME = 0.3;

// Edit these arrays when adding new music files
const MENU_TRACKS   = [
  '/assets/menu/menu.mp3',
  '/assets/menu/soviet_march.mp3',
  '/assets/menu/phantom_opera.mp3',
];
const BATTLE_TRACKS = [
  '/battle/battle.mp3',
  '/battle/british_grenadiers.mp3',
  '/battle/rush_e.mp3',
  '/battle/piano_grassland.mp3',
  '/battle/hammer_of_justice.mp3',
];

function pickTrack(category: 'menu' | 'battle', exclude: string): string {
  const tracks = category === 'menu' ? MENU_TRACKS : BATTLE_TRACKS;
  if (tracks.length === 1) return tracks[0];
  let pick: string;
  do { pick = tracks[Math.floor(Math.random() * tracks.length)]; } while (pick === exclude && tracks.length > 1);
  return pick;
}

function createMusicPlayer(category: 'menu' | 'battle'): { play(): void; stop(): void; isPaused(): boolean } {
  let audio: HTMLAudioElement | null = null;
  let lastTrack = '';
  return {
    play() {
      if (audio && !audio.paused) return;
      if (audio) { audio.pause(); audio = null; }
      lastTrack = pickTrack(category, lastTrack);
      audio = new Audio(lastTrack);
      audio.volume = VOLUME;
      audio.onended = () => { this.play(); };
      audio.play().catch(() => {});
    },
    stop() { if (audio) { audio.pause(); audio.currentTime = 0; audio = null; } },
    isPaused() { return !audio || audio.paused; },
  };
}

const menuPlayer = createMusicPlayer('menu');
const battlePlayer = createMusicPlayer('battle');

export function setVolume(_v: number): void { /* no-op for now */ }

export function startMenuMusic(): void {
  if (!menuPlayer.isPaused()) return;
  battlePlayer.stop();
  menuPlayer.play();
}

export function stopMenuMusic(): void {
  menuPlayer.stop();
}

export function startBattleMusic(): void {
  if (!battlePlayer.isPaused()) return;
  menuPlayer.stop();
  battlePlayer.play();
}

export function stopBattleMusic(): void {
  battlePlayer.stop();
}
