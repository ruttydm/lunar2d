# Lunar3D — World Design — The Moon

## 1. Scale & Mapping

### 1.1 Compressed Scale
- Real Moon radius: 1,737.4 km
- **Game scale**: ~10 km radius (1:174 compression)
- This makes low orbit (~15 km altitude in game) achievable in **2–5 minutes** of flight
- Surface distances are traversable in reasonable play sessions
- Gravity feels correct relative to the compressed scale

### 1.2 Gravity
- Surface gravity: **1.62 m/s²** (real Moon gravity)
- Gravity decreases with altitude following inverse-square law
- At game-scale orbit altitude (~15-20 km), gravity is slightly reduced
- Players can achieve stable circular orbit at correct velocity for the scale

### 1.3 No Atmosphere
- No drag, no aerodynamic effects
- Pure Newtonian mechanics at all altitudes
- Future expansion point: add atmosphere for different celestial bodies

---

## 2. Terrain

### 2.1 Heightmap Generation
- Procedurally generated terrain based on seeded noise (Perlin + craters)
- **LOD system**: terrain detail increases as player descends
  - Orbital view: low-poly sphere with major features
  - High altitude: medium detail, visible large craters
  - Low altitude: full detail, rocks, small craters, regolith texture

### 2.2 Terrain Zones (Mapped to Difficulty)

| Zone | Surface Type | Difficulty | Notes |
|---|---|---|---|
| **Mare Tranquillitatis** | Flat, dark plains | Easy | Wide open spaces, beginner area |
| **Mare Serenitatis** | Gently rolling | Easy-Medium | Slight elevation changes |
| **Highlands** | Hilly, rocky | Medium | Elevation changes, scattered craters |
| **Crater Rims** | Steep slopes, narrow ridges | Hard | Dangerous approaches |
| **Deep Craters** | Interior bowl with obstacles | Hard | Must descend into crater to reach pad |
| **Canyons** | Narrow channels | Extreme | Tight margins, no room for error |
| **South Pole** | Permanent shadow, rugged | Extreme | Low visibility, extreme terrain |

### 2.3 Landing Pads
- Scattered across all zones
- Each pad has a **level circle** around it (activation zone)
- Visual appearance: flat metallic surface with lights, beacon
- Size varies by difficulty (50m easy → 5m extreme)
- Connected to level data (objectives, scoring, difficulty)

### 2.4 Structures
- **Ground stations**: buildings near some landing pads (visual, future interaction)
- **Abandoned bases**: scattered ruins for visual interest and obstacles
- **Orbital station**: the default respawn point in low orbit

---

## 3. Visual Style

### 3.1 Aesthetic
- **Realistic NASA-inspired** — grey regolith, harsh contrast, stark lighting
- No atmosphere means sharp shadows, black sky
- Earth visible in the sky (large, blue, beautiful)
- Stars visible at all times (no sky scattering)

### 3.2 Lighting
- **Directional sun light** — creates harsh shadows
- Sun position changes slowly over the daily cycle
- Lander and pad lights provide local illumination
- HDR / tone mapping for realistic exposure

### 3.3 Effects
- **Thrust exhaust** — particle system, illuminates nearby terrain
- **Dust clouds** on landing (kicked up regolith, settles quickly)
- **Explosions** — debris particles, flash, expanding ring
- **Crash marks** — dark scorch spot on terrain (1 hour persistence)
- **Engine trails** — visible exhaust trail behind moving landers

---

## 4. Sky & Space

### 4.1 Skybox
- Black sky with high-res star field
- **Earth** visible as a large sphere (slowly rotating)
- **Sun** as a bright directional light source
- No moon in the sky (you're on it)

### 4.2 Orbital View
- When at high altitude, camera pulls back to show Moon curvature
- Orbital trajectory line shown (if Navigation Tier III unlocked)
- Other players visible as small dots with name tags
- Landing pads visible as points of light on surface

---

## 5. World Grid & Level Placement

### 5.1 Level Distribution
- ~20–30 level locations scattered across the Moon's surface
- Higher concentration of easy levels near Mare regions
- Harder levels deeper in highlands and craters
- At least 3–5 "PvP Hot Zone" levels in contested areas

### 5.2 Travel Between Levels
- Players fly freely between any surface points
- Travel time: 1–3 minutes between adjacent levels at low altitude
- Orbital travel: faster but requires orbital mechanics knowledge
- No fast travel — flight is the game

---

## 6. Daily Cycle

### 6.1 Reset Schedule
- **Daily reset at 00:00 UTC**
- What resets:
  - Leaderboard scores → 0
  - Crash marks → cleared
  - Zone control → neutral
- What persists:
  - Player XP and upgrades
  - Lander unlocks
  - Cosmetic unlocks
  - Player name association (localStorage)

### 6.2 World Events (Future / Post-MVP)
- Meteor shower events (random debris fields)
- Solar flare events (damage over time in exposed areas)
- Supply drop events (bonus resources at random pad)
