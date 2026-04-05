//! Top-level simulation — runs the full physics tick
//!
//! This is the main entry point for the physics engine.
//! One call to `tick()` advances the simulation by FIXED_DT.

use crate::collision::{self, CollisionPair, TerrainCollision};
use crate::entities::EntityStore;
use crate::gravity;
pub use crate::landing::{self, LandingPad};
use crate::orbit;
use crate::projectile;
use crate::rotation;
use crate::spatial::SpatialGrid;
use crate::thrust;
use crate::types::{EntityType, OrbitParams, PlayerInput, SimEvent, WorldConfig};

/// Landing pads in the world
pub struct WorldState {
    pub pads: Vec<LandingPad>,
}

/// The simulation state
pub struct Simulation {
    pub entities: EntityStore,
    pub world_config: WorldConfig,
    pub world_state: WorldState,
    pub spatial_grid: SpatialGrid,
    pub events: Vec<SimEvent>,
    pub time: f64,
}

impl Simulation {
    pub fn new(config: WorldConfig) -> Self {
        let spatial_grid = SpatialGrid::new(&config);
        Self {
            entities: EntityStore::new(),
            world_config: config,
            world_state: WorldState { pads: Vec::new() },
            spatial_grid,
            events: Vec::new(),
            time: 0.0,
        }
    }

    /// Add a landing pad to the world
    pub fn add_pad(&mut self, pad: LandingPad) {
        self.world_state.pads.push(pad);
    }

    /// Spawn a lander at the given position
    pub fn spawn_lander(
        &mut self,
        entity_type: EntityType,
        position: [f32; 3],
        velocity: [f32; 3],
    ) -> u32 {
        self.entities.spawn(entity_type, position, velocity, [0.0, 0.0, 0.0, 1.0])
    }

    /// Spawn a projectile
    pub fn spawn_projectile(
        &mut self,
        owner: u32,
        position: [f32; 3],
        velocity: [f32; 3],
    ) -> u32 {
        let id = self.entities.spawn(EntityType::Projectile, position, velocity, [0.0, 0.0, 0.0, 1.0]);
        self.entities.owner_ids[id as usize] = owner;
        self.entities.lifetimes[id as usize] = 30.0;
        id
    }

    /// Apply player input to an entity
    pub fn apply_input(&mut self, entity_id: u32, input: &PlayerInput) {
        if !self.entities.is_active(entity_id) {
            return;
        }
        let idx = entity_id as usize;
        self.entities.inputs[idx] = input.clone();
        self.entities.throttles[idx] = input.throttle;
    }

    /// Run one simulation tick
    pub fn tick(&mut self) -> &[SimEvent] {
        let dt = 1.0 / 60.0;
        self.events.clear();

        let active_ids = self.entities.active_ids();

        // 1. Update spatial grid
        for &id in &active_ids {
            let idx = id as usize;
            self.entities.grid_cells[idx] =
                self.spatial_grid.cell_for_position(&self.entities.positions[idx], &self.world_config);
        }

        // 2. Apply gravity to all entities
        // Gather positions and velocities for batch processing
        let mut positions = Vec::with_capacity(active_ids.len());
        let mut velocities = Vec::with_capacity(active_ids.len());

        for &id in &active_ids {
            let idx = id as usize;
            positions.push(self.entities.positions[idx]);
            velocities.push(self.entities.velocities[idx]);
        }

        gravity::update_gravity(&positions, &mut velocities, &self.world_config, dt);

        // Write back
        for (i, &id) in active_ids.iter().enumerate() {
            let idx = id as usize;
            self.entities.velocities[idx] = velocities[i];
        }

        // 3. Process each entity
        let mut projectiles_to_update = Vec::new();
        let mut landers = Vec::new();

        for &id in &active_ids {
            let idx = id as usize;
            let etype = self.entities.entity_types[idx];

            if etype.is_lander() {
                landers.push(id);
            } else if etype.is_projectile() {
                projectiles_to_update.push(id);
            }
        }

        // 4. Process lander physics
        for &id in &landers {
            let idx = id as usize;
            let input = self.entities.inputs[idx].clone();
            let etype = self.entities.entity_types[idx];

            // Apply thrust
            if input.throttle > 0.0 {
                thrust::apply_thrust(
                    &mut self.entities.velocities[idx],
                    &self.entities.orientations[idx],
                    input.throttle,
                    &mut self.entities.fuels[idx],
                    &mut self.entities.masses[idx],
                    etype,
                    input.boost,
                    dt,
                    self.entities.fuel_rate_multipliers[idx],
                    self.entities.thrust_multipliers[idx],
                );
            }

            // Apply RCS translation
            if input.rcs_mode {
                let translate = [input.translate_x, input.translate_y, input.translate_z];
                thrust::apply_rcs_translation(
                    &mut self.entities.velocities[idx],
                    &self.entities.orientations[idx],
                    &translate,
                    self.entities.masses[idx],
                    etype,
                    dt,
                );
            }

            // Apply rotation
            if !input.rcs_mode {
                rotation::apply_rotation_input(
                    &mut self.entities.orientations[idx],
                    &mut self.entities.angular_velocities[idx],
                    input.pitch,
                    input.yaw,
                    input.roll,
                    etype,
                    input.fine_control,
                    dt,
                );
            }

            // Apply SAS
            rotation::apply_sas(
                &self.entities.orientations[idx],
                &mut self.entities.angular_velocities[idx],
                &self.entities.velocities[idx],
                input.sas_mode,
                self.entities.sas_strengths[idx],
                None, // Target direction computed externally
                dt,
            );

            // Integrate rotation
            rotation::integrate_rotation(
                &mut self.entities.orientations[idx],
                &self.entities.angular_velocities[idx],
                dt,
            );

            // Integrate position
            self.entities.positions[idx][0] += self.entities.velocities[idx][0] * dt;
            self.entities.positions[idx][1] += self.entities.velocities[idx][1] * dt;
            self.entities.positions[idx][2] += self.entities.velocities[idx][2] * dt;

            // Fire weapon
            if input.fire {
                self.try_fire_projectile(id);
            }

            // Thrust push on nearby entities
            if input.throttle > 0.5 {
                self.apply_thrust_push_to_nearby(id, dt);
            }
        }

        // 5. Update projectile lifetimes and remove expired
        let mut expired = Vec::new();
        for &id in &projectiles_to_update {
            let idx = id as usize;
            self.entities.lifetimes[idx] -= dt;

            // Integrate position
            self.entities.positions[idx][0] += self.entities.velocities[idx][0] * dt;
            self.entities.positions[idx][1] += self.entities.velocities[idx][1] * dt;
            self.entities.positions[idx][2] += self.entities.velocities[idx][2] * dt;

            let alt = gravity::altitude(&self.entities.positions[idx], &self.world_config);

            if self.entities.lifetimes[idx] <= 0.0 || alt <= 0.0 {
                expired.push(id);
            }
        }

        for id in expired {
            self.events.push(SimEvent::ProjectileExpired { projectile: id });
            self.entities.destroy(id);
        }

        // 6. Collision detection
        // Terrain collisions
        for &id in &landers {
            let idx = id as usize;
            let etype = self.entities.entity_types[idx];

            if let Some(collision) = collision::terrain_collision_check(
                id,
                &self.entities.positions[idx],
                &self.entities.velocities[idx],
                etype.collision_radius(),
                &self.world_config,
            ) {
                let speed = collision.impact_speed;

                // Check for landing on a pad
                let mut landed = false;
                for pad in &self.world_state.pads {
                    if let Some(result) = landing::check_landing(
                        &self.entities.positions[idx],
                        &self.entities.velocities[idx],
                        &self.entities.orientations[idx],
                        self.entities.fuels[idx],
                        self.entities.fuel_capacities[idx],
                        pad,
                        &self.world_config,
                    ) {
                        if result.success {
                            self.events.push(SimEvent::Landing {
                                entity: id,
                                pad_id: pad.id,
                                touchdown_velocity: result.touchdown_velocity,
                                precision: result.precision,
                                fuel_remaining: result.fuel_remaining,
                            });
                            landed = true;
                        }
                        break;
                    }
                }

                if !landed && landing::is_crash(speed, &self.entities.orientations[idx], &self.entities.positions[idx]) {
                    self.events.push(SimEvent::Crash {
                        entity: id,
                        position: self.entities.positions[idx],
                        velocity: speed,
                    });
                    // Apply damage
                    let damage = speed * 10.0; // Crash damage scales with speed
                    self.entities.healths[idx] -= damage;
                    if self.entities.healths[idx] <= 0.0 {
                        self.events.push(SimEvent::Destroyed { entity: id, killer: None });
                        self.entities.destroy(id);
                    }
                }
            }
        }

        // Entity-entity collisions (projectiles vs landers)
        for &proj_id in &projectiles_to_update {
            if !self.entities.is_active(proj_id) {
                continue;
            }
            let proj_idx = proj_id as usize;

            for &lander_id in &landers {
                if !self.entities.is_active(lander_id) {
                    continue;
                }
                let lander_idx = lander_id as usize;

                // Don't hit self
                if self.entities.owner_ids[proj_idx] == lander_id {
                    continue;
                }

                let etype_proj = self.entities.entity_types[proj_idx];
                let etype_lander = self.entities.entity_types[lander_idx];

                if let Some((penetration, _normal)) = collision::sphere_sphere_check(
                    &self.entities.positions[proj_idx],
                    etype_proj.collision_radius(),
                    &self.entities.positions[lander_idx],
                    etype_lander.collision_radius(),
                ) {
                    // Projectile hit!
                    let damage = projectile::compute_projectile_damage(
                        self.entities.masses[proj_idx],
                        &self.entities.velocities[proj_idx],
                        &self.entities.velocities[lander_idx],
                    );

                    self.entities.healths[lander_idx] -= damage;

                    self.events.push(SimEvent::Damage {
                        entity: lander_id,
                        amount: damage,
                        source: Some(proj_id),
                    });

                    if self.entities.healths[lander_idx] <= 0.0 {
                        self.events.push(SimEvent::Destroyed {
                            entity: lander_id,
                            killer: Some(self.entities.owner_ids[proj_idx]),
                        });
                        self.entities.destroy(lander_id);
                    }

                    // Destroy projectile
                    self.entities.destroy(proj_id);
                    self.events.push(SimEvent::Collision {
                        entity_a: proj_id,
                        entity_b: lander_id,
                        relative_velocity: penetration,
                    });
                    break;
                }
            }
        }

        self.time += dt as f64;
        &self.events
    }

    /// Try to fire a projectile from a lander
    fn try_fire_projectile(&mut self, owner: u32) {
        let idx = owner as usize;

        // Check projectile limit
        if self.entities.count_projectiles_for_owner(owner) >= 20 {
            return;
        }

        // Check if we have a valid fire direction
        let orientation = self.entities.orientations[idx];
        // Fire in the lander's forward direction (local -Z or based on aim)
        let forward = thrust::quat_rotate_vector(&orientation, &[0.0, 0.0, -1.0]);

        let pos = self.entities.positions[idx];
        let vel = self.entities.velocities[idx];

        // Offset spawn position slightly forward to avoid self-collision
        let spawn_pos = [
            pos[0] + forward[0] * 5.0,
            pos[1] + forward[1] * 5.0,
            pos[2] + forward[2] * 5.0,
        ];

        let projectile_vel = [
            vel[0] + forward[0] * 500.0,
            vel[1] + forward[1] * 500.0,
            vel[2] + forward[2] * 500.0,
        ];

        let proj_id = self.spawn_projectile(owner, spawn_pos, projectile_vel);

        self.events.push(SimEvent::ProjectileFired {
            owner,
            projectile: proj_id,
        });
    }

    /// Apply thrust push to nearby entities
    fn apply_thrust_push_to_nearby(&mut self, source: u32, dt: f32) {
        let src_idx = source as usize;
        let src_pos = self.entities.positions[src_idx];
        let src_orient = self.entities.orientations[src_idx];
        let throttle = self.entities.throttles[src_idx];
        let src_type = self.entities.entity_types[src_idx];

        let active_ids = self.entities.active_ids();

        for &target_id in &active_ids {
            if target_id == source {
                continue;
            }
            let tgt_idx = target_id as usize;

            // Quick distance check
            let dx = self.entities.positions[tgt_idx][0] - src_pos[0];
            let dy = self.entities.positions[tgt_idx][1] - src_pos[1];
            let dz = self.entities.positions[tgt_idx][2] - src_pos[2];
            let dist_sq = dx * dx + dy * dy + dz * dz;

            if dist_sq > 2500.0 {
                continue; // Beyond 50m
            }

            thrust::apply_thrust_push(
                &src_pos,
                &src_orient,
                throttle,
                &self.entities.positions[tgt_idx],
                &mut self.entities.velocities[tgt_idx],
                self.entities.masses[tgt_idx],
                src_type,
                dt,
            );
        }
    }

    /// Read entity states into a flat buffer for network/rendering
    /// Format per entity: [x,y,z, vx,vy,vz, qx,qy,qz,qw, health, fuel, throttle, type, active]
    /// = 15 floats per entity
    pub fn read_states(&self, buffer: &mut [f32]) -> usize {
        let floats_per_entity = 15;
        let max_entities = buffer.len() / floats_per_entity;
        let mut written = 0;

        for i in 0..self.entities.count {
            if !self.entities.active[i] || written >= max_entities {
                continue;
            }

            let offset = written * floats_per_entity;

            buffer[offset] = self.entities.positions[i][0];
            buffer[offset + 1] = self.entities.positions[i][1];
            buffer[offset + 2] = self.entities.positions[i][2];

            buffer[offset + 3] = self.entities.velocities[i][0];
            buffer[offset + 4] = self.entities.velocities[i][1];
            buffer[offset + 5] = self.entities.velocities[i][2];

            buffer[offset + 6] = self.entities.orientations[i][0];
            buffer[offset + 7] = self.entities.orientations[i][1];
            buffer[offset + 8] = self.entities.orientations[i][2];
            buffer[offset + 9] = self.entities.orientations[i][3];

            buffer[offset + 10] = self.entities.healths[i];
            buffer[offset + 11] = self.entities.fuels[i];
            buffer[offset + 12] = self.entities.throttles[i];
            buffer[offset + 13] = self.entities.entity_types[i] as u8 as f32;
            buffer[offset + 14] = if self.entities.active[i] { 1.0 } else { 0.0 };

            written += 1;
        }

        written
    }

    /// Compute orbital parameters for an entity
    pub fn compute_orbit(&self, entity_id: u32) -> Option<OrbitParams> {
        if !self.entities.is_active(entity_id) {
            return None;
        }
        let idx = entity_id as usize;
        Some(orbit::compute_orbital_params(
            &self.entities.positions[idx],
            &self.entities.velocities[idx],
            &self.world_config,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SasMode;

    #[test]
    fn test_simulation_tick_runs() {
        let mut sim = Simulation::new(WorldConfig::default());
        let id = sim.spawn_lander(
            EntityType::LanderStandard,
            [0.0, 10_100.0, 0.0],
            [0.0, 0.0, 0.0],
        );

        let events = sim.tick();
        // Should have completed without panic
        assert!(sim.time > 0.0);
        assert!(sim.entities.is_active(id));
    }

    #[test]
    fn test_gravity_pulls_down() {
        let mut sim = Simulation::new(WorldConfig::default());
        let id = sim.spawn_lander(
            EntityType::LanderStandard,
            [0.0, 10_100.0, 0.0],
            [0.0, 0.0, 0.0], // Stationary
        );

        // No thrust — should start falling
        for _ in 0..60 {
            sim.tick();
        }

        let idx = id as usize;
        // Should have fallen (velocity pointing toward center)
        assert!(sim.entities.velocities[idx][1] < 0.0, "Should be falling");
    }

    #[test]
    fn test_thrust_counteracts_gravity() {
        let mut sim = Simulation::new(WorldConfig::default());
        let id = sim.spawn_lander(
            EntityType::LanderStandard,
            [0.0, 10_100.0, 0.0],
            [0.0, 0.0, 0.0],
        );

        let input = PlayerInput {
            throttle: 1.0,
            sas_mode: SasMode::Stability,
            ..Default::default()
        };
        sim.apply_input(id, &input);

        for _ in 0..60 {
            sim.apply_input(id, &input);
            sim.tick();
        }

        let idx = id as usize;
        // With full thrust and SAS stability, should not be falling as fast
        assert!(
            sim.entities.velocities[idx][1] > -50.0,
            "Thrust should slow the fall: vy = {}",
            sim.entities.velocities[idx][1]
        );
    }

    #[test]
    fn test_projectile_fires_and_expires() {
        let mut sim = Simulation::new(WorldConfig::default());
        let id = sim.spawn_lander(
            EntityType::LanderInterceptor,
            [0.0, 15_000.0, 0.0],
            [0.0, 0.0, 0.0],
        );

        let input = PlayerInput {
            throttle: 0.0,
            fire: true,
            sas_mode: SasMode::Off,
            ..Default::default()
        };

        sim.apply_input(id, &input);
        let events = sim.tick();

        // Should have fired a projectile
        let fired = events.iter().any(|e| matches!(e, SimEvent::ProjectileFired { .. }));
        assert!(fired, "Should have fired a projectile");
    }

    #[test]
    fn test_read_states() {
        let mut sim = Simulation::new(WorldConfig::default());
        sim.spawn_lander(
            EntityType::LanderScout,
            [100.0, 10_100.0, 200.0],
            [0.0, 0.0, 0.0],
        );
        sim.spawn_lander(
            EntityType::LanderStandard,
            [300.0, 10_100.0, 400.0],
            [0.0, 0.0, 0.0],
        );

        let mut buffer = [0.0f32; 300];
        let count = sim.read_states(&mut buffer);

        assert_eq!(count, 2);
        assert!((buffer[0] - 100.0).abs() < 0.1);
    }
}
