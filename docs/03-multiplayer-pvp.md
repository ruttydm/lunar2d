# Lunar3D — Multiplayer & PvP

## 1. Architecture Overview

### 1.1 MMO .io Model
- **Persistent shared world** — all players on one Moon
- Drop-in / drop-out — no lobbies, no matchmaking queues
- Enter a name → spawn → play immediately
- No accounts, no login

### 1.2 Player Limits
- No hard concurrent player cap designed at this stage
- Server architecture should be horizontally scalable
- Spatial partitioning (grid/quadtree on surface + altitude bands) to manage load

### 1.3 Server Authority
- **Server is authoritative** on physics positions, collisions, damage
- Client sends inputs, server simulates and broadcasts state
- `localStorage` saves progression, but server validates all XP/currency gains
- Anti-cheat: server rejects impossible inputs (speed hacks, teleportation, infinite fuel)

---

## 2. PvP Combat

### 2.1 Weapons & Combat Mechanics

#### Primary: Projectile Cannon
- Fires physical projectiles with mass and velocity
- **Gravity-affected** — projectiles curve toward the Moon's surface
- Slow projectile speed (relative to typical FPS) — requires leading targets
- At orbital altitudes, projectiles can enter orbit themselves
- Damage on impact with other landers

#### Secondary: Thrust Push
- Direct your main engine exhaust at another lander to push them off course
- Effective at close range
- No damage, but can ruin a landing approach or push into terrain
- Creates emergent gameplay (ramming, exhaust fights)

#### Future Considerations (post-MVP)
- Mines (placed in orbit or on surface)
- EMP burst (disable a lander's controls briefly)
- Harpoon / grappling hook

### 2.2 Damage Model
- **Health bar** system — each lander has HP
- Damage depends on projectile mass × relative velocity
- Terrain collision damage proportional to impact speed
- Components not individually modeled (no subsystem damage for MVP)
- When HP reaches 0 → lander explodes

### 2.3 Death & Respawn
- **On death**: lander explodes, leaves a dark spot / scorch mark on terrain (persists 1 hour)
- **No permanent loss** — no XP penalty, no item loss, no currency loss
- **Active level attempt is cancelled** (must re-enter level circle)
- **Respawn flow**:
  1. Death screen (2-second minimum, shows killer name)
  2. Respawn selection: choose a **spawn point** on the map
     - Default: orbital station (safe altitude)
     - Player can pick any unlocked landing pad as spawn
     - Cannot spawn inside another player or inside terrain
  3. Appear at chosen spawn point with full HP and fuel

### 2.4 Safe Zones
- Landing pads have a **no-fire radius** (~100m)
- Projectiles are disabled within the zone
- Physics interactions still work (pushing, collisions)
- Visually marked with a translucent dome or ground ring
- Players inside a safe zone are marked on HUD

---

## 3. World Persistence

### 3.1 Daily Reset Cycle
- **Leaderboard resets every 24 hours** (midnight UTC)
- All scores reset to 0
- Upgrade progress and unlocks persist
- Fresh competition each day

### 3.2 World State
- Crash marks / scorch spots persist for **1 hour real-time**, then fade
- No permanent player structures (MVP scope)
- Landing pads and level markers are static, world-authored content

### 3.3 Concurrency Model
- All players share the same Moon
- Spatial interest management: players only receive updates for nearby players
- High-altitude / orbital players see a broader view but less detail
- Surface players see nearby activity in detail

---

## 4. Scoring & Leaderboard

### 4.1 Point Sources

| Action | Points | Notes |
|---|---|---|
| Successful landing | 100–500 | Based on precision, fuel remaining, speed |
| Precision bonus | +50–200 | Landing within target circle center |
| Fuel efficiency bonus | +25–150 | Landing with fuel to spare |
| Speed bonus | +25–100 | Landing quickly (timed levels) |
| Resource collected | +50 each | Resource collection levels |
| Player kill | 100 | Destroying another player's lander |
| Survival streak | +10 per level per streak | Consecutive landings without death |
| Zone hold | +5/second | King of the hill (if implemented) |

### 4.2 Leaderboard
- **Daily leaderboard** — resets every 24 hours
- Shows: rank, player name, score, lander type
- Top 10 visible on HUD at all times
- Full leaderboard accessible via menu
- Player's own rank always visible

### 4.3 Anti-Cheat Scoring
- Server validates every point-gaining event
- Landing precision is verified server-side (cannot fake coordinates)
- Kill credit is server-authoritative
- Suspicious score rates trigger server-side flags
