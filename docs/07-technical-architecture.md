# Technical Architecture

Lunar2D is currently a TypeScript browser game with Canvas rendering and a Bun WebSocket relay.

## Runtime

- Browser client: Vite, TypeScript, Canvas 2D, DOM HUD, Web Audio.
- Multiplayer: lightweight Bun WebSocket relay in `src/server/main.ts`.
- Tests: Bun unit tests for pure game logic, Playwright smoke tests for browser rendering/mobile controls.

There is no active Rust/WASM runtime. The previous prototype crates and generated WASM package were removed so the repo has one source of truth.

## Client Modules

- `game.ts`: game loop and orchestration. This is still the largest file and should continue shrinking.
- `domain/model.ts`: constants, celestial bodies, landers, and shared interfaces.
- `physics/flight.ts`: vector speed, angle helpers, braking-burn guard, projectile velocity inheritance.
- `physics/terrain.ts`: terrain radius sampling, pad flattening, platform generation, surface points.
- `systems/engine.ts`: explicit engine status and thrust eligibility.
- `audio/AudioSystem.ts`: generated engine, weapon, warning, and landing sounds.
- `network/MultiplayerClient.ts`: relay connection, peer state, and send throttling.
- `controls/`: keyboard, mouse, touch, and gamepad input normalization.

## Quality Gates

Use:

```sh
bun run check
bun run test:e2e
```

The core regressions to keep covered are:

- retrograde thrust cannot increase speed;
- projectile velocity inherits lander velocity;
- pad platforms are flat and above local terrain;
- sampled terrain matches raw terrain closely;
- engine status exposes why thrust is blocked;
- canvas renders and mobile controls are visible.

## Renderer Direction

Canvas remains the right renderer while physics, state, and tests are being stabilized. A PixiJS/WebGL migration should only happen behind a renderer interface after the remaining orchestration is split out of `game.ts`.
