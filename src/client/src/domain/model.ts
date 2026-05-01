/**
 * Lunar2D - side-on lunar lander built for readable, skill-based play.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Pad {
  id: number;
  name: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  platformRadius: number;
  damaged: boolean;
}

export interface Portal {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  url: string;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  armed: boolean;
}

export interface RemotePlayer {
  id: number;
  name: string;
  bodyId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  throttle: number;
  updatedAt: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface TerrainSample {
  angle: number;
  radius: number;
}

export interface LanderSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  fuel: number;
  hp: number;
}

export interface ContactPoint {
  label: 'left-leg' | 'right-leg' | 'hull';
  point: Vec2;
  bodyPoint: Vec2;
  penetration: number;
  normal: Vec2;
  tangent: Vec2;
  footVelocity: Vec2;
  radialVelocity: number;
  tangentVelocity: number;
}

export interface LanderStats {
  name: string;
  mass: number;
  maxTwr: number;
  fuel: number;
  hp: number;
  rotation: number;
  color: string;
}

export interface CelestialBody {
  id: string;
  name: string;
  type: string;
  gravityMps2: number;
  radiusM: number;
  gameRadiusM: number;
  terrainScale: number;
  terrainAmp: number;
  craterRate: number;
  skyTop: string;
  skyMid: string;
  horizon: string;
  groundTop: string;
  groundMid: string;
  groundBottom: string;
  ridgeFar: string;
  ridgeNear: string;
  surfaceLine: string;
  padNames: string[];
}

export const REAL_MOON_RADIUS_M = 1_737_400;
export const GAME_MOON_RADIUS_M = 42_000;
export const WORLD_METERS_PER_UNIT = 0.25;
export const MOON_GRAVITY_MPS2 = 1.625;
export const PHYSICS_STEP = 1 / 120;
export const TERRAIN_SAMPLE_COUNT = 2048;
export const RCS_ACCEL = 0.95 / WORLD_METERS_PER_UNIT;
export const RCS_VERTICAL_ACCEL = 0.65 / WORLD_METERS_PER_UNIT;
export const LEG_SPRING = 42;
export const LEG_DAMPING = 14;
export const LEG_FRICTION = 3.2;
export const LEG_TORQUE_RESPONSE = 0.0026;
export const LEG_RESTITUTION = 0.12;
export const GROUND_CLEARANCE_BUFFER = 1.8;
export const BRAKING_INTENT_DOT_THRESHOLD = -0.02;
export const LANDER_COLLISION_RADIUS = 25;
export const PROJECTILE_RADIUS = 3.2;
export const PROJECTILE_ARM_TIME = 0.32;
export const PROJECTILE_LIFE_SECONDS = 180;
export const PROJECTILE_COOLDOWN_SECONDS = 0.9;
export const PROJECTILE_MUZZLE_SPEED = 82;
export const PROJECTILE_MIN_MUZZLE_SPEED = 34;
export const PROJECTILE_ESCAPE_SPEED_FRACTION = 0.72;
export const PROJECTILE_DAMAGE = 72;
export const VIBE_JAM_PORTAL_URL = 'https://vibejam.cc/portal/2026';
const runtimeLocation = typeof location === 'undefined'
  ? { protocol: 'http:', port: '3000', hostname: '127.0.0.1' }
  : location;
export const MULTIPLAYER_PROTOCOL = runtimeLocation.protocol === 'https:' ? 'wss' : 'ws';
export const MULTIPLAYER_PORT = runtimeLocation.port === '3000' ? '3001' : runtimeLocation.port;
export const MULTIPLAYER_URL = `${MULTIPLAYER_PROTOCOL}://${runtimeLocation.hostname}${MULTIPLAYER_PORT ? `:${MULTIPLAYER_PORT}` : ''}`;
export const PILOT_ADJECTIVES = ['Nova', 'Apex', 'Vector', 'Comet', 'Ranger', 'Echo', 'Zenith', 'Atlas'];
export const PILOT_NOUNS = ['Falcon', 'Drift', 'Surveyor', 'Beacon', 'Nomad', 'Arrow', 'Orbit', 'Strider'];

export function generatePilotName() {
  const adjective = PILOT_ADJECTIVES[Math.floor(Math.random() * PILOT_ADJECTIVES.length)];
  const noun = PILOT_NOUNS[Math.floor(Math.random() * PILOT_NOUNS.length)];
  const number = Math.floor(Math.random() * 90 + 10);
  return `${adjective} ${noun}-${number}`;
}
export const LEG_POINTS = [
  { x: -30, y: 30 },
  { x: 30, y: 30 },
];
export const HULL_BOTTOM = 22;

export const LANDERS: LanderStats[] = [
  { name: 'Scout', mass: 650, maxTwr: 2.9, fuel: 75, hp: 70, rotation: 3.1, color: '#56b6ff' },
  { name: 'Standard', mass: 1000, maxTwr: 2.55, fuel: 110, hp: 100, rotation: 2.35, color: '#f4f7f8' },
  { name: 'Heavy', mass: 1600, maxTwr: 2.25, fuel: 165, hp: 160, rotation: 1.55, color: '#ffb35a' },
  { name: 'Interceptor', mass: 820, maxTwr: 3.15, fuel: 90, hp: 85, rotation: 2.85, color: '#ff6862' },
];

export const BODIES: CelestialBody[] = [
  {
    id: 'moon',
    name: 'Moon',
    type: 'moon',
    gravityMps2: MOON_GRAVITY_MPS2,
    radiusM: REAL_MOON_RADIUS_M,
    gameRadiusM: GAME_MOON_RADIUS_M,
    terrainScale: 1,
    terrainAmp: 1,
    craterRate: 0.28,
    skyTop: '#172338',
    skyMid: '#202836',
    horizon: '#d6d1c1',
    groundTop: '#aaa69a',
    groundMid: '#848176',
    groundBottom: '#5b584f',
    ridgeFar: 'rgba(154,150,139,0.42)',
    ridgeNear: 'rgba(119,116,108,0.52)',
    surfaceLine: '#e4ddc8',
    padNames: ['Tranquility', 'Hadley', 'Kepler', 'Tycho', 'Faraday'],
  },
  {
    id: 'mars',
    name: 'Mars',
    type: 'planet',
    gravityMps2: 3.721,
    radiusM: 3_389_500,
    gameRadiusM: 58_000,
    terrainScale: 0.82,
    terrainAmp: 1.18,
    craterRate: 0.34,
    skyTop: '#6f8aa6',
    skyMid: '#b0856a',
    horizon: '#e2b982',
    groundTop: '#b67953',
    groundMid: '#865139',
    groundBottom: '#573222',
    ridgeFar: 'rgba(156,100,76,0.45)',
    ridgeNear: 'rgba(112,68,48,0.56)',
    surfaceLine: '#efc39a',
    padNames: ['Ares Vallis', 'Elysium', 'Gale', 'Utopia', 'Noctis'],
  },
  {
    id: 'mercury',
    name: 'Mercury',
    type: 'planet',
    gravityMps2: 3.7,
    radiusM: 2_439_700,
    gameRadiusM: 50_000,
    terrainScale: 1.16,
    terrainAmp: 0.92,
    craterRate: 0.18,
    skyTop: '#20242d',
    skyMid: '#3a3a37',
    horizon: '#e6dbc4',
    groundTop: '#bdb4a2',
    groundMid: '#7f7666',
    groundBottom: '#514b42',
    ridgeFar: 'rgba(166,157,139,0.40)',
    ridgeNear: 'rgba(104,96,82,0.56)',
    surfaceLine: '#f1e6ce',
    padNames: ['Caloris', 'Tolstoj', 'Borealis', 'Discovery', 'Kuiper'],
  },
  {
    id: 'europa',
    name: 'Europa',
    type: 'moon',
    gravityMps2: 1.315,
    radiusM: 1_560_800,
    gameRadiusM: 38_000,
    terrainScale: 1.45,
    terrainAmp: 0.58,
    craterRate: 0.52,
    skyTop: '#102135',
    skyMid: '#1c344a',
    horizon: '#e8f3ee',
    groundTop: '#d8d7ca',
    groundMid: '#a69f8e',
    groundBottom: '#655d54',
    ridgeFar: 'rgba(190,198,193,0.38)',
    ridgeNear: 'rgba(141,132,118,0.52)',
    surfaceLine: '#fff9df',
    padNames: ['Conamara', 'Minos', 'Pwyll', 'Tara', 'Cadmus'],
  },
  {
    id: 'titan',
    name: 'Titan',
    type: 'moon',
    gravityMps2: 1.352,
    radiusM: 2_574_730,
    gameRadiusM: 44_000,
    terrainScale: 0.9,
    terrainAmp: 0.84,
    craterRate: 0.48,
    skyTop: '#5e5446',
    skyMid: '#b78c4a',
    horizon: '#e1b65c',
    groundTop: '#9c7a43',
    groundMid: '#73562f',
    groundBottom: '#3f3222',
    ridgeFar: 'rgba(153,118,65,0.42)',
    ridgeNear: 'rgba(105,78,43,0.58)',
    surfaceLine: '#f3cf78',
    padNames: ['Shangri-La', 'Xanadu', 'Adiri', 'Belet', 'Hotei'],
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    type: 'moon',
    gravityMps2: 1.428,
    radiusM: 2_634_100,
    gameRadiusM: 46_000,
    terrainScale: 1.05,
    terrainAmp: 0.78,
    craterRate: 0.36,
    skyTop: '#152233',
    skyMid: '#273243',
    horizon: '#cec3a9',
    groundTop: '#a79c87',
    groundMid: '#756b5c',
    groundBottom: '#484139',
    ridgeFar: 'rgba(144,136,119,0.42)',
    ridgeNear: 'rgba(92,84,72,0.55)',
    surfaceLine: '#e6dcc5',
    padNames: ['Galileo', 'Uruk', 'Marius', 'Nicholson', 'Sippar'],
  },
  {
    id: 'enceladus',
    name: 'Enceladus',
    type: 'moon',
    gravityMps2: 0.113,
    radiusM: 252_100,
    gameRadiusM: 16_000,
    terrainScale: 2.1,
    terrainAmp: 0.48,
    craterRate: 0.55,
    skyTop: '#0d2031',
    skyMid: '#173247',
    horizon: '#f1fbff',
    groundTop: '#f2f1e8',
    groundMid: '#c4c7c3',
    groundBottom: '#81898a',
    ridgeFar: 'rgba(215,224,226,0.38)',
    ridgeNear: 'rgba(164,174,176,0.52)',
    surfaceLine: '#ffffff',
    padNames: ['Damascus', 'Cairo', 'Alexandria', 'Baghdad', 'Tiger'],
  },
  {
    id: 'ceres',
    name: 'Ceres',
    type: 'dwarf',
    gravityMps2: 0.284,
    radiusM: 473_000,
    gameRadiusM: 22_000,
    terrainScale: 1.65,
    terrainAmp: 0.7,
    craterRate: 0.4,
    skyTop: '#18202b',
    skyMid: '#2a2e34',
    horizon: '#c7c1b3',
    groundTop: '#918c82',
    groundMid: '#69645d',
    groundBottom: '#3e3b37',
    ridgeFar: 'rgba(130,126,118,0.42)',
    ridgeNear: 'rgba(86,82,76,0.55)',
    surfaceLine: '#d8d0c0',
    padNames: ['Occator', 'Ahuna', 'Kerwan', 'Dantu', 'Haulani'],
  },
  {
    id: 'pluto',
    name: 'Pluto',
    type: 'dwarf',
    gravityMps2: 0.62,
    radiusM: 1_188_300,
    gameRadiusM: 30_000,
    terrainScale: 1.25,
    terrainAmp: 0.68,
    craterRate: 0.46,
    skyTop: '#111f35',
    skyMid: '#2b3147',
    horizon: '#d2b7a3',
    groundTop: '#c9a994',
    groundMid: '#8b6f67',
    groundBottom: '#55434a',
    ridgeFar: 'rgba(164,133,122,0.42)',
    ridgeNear: 'rgba(103,79,82,0.54)',
    surfaceLine: '#efd2bd',
    padNames: ['Sputnik', 'Tombaugh', 'Burney', 'Lowell', 'Voyager'],
  },
];
