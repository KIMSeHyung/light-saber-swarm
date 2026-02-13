import Phaser from 'phaser';
import { runtimeState } from '../game/types';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover');
  }

  create(): void {
    const { width, height } = this.scale;

    runtimeState.mode = 'gameover';

    this.add
      .text(width * 0.5, height * 0.42, 'GAME OVER', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '56px',
        color: '#ffe3ed'
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.54, `Final Score: ${runtimeState.score}`, {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '28px',
        color: '#f6f6ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.64, 'Press R to Restart', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '22px',
        color: '#97ebff'
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-R', () => {
      this.scene.start('menu');
    });
  }
}
