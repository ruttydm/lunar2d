# Lunar3D — Core Gameplay

## 1. Physics Engine

### 1.1 Gravity Model
- **Single dominant body** — the Moon (no multi-body for now)
- Compressed scale: Moon radius ~1,737 km mapped to a playable scale where orbits take **2–5 minutes** instead of hours
- Gravity follows inverse-square law: `g = G*M / r²`
- Players **can achieve stable orbit** if they reach sufficient lateral velocity
- No atmosphere / drag (Moon has none)

### 1.2 Lander Physics
- **Newtonian mechanics** — thrust applies force, velocity persists in vacuum
- Rotation via reaction wheels or RCS thrusters
- Mass affects maneuverability (heavier landers = slower rotation, more thrust needed)
- Fuel is consumed as mass — lander gets lighter and more responsive as fuel depletes
- Collision detection with terrain (craters, hills, pads, structures)

### 1.3 Projectile Physics
- All projectiles are affected by gravity (ballistic arcs on surface, orbital trajectories at altitude)
- No hitscan — everything is a physical projectile with velocity and mass
- Projectile speed is relatively slow, making aiming at distance a skill challenge
- Projectiles can orbit the Moon if fired fast enough (emergent fun)

---

## 2. Landing Mechanics

### 2.1 Landing Success Criteria
A "good landing" is determined by multiple factors (importance varies by level):

| Factor | Description |
|---|---|
| **Touchdown velocity** | Must be below a threshold (varies by lander) |
| **Landing angle** | Lander must be roughly upright (tilt < threshold) |
| **Precision** | Distance from center of landing pad |
| **Fuel remaining** | Bonus points for efficiency |

### 2.2 Landing Failure
- Crash = destruction of lander
- Crash leaves a **dark spot / scorch mark** on the terrain (persists for 1 hour)
- Player respawns without penalty (lose nothing permanent)
- Current level attempt is cancelled

### 2.3 Controls (KSP-Inspired)

Controls borrow heavily from Kerbal Space Program's proven flight model, adapted for our lander-focused PvP gameplay.

#### Flight Modes

Players switch between two flight modes, just like KSP:

| Mode | Description | When to Use |
|---|---|---|
| **Staging Mode** | Thrust relative to lander's orientation (prograde/retrograde relative to ship nose) | Landing approach, combat, precise maneuvers |
| **Orbital Mode** | Thrust relative to orbital frame (prograde/retrograde relative to velocity vector, normal/anti-normal) | Orbital maneuvers, deorbit burns |

Toggle between modes with **M key** (like KSP's map/orbit toggle).

#### Desktop Controls

**Flight:**
| Input | Action | Notes |
|---|---|---|
| Shift | Throttle up | Incremental, stays where you leave it (like KSP) |
| Ctrl | Throttle down | Incremental |
| Z | Throttle to 100% | Full thrust instantly |
| X | Throttle to 0% | Cut engines instantly |
| W / S | Pitch down / up | Rotate around lateral axis |
| A / D | Yaw left / right | Rotate around vertical axis |
| Q / E | Roll left / right | Rotate around longitudinal axis |
| Space | Stage / toggle RCS mode | Context-dependent |
| T | SAS toggle (Stability Assist) | Auto-stabilize to current orientation |
| F | Hold for fine control | Reduces rotation rates for precision |

**Camera:**
| Input | Action | Notes |
|---|---|---|
| Mouse move | Orbit camera around lander | Click + drag to rotate view |
| Scroll wheel | Zoom in/out | |
| Middle click + drag | Pan camera offset | |
| V | Cycle camera mode (chase → free → orbital) | |
| C | Toggle cockpit / external view | |

**Navigation & Targeting:**
| Input | Action | Notes |
|---|---|---|
| M | Toggle orbital map | Shows full orbit, planet, other players |
| Tab | Cycle target (nearest pad, player, etc.) | |
| Mouse aim | Turret / weapon aim direction | |
| Left Click | Fire weapon | |
| Right Click | Alt fire / push mode | Direct exhaust at target |
| R | Toggle RCS translation mode | WASD becomes translation (strafe), not rotation |

**Translation Mode (RCS) — when R is toggled on:**
| Input | Action |
|---|---|
| W / S | Thrust forward / backward (relative to camera) |
| A / D | Thrust left / right |
| Shift / Ctrl | Thrust up / down |
| Q / E | Roll left / roll right (only rotation in translation mode) |

**Other:**
| Input | Action | Notes |
|---|---|---|
| B | Brake assist (auto-retrograde thrust to slow down) | Smart brake, like KSP's "brake" |
| G | Toggle landing gear (visual + collision shape change) | |
| U | Toggle lights | |
| 1-4 | Quick switch lander type (at respawn) | |
| E (hold) | Emote wheel | |

#### SAS (Stability Assist System) — KSP-Style

The SAS is crucial for making the hard-sim controls accessible:

| SAS Mode | Behavior |
|---|---|
| **Off** | No stabilization — lander tumbles freely |
| **Stability** | Holds current orientation, resists rotation |
| **Prograde** | Points nose along velocity vector |
| **Retrograde** | Points nose against velocity vector (for braking) |
| **Radial In** | Points toward Moon center (for landing approach) |
| **Radial Out** | Points away from Moon center (for launching) |
| **Target** | Points toward current target (pad or player) |

- SAS is the **primary accessibility feature** — makes hard sim playable
- SAS uses RCS fuel / reaction wheels (has a cost)
- Higher RCS upgrade tiers = faster SAS response + more modes unlocked
- SAS can be disrupted by damage (adds wobble)

#### Nav Ball — KSP-Style

A nav ball at the bottom of the HUD shows:
- **Current orientation** (the ball rotates with the lander)
- **Prograde/retrograde markers** (yellow/green)
- **Radial in/out markers** (blue/orange)
- **Target marker** (pink)
- **Horizon line** (grey)
- **Surface/target relative mode toggle**

#### Mobile Controls

Adapted for touch while preserving KSP feel:
- **Left virtual joystick** — pitch + yaw (rotation)
- **Right virtual joystick** — camera orbit + aim
- **Throttle slider** (left edge) — persistent slider like KSP's throttle bar
- **RCS toggle button** — switches joystick to translation mode
- **SAS button** — taps cycle SAS modes
- **Brake button** — retrograde burn
- **Fire button** — weapon
- **Emote button** — emote wheel
- **Nav ball** — always visible at bottom (touch to rotate camera to orientation)

#### Gamepad
- Left stick = pitch + yaw
- Right stick = camera orbit
- Left trigger = throttle down (analog)
- Right trigger = throttle up (analog)
- A = SAS toggle
- B = RCS toggle
- X = fire
- Y = brake assist
- Bumpers = roll
- D-pad = SAS mode select
- Start = orbital map

---

## 3. Camera (KSP-Style)

### 3.1 Camera Modes (Cycle with V)

| Mode | Description | When to Use |
|---|---|---|
| **Chase** | Camera follows behind the lander, aligned with orientation | Combat, landing approach |
| **Free / Orbital** | Camera orbits freely around the lander; lander can rotate independently | General flight, inspection |
| **Locked** | Camera locks to a reference frame (surface, orbital, target) | Orbital maneuvers |

### 3.2 Chase Camera (Default)
- Camera sits behind and above the lander
- Follows the lander's rotation (camera rotates with the ship)
- Smooth lag / inertia on camera movement
- Zoom in/out with scroll wheel
- Best for landing and combat

### 3.3 Free Camera
- Click + drag to orbit the camera around the lander freely
- Lander can point in any direction independent of camera
- Like KSP's default external view
- Best for situational awareness, checking surroundings

### 3.4 Camera Behavior
- **Scroll wheel** = zoom in/out (smooth, with min/max limits)
- **Middle click + drag** = pan camera offset (shifts camera without rotating)
- **Double-click** in space = camera points that direction
- Camera automatically avoids clipping into terrain (pushes forward)
- Camera shake on: explosions nearby, high-thrust, terrain impact

### 3.5 Map Camera
- Separate camera system for orbital map view (M key)
- See HUD doc §1.3 for full orbital map details

---

## 4. Level Structure

### 4.1 Open World — GTA-Style Level Activation
- The entire Moon surface is **freely explorable**
- **Level markers** are visible glowing circles on the surface
- Fly to a marker → enter the circle → level activates
- Each level has its own objectives, difficulty, and scoring

### 4.2 Level Types

| Type | Description | Primary Objective |
|---|---|---|
| **Precision Landing** | Land on a small pad with tight tolerances | Touchdown accuracy + velocity |
| **Timed Landing** | Land before countdown expires | Speed + survival |
| **Resource Collection** | Collect floating resources mid-descent before landing | Items collected + safe landing |
| **Obstacle Course** | Navigate through terrain hazards (craters, canyons) to reach pad | Safe passage + landing |
| **Survival** | Land while under fire from AI turrets or environmental hazards | Survival + landing |
| **PvP Hot Zone** | High-value landing pad with heavy player traffic | First to land wins big, or steal others' points |

### 4.3 Difficulty Progression

Levels are scattered across the Moon. Difficulty increases via:

| Dimension | Easy | Medium | Hard | Extreme |
|---|---|---|---|---|
| Landing pad size | Large (50m) | Medium (25m) | Small (10m) | Tiny (5m) |
| Fuel allowance | Generous | Moderate | Tight | Minimal |
| Terrain complexity | Flat plains | Rolling hills | Crater rims | Narrow canyons |
| Gravity anomalies | None | Mild | Strong | Unpredictable |
| Environmental hazards | None | Dust clouds | Meteor showers | Solar flares |
| PvP density | Safe zone | Light | Heavy | FFA warzone |
| Starting position | Low hover | High drop | Sub-orbital | Full orbit |

---

## 5. Safe Zones
- **Landing pad vicinity** is a safe zone — no weapons can be fired within radius
- Pushing / ramming still works (physics don't stop)
- Safe zone is visually indicated (dome or circle on ground)
- Exiting the safe zone makes you vulnerable
