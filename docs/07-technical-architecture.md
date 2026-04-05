# Lunar3D — Technical Architecture

## 1. Tech Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐ │
│  │ Three.js │  │ Rust/WASM    │  │  Pure    │  │WebSocket│ │
│  │ Renderer │  │ Physics Core │  │ HTML/CSS │  │ Client  │ │
│  └──────────┘  └──────────────┘  └──────────┘  └────────┘ │
│                      (shared binary)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket (binary)
┌──────────────────────────┴──────────────────────────────────┐
│                      GAME SERVER (Bun)                      │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Rust/WASM    │  │ Player   │  │ Combat   │  │ World  │ │
│  │ Physics Core │  │ Manager  │  │ System   │  │ Manager│ │
│  └──────────────┘  └──────────┘  └──────────┘  └────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Score    │  │ Anti-    │  │ Spatial  │                 │
│  │ System   │  │ Cheat    │  │ Partition│                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Redis (state, pub/sub)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Rust/WASM Physics Core

### 2.1 Why Fully Rust/WASM

The physics engine is the heart of this game — gravity, thrust, collisions, projectiles, orbital mechanics. Writing it in Rust compiled to WASM gives us:

- **10-50x faster** than equivalent JavaScript
- **Deterministic** — same binary runs on both client and server, perfect prediction
- **Memory-safe** — no GC pauses, no undefined behavior
- **SIMD auto-vectorization** — Rust loops over flat arrays get free vectorization
- **Shared codebase** — one Rust crate, one compiled `.wasm`, used everywhere
- **Testable in isolation** — Rust unit tests + integration tests + browser tests

### 2.2 Rust Crate Structure

```
crates/
├── lunar-physics/              # Core physics engine
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              # WASM exports
│       ├── gravity.rs          # Inverse-square gravity, altitude table
│       ├── thrust.rs           # Engine thrust, fuel consumption, mass changes
│       ├── rotation.rs         # RCS, reaction wheels, rotation dynamics
│       ├── collision.rs        # Broad + narrow phase collision detection
│       ├── projectile.rs       # Ballistic projectile simulation
│       ├── landing.rs          # Landing detection, touchdown validation
│       ├── orbit.rs            # Orbital mechanics helpers (apoapsis, periapsis)
│       ├── spatial.rs          # Spherical grid, spatial queries
│       ├── terrain.rs          # Height sampling, surface normal calculation
│       ├── entities.rs         # Entity component data structures
│       └── simulation.rs       # Top-level simulation tick
│
├── lunar-physics-wasm/         # WASM bindings layer
│   ├── Cargo.toml              # wasm-bindgen, wasm-pack
│   └── src/
│       ├── lib.rs              # WASM API surface
│       └── types.rs            # JS↔Rust type bridges
│
└── lunar-physics-tests/        # Integration & property tests
    ├── Cargo.toml
    └── tests/
        ├── gravity_tests.rs
        ├── orbit_tests.rs
        ├── collision_tests.rs
        ├── landing_tests.rs
        └── simulation_tests.rs
```

### 2.3 WASM API Surface

The compiled WASM module exposes a flat, buffer-based API for maximum throughput:

```rust
// Exposed to WASM consumers (both Bun and browser)

/// Initialize simulation with world parameters
#[wasm_bindgen]
pub fn init(config: &SimulationConfig) -> SimulationHandle;

/// Create an entity (lander, projectile, etc.)
#[wasm_bindgen]
pub fn spawn_entity(sim: &SimulationHandle, entity_type: EntityType, data: &[f32]) -> u32;

/// Destroy an entity
#[wasm_bindgen]
pub fn destroy_entity(sim: &SimulationHandle, entity_id: u32);

/// Apply input to a player-controlled entity
#[wasm_bindgen]
pub fn apply_input(sim: &SimulationHandle, entity_id: u32, input: &PlayerInput);

/// Run one simulation tick (fixed 1/60s)
#[wasm_bindgen]
pub fn tick(sim: &SimulationHandle) -> TickResult;

/// Read entity states into a provided buffer (zero-copy)
#[wasm_bindgen]
pub fn read_states(sim: &SimulationHandle, buffer: &mut [f32]) -> usize;

/// Read collision / event queue
#[wasm_bindgen]
pub fn read_events(sim: &SimulationHandle, buffer: &mut [f32]) -> usize;

/// Sample terrain height at a given position
#[wasm_bindgen]
pub fn sample_terrain(sim: &SimulationHandle, position: &[f32; 3]) -> f32;

/// Compute orbital parameters for a given state
#[wasm_bindgen]
pub fn compute_orbit(sim: &SimulationHandle, position: &[f32; 3], velocity: &[f32; 3]) -> OrbitParams;
```

### 2.4 Data Layout (Rust Side)

All entity data is stored in Structure-of-Arrays (SoA) format for cache-friendly iteration:

```rust
pub struct Simulation {
    // Entity IDs (sparse, with free list for reuse)
    entity_count: usize,

    // Position components (SoA)
    positions: Vec<[f32; 3]>,       // x, y, z

    // Velocity components (SoA)
    velocities: Vec<[f32; 3]>,      // vx, vy, vz

    // Rotation (compressed quaternion)
    rotations: Vec<[f32; 4]>,       // qx, qy, qz, qw

    // Angular velocity
    angular_velocities: Vec<[f32; 3]>,

    // Mass (changes as fuel burns)
    masses: Vec<f32>,

    // Fuel remaining
    fuels: Vec<f32>,

    // Health
    healths: Vec<f32>,

    // Entity type + flags
    entity_types: Vec<EntityType>,

    // Thrust state
    thrust_vectors: Vec<[f32; 3]>,
    thrust_active: Vec<bool>,

    // Spatial grid index
    grid_cells: Vec<CellIndex>,

    // Projectile lifetime
    lifetimes: Vec<f32>,

    // Event queue (collisions, landings, destructions)
    events: Vec<SimEvent>,
}
```

---

## 3. Client Architecture

### 3.1 Bundler & Runtime: Bun + Vite
- **Bun** as the runtime for server (native TypeScript, built-in WebSocket server, built-in test runner)
- **Vite** for client-side bundling and fast HMR development
- TypeScript throughout (except physics = Rust/WASM)
- Shared types/constants between client and server

### 3.2 Module Structure

```
src/
├── client/
│   ├── main.ts              # Entry point
│   ├── renderer/            # Three.js setup, scene, camera, lighting
│   ├── wasm-bridge/         # Loads lunar-physics.wasm, provides TS API
│   ├── entities/            # Lander, projectile visual entities (wrap WASM IDs)
│   ├── controls/            # Input handling (keyboard, mouse, touch, gamepad)
│   ├── hud/                 # HUD overlay (pure HTML/CSS)
│   ├── audio/               # Sound engine
│   ├── network/             # WebSocket client, state sync
│   ├── world/               # Terrain generation, LOD, level loading
│   ├── camera/              # Camera modes, chase, orbital
│   ├── particles/           # Exhaust, explosions, dust
│   ├── ui/                  # Menu screens, emotes, leaderboard
│   └── utils/               # Math helpers, constants
├── server/
│   ├── main.ts              # Server entry point
│   ├── wasm-bridge/         # Loads lunar-physics.wasm, provides TS API
│   ├── game/                # Game loop, feeds inputs into WASM, reads events
│   ├── network/             # WebSocket server, packet handling
│   ├── players/             # Player state management
│   ├── scoring/             # Leaderboard, XP, validation
│   ├── world/               # Level data, terrain config, spawning
│   ├── spatial/             # Spatial partitioning (wrapper around WASM spatial grid)
│   └── anticheat/           # Input validation, anomaly detection
└── shared/
    ├── constants.ts          # Game constants, physics params
    ├── types.ts              # Shared TypeScript types
    ├── protocol.ts           # Network message definitions
    └── wasm-types.ts         # TypeScript types matching WASM API
```

### 3.3 Three.js Rendering
- **Scene graph**: Moon terrain, landers, projectiles, particles, structures
- **LOD system** for terrain:
  - Orbital: icosphere with low subdivision
  - Regional: higher subdivision, visible features
  - Local: full detail mesh with displacement map
- **Instanced rendering** for repeated objects (rocks, particles)
- **Post-processing**: bloom (engine glow), tone mapping (HDR)
- Shadow mapping for sun shadows on terrain

### 3.4 Client-Side Prediction & Reconciliation
- Client runs the **same WASM physics** as the server
- Client predicts its own state locally (WASM tick at 60Hz)
- Server sends authoritative state at 20 Hz
- Client reconciles: if prediction diverges > threshold, smooth-correct to server state
- Smooth interpolation for other players (buffer 2-3 ticks)
- **Zero divergence in normal play** — same WASM binary, same inputs = same outputs

---

## 4. Server Architecture

### 4.1 Runtime: Bun
- **Bun** as the JavaScript/TypeScript runtime
- Bun advantages for this project:
  - **Native TypeScript** — no build step for the server, runs `.ts` directly
  - **Built-in WebSocket server** — no `ws` or `socket.io` dependency needed
  - **Built-in test runner** — `bun test` for unit/integration tests
  - **Faster startup and I/O** than Node.js
  - **WASM support** — loads the same `lunar-physics.wasm` as the client
- Single-threaded game loop; Bun's worker threads for spatial partitioning and network I/O
- The game loop itself is thin — it pipes inputs into WASM and reads events out

### 4.2 Game Loop (Server)

```
setInterval at 60Hz:
  1. Collect all pending player inputs from WebSocket buffers
  2. Call WASM: apply_input() for each player
  3. Call WASM: tick() — runs full physics simulation
  4. Call WASM: read_events() — collisions, landings, destructions
  5. Process events (scoring, damage, level completion)
  6. Call WASM: read_states() — read entity positions/velocities
  7. Build delta-compressed state updates per spatial region
  8. Send updates to players via WebSocket
```

The server TypeScript is thin orchestration — all heavy computation is Rust/WASM.

### 4.3 Networking
- **WebSocket** for real-time bi-directional communication (Bun built-in)
- Binary protocol (not JSON) for performance:
  - Custom packet format with `DataView` for encoding/decoding
  - Delta compression for state updates (only send what changed)
  - Sequence numbers for ordering and reconciliation

#### Packet Types
| ID | Direction | Purpose |
|---|---|---|
| 0x01 | C→S | Player input (thrust, rotation, fire) |
| 0x02 | S→C | World state (positions, velocities) |
| 0x03 | S→C | Player spawn / despawn |
| 0x04 | C→S | Spawn request (position, lander) |
| 0x05 | S→C | Damage event |
| 0x06 | S→C | Score update |
| 0x07 | C→S | Emote |
| 0x08 | S→C | Level event (start, complete, fail) |
| 0x09 | C→S | Upgrade purchase |
| 0x0A | S→C | Leaderboard update |

### 4.4 Spatial Partitioning
- Implemented in Rust/WASM (`spatial.rs`) — spherical grid
- Moon surface divided into cells (~500m game-scale each)
- **Altitude bands**: 0-500m, 500m-5km, 5km-50km, 50km+
- Players receive updates for:
  - Same cell + adjacent cells (surface detail)
  - Same altitude band (broad awareness)
  - All players at orbital altitude (everyone sees everyone in orbit)
- TypeScript wrapper queries the WASM spatial grid

### 4.5 State Storage
- **Redis** for:
  - Active player sessions (ephemeral)
  - Leaderboard (sorted sets, fast reads)
  - Daily state (reset timer, world events)
- **No persistent database** for MVP — all player progress in localStorage
- Server stores a **hash of player progress** for validation:
  - On connect: client sends progress hash
  - Server validates against known XP transactions
  - Tampered progress = reset to verified state

### 4.6 Anti-Cheat Measures
| Vector | Mitigation |
|---|---|
| Speed hack | Server validates all movement — WASM physics is authoritative |
| Teleport | Server rejects positions not reachable from last known state |
| Infinite fuel | WASM tracks fuel, inputs ignored when fuel = 0 |
| Aimbot | Projectiles are slow + gravity-affected, hard advantage |
| Score injection | Server-authoritative scoring, client never sends score |
| Modified physics | Same WASM binary — can't modify compiled Rust |

### 4.7 Scaling: Multiple Processes

When one process can't handle all players:

```
                    ┌──────────────────┐
                    │   Load Balancer   │
                    │   (WebSocket)     │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌────────┐
         │ Server │    │ Server │    │ Server │
         │ Proc 1 │    │ Proc 2 │    │ Proc 3 │
         │ (NE    │    │ (SW    │    │ (Orbit │
         │ sector)│    │ sector)│    │ zone)  │
         └────────┘    └────────┘    └────────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                        ┌────────┐
                        │ Redis  │
                        │ (sync) │
                        └────────┘
```

- Each process owns a region of the Moon
- When a player crosses a boundary, they "migrate" to the new process
- Redis pub/sub syncs cross-region events
- Start with 1 process, scale to N as needed

---

## 5. Build Pipeline

### 5.1 Rust → WASM Build

```bash
# Build the WASM module (release optimized)
cd crates/lunar-physics-wasm
wasm-pack build --target web --release

# Output:
#   pkg/lunar_physics_wasm.js       # JS glue (wasm-bindgen)
#   pkg/lunar_physics_wasm_bg.wasm  # The compiled WASM binary
#   pkg/lunar_physics_wasm.d.ts     # TypeScript declarations
```

- `wasm-pack` with `wasm-bindgen` generates the JS bridge
- `--target web` outputs ES modules consumable by Vite
- Release build applies LLVM optimizations + LTO
- Output ~100-200KB gzipped

### 5.2 Development Workflow

```bash
# Terminal 1: Build WASM in watch mode
cd crates/lunar-physics-wasm
cargo watch -s 'wasm-pack build --target web --dev'

# Terminal 2: Run Vite dev server (client)
cd src/client
bun run dev

# Terminal 3: Run Bun server
cd src/server
bun run --watch main.ts
```

### 5.3 Production Build

```bash
# 1. Build WASM (release)
cd crates/lunar-physics-wasm && wasm-pack build --target web --release

# 2. Build client (Vite)
cd src/client && bun run build

# 3. Start server
cd src/server && bun run main.ts
```

---

## 6. Audio System

### 6.1 Sound Design Philosophy
- "Sounds like you would hear in space" — interior/radio-style audio
- Sounds muffled, transmitted through the lander hull
- Radio static on distant events
- Deep bass for thrust, sharp static for weapons

### 6.2 Audio Implementation
- **Web Audio API** for spatial audio
- 3D positional audio for nearby events
- Radio-filtered audio for distant/global events
- Priority system (thrust, explosions, weapons > ambient)

### 6.3 Sound Categories
| Sound | Style | Trigger |
|---|---|---|
| Main engine | Deep rumble, bass-heavy | Thrust active |
| RCS thrusters | Short hisses, puffs | Rotation input |
| Weapon fire | Sharp crack, static burst | Shooting |
| Projectile impact | Crunch, metal deformation | Hit on lander |
| Explosion | Deep boom, static fade | Lander destroyed |
| Landing (soft) | Gentle thud + dust hiss | Successful touchdown |
| Landing (hard) | Harsh scrape, metal groan | Rough touchdown |
| Warning alarm | Beeping tone | Low fuel / low altitude + fast |
| Ambient | Low hum, subtle radio noise | Always (very quiet) |
| Emote | Quick audio stinger | Emote played |
