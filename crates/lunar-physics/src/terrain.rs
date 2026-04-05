//! Terrain system — height sampling, surface properties
//!
//! For MVP, terrain is a smooth sphere with no height displacement.
//! This module provides the interface for future heightmap-based terrain.

use crate::types::WorldConfig;

/// Terrain height at a given position on the Moon's surface.
///
/// For MVP: returns the smooth sphere radius (no displacement).
/// Future: sample from a heightmap texture/procedural noise.
#[inline]
pub fn sample_height(position: &[f32; 3], config: &WorldConfig) -> f32 {
    // MVP: smooth sphere — height = moon_radius everywhere
    config.moon_radius

    // Future implementation:
    // let lat = position[1].asin();
    // let lon = position[2].atan2(position[0]);
    // let displacement = sample_heightmap(lat, lon);
    // config.moon_radius + displacement
}

/// Surface normal at a given position.
/// For a smooth sphere, this is just the normalized position vector.
/// Future: compute from heightmap gradient.
#[inline]
pub fn sample_normal(position: &[f32; 3]) -> [f32; 3] {
    let r = (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
    if r < 0.001 {
        return [0.0, 1.0, 0.0];
    }
    [position[0] / r, position[1] / r, position[2] / r]
}

/// Surface friction coefficient at a given position.
/// Used for landing slide calculations.
#[inline]
pub fn surface_friction(_position: &[f32; 3]) -> f32 {
    // Moon regolith friction coefficient
    0.6
}

/// Check if a position is within a "dark spot" (crash mark)
/// Returns the darkness level (0.0 = clean, 1.0 = full scorch)
#[inline]
pub fn darkness_at(_position: &[f32; 3]) -> f32 {
    // MVP: no crash marks tracked in physics
    0.0
}

/// Terrain zone type (affects difficulty, visuals)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum TerrainZone {
    MarePlains = 0,       // Easy - flat dark plains
    MareRolling = 1,      // Easy-medium - gentle hills
    Highlands = 2,        // Medium - hilly, rocky
    CraterRim = 3,        // Hard - steep slopes
    DeepCrater = 4,       // Hard - interior bowl
    Canyon = 5,           // Extreme - narrow channels
    SouthPole = 6,        // Extreme - dark, rugged
}

impl TerrainZone {
    /// Get the zone for a given position based on latitude/longitude
    /// MVP: simple latitude-based assignment
    pub fn at_position(position: &[f32; 3], config: &WorldConfig) -> TerrainZone {
        let r = (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
        let lat = (position[1] / r).asin().to_degrees().abs();

        if lat > 80.0 {
            TerrainZone::SouthPole
        } else if lat > 60.0 {
            TerrainZone::CraterRim
        } else if lat > 40.0 {
            TerrainZone::Highlands
        } else if lat > 20.0 {
            TerrainZone::MareRolling
        } else {
            TerrainZone::MarePlains
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_height_returns_moon_radius() {
        let config = WorldConfig::default();
        let pos = [config.moon_radius, 0.0, 0.0];
        let h = sample_height(&pos, &config);
        assert!((h - config.moon_radius).abs() < 0.1);
    }

    #[test]
    fn test_sample_normal() {
        let pos = [0.0, 10_000.0, 0.0];
        let normal = sample_normal(&pos);
        assert!((normal[0]).abs() < 0.001);
        assert!((normal[1] - 1.0).abs() < 0.001);
        assert!((normal[2]).abs() < 0.001);
    }

    #[test]
    fn test_terrain_zones() {
        let config = WorldConfig::default();

        // Equator
        let equator = [config.moon_radius, 0.0, 0.0];
        assert_eq!(TerrainZone::at_position(&equator, &config), TerrainZone::MarePlains);

        // Pole
        let pole = [0.0, config.moon_radius, 0.0];
        assert_eq!(TerrainZone::at_position(&pole, &config), TerrainZone::SouthPole);
    }
}
