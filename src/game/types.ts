export type GameMode = 'menu' | 'ingame' | 'gameover';

export type RuntimeState = {
  mode: GameMode;
  score: number;
  hp: number;
  elapsedMs: number;
  trackingStatus:
    | 'idle'
    | 'initializing'
    | 'tracking'
    | 'no-hand'
    | 'permission-denied'
    | 'error';
};

export const runtimeState: RuntimeState = {
  mode: 'menu',
  score: 0,
  hp: 100,
  elapsedMs: 0,
  trackingStatus: 'idle'
};
