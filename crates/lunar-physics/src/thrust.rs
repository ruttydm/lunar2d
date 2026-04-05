//! Thrust system — engine thrust, fuel consumption, mass updates
//!
//! Thrust is applied along the lander's "up" direction (negative of the
//! orientation's forward axis). Fuel is consumed proportionally.
//! As fuel burns, total mass decreases, making the lander more responsive.

use crate::types::EntityType;

/// Apply thrust to a single entity.
///
/// # Arguments
/// * `position` - Current position [x,y,z]
/// * `velocity` - Current velocity [vx,vy,vz] (mutated)
/// * `orientation` - Current orientation as quaternion [x,y,z,w] (lander's "up" direction = local Y+)
/// * `throttle` - Throttle level 0.0 - 1.0
/// * `fuel` - Current fuel (mutated, decreased by consumption)
/// * `mass` - Current total mass (mutated, decreased by fuel burn)
/// * `entity_type` - Entity type (determines thrust power, fuel rate)
/// * `boost` - Whether boost is active (multiplies thrust)
/// * `dt` - Time step
/// * `fuel_rate_multiplier` - Upgrade multiplier for fuel consumption (1.0 = base)
/// * `thrust_multiplier` - Upgrade multiplier for thrust (1.0 = base)
///
/// # Returns
/// * True if thrust was applied (had fuel), false if out of fuel
#[inline]
pub fn apply_thrust(
    velocity: &mut [f32; 3],
    orientation: &[f32; 4],
    throttle: f32,
    fuel: &mut f32,
    mass: &mut f32,
    entity_type: EntityType,
    boost: bool,
    dt: f32,
    fuel_rate_multiplier: f32,
    thrust_multiplier: f32,
) -> bool {
    if throttle < 0.001 || *fuel <= 0.0 {
        return false;
    }

    // Effective throttle (boost increases by 50%)
    let effective_throttle = if boost { (throttle * 1.5).min(1.0) } else { throttle };

    // Base thrust power for this lander type
    let base_thrust = entity_type.base_thrust() * thrust_multiplier;
    let thrust_force = base_thrust * effective_throttle;

    // Fuel consumption rate (proportional to thrust)
    // Base: consume full tank in ~60 seconds at full throttle
    let fuel_rate = entity_type.base_fuel() / 60.0 * effective_throttle * fuel_rate_multiplier;
    let fuel_consumed = fuel_rate * dt;

    if *fuel < fuel_consumed {
        // Partial thrust with remaining fuel
        *fuel = 0.0;
        return false;
    }

    *fuel -= fuel_consumed;
    *mass -= fuel_consumed * 0.01; // Fuel has mass

    // Thrust direction: the lander's "up" direction in world space
    // Quaternion rotates local Y+ to world direction
    let thrust_dir = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]);

    // F = ma → a = F/m
    let inv_mass = 1.0 / mass.max(1.0);
    let ax = thrust_dir[0] * thrust_force * inv_mass * dt;
    let ay = thrust_dir[1] * thrust_force * inv_mass * dt;
    let az = thrust_dir[2] * thrust_force * inv_mass * dt;

    velocity[0] += ax;
    velocity[1] += ay;
    velocity[2] += az;

    true
}

/// Apply RCS translation thrust (lateral movement)
/// Applies thrust along local X, Y, Z axes relative to the lander's orientation
#[inline]
pub fn apply_rcs_translation(
    velocity: &mut [f32; 3],
    orientation: &[f32; 4],
    translate: &[f32; 3], // x, y, z input (-1 to 1)
    mass: f32,
    entity_type: EntityType,
    dt: f32,
) {
    if translate[0].abs() < 0.001 && translate[1].abs() < 0.001 && translate[2].abs() < 0.001 {
        return;
    }

    // RCS thrust is 10% of main engine
    let rcs_force = entity_type.base_thrust() * 0.1;

    let inv_mass = 1.0 / mass.max(1.0);

    // Transform each local axis to world space
    let local_x = quat_rotate_vector(orientation, &[1.0, 0.0, 0.0]);
    let local_y = quat_rotate_vector(orientation, &[0.0, 1.0, 0.0]);
    let local_z = quat_rotate_vector(orientation, &[0.0, 0.0, 1.0]);

    for i in 0..3 {
        let ax = (local_x[i] * translate[0] + local_y[i] * translate[1] + local_z[i] * translate[2])
            * rcs_force
            * inv_mass
            * dt;
        velocity[i] += ax;
    }
}

/// Apply thrust exhaust as a push force on another entity
/// Used for the "thrust push" PvP mechanic
///
/// # Arguments
/// * `source_position` - Position of the thrusting lander
/// * `source_orientation` - Orientation of the thrusting lander
/// * `throttle` - Throttle level of the source
/// * `target_position` - Position of entity being pushed (mutated via velocity)
/// * `target_velocity` - Velocity of entity being pushed (mutated)
/// * `target_mass` - Mass of entity being pushed
/// * `entity_type` - Type of the source lander
/// * `dt` - Time step
#[inline]
pub fn apply_thrust_push(
    source_position: &[f32; 3],
    source_orientation: &[f32; 4],
    throttle: f32,
    target_position: &[f32; 3],
    target_velocity: &mut [f32; 3],
    target_mass: f32,
    entity_type: EntityType,
    dt: f32,
) {
    if throttle < 0.1 {
        return;
    }

    // Exhaust direction: opposite of lander's "up" (pointing down from engine)
    let exhaust_dir = quat_rotate_vector(source_orientation, &[0.0, -1.0, 0.0]);

    // Vector from source to target
    let dx = target_position[0] - source_position[0];
    let dy = target_position[1] - source_position[1];
    let dz = target_position[2] - source_position[2];
    let dist_sq = dx * dx + dy * dy + dz * dz;

    // Push force falls off with distance squared
    let max_push_range = 50.0; // meters
    if dist_sq > max_push_range * max_push_range {
        return;
    }

    let dist = dist_sq.sqrt().max(1.0);

    // Check if target is roughly in the exhaust cone
    let dot = (dx * exhaust_dir[0] + dy * exhaust_dir[1] + dz * exhaust_dir[2]) / dist;
    if dot < 0.5 {
        return; // Not in exhaust cone (~60 degree cone)
    }

    let push_force = entity_type.base_thrust() * throttle * 0.3 / (dist_sq.max(1.0));
    let inv_mass = 1.0 / target_mass.max(1.0);

    target_velocity[0] += dx / dist * push_force * inv_mass * dt;
    target_velocity[1] += dy / dist * push_force * inv_mass * dt;
    target_velocity[2] += dz / dist * push_force * inv_mass * dt;
}

/// Rotate a vector by a quaternion
#[inline]
pub fn quat_rotate_vector(q: &[f32; 4], v: &[f32; 3]) -> [f32; 3] {
    // q = [x, y, z, w]
    let qx = q[0];
    let qy = q[1];
    let qz = q[2];
    let qw = q[3];

    // t = 2 * cross(q.xyz, v)
    let tx = 2.0 * (qy * v[2] - qz * v[1]);
    let ty = 2.0 * (qz * v[0] - qx * v[2]);
    let tz = 2.0 * (qx * v[1] - qy * v[0]);

    // result = v + q.w * t + cross(q.xyz, t)
    [
        v[0] + qw * tx + (qy * tz - qz * ty),
        v[1] + qw * ty + (qz * tx - qx * tz),
        v[2] + qw * tz + (qx * ty - qy * tx),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thrust_acceleration() {
        let mut velocity = [0.0; 3];
        let orientation = [0.0, 0.0, 0.0, 1.0]; // Identity quaternion (up = world Y+)
        let mut fuel = 100.0;
        let mut mass = 1000.0;

        let applied = apply_thrust(
            &mut velocity,
            &orientation,
            1.0,
            &mut fuel,
            &mut mass,
            EntityType::LanderStandard,
            false,
            1.0 / 60.0,
            1.0,
            1.0,
        );

        assert!(applied);
        assert!(velocity[1] > 0.0, "Should accelerate upward");
        assert!(fuel < 100.0, "Should consume fuel");
    }

    #[test]
    fn test_no_fuel_no_thrust() {
        let mut velocity = [0.0; 3];
        let orientation = [0.0, 0.0, 0.0, 1.0];
        let mut fuel = 0.0;
        let mut mass = 1000.0;

        let applied = apply_thrust(
            &mut velocity,
            &orientation,
            1.0,
            &mut fuel,
            &mut mass,
            EntityType::LanderStandard,
            false,
            1.0 / 60.0,
            1.0,
            1.0,
        );

        assert!(!applied);
        assert_eq!(velocity, [0.0; 3]);
    }

    #[test]
    fn test_quat_rotate_identity() {
        let q = [0.0, 0.0, 0.0, 1.0]; // identity
        let v = [1.0, 2.0, 3.0];
        let r = quat_rotate_vector(&q, &v);
        assert!((r[0] - 1.0).abs() < 0.001);
        assert!((r[1] - 2.0).abs() < 0.001);
        assert!((r[2] - 3.0).abs() < 0.001);
    }

    #[test]
    fn test_quat_rotate_90deg() {
        // 90 degree rotation around Z axis: q = [0, 0, sin(45), cos(45)]
        let s = (45.0_f32).to_radians().sin();
        let c = (45.0_f32).to_radians().cos();
        let q = [0.0, 0.0, s, c];
        let v = [1.0, 0.0, 0.0];
        let r = quat_rotate_vector(&q, &v);
        assert!((r[0] - 0.0).abs() < 0.001, "x should be ~0, got {}", r[0]);
        assert!((r[1] - 1.0).abs() < 0.001, "y should be ~1, got {}", r[1]);
        assert!((r[2] - 0.0).abs() < 0.001, "z should be ~0, got {}", r[2]);
    }
}
