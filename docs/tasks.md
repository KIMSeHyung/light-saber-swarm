# Implementation Tasks (MVP v2)

## Phase 0 - Project Setup
1. Initialize Vite + TypeScript + Phaser 3 project structure.
2. Add lint/format/typecheck scripts.
3. Add base scenes and shared config (canvas resize + fullscreen).

Exit criteria:
- App boots into MenuScene and can enter GameScene.

## Phase 1 - Camera and Tracking Pipeline
1. Implement webcam permission and stream lifecycle manager.
2. Integrate MediaPipe Hand Landmarker in browser.
3. Add landmark smoothing and stable pose windows.
4. Expose tracking status to UI.

Exit criteria:
- Hand anchor coordinates update in real time.
- Tracking lost/recovered state is visible.

## Phase 2 - Gesture Classification
1. Implement rule-based gesture detector (Open Palm, Fist, Pinch).
2. Add debounce and cooldown controls.
3. Emit normalized game commands from gestures.

Exit criteria:
- Each gesture can be triggered reliably with low false positives.

## Phase 3 - Swarm Core
1. Implement blade agent pool (start at 50 blades).
2. Add swarm state machine (Idle Orbit, Scatter, Gather, Dash).
3. Tune boids + anchor force weights per state.
4. Add blade visual effects for each mode.

Exit criteria:
- Swarm transitions are visually clear and responsive.

## Phase 4 - Combat Loop
1. Add enemy spawner with scaling difficulty.
2. Add collision handling (blade-enemy, enemy-core).
3. Add HP, score, timer, and mode indicator HUD.
4. Add game over and restart flow.

Exit criteria:
- 60-second playable loop with meaningful feedback.

## Phase 5 - Fallback Controls and Robustness
1. Add mouse anchor control path.
2. Map keyboard keys to mode transitions.
3. Auto-switch fallback mode when camera denied/unavailable.

Exit criteria:
- Game fully playable with no camera access.

## Phase 6 - Test Harness and Validation
1. Expose `window.render_game_to_text()`.
2. Expose deterministic `window.advanceTime(ms)`.
3. Add Playwright smoke actions for core scenarios.
4. Capture and review screenshots + console logs.

Exit criteria:
- Smoke tests pass for camera and fallback paths.

## Phase 7 - Polish and Performance
1. Profile update/render/inference timings.
2. Tune blade count and inference cadence.
3. Fix jank, visual clarity, and input lag hotspots.

Exit criteria:
- Stable performance target met on desktop baseline.

## Open Decisions
1. Gesture thresholds by pixel or normalized hand size scaling.
2. Dash target rule: anchor direction vs nearest enemy snap.
3. Default blade count: 40, 50, or adaptive by FPS.
