import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

export type TrackingStatus =
  | 'idle'
  | 'initializing'
  | 'tracking'
  | 'no-hand'
  | 'permission-denied'
  | 'error';

export type HandPoint = {
  x: number;
  y: number;
  z: number;
};

export type TrackedHand = {
  handedness: 'Left' | 'Right' | 'Unknown';
  anchorNormalized: { x: number; y: number };
  landmarks: HandPoint[];
};

export type HandTrackingState = {
  status: TrackingStatus;
  anchorNormalized: { x: number; y: number } | null;
  landmarks: HandPoint[];
  hands: TrackedHand[];
  errorMessage: string | null;
};

const TASKS_VERSION = '0.10.22';
const WASM_ROOTS = [
  '/mediapipe/wasm',
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`
];
const MODEL_URLS = [
  '/mediapipe/models/hand_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm/hand_landmarker.task`
];

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastInferenceTs = 0;
  private inferenceIntervalMs = 30;

  private readonly state: HandTrackingState = {
    status: 'idle',
    anchorNormalized: null,
    landmarks: [],
    hands: [],
    errorMessage: null
  };

  private modelLoadError: string | null = null;

  async init(): Promise<void> {
    if (this.running || this.state.status === 'initializing') {
      return;
    }

    this.state.status = 'initializing';
    this.state.errorMessage = null;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 540 }
        },
        audio: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Camera permission denied';
      this.state.status = 'permission-denied';
      this.state.errorMessage = message;
      return;
    }

    this.videoEl = document.createElement('video');
    this.videoEl.autoplay = true;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.srcObject = this.stream;
    this.videoEl.style.position = 'fixed';
    this.videoEl.style.left = '-99999px';
    this.videoEl.style.top = '-99999px';
    this.videoEl.style.width = '1px';
    this.videoEl.style.height = '1px';
    this.videoEl.style.opacity = '0';
    this.videoEl.style.pointerEvents = 'none';
    this.videoEl.style.zIndex = '-1';
    document.body.appendChild(this.videoEl);

    try {
      await this.videoEl.play();

      this.handLandmarker = await this.createLandmarkerWithFallback();
      await this.prewarmDetector();

      this.running = true;
      this.state.status = 'no-hand';
      this.rafId = requestAnimationFrame(this.tick);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.modelLoadError ?? 'Failed to initialize hand tracker';
      this.state.status = 'error';
      this.state.errorMessage = message;
      this.stop();
    }
  }

  getState(): HandTrackingState {
    return {
      status: this.state.status,
      anchorNormalized: this.state.anchorNormalized,
      landmarks: this.state.landmarks,
      hands: this.state.hands,
      errorMessage: this.state.errorMessage
    };
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    this.stream = null;

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl.remove();
    }

    this.videoEl = null;

    if (this.handLandmarker) {
      this.handLandmarker.close();
    }
    this.handLandmarker = null;

    if (this.state.status !== 'permission-denied' && this.state.status !== 'error') {
      this.state.status = 'idle';
    }
    this.state.anchorNormalized = null;
    this.state.landmarks = [];
    this.state.hands = [];
  }

  private readonly tick = (nowTs: number): void => {
    if (!this.running || !this.videoEl || !this.handLandmarker) {
      return;
    }

    if (
      this.videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      nowTs - this.lastInferenceTs >= this.inferenceIntervalMs
    ) {
      this.lastInferenceTs = nowTs;
      try {
        const result = this.handLandmarker.detectForVideo(this.videoEl, nowTs);
        this.consumeResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.state.status = 'error';
        this.state.errorMessage = message;
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private consumeResult(result: HandLandmarkerResult): void {
    const hands = result.landmarks ?? [];
    if (hands.length === 0) {
      this.state.status = 'no-hand';
      this.state.anchorNormalized = null;
      this.state.landmarks = [];
      this.state.hands = [];
      return;
    }

    const handednessList = result.handedness ?? [];
    const trackedHands: TrackedHand[] = hands
      .slice(0, 2)
      .map((points, index) => {
        const mirrored = points.map((p) => ({
          x: 1 - p.x,
          y: p.y,
          z: p.z
        }));
        const indexTip = mirrored[8] ?? mirrored[0];
        const labelRaw = handednessList[index]?.[0]?.categoryName ?? 'Unknown';
        const handedness: 'Left' | 'Right' | 'Unknown' =
          labelRaw === 'Left' || labelRaw === 'Right' ? labelRaw : 'Unknown';
        return {
          handedness,
          anchorNormalized: { x: indexTip.x, y: indexTip.y },
          landmarks: mirrored
        };
      })
      .sort((a, b) => a.anchorNormalized.x - b.anchorNormalized.x);

    this.state.status = 'tracking';
    this.state.hands = trackedHands;
    this.state.anchorNormalized = trackedHands[0]?.anchorNormalized ?? null;
    this.state.landmarks = trackedHands[0]?.landmarks ?? [];
  }

  private async createLandmarkerWithFallback(): Promise<HandLandmarker> {
    const delegates: Array<'GPU' | 'CPU'> = ['CPU', 'GPU'];
    const errors: string[] = [];

    for (const wasmRoot of WASM_ROOTS) {
      let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
      try {
        vision = await FilesetResolver.forVisionTasks(wasmRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`[wasm] ${wasmRoot} -> ${message}`);
        continue;
      }

      for (const modelAssetPath of MODEL_URLS) {
        for (const delegate of delegates) {
          try {
            return await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath, delegate },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`[${delegate}] ${wasmRoot} | ${modelAssetPath} -> ${message}`);
          }
        }
      }
    }

    this.modelLoadError = errors.join(' | ');
    throw new Error(this.modelLoadError);
  }

  private async prewarmDetector(): Promise<void> {
    if (!this.videoEl || !this.handLandmarker) {
      return;
    }

    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        this.handLandmarker.detectForVideo(this.videoEl, performance.now());
      } catch {
        break;
      }
    }
  }
}
