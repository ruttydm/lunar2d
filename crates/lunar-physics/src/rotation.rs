//! Rotation system — RCS thrusters, reaction wheels, SAS (Stability Assist)
//!
//! Rotation is controlled via torques applied by RCS or reaction wheels.
//! SAS modes auto-stabilize the lander to desired orientations.

use crate::thrust::quat_rotate_vector;
use crate::types::{EntityType, SasMode};

/// Apply rotation input to a quaternion orientation.
///
/// # Arguments
/// * `orientation` - Quaternion [x,y,z,w] (mutated)
/// * `angular_velocity` - Angular velocity [wx,wy,wz] rad/s (mutated)
/// * `pitch_input` - Pitch input -1 to 1
/// * `yaw_input` - Yaw input -1 to 1
/// * `roll_input` - Roll input -1 to 1
/// * `entity_type` - Determines rotation speed
/// * `fine_control` - If true, reduces rotation rates by 75%
/// * `dt` - Time step
#[inline]
pub fn apply_rotation_input(
    orientation: &mut [f32; 4],
    angular_velocity: &mut [f32; 3],
    pitch_input: f32,
    yaw_input: f32,
    roll_input: f32,
    entity_type: EntityType,
    fine_control: bool,
    dt: f32,
) {
    let base_speed = entity_type.rotation_speed();
    let speed = if fine_control { base_speed * 0.25 } else { base_speed };

    // Local axes for rotation
    let local_x = quat_rotate_vector(orientation, &[1.0, 0.0, 0.0]); // pitch axis (right)
    let local_y = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]); // yaw axis (up)
    let local_z = quat_rotate_vector(orientation, &[0.0, 0.0, 1.0]); // roll axis (forward)

    // Apply angular acceleration in local frame
    angular_velocity[0] += local_x[0] * pitch_input * speed * dt
        + local_y[0] * yaw_input * speed * dt
        + local_z[0] * roll_input * speed * dt;
    angular_velocity[1] += local_x[1] * pitch_input * speed * dt
        + local_y[1] * yaw_input * speed * dt
        + local_z[1] * roll_input * speed * dt;
    angular_velocity[2] += local_x[2] * pitch_input * speed * dt
        + local_y[2] * yaw_input * speed * dt
        + local_z[2] * roll_input * speed * dt;
}

/// Apply SAS (Stability Assist System) to stabilize orientation.
///
/// SAS works by applying counter-torques to resist rotation and/or
/// point the lander toward a target orientation.
///
/// # Arguments
/// * `orientation` - Current quaternion [x,y,z,w]
/// * `angular_velocity` - Angular velocity [wx,wy,wz] (mutated)
/// * `velocity` - Current velocity [vx,vy,vz]
/// * `sas_mode` - Which SAS mode to use
/// * `sas_strength` - SAS torque strength (0.0-1.0, based on upgrades)
/// * `target_direction` - Optional target position for Target SAS mode
/// * `dt` - Time step
#[inline]
pub fn apply_sas(
    orientation: &[f32; 4],
    angular_velocity: &mut [f32; 3],
    velocity: &[f32; 3],
    sas_mode: SasMode,
    sas_strength: f32,
    target_direction: Option<&[f32; 3]>,
    dt: f32,
) {
    if sas_mode == SasMode::Off {
        return;
    }

    let damping = 5.0 * sas_strength * dt;

    match sas_mode {
        SasMode::Off => {}
        SasMode::Stability => {
            // Simply damp angular velocity toward zero
            angular_velocity[0] *= (1.0 - damping).max(0.0);
            angular_velocity[1] *= (1.0 - damping).max(0.0);
            angular_velocity[2] *= (1.0 - damping).max(0.0);
        }
        SasMode::Prograde | SasMode::Retrograde => {
            // Point toward (or away from) velocity vector
            let vel_mag = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();
            if vel_mag < 0.1 {
                // No meaningful velocity, just stabilize
                angular_velocity[0] *= (1.0 - damping).max(0.0);
                angular_velocity[1] *= (1.0 - damping).max(0.0);
                angular_velocity[2] *= (1.0 - damping).max(0.0);
                return;
            }

            let target = if sas_mode == SasMode::Prograde {
                [velocity[0] / vel_mag, velocity[1] / vel_mag, velocity[2] / vel_mag]
            } else {
                [-velocity[0] / vel_mag, -velocity[1] / vel_mag, -velocity[2] / vel_mag]
            };

            // Current "up" direction of lander
            let up = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]);

            // Torque toward target
            apply_alignment_torque(angular_velocity, &up, &target, sas_strength, dt);
        }
        SasMode::RadialIn | SasMode::RadialOut => {
            // Point toward (or away from) Moon center
            // Use orientation position indirectly — the "up" vector should point
            // toward center (radial in) or away from center (radial out)
            // For SAS, we assume position is implicit — radial in = orient "down"
            // Radial in: lander nose points toward Moon center → "up" points away
            // Radial out: lander "up" points away from Moon

            // We need position for this — use a simpler approach:
            // Just damp and let the player handle radial alignment
            // A full implementation would need position passed in

            // Stabilize first
            angular_velocity[0] *= (1.0 - damping).max(0.0);
            angular_velocity[1] *= (1.0 - damping).max(0.0);
            angular_velocity[2] *= (1.0 - damping).max(0.0);
        }
        SasMode::Target => {
            if let Some(target_pos) = target_direction {
                // Point toward target position
                let target_dir = [target_pos[0], target_pos[1], target_pos[2]];
                let mag = (target_dir[0] * target_dir[0] + target_dir[1] * target_dir[1] + target_dir[2] * target_dir[2]).sqrt();
                if mag > 0.001 {
                    let normalized = [target_dir[0] / mag, target_dir[1] / mag, target_dir[2] / mag];
                    let forward = quat_rotate_vector(orientation, &[0.0, 0.0, 1.0]);
                    apply_alignment_torque(angular_velocity, &forward, &normalized, sas_strength, dt);
                }
            } else {
                // No target, just stabilize
                angular_velocity[0] *= (1.0 - damping).max(0.0);
                angular_velocity[1] *= (1.0 - damping).max(0.0);
                angular_velocity[2] *= (1.0 - damping).max(0.0);
            }
        }
    }
}

/// Apply a torque to align current_dir toward target_dir
fn apply_alignment_torque(
    angular_velocity: &mut [f32; 3],
    current_dir: &[f32; 3],
    target_dir: &[f32; 3],
    strength: f32,
    dt: f32,
) {
    // Cross product gives rotation axis and magnitude
    let cross_x = current_dir[1] * target_dir[2] - current_dir[2] * target_dir[1];
    let cross_y = current_dir[2] * target_dir[0] - current_dir[0] * target_dir[2];
    let cross_z = current_dir[0] * target_dir[1] - current_dir[1] * target_dir[0];

    let torque_strength = 3.0 * strength * dt;

    angular_velocity[0] += cross_x * torque_strength;
    angular_velocity[1] += cross_y * torque_strength;
    angular_velocity[2] += cross_z * torque_strength;

    // Also damp existing angular velocity
    let damp = 2.0 * strength * dt;
    angular_velocity[0] *= (1.0 - damp).max(0.0);
    angular_velocity[1] *= (1.0 - damp).max(0.0);
    angular_velocity[2] *= (1.0 - damp).max(0.0);
}

/// Integrate angular velocity into the orientation quaternion.
/// Also applies damping (simulates internal friction / RCS limits).
#[inline]
pub fn integrate_rotation(
    orientation: &mut [f32; 4],
    angular_velocity: &[f32; 3],
    dt: f32,
) {
    let wx = angular_velocity[0];
    let wy = angular_velocity[1];
    let wz = angular_velocity[2];

    // Quaternion derivative: dq = 0.5 * omega * q
    let qx = orientation[0];
    let qy = orientation[1];
    let qz = orientation[2];
    let qw = orientation[3];

    let half_dt = 0.5 * dt;
    orientation[0] += half_dt * (wx * qw + wy * qz - wz * qy);
    orientation[1] += half_dt * (wy * qw + wz * qx - wx * qz);
    orientation[2] += half_dt * (wz * qw + wx * qy - wy * qx);
    orientation[3] += half_dt * (-wx * qx - wy * qy - wz * qz);

    // Normalize quaternion to prevent drift
    let len = (orientation[0] * orientation[0]
        + orientation[1] * orientation[1]
        + orientation[2] * orientation[2]
        + orientation[3] * orientation[3])
    .sqrt();
    if len > 0.0001 {
        let inv_len = 1.0 / len;
        orientation[0] *= inv_len;
        orientation[1] *= inv_len;
        orientation[2] *= inv_len;
        orientation[3] *= inv_len;
    }
}

/// Brake assist: automatically applies retrograde thrust to slow down.
/// Returns the recommended throttle level and orientation for braking.
///
/// # Returns
/// (throttle, target_orientation_quaternion)
#[inline]
pub fn compute_brake_assist(
    velocity: &[f32; 3],
    current_orientation: &[f32; 4],
) -> (f32, [f32; 4]) {
    let speed = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();

    if speed < 0.5 {
        return (0.0, *current_orientation);
    }

    // Retrograde direction (opposite of velocity)
    let retro_x = -velocity[0] / speed;
    let retro_y = -velocity[1] / speed;
    let retro_z = -velocity[2] / speed;

    // Target orientation: point "up" toward retrograde (thrust will slow us down)
    // Compute quaternion that rotates [0,1,0] to retrograde direction
    let target_quat = rotation_between(&[0.0, 1.0, 0.0], &[retro_x, retro_y, retro_z]);

    // Throttle proportional to speed (full throttle when fast, less when slow)
    let throttle = if speed > 50.0 { 1.0 } else { speed / 50.0 };

    (throttle, target_quat)
}

/// Compute the quaternion that rotates `from` direction to `to` direction
fn rotation_between(from: &[f32; 3], to: &[f32; 3]) -> [f32; 4] {
    let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];

    // Parallel vectors
    if dot > 0.9999 {
        return [0.0, 0.0, 0.0, 1.0];
    }

    // Opposite vectors
    if dot < -0.9999 {
        // Find a perpendicular axis
        let axis = if from[0].abs() < 0.9 {
            // Cross with X
            let mut r = [0.0; 4];
            let len = (from[1] * from[1] + from[2] * from[2]).sqrt();
            r[0] = 0.0;
            r[1] = from[2] / len;
            r[2] = -from[1] / len;
            r[3] = 0.0; // 180 degree rotation
            return r;
        } else {
            let mut r = [0.0; 4];
            let len = (from[0] * from[0] + from[2] * from[2]).sqrt();
            r[0] = -from[2] / len;
            r[1] = 0.0;
            r[2] = from[0] / len;
            r[3] = 0.0;
            return r;
        };
    }

    // General case: axis = cross(from, to), angle = acos(dot)
    let ax = from[1] * to[2] - from[2] * to[1];
    let ay = from[2] * to[0] - from[0] * to[2];
    let az = from[0] * to[1] - from[1] * to[0];

    // For unit vectors: |cross| = sin(angle), dot = cos(angle)
    // q = [axis * sin(half_angle), cos(half_angle)]
    // sin(half) = sqrt((1 - cos) / 2), but we can use the cross product magnitude directly
    let s = ((1.0 - dot) * 0.5).sqrt();
    let w = ((1.0 + dot) * 0.5).sqrt();

    [ax * s, ay * s, az * s, w]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sas_stability_damps_angular_velocity() {
        let orientation = [0.0, 0.0, 0.0, 1.0];
        let mut angular_velocity = [1.0, 0.5, 0.3];
        let velocity = [10.0, 0.0, 0.0];

        apply_sas(
            &orientation,
            &mut angular_velocity,
            &velocity,
            SasMode::Stability,
            1.0,
            None,
            1.0 / 60.0,
        );

        // Should have damped toward zero
        assert!(angular_velocity[0].abs() < 1.0);
        assert!(angular_velocity[1].abs() < 0.5);
        assert!(angular_velocity[2].abs() < 0.3);
    }

    #[test]
    fn test_integrate_rotation() {
        let mut orientation = [0.0, 0.0, 0.0, 1.0];
        let angular_velocity = [1.0, 0.0, 0.0]; // Rotate around X axis

        integrate_rotation(&mut orientation, &angular_velocity, 1.0 / 60.0);

        // Should have changed
        assert!(orientation[0].abs() > 0.0 || orientation[1].abs() > 0.0 || orientation[2].abs() > 0.0);

        // Should still be unit quaternion
        let len = (orientation[0] * orientation[0] + orientation[1] * orientation[1]
            + orientation[2] * orientation[2] + orientation[3] * orientation[3])
        .sqrt();
        assert!((len - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_brake_assist() {
        let velocity = [0.0, -100.0, 0.0]; // Falling fast
        let orientation = [0.0, 0.0, 0.0, 1.0];

        let (throttle, target_quat) = compute_brake_assist(&velocity, &orientation);

        assert!(throttle > 0.0, "Should recommend throttle");
        // Target should point up (retrograde to downward velocity = upward)
        let up = quat_rotate_vector(&target_quat, &[0.0, 1.0, 0.0]);
        assert!(up[1] > 0.5, "Thrust should point upward to brake descent");
    }
}
