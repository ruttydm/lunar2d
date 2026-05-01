# Lunar2D

Playable 2D orbital lander built with TypeScript, Canvas, Bun, and a small WebSocket relay.

## Run

```sh
bun install
bun run dev
```

Open `http://localhost:3000`.

For multiplayer relay during local development:

```sh
bun run server
```

The dev client uses `ws://localhost:3001` when served from port `3000`.

## Validate

```sh
bun run check
bun run test:e2e
```

`bun run check` runs TypeScript, unit tests, production build, and a server bundle check.

## Docker

```sh
docker build -t lunar2d .
docker run --rm -p 3001:3001 lunar2d
```

Open `http://localhost:3001`. The container serves the built client and WebSocket relay from the same Bun process.

## Architecture

The active runtime is TypeScript-only. The old Rust/WASM prototype path was removed because it was not used by the live 2D game.

Key areas:

- `src/client/src/game.ts`: orchestration and remaining canvas gameplay glue.
- `src/client/src/domain/model.ts`: bodies, landers, constants, and shared state types.
- `src/client/src/physics/`: tested pure flight and terrain helpers.
- `src/client/src/systems/`: small gameplay systems such as engine status.
- `src/client/src/audio/`: generated Web Audio engine and event sounds.
- `src/client/src/network/`: WebSocket relay client.
- `tests/physics/` and `tests/systems/`: Bun unit/regression tests.
- `tests/e2e/`: Playwright browser smoke tests.
