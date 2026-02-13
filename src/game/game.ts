import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { runtimeState } from './types';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0e1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, GameScene]
};

export const game = new Phaser.Game(config);

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'f') {
    return;
  }

  const scaleManager = game.scale;
  if (scaleManager.isFullscreen) {
    scaleManager.stopFullscreen();
    return;
  }
  scaleManager.startFullscreen();
});

window.render_game_to_text = () => {
  const payload = {
    coordinateSystem: {
      origin: 'top-left',
      axis: 'x:right,y:down'
    },
    mode: runtimeState.mode,
    elapsedMs: runtimeState.elapsedMs,
    trackingStatus: runtimeState.trackingStatus
  };
  return JSON.stringify(payload);
};

window.advanceTime = (ms: number) => {
  const scene = game.scene.getScene('game') as GameScene;
  if (!scene || !scene.scene.isActive()) {
    return;
  }

  scene.advanceBy(ms);
};

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}
