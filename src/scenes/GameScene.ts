import Phaser from 'phaser';
import { runtimeState } from '../game/types';
import { HandTracker, type HandPoint, type TrackedHand } from '../tracking/handTracker';

const BLADE_COUNT = 56;

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17]
];

type BladeAgent = {
  sprite: Phaser.GameObjects.Triangle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  baseRadius: number;
  angularVelocity: number;
  bobOffset: number;
  noisePhase: number;
};

type SwarmGesture =
  | 'none'
  | 'open'
  | 'fist'
  | 'pinch'
  | 'v-split'
  | 'twirl'
  | 'throw-left'
  | 'throw-right';

type HandControlInput = {
  moveAnchor: { x: number; y: number } | null;
  gestureLandmarks: HandPoint[];
  overlayHands: HandPoint[][];
  dualHand: boolean;
  handSeparation: number;
};

export class GameScene extends Phaser.Scene {
  private hudText?: Phaser.GameObjects.Text;
  private blades: BladeAgent[] = [];
  private anchor = new Phaser.Math.Vector2(640, 360);
  private readonly bladeColor = 0x9be7ff;
  private handTracker = new HandTracker();
  private handOverlay?: Phaser.GameObjects.Graphics;
  private spreadFactor = 0.45;
  private burstEnergy = 0;
  private handSpeed = 0;
  private anchorVelocity = new Phaser.Math.Vector2(0, 0);
  private lastAnchorSample: Phaser.Math.Vector2 | null = null;
  private driftTime = 0;
  private gesture: SwarmGesture = 'none';
  private pinchCooldownSec = 0;
  private throwCooldownSec = 0;
  private throwEnergy = 0;
  private throwDirectionX = 0;
  private twirlEnergy = 0;
  private twirlDirection = 1;
  private splitEnergy = 0;
  private splitDirA = new Phaser.Math.Vector2(0.7, -0.2).normalize();
  private splitDirB = new Phaser.Math.Vector2(0.7, 0.2).normalize();
  private prevWristIndexAngle: number | null = null;
  private controlBlend = 0;
  private wasTracking = false;
  private trackingLostSec = 999;
  private readonly trackingGraceSec = 0.22;
  private lastReliableGestureLandmarks: HandPoint[] = [];
  private lastReliableMoveAnchor: { x: number; y: number } | null = null;
  private virtualHandTarget = new Phaser.Math.Vector2(640, 360);
  private virtualHandVelocity = new Phaser.Math.Vector2(0, 0);
  private handMode: 'single' | 'dual' = 'single';

  constructor() {
    super('game');
  }

  create(): void {
    runtimeState.mode = 'ingame';
    runtimeState.elapsedMs = 0;
    runtimeState.trackingStatus = 'initializing';

    const { width, height } = this.scale;
    this.anchor.set(width * 0.5, height * 0.55);
    this.virtualHandTarget.copy(this.anchor);

    this.drawSpaceBackdrop(width, height);

    this.add
      .text(width * 0.5, height * 0.12, 'Light Saber Swarm', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '24px',
        color: '#f4f6ff'
      })
      .setOrigin(0.5);

    this.createBladeSwarm();

    this.handOverlay = this.add.graphics().setDepth(9);

    this.hudText = this.add
      .text(24, 24, '', {
        fontFamily: 'Space Grotesk, Noto Sans KR, sans-serif',
        fontSize: '20px',
        color: '#9ee5ff'
      })
      .setDepth(10)
      .setOrigin(0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.handTracker.stop();
    });

    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.handTracker.stop();
    });

    void this.initHandTracking();
    this.updateHud();
  }

  update(_time: number, delta: number): void {
    this.advanceBy(delta);
  }

  public advanceBy(delta: number): void {
    if (runtimeState.mode !== 'ingame') {
      return;
    }

    this.updateAnchor(delta);
    this.updateBladeSwarm(delta);
    runtimeState.elapsedMs += delta;

    this.updateHud();
  }

  private async initHandTracking(): Promise<void> {
    await this.handTracker.init();
  }

  private updateHud(): void {
    const state = this.handTracker.getState();
    runtimeState.trackingStatus = state.status;

    const detail =
      state.status === 'error' && state.errorMessage ? ` | ${state.errorMessage.slice(0, 72)}` : '';
    this.hudText?.setText(
      `Hand ${state.status} (${this.handMode}) | Gesture ${this.gesture} | Spread ${this.spreadFactor.toFixed(2)} | Burst ${this.burstEnergy.toFixed(2)} | Split ${this.splitEnergy.toFixed(2)}${detail}`
    );
  }

  private drawSpaceBackdrop(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d1226, 0x0d1226, 0x04050a, 0x04050a, 1);
    bg.fillRect(0, 0, width, height);

    for (let i = 0; i < 220; i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(0.4, 1.7);
      const a = Phaser.Math.FloatBetween(0.25, 0.9);
      this.add.circle(x, y, r, 0xd2e7ff, a);
    }
  }

  private createBladeSwarm(): void {
    this.blades = [];
    for (let i = 0; i < BLADE_COUNT; i += 1) {
      const triangle = this.add
        .triangle(
          this.anchor.x,
          this.anchor.y,
          -6,
          2.2,
          6,
          0,
          -6,
          -2.2,
          this.bladeColor,
          Phaser.Math.FloatBetween(0.7, 1)
        )
        .setBlendMode(Phaser.BlendModes.ADD);

      this.blades.push({
        sprite: triangle,
        x: this.anchor.x + Math.cos(i * 0.31) * Phaser.Math.FloatBetween(60, 160),
        y: this.anchor.y + Math.sin(i * 0.37) * Phaser.Math.FloatBetween(45, 140),
        vx: Phaser.Math.FloatBetween(-25, 25),
        vy: Phaser.Math.FloatBetween(-25, 25),
        angle: Phaser.Math.FloatBetween(0, Math.PI * 2),
        baseRadius: Phaser.Math.FloatBetween(90, 290),
        angularVelocity: Phaser.Math.FloatBetween(-0.0018, 0.0018),
        bobOffset: Phaser.Math.FloatBetween(0, Math.PI * 2),
        noisePhase: Phaser.Math.FloatBetween(0, Math.PI * 2)
      });
    }
  }

  private updateAnchor(delta: number): void {
    const rawTracking = this.handTracker.getState();
    const dtSec = Math.max(0.001, delta / 1000);
    this.driftTime += dtSec;
    const hasLiveTracking = rawTracking.status === 'tracking' && rawTracking.hands.length > 0;

    const liveInput = this.resolveHandControlInput(rawTracking.hands);

    if (hasLiveTracking && liveInput.moveAnchor) {
      this.handMode = liveInput.dualHand ? 'dual' : 'single';
      this.lastReliableGestureLandmarks = liveInput.gestureLandmarks.map((p) => ({ ...p }));
      this.lastReliableMoveAnchor = { ...liveInput.moveAnchor };
      this.trackingLostSec = 0;
      if (liveInput.dualHand) {
        const twoHandSpreadBoost = Phaser.Math.Clamp(liveInput.handSeparation * 1.35, 0, 0.55);
        this.spreadFactor = Phaser.Math.Clamp(this.spreadFactor + twoHandSpreadBoost * 0.02, 0, 1);
        this.burstEnergy = Phaser.Math.Clamp(this.burstEnergy + twoHandSpreadBoost * 0.015, 0, 1.9);
      }
    } else {
      this.trackingLostSec += dtSec;
    }

    const hasGraceTracking =
      !hasLiveTracking &&
      this.trackingLostSec < this.trackingGraceSec &&
      this.lastReliableGestureLandmarks.length > 0 &&
      this.lastReliableMoveAnchor !== null;
    const controlLandmarks = hasLiveTracking
      ? liveInput.gestureLandmarks
      : this.lastReliableGestureLandmarks;
    const moveAnchor = hasLiveTracking ? liveInput.moveAnchor : this.lastReliableMoveAnchor;
    const overlayHands = hasLiveTracking
      ? liveInput.overlayHands
      : controlLandmarks.length > 0
        ? [controlLandmarks]
        : [];

    this.drawHandsOverlay(overlayHands);
    this.updateSpreadState(controlLandmarks, delta);

    if (hasLiveTracking && moveAnchor) {
      if (!this.wasTracking) {
        this.controlBlend = 0.45;
        this.lastAnchorSample = this.anchor.clone();
        this.prevWristIndexAngle = null;
      }
      this.wasTracking = true;
      this.controlBlend = Math.min(1, this.controlBlend + dtSec * 8.5);

      const expanded = this.mapHandToExpandedTarget(moveAnchor.x, moveAnchor.y);

      const toMeasuredX = expanded.x - this.virtualHandTarget.x;
      const toMeasuredY = expanded.y - this.virtualHandTarget.y;
      this.virtualHandVelocity.x += toMeasuredX * 20 * dtSec;
      this.virtualHandVelocity.y += toMeasuredY * 20 * dtSec;
      this.virtualHandVelocity.scale(0.93);
      this.virtualHandTarget.x += this.virtualHandVelocity.x * dtSec;
      this.virtualHandTarget.y += this.virtualHandVelocity.y * dtSec;
      this.virtualHandTarget.x = Phaser.Math.Linear(this.virtualHandTarget.x, expanded.x, 0.62);
      this.virtualHandTarget.y = Phaser.Math.Linear(this.virtualHandTarget.y, expanded.y, 0.62);

      const stiffness = 12.8 * this.controlBlend;
      this.anchorVelocity.x += (this.virtualHandTarget.x - this.anchor.x) * stiffness * dtSec;
      this.anchorVelocity.y += (this.virtualHandTarget.y - this.anchor.y) * stiffness * dtSec;
      this.updateBurstFromAnchorSpeed(dtSec, controlLandmarks);
    } else if (hasGraceTracking) {
      this.wasTracking = false;
      this.controlBlend = Math.max(0.2, this.controlBlend - dtSec * 2.2);
      this.virtualHandTarget.x += this.virtualHandVelocity.x * dtSec;
      this.virtualHandTarget.y += this.virtualHandVelocity.y * dtSec;
      this.virtualHandVelocity.scale(0.91);
      this.anchorVelocity.x += (this.virtualHandTarget.x - this.anchor.x) * 7.2 * dtSec;
      this.anchorVelocity.y += (this.virtualHandTarget.y - this.anchor.y) * 7.2 * dtSec;
      this.handSpeed = Phaser.Math.Linear(this.handSpeed, 0, 0.04);
      this.burstEnergy = Math.max(0, this.burstEnergy - dtSec * 0.1);
    } else {
      this.wasTracking = false;
      this.controlBlend = Math.max(0, this.controlBlend - dtSec * 1.4);
      this.applyIdleDrift(dtSec);
      this.handSpeed = Phaser.Math.Linear(this.handSpeed, 0, 0.08);
      this.burstEnergy = Math.max(0, this.burstEnergy - dtSec * 0.2);
      this.prevWristIndexAngle = null;
    }

    const drag = hasLiveTracking ? 0.94 : hasGraceTracking ? 0.92 : 0.968;
    this.anchorVelocity.scale(drag);

    this.anchor.x += this.anchorVelocity.x * dtSec;
    this.anchor.y += this.anchorVelocity.y * dtSec;

    const marginX = this.scale.width * 0.16;
    const marginY = this.scale.height * 0.18;
    if (this.anchor.x < -marginX || this.anchor.x > this.scale.width + marginX) {
      this.anchorVelocity.x *= -0.45;
    }
    if (this.anchor.y < -marginY || this.anchor.y > this.scale.height + marginY) {
      this.anchorVelocity.y *= -0.45;
    }
    this.anchor.x = Phaser.Math.Clamp(this.anchor.x, -marginX, this.scale.width + marginX);
    this.anchor.y = Phaser.Math.Clamp(this.anchor.y, -marginY, this.scale.height + marginY);
  }

  private drawHandsOverlay(handsLandmarks: HandPoint[][]): void {
    if (!this.handOverlay) {
      return;
    }

    this.handOverlay.clear();

    if (handsLandmarks.length === 0) {
      return;
    }

    for (const landmarks of handsLandmarks) {
      for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
        const a = landmarks[startIndex];
        const b = landmarks[endIndex];
        if (!a || !b) {
          continue;
        }

        this.drawDottedSegment(
          a.x * this.scale.width,
          a.y * this.scale.height,
          b.x * this.scale.width,
          b.y * this.scale.height,
          0x5dff9e
        );
      }

      for (const p of landmarks) {
        this.handOverlay.fillStyle(0x63ffa4, 0.85);
        this.handOverlay.fillCircle(p.x * this.scale.width, p.y * this.scale.height, 3);
      }
    }
  }

  private resolveHandControlInput(hands: TrackedHand[]): HandControlInput {
    if (hands.length === 0) {
      return {
        moveAnchor: null,
        gestureLandmarks: [],
        overlayHands: [],
        dualHand: false,
        handSeparation: 0
      };
    }

    if (hands.length === 1) {
      const single = hands[0];
      return {
        moveAnchor: single.anchorNormalized,
        gestureLandmarks: single.landmarks,
        overlayHands: [single.landmarks],
        dualHand: false,
        handSeparation: 0
      };
    }

    const leftByLabel = hands.find((h) => h.handedness === 'Left');
    const rightByLabel = hands.find((h) => h.handedness === 'Right');
    const left = leftByLabel ?? hands[0];
    const right = rightByLabel ?? (hands[0] === left ? hands[1] : hands[0]);
    const handSeparation = Math.abs(right.anchorNormalized.x - left.anchorNormalized.x);
    return {
      moveAnchor: left.anchorNormalized,
      gestureLandmarks: right.landmarks,
      overlayHands: [left.landmarks, right.landmarks],
      dualHand: true,
      handSeparation
    };
  }

  private drawDottedSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number
  ): void {
    if (!this.handOverlay) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const spacing = 7;
    const steps = Math.max(1, Math.floor(distance / spacing));

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Phaser.Math.Linear(x1, x2, t);
      const y = Phaser.Math.Linear(y1, y2, t);
      this.handOverlay.fillStyle(color, 0.82);
      this.handOverlay.fillCircle(x, y, 1.65);
    }
  }

  private updateBladeSwarm(delta: number): void {
    const dt = delta;
    const dtSec = Math.max(0.001, delta / 1000);
    const pulse = 1 + Math.sin(runtimeState.elapsedMs * 0.003) * 0.18;
    const spreadRadiusScale = Phaser.Math.Linear(0.24, 1.68, this.spreadFactor);
    this.burstEnergy = Math.max(0, this.burstEnergy - dtSec * 0.62);
    this.throwEnergy = Math.max(0, this.throwEnergy - dtSec * 0.95);
    this.twirlEnergy = Math.max(0, this.twirlEnergy - dtSec * 1.15);
    this.splitEnergy = Math.max(0, this.splitEnergy - dtSec * 0.9);

    for (let i = 0; i < this.blades.length; i += 1) {
      const blade = this.blades[i];
      const gestureSpinBoost = this.gesture === 'pinch' ? 0.8 : this.gesture === 'open' ? 0.25 : 0;
      blade.angle += blade.angularVelocity * dt * (1 + this.burstEnergy * 0.65 + gestureSpinBoost);
      blade.angle += this.twirlDirection * this.twirlEnergy * 0.0016 * dt;
      const bob = Math.sin(runtimeState.elapsedMs * 0.005 + blade.bobOffset) * 12;
      const burstLift = this.burstEnergy * (28 + blade.baseRadius * 0.38);
      const throwLift = this.throwEnergy * (44 + blade.baseRadius * 0.46);
      const currentRadius = blade.baseRadius * spreadRadiusScale * pulse + bob + burstLift + throwLift;

      const throwOffsetX = this.throwDirectionX * this.throwEnergy * (70 + blade.baseRadius * 0.16);
      const targetX = this.anchor.x + Math.cos(blade.angle) * currentRadius + throwOffsetX;
      const targetY = this.anchor.y + Math.sin(blade.angle) * (currentRadius * 0.55);
      const splitDir = i % 2 === 0 ? this.splitDirA : this.splitDirB;
      const splitOffsetMagnitude = this.splitEnergy * (60 + blade.baseRadius * 0.2);
      const splitOffsetX = splitDir.x * splitOffsetMagnitude;
      const splitOffsetY = splitDir.y * splitOffsetMagnitude;

      const noiseX = Math.sin(this.driftTime * 2.15 + blade.noisePhase) * 21;
      const noiseY = Math.cos(this.driftTime * 1.9 + blade.noisePhase * 1.3) * 17;
      const spring = 24 + this.spreadFactor * 11;
      const freedom = 0.92 + this.spreadFactor * 0.42 + this.throwEnergy * 0.22;
      blade.vx += ((targetX + splitOffsetX + noiseX - blade.x) * spring * dtSec) / freedom;
      blade.vy += ((targetY + splitOffsetY + noiseY - blade.y) * spring * dtSec) / freedom;
      blade.vx *= 0.93;
      blade.vy *= 0.93;
      blade.x += blade.vx * dtSec;
      blade.y += blade.vy * dtSec;

      blade.sprite.setPosition(blade.x, blade.y);
      blade.sprite.rotation = Math.atan2(blade.vy, blade.vx) + Math.PI * 0.5;

      const flicker =
        0.65 + Math.abs(Math.sin(runtimeState.elapsedMs * 0.01 + blade.bobOffset)) * 0.35;
      blade.sprite.setScale(
        0.7 +
          this.spreadFactor * 0.62 +
          flicker * 0.24 +
          this.burstEnergy * 0.2 +
          this.throwEnergy * 0.18 +
          this.twirlEnergy * 0.16
      );
      blade.sprite.setAlpha(
        0.38 +
          this.spreadFactor * 0.28 +
          flicker * 0.31 +
          this.burstEnergy * 0.21 +
          this.throwEnergy * 0.19
      );
    }
  }

  private updateSpreadState(landmarks: HandPoint[], delta: number): void {
    const dtSec = Math.max(0.001, delta / 1000);
    this.pinchCooldownSec = Math.max(0, this.pinchCooldownSec - dtSec);
    this.throwCooldownSec = Math.max(0, this.throwCooldownSec - dtSec);
    let targetSpread = 0.52;

    if (landmarks.length > 0) {
      const openRatio = Phaser.Math.Clamp(this.computeHandOpenRatio(landmarks), 0, 1);
      const gesture = this.classifyGesture(landmarks, openRatio);
      this.gesture = gesture;

      if (gesture === 'open') {
        targetSpread = 0.86;
      } else if (gesture === 'fist') {
        targetSpread = 0.12;
        this.burstEnergy = Math.max(0, this.burstEnergy - dtSec * 1.35);
      } else if (gesture === 'pinch') {
        targetSpread = Math.max(0.28, openRatio * 0.6);
        if (this.pinchCooldownSec <= 0) {
          this.burstEnergy = Phaser.Math.Clamp(this.burstEnergy + 0.72, 0, 1.9);
          this.pinchCooldownSec = 0.22;
        }
      } else if (gesture === 'v-split') {
        targetSpread = Math.max(0.58, openRatio * 0.82);
        this.updateSplitDirectionsFromLandmarks(landmarks);
        this.splitEnergy = Phaser.Math.Clamp(this.splitEnergy + dtSec * 2.3 + 0.04, 0, 1.2);
      } else {
        targetSpread = openRatio;
      }

      if (this.twirlEnergy > 0.12) {
        this.gesture = 'twirl';
        targetSpread = Math.min(targetSpread, 0.26);
      } else if (this.throwEnergy > 0.12) {
        this.gesture = this.throwDirectionX < 0 ? 'throw-left' : 'throw-right';
        targetSpread = Math.max(targetSpread, 0.92);
      }
    } else {
      if (this.throwEnergy > 0.12) {
        this.gesture = this.throwDirectionX < 0 ? 'throw-left' : 'throw-right';
      } else if (this.twirlEnergy > 0.12) {
        this.gesture = 'twirl';
      } else if (this.trackingLostSec < this.trackingGraceSec) {
        targetSpread = this.spreadFactor;
      } else {
        this.gesture = 'none';
        targetSpread = Phaser.Math.Linear(this.spreadFactor, 0.52, Math.min(1, dtSec * 0.35));
      }
    }

    const response = this.gesture === 'fist' ? 12 : 9;
    this.spreadFactor = Phaser.Math.Linear(this.spreadFactor, targetSpread, Math.min(1, dtSec * response));
  }

  private updateBurstFromAnchorSpeed(dtSec: number, landmarks: HandPoint[]): void {
    if (!this.lastAnchorSample) {
      this.lastAnchorSample = this.anchor.clone();
      this.prevWristIndexAngle = this.computeWristIndexAngle(landmarks);
      return;
    }

    const dx = this.anchor.x - this.lastAnchorSample.x;
    const dy = this.anchor.y - this.lastAnchorSample.y;
    const deltaPos = Phaser.Math.Distance.Between(this.anchor.x, this.anchor.y, this.lastAnchorSample.x, this.lastAnchorSample.y);
    const speed = deltaPos / dtSec;
    const vx = dx / dtSec;
    const vy = dy / dtSec;
    this.handSpeed = Phaser.Math.Linear(this.handSpeed, speed, 0.35);

    const speedThreshold = 650;
    if (this.handSpeed > speedThreshold) {
      const boost = Phaser.Math.Clamp((this.handSpeed - speedThreshold) / 1300, 0, 1.2);
      this.burstEnergy = Phaser.Math.Clamp(this.burstEnergy + boost * 0.22, 0, 1.6);
    }

    const openRatio = Phaser.Math.Clamp(this.computeHandOpenRatio(landmarks), 0, 1);
    if (
      this.throwCooldownSec <= 0 &&
      openRatio > 0.45 &&
      Math.abs(vx) > 980 &&
      Math.abs(vx) > Math.abs(vy) * 1.35
    ) {
      this.throwDirectionX = Math.sign(vx) || 1;
      this.throwEnergy = Phaser.Math.Clamp(this.throwEnergy + 1.05, 0, 1.8);
      this.burstEnergy = Phaser.Math.Clamp(this.burstEnergy + 0.68, 0, 1.8);
      this.anchorVelocity.x += this.throwDirectionX * 780;
      this.anchorVelocity.y += vy * 0.14;
      this.throwCooldownSec = 0.34;
    }

    const wristIndexAngle = this.computeWristIndexAngle(landmarks);
    if (wristIndexAngle !== null && this.prevWristIndexAngle !== null) {
      const angDelta = Phaser.Math.Angle.Wrap(wristIndexAngle - this.prevWristIndexAngle);
      const angVel = angDelta / dtSec;
      if (Math.abs(angVel) > 4.4 && openRatio > 0.28) {
        this.twirlDirection = angVel > 0 ? 1 : -1;
        this.twirlEnergy = Phaser.Math.Clamp(this.twirlEnergy + Math.min(0.44, Math.abs(angVel) * 0.03), 0, 1.7);
        this.burstEnergy = Phaser.Math.Clamp(this.burstEnergy + 0.1, 0, 1.8);
      }
    }
    this.prevWristIndexAngle = wristIndexAngle;

    this.lastAnchorSample.copy(this.anchor);
  }

  private mapHandToExpandedTarget(normX: number, normY: number): Phaser.Math.Vector2 {
    const xGain = 1.45;
    const yGain = 1.35;
    const expandedX = (normX - 0.5) * xGain + 0.5;
    const expandedY = (normY - 0.5) * yGain + 0.5;
    return new Phaser.Math.Vector2(expandedX * this.scale.width, expandedY * this.scale.height);
  }

  private applyIdleDrift(dtSec: number): void {
    const nx = Math.sin(this.driftTime * 0.93) + Math.sin(this.driftTime * 0.37 + 1.2) * 0.6;
    const ny = Math.cos(this.driftTime * 0.71 + 0.6) + Math.sin(this.driftTime * 0.41) * 0.5;
    this.anchorVelocity.x += nx * 70 * dtSec;
    this.anchorVelocity.y += ny * 52 * dtSec;
  }

  private computeHandOpenRatio(landmarks: HandPoint[]): number {
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    if (!wrist || !indexMcp || !pinkyMcp) {
      return this.spreadFactor;
    }

    const palmScale = Math.max(
      0.04,
      Phaser.Math.Distance.Between(wrist.x, wrist.y, indexMcp.x, indexMcp.y),
      Phaser.Math.Distance.Between(wrist.x, wrist.y, pinkyMcp.x, pinkyMcp.y)
    );

    const fingertipIds = [4, 8, 12, 16, 20];
    let total = 0;
    let count = 0;
    for (const id of fingertipIds) {
      const tip = landmarks[id];
      if (!tip) {
        continue;
      }
      const d = Phaser.Math.Distance.Between(wrist.x, wrist.y, tip.x, tip.y);
      total += Phaser.Math.Clamp((d / palmScale - 0.85) / 1.65, 0, 1);
      count += 1;
    }

    return count > 0 ? total / count : this.spreadFactor;
  }

  private computeWristIndexAngle(landmarks: HandPoint[]): number | null {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    if (!wrist || !indexTip) {
      return null;
    }
    return Math.atan2(indexTip.y - wrist.y, indexTip.x - wrist.x);
  }

  private classifyGesture(landmarks: HandPoint[], openRatio: number): SwarmGesture {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];

    if (!wrist || !thumbTip || !indexTip || !indexMcp || !pinkyMcp) {
      return 'none';
    }

    const palmScale = Math.max(
      0.04,
      Phaser.Math.Distance.Between(wrist.x, wrist.y, indexMcp.x, indexMcp.y),
      Phaser.Math.Distance.Between(wrist.x, wrist.y, pinkyMcp.x, pinkyMcp.y)
    );

    const pinchDistance =
      Phaser.Math.Distance.Between(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y) / palmScale;

    if (pinchDistance < 0.5 && openRatio > 0.18) {
      return 'pinch';
    }
    if (this.isVGesture(landmarks, palmScale, pinchDistance)) {
      return 'v-split';
    }
    if (openRatio > 0.72) {
      return 'open';
    }
    if (openRatio < 0.22) {
      return 'fist';
    }
    return 'none';
  }

  private isVGesture(landmarks: HandPoint[], palmScale: number, pinchDistance: number): boolean {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexPip = landmarks[6];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];
    const pinkyPip = landmarks[18];

    if (
      !wrist ||
      !indexTip ||
      !middleTip ||
      !ringTip ||
      !pinkyTip ||
      !indexPip ||
      !middlePip ||
      !ringPip ||
      !pinkyPip
    ) {
      return false;
    }

    const indexExtended =
      Phaser.Math.Distance.Between(wrist.x, wrist.y, indexTip.x, indexTip.y) >
      Phaser.Math.Distance.Between(wrist.x, wrist.y, indexPip.x, indexPip.y) * 1.2;
    const middleExtended =
      Phaser.Math.Distance.Between(wrist.x, wrist.y, middleTip.x, middleTip.y) >
      Phaser.Math.Distance.Between(wrist.x, wrist.y, middlePip.x, middlePip.y) * 1.2;
    const ringFolded =
      Phaser.Math.Distance.Between(wrist.x, wrist.y, ringTip.x, ringTip.y) <
      Phaser.Math.Distance.Between(wrist.x, wrist.y, ringPip.x, ringPip.y) * 1.14;
    const pinkyFolded =
      Phaser.Math.Distance.Between(wrist.x, wrist.y, pinkyTip.x, pinkyTip.y) <
      Phaser.Math.Distance.Between(wrist.x, wrist.y, pinkyPip.x, pinkyPip.y) * 1.14;

    const fingerGap =
      Phaser.Math.Distance.Between(indexTip.x, indexTip.y, middleTip.x, middleTip.y) / palmScale;

    return indexExtended && middleExtended && ringFolded && pinkyFolded && fingerGap > 0.55 && pinchDistance > 0.72;
  }

  private updateSplitDirectionsFromLandmarks(landmarks: HandPoint[]): void {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    if (!wrist || !indexTip || !middleTip) {
      return;
    }

    const dirA = new Phaser.Math.Vector2(indexTip.x - wrist.x, indexTip.y - wrist.y).normalize();
    const dirB = new Phaser.Math.Vector2(middleTip.x - wrist.x, middleTip.y - wrist.y).normalize();

    if (Number.isFinite(dirA.x) && Number.isFinite(dirA.y)) {
      this.splitDirA.lerp(dirA, 0.4);
      this.splitDirA.normalize();
    }
    if (Number.isFinite(dirB.x) && Number.isFinite(dirB.y)) {
      this.splitDirB.lerp(dirB, 0.4);
      this.splitDirB.normalize();
    }
  }
}
