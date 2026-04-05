/**
 * WASM Bridge — loads and wraps the Rust physics engine
 */

// We need to dynamically import the WASM module
let wasmModule: any = null;

export interface WasmSimulation {
  new(): WasmSimulation;
  spawn_lander(entity_type: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): number;
  spawn_projectile(owner: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): number;
  destroy_entity(id: number): void;
  apply_input(entity_id: number, throttle: number, pitch: number, yaw: number, roll: number,
    translate_x: number, translate_y: number, translate_z: number,
    sas_mode: number, fire: boolean, boost: boolean, rcs_mode: boolean, fine_control: boolean): void;
  tick(): number;
  time(): number;
  is_active(id: number): boolean;
  get_position(id: number): number[];
  get_velocity(id: number): number[];
  get_orientation(id: number): number[];
  get_health(id: number): number;
  get_fuel(id: number): number;
  get_fuel_pct(id: number): number;
  read_states(max_entities: number): number[];
  compute_orbit(entity_id: number): number[];
  sample_terrain_height(x: number, y: number, z: number): number;
  get_altitude(x: number, y: number, z: number): number;
  get_surface_normal(x: number, y: number, z: number): number[];
  circular_orbit_velocity(altitude: number): number;
  add_pad(id: number, x: number, y: number, z: number, radius: number, safe_zone: boolean): void;
  moon_radius(): number;
  moon_gm(): number;
  active_entity_count(): number;
  event_count(): number;
  read_events(): number[];
}

/**
 * Load the WASM physics module
 */
export async function loadPhysics(statusEl?: HTMLElement): Promise<WasmSimulation> {
  if (wasmModule) return wasmModule;

  if (statusEl) statusEl.textContent = 'Downloading physics engine...';

  try {
    // Dynamic import of the wasm-pack generated module
    const wasmImport = await import('/lunar_physics_wasm.js');
    const module = await wasmImport.default();
    wasmModule = module.WasmSimulation;
    return wasmModule;
  } catch (e) {
    // Fallback: try without .js extension
    try {
      const wasmImport = await import('/lunar_physics_wasm.js' as any);
      const { WasmSimulation } = wasmImport;
      wasmModule = WasmSimulation;
      return wasmModule;
    } catch (e2) {
      throw new Error(`Failed to load WASM physics: ${e2}`);
    }
  }
}

/** Entity type constants matching Rust */
export const EntityType = {
  LANDER_SCOUT: 0,
  LANDER_STANDARD: 1,
  LANDER_HEAVY: 2,
  LANDER_INTERCEPTOR: 3,
  PROJECTILE: 4,
  DEBRIS: 5,
} as const;

/** SAS mode constants matching Rust */
export const SasMode = {
  OFF: 0,
  STABILITY: 1,
  PROGRADE: 2,
  RETROGRADE: 3,
  RADIAL_IN: 4,
  RADIAL_OUT: 5,
  TARGET: 6,
} as const;

/** Event type constants */
export const EventType = {
  COLLISION: 0,
  CRASH: 1,
  LANDING: 2,
  DESTROYED: 3,
  PROJECTILE_FIRED: 4,
  PROJECTILE_EXPIRED: 5,
  DAMAGE: 6,
  SPAWNED: 7,
} as const;
