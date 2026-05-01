//! WASM bindings for the Lunar3D physics engine
//!
//! This crate wraps `lunar-physics` with `wasm-bindgen` to expose
//! the simulation API to both the browser client and Bun server.

use wasm_bindgen::prelude::*;
use lunar_physics::{
    constants,
    entities::EntityStore,
    simulation::{Simulation, LandingPad},
    types::{EntityType, OrbitParams, PlayerInput, SasMode, SimEvent, WorldConfig},
};

/// Initialize the panic hook for better error messages in WASM
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// WASM wrapper for the simulation
#[wasm_bindgen]
pub struct WasmSimulation {
    inner: Simulation,
}

#[wasm_bindgen]
impl WasmSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Simulation::new(WorldConfig::default()),
        }
    }

    /// Create with custom world config
    pub fn new_with_config(moon_radius: f32, moon_gm: f32) -> Self {
        Self {
            inner: Simulation::new(WorldConfig {
                moon_radius,
                moon_gm,
            }),
        }
    }

    /// Spawn a lander
    pub fn spawn_lander(
        &mut self,
        entity_type: u8,
        x: f32,
        y: f32,
        z: f32,
        vx: f32,
        vy: f32,
        vz: f32,
    ) -> u32 {
        let etype = entity_type_from_u8(entity_type);
        self.inner.spawn_lander(etype, [x, y, z], [vx, vy, vz])
    }

    /// Spawn a projectile
    pub fn spawn_projectile(
        &mut self,
        owner: u32,
        x: f32,
        y: f32,
        z: f32,
        vx: f32,
        vy: f32,
        vz: f32,
    ) -> u32 {
        self.inner.spawn_projectile(owner, [x, y, z], [vx, vy, vz])
    }

    /// Destroy an entity
    pub fn destroy_entity(&mut self, id: u32) {
        self.inner.entities.destroy(id);
    }

    /// Apply player input
    pub fn apply_input(
        &mut self,
        entity_id: u32,
        throttle: f32,
        pitch: f32,
        yaw: f32,
        roll: f32,
        translate_x: f32,
        translate_y: f32,
        translate_z: f32,
        sas_mode: u8,
        fire: bool,
        boost: bool,
        rcs_mode: bool,
        fine_control: bool,
    ) {
        let input = PlayerInput {
            throttle,
            pitch,
            yaw,
            roll,
            translate_x,
            translate_y,
            translate_z,
            sas_mode: sas_mode_from_u8(sas_mode),
            fire,
            boost,
            rcs_mode,
            fine_control,
        };
        self.inner.apply_input(entity_id, &input);
    }

    /// Run one simulation tick. Returns number of events.
    pub fn tick(&mut self) -> usize {
        let events = self.inner.tick();
        events.len()
    }

    /// Get the simulation time
    pub fn time(&self) -> f64 {
        self.inner.time
    }

    /// Check if entity is active
    pub fn is_active(&self, id: u32) -> bool {
        self.inner.entities.is_active(id)
    }

    /// Get entity position
    pub fn get_position(&self, id: u32) -> Vec<f32> {
        if let Some(idx) = self.valid_index(id) {
            vec![
                self.inner.entities.positions[idx][0],
                self.inner.entities.positions[idx][1],
                self.inner.entities.positions[idx][2],
            ]
        } else {
            vec![0.0, 0.0, 0.0]
        }
    }

    /// Get entity velocity
    pub fn get_velocity(&self, id: u32) -> Vec<f32> {
        if let Some(idx) = self.valid_index(id) {
            vec![
                self.inner.entities.velocities[idx][0],
                self.inner.entities.velocities[idx][1],
                self.inner.entities.velocities[idx][2],
            ]
        } else {
            vec![0.0, 0.0, 0.0]
        }
    }

    /// Get entity orientation (quaternion)
    pub fn get_orientation(&self, id: u32) -> Vec<f32> {
        if let Some(idx) = self.valid_index(id) {
            vec![
                self.inner.entities.orientations[idx][0],
                self.inner.entities.orientations[idx][1],
                self.inner.entities.orientations[idx][2],
                self.inner.entities.orientations[idx][3],
            ]
        } else {
            vec![0.0, 0.0, 0.0, 1.0]
        }
    }

    /// Set entity orientation (quaternion [x,y,z,w]).
    pub fn set_orientation(&mut self, id: u32, x: f32, y: f32, z: f32, w: f32) {
        if let Some(idx) = self.valid_index(id) {
            self.inner.entities.orientations[idx] = [x, y, z, w];
            self.inner.entities.angular_velocities[idx] = [0.0, 0.0, 0.0];
        }
    }

    /// Get entity health
    pub fn get_health(&self, id: u32) -> f32 {
        if let Some(idx) = self.valid_index(id) {
            self.inner.entities.healths[idx]
        } else {
            0.0
        }
    }

    /// Get entity fuel
    pub fn get_fuel(&self, id: u32) -> f32 {
        if let Some(idx) = self.valid_index(id) {
            self.inner.entities.fuels[idx]
        } else {
            0.0
        }
    }

    /// Get entity fuel as percentage
    pub fn get_fuel_pct(&self, id: u32) -> f32 {
        if let Some(idx) = self.valid_index(id) {
            let cap = self.inner.entities.fuel_capacities[idx];
            if cap > 0.0 {
                self.inner.entities.fuels[idx] / cap
            } else {
                0.0
            }
        } else {
            0.0
        }
    }

    /// Read all entity states into a flat Float32Array-compatible buffer
    /// Returns a pointer to the internal buffer and count.
    /// Format per entity: [x,y,z, vx,vy,vz, qx,qy,qw,qz, health, fuel, throttle, type, active]
    /// = 15 floats per entity
    pub fn read_states(&self, max_entities: usize) -> Vec<f32> {
        let floats_per_entity = 15;
        let mut buffer = vec![0.0f32; max_entities * floats_per_entity];
        let count = self.inner.read_states(&mut buffer);
        buffer.truncate(count * floats_per_entity);
        buffer
    }

    /// Compute orbital parameters for an entity
    /// Returns [semi_major_axis, eccentricity, apoapsis, periapsis, orbital_period, inclination]
    pub fn compute_orbit(&self, entity_id: u32) -> Vec<f32> {
        match self.inner.compute_orbit(entity_id) {
            Some(params) => vec![
                params.semi_major_axis,
                params.eccentricity,
                params.apoapsis,
                params.periapsis,
                params.orbital_period,
                params.inclination,
            ],
            None => vec![0.0; 6],
        }
    }

    /// Sample terrain height at position
    pub fn sample_terrain_height(&self, x: f32, y: f32, z: f32) -> f32 {
        lunar_physics::terrain::sample_height(&[x, y, z], &self.inner.world_config)
    }

    /// Get altitude above terrain
    pub fn get_altitude(&self, x: f32, y: f32, z: f32) -> f32 {
        lunar_physics::gravity::altitude(&[x, y, z], &self.inner.world_config)
    }

    /// Get surface normal at position
    pub fn get_surface_normal(&self, x: f32, y: f32, z: f32) -> Vec<f32> {
        let n = lunar_physics::gravity::surface_normal(&[x, y, z]);
        vec![n[0], n[1], n[2]]
    }

    /// Compute circular orbit velocity at a given altitude
    pub fn circular_orbit_velocity(&self, altitude: f32) -> f32 {
        lunar_physics::orbit::circular_orbit_velocity(altitude, &self.inner.world_config)
    }

    /// Add a landing pad
    pub fn add_pad(&mut self, id: u32, x: f32, y: f32, z: f32, radius: f32, safe_zone: bool) {
        self.inner.add_pad(LandingPad {
            id,
            position: [x, y, z],
            radius,
            safe_zone,
            level_id: None,
        });
    }

    /// Get the moon radius
    pub fn moon_radius(&self) -> f32 {
        self.inner.world_config.moon_radius
    }

    /// Get the moon GM
    pub fn moon_gm(&self) -> f32 {
        self.inner.world_config.moon_gm
    }

    /// Count active entities
    pub fn active_entity_count(&self) -> usize {
        self.inner.entities.active_ids().len()
    }

    /// Active entity IDs in the same order as read_states().
    pub fn active_entity_ids(&self, max_entities: usize) -> Vec<u32> {
        self.inner
            .entities
            .active_ids()
            .into_iter()
            .take(max_entities)
            .collect()
    }

    // --- Event access ---

    /// Get the number of events from the last tick
    pub fn event_count(&self) -> usize {
        self.inner.events.len()
    }

    /// Read events as a flat buffer
    /// Format per event varies, but first element is always event type:
    /// 0 = Collision(ea, eb, rel_vel)
    /// 1 = Crash(entity, x,y,z, velocity)
    /// 2 = Landing(entity, pad_id, touchdown_vel, precision, fuel_remaining)
    /// 3 = Destroyed(entity, has_killer, killer)
    /// 4 = ProjectileFired(owner, projectile)
    /// 5 = ProjectileExpired(projectile)
    /// 6 = Damage(entity, amount, has_source, source)
    /// 7 = Spawned(entity, type)
    pub fn read_events(&self) -> Vec<f32> {
        let mut buffer = Vec::new();
        for event in &self.inner.events {
            match event {
                SimEvent::Collision { entity_a, entity_b, relative_velocity } => {
                    buffer.extend_from_slice(&[0.0, *entity_a as f32, *entity_b as f32, *relative_velocity]);
                }
                SimEvent::Crash { entity, position, velocity } => {
                    buffer.extend_from_slice(&[1.0, *entity as f32, position[0], position[1], position[2], *velocity]);
                }
                SimEvent::Landing { entity, pad_id, touchdown_velocity, precision, fuel_remaining } => {
                    buffer.extend_from_slice(&[2.0, *entity as f32, *pad_id as f32, *touchdown_velocity, *precision, *fuel_remaining]);
                }
                SimEvent::Destroyed { entity, killer } => {
                    let has_killer = if killer.is_some() { 1.0 } else { 0.0 };
                    let killer_id = killer.unwrap_or(0) as f32;
                    buffer.extend_from_slice(&[3.0, *entity as f32, has_killer, killer_id]);
                }
                SimEvent::ProjectileFired { owner, projectile } => {
                    buffer.extend_from_slice(&[4.0, *owner as f32, *projectile as f32]);
                }
                SimEvent::ProjectileExpired { projectile } => {
                    buffer.extend_from_slice(&[5.0, *projectile as f32]);
                }
                SimEvent::Damage { entity, amount, source } => {
                    let has_source = if source.is_some() { 1.0 } else { 0.0 };
                    let source_id = source.unwrap_or(0) as f32;
                    buffer.extend_from_slice(&[6.0, *entity as f32, *amount, has_source, source_id]);
                }
                SimEvent::Spawned { entity, entity_type } => {
                    buffer.extend_from_slice(&[7.0, *entity as f32, *entity_type as u8 as f32]);
                }
            }
        }
        buffer
    }
}

impl WasmSimulation {
    fn valid_index(&self, id: u32) -> Option<usize> {
        let idx = id as usize;
        if idx < self.inner.entities.count && self.inner.entities.active[idx] {
            Some(idx)
        } else {
            None
        }
    }
}

fn entity_type_from_u8(v: u8) -> EntityType {
    match v {
        0 => EntityType::LanderScout,
        1 => EntityType::LanderStandard,
        2 => EntityType::LanderHeavy,
        3 => EntityType::LanderInterceptor,
        4 => EntityType::Projectile,
        5 => EntityType::Debris,
        _ => EntityType::Debris,
    }
}

fn sas_mode_from_u8(v: u8) -> SasMode {
    match v {
        0 => SasMode::Off,
        1 => SasMode::Stability,
        2 => SasMode::Prograde,
        3 => SasMode::Retrograde,
        4 => SasMode::RadialIn,
        5 => SasMode::RadialOut,
        6 => SasMode::Target,
        _ => SasMode::Off,
    }
}
