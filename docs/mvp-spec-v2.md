# Light Saber Swarm - MVP Spec v2

## 1. Product Goal
Build a browser game where the player controls a swarm of flying blade drones with hand gestures from a webcam.

Core fantasy:
- Dozens of blades orbit, scatter, regroup, and strike as one system.
- Distinct hand poses trigger distinct swarm effects.

## 2. Scope
### In Scope (MVP)
- Webcam-based single-hand tracking (local-only processing).
- 30 to 80 blade agents rendered in Phaser 3.
- Swarm state machine: Idle Orbit, Scatter, Gather, Dash.
- Gesture-driven transitions between swarm states.
- Enemy spawning, hit detection, score, HP, game over.
- 60-second run loop with restart.
- Fallback controls (mouse/keyboard) when camera permission fails.

### Out of Scope (Post-MVP)
- Multiplayer.
- Account/login/cloud save.
- Server-side video inference.
- Advanced PvE stages/bosses.

## 3. Technical Stack
- Language: TypeScript
- Build tool: Vite
- Engine: Phaser 3
- Hand tracking: MediaPipe Tasks Vision Hand Landmarker (WASM)
- Test: Playwright smoke loop + in-game text state hooks

## 4. Privacy and Local Processing
All camera frames are processed in the browser on the client device.
- No frame upload to backend.
- No landmark telemetry upload by default.
- Network calls are limited to app assets and model files.

Acceptance checks:
- App works with backend disconnected after static assets are loaded.
- No API endpoint receives image/frame payloads.

## 5. Gesture Set and Effect Mapping
Gesture classification is rule-based from hand landmarks for MVP.

### Gesture A: Open Palm
- Detection: most fingers extended.
- Swarm behavior: Scatter.
- Effect: radial blade trail burst + light wind ring.
- Gameplay use: area denial and crowd control.

### Gesture B: Fist
- Detection: most fingers folded.
- Swarm behavior: Gather tightly around anchor.
- Effect: compact spin aura around core.
- Gameplay use: defense and charge setup.

### Gesture C: Pinch (thumb-index close)
- Detection: thumb tip and index tip distance below threshold.
- Swarm behavior: Dash toward target vector.
- Effect: slash beam / motion streak.
- Gameplay use: burst damage.

Debounce rules:
- Pose must be stable for >= 120 ms before state transition.
- Cooldown per active effect: 250 to 500 ms (tuned).

## 6. Swarm Simulation Design
Use a hybrid controller:
- Boids-like local rules (separation, alignment, cohesion).
- Global anchor forces based on current swarm mode.

Per mode tuning:
- Idle Orbit: medium cohesion, low separation, circular anchor.
- Scatter: high separation, low cohesion, radius expands.
- Gather: high cohesion, radius contracts.
- Dash: high seek force along forward vector, temporary collision boost.

Performance budget:
- Blade count target: 50 default, scalable 30 to 80.
- Render: 60 FPS target.
- Inference: 20 to 30 FPS acceptable.
- End-to-end control latency target: <= 120 ms perceived.

## 7. Coordinate and Input Pipeline
1. Acquire webcam stream with `getUserMedia`.
2. Run hand landmark inference at capped rate.
3. Normalize landmarks (0..1), mirror handling for selfie mode.
4. Map normalized hand anchor to world coordinates.
5. Apply smoothing filter (EMA or One-Euro) before gameplay logic.

Fallback input:
- Mouse position controls anchor.
- Keyboard keys map to Scatter/Gather/Dash triggers.

## 8. Game Loop and Rules (MVP)
- Session length: 60 seconds.
- Enemies spawn from screen edges.
- Blade-enemy collision removes enemy and grants score.
- Player HP decreases on enemy contact with core zone.
- End condition: timer ends or HP reaches 0.

HUD:
- HP, Score, Time, active swarm mode.

## 9. System Architecture
Modules:
- `camera/`: stream setup and permission states.
- `tracking/`: hand model init + inference + gesture classification.
- `input/`: maps gesture events to game commands.
- `game/`: Phaser scenes, entities, collision, FX.
- `swarm/`: blade agent simulation and mode state machine.
- `ui/`: HUD and state screens.

Suggested scenes:
- `BootScene`
- `MenuScene`
- `GameScene`
- `GameOverScene`

## 10. Testing and Observability
Required browser hooks:
- `window.render_game_to_text()` returns concise JSON state.
- `window.advanceTime(ms)` deterministic stepping for tests.

Smoke scenarios:
- Camera permission granted -> gesture transitions fire correctly.
- Camera denied -> fallback controls fully playable.
- 60-second run completes without crashes.
- Score/HP/timer/mode state stay consistent.
- Console has no new critical errors.

## 11. Accessibility and UX Baselines
- Clear permission prompt explanation.
- Visible status chip: Camera On/Off, Tracking Lost.
- High-contrast HUD and large hit effects.
- Fullscreen toggle via `f`; `Esc` exits fullscreen.

## 12. Definition of Done (MVP)
1. Local webcam hand tracking controls swarm mode transitions.
2. Scatter/Gather/Dash are visually distinct and reliable.
3. At least 30 blades stable at 60 FPS on standard desktop.
4. Full game loop (start -> play -> game over -> restart) works.
5. Playwright smoke checks pass with no blocker errors.
