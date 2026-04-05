//! Projectile system — gravity-affected ballistic projectiles
//!
//! All projectiles follow Newtonian physics with gravity.
//! They can enter orbit if fired fast enough. Slow projectile speed
//! makes aiming a skill challenge.

use crate::constants;
use crate::gravity;
use crate::thrust::quat_rotate_vector;
use crate::types::{EntityType, WorldConfig};

/// Projectile spawn parameters
#[derive(Debug, Clone)]
#[repr(C)]
pub struct ProjectileSpawnParams {
    /// Owner entity ID
    pub owner: u32,
    /// Spawn position [x,y,z]
    pub position: [f32; 3],
    /// Spawn velocity [vx,vy,vz] (inherited from owner)
    pub owner_velocity: [f32; 3],
    /// Fire direction (unit vector in world space)
    pub direction: [f32; 3],
    /// Projectile speed boost (m/s)
    pub speed: f32,
    /// Projectile mass
    pub mass: f32,
}

/// Compute initial projectile velocity given fire parameters
#[inline]
pub fn compute_projectile_velocity(params: &ProjectileSpawnParams) -> [f32; 3] {
    // Projectile velocity = owner velocity + fire direction * speed
    [
        params.owner_velocity[0] + params.direction[0] * params.speed,
        params.owner_velocity[1] + params.direction[1] * params.speed,
        params.owner_velocity[2] + params.direction[2] * params.speed,
    ]
}

/// Compute fire direction from lander orientation and aim direction.
/// The aim direction is in the lander's local frame.
///
/// # Arguments
/// * `orientation` - Lander quaternion [x,y,z,w]
/// * `aim_local` - Aim direction in local space [x,y,z]
#[inline]
pub fn compute_fire_direction(orientation: &[f32; 4], aim_local: &[f32; 3]) -> [f32; 3] {
    quat_rotate_vector(orientation, aim_local)
}

/// Check if a player can fire (rate limiting)
#[inline]
pub fn can_fire(last_fire_time: f64, current_time: f64, fire_rate: f32) -> bool {
    let cooldown = 1.0 / fire_rate;
    current_time - last_fire_time >= cooldown as f64
}

/// Update all projectile positions and check lifetime.
/// Returns indices of expired projectiles.
///
/// # Arguments
/// * `positions` - Projectile positions (mutated)
/// * `velocities` - Projectile velocities (mutated by gravity)
/// * `lifetimes` - Remaining lifetime in seconds (mutated)
/// * `count` - Number of active projectiles
/// * `config` - World config (for gravity)
/// * `dt` - Time step
///
/// # Returns
/// Vector of indices that have expired or hit terrain
pub fn update_projectiles(
    positions: &mut [[f32; 3]],
    velocities: &mut [[f32; 3]],
    lifetimes: &mut [f32],
    config: &WorldConfig,
    dt: f32,
) -> Vec<usize> {
    let mut expired = Vec::new();

    // Apply gravity to all projectiles
    gravity::update_gravity(positions, velocities, config, dt);

    for i in 0..positions.len() {
        // Integrate position
        positions[i][0] += velocities[i][0] * dt;
        positions[i][1] += velocities[i][1] * dt;
        positions[i][2] += velocities[i][2] * dt;

        // Decrease lifetime
        lifetimes[i] -= dt;

        // Check if expired or hit terrain
        let alt = gravity::altitude(&positions[i], config);
        if lifetimes[i] <= 0.0 || alt <= 0.0 {
            expired.push(i);
        }
    }

    expired
}

/// Compute damage from a projectile impact.
/// Damage = projectile_mass * relative_velocity * damage_coefficient
#[inline]
pub fn compute_projectile_damage(
    projectile_mass: f32,
    projectile_velocity: &[f32; 3],
    target_velocity: &[f32; 3],
) -> f32 {
    let rel_vx = projectile_velocity[0] - target_velocity[0];
    let rel_vy = projectile_velocity[1] - target_velocity[1];
    let rel_vz = projectile_velocity[2] - target_velocity[2];
    let rel_speed = (rel_vx * rel_vx + rel_vy * rel_vy + rel_vz * rel_vz).sqrt();

    // Damage = 0.5 * mass * v² / 1000 (tuned for gameplay)
    0.5 * projectile_mass * rel_speed * rel_speed / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_projectile_inherits_owner_velocity() {
        let params = ProjectileSpawnParams {
            owner: 0,
            position: [0.0, 10_500.0, 0.0],
            owner_velocity: [100.0, 0.0, 0.0],
            direction: [0.0, 1.0, 0.0],
            speed: 500.0,
            mass: 5.0,
        };

        let vel = compute_projectile_velocity(&params);
        assert!((vel[0] - 100.0).abs() < 0.1, "Should inherit owner X velocity");
        assert!((vel[1] - 500.0).abs() < 0.1, "Should add fire speed in Y");
    }

    #[test]
    fn test_projectile_affected_by_gravity() {
        let config = WorldConfig::default();
        let mut positions = [[0.0_f32, config.moon_radius + 500.0, 0.0]];
        let mut velocities = [[500.0_f32, 500.0, 0.0]]; // Moving fast
        let mut lifetimes = [30.0_f32];

        let expired = update_projectiles(&mut positions, &mut velocities, &mut lifetimes, &config, 1.0);

        // Gravity should have pulled velocity toward center
        assert!(velocities[0][1] < 500.0, "Gravity should reduce upward velocity");
        assert!(expired.is_empty(), "Should not expire after 1 second");
    }

    #[test]
    fn test_projectile_expires() {
        let config = WorldConfig::default();
        let mut positions = [[0.0_f32, config.moon_radius + 5000.0, 0.0]];
        let mut velocities = [[0.0_f32; 3]];
        let mut lifetimes = [0.5_f32];

        let expired = update_projectiles(&mut positions, &mut velocities, &mut lifetimes, &config, 1.0);
        assert_eq!(expired.len(), 1, "Should expire when lifetime runs out");
    }

    #[test]
    fn test_projectile_damage_scales_with_velocity() {
        let low_damage = compute_projectile_damage(5.0, &[10.0, 0.0, 0.0], &[0.0, 0.0, 0.0]);
        let high_damage = compute_projectile_damage(5.0, &[100.0, 0.0, 0.0], &[0.0, 0.0, 0.0]);
        assert!(high_damage > low_damage);
    }
}
