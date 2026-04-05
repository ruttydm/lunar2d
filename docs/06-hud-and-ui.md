# Lunar3D — HUD & User Interface

## 1. HUD Layout (In-Game)

### 1.1 Primary HUD Elements

```
┌──────────────────────────────────────────────────────────────┐
│  [Score: 2,340] [Rank: #12]                    [Minimap ●]  │
│                                                               │
│  ┌─THROTTLE──┐                                                │
│  │ ████      │                                                │
│  │ ████  85% │                                                │
│  │ ████      │                 ┌─────────────┐               │
│  │ ░░░░      │                 │   3D View   │               │
│  └───────────┘                 │             │               │
│                                 └─────────────┘               │
│  ┌──────────┐                                                │
│  │ ALTITUDE │         ┌─────────────────┐      ┌─────────┐  │
│  │  2,340m  │         │   █ NAV BALL █  │      │  FUEL   │  │
│  │          │         │   ╱  ▲PRO   ╲   │      │ ████░░░ │  │
│  │ VELOCITY │         │  │  ●horizon │  │      │   68%   │  │
│  │  45 m/s  │         │   ╲  ▼RETRO ╱   │      └─────────┘  │
│  │  ↕ 12    │         └─────────────────┘                    │
│  │  ↔ 38    │                            ┌──────────────┐   │
│  └──────────┘                            │   HP  ████░  │   │
│                                           │     80/100   │   │
│  [SAS: PRO] [RCS: OFF]                    └──────────────┘   │
│  [🎯 Pad: 1.2km →]  [Lander: Scout]  [Emotes 😊]            │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 HUD Components

| Component | Position | Info Shown | Unlock |
|---|---|---|---|
| **Nav Ball** | Bottom-center | 3D attitude ball (KSP-style) with prograde/retrograde/radial markers | Always |
| **Throttle bar** | Left side | Persistent vertical throttle gauge (0-100%) | Always |
| **Altitude** | Bottom-left | Height above terrain + sea level | Always |
| **Velocity** | Bottom-left | Speed + vertical/horizontal split | Always |
| **Fuel gauge** | Right side | Fuel remaining (bar + percentage) | Always |
| **HP bar** | Bottom-right | Current / max HP | Always |
| **SAS mode indicator** | Bottom-left | Current SAS mode (Off/Stability/Prograde/Retrograde/etc.) | Always |
| **RCS indicator** | Bottom-left | RCS on/off + fuel usage | Always |
| **Score & Rank** | Top-left | Current daily score + rank | Always |
| **Minimap** | Top-right | Local area, nearby players, pads | Always |
| **Landing pad indicator** | Bottom-center | Direction + distance to nearest pad | Always |
| **Lander name** | Bottom-right | Current lander type | Always |
| **Velocity vector** | Center overlay | Arrow showing travel direction (prograde marker) | Nav Tier I |
| **Trajectory line** | 3D overlay | Predicted path to surface (sub-orbital arc) | Nav Tier II |
| **Orbital ellipse** | 3D overlay | Full orbit path + Ap/Pe markers + time to Ap/Pe | Nav Tier III |
| **Threat indicator** | Edge of screen | Direction of incoming fire | Always |

### 1.3 Orbital Map View (KSP-Style)
- Toggled with **M key**
- Camera pulls back to show the full Moon as a sphere
- **Your orbit**: rendered as a colored ellipse (blue for prograde half, orange for retrograde)
- **Apoapsis (Ap) marker**: highest point of orbit, with altitude label
- **Periapsis (Pe) marker**: lowest point of orbit, with altitude label
- **Other players**: rendered as small green dots with name labels on their orbits
- **Landing pads**: rendered as markers on the Moon's surface
- **Click on a pad** to set it as navigation target → shows encounter trajectory
- **Mouse wheel**: zoom in/out
- **Click + drag**: rotate the map view
- Game continues running (server doesn't pause) but client enters map mode
- Your lander continues on its current trajectory while you're in map view (risk!)
- **Time warp not available** — real-time only (multiplayer constraint)

---

## 2. Menus & Screens

### 2.1 Title Screen
```
┌────────────────────────────────────────────┐
│                                            │
│              🌙 LUNAR 3D 🌙               │
│                                            │
│         Enter your name: [________]        │
│                                            │
│            [ ▶ PLAY NOW ]                  │
│                                            │
│         [Leaderboard] [Controls]           │
│           [Upgrades] [Settings]            │
│                                            │
│        Moon rotates slowly in background   │
└────────────────────────────────────────────┘
```

### 2.2 Spawn Selection Screen
- Shows Moon globe (rotatable)
- Available spawn points marked:
  - 🟢 Orbital Station (always available)
  - 🔵 Unlocked landing pads
  - 🔴 Pads in PvP hot zones (warning icon)
- Click to select → **SPAWN** button
- Shows current lander selection + switch option

### 2.3 Upgrade Screen
- Full-screen overlay (accessible from menu or death screen)
- Visual tech tree with 6 branches
- Each node shows: name, description, cost, current tier
- Purchased nodes glow, locked nodes greyed out
- **Respec** button in corner (once per daily cycle)
- Total XP displayed at top

### 2.4 Leaderboard Screen
- Full daily leaderboard: Rank, Name, Score, Lander
- Top 3 highlighted with gold/silver/bronze
- Player's own row always visible at bottom
- Previous day's top 10 shown below (ghost leaderboard)

### 2.5 Death Screen
```
┌────────────────────────────────────────────┐
│                                            │
│            💥 DESTROYED 💥                 │
│                                            │
│        Killed by: [PlayerName]             │
│   (or "Crashed into terrain")              │
│                                            │
│     [Respawn] [Change Lander] [Upgrades]   │
│                                            │
└────────────────────────────────────────────┘
```
- Minimum 2-second display before options appear
- Shows kill credit or crash cause

### 2.6 Level Completion Screen
```
┌────────────────────────────────────────────┐
│                                            │
│           ✅ LANDED SUCCESSFULLY           │
│                                            │
│   Precision:    ████████░░  +180 pts       │
│   Speed:        ██████░░░░  +120 pts       │
│   Fuel Bonus:   █████████░  +160 pts       │
│   Streak:       x3          +30 pts        │
│                                            │
│   TOTAL:                    +490 pts       │
│   +150 XP                                  │
│                                            │
│         [Continue] [Upgrades]              │
│                                            │
└────────────────────────────────────────────┘
```

---

## 3. Emotes

### 3.1 Emote System
- No text chat — emotes only
- Quick emote wheel (hold E key or tap emote button on mobile)
- 8 emotes in a radial menu:

| Emote | Visual |
|---|---|
| 👍 Thumbs up | Floating emoji above lander |
| 👎 Thumbs down | Floating emoji above lander |
| 🖖 Live long | Floating emoji above lander |
| 💀 Death threat | Skull above lander |
| 😂 Laugh | Floating emoji above lander |
| 🎯 Challenge | Crosshair above lander |
| 🏳️ Surrender | Flag above lander |
| 🚀 Good luck | Rocket above lander |

- Emotes visible to all nearby players (within 500m)
- Persist for 3 seconds then fade

---

## 4. Mobile UI Adaptations

### 4.1 Touch Controls
- **Left joystick** (lower-left): rotation + thrust (push up = thrust, left/right = rotate)
- **Right joystick** (lower-right): aim direction + fire (pull = aim, release = fire)
- **Action buttons** (right side): Boost, Brake Assist
- **Emote button** (top-right): opens emote wheel
- **Map button** (top-left): opens orbital map

### 4.2 HUD Scaling
- All HUD elements scaled up 1.5x on mobile
- Minimap moves to bottom-right corner
- Score/rank bar simplified
- Virtual joystick areas are semi-transparent

---

## 5. Settings

| Setting | Options | Default |
|---|---|---|
| Camera sensitivity | Slider 1–10 | 5 |
| Invert Y-axis | On/Off | Off |
| Camera shake | On/Off | On |
| Show trajectories | On/Off | On (if unlocked) |
| Show other player names | All / Nearby / Off | Nearby |
| Sound volume | Slider 0–100 | 80 |
| Music volume | Slider 0–100 | 50 |
| HUD opacity | Slider 30–100 | 80 |
| Minimap size | Small / Medium / Large | Medium |
