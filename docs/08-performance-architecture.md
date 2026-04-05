# Lunar3D — Performance Architecture

> How we make a browser-based MMO with orbital mechanics, real-time physics, and PvP run at 60fps with 100+ concurrent players.

## 1. Performance Budget

| Metric | Target | Hard Limit |
|---|---|---|
| Client FPS (desktop) | 60 fps | Never below 30 |
| Client FPS (mobile) | 30 fps | Never below 20 |
| Frame time budget | 16.6 ms | 33 ms |
| Physics tick (server) | 60 Hz | 60 Hz fixed |
| Physics tick (client prediction) | 60 Hz | Matches render |
| Network send rate (server→client) | 20 Hz per player | 10 Hz minimum |
| Network bandwidth per player | < 10 KB/s down | < 20 KB/s |
| Server CPU per player | < 0.5 ms/tick | < 1 ms/tick |
| Total memory (client) | < 500 MB | < 1 GB |
| WASM module load time | < 2 s | < 5 s |
| Time to first frame | < 3 s | < 5 s |

---

## 2. Rendering Pipeline (Three.js / WebGL)

### 2.1 Terrain LOD — The Biggest Win

The round planet with terrain detail is the #1 performance challenge. We solve it with **quadtree-based LOD** on a sphere.

#### Chunked LOD Sphere
- Moon surface is a sphere divided into **chunks** (rectangular patches on the surface)
- Each chunk is a mesh with variable subdivision
- A **quadtree per hemisphere** (or per visible face) manages LOD levels:

```
LOD 0: Entire hemisphere = 1 mesh (~64 triangles)      [orbital view]
LOD 1: Hemisphere split into 4 chunks (~256 triangles)  [high orbit]
LOD 2: Each chunk split into 4 (~1024 triangles)        [low orbit]
LOD 3: Further split (~4096 triangles per chunk)         [high altitude flight]
LOD 4: Full detail (~16384 triangles per chunk)          [near surface]
LOD 5: Ultra detail (~65536 triangles per chunk)         [landing approach]
```

- **Camera distance to chunk center** determines LOD level
- Chunks smoothly transition: generate new mesh, cross-fade alpha, swap
- **Only render chunks visible to camera** (frustum culling at chunk level)
- Chunks behind the planet (horizon occluded) are skipped entirely

#### Vertex Data
- Each chunk mesh stores: position, normal, UV (for texture splatting)
- Height displacement done in **vertex shader** from a heightmap texture
- This means we can change LOD without re-uploading geometry — just change displacement scale

### 2.2 GPU-Driven Terrain

Move as much terrain work to the GPU as possible:

```
CPU side:                          GPU side (vertex shader):
- Determine visible chunks         - Apply heightmap displacement
- Determine LOD level              - Calculate normals from heightmap
- Upload heightmap textures        - Apply morph between LOD levels
- Upload chunk transforms          - Apply curvature correction
```

- **Heightmap textures** are the primary data format (not meshes)
- Each chunk references a region of a larger heightmap texture atlas
- Vertex shader displaces vertices using `texture2D(heightmap, uv)`
- **Zero CPU terrain deformation** — crash marks are decal overlays, not mesh changes

### 2.3 Occlusion & Culling

| Technique | What It Does | Savings |
|---|---|---|
| **Frustum culling** | Don't render what camera can't see | 50-70% fewer draw calls |
| **Horizon culling** | Don't render chunks behind the planet curve | 30-50% fewer terrain chunks |
| **Distance culling** | Fade out / skip far-away small objects | Fewer entities to draw |
| **Backface culling** | Skip faces pointing away from camera | Standard, always on |
| **Occlusion queries** | Skip objects behind terrain | Optional, complex but powerful |

### 2.4 Instanced Rendering

Objects that appear many times are instanced:

| Object | Estimated Count | Rendering |
|---|---|---|
| Rocks / boulders | 1,000+ | InstancedMesh (1 draw call) |
| Surface details | 500+ | InstancedMesh |
| Other landers | 10-100 | Individual (need unique animation state) |
| Projectiles | 50-500 | InstancedMesh (1 draw call) |
| Particles | 1,000-10,000 | GPU particles (see below) |
| Stars | Fixed | Static skybox / point cloud |

### 2.5 Particle Systems — GPU Particles

Don't simulate particles on CPU. Use **GPU compute** (WebGL2 transform feedback or WebGPU compute shaders):

- Exhaust flames → GPU particle emitter, position + velocity + lifetime in buffer
- Explosion debris → GPU particle burst
- Dust clouds → GPU particle emitter (surface-relative)
- Engine trails → GPU ribbon renderer

**CPU sends**: emitter position, direction, rate, lifetime
**GPU does**: position update, fade, size animation, billboard rendering

### 2.6 Shader Optimization

- **Minimal overdraw**: sort opaque objects front-to-back
- **Deferred considerations**: for many lights (lander lights, explosions), consider deferred rendering or light volumes
- **LOD on shaders too**: distant objects use simpler materials (no normal maps, simpler lighting)
- **Texture atlasing**: one large texture atlas for terrain, not hundreds of small textures
- **Texture streaming**: load high-res textures only for nearby chunks

### 2.7 Render Pipeline Summary

```
Each frame (16.6ms budget):
  
  [0-2ms]   Update chunk LOD (quadtree traversal, ~100 chunks max visible)
  [0-1ms]   Update instanced meshes (projectiles, rocks)
  [0-1ms]   Update GPU particle buffers
  [1-3ms]   Upload uniform data (transforms, camera, lighting)
  [3-8ms]   GPU render pass:
              - Skybox (1 draw call)
              - Terrain chunks (~20-50 draw calls, LOD-appropriate)
              - Lander meshes (1 per player, ~10-100 draw calls)
              - Instanced objects (3-5 draw calls)
              - GPU particles (1-2 draw calls)
              - HUD / overlay (separate DOM, zero GPU cost)
  [0-1ms]   Post-processing (bloom, tone mapping)
  ─────────
  [4-16ms]  Total → 60fps achievable
```

---

## 3. Custom Physics Engine — Optimized

### 3.1 Spatial Data Structures

#### For the round planet: Spherical Grid
- Moon surface divided into a **spherical grid** (latitude/longitude cells)
- Each cell tracks: entities in it, terrain height at corners, landing pads
- Cell size: ~500m (game scale) → ~160 cells around equator, ~80 pole-to-pole
- Fast lookup: convert (x,y,z) position → (lat, lon) → cell index

#### For nearby interactions: Grid + Sweep
- **Broad phase**: spherical grid lookup (O(1) — find cell, check neighbors)
- **Narrow phase**: only test collisions between entities in same/adjacent cells

### 3.2 Collision Detection — Minimal Work

| Check | Method | Frequency |
|---|---|---|
| Lander vs terrain | Single raycast downward + sphere-mesh test near surface | Every tick |
| Projectile vs terrain | Ray segment from last pos → current pos | Every tick |
| Projectile vs lander | Sphere-sphere (broad), ray-sphere (narrow) | Every tick, only nearby |
| Lander vs lander | Sphere-sphere | Every tick, only nearby |
| Lander vs landing pad | Point-in-circle on surface plane | Only when near surface |

**Key optimization**: at orbital altitude, terrain collision is trivially "are we above max terrain height?" — skip all detailed checks.

### 3.3 Fixed Timestep with Accumulator

```
const FIXED_DT = 1/60;
let accumulator = 0;

function gameLoop(realDt) {
  accumulator += realDt;
  // Cap to prevent spiral of death
  if (accumulator > 0.1) accumulator = 0.1;
  while (accumulator >= FIXED_DT) {
    physicsTick(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  // Interpolate for rendering between physics states
  const alpha = accumulator / FIXED_DT;
  interpolateRenderState(alpha);
}
```

- Physics always deterministic at 60 Hz
- Rendering is smooth (interpolation between ticks)
- No spiral-of-death on slow frames

### 3.4 Gravity Calculation — Fast Approximation

Exact inverse-square gravity for every entity every tick is expensive at scale. Optimizations:

- **Pre-compute gravity magnitude** for common altitudes (lookup table)
- For entities on/near surface (90% of gameplay): gravity is **constant** (1.62 m/s²)
- Only compute full inverse-square for entities above 2× surface radius
- Batch gravity updates: all entities at similar altitude share the same calculation

### 3.5 Projectile Management

- **Object pool in Rust** for projectiles (free-list allocator, zero allocation during gameplay)
- Max projectile lifetime: 30 seconds (despawn after)
- Max active projectiles per player: 20
- Server-side: projectiles in cells with no players are simulated at reduced rate (1 Hz)
- Projectile simulation is pure Rust/WASM — gravity, collision checks all in WASM tick

---

## 4. Networking — Minimum Bandwidth

### 4.1 Binary Protocol

Every byte matters. Use a tight binary format:

```
Packet header (2 bytes):
  [byte 0] packet type (4 bits) + flags (4 bits)
  [byte 1] sequence number

State update for one entity (14-22 bytes):
  [2 bytes] entity ID (uint16)
  [3 bytes] position X (float24 — sufficient precision)
  [3 bytes] position Y (float24)
  [3 bytes] position Z (float24)
  [2 bytes] velocity X (int16, fixed-point)
  [2 bytes] velocity Y (int16)
  [2 bytes] velocity Z (int16)
  [1 byte]  rotation (compressed quaternion, smallest-three encoding)
  [1 byte]  health + flags (bitfield)
  [1 byte]  fuel (uint8 percentage)
```

- **float24**: custom 24-bit float, enough precision for game positions (saves 33% vs float32)
- **Smallest-three quaternion**: encode 4-component quaternion in 3 bytes (reconstruct 4th from normalization)
- **Fixed-point velocity**: velocities in a game don't need float32 range

### 4.2 Delta Compression

- Server tracks **last acknowledged state** per player
- State updates only include **fields that changed** since last ack
- Bitfield at start of update: which entities are included
- Typical update: 10-20 entities × 14 bytes = **140-280 bytes per update**
- At 20 Hz = **2.8-5.6 KB/s** download per player ✅

### 4.3 Input Upload (Client → Server)

- Client sends inputs at 60 Hz but **batched**:
- Collect all inputs for a frame into one small packet:

```
Input packet (4-8 bytes):
  [1 byte] sequence + flags
  [1 byte] thrust level (uint8, 0-255)
  [1 byte] rotation input (int8, -128 to 127)
  [1 byte] aim direction X (int8)
  [1 byte] aim direction Y (int8)
  [1 byte] buttons (fire, boost, brake, emote — bitfield)
```

- 6 bytes × 60 Hz = 360 bytes/s upload — **negligible**

### 4.4 Spatial Interest Management

The single biggest server-side optimization. Players only receive data about nearby players:

```
For each player P:
  1. Determine P's cell in the spatial grid
  2. Find all entities in P's cell + adjacent cells (surface)
  3. Find all entities in same altitude band
  4. Find all entities at orbital altitude (always visible)
  5. Build delta state update for only those entities
  6. Send to P
```

With 100 players spread across the Moon, each player typically receives updates for **10-20 nearby players**, not all 100. This is O(neighbors) not O(all players).

### 4.5 Server Broadcast Architecture

```
                    ┌──────────────┐
                    │  Game State  │
                    │  (authoritative) │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │ Spatial│  │ Spatial│  │ Spatial│
         │ Region │  │ Region │  │ Region │
         │  A     │  │  B     │  │  C     │
         └───┬────┘  └───┬────┘  └───┬────┘
             │           │           │
        ┌────┴───┐  ┌───┴────┐  ┌──┴─────┐
        │Players │  │Players │  │Players │
        │ in A   │  │ in B   │  │ in C   │
        └────────┘  └────────┘  └────────┘
```

- Each spatial region builds its own state snapshot
- Players in that region receive that snapshot
- Overlapping regions handle boundary players

---

## 5. Memory Management

### 5.1 Object Pooling (Rust-side)

**Never allocate during gameplay.** Rust's allocator pre-allocates everything at simulation init:

```rust
pub struct Simulation {
    // Free-list entity allocator — O(1) acquire/release
    free_entities: Vec<u32>,
    
    // Pre-allocated component arrays (sized to MAX_ENTITIES)
    positions: Vec<[f32; 3]>,
    velocities: Vec<[f32; 3]>,
    // ... all other components
    
    // Pre-allocated event queue (ring buffer)
    events: Vec<SimEvent>,
    event_count: usize,
}

impl Simulation {
    pub fn spawn_entity(&mut self, entity_type: EntityType) -> u32 {
        let id = self.free_entities.pop().expect("entity limit reached");
        // Zero-initialize all components for this entity
        self.positions[id as usize] = [0.0, 0.0, 0.0];
        // ...
        id
    }
    
    pub fn destroy_entity(&mut self, id: u32) {
        self.free_entities.push(id);
        // Mark components as inactive
    }
}
```

**Pool sizes (pre-allocated at init):**
| Type | Pool Size | Notes |
|---|---|---|
| Player landers | 200 | Concurrent player cap estimate |
| Projectiles | 4,000 | 20 per player × 200 players |
| Particles | 10,000 | Managed in WASM, rendered on GPU |
| Events per tick | 1,000 | Ring buffer, overwritten |
| Collision pairs | 500 | Broad phase output |

### 5.2 Typed Arrays Everywhere (Rust ↔ JS Boundary)

All data crossing the Rust/WASM ↔ TypeScript boundary uses **flat typed array buffers** — zero serialization overhead:

- Entity positions: `Float32Array` of `[x0,y0,z0, x1,y1,z1, ...]`
- Velocities: same format, parallel array
- Rust reads/writes directly into shared `WebAssembly.Memory`
- TypeScript reads from the same buffer via `Float32Array` view
- **Zero-copy** — no JSON, no object creation, no serialization

```typescript
// TypeScript side — zero-copy read from WASM memory
const stateBuffer = new Float32Array(wasm.memory.buffer, statePtr, count * 8);
// [x,y,z, vx,vy,vz, health, fuel] per entity, tightly packed

for (let i = 0; i < count; i++) {
  const offset = i * 8;
  mesh.position.set(stateBuffer[offset], stateBuffer[offset+1], stateBuffer[offset+2]);
}
```

### 5.3 Entity Component System (ECS) in Rust

The ECS is implemented in Rust (not TypeScript). Entity data lives entirely in WASM memory:

```
Components (Rust structs):    Position, Velocity, Thrust, Health, Collider, Projectile
Systems (Rust functions):     GravitySystem, ThrustSystem, CollisionSystem, DamageSystem
Storage:                      Vec<[f32; N]> — contiguous, SIMD-friendly
```

- Entities are just `u32` IDs
- Components stored in contiguous typed vectors (SoA layout)
- Systems iterate over vectors — cache-friendly, no pointer chasing, auto-vectorized
- TypeScript never touches entity data — it reads rendered positions from WASM buffer

---

## 6. Server-Side Performance (Bun)

### 6.1 Single-Threaded Game Loop

The game simulation runs on a **single thread** (deterministic, simple):

```
setInterval at 60Hz:
  1. Process all pending inputs (from WebSocket messages)
  2. Run physics tick for all entities
  3. Process collisions
  4. Update scoring
  5. Build state snapshots per spatial region
  6. Send updates to players
```

- No locks, no race conditions
- All state is in one thread
- Bun's fast I/O handles WebSocket message batching efficiently

### 6.2 Scaling: Multiple Processes

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
- Redis pub/sub syncs cross-region events (projectiles crossing boundaries, etc.)
- Start with 1 process, scale to N as needed

### 6.3 Physics: Rust/WASM (Already the Core)

The entire physics engine is written in Rust and compiled to WASM (see `docs/07-technical-architecture.md` for full details). This is not an optimization to add later — **it's the foundation**.

**Why this is the right call:**
- Rust loops over flat `Vec<[f32; 3]>` arrays = LLVM auto-vectorizes with SIMD
- No GC, no hidden allocations, no JIT warmup — consistently fast
- Deterministic: same `.wasm` binary on client and server = identical simulation
- Bun loads WASM via `WebAssembly.instantiate()` — near-native call overhead
- Browser loads same WASM via `wasm-bindgen` glue — same performance

**Rust-specific optimizations to enable:**

```rust
// SIMD-annotated gravity update (LLVM auto-vectorizes this)
#[inline(always)]
pub fn update_gravity(
    positions: &[[f32; 3]],
    velocities: &mut [[f32; 3]],
    moon_radius: f32,
    moon_gm: f32,
    dt: f32,
) {
    for i in 0..positions.len() {
        let r = positions[i][0].hypot(positions[i][1].hypot(positions[i][2]));
        let r = r.max(moon_radius); // clamp to surface
        let g = moon_gm / (r * r);
        let nx = -positions[i][0] / r;
        let ny = -positions[i][1] / r;
        let nz = -positions[i][2] / r;
        velocities[i][0] += nx * g * dt;
        velocities[i][1] += ny * g * dt;
        velocities[i][2] += nz * g * dt;
    }
}
```

### 6.4 Shared Physics WASM Module

```
crates/lunar-physics/
  → compiled to: lunar_physics_wasm_bg.wasm (~150KB gzipped)
  
  Loaded by:
    Bun server → WebAssembly.instantiate() → called 60x/sec in game loop
    Browser client → wasm-bindgen ES module → called 60x/sec for prediction
    
  Both sides run IDENTICAL code. Zero drift.
```

### 6.5 Rust Build Optimizations

```toml
# Cargo.toml — release profile for WASM
[profile.release]
opt-level = 3
lto = true
codegen-units = 1          # single CGU = better optimization
strip = true               # smaller binary
panic = "abort"            # no unwinding = smaller binary

[dependencies]
wasm-bindgen = "0.2"
# NO std dependency where possible
```

- `wasm-opt` pass in CI for further binary size reduction
- Target `wasm32-unknown-unknown` (browser-compatible WASM)
- `cargo bench` for continuous performance regression testing

---

## 7. Client-Side Prediction & Interpolation

### 7.1 Prediction Algorithm

```
Every client frame:
  1. Apply local player's inputs to predicted state
  2. Run WASM physics tick on predicted state
  3. Render predicted state (smooth, no waiting for server)
  
When server state arrives (20 Hz):
  4. Compare predicted state vs server state
  5. If error < threshold (0.5m position, 1 m/s velocity):
     → Keep prediction (smooth)
  6. If error >= threshold:
     → Smoothly correct toward server state over 100ms
  7. Re-simulate any inputs server hasn't acknowledged yet
```

### 7.2 Other Players — Interpolation

- Server sends other player positions at 20 Hz
- Client **buffers 2 snapshots** (100ms delay)
- Interpolates between snapshots for smooth rendering
- Never extrapolate (causes jitter) — accept the 100ms visual delay for other players

### 7.3 Projectiles — Hybrid Approach

- **Own projectiles**: client predicts trajectory (WASM physics), shows immediately
- **Other players' projectiles**: server-authorized, interpolated
- Client reconciles own projectile positions with server when updates arrive
- If discrepancy: snap to server position (projectiles are small, snapping is invisible)

---

## 8. Loading & Startup Performance

### 8.1 Code Splitting & Lazy Loading

```
Initial load (< 2 seconds):
  - Vite entry bundle (minimal)
  - Three.js core (tree-shaken)
  - Main menu UI
  - shared-physics.wasm (compiled, ~50KB)

After "PLAY" is clicked (< 1 second):
  - Terrain LOD system
  - Entity renderers
  - Particle systems
  - Audio engine

During gameplay (streamed):
  - Terrain heightmaps (loaded per region)
  - Texture atlas chunks
  - Sound effects (loaded on first use)
```

### 8.2 Asset Optimization

| Asset | Format | Optimization |
|---|---|---|
| Textures | WebP / KTX2 (Basis Universal) | GPU-compressed, mipmapped |
| Heightmaps | 16-bit PNG → Float32 | Load once per region |
| 3D models | glTF binary | Draco compressed |
| Shaders | GLSL → bundled in JS | Minified |
| WASM | Optimized build (~100KB) | Streamed compilation |
| Fonts | WOFF2 | Subsets only |

### 8.3 Web Workers

Offload heavy non-rendering work to Web Workers:

| Worker | Responsibility |
|---|---|
| **Physics worker** | Runs WASM physics prediction at 60Hz, posts state to main thread |
| **Network worker** | WebSocket handling, packet encoding/decoding |
| **Terrain worker** | Chunk mesh generation, LOD calculations |

Main thread only: Three.js rendering + input handling + DOM updates.

---

## 9. Performance Monitoring

### 9.1 Built-In Metrics (Development)

```
┌────────────────────────────────────────┐
│ PERF MONITOR (toggle with F3)         │
│                                        │
│ FPS: 60 (16.2ms)     GPU: 8.1ms       │
│ Physics: 2.3ms       Network: 1.1ms   │
│ Entities: 47         Chunks: 23       │
│ Draw calls: 68       Triangles: 42K   │
│ Memory: 187 MB       Bandwidth: 4KB/s │
│ GC pauses: 0 (last 5s)                │
│ Server tick: 16.4ms  Players: 34      │
└────────────────────────────────────────┘
```

### 9.2 Performance Regression Testing

- Automated benchmarks in CI: `bun test --bench`
- Key metrics tracked over time:
  - Physics tick duration for 100 entities
  - Terrain chunk generation time
  - Network packet encode/decode throughput
  - WASM function call overhead
  - Memory allocation rate (GC pressure indicator)

---

## 10. Optimization Priority Matrix

Ordered by **impact × effort** — do these first:

| # | Optimization | Impact | Effort | When |
|---|---|---|---|---|
| 1 | **Terrain chunked LOD** | 🔴 Critical | High | Day 1 architecture |
| 2 | **Object pooling** | 🔴 Critical | Low | Day 1 architecture |
| 3 | **Binary network protocol** | 🟡 High | Medium | Networking phase |
| 4 | **Spatial interest management** | 🔴 Critical | Medium | Networking phase |
| 5 | **WASM physics core (Rust)** | 🟡 High | High | After JS physics works |
| 6 | **Typed arrays / ECS** | 🟡 High | Medium | Day 1 architecture |
| 7 | **GPU particles** | 🟡 High | Medium | Particle phase |
| 8 | **Instanced rendering** | 🟡 High | Low | Entity rendering phase |
| 9 | **Delta compression** | 🟠 Medium | Medium | Networking phase |
| 10 | **Web Workers** | 🟠 Medium | Medium | Optimization phase |
| 11 | **Frustum + horizon culling** | 🟠 Medium | Low | Terrain phase |
| 12 | **Texture streaming** | 🟢 Nice-to-have | Medium | Polish phase |
| 13 | **Multi-process server** | 🟢 As needed | High | When player count demands |
