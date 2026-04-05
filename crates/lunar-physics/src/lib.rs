//! Lunar3D Physics Engine
//!
//! Core physics simulation for a round-planet lunar landing game.
//! Features:
//! - Inverse-square gravity from a spherical Moon
//! - Newtonian thrust and rotation dynamics
//! - Ballistic gravity-affected projectiles
//! - Collision detection (sphere-mesh, ray-mesh)
//! - Landing detection and touchdown validation
//! - Spherical spatial grid for broad-phase
//! - Structure-of-Arrays (SoA) data layout for cache-friendly iteration

pub mod collision;
pub mod entities;
pub mod gravity;
pub mod landing;
pub mod orbit;
pub mod projectile;
pub mod rotation;
pub mod simulation;
pub mod spatial;
pub mod terrain;
pub mod thrust;

pub mod constants {
    /// Moon radius in game units (compressed scale: ~10km)
    pub const MOON_RADIUS: f32 = 10_000.0;

    /// Moon gravitational parameter (GM) — tuned for compressed scale
    /// Real Moon GM ≈ 4.905e12 m³/s². Compressed: GM = g_surface * R²
    /// g_surface = 1.62 m/s², R = 10,000 → GM = 1.62 * 1e8 = 1.62e8
    pub const MOON_GM: f32 = 1.62e8;

    /// Surface gravity (for quick reference)
    pub const SURFACE_GRAVITY: f32 = 1.62;

    /// Fixed physics timestep
    pub const FIXED_DT: f32 = 1.0 / 60.0;

    /// Max entities in simulation
    pub const MAX_ENTITIES: usize = 10_000;

    /// Max projectiles per player
    pub const MAX_PROJECTILES_PER_PLAYER: usize = 20;

    /// Projectile lifetime in seconds
    pub const PROJECTILE_LIFETIME: f32 = 30.0;

    /// Projectile speed (m/s)
    pub const PROJECTILE_SPEED: f32 = 500.0;

    /// Projectile mass (kg)
    pub const PROJECTILE_MASS: f32 = 5.0;

    /// Safe zone radius around landing pads (m)
    pub const SAFE_ZONE_RADIUS: f32 = 100.0;

    /// Landing velocity threshold (m/s) — above this = crash
    pub const LANDING_VELOCITY_MAX: f32 = 5.0;

    /// Landing tilt threshold (radians from upright)
    pub const LANDING_TILT_MAX: f32 = 0.35; // ~20 degrees

    /// Crash mark persistence (seconds)
    pub const CRASH_MARK_LIFETIME: f32 = 3600.0; // 1 hour

    /// Spatial grid cell size (game units)
    pub const SPATIAL_CELL_SIZE: f32 = 500.0;
}

pub mod types {
    use crate::constants;

    /// Entity type
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    #[repr(u8)]
    pub enum EntityType {
        LanderScout = 0,
        LanderStandard = 1,
        LanderHeavy = 2,
        LanderInterceptor = 3,
        Projectile = 4,
        Debris = 5,
    }

    impl EntityType {
        pub fn is_lander(&self) -> bool {
            matches!(
                self,
                EntityType::LanderScout
                    | EntityType::LanderStandard
                    | EntityType::LanderHeavy
                    | EntityType::LanderInterceptor
            )
        }

        pub fn is_projectile(&self) -> bool {
            matches!(self, EntityType::Projectile)
        }

        /// Base mass for this entity type (kg)
        pub fn base_mass(&self) -> f32 {
            match self {
                EntityType::LanderScout => 500.0,
                EntityType::LanderStandard => 1000.0,
                EntityType::LanderHeavy => 2000.0,
                EntityType::LanderInterceptor => 750.0,
                EntityType::Projectile => constants::PROJECTILE_MASS,
                EntityType::Debris => 50.0,
            }
        }

        /// Base fuel capacity
        pub fn base_fuel(&self) -> f32 {
            match self {
                EntityType::LanderScout => 60.0,
                EntityType::LanderStandard => 100.0,
                EntityType::LanderHeavy => 180.0,
                EntityType::LanderInterceptor => 80.0,
                EntityType::Projectile => 0.0,
                EntityType::Debris => 0.0,
            }
        }

        /// Base max HP
        pub fn base_hp(&self) -> f32 {
            match self {
                EntityType::LanderScout => 60.0,
                EntityType::LanderStandard => 100.0,
                EntityType::LanderHeavy => 160.0,
                EntityType::LanderInterceptor => 80.0,
                EntityType::Projectile => 1.0,
                EntityType::Debris => 30.0,
            }
        }

        /// Thrust power (Newtons)
        pub fn base_thrust(&self) -> f32 {
            match self {
                EntityType::LanderScout => 3_000.0,
                EntityType::LanderStandard => 5_000.0,
                EntityType::LanderHeavy => 10_000.0,
                EntityType::LanderInterceptor => 5_500.0,
                EntityType::Projectile => 0.0,
                EntityType::Debris => 0.0,
            }
        }

        /// Rotation speed (radians/s)
        pub fn rotation_speed(&self) -> f32 {
            match self {
                EntityType::LanderScout => 3.0,
                EntityType::LanderStandard => 2.0,
                EntityType::LanderHeavy => 1.0,
                EntityType::LanderInterceptor => 2.5,
                EntityType::Projectile => 0.0,
                EntityType::Debris => 0.5,
            }
        }

        /// Collision radius (m)
        pub fn collision_radius(&self) -> f32 {
            match self {
                EntityType::LanderScout => 3.0,
                EntityType::LanderStandard => 4.0,
                EntityType::LanderHeavy => 6.0,
                EntityType::LanderInterceptor => 3.5,
                EntityType::Projectile => 0.5,
                EntityType::Debris => 2.0,
            }
        }
    }

    /// Simulation event — output from a physics tick
    #[derive(Debug, Clone)]
    #[repr(C)]
    pub enum SimEvent {
        /// entity A collided with entity B
        Collision { entity_a: u32, entity_b: u32, relative_velocity: f32 },
        /// entity crashed into terrain at position
        Crash { entity: u32, position: [f32; 3], velocity: f32 },
        /// entity successfully landed
        Landing { entity: u32, pad_id: u32, touchdown_velocity: f32, precision: f32, fuel_remaining: f32 },
        /// entity destroyed (HP <= 0)
        Destroyed { entity: u32, killer: Option<u32> },
        /// projectile fired
        ProjectileFired { owner: u32, projectile: u32 },
        /// projectile expired
        ProjectileExpired { projectile: u32 },
        /// entity took damage
        Damage { entity: u32, amount: f32, source: Option<u32> },
        /// entity spawned
        Spawned { entity: u32, entity_type: EntityType },
    }

    /// SAS (Stability Assist System) mode
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
    #[repr(u8)]
    pub enum SasMode {
        #[default]
        Off = 0,
        Stability = 1,
        Prograde = 2,
        Retrograde = 3,
        RadialIn = 4,
        RadialOut = 5,
        Target = 6,
    }

    /// Player input for a single frame
    #[derive(Debug, Clone, Default)]
    #[repr(C)]
    pub struct PlayerInput {
        /// Throttle level 0.0 - 1.0
        pub throttle: f32,
        /// Pitch input -1.0 to 1.0 (positive = pitch down)
        pub pitch: f32,
        /// Yaw input -1.0 to 1.0
        pub yaw: f32,
        /// Roll input -1.0 to 1.0
        pub roll: f32,
        /// RCS translation X (left/right)
        pub translate_x: f32,
        /// RCS translation Y (up/down)
        pub translate_y: f32,
        /// RCS translation Z (forward/backward)
        pub translate_z: f32,
        /// SAS mode
        pub sas_mode: SasMode,
        /// Fire weapon
        pub fire: bool,
        /// Boost active
        pub boost: bool,
        /// RCS mode active
        pub rcs_mode: bool,
        /// Fine control (reduced rates)
        pub fine_control: bool,
    }

    /// World configuration
    #[derive(Debug, Clone)]
    #[repr(C)]
    pub struct WorldConfig {
        pub moon_radius: f32,
        pub moon_gm: f32,
    }

    impl Default for WorldConfig {
        fn default() -> Self {
            Self {
                moon_radius: constants::MOON_RADIUS,
                moon_gm: constants::MOON_GM,
            }
        }
    }

    /// Orbital parameters
    #[derive(Debug, Clone, Default)]
    #[repr(C)]
    pub struct OrbitParams {
        pub semi_major_axis: f32,
        pub eccentricity: f32,
        pub apoapsis: f32,
        pub periapsis: f32,
        pub orbital_period: f32,
        pub inclination: f32,
    }
}
