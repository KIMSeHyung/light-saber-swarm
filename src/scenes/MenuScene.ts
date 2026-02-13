import Phaser from 'phaser';
import { runtimeState } from '../game/types';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { width, height } = this.scale;

    runtimeState.mode = 'menu';
    runtimeState.elapsedMs = 0;

    this.add
      .text(width * 0.5, height * 0.38, 'LIGHT SABER SWARM', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '52px',
        color: '#f6f6ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.52, 'Press ENTER to Start', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '26px',
        color: '#97ebff'
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.62, 'Press F to Toggle Fullscreen', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '18px',
        color: '#d1d4e6'
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => {
      this.scene.start('game');
    });
  }
}
