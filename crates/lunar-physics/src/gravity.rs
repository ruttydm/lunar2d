//! Gravity simulation for a spherical body
//!
//! Uses inverse-square law: g = GM / r²
//! Optimized with pre-computed lookup table for surface-proximate entities.

use crate::constants;
use crate::types::WorldConfig;

/// Pre-computed gravity lookup table for altitudes near the surface.
/// Avoids repeated division for entities at similar altitudes.
pub struct GravityTable {
    /// Altitude buckets (meters above surface)
    altitudes: Vec<f32>,
    /// Gravity magnitude at each altitude
    gravities: Vec<f32>,
}

impl GravityTable {
    pub fn new(config: &WorldConfig) -> Self {
        let mut altitudes = Vec::new();
        let mut gravities = Vec::new();

        // Generate table for altitudes 0 to 50km in 100m steps
        for i in 0..500 {
            let alt = i as f32 * 100.0;
            let r = config.moon_radius + alt;
            let g = config.moon_gm / (r * r);
            altitudes.push(alt);
            gravities.push(g);
        }

        Self { altitudes, gravities }
    }

    /// Lookup gravity magnitude for a given altitude (meters above surface)
    /// Falls back to exact calculation for altitudes beyond the table
    pub fn lookup(&self, altitude: f32, config: &WorldConfig) -> f32 {
        if altitude < 0.0 {
            return config.moon_gm / (config.moon_radius * config.moon_radius);
        }

        // Binary search for the nearest bucket
        let idx = match self.altitudes.binary_search_by(|a| a.partial_cmp(&altitude).unwrap()) {
            Ok(i) => i,
            Err(i) => i.min(self.altitudes.len() - 1),
        };

        if idx < self.gravities.len() {
            self.gravities[idx]
        } else {
            // Beyond table range — exact calculation
            let r = config.moon_radius + altitude;
            config.moon_gm / (r * r)
        }
    }
}

/// Update velocities for all entities due to gravity.
/// Entities are represented as SoA arrays for cache-friendly iteration.
///
/// # Arguments
/// * `positions` - Flat array of [x,y,z] positions (len = count * 3)
/// * `velocities` - Flat array of [vx,vy,vz] velocities (len = count * 3)
/// * `count` - Number of entities
/// * `config` - World configuration
/// * `dt` - Time step
#[inline]
pub fn update_gravity(
    positions: &[[f32; 3]],
    velocities: &mut [[f32; 3]],
    config: &WorldConfig,
    dt: f32,
) {
    let r_sq_threshold = config.moon_radius * config.moon_radius * 4.0; // 2x radius

    for i in 0..positions.len() {
        let px = positions[i][0];
        let py = positions[i][1];
        let pz = positions[i][2];

        // Distance from center of moon
        let r_sq = px * px + py * py + pz * pz;
        let r = r_sq.sqrt();

        // Clamp to surface (don't allow falling through)
        let r_safe = r.max(config.moon_radius);

        // Gravity magnitude: GM / r²
        // Optimization: for entities near surface (r < 2*radius), use constant surface gravity
        let g = if r_sq < r_sq_threshold {
            constants::SURFACE_GRAVITY
        } else {
            config.moon_gm / (r_safe * r_safe)
        };

        // Gravity direction: toward center (normalize position = -direction_to_center)
        let inv_r = 1.0 / r_safe;
        let nx = -px * inv_r;
        let ny = -py * inv_r;
        let nz = -pz * inv_r;

        // Apply gravity acceleration
        velocities[i][0] += nx * g * dt;
        velocities[i][1] += ny * g * dt;
        velocities[i][2] += nz * g * dt;
    }
}

/// Compute gravity vector at a specific position
#[inline]
pub fn gravity_at(position: &[f32; 3], config: &WorldConfig) -> [f32; 3] {
    let r_sq = position[0] * position[0] + position[1] * position[1] + position[2] * position[2];
    let r = r_sq.sqrt().max(config.moon_radius);
    let g = config.moon_gm / (r * r);
    let inv_r = 1.0 / r;
    [
        -position[0] * inv_r * g,
        -position[1] * inv_r * g,
        -position[2] * inv_r * g,
    ]
}

/// Compute altitude above surface for a given position
#[inline]
pub fn altitude(position: &[f32; 3], config: &WorldConfig) -> f32 {
    let r = (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
    r - config.moon_radius
}

/// Compute the surface normal (radially outward) at a given position
#[inline]
pub fn surface_normal(position: &[f32; 3]) -> [f32; 3] {
    let r = (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
    if r < 0.001 {
        return [0.0, 1.0, 0.0];
    }
    let inv_r = 1.0 / r;
    [position[0] * inv_r, position[1] * inv_r, position[2] * inv_r]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_surface_gravity() {
        let config = WorldConfig::default();
        let g = gravity_at(&[0.0, config.moon_radius, 0.0], &config);
        let g_mag = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).sqrt();
        assert!((g_mag - 1.62).abs() < 0.01, "Surface gravity should be ~1.62, got {}", g_mag);
    }

    #[test]
    fn test_gravity_points_inward() {
        let config = WorldConfig::default();
        let pos = [0.0, config.moon_radius * 2.0, 0.0];
        let g = gravity_at(&pos, &config);
        // Gravity should point toward center (negative y in this case)
        assert!(g[1] < 0.0, "Gravity should point toward center");
    }

    #[test]
    fn test_altitude() {
        let config = WorldConfig::default();
        let pos = [0.0, config.moon_radius + 500.0, 0.0];
        let alt = altitude(&pos, &config);
        assert!((alt - 500.0).abs() < 0.1);
    }

    #[test]
    fn test_update_gravity_batch() {
        let config = WorldConfig::default();
        let mut positions = [[0.0_f32, config.moon_radius + 1000.0, 0.0]; 3];
        let mut velocities = [[0.0_f32; 3]; 3];

        update_gravity(&positions, &mut velocities, &config, 1.0 / 60.0);

        // All entities should have downward (toward center) velocity change
        for v in &velocities {
            assert!(v[1] < 0.0, "Velocity should be pulled toward center");
        }
    }

    #[test]
    fn test_gravity_table() {
        let config = WorldConfig::default();
        let table = GravityTable::new(&config);

        // At surface, table should give ~1.62
        let g_surface = table.lookup(0.0, &config);
        assert!((g_surface - 1.62).abs() < 0.02);

        // At 10km altitude, gravity should be weaker
        let g_high = table.lookup(10_000.0, &config);
        assert!(g_high < g_surface);
    }

    #[test]
    fn test_orbital_velocity() {
        let config = WorldConfig::default();
        // Circular orbit at surface+1000m: v = sqrt(GM/r)
        let r = config.moon_radius + 1000.0;
        let v_orbit = (config.moon_gm / r).sqrt();
        // Should be a reasonable velocity (~400 m/s at this scale)
        assert!(v_orbit > 100.0 && v_orbit < 1000.0, "Orbital velocity: {}", v_orbit);
    }
}
