//! Landing detection and touchdown validation
//!
//! Determines if a lander has successfully landed on a pad,
//! or crashed into the terrain.

use crate::constants;
use crate::gravity;
use crate::thrust::quat_rotate_vector;
use crate::types::WorldConfig;

/// Landing pad definition
#[derive(Debug, Clone)]
#[repr(C)]
pub struct LandingPad {
    /// Unique ID
    pub id: u32,
    /// Position on Moon surface [x,y,z]
    pub position: [f32; 3],
    /// Pad radius (meters)
    pub radius: f32,
    /// Whether this is a safe zone
    pub safe_zone: bool,
    /// Associated level ID (if any)
    pub level_id: Option<u32>,
}

/// Result of a landing attempt
#[derive(Debug, Clone)]
#[repr(C)]
pub struct LandingResult {
    pub success: bool,
    pub touchdown_velocity: f32,
    pub precision: f32,      // Distance from pad center (0 = perfect)
    pub tilt_angle: f32,     // Tilt from upright in radians
    pub fuel_remaining: f32, // Fuel percentage
    pub score: f32,          // Computed score
}

/// Check if a lander is attempting to land on a pad.
///
/// # Arguments
/// * `position` - Lander position
/// * `velocity` - Lander velocity
/// * `orientation` - Lander quaternion [x,y,z,w]
/// * `fuel` - Fuel remaining (0-100%)
/// * `pad` - The landing pad to check against
/// * `config` - World config
///
/// # Returns
/// None if not near the pad. Some(LandingResult) if within pad radius.
pub fn check_landing(
    position: &[f32; 3],
    velocity: &[f32; 3],
    orientation: &[f32; 4],
    fuel: f32,
    fuel_capacity: f32,
    pad: &LandingPad,
    config: &WorldConfig,
) -> Option<LandingResult> {
    // Check if entity is near the surface and near the pad
    let alt = gravity::altitude(position, config);
    if alt > 10.0 {
        return None; // Not close enough to surface
    }

    // Distance from pad center on the surface plane
    let dx = position[0] - pad.position[0];
    let dy = position[1] - pad.position[1];
    let dz = position[2] - pad.position[2];
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();

    if dist > pad.radius + 5.0 {
        return None; // Not within pad radius
    }

    // Compute landing parameters
    let speed = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();

    // Vertical velocity component (along surface normal)
    let surface_normal = gravity::surface_normal(position);
    let vertical_speed = (velocity[0] * surface_normal[0]
        + velocity[1] * surface_normal[1]
        + velocity[2] * surface_normal[2])
    .abs();

    // Horizontal speed
    let horizontal_speed = (speed * speed - vertical_speed * vertical_speed).max(0.0).sqrt();

    // Tilt angle: angle between lander's "up" and surface normal
    let lander_up = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]);
    let tilt = (lander_up[0] * surface_normal[0]
        + lander_up[1] * surface_normal[1]
        + lander_up[2] * surface_normal[2])
    .acos();
    let tilt_from_upright = tilt.abs();

    // Precision: distance from pad center
    let precision = (dist / pad.radius).min(1.0); // 0 = center, 1 = edge

    // Determine success
    let velocity_ok = vertical_speed < constants::LANDING_VELOCITY_MAX
        && horizontal_speed < constants::LANDING_VELOCITY_MAX * 2.0;
    let tilt_ok = tilt_from_upright < constants::LANDING_TILT_MAX;

    let success = velocity_ok && tilt_ok;

    // Compute score
    let fuel_pct = if fuel_capacity > 0.0 { fuel / fuel_capacity } else { 0.0 };
    let score = if success {
        let precision_score = (1.0 - precision) * 200.0;
        let speed_score = (1.0 - vertical_speed / constants::LANDING_VELOCITY_MAX) * 100.0;
        let fuel_score = fuel_pct * 150.0;
        let base = 100.0;
        base + precision_score + speed_score + fuel_score
    } else {
        0.0
    };

    Some(LandingResult {
        success,
        touchdown_velocity: vertical_speed,
        precision: dist,
        tilt_angle: tilt_from_upright,
        fuel_remaining: fuel_pct,
        score,
    })
}

/// Check if a terrain collision is a crash (too fast / too tilted)
#[inline]
pub fn is_crash(impact_speed: f32, orientation: &[f32; 4], position: &[f32; 3]) -> bool {
    // Speed check
    if impact_speed > constants::LANDING_VELOCITY_MAX * 3.0 {
        return true; // Definitely a crash at this speed
    }

    // Tilt check
    let surface_normal = gravity::surface_normal(position);
    let lander_up = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]);
    let dot = lander_up[0] * surface_normal[0] + lander_up[1] * surface_normal[1] + lander_up[2] * surface_normal[2];
    let tilt = dot.acos();

    if tilt > 1.2 {
        // ~70 degrees — basically landed on the side
        return true;
    }

    // Moderate speed + moderate tilt = crash
    if impact_speed > constants::LANDING_VELOCITY_MAX && tilt > constants::LANDING_TILT_MAX {
        return true;
    }

    impact_speed > constants::LANDING_VELOCITY_MAX * 2.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_pad(id: u32, radius: f32) -> LandingPad {
        let config = WorldConfig::default();
        LandingPad {
            id,
            position: [0.0, config.moon_radius, 0.0],
            radius,
            safe_zone: true,
            level_id: None,
        }
    }

    #[test]
    fn test_perfect_landing() {
        let config = WorldConfig::default();
        let pad = make_pad(0, 25.0);

        // Lander at pad center, barely moving, upright
        let position = [0.0, config.moon_radius + 1.0, 0.0];
        let velocity = [0.0, -1.0, 0.0]; // Slow descent
        let orientation = [0.0, 0.0, 0.0, 1.0]; // Upright

        let result = check_landing(&position, &velocity, &orientation, 50.0, 100.0, &pad, &config);
        assert!(result.is_some());

        let landing = result.unwrap();
        assert!(landing.success, "Should be a successful landing");
        assert!(landing.score > 100.0, "Should have a good score");
    }

    #[test]
    fn test_crash_landing_too_fast() {
        let config = WorldConfig::default();
        let pad = make_pad(0, 25.0);

        let position = [0.0, config.moon_radius + 1.0, 0.0];
        let velocity = [0.0, -50.0, 0.0]; // Way too fast
        let orientation = [0.0, 0.0, 0.0, 1.0];

        let result = check_landing(&position, &velocity, &orientation, 50.0, 100.0, &pad, &config);
        assert!(result.is_some());

        let landing = result.unwrap();
        assert!(!landing.success, "Should be a crash");
    }

    #[test]
    fn test_miss_pad() {
        let config = WorldConfig::default();
        let pad = make_pad(0, 5.0); // Tiny pad

        // Far from pad
        let position = [100.0, config.moon_radius + 1.0, 0.0];
        let velocity = [0.0, -1.0, 0.0];
        let orientation = [0.0, 0.0, 0.0, 1.0];

        let result = check_landing(&position, &velocity, &orientation, 50.0, 100.0, &pad, &config);
        assert!(result.is_none(), "Should miss the pad entirely");
    }

    #[test]
    fn test_is_crash_fast_impact() {
        let orientation = [0.0, 0.0, 0.0, 1.0];
        let config = WorldConfig::default();
        let position = [0.0, config.moon_radius, 0.0];

        assert!(is_crash(50.0, &orientation, &position));
    }

    #[test]
    fn test_is_not_crash_soft_touchdown() {
        let orientation = [0.0, 0.0, 0.0, 1.0];
        let config = WorldConfig::default();
        let position = [0.0, config.moon_radius, 0.0];

        assert!(!is_crash(2.0, &orientation, &position));
    }
}
