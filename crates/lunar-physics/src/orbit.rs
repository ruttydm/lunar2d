//! Orbital mechanics helpers
//!
//! Computes orbital parameters from position and velocity.
//! Used for the orbital map view and nav computer.

use crate::types::{OrbitParams, WorldConfig};

/// Compute orbital parameters from current state vector.
///
/// # Arguments
/// * `position` - [x,y,z] position relative to Moon center
/// * `velocity` - [vx,vy,vz] velocity
/// * `config` - World config (Moon radius and GM)
///
/// # Returns
/// Orbital parameters (semi-major axis, eccentricity, apoapsis, periapsis, period, inclination)
pub fn compute_orbital_params(
    position: &[f32; 3],
    velocity: &[f32; 3],
    config: &WorldConfig,
) -> OrbitParams {
    let r = (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
    let v = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();

    // Specific orbital energy: ε = v²/2 - GM/r
    let specific_energy = 0.5 * v * v - config.moon_gm / r;

    // Semi-major axis: a = -GM / (2ε)
    let semi_major_axis = if specific_energy.abs() > 0.001 {
        -config.moon_gm / (2.0 * specific_energy)
    } else {
        f32::INFINITY // Parabolic
    };

    // Specific angular momentum: h = r × v
    let hx = position[1] * velocity[2] - position[2] * velocity[1];
    let hy = position[2] * velocity[0] - position[0] * velocity[2];
    let hz = position[0] * velocity[1] - position[1] * velocity[0];
    let h = (hx * hx + hy * hy + hz * hz).sqrt();

    // Eccentricity: e = sqrt(1 + 2εh²/GM²)
    let ecc_squared = 1.0 + 2.0 * specific_energy * h * h / (config.moon_gm * config.moon_gm);
    let eccentricity = if ecc_squared > 0.0 { ecc_squared.sqrt() } else { 0.0 };

    // Apoapsis and Periapsis
    let (apoapsis, periapsis) = if semi_major_axis.is_finite() && semi_major_axis > 0.0 {
        let ap = semi_major_axis * (1.0 + eccentricity) - config.moon_radius;
        let pe = semi_major_axis * (1.0 - eccentricity) - config.moon_radius;
        (ap.max(0.0), pe.max(0.0))
    } else {
        (f32::INFINITY, 0.0)
    };

    // Orbital period: T = 2π * sqrt(a³/GM)
    let orbital_period = if semi_major_axis.is_finite() && semi_major_axis > 0.0 {
        2.0 * std::f32::consts::PI * (semi_major_axis * semi_major_axis * semi_major_axis / config.moon_gm).sqrt()
    } else {
        f32::INFINITY
    };

    // Inclination: angle between angular momentum and Y axis (moon pole)
    let inclination = if h > 0.001 {
        let cos_i = hy / h; // Y component of h normalized
        cos_i.acos()
    } else {
        0.0
    };

    OrbitParams {
        semi_major_axis,
        eccentricity,
        apoapsis,
        periapsis,
        orbital_period,
        inclination,
    }
}

/// Check if the current trajectory will impact the surface.
/// Returns true if periapsis is at or below the surface.
#[inline]
pub fn will_impact_surface(position: &[f32; 3], velocity: &[f32; 3], config: &WorldConfig) -> bool {
    let params = compute_orbital_params(position, velocity, config);
    // Use raw computation: check if semi_major_axis * (1 - eccentricity) <= moon_radius
    // This avoids the .max(0.0) clamp in the public periapsis field
    if params.semi_major_axis.is_finite() && params.semi_major_axis > 0.0 {
        let raw_periapsis_radius = params.semi_major_axis * (1.0 - params.eccentricity);
        raw_periapsis_radius <= config.moon_radius
    } else {
        // Hyperbolic — check eccentricity vector
        params.eccentricity >= 1.0 && params.periapsis <= 0.0
    }
}

/// Compute circular orbit velocity at a given altitude.
#[inline]
pub fn circular_orbit_velocity(altitude: f32, config: &WorldConfig) -> f32 {
    let r = config.moon_radius + altitude;
    (config.moon_gm / r).sqrt()
}

/// Compute the position on an elliptical orbit at a given true anomaly.
/// Useful for rendering orbit paths.
///
/// # Arguments
/// * `position` - Current position
/// * `velocity` - Current velocity
/// * `num_points` - Number of points to generate
/// * `config` - World config
///
/// # Returns
/// Vector of [x,y,z] positions forming the orbit ellipse
pub fn compute_orbit_points(
    position: &[f32; 3],
    velocity: &[f32; 3],
    num_points: usize,
    config: &WorldConfig,
) -> Vec<[f32; 3]> {
    let r_vec = *position;
    let v_vec = *velocity;

    let r = (r_vec[0] * r_vec[0] + r_vec[1] * r_vec[1] + r_vec[2] * r_vec[2]).sqrt();
    let v = (v_vec[0] * v_vec[0] + v_vec[1] * v_vec[1] + v_vec[2] * v_vec[2]).sqrt();

    // Angular momentum
    let h = [
        r_vec[1] * v_vec[2] - r_vec[2] * v_vec[1],
        r_vec[2] * v_vec[0] - r_vec[0] * v_vec[2],
        r_vec[0] * v_vec[1] - r_vec[1] * v_vec[0],
    ];
    let h_mag = (h[0] * h[0] + h[1] * h[1] + h[2] * h[2]).sqrt();
    if h_mag < 0.001 {
        return vec![];
    }

    let params = compute_orbital_params(position, velocity, config);

    if !params.semi_major_axis.is_finite() || params.semi_major_axis <= 0.0 || params.eccentricity >= 1.0 {
        // Hyperbolic or parabolic — just project the current trajectory
        let mut points = Vec::with_capacity(num_points);
        for i in 0..num_points {
            let t = i as f32 / num_points as f32 * 100.0;
            let p = [
                r_vec[0] + v_vec[0] * t,
                r_vec[1] + v_vec[1] * t,
                r_vec[2] + v_vec[2] * t,
            ];
            points.push(p);
        }
        return points;
    }

    // Eccentricity vector: e_vec = (v × h)/GM - r_hat
    let vxh = [
        v_vec[1] * h[2] - v_vec[2] * h[1],
        v_vec[2] * h[0] - v_vec[0] * h[2],
        v_vec[0] * h[1] - v_vec[1] * h[0],
    ];
    let e_vec = [
        vxh[0] / config.moon_gm - r_vec[0] / r,
        vxh[1] / config.moon_gm - r_vec[1] / r,
        vxh[2] / config.moon_gm - r_vec[2] / r,
    ];

    let a = params.semi_major_axis;
    let e = params.eccentricity;
    let p = a * (1.0 - e * e); // Semi-latus rectum

    let mut points = Vec::with_capacity(num_points);

    for i in 0..num_points {
        let theta = (i as f32 / num_points as f32) * 2.0 * std::f32::consts::PI;

        // Radius at this true anomaly
        let r_theta = p / (1.0 + e * theta.cos());
        if r_theta < config.moon_radius * 0.5 {
            continue; // Skip underground points
        }

        // Position in orbital plane (relative to eccentricity vector direction)
        // This is a simplified version — a full impl would use the full rotation matrix
        let cos_t = theta.cos();
        let sin_t = theta.sin();

        // Direction in orbital plane
        let e_mag = (e_vec[0] * e_vec[0] + e_vec[1] * e_vec[1] + e_vec[2] * e_vec[2]).sqrt();
        let e_hat = if e_mag > 0.001 {
            [e_vec[0] / e_mag, e_vec[1] / e_mag, e_vec[2] / e_mag]
        } else {
            [1.0, 0.0, 0.0]
        };

        // Perpendicular in orbital plane
        let perp = [
            h[1] * e_hat[2] - h[2] * e_hat[1],
            h[2] * e_hat[0] - h[0] * e_hat[2],
            h[0] * e_hat[1] - h[1] * e_hat[0],
        ];
        let perp_mag = (perp[0] * perp[0] + perp[1] * perp[1] + perp[2] * perp[2]).sqrt();
        let perp_hat = if perp_mag > 0.001 {
            [perp[0] / perp_mag, perp[1] / perp_mag, perp[2] / perp_mag]
        } else {
            [0.0, 0.0, 1.0]
        };

        points.push([
            (e_hat[0] * cos_t + perp_hat[0] * sin_t) * r_theta,
            (e_hat[1] * cos_t + perp_hat[1] * sin_t) * r_theta,
            (e_hat[2] * cos_t + perp_hat[2] * sin_t) * r_theta,
        ]);
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circular_orbit() {
        let config = WorldConfig::default();
        let alt = 2000.0;
        let v = circular_orbit_velocity(alt, &config);

        let r = config.moon_radius + alt;
        let position = [r, 0.0, 0.0];
        let velocity = [0.0, 0.0, v]; // Tangential velocity

        let params = compute_orbital_params(&position, &velocity, &config);

        assert!(params.eccentricity < 0.01, "Should be nearly circular, e = {}", params.eccentricity);
        assert!((params.apoapsis - alt).abs() < 50.0, "Apoapsis should be ~{}", alt);
        assert!((params.periapsis - alt).abs() < 50.0, "Periapsis should be ~{}", alt);
        assert!(params.orbital_period.is_finite() && params.orbital_period > 0.0);
    }

    #[test]
    fn test_elliptical_orbit() {
        let config = WorldConfig::default();
        let r = config.moon_radius + 1000.0;
        let position = [r, 0.0, 0.0];
        let v = circular_orbit_velocity(1000.0, &config) * 1.3; // Faster than circular
        let velocity = [0.0, 0.0, v];

        let params = compute_orbital_params(&position, &velocity, &config);

        assert!(params.eccentricity > 0.01, "Should be elliptical");
        assert!(params.apoapsis > 1000.0, "Apoapsis should be above starting altitude");
        // Periapsis might still be positive if v*1.3 doesn't dip below starting altitude
        // That's fine — the orbit is still elliptical
        assert!(params.periapsis < params.apoapsis, "Periapsis should be less than apoapsis");
    }

    #[test]
    fn test_will_impact_surface() {
        let config = WorldConfig::default();
        // Position at 500m above surface, on the Y axis
        let r = config.moon_radius + 500.0;
        let position = [0.0, r, 0.0];
        // Velocity straight toward center at high speed
        let velocity = [0.0, -500.0, 0.0];

        let params = compute_orbital_params(&position, &velocity, &config);
        // With h ≈ 0 (radial), e ≈ 1, periapsis should be near 0 or negative
        assert!(params.periapsis < 500.0, "Periapsis should be lower than starting altitude: {}", params.periapsis);
        assert!(will_impact_surface(&position, &velocity, &config), "Should impact surface, periapsis = {}", params.periapsis);
    }

    #[test]
    fn test_circular_orbit_velocity_reasonable() {
        let config = WorldConfig::default();
        let v = circular_orbit_velocity(2000.0, &config);
        // At compressed scale, orbital velocity should be a few hundred m/s
        assert!(v > 50.0 && v < 2000.0, "Orbital velocity: {}", v);
    }
}
