/**
 * Lunar2D - side-on lunar lander built for readable, skill-based play.
 */

import { InputManager } from './controls';

interface Vec2 {
  x: number;
  y: number;
}

interface Pad {
  id: number;
  name: string;
  x: number;
  y: number;
  radius: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface LanderStats {
  name: string;
  mass: number;
  maxTwr: number;
  fuel: number;
  hp: number;
  rotation: number;
  color: string;
}

interface CelestialBody {
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

const REAL_MOON_RADIUS_M = 1_737_400;
const GAME_MOON_RADIUS_M = 42_000;
const WORLD_METERS_PER_UNIT = 0.25;
const MOON_GRAVITY_MPS2 = 1.625;
const RCS_ACCEL = 0.95 / WORLD_METERS_PER_UNIT;
const RCS_VERTICAL_ACCEL = 0.65 / WORLD_METERS_PER_UNIT;
const LEG_SPRING = 58;
const LEG_DAMPING = 11;
const LEG_FRICTION = 2.2;
const LEG_TORQUE_RESPONSE = 0.0045;
const LEG_POINTS = [
  { x: -30, y: 30 },
  { x: 30, y: 30 },
];
const HULL_BOTTOM = 22;

const LANDERS: LanderStats[] = [
  { name: 'Scout', mass: 650, maxTwr: 2.9, fuel: 75, hp: 70, rotation: 3.1, color: '#56b6ff' },
  { name: 'Standard', mass: 1000, maxTwr: 2.55, fuel: 110, hp: 100, rotation: 2.35, color: '#f4f7f8' },
  { name: 'Heavy', mass: 1600, maxTwr: 2.25, fuel: 165, hp: 160, rotation: 1.55, color: '#ffb35a' },
  { name: 'Interceptor', mass: 820, maxTwr: 3.15, fuel: 90, hp: 85, rotation: 2.85, color: '#ff6862' },
];

const BODIES: CelestialBody[] = [
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

export class Game {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private input!: InputManager;

  private running = false;
  private lastTime = 0;
  private frameCount = 0;
  private currentFps = 60;
  private fpsTime = 0;
  private fpsFrames = 0;

  private width = 1280;
  private height = 720;
  private camera = { x: 0, y: 280, zoom: 0.9 };
  private cameraTarget = { x: 0, y: 280, zoom: 0.9 };

  private pads: Pad[] = [];
  private targetPadIndex = 0;
  private selectedLander = 1;
  private selectedBodyIndex = 0;
  private score = 0;
  private streak = 0;
  private landed = false;
  private destroyed = false;

  private lander = {
    x: 0,
    y: 900,
    vx: 0,
    vy: -8,
    angle: 0,
    angularVelocity: 0,
    fuel: LANDERS[1].fuel,
    hp: LANDERS[1].hp,
  };

  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private fireCooldown = 0;
  private hudElements: Record<string, HTMLElement> = {};
  private minimapCanvas: HTMLCanvasElement | null = null;
  private navballCanvas: HTMLCanvasElement | null = null;

  private audioContext: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private lastWarningAt = 0;

  async init(statusEl: HTMLElement) {
    statusEl.textContent = 'Preparing 2D lander...';
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.input = new InputManager(this.canvas);

    this.cacheHudElements();
    this.setupUiBindings();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.createWorld();
    this.spawnPlayer();
    statusEl.textContent = 'Ready';
  }

  private cacheHudElements() {
    const ids = [
      'score', 'rank', 'throttle-fill', 'throttle-label',
      'altitude', 'velocity', 'vel-vertical', 'vel-horizontal',
      'fuel-fill', 'fuel-label', 'hp-fill', 'hp-text',
      'sas-indicator', 'rcs-indicator', 'target-info',
      'objective-title', 'objective-detail',
      'perf-fps', 'perf-entities', 'perf-draw',
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) this.hudElements[id] = el;
    }

    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
    this.navballCanvas = document.getElementById('navball-canvas') as HTMLCanvasElement | null;
  }

  private setupUiBindings() {
    document.getElementById('audio-toggle')?.addEventListener('click', () => this.enableAudio());
    document.getElementById('controls-toggle')?.addEventListener('click', () => {
      document.getElementById('controls-panel')?.classList.toggle('visible');
    });

    const bodySelect = document.getElementById('body-select') as HTMLSelectElement | null;
    if (bodySelect) {
      bodySelect.innerHTML = BODIES
        .map((body, index) => `<option value="${index}">${body.name} ${body.gravityMps2.toFixed(2)} m/s2</option>`)
        .join('');
      bodySelect.value = `${this.selectedBodyIndex}`;
      bodySelect.addEventListener('change', () => {
        this.selectedBodyIndex = Number(bodySelect.value) || 0;
        this.createWorld();
        this.spawnPlayer();
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH' || event.code === 'Slash') {
        document.getElementById('controls-panel')?.classList.toggle('visible');
      }

      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        this.selectedLander = Number(event.code.replace('Digit', '')) - 1;
        if (!this.destroyed && !this.landed) this.spawnPlayer();
      }
    });
  }

  private resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * pixelRatio);
    this.canvas.height = Math.floor(this.height * pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  private createWorld() {
    const body = this.currentBody();
    const names = body.padNames;
    this.pads = [
      { id: 0, name: names[0] ?? 'Alpha', x: -1650, y: this.rawTerrainHeight(-1650), radius: 220 },
      { id: 1, name: names[1] ?? 'Beta', x: -460, y: this.rawTerrainHeight(-460), radius: 180 },
      { id: 2, name: names[2] ?? 'Gamma', x: 820, y: this.rawTerrainHeight(820), radius: 160 },
      { id: 3, name: names[3] ?? 'Delta', x: 1980, y: this.rawTerrainHeight(1980), radius: 145 },
      { id: 4, name: names[4] ?? 'Epsilon', x: 3180, y: this.rawTerrainHeight(3180), radius: 155 },
    ];
  }

  private spawnPlayer() {
    this.destroyed = false;
    this.landed = false;
    this.projectiles = [];
    this.particles = [];
    this.targetPadIndex = Math.floor(Math.random() * this.pads.length);
    const pad = this.targetPad();
    const side = Math.random() < 0.5 ? -1 : 1;
    const stats = LANDERS[this.selectedLander];

    this.lander = {
      x: pad.x + side * (520 + Math.random() * 520),
      y: pad.y + 540 + Math.random() * 360,
      vx: -side * (10 + Math.random() * 8),
      vy: -10 - Math.random() * 7,
      angle: side * -0.18,
      angularVelocity: 0,
      fuel: stats.fuel,
      hp: stats.hp,
    };
    this.input.state.throttle = 0.22;
    this.input.state.sasMode = 1;
    this.camera.x = this.lander.x;
    this.camera.y = this.lander.y - 140;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  stop() {
    this.running = false;
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime >= 1) {
      this.currentFps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.input.update();
    this.handleTargetCycle();
    this.update(dt);
    this.render();
    this.updateHUD();
    this.updateAudio();

    this.frameCount++;
    requestAnimationFrame((next) => this.loop(next));
  }

  private update(dt: number) {
    if (!this.destroyed && !this.landed) {
      this.updateLander(dt);
    }
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
  }

  private updateLander(dt: number) {
    const stats = LANDERS[this.selectedLander];
    const s = this.input.state;
    const altitude = this.groundClearance();

    let angularInput = s.yaw + s.roll - s.pitch * 0.35;
    if (s.brakeAssist) this.applyBrakeAssist(dt);
    if (s.sasMode > 0 && Math.abs(angularInput) < 0.05 && !s.brakeAssist) {
      this.lander.angularVelocity *= Math.pow(0.03, dt);
      if (Math.abs(this.lander.angle) < 0.5) {
        this.lander.angularVelocity += -this.lander.angle * 1.8 * dt;
      }
    }

    if (s.fineControl) angularInput *= 0.35;
    this.lander.angularVelocity += angularInput * stats.rotation * dt;
    this.lander.angularVelocity *= Math.pow(0.18, dt);
    this.lander.angle = this.normalizeAngle(this.lander.angle + this.lander.angularVelocity * dt);

    const throttle = s.brakeAssist ? Math.max(s.throttle, 0.58) : s.throttle;
    if (throttle > 0.01 && this.lander.fuel > 0) {
      const boost = s.boost ? 1.35 : 1;
      const thrust = this.lunarRatedEngineAccel() * stats.maxTwr * throttle * boost;
      const dir = this.thrustDirection();
      this.lander.vx += dir.x * thrust * dt;
      this.lander.vy += dir.y * thrust * dt;
      this.lander.fuel = Math.max(0, this.lander.fuel - throttle * boost * stats.fuel / 58 * dt);
      this.emitExhaust(dt, throttle);
    }

    if (s.rcsMode && this.lander.fuel > 0) {
      this.lander.vx += s.translateX * RCS_ACCEL * dt;
      this.lander.vy += -s.translateZ * RCS_ACCEL * dt + s.translateY * RCS_VERTICAL_ACCEL * dt;
      this.lander.fuel = Math.max(0, this.lander.fuel - (Math.abs(s.translateX) + Math.abs(s.translateZ) + Math.abs(s.translateY)) * 0.12 * dt);
    }

    this.lander.vy -= this.gravity() * dt;
    this.lander.x += this.lander.vx * dt;
    this.lander.y += this.lander.vy * dt;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (s.fire && this.fireCooldown <= 0) this.fireProjectile();

    if (this.toMeters(altitude) < 35 && this.toMetersPerSecond(this.lander.vy) < -3.2 && performance.now() - this.lastWarningAt > 850) {
      this.lastWarningAt = performance.now();
      this.playBurst(880, 0.07, 'sine', 0.13);
    }

    this.checkSurfaceContact(dt);
  }

  private applyBrakeAssist(dt: number) {
    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    if (speed < 0.5) return;
    const desired = Math.atan2(-this.lander.vx / speed, -this.lander.vy / speed);
    const error = this.normalizeAngle(desired - this.lander.angle);
    this.lander.angularVelocity += error * 4.0 * dt;
  }

  private checkSurfaceContact(dt: number) {
    const footContacts = this.legFootPoints()
      .map((foot) => {
        const ground = this.terrainHeight(foot.x);
        return { foot, ground, penetration: ground - foot.y };
      })
      .filter((contact) => contact.penetration > 0);

    const hullBottom = this.bodyPointToWorld({ x: 0, y: HULL_BOTTOM });
    const hullPenetration = this.terrainHeight(hullBottom.x) - hullBottom.y;
    if (footContacts.length === 0 && hullPenetration <= 0) return;

    const stats = LANDERS[this.selectedLander];
    const contactCount = Math.max(1, footContacts.length);
    let maxPenetration = Math.max(0, hullPenetration);
    let maxImpactSpeed = 0;
    let hardContact = hullPenetration > 0.8;

    for (const contact of footContacts) {
      maxPenetration = Math.max(maxPenetration, contact.penetration);
      const radius = { x: contact.foot.x - this.lander.x, y: contact.foot.y - this.lander.y };
      const footVelocity = {
        x: this.lander.vx - this.lander.angularVelocity * radius.y,
        y: this.lander.vy + this.lander.angularVelocity * radius.x,
      };
      maxImpactSpeed = Math.max(maxImpactSpeed, Math.max(0, -footVelocity.y));

      const springAccel = Math.max(0, contact.penetration * LEG_SPRING - footVelocity.y * LEG_DAMPING) / contactCount;
      this.lander.vy += springAccel * dt;
      this.lander.vx -= footVelocity.x * LEG_FRICTION * dt / contactCount;
      this.lander.angularVelocity += radius.x * springAccel * LEG_TORQUE_RESPONSE * dt;
      this.lander.angularVelocity -= this.lander.angle * 0.85 * dt / contactCount;
    }

    if (maxPenetration > 0) {
      this.lander.y += maxPenetration * 0.62;
    }

    const pad = this.padAt(this.lander.x);
    const verticalSpeed = Math.abs(this.toMetersPerSecond(this.lander.vy));
    const horizontalSpeed = Math.abs(this.toMetersPerSecond(this.lander.vx));
    const impactSpeed = this.toMetersPerSecond(maxImpactSpeed);
    const tilt = Math.abs(this.normalizeAngle(this.lander.angle));
    const bothFeetSupported = footContacts.length === LEG_POINTS.length;
    const soft = bothFeetSupported && impactSpeed < 4.2 && horizontalSpeed < 3.2 && tilt < 0.28;

    if (impactSpeed > 4.8 || horizontalSpeed > 4.2 || tilt > 0.45 || hardContact) {
      const massFactor = Math.sqrt(stats.mass / 1000);
      const damage = (Math.max(0, impactSpeed - 3.6) * 13 + Math.max(0, horizontalSpeed - 2.8) * 7 + Math.max(0, tilt - 0.25) * 42 + (hardContact ? 35 : 0)) * massFactor;
      this.lander.hp = Math.max(0, this.lander.hp - damage);
      hardContact = hardContact || this.lander.hp <= 0;
      this.spawnImpactFx(this.lander.x, this.terrainHeight(this.lander.x), '#ffcf5a', Math.min(18, 4 + Math.round(damage / 8)));
      if (performance.now() - this.lastWarningAt > 260) {
        this.playBurst(120 + Math.max(0, 180 - damage), 0.08, 'sawtooth', 0.12);
        this.lastWarningAt = performance.now();
      }
    }

    if (pad && soft && this.lander.hp > 0) {
      this.landed = true;
      this.streak++;
      this.lander.vx = 0;
      this.lander.vy = 0;
      this.lander.angle = 0;
      this.lander.angularVelocity = 0;
      const precision = Math.abs(this.lander.x - pad.x);
      const precisionM = this.toMeters(precision);
      const earned = Math.round(180 + (1 - precision / pad.radius) * 180 + (1 - impactSpeed / 4.2) * 120 + this.lander.fuel * 2 + this.streak * 25);
      this.score += Math.max(80, earned);
      this.spawnImpactFx(this.lander.x, this.terrainHeight(this.lander.x), '#84ffd3');
      this.playLandingTone();
      this.showLandingScreen(Math.max(80, earned), pad.name, precisionM, impactSpeed);
      return;
    }

    if (hardContact || this.lander.hp <= 0) {
      this.destroyed = true;
      this.streak = 0;
      this.lander.hp = 0;
      this.spawnImpactFx(this.lander.x, this.terrainHeight(this.lander.x), '#ff716a');
      this.playBurst(64, 0.45, 'sawtooth', 0.24);
      this.showDeathScreen(pad ? 'Landing gear collapsed' : 'Crashed into terrain');
    }
  }

  private fireProjectile() {
    const dir = this.thrustDirection();
    this.projectiles.push({
      x: this.lander.x + dir.x * 26,
      y: this.lander.y + dir.y * 26,
      vx: this.lander.vx + dir.x * 145,
      vy: this.lander.vy + dir.y * 145,
      life: 3.5,
    });
    this.fireCooldown = 0.22;
    this.playBurst(420, 0.08, 'square', 0.12);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vy -= this.gravity() * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y <= this.terrainHeight(p.x)) {
        this.spawnImpactFx(p.x, this.terrainHeight(p.x), '#ffcf5a', 8);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy -= this.gravity() * 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateCamera(dt: number) {
    const pad = this.targetPad();
    const altitude = this.groundClearance();
    const distanceToPad = Math.abs(pad.x - this.lander.x);
    const lookAhead = Math.max(-180, Math.min(180, this.lander.vx * 4));
    const targetBlend = Math.max(0, Math.min(0.35, 1 - distanceToPad / 900));

    this.cameraTarget.x = this.lander.x + lookAhead;
    this.cameraTarget.x = this.lerp(this.cameraTarget.x, pad.x, targetBlend);
    this.cameraTarget.y = this.lander.y - 140 + Math.max(0, Math.min(120, altitude * 0.12));
    this.cameraTarget.zoom = Math.max(0.55, Math.min(1.55, 1.35 - altitude / 1300));
    this.cameraTarget.zoom *= 1 - Math.max(0, Math.min(0.25, this.input.state.cameraZoom * 0.02));

    const t = 1 - Math.pow(0.02, dt);
    this.camera.x = this.lerp(this.camera.x, this.cameraTarget.x, t);
    this.camera.y = this.lerp(this.camera.y, this.cameraTarget.y, t);
    this.camera.zoom = this.lerp(this.camera.zoom, this.cameraTarget.zoom, t);
    this.input.state.cameraZoom = 0;
  }

  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawSky(ctx);
    this.drawBackgroundRidges(ctx);
    this.drawTrajectory(ctx);
    this.drawTerrain(ctx);
    this.drawPads(ctx);
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawLander(ctx);
  }

  private drawSky(ctx: CanvasRenderingContext2D) {
    const body = this.currentBody();
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, body.skyTop);
    gradient.addColorStop(0.5, body.skyMid);
    gradient.addColorStop(1, body.horizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const sunX = this.width - 120;
    const sunY = 88;
    const sun = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 220);
    sun.addColorStop(0, 'rgba(255,245,202,0.95)');
    sun.addColorStop(0.14, 'rgba(255,231,146,0.32)');
    sun.addColorStop(1, 'rgba(255,231,146,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 90; i++) {
      const x = (i * 127.31 + this.camera.x * 0.014) % (this.width + 80) - 40;
      const y = (i * 53.77) % (this.height * 0.36);
      const r = i % 17 === 0 ? 1.3 : 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBackgroundRidges(ctx: CanvasRenderingContext2D) {
    const body = this.currentBody();
    const layers = [
      { parallax: 0.08, y: this.height * 0.69, amp: 34 * body.terrainAmp, color: body.ridgeFar },
      { parallax: 0.16, y: this.height * 0.73, amp: 52 * body.terrainAmp, color: body.ridgeNear },
    ];

    for (const layer of layers) {
      ctx.beginPath();
      ctx.moveTo(0, this.height);
      for (let sx = -20; sx <= this.width + 20; sx += 18) {
        const wx = (sx - this.width / 2) / this.camera.zoom + this.camera.x * layer.parallax;
        const y = layer.y
          - Math.sin(wx * 0.006) * layer.amp
          - Math.sin(wx * 0.017 + 2.2) * layer.amp * 0.45;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(this.width + 20, this.height);
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    }
  }

  private drawTerrain(ctx: CanvasRenderingContext2D) {
    const body = this.currentBody();
    const left = this.screenToWorldX(-80);
    const right = this.screenToWorldX(this.width + 80);
    const step = 16 / this.camera.zoom;

    ctx.beginPath();
    ctx.moveTo(-80, this.height + 80);
    for (let x = left; x <= right; x += step) {
      const screen = this.worldToScreen({ x, y: this.terrainHeight(x) });
      ctx.lineTo(screen.x, screen.y);
    }
    ctx.lineTo(this.width + 80, this.height + 80);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, this.height * 0.35, 0, this.height);
    fill.addColorStop(0, body.groundTop);
    fill.addColorStop(0.48, body.groundMid);
    fill.addColorStop(1, body.groundBottom);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = body.surfaceLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = left; x <= right; x += step) {
      const screen = this.worldToScreen({ x, y: this.terrainHeight(x) });
      if (x === left) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    }
    ctx.stroke();

    this.drawCraterDetails(ctx, left, right);
    this.drawHexSurface(ctx, left, right);
  }

  private drawCraterDetails(ctx: CanvasRenderingContext2D, left: number, right: number) {
    const body = this.currentBody();
    const start = Math.floor(left / 180) * 180;
    ctx.save();
    for (let x = start; x <= right + 180; x += 180) {
      const seed = Math.sin(x * 12.9898) * 43758.5453;
      const frac = seed - Math.floor(seed);
      if (frac < body.craterRate) continue;
      const cx = x + (frac - 0.5) * 70;
      const y = this.terrainHeight(cx) + 6;
      const p = this.worldToScreen({ x: cx, y });
      const rx = (34 + frac * 54) * this.camera.zoom;
      const ry = rx * 0.24;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#30302d';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = '#cfc7b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x - rx * 0.06, p.y - ry * 0.18, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.94);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHexSurface(ctx: CanvasRenderingContext2D, left: number, right: number) {
    const size = 36;
    const start = Math.floor(left / size) * size;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#34342f';
    for (let x = start; x <= right + size; x += size) {
      const y = this.terrainHeight(x) - 6;
      const p = this.worldToScreen({ x, y });
      const r = size * this.camera.zoom * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const hx = p.x + Math.cos(a) * r;
        const hy = p.y + Math.sin(a) * r * 0.42;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPads(ctx: CanvasRenderingContext2D) {
    for (const pad of this.pads) {
      const p = this.worldToScreen({ x: pad.x, y: pad.y + 3 });
      const half = pad.radius * this.camera.zoom;
      const isTarget = pad === this.targetPad();
      ctx.save();
      ctx.globalAlpha = isTarget ? 0.28 : 0.12;
      ctx.fillStyle = isTarget ? '#ffcf5a' : '#84ffd3';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 3, half * 1.25, 24 * this.camera.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = pad === this.targetPad() ? '#ffcf5a' : '#84ffd3';
      ctx.fillStyle = isTarget ? 'rgba(255,207,90,0.22)' : 'rgba(132,255,211,0.16)';
      ctx.lineWidth = pad === this.targetPad() ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(p.x - half, p.y - 5, half * 2, 10, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isTarget ? '#fff4c4' : '#dffdf4';
      ctx.font = `${isTarget ? 12 : 11}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(pad.name, p.x, p.y - 14);

      if (isTarget) {
        ctx.strokeStyle = 'rgba(255,207,90,0.42)';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, p.y - 26);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawTrajectory(ctx: CanvasRenderingContext2D) {
    const points = this.predictTrajectory();
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,207,90,0.65)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      const p = this.worldToScreen(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  private drawLander(ctx: CanvasRenderingContext2D) {
    const p = this.worldToScreen(this.lander);
    const stats = LANDERS[this.selectedLander];
    const scale = Math.max(0.75, Math.min(1.25, this.camera.zoom));
    const ground = this.terrainHeight(this.lander.x);
    const shadow = this.worldToScreen({ x: this.lander.x, y: ground + 2 });
    const altitude = Math.max(0, this.lander.y - ground);
    ctx.save();
    ctx.globalAlpha = Math.max(0.12, Math.min(0.45, 1 - altitude / 420));
    ctx.fillStyle = '#24231f';
    ctx.beginPath();
    ctx.ellipse(shadow.x + 12 * this.camera.zoom, shadow.y + 3, 36 * this.camera.zoom, 8 * this.camera.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.lander.angle);
    ctx.scale(scale, scale);

    const throttle = this.input.state.throttle;
    if (throttle > 0.02 && this.lander.fuel > 0 && !this.destroyed && !this.landed) {
      const flame = ctx.createLinearGradient(0, 12, 0, 68 + throttle * 24);
      flame.addColorStop(0, '#fff4b8');
      flame.addColorStop(0.35, '#ffcf5a');
      flame.addColorStop(1, '#ff6d2d');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-8, 16);
      ctx.lineTo(0, 42 + throttle * 32);
      ctx.lineTo(8, 16);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(20,24,27,0.45)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-16, 13);
    ctx.lineTo(-28, 30);
    ctx.moveTo(16, 13);
    ctx.lineTo(28, 30);
    ctx.stroke();

    ctx.strokeStyle = '#aeb5b7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, 13);
    ctx.lineTo(-28, 30);
    ctx.moveTo(16, 13);
    ctx.lineTo(28, 30);
    ctx.moveTo(-28, 30);
    ctx.lineTo(-38, 30);
    ctx.moveTo(28, 30);
    ctx.lineTo(38, 30);
    ctx.stroke();

    const hull = ctx.createLinearGradient(-18, -28, 18, 24);
    hull.addColorStop(0, '#ffffff');
    hull.addColorStop(0.38, stats.color);
    hull.addColorStop(1, '#8b9294');
    ctx.fillStyle = hull;
    ctx.strokeStyle = '#101820';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(19, 10);
    ctx.quadraticCurveTo(0, 22, -19, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f1820';
    ctx.beginPath();
    ctx.arc(0, -7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7cdcff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#c58d3b';
    ctx.fillRect(-25, -2, 8, 18);
    ctx.fillRect(17, -2, 8, 18);

    ctx.strokeStyle = '#253858';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, -2);
    ctx.lineTo(-44, -8);
    ctx.moveTo(24, -2);
    ctx.lineTo(44, -8);
    ctx.stroke();
    ctx.fillStyle = '#1b4f86';
    ctx.fillRect(-58, -14, 16, 12);
    ctx.fillRect(42, -14, 16, 12);

    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#ffcf5a';
    for (const projectile of this.projectiles) {
      const p = this.worldToScreen(projectile);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const particle of this.particles) {
      const p = this.worldToScreen(particle);
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.size * this.camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private updateHUD() {
    const stats = LANDERS[this.selectedLander];
    const body = this.currentBody();
    const altitude = this.toMeters(this.groundClearance());
    const speed = this.toMetersPerSecond(Math.hypot(this.lander.vx, this.lander.vy));
    const fuelPct = Math.max(0, Math.min(1, this.lander.fuel / stats.fuel));
    const hpPct = Math.max(0, Math.min(1, this.lander.hp / stats.hp));
    const target = this.targetPad();
    const distance = this.toMeters(Math.abs(target.x - this.lander.x));
    const localTwr = (stats.maxTwr * MOON_GRAVITY_MPS2 / body.gravityMps2).toFixed(2);

    this.hudElements['score'].textContent = `${this.score}`;
    this.hudElements['rank'].textContent = body.name;
    this.hudElements['altitude'].textContent = altitude.toFixed(0);
    this.hudElements['velocity'].textContent = speed.toFixed(1);
    this.hudElements['vel-vertical'].textContent = this.toMetersPerSecond(this.lander.vy).toFixed(1);
    this.hudElements['vel-horizontal'].textContent = this.toMetersPerSecond(this.lander.vx).toFixed(1);
    this.hudElements['throttle-fill'].style.height = `${Math.round(this.input.state.throttle * 100)}%`;
    this.hudElements['throttle-label'].textContent = `${Math.round(this.input.state.throttle * 100)}%`;
    this.hudElements['fuel-fill'].style.height = `${Math.round(fuelPct * 100)}%`;
    this.hudElements['fuel-label'].textContent = `${Math.round(fuelPct * 100)}%`;
    this.hudElements['hp-fill'].style.width = `${Math.round(hpPct * 100)}%`;
    this.hudElements['hp-text'].textContent = `${Math.round(hpPct * stats.hp)}/${stats.hp}`;
    this.hudElements['sas-indicator'].textContent = `SAS ${this.input.state.sasMode > 0 ? 'STB' : 'OFF'}`;
    this.hudElements['sas-indicator'].classList.toggle('active', this.input.state.sasMode > 0);
    this.hudElements['rcs-indicator'].textContent = this.input.state.rcsMode ? 'RCS ON' : 'RCS OFF';
    this.hudElements['rcs-indicator'].classList.toggle('active', this.input.state.rcsMode);
    this.hudElements['target-info'].textContent = `${target.name} ${distance.toFixed(0)}m | ${body.gravityMps2.toFixed(2)} m/s2`;
    this.hudElements['objective-title'].textContent = `LAND ${target.name.toUpperCase()}`;
    this.hudElements['objective-detail'].textContent = `${body.name} ${body.type} | radius ${Math.round(body.gameRadiusM / 1000)}km game / ${Math.round(body.radiusM / 1000)}km real | ${stats.name} TWR ${localTwr}`;
    this.hudElements['perf-fps'].textContent = `${this.currentFps}`;
    this.hudElements['perf-entities'].textContent = `${1 + this.projectiles.length + this.particles.length}`;
    this.hudElements['perf-draw'].textContent = '2D';

    this.drawMinimap();
    this.drawNavball();
  }

  private drawMinimap() {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6,12,16,0.92)';
    ctx.fillRect(0, 0, w, h);

    const target = this.targetPad();
    const range = Math.max(900, Math.min(2200, Math.abs(target.x - this.lander.x) * 1.45 + 700));
    const min = this.lander.x - range / 2;
    const max = this.lander.x + range / 2;
    const terrainMin = Math.min(...Array.from({ length: 32 }, (_, i) => this.rawTerrainHeight(min + (i / 31) * range)));
    const terrainMax = Math.max(...Array.from({ length: 32 }, (_, i) => this.rawTerrainHeight(min + (i / 31) * range)), this.lander.y, target.y);
    const sx = (x: number) => (x - min) / range * w;
    const sy = (y: number) => h - 16 - ((y - terrainMin) / Math.max(1, terrainMax - terrainMin + 180)) * (h - 28);

    ctx.strokeStyle = 'rgba(132,255,211,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = i * w / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const y = i * h / 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(132,255,211,0.05)';
    const viewLeft = sx(this.screenToWorldX(0));
    const viewRight = sx(this.screenToWorldX(this.width));
    ctx.fillRect(Math.max(0, viewLeft), 0, Math.min(w, viewRight) - Math.max(0, viewLeft), h);

    ctx.strokeStyle = 'rgba(222,253,244,0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const x = min + (i / 72) * range;
      const y = sy(this.rawTerrainHeight(x));
      if (i === 0) ctx.moveTo(sx(x), y);
      else ctx.lineTo(sx(x), y);
    }
    ctx.stroke();

    const traj = this.predictTrajectory();
    if (traj.length > 1) {
      ctx.strokeStyle = 'rgba(255,207,90,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      traj.forEach((point, index) => {
        const x = sx(point.x);
        const y = sy(point.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const pad of this.pads) {
      if (pad.x < min || pad.x > max) continue;
      const isTarget = pad === target;
      ctx.fillStyle = isTarget ? '#ffcf5a' : '#84ffd3';
      ctx.beginPath();
      ctx.arc(sx(pad.x), sy(pad.y), isTarget ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isTarget) {
        ctx.strokeStyle = '#ffcf5a';
        ctx.beginPath();
        ctx.moveTo(sx(this.lander.x), sy(this.lander.y));
        ctx.lineTo(sx(pad.x), sy(pad.y));
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(sx(this.lander.x), sy(this.lander.y));
    ctx.rotate(this.lander.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#84ffd3';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(this.toMeters(range))}m`, 7, 12);
    ctx.fillStyle = '#ffcf5a';
    ctx.textAlign = 'right';
    ctx.fillText(target.name, w - 7, 12);
  }

  private drawNavball() {
    if (!this.navballCanvas) return;
    const ctx = this.navballCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.navballCanvas.width;
    const c = w / 2;
    const r = c - 5;
    ctx.clearRect(0, 0, w, w);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(c, c);
    ctx.rotate(-this.lander.angle);
    ctx.fillStyle = '#1d63b0';
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2);
    ctx.fillStyle = '#7a6043';
    ctx.fillRect(-r * 2, 0, r * 4, r * 2);
    ctx.strokeStyle = '#f2f2ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 2, 0);
    ctx.lineTo(r * 2, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    for (let p = -45; p <= 45; p += 15) {
      if (p === 0) continue;
      ctx.beginPath();
      ctx.moveTo(-28, -p);
      ctx.lineTo(28, -p);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#f2f2ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c - 34, c);
    ctx.lineTo(c - 10, c);
    ctx.moveTo(c + 10, c);
    ctx.lineTo(c + 34, c);
    ctx.moveTo(c, c - 10);
    ctx.lineTo(c, c + 10);
    ctx.stroke();

    const cueX = c + (this.input.state.rcsMode ? this.input.state.translateX : this.input.state.yaw) * r * 0.38;
    const cueY = c + (this.input.state.rcsMode ? this.input.state.translateZ : this.input.state.pitch) * r * 0.38;
    ctx.strokeStyle = '#ffcf5a';
    ctx.fillStyle = 'rgba(255,207,90,0.18)';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(cueX, cueY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cueX, cueY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    if (speed > 0.2) {
      const vx = this.lander.vx / speed;
      const vy = this.lander.vy / speed;
      this.drawNavMarker(ctx, c + vx * r * 0.62, c - vy * r * 0.62, '#ffcf5a', true);
      this.drawNavMarker(ctx, c - vx * r * 0.62, c + vy * r * 0.62, '#84ffd3', false);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawNavMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, filled: boolean) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    if (filled) ctx.fill();
    else ctx.stroke();
  }

  private showDeathScreen(cause: string) {
    const deathScreen = document.getElementById('death-screen')!;
    document.getElementById('death-info')!.textContent = cause;
    deathScreen.classList.add('visible');
    document.getElementById('respawn-btn')!.onclick = () => {
      deathScreen.classList.remove('visible');
      this.spawnPlayer();
    };
  }

  private showLandingScreen(score: number, padName: string, precision: number, verticalSpeed: number) {
    const screen = document.getElementById('landing-screen')!;
    document.getElementById('landing-score')!.textContent = `+${score}`;
    document.getElementById('landing-detail')!.textContent = `${padName} | ${precision.toFixed(1)}m | ${verticalSpeed.toFixed(1)} m/s`;
    screen.classList.add('visible');
    document.getElementById('continue-btn')!.onclick = () => {
      screen.classList.remove('visible');
      this.spawnPlayer();
    };
  }

  private handleTargetCycle() {
    if (!this.input.state.targetCycle) return;
    this.targetPadIndex = (this.targetPadIndex + 1) % this.pads.length;
    this.input.state.targetCycle = false;
  }

  private predictTrajectory() {
    const points: Vec2[] = [];
    let x = this.lander.x;
    let y = this.lander.y;
    let vx = this.lander.vx;
    let vy = this.lander.vy;
    for (let i = 0; i < 90; i++) {
      vy -= this.gravity() * 0.28;
      x += vx * 0.28;
      y += vy * 0.28;
      points.push({ x, y });
      if (y <= this.terrainHeight(x)) break;
    }
    return points;
  }

  private terrainHeight(x: number) {
    const pad = this.padAt(x);
    if (pad && Math.abs(x - pad.x) < pad.radius * 1.08) return pad.y;
    return this.rawTerrainHeight(x);
  }

  private rawTerrainHeight(x: number) {
    const body = this.currentBody();
    const sx = x * body.terrainScale;
    return 90
      + Math.sin(sx * 0.004) * 38 * body.terrainAmp
      + Math.sin(sx * 0.011 + 1.8) * 22 * body.terrainAmp
      + Math.sin(sx * 0.025 + 0.4) * 9 * body.terrainAmp
      + Math.sin(sx * 0.057 + 2.7) * 3.5 * body.terrainAmp;
  }

  private padAt(x: number) {
    return this.pads.find((pad) => Math.abs(x - pad.x) <= pad.radius);
  }

  private targetPad() {
    return this.pads[this.targetPadIndex] ?? this.pads[0];
  }

  private thrustDirection() {
    return { x: Math.sin(this.lander.angle), y: Math.cos(this.lander.angle) };
  }

  private currentBody() {
    return BODIES[this.selectedBodyIndex] ?? BODIES[0];
  }

  private gravity() {
    return this.currentBody().gravityMps2 / WORLD_METERS_PER_UNIT;
  }

  private lunarRatedEngineAccel() {
    return MOON_GRAVITY_MPS2 / WORLD_METERS_PER_UNIT;
  }

  private toMeters(value: number) {
    return value * WORLD_METERS_PER_UNIT;
  }

  private toMetersPerSecond(value: number) {
    return value * WORLD_METERS_PER_UNIT;
  }

  private groundClearance() {
    const footClearance = this.legFootPoints()
      .map((foot) => foot.y - this.terrainHeight(foot.x));
    const hull = this.bodyPointToWorld({ x: 0, y: HULL_BOTTOM });
    footClearance.push(hull.y - this.terrainHeight(hull.x));
    return Math.max(0, Math.min(...footClearance));
  }

  private bodyPointToWorld(point: Vec2) {
    const sin = Math.sin(this.lander.angle);
    const cos = Math.cos(this.lander.angle);
    const screenX = point.x * cos - point.y * sin;
    const screenY = point.x * sin + point.y * cos;
    return {
      x: this.lander.x + screenX,
      y: this.lander.y - screenY,
    };
  }

  private legFootPoints() {
    return LEG_POINTS.map((point) => this.bodyPointToWorld(point));
  }

  private emitExhaust(dt: number, throttle: number) {
    const dir = this.thrustDirection();
    const amount = Math.ceil(throttle * 16 * dt * 60 / 10);
    for (let i = 0; i < amount; i++) {
      this.particles.push({
        x: this.lander.x - dir.x * 18 + (Math.random() - 0.5) * 6,
        y: this.lander.y - dir.y * 18 + (Math.random() - 0.5) * 6,
        vx: -dir.x * (30 + Math.random() * 24) + (Math.random() - 0.5) * 12,
        vy: -dir.y * (30 + Math.random() * 24) + (Math.random() - 0.5) * 12,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        color: Math.random() < 0.45 ? '#ffcf5a' : '#ff8b35',
        size: 2 + Math.random() * 3,
      });
    }
  }

  private spawnImpactFx(x: number, y: number, color: string, count = 26) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI + Math.random() * Math.PI;
      const speed = 18 + Math.random() * 48;
      this.particles.push({
        x,
        y: y + 8,
        vx: Math.cos(angle) * speed,
        vy: Math.abs(Math.sin(angle)) * speed,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        color,
        size: 2 + Math.random() * 5,
      });
    }
  }

  private worldToScreen(point: Vec2) {
    return {
      x: (point.x - this.camera.x) * this.camera.zoom + this.width / 2,
      y: this.height * 0.62 - (point.y - this.camera.y) * this.camera.zoom,
    };
  }

  private screenToWorldX(screenX: number) {
    return (screenX - this.width / 2) / this.camera.zoom + this.camera.x;
  }

  private normalizeAngle(angle: number) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  private enableAudio() {
    if (this.audioContext) {
      void this.audioContext.resume();
      return;
    }
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtor();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.audioContext.destination);
    this.engineGain = this.audioContext.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);
    this.engineOsc = this.audioContext.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 48;
    const lowpass = this.audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 190;
    this.engineOsc.connect(lowpass);
    lowpass.connect(this.engineGain);
    this.engineOsc.start();
    const button = document.getElementById('audio-toggle');
    if (button) button.textContent = 'AUDIO ON';
  }

  private updateAudio() {
    if (!this.audioContext || !this.engineGain || !this.engineOsc) return;
    const now = this.audioContext.currentTime;
    const throttle = (!this.destroyed && !this.landed && this.lander.fuel > 0) ? this.input.state.throttle : 0;
    this.engineGain.gain.setTargetAtTime(throttle > 0.01 ? 0.035 + throttle * 0.16 : 0.0001, now, 0.035);
    this.engineOsc.frequency.setTargetAtTime(38 + throttle * 72, now, 0.04);
  }

  private playBurst(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.18) {
    if (!this.audioContext || !this.masterGain) return;
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private playLandingTone() {
    this.playBurst(330, 0.12, 'sine', 0.16);
    setTimeout(() => this.playBurst(495, 0.16, 'sine', 0.14), 110);
    setTimeout(() => this.playBurst(660, 0.24, 'sine', 0.12), 240);
  }
}
