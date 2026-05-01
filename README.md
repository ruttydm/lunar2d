# Lunar3D

## How to Run

```

# 1. Start the game server (Bun)

bun run src/server/main.ts

# 2. In another terminal, start the client dev server
bun run dev

# 3. Open http://localhost:3000 in your browser

# 4. (Optional) Connect to server at ws://localhost:3001)

## Build WASM (# Only needed after changing Rust code)
bun run wasm:release

# Or rebuild WASM in dev mode (bun run wasm:dev for faster reload during dev)
bun run wasm:build

# For optimized production WASM
bun run wasm:release

## Run Rust tests
bun run test:rust

## Run all tests
bun run test
