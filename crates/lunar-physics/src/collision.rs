//! Collision detection — broad phase (spatial grid) + narrow phase (sphere/ray)
//!
//! Broad phase uses the spherical spatial grid to find candidate pairs.
//! Narrow phase does precise geometry checks.

use crate::gravity;
use crate::types::{EntityType, WorldConfig};

/// Result of a collision check between two entities
#[derive(Debug, Clone)]
#[repr(C)]
pub struct CollisionPair {
    pub entity_a: u32,
    pub entity_b: u32,
    pub contact_normal: [f32; 3],
    pub penetration_depth: f32,
}

/// Result of a terrain collision check
#[derive(Debug, Clone)]
#[repr(C)]
pub struct TerrainCollision {
    pub entity: u32,
    pub position: [f32; 3],
    pub surface_normal: [f32; 3],
    pub impact_speed: f32,
}

/// Check sphere-sphere collision between two entities
#[inline]
pub fn sphere_sphere_check(
    pos_a: &[f32; 3],
    radius_a: f32,
    pos_b: &[f32; 3],
    radius_b: f32,
) -> Option<(f32, [f32; 3])> {
    let dx = pos_b[0] - pos_a[0];
    let dy = pos_b[1] - pos_a[1];
    let dz = pos_b[2] - pos_a[2];

    let dist_sq = dx * dx + dy * dy + dz * dz;
    let min_dist = radius_a + radius_b;

    if dist_sq < min_dist * min_dist {
        let dist = dist_sq.sqrt().max(0.0001);
        let penetration = min_dist - dist;
        let normal = [dx / dist, dy / dist, dz / dist];
        Some((penetration, normal))
    } else {
        None
    }
}

/// Check if an entity has hit the terrain (simple sphere-surface check)
/// Uses the spherical Moon model (no heightmap displacement for now)
///
/// # Returns
/// Some(TerrainCollision) if the entity is at or below the surface
#[inline]
pub fn terrain_collision_check(
    entity_id: u32,
    position: &[f32; 3],
    velocity: &[f32; 3],
    radius: f32,
    config: &WorldConfig,
) -> Option<TerrainCollision> {
    let alt = gravity::altitude(position, config);

    if alt <= radius {
        let surface_normal = gravity::surface_normal(position);
        let speed = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();

        // Project velocity onto surface normal to get impact speed
        let impact_speed = velocity[0] * surface_normal[0]
            + velocity[1] * surface_normal[1]
            + velocity[2] * surface_normal[2];

        Some(TerrainCollision {
            entity: entity_id,
            position: *position,
            surface_normal,
            impact_speed: impact_speed.abs(),
        })
    } else {
        None
    }
}

/// Ray-sphere intersection test (for projectile vs lander)
/// Returns the distance along the ray to the intersection point, or None
#[inline]
pub fn ray_sphere_intersect(
    ray_origin: &[f32; 3],
    ray_dir: &[f32; 3],
    sphere_center: &[f32; 3],
    sphere_radius: f32,
) -> Option<f32> {
    let oc_x = ray_origin[0] - sphere_center[0];
    let oc_y = ray_origin[1] - sphere_center[1];
    let oc_z = ray_origin[2] - sphere_center[2];

    let a = ray_dir[0] * ray_dir[0] + ray_dir[1] * ray_dir[1] + ray_dir[2] * ray_dir[2];
    let half_b = oc_x * ray_dir[0] + oc_y * ray_dir[1] + oc_z * ray_dir[2];
    let c = oc_x * oc_x + oc_y * oc_y + oc_z * oc_z - sphere_radius * sphere_radius;

    let discriminant = half_b * half_b - a * c;
    if discriminant < 0.0 {
        return None;
    }

    let sqrt_d = discriminant.sqrt();
    let mut t = (-half_b - sqrt_d) / a;
    if t < 0.001 {
        t = (-half_b + sqrt_d) / a;
    }

    if t > 0.001 {
        Some(t)
    } else {
        None
    }
}

/// Broad phase: find all entity pairs that might be colliding.
/// Uses spatial grid cells — only check entities in the same or adjacent cells.
///
/// # Arguments
/// * `entity_ids` - Entity IDs
/// * `positions` - Entity positions
/// * `entity_types` - Entity types (for radius lookup)
/// * `cell_indices` - Pre-computed spatial grid cell indices
/// * `count` - Number of entities
///
/// # Returns
/// Vector of (index_a, index_b) pairs to check in narrow phase
pub fn broad_phase(
    entity_ids: &[u32],
    positions: &[[f32; 3]],
    entity_types: &[EntityType],
    cell_indices: &[u32],
    count: usize,
) -> Vec<(usize, usize)> {
    let mut pairs = Vec::new();

    // Group entities by cell
    // Simple O(n²) for small cell populations, which is fine because
    // spatial partitioning limits each cell to a handful of entities
    for i in 0..count {
        for j in (i + 1)..count {
            // Same cell or adjacent cells
            let cell_diff = if cell_indices[i] > cell_indices[j] {
                cell_indices[i] - cell_indices[j]
            } else {
                cell_indices[j] - cell_indices[i]
            };

            // Adjacent = cell difference <= 1 (simplified; full impl checks 26 neighbors)
            if cell_diff <= 1 {
                // Quick distance check before adding to pairs
                let dx = positions[i][0] - positions[j][0];
                let dy = positions[i][1] - positions[j][1];
                let dz = positions[i][2] - positions[j][2];
                let dist_sq = dx * dx + dy * dy + dz * dz;

                let max_range = entity_types[i].collision_radius() + entity_types[j].collision_radius() + 10.0;
                if dist_sq < max_range * max_range {
                    pairs.push((i, j));
                }
            }
        }
    }

    pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sphere_sphere_collision() {
        let pos_a = [0.0, 0.0, 0.0];
        let pos_b = [3.0, 0.0, 0.0];
        let result = sphere_sphere_check(&pos_a, 2.0, &pos_b, 2.0);
        assert!(result.is_some(), "Should detect collision");
        let (penetration, normal) = result.unwrap();
        assert!(penetration > 0.0);
        assert!(normal[0] > 0.0); // Normal points from A to B
    }

    #[test]
    fn test_sphere_sphere_no_collision() {
        let pos_a = [0.0, 0.0, 0.0];
        let pos_b = [10.0, 0.0, 0.0];
        let result = sphere_sphere_check(&pos_a, 2.0, &pos_b, 2.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_terrain_collision() {
        let config = WorldConfig::default();
        // Position at surface level
        let pos = [0.0, config.moon_radius - 1.0, 0.0]; // Below surface
        let vel = [0.0, -10.0, 0.0]; // Moving down

        let result = terrain_collision_check(0, &pos, &vel, 3.0, &config);
        assert!(result.is_some(), "Should detect terrain collision");

        let collision = result.unwrap();
        assert!(collision.impact_speed > 0.0);
    }

    #[test]
    fn test_terrain_no_collision_high_altitude() {
        let config = WorldConfig::default();
        let pos = [0.0, config.moon_radius + 1000.0, 0.0];
        let vel = [0.0, -10.0, 0.0];

        let result = terrain_collision_check(0, &pos, &vel, 3.0, &config);
        assert!(result.is_none());
    }

    #[test]
    fn test_ray_sphere_hit() {
        let origin = [0.0, 0.0, 0.0];
        let dir = [1.0, 0.0, 0.0];
        let center = [5.0, 0.0, 0.0];
        let t = ray_sphere_intersect(&origin, &dir, &center, 1.0);
        assert!(t.is_some());
        assert!((t.unwrap() - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_ray_sphere_miss() {
        let origin = [0.0, 0.0, 0.0];
        let dir = [1.0, 0.0, 0.0];
        let center = [5.0, 3.0, 0.0]; // Offset
        let t = ray_sphere_intersect(&origin, &dir, &center, 1.0);
        assert!(t.is_none());
    }
}
