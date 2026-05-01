/**
 * WASM Bridge — loads and wraps the Rust physics engine
 */

let loaded = false;
let WasmSimulationClass: any = null;

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
  set_orientation(id: number, x: number, y: number, z: number, w: number): void;
  get_health(id: number): number;
  get_fuel(id: number): number;
  get_fuel_pct(id: number): number;
  read_states(max_entities: number): number[];
  active_entity_ids(max_entities: number): number[];
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
 * Load the WASM physics module.
 * Uses dynamic import so Vite doesn't try to resolve it at build time.
 * The pkg/ directory is served as Vite's publicDir (static files).
 */
export async function loadPhysics(statusEl?: HTMLElement): Promise<WasmSimulation> {
  if (loaded && WasmSimulationClass) return WasmSimulationClass;

  if (statusEl) statusEl.textContent = 'Downloading physics engine...';

  // Dynamic import of the wasm-pack generated JS glue
  // The .js file auto-resolves the .wasm file from the same URL base
  const wasmUrl = new URL('/lunar_physics_wasm.js', window.location.origin).href;
  const wasmPkg = await import(/* @vite-ignore */ wasmUrl);
  
  // The default export is the init function (async)
  await wasmPkg.default();
  
  // The named export is the WasmSimulation class
  WasmSimulationClass = wasmPkg.WasmSimulation;

  if (!WasmSimulationClass) {
    throw new Error('WasmSimulation class not found in WASM module');
  }

  loaded = true;
  if (statusEl) statusEl.textContent = 'Physics engine loaded!';

  return WasmSimulationClass;
}
