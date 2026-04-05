# Lunar3D — Landers & Progression

## 1. Lander Types

Four lander archetypes, each with distinct gameplay feel:

### 1.1 Scout
| Attribute | Value |
|---|---|
| Role | Fast recon, precision landings |
| Mass | Light (base 500 kg) |
| Thrust | Low absolute, high thrust-to-weight |
| Fuel capacity | Small (60 units) |
| Max HP | 60 |
| Agility | Excellent — fast rotation, responsive RCS |
| Weapon bonus | None |
| Unlock | Available from start |

**Playstyle**: Glass cannon. Get in fast, land precisely, dodge projectiles. Weak in a fight but hard to hit.

### 1.2 Standard
| Attribute | Value |
|---|---|
| Role | Balanced all-rounder |
| Mass | Medium (base 1,000 kg) |
| Thrust | Medium |
| Fuel capacity | Medium (100 units) |
| Max HP | 100 |
| Agility | Average |
| Weapon bonus | None |
| Unlock | Available from start |

**Playstyle**: The "Mario" of landers. Decent at everything, master of nothing. Good for learning and general play.

### 1.3 Heavy Cargo
| Attribute | Value |
|---|---|
| Role | Tank, endurance lander |
| Mass | Heavy (base 2,000 kg) |
| Thrust | High absolute, low thrust-to-weight |
| Fuel capacity | Large (180 units) |
| Max HP | 160 |
| Agility | Poor — slow rotation, sluggish |
| Weapon bonus | +20% projectile mass (bigger hits) |
| Unlock | 500 XP |

**Playstyle**: The behemoth. Can absorb damage, carry tons of fuel, hit hard. But slow and easy to hit. Great for dangerous zones.

### 1.4 Interceptor
| Attribute | Value |
|---|---|
| Role | Combat-focused hunter |
| Mass | Medium-light (base 750 kg) |
| Thrust | Medium-high |
| Fuel capacity | Low-medium (80 units) |
| Max HP | 80 |
| Agility | Good |
| Weapon bonus | +30% fire rate, +15% projectile speed |
| Unlock | 500 XP |

**Playstyle**: The fighter. Built to chase and destroy other landers. Can still land but less fuel efficient. Best for aggressive PvP players.

---

## 2. Selection & Switching

- Players pick a lander **before spawning** (at respawn screen)
- Can switch lander on every respawn — no lock-in
- Current lander is shown on HUD and to other players
- Lander choice affects gameplay significantly — strategic decision

---

## 3. Visual Customization

### 3.1 Cosmetics (Unlockable)
- **Color schemes** — 12 base colors, unlockable patterns (camo, racing stripes, nebula)
- **Engine trail color** — default white, unlockable blue/orange/purple
- **Explosion effect** — default, unlockable fireworks / pink petals / green slime
- **Lander flair** — antennas, flags, lights, rotating beacons

### 3.2 No Gameplay Impact
- All cosmetics are purely visual
- No stat bonuses from skins

---

## 4. Upgrade Tree

### 4.1 System
- **XP-based progression** — earn XP from all activities (landings, kills, survival)
- XP is spent on upgrades in a **branching tech tree**
- Each upgrade has 3 tiers (I → II → III)
- Players must unlock Tier I before Tier II in any branch
- Some branches have prerequisites (must unlock X before Y becomes available)
- **Progression is persistent** (saved in localStorage + server-verified)

### 4.2 Upgrade Branches

#### 🔧 Thrust Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Efficient Nozzle | +10% thrust, -5% fuel consumption | 100 XP |
| II | Afterburner | +20% thrust, unlocks boost ability | 250 XP |
| III | Ion Assist | +30% thrust, +10% fuel efficiency | 500 XP |

#### ⛽ Fuel Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Extended Tanks | +20% fuel capacity | 100 XP |
| II | Fuel Scoop | Slowly regenerate fuel when near surface (within 500m) | 250 XP |
| III | Reactor Core | +50% fuel capacity, -10% consumption | 500 XP |

#### 🛡️ Armor Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Reinforced Hull | +20% HP | 100 XP |
| II | Impact Dampeners | -30% collision damage | 250 XP |
| III | Shield Generator | Absorb first hit of each spawn (one-time shield) | 500 XP |

#### 🎯 Weapons Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Gyro Stabilizer | +15% projectile speed | 100 XP |
| II | Heavy Rounds | +25% projectile mass (more damage) | 250 XP |
| III | Dual Cannons | Fire 2 projectiles per shot (slight spread) | 500 XP |

#### 🧭 Navigation Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Enhanced HUD | Show altitude + velocity vectors | 100 XP |
| II | Trajectory Predictor | Show predicted landing path | 250 XP |
| III | Orbital Computer | Show full orbit ellipse, apoapsis/periapsis markers | 500 XP |

#### 🚀 RCS Branch
| Tier | Upgrade | Effect | Cost |
|---|---|---|---|
| I | Quick Rotation | +15% rotation speed | 100 XP |
| II | Auto-Stabilize | Hold brake to auto-level lander | 250 XP |
| III | Full RCS Control | Independent lateral thrust (strafe in any direction) | 500 XP |

### 4.3 Total XP to Fully Upgrade
- Per branch: 850 XP (100 + 250 + 500)
- 6 branches: **5,100 XP total** to unlock everything
- Average XP per game session: ~200–400 XP
- Full unlock in roughly **15–25 sessions** for active players

### 4.4 Respec
- Players can **reset all upgrades** and reallocate XP (costs nothing, once per daily cycle)
- Allows experimentation with different builds

---

## 5. Unlock Schedule

| Unlock | Requirement |
|---|---|
| Scout lander | Available immediately |
| Standard lander | Available immediately |
| Heavy Cargo lander | 500 XP earned |
| Interceptor lander | 500 XP earned |
| Color customization | 100 XP earned |
| Engine trail colors | 250 XP earned |
| All Tier I upgrades | Purchasable from start |
| All Tier II upgrades | Requires any Tier I in same branch |
| All Tier III upgrades | Requires any Tier II in same branch |
| Explosion effects | 1,000 XP earned |
| Lander flair items | 2,000 XP earned |
