//! Entity management — Structure-of-Arrays storage for all game entities
//!
//! Entities are stored in flat arrays for cache-friendly iteration.
//! Entity allocation uses a free-list for O(1) acquire/release.

use crate::constants;
use crate::types::{EntityType, PlayerInput, SasMode, WorldConfig};

/// Maximum number of entities
const MAX: usize = constants::MAX_ENTITIES;

/// Entity manager — owns all entity data in SoA layout
pub struct EntityStore {
    pub count: usize,

    // Core components
    pub active: Vec<bool>,
    pub entity_types: Vec<EntityType>,
    pub owner_ids: Vec<u32>, // For projectiles: who fired it

    // Transform
    pub positions: Vec<[f32; 3]>,
    pub velocities: Vec<[f32; 3]>,
    pub orientations: Vec<[f32; 4]>, // Quaternion [x,y,z,w]
    pub angular_velocities: Vec<[f32; 3]>,

    // Physics
    pub masses: Vec<f32>,
    pub fuels: Vec<f32>,
    pub fuel_capacities: Vec<f32>,
    pub healths: Vec<f32>,
    pub max_healths: Vec<f32>,

    // Throttle / input state
    pub throttles: Vec<f32>,
    pub inputs: Vec<PlayerInput>,

    // Spatial grid
    pub grid_cells: Vec<u32>,

    // Projectile
    pub lifetimes: Vec<f32>,

    // Upgrade multipliers
    pub thrust_multipliers: Vec<f32>,
    pub fuel_rate_multipliers: Vec<f32>,

    // SAS strength
    pub sas_strengths: Vec<f32>,

    // Landing pad target
    pub target_pad_ids: Vec<u32>,

    // Free list for entity reuse
    free_list: Vec<u32>,
}

impl EntityStore {
    pub fn new() -> Self {
        Self {
            count: 0,
            active: vec![false; MAX],
            entity_types: vec![EntityType::Debris; MAX],
            owner_ids: vec![0; MAX],
            positions: vec![[0.0; 3]; MAX],
            velocities: vec![[0.0; 3]; MAX],
            orientations: vec![[0.0, 0.0, 0.0, 1.0]; MAX],
            angular_velocities: vec![[0.0; 3]; MAX],
            masses: vec![0.0; MAX],
            fuels: vec![0.0; MAX],
            fuel_capacities: vec![0.0; MAX],
            healths: vec![0.0; MAX],
            max_healths: vec![0.0; MAX],
            throttles: vec![0.0; MAX],
            inputs: vec![PlayerInput::default(); MAX],
            grid_cells: vec![0; MAX],
            lifetimes: vec![0.0; MAX],
            thrust_multipliers: vec![1.0; MAX],
            fuel_rate_multipliers: vec![1.0; MAX],
            sas_strengths: vec![1.0; MAX],
            target_pad_ids: vec![0; MAX],
            free_list: Vec::with_capacity(MAX),
        }
    }

    /// Spawn a new entity, returns its ID
    pub fn spawn(
        &mut self,
        entity_type: EntityType,
        position: [f32; 3],
        velocity: [f32; 3],
        orientation: [f32; 4],
    ) -> u32 {
        let id = if let Some(id) = self.free_list.pop() {
            id as usize
        } else if self.count < MAX {
            let id = self.count;
            self.count += 1;
            id
        } else {
            panic!("Entity limit reached");
        };

        self.active[id] = true;
        self.entity_types[id] = entity_type;
        self.positions[id] = position;
        self.velocities[id] = velocity;
        self.orientations[id] = orientation;
        self.angular_velocities[id] = [0.0; 3];
        self.masses[id] = entity_type.base_mass();
        self.fuels[id] = entity_type.base_fuel();
        self.fuel_capacities[id] = entity_type.base_fuel();
        self.healths[id] = entity_type.base_hp();
        self.max_healths[id] = entity_type.base_hp();
        self.throttles[id] = 0.0;
        self.inputs[id] = PlayerInput::default();
        self.grid_cells[id] = 0;
        self.lifetimes[id] = if entity_type.is_projectile() { constants::PROJECTILE_LIFETIME } else { 0.0 };
        self.owner_ids[id] = 0;
        self.thrust_multipliers[id] = 1.0;
        self.fuel_rate_multipliers[id] = 1.0;
        self.sas_strengths[id] = 1.0;
        self.target_pad_ids[id] = 0;

        id as u32
    }

    /// Destroy an entity (adds to free list for reuse)
    pub fn destroy(&mut self, id: u32) {
        let idx = id as usize;
        if idx < self.count && self.active[idx] {
            self.active[idx] = false;
            self.free_list.push(id);
        }
    }

    /// Check if an entity is active
    #[inline]
    pub fn is_active(&self, id: u32) -> bool {
        let idx = id as usize;
        idx < self.count && self.active[idx]
    }

    /// Iterate over all active entity IDs
    pub fn active_ids(&self) -> Vec<u32> {
        let mut ids = Vec::new();
        for i in 0..self.count {
            if self.active[i] {
                ids.push(i as u32);
            }
        }
        ids
    }

    /// Count active entities of a given type
    pub fn count_type(&self, entity_type: EntityType) -> usize {
        let mut count = 0;
        for i in 0..self.count {
            if self.active[i] && self.entity_types[i] == entity_type {
                count += 1;
            }
        }
        count
    }

    /// Count projectiles owned by a specific player
    pub fn count_projectiles_for_owner(&self, owner: u32) -> usize {
        let mut count = 0;
        for i in 0..self.count {
            if self.active[i]
                && self.entity_types[i] == EntityType::Projectile
                && self.owner_ids[i] == owner
            {
                count += 1;
            }
        }
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_destroy() {
        let mut store = EntityStore::new();

        let id = store.spawn(
            EntityType::LanderStandard,
            [0.0, 10_100.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        );

        assert!(store.is_active(id));
        assert_eq!(store.entity_types[id as usize], EntityType::LanderStandard);

        store.destroy(id);
        assert!(!store.is_active(id));
    }

    #[test]
    fn test_entity_reuse() {
        let mut store = EntityStore::new();

        let id1 = store.spawn(EntityType::Projectile, [0.0; 3], [0.0; 3], [0.0, 0.0, 0.0, 1.0]);
        store.destroy(id1);

        let id2 = store.spawn(EntityType::Projectile, [1.0; 3], [0.0; 3], [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(id1, id2, "Should reuse destroyed entity ID");
    }

    #[test]
    fn test_count_by_type() {
        let mut store = EntityStore::new();
        store.spawn(EntityType::LanderScout, [0.0; 3], [0.0; 3], [0.0, 0.0, 0.0, 1.0]);
        store.spawn(EntityType::LanderStandard, [0.0; 3], [0.0; 3], [0.0, 0.0, 0.0, 1.0]);
        store.spawn(EntityType::Projectile, [0.0; 3], [0.0; 3], [0.0, 0.0, 0.0, 1.0]);

        assert_eq!(store.count_type(EntityType::Projectile), 1);
    }
}
