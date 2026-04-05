//! Spherical spatial grid for broad-phase collision and interest management
//!
//! Divides the Moon's surface into a grid of cells.
//! Each entity is assigned to a cell based on its position.
//! Enables O(1) lookup of nearby entities.

use crate::constants;
use crate::types::WorldConfig;

/// A cell in the spatial grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CellIndex(pub u32);

/// Spatial grid for the spherical Moon
pub struct SpatialGrid {
    /// Number of cells around the equator
    pub lon_cells: u32,
    /// Number of cells pole-to-pole
    pub lat_cells: u32,
    /// Number of altitude bands
    pub alt_bands: u32,
    /// Cell size (game units on surface)
    pub cell_size: f32,
    /// Altitude band thresholds
    pub alt_thresholds: Vec<f32>,
}

impl SpatialGrid {
    pub fn new(config: &WorldConfig) -> Self {
        let cell_size = constants::SPATIAL_CELL_SIZE;
        let circumference = 2.0 * std::f32::consts::PI * config.moon_radius;
        let lon_cells = (circumference / cell_size).ceil() as u32;
        let lat_cells = (circumference / (2.0 * cell_size)).ceil() as u32;

        let alt_thresholds = vec![
            0.0,        // Surface
            500.0,      // Low altitude
            5_000.0,    // High altitude
            50_000.0,   // Orbital
        ];
        let alt_bands = alt_thresholds.len() as u32;

        Self {
            lon_cells,
            lat_cells,
            alt_bands,
            cell_size,
            alt_thresholds,
        }
    }

    /// Compute the cell index for a given world position
    #[inline]
    pub fn cell_for_position(&self, position: &[f32; 3], config: &WorldConfig) -> u32 {
        let x = position[0];
        let y = position[1];
        let z = position[2];

        let r = (x * x + y * y + z * z).sqrt();

        // Latitude (-PI/2 to PI/2)
        let lat = (y / r).asin();
        let lat_normalized = (lat + std::f32::consts::FRAC_PI_2) / std::f32::consts::PI;
        let lat_cell = (lat_normalized * self.lat_cells as f32).floor() as u32;

        // Longitude (-PI to PI)
        let lon = z.atan2(x);
        let lon_normalized = (lon + std::f32::consts::PI) / (2.0 * std::f32::consts::PI);
        let lon_cell = (lon_normalized * self.lon_cells as f32).floor() as u32;

        // Altitude band
        let alt = r - config.moon_radius;
        let alt_band = self.altitude_band(alt);

        // Compose into a single cell index
        let clamped_lat = lat_cell.min(self.lat_cells - 1);
        let clamped_lon = lon_cell.min(self.lon_cells - 1);

        alt_band * self.lat_cells * self.lon_cells + clamped_lat * self.lon_cells + clamped_lon
    }

    /// Get the altitude band index for a given altitude
    #[inline]
    pub fn altitude_band(&self, altitude: f32) -> u32 {
        for (i, threshold) in self.alt_thresholds.iter().enumerate().rev() {
            if altitude >= *threshold {
                return i as u32;
            }
        }
        0
    }

    /// Get the indices of neighboring cells (including self)
    /// Returns up to 9 cells (3x3 in lat/lon) in the same altitude band
    pub fn neighbor_cells(&self, cell: u32) -> Vec<u32> {
        let lon_cells = self.lon_cells;
        let lat_cells = self.lat_cells;

        let alt_band = cell / (lat_cells * lon_cells);
        let remainder = cell % (lat_cells * lon_cells);
        let lat_cell = remainder / lon_cells;
        let lon_cell = remainder % lon_cells;

        let mut neighbors = Vec::with_capacity(9);

        for dlat in 0..=2u32 {
            for dlon in 0..=2u32 {
                let lt = if dlat == 0 {
                    lat_cell.saturating_sub(1)
                } else if dlat == 2 {
                    (lat_cell + 1).min(lat_cells - 1)
                } else {
                    lat_cell
                };

                let ln = if dlon == 0 {
                    lon_cell.saturating_sub(1)
                } else if dlon == 2 {
                    (lon_cell + 1) % lon_cells // Wrap around
                } else {
                    lon_cell
                };

                neighbors.push(alt_band * lat_cells * lon_cells + lt * lon_cells + ln);
            }
        }

        neighbors
    }

    /// Check if two cells are adjacent (same or neighboring)
    #[inline]
    pub fn are_adjacent(&self, cell_a: u32, cell_b: u32) -> bool {
        if cell_a == cell_b {
            return true;
        }

        let lon_cells = self.lon_cells;
        let lat_cells = self.lat_cells;

        let ab_a = cell_a / (lat_cells * lon_cells);
        let ab_b = cell_b / (lat_cells * lon_cells);

        // Different altitude bands — check if adjacent bands
        if ab_a != ab_b {
            return (ab_a as i32 - ab_b as i32).unsigned_abs() <= 1;
        }

        let lat_a = (cell_a % (lat_cells * lon_cells)) / lon_cells;
        let lat_b = (cell_b % (lat_cells * lon_cells)) / lon_cells;
        let lon_a = cell_a % lon_cells;
        let lon_b = cell_b % lon_cells;

        let lat_diff = (lat_a as i32 - lat_b as i32).unsigned_abs();
        let raw_lon_diff = (lon_a as i32 - lon_b as i32).unsigned_abs();
        let lon_diff = raw_lon_diff.min(lon_cells - raw_lon_diff);

        lat_diff <= 1 && lon_diff <= 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_assignment() {
        let config = WorldConfig::default();
        let grid = SpatialGrid::new(&config);

        // Two positions far apart should be in different cells
        let pos_a = [0.0, config.moon_radius + 100.0, 0.0];
        let pos_b = [config.moon_radius, 100.0, 0.0];

        let cell_a = grid.cell_for_position(&pos_a, &config);
        let cell_b = grid.cell_for_position(&pos_b, &config);

        assert_ne!(cell_a, cell_b, "Far apart positions should be in different cells");
    }

    #[test]
    fn test_nearby_positions_same_cell() {
        let config = WorldConfig::default();
        let grid = SpatialGrid::new(&config);

        let pos_a = [0.0, config.moon_radius + 100.0, 0.0];
        let pos_b = [10.0, config.moon_radius + 100.0, 0.0]; // 10m away

        let cell_a = grid.cell_for_position(&pos_a, &config);
        let cell_b = grid.cell_for_position(&pos_b, &config);

        assert_eq!(cell_a, cell_b, "Nearby positions should be in same cell");
    }

    #[test]
    fn test_altitude_bands() {
        let config = WorldConfig::default();
        let grid = SpatialGrid::new(&config);

        // Thresholds: [0, 500, 5000, 50000]
        // Band 0: 0-500 (surface), Band 1: 500-5000 (low), Band 2: 5000-50000 (high), Band 3: 50000+ (orbital)
        assert_eq!(grid.altitude_band(100.0), 0, "100m should be band 0 (surface)");
        assert_eq!(grid.altitude_band(501.0), 1, "501m should be band 1 (low altitude)");
        assert_eq!(grid.altitude_band(6000.0), 2, "6km should be band 2 (high altitude)");
        assert_eq!(grid.altitude_band(60000.0), 3, "60km should be band 3 (orbital)");
        assert_eq!(grid.altitude_band(0.0), 0, "At surface should be band 0");
    }

    #[test]
    fn test_neighbor_cells() {
        let config = WorldConfig::default();
        let grid = SpatialGrid::new(&config);

        let pos = [0.0, config.moon_radius + 100.0, 0.0];
        let cell = grid.cell_for_position(&pos, &config);
        let neighbors = grid.neighbor_cells(cell);

        assert!(neighbors.len() >= 1);
        assert!(neighbors.contains(&cell), "Should include self");
    }
}
