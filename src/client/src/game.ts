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
  age: number;
  armed: boolean;
}

interface RemotePlayer {
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
const PHYSICS_STEP = 1 / 120;
const RCS_ACCEL = 0.95 / WORLD_METERS_PER_UNIT;
const RCS_VERTICAL_ACCEL = 0.65 / WORLD_METERS_PER_UNIT;
const LEG_SPRING = 42;
const LEG_DAMPING = 14;
const LEG_FRICTION = 3.2;
const LEG_TORQUE_RESPONSE = 0.0026;
const LEG_RESTITUTION = 0.12;
const LANDER_COLLISION_RADIUS = 25;
const PROJECTILE_RADIUS = 3.2;
const PROJECTILE_ARM_TIME = 0.32;
const PROJECTILE_LIFE_SECONDS = 180;
const PROJECTILE_DAMAGE = 72;
const MULTIPLAYER_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws';
const MULTIPLAYER_PORT = location.port === '3000' ? '3001' : location.port;
const MULTIPLAYER_URL = `${MULTIPLAYER_PROTOCOL}://${location.hostname}${MULTIPLAYER_PORT ? `:${MULTIPLAYER_PORT}` : ''}`;
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
  private multiplayerSocket: WebSocket | null = null;
  private multiplayerId = 0;
  private multiplayerName = `Pilot ${Math.floor(Math.random() * 900 + 100)}`;
  private multiplayerSendTimer = 0;
  private remotePlayers: Map<number, RemotePlayer> = new Map();

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
    this.connectMultiplayer();
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

  private connectMultiplayer() {
    try {
      const socket = new WebSocket(MULTIPLAYER_URL);
      this.multiplayerSocket = socket;
      socket.addEventListener('open', () => {
        this.sendMultiplayer({
          type: 'hello',
          name: this.multiplayerName,
        });
      });
      socket.addEventListener('message', (event) => this.handleMultiplayerMessage(event.data));
      socket.addEventListener('close', () => {
        this.multiplayerSocket = null;
        this.remotePlayers.clear();
      });
      socket.addEventListener('error', () => {
        socket.close();
      });
    } catch {
      this.multiplayerSocket = null;
    }
  }

  private handleMultiplayerMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'welcome') {
        this.multiplayerId = data.id;
        return;
      }
      if (data.type === 'peer-left') {
        this.remotePlayers.delete(data.id);
        return;
      }
      if (data.type !== 'state' || data.id === this.multiplayerId) return;
      this.remotePlayers.set(data.id, {
        id: data.id,
        name: data.name || `Pilot ${data.id}`,
        bodyId: data.bodyId || 'moon',
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        vx: Number(data.vx) || 0,
        vy: Number(data.vy) || 0,
        angle: Number(data.angle) || 0,
        hp: Number(data.hp) || 0,
        throttle: Number(data.throttle) || 0,
        updatedAt: performance.now(),
      });
    } catch {
      // Ignore malformed relay packets.
    }
  }

  private updateMultiplayer(dt: number) {
    if (!this.multiplayerSocket || this.multiplayerSocket.readyState !== WebSocket.OPEN) return;
    this.multiplayerSendTimer -= dt;
    if (this.multiplayerSendTimer > 0) return;
    this.multiplayerSendTimer = 1 / 15;
    this.sendMultiplayer({
      type: 'state',
      name: this.multiplayerName,
      bodyId: this.currentBody().id,
      x: this.lander.x,
      y: this.lander.y,
      vx: this.lander.vx,
      vy: this.lander.vy,
      angle: this.lander.angle,
      hp: this.lander.hp,
      throttle: this.input.state.throttle,
      score: this.score,
    });
  }

  private sendMultiplayer(data: Record<string, unknown>) {
    if (!this.multiplayerSocket || this.multiplayerSocket.readyState !== WebSocket.OPEN) return;
    this.multiplayerSocket.send(JSON.stringify(data));
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
    const padAngles = [-2.45, -1.25, 0.15, 1.35, 2.58];
    this.pads = [];
    this.pads = [
      { id: 0, name: names[0] ?? 'Alpha', x: 0, y: 0, radius: 145 },
      { id: 1, name: names[1] ?? 'Beta', x: 0, y: 0, radius: 130 },
      { id: 2, name: names[2] ?? 'Gamma', x: 0, y: 0, radius: 120 },
      { id: 3, name: names[3] ?? 'Delta', x: 0, y: 0, radius: 112 },
      { id: 4, name: names[4] ?? 'Epsilon', x: 0, y: 0, radius: 118 },
    ].map((pad, index) => ({ ...pad, ...this.baseSurfacePoint(padAngles[index] ?? 0) }));
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
    const padAngle = this.angleOf(pad);
    const spawnAngle = padAngle + side * (0.52 + Math.random() * 0.34);
    const normal = this.normalAtAngle(spawnAngle);
    const tangent = { x: -normal.y * side, y: normal.x * side };
    const spawnRadius = this.terrainRadiusAtAngle(spawnAngle) + 360 + Math.random() * 260;
    const orbitalSpeed = Math.sqrt(this.gravity() * Math.max(200, spawnRadius));

    this.lander = {
      x: normal.x * spawnRadius,
      y: normal.y * spawnRadius,
      vx: tangent.x * orbitalSpeed * 0.56 - normal.x * (4 + Math.random() * 5),
      vy: tangent.y * orbitalSpeed * 0.56 - normal.y * (4 + Math.random() * 5),
      angle: this.localUpAngleAt(spawnAngle) + side * -0.18,
      angularVelocity: 0,
      fuel: stats.fuel,
      hp: stats.hp,
    };
    this.input.state.throttle = 0.22;
    this.input.state.sasMode = 1;
    this.camera.x = this.lander.x;
    this.camera.y = this.lander.y;
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
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(PHYSICS_STEP, remaining);
      if (!this.destroyed && !this.landed) {
        this.updateLander(step);
      }
      this.updateProjectiles(step);
      this.updateParticles(step);
      remaining -= step;
    }
    this.updateCamera(dt);
    this.updateMultiplayer(dt);
  }

  private updateLander(dt: number) {
    const stats = LANDERS[this.selectedLander];
    const s = this.input.state;
    const altitude = this.groundClearance();

    let angularInput = s.yaw + s.roll - s.pitch * 0.35;
    if (s.brakeAssist) this.applyBrakeAssist(dt);
    if (s.sasMode > 0 && Math.abs(angularInput) < 0.05 && !s.brakeAssist) {
      this.lander.angularVelocity *= Math.pow(0.03, dt);
      const localUp = this.localUpAngleAt(this.angleOf(this.lander));
      const uprightError = this.normalizeAngle(localUp - this.lander.angle);
      this.lander.angularVelocity += uprightError * 1.8 * dt;
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

    const gravityNormal = this.normalAtPoint(this.lander);
    this.lander.vx -= gravityNormal.x * this.gravity() * dt;
    this.lander.vy -= gravityNormal.y * this.gravity() * dt;
    this.lander.x += this.lander.vx * dt;
    this.lander.y += this.lander.vy * dt;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (s.fire && this.fireCooldown <= 0) this.fireProjectile();

    if (this.toMeters(altitude) < 35 && this.toMetersPerSecond(this.radialVelocity(this.lander)) < -3.2 && performance.now() - this.lastWarningAt > 850) {
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
        const angle = this.angleOf(foot);
        const normal = this.normalAtAngle(angle);
        const tangent = { x: -normal.y, y: normal.x };
        const groundRadius = this.terrainRadiusAtAngle(angle);
        const distance = Math.hypot(foot.x, foot.y);
        return { foot, normal, tangent, groundRadius, penetration: groundRadius - distance };
      })
      .filter((contact) => contact.penetration > 0);

    const hullBottom = this.bodyPointToWorld({ x: 0, y: HULL_BOTTOM });
    const hullPenetration = this.surfacePenetration(hullBottom);
    if (footContacts.length === 0 && hullPenetration <= 0) return;

    const stats = LANDERS[this.selectedLander];
    const contactCount = Math.max(1, footContacts.length);
    let maxPenetration = Math.max(0, hullPenetration);
    let maxImpactSpeed = 0;
    let hardContact = hullPenetration > 5;

    for (const contact of footContacts) {
      maxPenetration = Math.max(maxPenetration, contact.penetration);
      const radius = { x: contact.foot.x - this.lander.x, y: contact.foot.y - this.lander.y };
      const footVelocity = {
        x: this.lander.vx - this.lander.angularVelocity * radius.y,
        y: this.lander.vy + this.lander.angularVelocity * radius.x,
      };
      const radialVelocity = footVelocity.x * contact.normal.x + footVelocity.y * contact.normal.y;
      const tangentVelocity = footVelocity.x * contact.tangent.x + footVelocity.y * contact.tangent.y;
      maxImpactSpeed = Math.max(maxImpactSpeed, Math.max(0, -radialVelocity));

      const springAccel = Math.min(260, Math.max(0, contact.penetration * LEG_SPRING - radialVelocity * LEG_DAMPING)) / contactCount;
      const frictionAccel = -tangentVelocity * LEG_FRICTION / contactCount;
      const fx = contact.normal.x * springAccel + contact.tangent.x * frictionAccel;
      const fy = contact.normal.y * springAccel + contact.tangent.y * frictionAccel;
      this.lander.vx += fx * dt;
      this.lander.vy += fy * dt;
      this.lander.angularVelocity += (radius.x * fy - radius.y * fx) * LEG_TORQUE_RESPONSE * dt;
      this.lander.angularVelocity -= this.normalizeAngle(this.localUpAngleAt(this.angleOf(this.lander)) - this.lander.angle) * -0.45 * dt / contactCount;
    }

    if (maxPenetration > 0) {
      const n = this.normalAtPoint(this.lander);
      this.lander.x += n.x * maxPenetration * 0.82;
      this.lander.y += n.y * maxPenetration * 0.82;
      const radialVelocity = this.lander.vx * n.x + this.lander.vy * n.y;
      if (footContacts.length > 0 && radialVelocity < 0) {
        this.lander.vx -= n.x * radialVelocity * (1 - LEG_RESTITUTION);
        this.lander.vy -= n.y * radialVelocity * (1 - LEG_RESTITUTION);
      }
    }

    const pad = this.padAtPoint(this.lander);
    const horizontalSpeed = Math.abs(this.toMetersPerSecond(this.tangentialVelocity(this.lander)));
    const impactSpeed = this.toMetersPerSecond(maxImpactSpeed);
    const tilt = Math.abs(this.normalizeAngle(this.lander.angle - this.localUpAngleAt(this.angleOf(this.lander))));
    const bothFeetSupported = footContacts.length === LEG_POINTS.length;
    const soft = bothFeetSupported && impactSpeed < 5.2 && horizontalSpeed < 3.8 && tilt < 0.34;

    if (impactSpeed > 6.2 || horizontalSpeed > 5.0 || tilt > 0.55 || hardContact) {
      const massFactor = Math.sqrt(stats.mass / 1000);
      const damage = (Math.max(0, impactSpeed - 4.6) * 10 + Math.max(0, horizontalSpeed - 3.4) * 6 + Math.max(0, tilt - 0.36) * 34 + (hardContact ? 35 : 0)) * massFactor;
      this.lander.hp = Math.max(0, this.lander.hp - damage);
      hardContact = hardContact || this.lander.hp <= 0;
      const impact = this.surfacePoint(this.angleOf(this.lander));
      this.spawnImpactFx(impact.x, impact.y, '#ffcf5a', Math.min(18, 4 + Math.round(damage / 8)));
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
      this.lander.angle = this.localUpAngleAt(this.angleOf(this.lander));
      this.lander.angularVelocity = 0;
      const precision = this.surfaceDistance(this.angleOf(this.lander), this.angleOf(pad));
      const precisionM = this.toMeters(precision);
      const earned = Math.round(180 + (1 - precision / pad.radius) * 180 + (1 - impactSpeed / 5.2) * 120 + this.lander.fuel * 2 + this.streak * 25);
      this.score += Math.max(80, earned);
      const impact = this.surfacePoint(this.angleOf(this.lander));
      this.spawnImpactFx(impact.x, impact.y, '#84ffd3');
      this.playLandingTone();
      this.showLandingScreen(Math.max(80, earned), pad.name, precisionM, impactSpeed);
      return;
    }

    if (hardContact || this.lander.hp <= 0) {
      this.destroyed = true;
      this.streak = 0;
      this.lander.hp = 0;
      const impact = this.surfacePoint(this.angleOf(this.lander));
      this.spawnImpactFx(impact.x, impact.y, '#ff716a');
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
      life: PROJECTILE_LIFE_SECONDS,
      age: 0,
      armed: false,
    });
    this.fireCooldown = 0.22;
    this.playBurst(420, 0.08, 'square', 0.12);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const n = this.normalAtPoint(p);
      p.vx -= n.x * this.gravity() * dt;
      p.vy -= n.y * this.gravity() * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.age += dt;
      p.armed = p.armed || p.age >= PROJECTILE_ARM_TIME;
      if (p.armed && !this.destroyed && this.projectileHitsLander(p)) {
        this.applyProjectileHit(p);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0 || this.surfacePenetration(p) >= 0) {
        const impact = this.surfacePoint(this.angleOf(p));
        this.spawnImpactFx(impact.x, impact.y, '#ffcf5a', 8);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private projectileHitsLander(projectile: Projectile) {
    const hitPoints = [
      this.lander,
      this.bodyPointToWorld({ x: 0, y: -18 }),
      this.bodyPointToWorld({ x: 0, y: 8 }),
      this.bodyPointToWorld({ x: -14, y: 10 }),
      this.bodyPointToWorld({ x: 14, y: 10 }),
      ...this.legFootPoints(),
    ];

    return hitPoints.some((point) => Math.hypot(projectile.x - point.x, projectile.y - point.y) <= LANDER_COLLISION_RADIUS + PROJECTILE_RADIUS);
  }

  private applyProjectileHit(projectile: Projectile) {
    const speedMps = this.toMetersPerSecond(Math.hypot(projectile.vx, projectile.vy));
    const damage = PROJECTILE_DAMAGE + speedMps * 1.2;
    this.lander.hp = Math.max(0, this.lander.hp - damage);
    this.lander.vx += projectile.vx * 0.06;
    this.lander.vy += projectile.vy * 0.06;
    this.lander.angularVelocity += (projectile.x - this.lander.x) * 0.015;
    this.spawnImpactFx(projectile.x, projectile.y, '#ff716a', 18);
    this.playBurst(92, 0.18, 'sawtooth', 0.22);

    if (this.lander.hp <= 0) {
      this.destroyed = true;
      this.landed = false;
      this.streak = 0;
      document.getElementById('landing-screen')?.classList.remove('visible');
      this.showDeathScreen('Destroyed by returned round');
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const n = this.normalAtPoint(p);
      p.vx -= n.x * this.gravity() * 0.25 * dt;
      p.vy -= n.y * this.gravity() * 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateCamera(dt: number) {
    const pad = this.targetPad();
    const altitude = this.groundClearance();
    const distanceToPad = Math.hypot(pad.x - this.lander.x, pad.y - this.lander.y);
    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    const orbitalBlend = Math.max(0, Math.min(0.55, (altitude - 260) / 900));
    const lookAhead = {
      x: Math.max(-320, Math.min(320, this.lander.vx * 4.2)),
      y: Math.max(-320, Math.min(320, this.lander.vy * 4.2)),
    };
    const targetBlend = Math.max(0, Math.min(0.42, 1 - distanceToPad / 760));
    const closeCenter = {
      x: this.lerp(this.lander.x + lookAhead.x, pad.x, targetBlend),
      y: this.lerp(this.lander.y + lookAhead.y, pad.y, targetBlend),
    };

    this.cameraTarget.x = this.lerp(closeCenter.x, 0, orbitalBlend);
    this.cameraTarget.y = this.lerp(closeCenter.y, 0, orbitalBlend);

    const desiredSpan = this.input.state.mapView
      ? this.bodyRadiusUnits() * 3.25
      : Math.max(520, Math.min(3600, 460 + altitude * 2.2 + distanceToPad * 0.48 + speed * 8 + this.bodyRadiusUnits() * orbitalBlend * 1.9));
    const autoZoom = Math.min(this.width, this.height) / desiredSpan;
    this.cameraTarget.zoom = Math.max(0.18, Math.min(1.55, autoZoom));
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
    this.drawRemotePlayers(ctx);
    this.drawLander(ctx);
    if (this.input.state.mapView) this.drawOrbitalMap(ctx);
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
    const samples = 240;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const point = this.surfacePoint(angle);
      const screen = this.worldToScreen(point);
      if (i === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    }
    ctx.closePath();
    const fill = ctx.createRadialGradient(
      this.worldToScreen({ x: 0, y: 0 }).x,
      this.worldToScreen({ x: 0, y: 0 }).y,
      this.bodyRadiusUnits() * this.camera.zoom * 0.2,
      this.worldToScreen({ x: 0, y: 0 }).x,
      this.worldToScreen({ x: 0, y: 0 }).y,
      this.bodyRadiusUnits() * this.camera.zoom * 1.15,
    );
    fill.addColorStop(0, body.groundTop);
    fill.addColorStop(0.48, body.groundMid);
    fill.addColorStop(1, body.groundBottom);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = body.surfaceLine;
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawCraterDetails(ctx, 0, Math.PI * 2);
    this.drawHexSurface(ctx, 0, Math.PI * 2);
  }

  private drawCraterDetails(ctx: CanvasRenderingContext2D, startAngle: number, endAngle: number) {
    const body = this.currentBody();
    ctx.save();
    for (let i = 0; i < 42; i++) {
      const seed = Math.sin(i * 12.9898 + this.selectedBodyIndex * 7.13) * 43758.5453;
      const frac = seed - Math.floor(seed);
      if (frac < body.craterRate) continue;
      const angle = startAngle + (i / 42) * (endAngle - startAngle);
      const p = this.worldToScreen(this.surfacePoint(angle, 3));
      const rx = (18 + frac * 32) * this.camera.zoom;
      const ry = rx * 0.28;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-angle);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#30302d';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = '#cfc7b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-rx * 0.06, -ry * 0.18, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.94);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHexSurface(ctx: CanvasRenderingContext2D, startAngle: number, endAngle: number) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#34342f';
    const samples = 96;
    for (let i = 0; i < samples; i++) {
      const angle = startAngle + (i / samples) * (endAngle - startAngle);
      const p = this.worldToScreen(this.surfacePoint(angle, -5));
      const r = 14 * this.camera.zoom;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = Math.PI / 6 + j * Math.PI / 3;
        const hx = p.x + Math.cos(a) * r;
        const hy = p.y + Math.sin(a) * r * 0.55;
        if (j === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPads(ctx: CanvasRenderingContext2D) {
    for (const pad of this.pads) {
      const isTarget = pad === this.targetPad();
      const angle = this.angleOf(pad);
      const normal = this.normalAtAngle(angle);
      const tangent = { x: -normal.y, y: normal.x };
      const p = this.worldToScreen(this.surfacePoint(angle, 7));
      const half = pad.radius * this.camera.zoom * 0.52;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-angle + Math.PI / 2);
      ctx.globalAlpha = isTarget ? 0.28 : 0.12;
      ctx.fillStyle = isTarget ? '#ffcf5a' : '#84ffd3';
      ctx.beginPath();
      ctx.ellipse(0, 0, half * 1.25, 18 * this.camera.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-angle + Math.PI / 2);
      ctx.strokeStyle = pad === this.targetPad() ? '#ffcf5a' : '#84ffd3';
      ctx.fillStyle = isTarget ? 'rgba(255,207,90,0.22)' : 'rgba(132,255,211,0.16)';
      ctx.lineWidth = pad === this.targetPad() ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(-half, -5, half * 2, 10, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = isTarget ? '#fff4c4' : '#dffdf4';
      ctx.font = `${isTarget ? 12 : 11}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(pad.name, p.x + normal.x * 24, p.y - normal.y * 24);

      if (isTarget) {
        ctx.strokeStyle = 'rgba(255,207,90,0.42)';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x + normal.x * 30, p.y - normal.y * 30);
        ctx.lineTo(p.x + normal.x * 110, p.y - normal.y * 110);
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
    const surface = this.surfacePoint(this.angleOf(this.lander), 2);
    const shadow = this.worldToScreen(surface);
    const altitude = this.groundClearance();
    const normal = this.normalAtPoint(this.lander);
    ctx.save();
    ctx.globalAlpha = Math.max(0.12, Math.min(0.45, 1 - altitude / 420));
    ctx.fillStyle = '#24231f';
    ctx.translate(shadow.x, shadow.y);
    ctx.rotate(-this.angleOf(this.lander) + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(normal.x * 4, normal.y * 4, 36 * this.camera.zoom, 8 * this.camera.zoom, 0, 0, Math.PI * 2);
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
    for (const projectile of this.projectiles) {
      const p = this.worldToScreen(projectile);
      ctx.fillStyle = projectile.armed ? '#ff716a' : '#ffcf5a';
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

  private drawRemotePlayers(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const remote of this.remotePlayers.values()) {
      if (remote.bodyId !== this.currentBody().id || now - remote.updatedAt > 5000) continue;
      const p = this.worldToScreen(remote);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(remote.angle);
      ctx.strokeStyle = '#ffcf5a';
      ctx.fillStyle = 'rgba(255,207,90,0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(13, 12);
      ctx.lineTo(-13, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffcf5a';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(remote.name, p.x, p.y - 26);
    }
  }

  private drawOrbitalMap(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = 'rgba(1,4,8,0.76)';
    ctx.fillRect(0, 0, this.width, this.height);
    const c = { x: this.width / 2, y: this.height / 2 };
    const scale = Math.min(this.width, this.height) * 0.42 / (this.bodyRadiusUnits() + 900);
    const toMap = (point: Vec2) => ({ x: c.x + point.x * scale, y: c.y - point.y * scale });

    ctx.strokeStyle = 'rgba(132,255,211,0.16)';
    ctx.lineWidth = 1;
    for (let r = 500; r <= 1800; r += 250) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, (this.bodyRadiusUnits() + r) * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = this.currentBody().groundMid;
    ctx.beginPath();
    for (let i = 0; i <= 220; i++) {
      const p = toMap(this.surfacePoint((i / 220) * Math.PI * 2));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.currentBody().surfaceLine;
    ctx.lineWidth = 2;
    ctx.stroke();

    const traj = this.predictTrajectory();
    ctx.strokeStyle = 'rgba(255,207,90,0.82)';
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    traj.forEach((point, index) => {
      const p = toMap(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    for (const pad of this.pads) {
      const p = toMap(pad);
      ctx.fillStyle = pad === this.targetPad() ? '#ffcf5a' : '#84ffd3';
      ctx.beginPath();
      ctx.arc(p.x, p.y, pad === this.targetPad() ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const lp = toMap(this.lander);
    ctx.save();
    ctx.translate(lp.x, lp.y);
    ctx.rotate(this.lander.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 8);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#dffdf4';
    ctx.font = '13px ui-monospace, monospace';
    ctx.textAlign = 'left';
    const apoapsis = Math.max(...traj.map((p) => Math.hypot(p.x, p.y))) - this.bodyRadiusUnits();
    const periapsis = Math.min(...traj.map((p) => Math.hypot(p.x, p.y))) - this.bodyRadiusUnits();
    ctx.fillText(`ORBITAL MAP  ${this.currentBody().name}`, 18, 28);
    ctx.fillText(`AP ${Math.max(0, this.toMeters(apoapsis)).toFixed(0)}m   PE ${Math.max(0, this.toMeters(periapsis)).toFixed(0)}m   M to close`, 18, 48);
    ctx.restore();
  }

  private updateHUD() {
    const stats = LANDERS[this.selectedLander];
    const body = this.currentBody();
    const altitude = this.toMeters(this.groundClearance());
    const speed = this.toMetersPerSecond(Math.hypot(this.lander.vx, this.lander.vy));
    const fuelPct = Math.max(0, Math.min(1, this.lander.fuel / stats.fuel));
    const hpPct = Math.max(0, Math.min(1, this.lander.hp / stats.hp));
    const target = this.targetPad();
    const distance = this.toMeters(this.surfaceDistance(this.angleOf(this.lander), this.angleOf(target)));
    const localTwr = (stats.maxTwr * MOON_GRAVITY_MPS2 / body.gravityMps2).toFixed(2);

    this.hudElements['score'].textContent = `${this.score}`;
    this.hudElements['rank'].textContent = body.name;
    this.hudElements['altitude'].textContent = altitude.toFixed(0);
    this.hudElements['velocity'].textContent = speed.toFixed(1);
    this.hudElements['vel-vertical'].textContent = this.toMetersPerSecond(this.radialVelocity(this.lander)).toFixed(1);
    this.hudElements['vel-horizontal'].textContent = this.toMetersPerSecond(this.tangentialVelocity(this.lander)).toFixed(1);
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
    this.hudElements['perf-entities'].textContent = `${1 + this.remotePlayers.size + this.projectiles.length + this.particles.length}`;
    this.hudElements['perf-draw'].textContent = this.multiplayerSocket?.readyState === WebSocket.OPEN ? '2D NET' : '2D';

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
    const c = { x: w / 2, y: h / 2 };
    const mapScale = Math.min(w, h) * 0.42 / (this.bodyRadiusUnits() + 420);
    const toMap = (point: Vec2) => ({ x: c.x + point.x * mapScale, y: c.y - point.y * mapScale });

    ctx.strokeStyle = 'rgba(132,255,211,0.12)';
    ctx.lineWidth = 1;
    for (let r = 0.5; r <= 1.5; r += 0.5) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, (this.bodyRadiusUnits() + 260 * r) * mapScale, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(222,253,244,0.22)';
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const p = toMap(this.surfacePoint((i / 96) * Math.PI * 2));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    const traj = this.predictTrajectory();
    if (traj.length > 1) {
      ctx.strokeStyle = 'rgba(255,207,90,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      traj.forEach((point, index) => {
        const p = toMap(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const pad of this.pads) {
      const isTarget = pad === target;
      const p = toMap(pad);
      ctx.fillStyle = isTarget ? '#ffcf5a' : '#84ffd3';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isTarget ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isTarget) {
        const l = toMap(this.lander);
        ctx.strokeStyle = '#ffcf5a';
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    const lp = toMap(this.lander);
    ctx.save();
    ctx.translate(lp.x, lp.y);
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
    ctx.fillText(`${Math.round(this.toMeters(this.groundClearance()))}m ALT`, 7, 12);
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
    for (let i = 0; i < 160; i++) {
      const n = this.normalAtPoint({ x, y });
      vx -= n.x * this.gravity() * 0.24;
      vy -= n.y * this.gravity() * 0.24;
      x += vx * 0.24;
      y += vy * 0.24;
      points.push({ x, y });
      if (this.surfacePenetration({ x, y }) >= 0) break;
    }
    return points;
  }

  private terrainRadiusAtAngle(angle: number) {
    const base = this.baseTerrainRadiusAtAngle(angle);
    for (const pad of this.pads) {
      const padAngle = this.angleOf(pad);
      const distance = this.surfaceDistance(angle, padAngle);
      const padRadius = Math.hypot(pad.x, pad.y);
      if (distance <= pad.radius) return padRadius;
      if (distance <= pad.radius * 1.45) {
        const t = (distance - pad.radius) / (pad.radius * 0.45);
        const smooth = t * t * (3 - 2 * t);
        return this.lerp(padRadius, base, smooth);
      }
    }
    return base;
  }

  private baseTerrainRadiusAtAngle(angle: number) {
    const body = this.currentBody();
    const sx = angle * this.bodyRadiusUnits() * body.terrainScale;
    return this.bodyRadiusUnits()
      + Math.sin(sx * 0.004) * 38 * body.terrainAmp
      + Math.sin(sx * 0.011 + 1.8) * 22 * body.terrainAmp
      + Math.sin(sx * 0.025 + 0.4) * 9 * body.terrainAmp
      + Math.sin(sx * 0.057 + 2.7) * 3.5 * body.terrainAmp;
  }

  private padAtPoint(point: Vec2) {
    const angle = this.angleOf(point);
    return this.pads.find((pad) => this.surfaceDistance(angle, this.angleOf(pad)) <= pad.radius);
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

  private bodyRadiusUnits() {
    return this.currentBody().gameRadiusM / 32;
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

  private angleOf(point: Vec2) {
    return Math.atan2(point.y, point.x);
  }

  private normalAtAngle(angle: number) {
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  private normalAtPoint(point: Vec2) {
    const length = Math.hypot(point.x, point.y) || 1;
    return { x: point.x / length, y: point.y / length };
  }

  private localUpAngleAt(angle: number) {
    const n = this.normalAtAngle(angle);
    return Math.atan2(n.x, n.y);
  }

  private surfacePoint(angle: number, offset = 0) {
    const n = this.normalAtAngle(angle);
    const r = this.terrainRadiusAtAngle(angle) + offset;
    return { x: n.x * r, y: n.y * r };
  }

  private baseSurfacePoint(angle: number, offset = 0) {
    const n = this.normalAtAngle(angle);
    const r = this.baseTerrainRadiusAtAngle(angle) + offset;
    return { x: n.x * r, y: n.y * r };
  }

  private surfacePenetration(point: Vec2) {
    return this.terrainRadiusAtAngle(this.angleOf(point)) - Math.hypot(point.x, point.y);
  }

  private surfaceDistance(a: number, b: number) {
    return Math.abs(this.normalizeAngle(a - b)) * this.bodyRadiusUnits();
  }

  private radialVelocity(point: Vec2 & { vx: number; vy: number }) {
    const n = this.normalAtPoint(point);
    return point.vx * n.x + point.vy * n.y;
  }

  private tangentialVelocity(point: Vec2 & { vx: number; vy: number }) {
    const n = this.normalAtPoint(point);
    return point.vx * -n.y + point.vy * n.x;
  }

  private groundClearance() {
    const footClearance = this.legFootPoints()
      .map((foot) => -this.surfacePenetration(foot));
    const hull = this.bodyPointToWorld({ x: 0, y: HULL_BOTTOM });
    footClearance.push(-this.surfacePenetration(hull));
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
    const normal = this.normalAtPoint({ x, y });
    const tangent = { x: -normal.y, y: normal.x };
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * Math.PI;
      const speed = 18 + Math.random() * 48;
      this.particles.push({
        x,
        y,
        vx: (normal.x * Math.abs(Math.cos(spread)) + tangent.x * Math.sin(spread) * 0.7) * speed,
        vy: (normal.y * Math.abs(Math.cos(spread)) + tangent.y * Math.sin(spread) * 0.7) * speed,
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
