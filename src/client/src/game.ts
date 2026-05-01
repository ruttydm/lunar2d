/**
 * Lunar2D - side-on lunar lander built for readable, skill-based play.
 */

import { InputManager } from './controls';
import { AudioSystem } from './audio/AudioSystem';
import { MultiplayerClient } from './network/MultiplayerClient';
import {
  BODIES,
  BRAKING_INTENT_DOT_THRESHOLD,
  GROUND_CLEARANCE_BUFFER,
  HULL_BOTTOM,
  LANDER_COLLISION_RADIUS,
  LANDERS,
  LEG_DAMPING,
  LEG_FRICTION,
  LEG_POINTS,
  LEG_RESTITUTION,
  LEG_SPRING,
  LEG_TORQUE_RESPONSE,
  MOON_GRAVITY_MPS2,
  MULTIPLAYER_URL,
  PHYSICS_STEP,
  PROJECTILE_ARM_TIME,
  PROJECTILE_COOLDOWN_SECONDS,
  PROJECTILE_DAMAGE,
  PROJECTILE_ESCAPE_SPEED_FRACTION,
  PROJECTILE_LIFE_SECONDS,
  PROJECTILE_MIN_MUZZLE_SPEED,
  PROJECTILE_MUZZLE_SPEED,
  PROJECTILE_RADIUS,
  RCS_ACCEL,
  RCS_VERTICAL_ACCEL,
  TERRAIN_SAMPLE_COUNT,
  VIBE_JAM_PORTAL_URL,
  WORLD_METERS_PER_UNIT,
  generatePilotName,
  type CelestialBody,
  type ContactPoint,
  type LanderSnapshot,
  type Pad,
  type Particle,
  type Portal,
  type Projectile,
  type TerrainSample,
  type Vec2,
} from './domain/model';
import {
  hasBrakingIntent,
  lerp,
  normalizeAngle,
  bodyPointToWorld as bodyPointToWorldInFrame,
  normalizedDirection,
  positiveAngle,
  preventBrakingBurnSpeedup,
  projectileLaunchVelocity,
} from './physics/flight';
import {
  baseTerrainRadiusAtAngle,
  normalAtAngle,
  padPlatformRadius,
  rawTerrainRadiusAtAngle,
  rebuildTerrainCache,
  surfaceDistance,
  surfacePoint,
  terrainRadiusAtAngle,
} from './physics/terrain';
import { canApplyMainThrust, resolveEngineStatus } from './systems/engine';
import { nextObjectivePhase, objectiveText, type ObjectivePhase } from './systems/objectives';

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
  private camera = { x: 0, y: 280, zoom: 0.9, rotation: 0 };
  private cameraTarget = { x: 0, y: 280, zoom: 0.9, rotation: 0 };

  private pads: Pad[] = [];
  private terrainSamples: TerrainSample[] = [];
  private portals: Portal[] = [];
  private targetPadIndex = 0;
  private selectedLander = 1;
  private selectedBodyIndex = 0;
  private score = 0;
  private streak = 0;
  private landed = false;
  private destroyed = false;
  private debugOverlay = false;
  private objectivePhase: ObjectivePhase = 'land';
  private lastImpactReport = 'nominal';

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

  private audio = new AudioSystem();
  private lastWarningAt = 0;
  private multiplayerName = generatePilotName();
  private multiplayer = new MultiplayerClient(MULTIPLAYER_URL);
  private portalParams = new URLSearchParams(location.search);
  private portalCooldown = 1.2;

  async init(statusEl: HTMLElement) {
    statusEl.textContent = 'Preparing 2D lander...';
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.input = new InputManager(this.canvas);

    this.applyIncomingPortalState();
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

      if (event.code === 'F3') {
        this.debugOverlay = !this.debugOverlay;
        event.preventDefault();
      }
    });
  }

  private connectMultiplayer() {
    this.multiplayer.connect(this.multiplayerName);
  }

  private updateMultiplayer(dt: number) {
    this.multiplayer.update(dt, {
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

  private buildPortalUrl(destination: string) {
    const base = destination.startsWith('http://') || destination.startsWith('https://')
      ? destination
      : `https://${destination}`;
    const url = new URL(base);
    const params = new URLSearchParams(this.portalParams);
    params.set('portal', 'true');
    params.set('username', this.multiplayerName);
    params.set('color', LANDERS[this.selectedLander].color);
    params.set('speed', this.toMetersPerSecond(Math.hypot(this.lander.vx, this.lander.vy)).toFixed(2));
    params.set('speed_x', this.toMetersPerSecond(this.lander.vx).toFixed(2));
    params.set('speed_y', this.toMetersPerSecond(this.lander.vy).toFixed(2));
    params.set('speed_z', '0');
    params.set('rotation_z', this.lander.angle.toFixed(4));
    params.set('hp', `${Math.max(1, Math.min(100, Math.round(this.lander.hp)))}`);
    params.set('ref', `${location.origin}${location.pathname}`);

    for (const [key, value] of params) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private applyIncomingPortalState() {
    const username = this.portalParams.get('username');
    if (username) this.multiplayerName = username.slice(0, 28);

    const hp = Number(this.portalParams.get('hp'));
    if (Number.isFinite(hp)) {
      this.lander.hp = Math.max(1, Math.min(LANDERS[this.selectedLander].hp, hp));
    }
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
    const padSpecs = [
      { id: 0, name: names[0] ?? 'Alpha', x: 0, y: 0, radius: 320 },
      { id: 1, name: names[1] ?? 'Beta', x: 0, y: 0, radius: 280 },
      { id: 2, name: names[2] ?? 'Gamma', x: 0, y: 0, radius: 250 },
      { id: 3, name: names[3] ?? 'Delta', x: 0, y: 0, radius: 230 },
      { id: 4, name: names[4] ?? 'Epsilon', x: 0, y: 0, radius: 240 },
    ];
    this.pads = padSpecs.map((pad, index) => {
      const angle = padAngles[index] ?? 0;
      const platformRadius = this.padPlatformRadius(angle, pad.radius);
      const normal = this.normalAtAngle(angle);
      return {
        ...pad,
        angle,
        platformRadius,
        damaged: false,
        x: normal.x * platformRadius,
        y: normal.y * platformRadius,
      };
    });
    this.rebuildTerrainCache();
    this.createPortals();
  }

  private createPortals() {
    const exitAngles = [-2.95, 0.72, 2.58];
    this.portals = exitAngles.map((angle, index) => ({
      id: `vibe-exit-${index + 1}`,
      label: `Vibe Jam ${index + 1}`,
      radius: 95,
      color: index === 1 ? '#ffcf5a' : '#ff4fd8',
      url: this.buildPortalUrl(VIBE_JAM_PORTAL_URL),
      ...this.surfacePoint(angle, 480),
    }));

    const ref = this.portalParams.get('ref');
    if (this.portalParams.get('portal') === 'true' && ref) {
      const start = this.surfacePoint(-0.42, 420);
      this.portals.push({
        id: 'return',
        label: 'Return Portal',
        radius: 85,
        color: '#84ffd3',
        url: this.buildPortalUrl(ref),
        ...start,
      });
    }
  }

  private spawnPlayer() {
    this.destroyed = false;
    this.landed = false;
    this.objectivePhase = 'land';
    this.lastImpactReport = 'nominal';
    this.projectiles = [];
    this.particles = [];
    this.targetPadIndex = Math.floor(Math.random() * this.pads.length);
    const pad = this.targetPad();
    const side = Math.random() < 0.5 ? -1 : 1;
    const stats = LANDERS[this.selectedLander];
    const padAngle = pad.angle;
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
    const returnPortal = this.portals.find((portal) => portal.id === 'return');
    if (returnPortal) {
      const portalAngle = this.angleOf(returnPortal);
      const portalNormal = this.normalAtAngle(portalAngle);
      const portalTangent = { x: -portalNormal.y, y: portalNormal.x };
      const radius = Math.hypot(returnPortal.x, returnPortal.y) + 120;
      this.lander.x = portalNormal.x * radius;
      this.lander.y = portalNormal.y * radius;
      this.lander.vx = portalTangent.x * 10;
      this.lander.vy = portalTangent.y * 10;
      this.lander.angle = this.localUpAngleAt(portalAngle);
      this.portalCooldown = 2.4;
    }
    this.applyIncomingPortalState();
    this.input.state.throttle = 0;
    this.input.state.sasMode = 0;
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
    this.updatePortals(dt);
    this.updateObjectivePhase();
    this.updateCamera(dt);
    this.updateMultiplayer(dt);
  }

  private updateLander(dt: number) {
    const stats = LANDERS[this.selectedLander];
    const s = this.input.state;
    const altitude = this.groundClearance();
    const previous = this.landerSnapshot();

    let angularInput = s.yaw + s.roll - s.pitch * 0.35;
    if (s.brakeAssist) this.applyBrakeAssist(dt);
    if (s.sasMode > 0 && Math.abs(angularInput) < 0.05 && !s.brakeAssist) {
      this.lander.angularVelocity *= Math.pow(0.03, dt);
    }

    if (s.fineControl) angularInput *= 0.35;
    this.lander.angularVelocity += angularInput * stats.rotation * dt;
    this.lander.angularVelocity *= Math.pow(0.18, dt);
    this.lander.angle = normalizeAngle(this.lander.angle + this.lander.angularVelocity * dt);

    const stepStartVelocity = { x: this.lander.vx, y: this.lander.vy };
    const stepStartSpeed = Math.hypot(stepStartVelocity.x, stepStartVelocity.y);
    const brakeAlignment = s.brakeAssist ? this.retrogradeAlignment() : 0;
    const brakeThrottle = brakeAlignment > 0.58 ? 0.25 + brakeAlignment * 0.65 : 0;
    const throttle = s.brakeAssist ? Math.max(s.throttle, brakeThrottle) : s.throttle;
    let brakingBurnSpeedLimit: number | null = null;
    const engineStatus = this.engineStatus();
    if (throttle > 0.01 && canApplyMainThrust(engineStatus)) {
      const boost = s.boost ? 1.35 : 1;
      const thrust = this.lunarRatedEngineAccel() * stats.maxTwr * throttle * boost;
      const dir = this.thrustDirection();
      if (hasBrakingIntent(dir, stepStartVelocity, BRAKING_INTENT_DOT_THRESHOLD)) {
        brakingBurnSpeedLimit = stepStartSpeed;
      }
      this.lander.vx += dir.x * thrust * dt;
      this.lander.vy += dir.y * thrust * dt;
      if (brakingBurnSpeedLimit !== null) {
        this.applyBrakingSpeedLimit(brakingBurnSpeedLimit);
      }
      this.lander.fuel = Math.max(0, this.lander.fuel - throttle * boost * stats.fuel / 58 * dt);
      this.emitExhaust(dt, throttle);
    }

    if (s.rcsMode && canApplyMainThrust(engineStatus)) {
      const frame = this.localFrame(this.lander);
      const radialAccel = -s.translateZ * RCS_ACCEL + s.translateY * RCS_VERTICAL_ACCEL;
      const tangentialAccel = s.translateX * RCS_ACCEL;
      const accel = {
        x: frame.tangent.x * tangentialAccel + frame.normal.x * radialAccel,
        y: frame.tangent.y * tangentialAccel + frame.normal.y * radialAccel,
      };
      const accelMagnitude = Math.hypot(accel.x, accel.y);
      if (accelMagnitude > 0.01) {
        const rcsDirection = { x: accel.x / accelMagnitude, y: accel.y / accelMagnitude };
        if (hasBrakingIntent(rcsDirection, stepStartVelocity, BRAKING_INTENT_DOT_THRESHOLD)) {
          brakingBurnSpeedLimit = stepStartSpeed;
        }
      }
      this.lander.vx += accel.x * dt;
      this.lander.vy += accel.y * dt;
      if (brakingBurnSpeedLimit !== null) {
        this.applyBrakingSpeedLimit(brakingBurnSpeedLimit);
      }
      this.lander.fuel = Math.max(0, this.lander.fuel - (Math.abs(s.translateX) + Math.abs(s.translateZ) + Math.abs(s.translateY)) * 0.12 * dt);
    }

    const gravityNormal = this.normalAtPoint(this.lander);
    this.lander.vx -= gravityNormal.x * this.gravity() * dt;
    this.lander.vy -= gravityNormal.y * this.gravity() * dt;
    if (brakingBurnSpeedLimit !== null) {
      this.applyBrakingSpeedLimit(brakingBurnSpeedLimit);
    }
    this.lander.x += this.lander.vx * dt;
    this.lander.y += this.lander.vy * dt;
    this.resolveSweptTerrainContact(previous);

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
    const error = normalizeAngle(desired - this.lander.angle);
    this.lander.angle = normalizeAngle(this.lander.angle + error * Math.min(1, dt * 4.5));
    this.lander.angularVelocity += error * 6.0 * dt;
  }

  private retrogradeAlignment() {
    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    if (speed < 0.5) return 0;
    const thrust = this.thrustDirection();
    return Math.max(0, -(thrust.x * this.lander.vx + thrust.y * this.lander.vy) / speed);
  }

  private applyBrakingSpeedLimit(previousSpeed: number) {
    const velocity = preventBrakingBurnSpeedup({ x: this.lander.vx, y: this.lander.vy }, previousSpeed);
    this.lander.vx = velocity.x;
    this.lander.vy = velocity.y;
  }

  private landerSnapshot(): LanderSnapshot {
    return {
      x: this.lander.x,
      y: this.lander.y,
      vx: this.lander.vx,
      vy: this.lander.vy,
      angle: this.lander.angle,
      angularVelocity: this.lander.angularVelocity,
      fuel: this.lander.fuel,
      hp: this.lander.hp,
    };
  }

  private resolveSweptTerrainContact(previous: LanderSnapshot) {
    if (this.minGroundClearance(this.lander) >= GROUND_CLEARANCE_BUFFER) return;

    const current = this.landerSnapshot();
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      const sample = this.interpolateLanderSnapshot(previous, current, mid);
      if (this.minGroundClearance(sample) >= GROUND_CLEARANCE_BUFFER) lo = mid;
      else hi = mid;
    }

    const safe = this.interpolateLanderSnapshot(previous, current, Math.max(0, lo));
    this.lander.x = safe.x;
    this.lander.y = safe.y;
    this.lander.angle = safe.angle;

    const contacts = this.contactPoints(this.lander).filter((contact) => contact.penetration > -GROUND_CLEARANCE_BUFFER);
    const deepest = contacts.reduce<ContactPoint | null>((best, contact) => {
      if (!best || contact.penetration > best.penetration) return contact;
      return best;
    }, null);
    if (!deepest) return;

    const correction = Math.max(0, deepest.penetration + GROUND_CLEARANCE_BUFFER);
    this.lander.x += deepest.normal.x * correction;
    this.lander.y += deepest.normal.y * correction;
    const inwardSpeed = this.lander.vx * deepest.normal.x + this.lander.vy * deepest.normal.y;
    if (inwardSpeed < 0) {
      this.lander.vx -= deepest.normal.x * inwardSpeed;
      this.lander.vy -= deepest.normal.y * inwardSpeed;
    }
  }

  private interpolateLanderSnapshot(a: LanderSnapshot, b: LanderSnapshot, t: number): LanderSnapshot {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      vx: lerp(a.vx, b.vx, t),
      vy: lerp(a.vy, b.vy, t),
      angle: normalizeAngle(a.angle + normalizeAngle(b.angle - a.angle) * t),
      angularVelocity: lerp(a.angularVelocity, b.angularVelocity, t),
      fuel: b.fuel,
      hp: b.hp,
    };
  }

  private checkSurfaceContact(dt: number) {
    const contacts = this.contactPoints(this.lander).filter((contact) => contact.penetration > 0);
    if (contacts.length === 0) return;
    const footContacts = contacts.filter((contact) => contact.label !== 'hull');
    const hullContact = contacts.find((contact) => contact.label === 'hull');

    const stats = LANDERS[this.selectedLander];
    const contactCount = Math.max(1, contacts.length);
    let maxPenetration = 0;
    let maxImpactSpeed = 0;
    let hardContact = !!hullContact && hullContact.penetration > 3;
    let deepestContact = contacts[0];

    for (const contact of contacts) {
      maxPenetration = Math.max(maxPenetration, contact.penetration);
      if (contact.penetration >= deepestContact.penetration) deepestContact = contact;
      maxImpactSpeed = Math.max(maxImpactSpeed, Math.max(0, -contact.radialVelocity));

      const contactStrength = contact.label === 'hull' ? 0.55 : 1;
      const springAccel = Math.min(420, Math.max(0, contact.penetration * LEG_SPRING - contact.radialVelocity * LEG_DAMPING)) * contactStrength / contactCount;
      const frictionAccel = -contact.tangentVelocity * LEG_FRICTION * contactStrength / contactCount;
      const fx = contact.normal.x * springAccel + contact.tangent.x * frictionAccel;
      const fy = contact.normal.y * springAccel + contact.tangent.y * frictionAccel;
      this.lander.vx += fx * dt;
      this.lander.vy += fy * dt;
      if (contact.label !== 'hull') {
        const radius = { x: contact.point.x - this.lander.x, y: contact.point.y - this.lander.y };
        this.lander.angularVelocity += (radius.x * fy - radius.y * fx) * LEG_TORQUE_RESPONSE * dt;
      }
    }

    if (maxPenetration > 0) {
      const n = deepestContact.normal;
      this.lander.x += n.x * (maxPenetration + GROUND_CLEARANCE_BUFFER);
      this.lander.y += n.y * (maxPenetration + GROUND_CLEARANCE_BUFFER);
      const radialVelocity = this.lander.vx * n.x + this.lander.vy * n.y;
      if (radialVelocity < 0) {
        this.lander.vx -= n.x * radialVelocity * (1 - LEG_RESTITUTION);
        this.lander.vy -= n.y * radialVelocity * (1 - LEG_RESTITUTION);
      }
    }

    const pad = this.padAtPoint(deepestContact.point) ?? this.padAtPoint(this.lander);
    const horizontalSpeed = Math.abs(this.toMetersPerSecond(this.tangentialVelocity(this.lander)));
    const impactSpeed = this.toMetersPerSecond(maxImpactSpeed);
    const tilt = Math.abs(normalizeAngle(this.lander.angle - this.localUpAngleAt(this.angleOf(this.lander))));
    const bothFeetSupported = footContacts.length === LEG_POINTS.length;
    const soft = bothFeetSupported && !hullContact && impactSpeed < 5.8 && horizontalSpeed < 4.2 && tilt < 0.38;
    this.lastImpactReport = `${impactSpeed.toFixed(1)}m/s V ${horizontalSpeed.toFixed(1)}m/s H`;

    if (impactSpeed > 7.4 || horizontalSpeed > 6.2 || tilt > 0.66 || hardContact) {
      const massFactor = Math.sqrt(stats.mass / 1000);
      const damage = (Math.max(0, impactSpeed - 5.4) * 8 + Math.max(0, horizontalSpeed - 4.2) * 5 + Math.max(0, tilt - 0.42) * 30 + (hardContact ? 24 : 0)) * massFactor;
      this.lander.hp = Math.max(0, this.lander.hp - damage);
      if (pad) pad.damaged = true;
      hardContact = (hardContact && damage > 28) || this.lander.hp <= 0;
      const impact = this.surfacePoint(this.angleOf(this.lander));
      this.spawnImpactFx(impact.x, impact.y, '#ffcf5a', Math.min(18, 4 + Math.round(damage / 8)));
      if (performance.now() - this.lastWarningAt > 260) {
        this.playBurst(120 + Math.max(0, 180 - damage), 0.08, 'sawtooth', 0.12);
        this.lastWarningAt = performance.now();
      }
    }

    if (pad && soft && this.lander.hp > 0) {
      this.landed = true;
      this.objectivePhase = this.objectivePhase === 'land' ? 'orbit' : this.objectivePhase;
      this.streak++;
      this.lander.vx = 0;
      this.lander.vy = 0;
      this.lander.angle = 0;
      this.lander.angle = this.localUpAngleAt(this.angleOf(this.lander));
      this.lander.angularVelocity = 0;
      const precision = this.surfaceDistance(this.angleOf(this.lander), pad.angle);
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
      this.showDeathScreen(pad ? 'Landing gear collapsed' : hullContact ? 'Hull strike' : 'Crashed into terrain');
    }
  }

  private fireProjectile() {
    const dir = this.forwardDirection();
    const muzzle = this.bodyPointToWorld({ x: 0, y: -42 });
    const velocity = projectileLaunchVelocity({
      origin: muzzle,
      inheritedVelocity: { x: this.lander.vx, y: this.lander.vy },
      direction: dir,
      gravity: this.gravity(),
      muzzleSpeed: PROJECTILE_MUZZLE_SPEED,
      minMuzzleSpeed: PROJECTILE_MIN_MUZZLE_SPEED,
      escapeSpeedFraction: PROJECTILE_ESCAPE_SPEED_FRACTION,
    });
    this.projectiles.push({
      x: muzzle.x + dir.x * 12,
      y: muzzle.y + dir.y * 12,
      vx: velocity.x,
      vy: velocity.y,
      life: PROJECTILE_LIFE_SECONDS,
      age: 0,
      armed: false,
    });
    this.fireCooldown = PROJECTILE_COOLDOWN_SECONDS;
    this.playBurst(420, 0.08, 'square', 0.12);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const previous = { x: p.x, y: p.y };
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
      const impactPoint = this.projectileTerrainImpact(previous, p);
      if (p.life <= 0 || impactPoint) {
        const impact = impactPoint ?? this.surfacePoint(this.angleOf(p));
        this.spawnImpactFx(impact.x, impact.y, '#ffcf5a', 8);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private projectileTerrainImpact(previous: Vec2, projectile: Vec2) {
    if (this.surfacePenetration(projectile) < 0) return null;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) * 0.5;
      const sample = {
        x: lerp(previous.x, projectile.x, mid),
        y: lerp(previous.y, projectile.y, mid),
      };
      if (this.surfacePenetration(sample) < 0) lo = mid;
      else hi = mid;
    }
    const hit = {
      x: lerp(previous.x, projectile.x, hi),
      y: lerp(previous.y, projectile.y, hi),
    };
    return this.surfacePoint(this.angleOf(hit), 2);
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

  private updatePortals(dt: number) {
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (this.portalCooldown > 0 || this.destroyed) return;

    for (const portal of this.portals) {
      if (Math.hypot(this.lander.x - portal.x, this.lander.y - portal.y) > portal.radius) continue;
      location.href = this.buildPortalUrl(portal.url);
      this.portalCooldown = 5;
      break;
    }
  }

  private updateObjectivePhase() {
    const altitude = this.groundClearance();
    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    const orbitalSpeed = Math.sqrt(this.gravity() * Math.max(1, Math.hypot(this.lander.x, this.lander.y)));
    const radial = Math.abs(this.radialVelocity(this.lander));
    const next = nextObjectivePhase({
      phase: this.objectivePhase,
      destroyed: this.destroyed,
      landed: this.landed,
      altitude,
      speed,
      orbitalSpeed,
      radialSpeed: radial,
    });
    if (next.completedOrbit) {
      this.objectivePhase = next.phase;
      this.score += 250;
      this.spawnImpactFx(this.lander.x, this.lander.y, '#84ffd3', 14);
      this.playLandingTone();
    }
  }

  private updateCamera(dt: number) {
    const pad = this.targetPad();
    const altitude = this.groundClearance();
    const distanceToPad = Math.hypot(pad.x - this.lander.x, pad.y - this.lander.y);
    const speed = Math.hypot(this.lander.vx, this.lander.vy);
    const normal = this.normalAtPoint(this.lander);
    const lookAhead = {
      x: Math.max(-180, Math.min(180, this.lander.vx * 2.2)),
      y: Math.max(-180, Math.min(180, this.lander.vy * 2.2)),
    };
    const nearSurface = 1 - Math.max(0, Math.min(1, altitude / 520));
    const targetBlend = nearSurface * Math.max(0, Math.min(0.22, 1 - distanceToPad / 900));
    const landingFocus = Math.max(0, Math.min(1, 1 - altitude / 280));
    const surfaceLift = 70 * nearSurface;
    const velocityBias = Math.max(0.25, 1 - landingFocus * 0.68);
    this.cameraTarget.x = lerp(this.lander.x + lookAhead.x * velocityBias + normal.x * surfaceLift, pad.x, targetBlend);
    this.cameraTarget.y = lerp(this.lander.y + lookAhead.y * velocityBias + normal.y * surfaceLift, pad.y, targetBlend);

    const desiredSpan = this.input.state.mapView
      ? this.bodyRadiusUnits() * 2.35
      : Math.max(440, Math.min(2400, 430 + altitude * 1.45 + speed * 5.2 + distanceToPad * targetBlend * 0.7));
    const autoZoom = Math.min(this.width, this.height) / desiredSpan;
    this.cameraTarget.zoom = Math.max(0.18, Math.min(1.55, autoZoom));
    this.cameraTarget.zoom *= 1 - Math.max(0, Math.min(0.25, this.input.state.cameraZoom * 0.02));
    const localRotation = normalizeAngle(Math.PI / 2 - this.angleOf(this.lander));
    const rotationBlend = Math.max(0, Math.min(1, 1 - (altitude - 900) / 1500));
    this.cameraTarget.rotation = this.input.state.mapView ? 0 : normalizeAngle(localRotation * rotationBlend);

    const t = 1 - Math.pow(0.00035, dt);
    this.camera.x = lerp(this.camera.x, this.cameraTarget.x, t);
    this.camera.y = lerp(this.camera.y, this.cameraTarget.y, t);
    this.camera.zoom = lerp(this.camera.zoom, this.cameraTarget.zoom, t);
    const rotationT = 1 - Math.pow(0.0002, dt);
    this.camera.rotation = normalizeAngle(this.camera.rotation + normalizeAngle(this.cameraTarget.rotation - this.camera.rotation) * rotationT);
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
    this.drawLandingPredictor(ctx);
    this.drawPortals(ctx);
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawRemotePlayers(ctx);
    this.drawLander(ctx);
    if (this.input.state.mapView) this.drawOrbitalMap(ctx);
    if (this.debugOverlay) this.drawDebugOverlay(ctx);
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
    const samples = this.terrainSamples.length > 0 ? this.terrainSamples.length : 240;
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 4) {
      const sample = this.terrainSamples[i % this.terrainSamples.length];
      const angle = sample?.angle ?? (i / samples) * Math.PI * 2;
      const radius = sample?.radius ?? this.terrainRadiusAtAngle(angle);
      const normal = this.normalAtAngle(angle);
      const point = { x: normal.x * radius, y: normal.y * radius };
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
      ctx.rotate(-angle + this.camera.rotation);
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
      const angle = pad.angle;
      const normal = this.normalAtAngle(angle);
      const halfAngle = pad.radius / this.bodyRadiusUnits();
      const start = this.worldToScreen(this.surfacePoint(angle - halfAngle, 9));
      const end = this.worldToScreen(this.surfacePoint(angle + halfAngle, 9));

      ctx.strokeStyle = pad.damaged ? 'rgba(255,113,106,0.28)' : isTarget ? 'rgba(255,207,90,0.24)' : 'rgba(132,255,211,0.14)';
      ctx.lineWidth = Math.max(14, 24 * this.camera.zoom);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.strokeStyle = pad.damaged ? '#ff716a' : isTarget ? '#ffcf5a' : '#84ffd3';
      ctx.lineWidth = Math.max(4, 8 * this.camera.zoom);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.lineCap = 'butt';

      const deckLeft = this.worldToScreen({
        x: pad.x + normal.y * pad.radius,
        y: pad.y - normal.x * pad.radius,
      });
      const deckRight = this.worldToScreen({
        x: pad.x - normal.y * pad.radius,
        y: pad.y + normal.x * pad.radius,
      });
      ctx.strokeStyle = 'rgba(4,8,10,0.62)';
      ctx.lineWidth = Math.max(2, 3 * this.camera.zoom);
      ctx.beginPath();
      ctx.moveTo(deckLeft.x, deckLeft.y);
      ctx.lineTo(deckRight.x, deckRight.y);
      ctx.stroke();

      ctx.fillStyle = isTarget ? '#fff4c4' : '#dffdf4';
      ctx.font = `${isTarget ? 12 : 11}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const label = this.worldToScreen(this.surfacePoint(angle, 42));
      ctx.fillText(pad.name, label.x, label.y);

      if (isTarget) {
        ctx.strokeStyle = 'rgba(255,207,90,0.42)';
        ctx.setLineDash([5, 6]);
        const beaconStart = this.worldToScreen(this.surfacePoint(angle, 46));
        const beaconEnd = this.worldToScreen(this.surfacePoint(angle, 180));
        ctx.beginPath();
        ctx.moveTo(beaconStart.x, beaconStart.y);
        ctx.lineTo(beaconEnd.x, beaconEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawPortals(ctx: CanvasRenderingContext2D) {
    const pulse = 0.5 + Math.sin(performance.now() * 0.005) * 0.5;
    for (const portal of this.portals) {
      const p = this.worldToScreen(portal);
      const radius = Math.max(16, portal.radius * this.camera.zoom);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = portal.color;
      ctx.shadowColor = portal.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.78 + pulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(portal.label, p.x, p.y - radius - 10);
    }
  }

  private drawTrajectory(ctx: CanvasRenderingContext2D) {
    const points = this.predictTrajectory();
    if (points.length < 2) return;
    ctx.save();
    const impact = points[points.length - 1];
    const impactSoon = this.surfacePenetration(impact) >= -GROUND_CLEARANCE_BUFFER;
    ctx.strokeStyle = impactSoon ? this.landingSafetyColor().line : 'rgba(255,207,90,0.65)';
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

  private drawLandingPredictor(ctx: CanvasRenderingContext2D) {
    const points = this.predictTrajectory();
    if (points.length < 8) return;
    const impact = points[points.length - 1];
    if (this.surfacePenetration(impact) < -GROUND_CLEARANCE_BUFFER) return;

    const p = this.worldToScreen(impact);
    const safety = this.landingSafetyColor();
    ctx.save();
    ctx.strokeStyle = safety.line;
    ctx.fillStyle = safety.fill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.moveTo(p.x, p.y - 18);
    ctx.lineTo(p.x, p.y + 18);
    ctx.stroke();
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(safety.label, p.x, p.y - 22);
    ctx.restore();
  }

  private landingSafetyColor() {
    const vertical = Math.abs(this.toMetersPerSecond(this.radialVelocity(this.lander)));
    const horizontal = Math.abs(this.toMetersPerSecond(this.tangentialVelocity(this.lander)));
    const tilt = Math.abs(normalizeAngle(this.lander.angle - this.localUpAngleAt(this.angleOf(this.lander))));
    if (vertical < 5.8 && horizontal < 4.2 && tilt < 0.38) {
      return { line: 'rgba(132,255,211,0.86)', fill: '#84ffd3', label: 'SAFE' };
    }
    if (vertical < 8.2 && horizontal < 6.4 && tilt < 0.62) {
      return { line: 'rgba(255,207,90,0.86)', fill: '#ffcf5a', label: 'ROUGH' };
    }
    return { line: 'rgba(255,113,106,0.9)', fill: '#ff716a', label: 'CRASH' };
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
    ctx.rotate(-this.angleOf(this.lander) + Math.PI / 2 + this.camera.rotation);
    ctx.beginPath();
    ctx.ellipse(normal.x * 4, normal.y * 4, 36 * this.camera.zoom, 8 * this.camera.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.lander.angle + this.camera.rotation);
    ctx.scale(scale, scale);
    const leftCompression = Math.max(0, Math.min(12, this.surfacePenetration(this.bodyPointToWorld(LEG_POINTS[0])) + 4));
    const rightCompression = Math.max(0, Math.min(12, this.surfacePenetration(this.bodyPointToWorld(LEG_POINTS[1])) + 4));
    const leftFootY = 30 - leftCompression;
    const rightFootY = 30 - rightCompression;

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
    ctx.lineTo(-28, leftFootY);
    ctx.moveTo(16, 13);
    ctx.lineTo(28, rightFootY);
    ctx.stroke();

    ctx.strokeStyle = '#aeb5b7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, 13);
    ctx.lineTo(-28, leftFootY);
    ctx.moveTo(16, 13);
    ctx.lineTo(28, rightFootY);
    ctx.moveTo(-28, leftFootY);
    ctx.lineTo(-38, leftFootY);
    ctx.moveTo(28, rightFootY);
    ctx.lineTo(38, rightFootY);
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
    for (const remote of this.multiplayer.remotePlayers.values()) {
      if (remote.bodyId !== this.currentBody().id || now - remote.updatedAt > 5000) continue;
      const p = this.worldToScreen(remote);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(remote.angle + this.camera.rotation);
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

    for (const portal of this.portals) {
      const p = toMap(portal);
      ctx.strokeStyle = portal.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, portal.id === 'return' ? 6 : 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = portal.color;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(portal.id === 'return' ? 'RETURN' : 'PORTAL', p.x + 9, p.y - 7);
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
    const distance = this.toMeters(this.surfaceDistance(this.angleOf(this.lander), target.angle));
    const localTwr = (stats.maxTwr * MOON_GRAVITY_MPS2 / body.gravityMps2).toFixed(2);
    const objective = this.currentObjectiveText(localTwr);

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
    this.hudElements['target-info'].textContent = `${target.name} ${distance.toFixed(0)}m | ${body.gravityMps2.toFixed(2)} m/s2 | ENG ${this.engineStatus()}`;
    this.hudElements['objective-title'].textContent = objective.title;
    this.hudElements['objective-detail'].textContent = objective.detail;
    this.hudElements['perf-fps'].textContent = `${this.currentFps}`;
    this.hudElements['perf-entities'].textContent = `${1 + this.multiplayer.remotePlayers.size + this.projectiles.length + this.particles.length}`;
    this.hudElements['perf-draw'].textContent = this.multiplayer.isConnected() ? '2D NET' : '2D';

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

    for (const portal of this.portals) {
      const p = toMap(portal);
      ctx.strokeStyle = portal.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, portal.id === 'return' ? 4 : 5, 0, Math.PI * 2);
      ctx.stroke();
      if (portal.id !== 'return') {
        ctx.fillStyle = portal.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = portal.color;
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(portal.id === 'return' ? 'R' : 'VJ', p.x, p.y - 7);
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

  private currentObjectiveText(localTwr: string) {
    const target = this.targetPad();
    const body = this.currentBody();
    const orbital = Math.sqrt(this.gravity() * Math.max(1, Math.hypot(this.lander.x, this.lander.y)));
    return objectiveText({
      phase: this.objectivePhase,
      targetName: target.name,
      body,
      lander: LANDERS[this.selectedLander],
      localTwr,
      landingSafety: this.landingSafetyColor().label,
      orbitalSpeedMps: this.toMetersPerSecond(orbital),
      currentSpeedMps: this.toMetersPerSecond(Math.hypot(this.lander.vx, this.lander.vy)),
    });
  }

  private engineStatus() {
    return resolveEngineStatus({
      destroyed: this.destroyed,
      landed: this.landed,
      fuel: this.lander.fuel,
    });
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

  private drawDebugOverlay(ctx: CanvasRenderingContext2D) {
    const contacts = this.contactPoints(this.lander);
    const velocityEnd = {
      x: this.lander.x + this.lander.vx * 8,
      y: this.lander.y + this.lander.vy * 8,
    };
    const thrust = this.thrustDirection();
    const thrustEnd = {
      x: this.lander.x + thrust.x * 180,
      y: this.lander.y + thrust.y * 180,
    };
    const retroEnd = {
      x: this.lander.x - this.lander.vx * 8,
      y: this.lander.y - this.lander.vy * 8,
    };

    ctx.save();
    this.drawDebugVector(ctx, this.lander, velocityEnd, '#ffcf5a');
    this.drawDebugVector(ctx, this.lander, thrustEnd, '#84ffd3');
    this.drawDebugVector(ctx, this.lander, retroEnd, '#ff716a');
    for (const contact of contacts) {
      const p = this.worldToScreen(contact.point);
      ctx.fillStyle = contact.penetration > 0 ? '#ff716a' : '#84ffd3';
      ctx.beginPath();
      ctx.arc(p.x, p.y, contact.penetration > 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(2,8,12,0.78)';
    ctx.fillRect(14, this.height - 108, 310, 92);
    ctx.fillStyle = '#dffdf4';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    const lines = [
      `F3 DEBUG  clearance ${this.toMeters(this.minGroundClearance(this.lander)).toFixed(1)}m`,
      `engine ${this.engineStatus()}`,
      `impact ${this.lastImpactReport}`,
      `velocity ${this.toMetersPerSecond(Math.hypot(this.lander.vx, this.lander.vy)).toFixed(1)}m/s`,
      `penetration ${Math.max(0, ...contacts.map((c) => c.penetration)).toFixed(2)}u`,
    ];
    lines.forEach((line, index) => ctx.fillText(line, 24, this.height - 84 + index * 18));
    ctx.restore();
  }

  private drawDebugVector(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string) {
    const a = this.worldToScreen(from);
    const b = this.worldToScreen(to);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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
      this.startOrbitChallenge();
    };
  }

  private startOrbitChallenge() {
    const pad = this.targetPad();
    const stats = LANDERS[this.selectedLander];
    const normal = this.normalAtAngle(pad.angle);
    const tangent = { x: -normal.y, y: normal.x };
    const radius = pad.platformRadius + 160;
    this.landed = false;
    this.destroyed = false;
    this.objectivePhase = 'orbit';
    this.targetPadIndex = (this.targetPadIndex + 1) % this.pads.length;
    this.lander.x = normal.x * radius;
    this.lander.y = normal.y * radius;
    this.lander.vx = tangent.x * 16;
    this.lander.vy = tangent.y * 16;
    this.lander.angle = this.localUpAngleAt(pad.angle);
    this.lander.angularVelocity = 0;
    this.lander.fuel = Math.max(this.lander.fuel, stats.fuel * 0.72);
    this.input.state.throttle = 0;
    this.camera.x = this.lander.x;
    this.camera.y = this.lander.y;
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

  private rebuildTerrainCache() {
    this.terrainSamples = rebuildTerrainCache({
      sampleCount: TERRAIN_SAMPLE_COUNT,
      body: this.currentBody(),
      bodyRadius: this.bodyRadiusUnits(),
      pads: this.pads,
    });
  }

  private padPlatformRadius(angle: number, radius: number) {
    return padPlatformRadius(angle, radius, this.currentBody(), this.bodyRadiusUnits());
  }

  private rawTerrainRadiusAtAngle(angle: number) {
    return rawTerrainRadiusAtAngle(angle, this.currentBody(), this.bodyRadiusUnits(), this.pads);
  }

  private terrainRadiusAtAngle(angle: number) {
    return terrainRadiusAtAngle(angle, this.terrainSamples, () => this.rawTerrainRadiusAtAngle(angle));
  }

  private baseTerrainRadiusAtAngle(angle: number) {
    return baseTerrainRadiusAtAngle(angle, this.currentBody(), this.bodyRadiusUnits());
  }

  private padAtPoint(point: Vec2) {
    const angle = this.angleOf(point);
    return this.pads.find((pad) => this.surfaceDistance(angle, pad.angle) <= pad.radius);
  }

  private targetPad() {
    return this.pads[this.targetPadIndex] ?? this.pads[0];
  }

  private thrustDirection() {
    return this.visualNoseDirection();
  }

  private forwardDirection() {
    return this.visualNoseDirection();
  }

  private visualNoseDirection() {
    const nose = this.bodyPointToWorld({ x: 0, y: -42 });
    return normalizedDirection(this.lander, nose);
  }

  private currentBody() {
    return BODIES[this.selectedBodyIndex] ?? BODIES[0];
  }

  private gravity() {
    return this.currentBody().gravityMps2 / WORLD_METERS_PER_UNIT;
  }

  private bodyRadiusUnits() {
    return this.currentBody().gameRadiusM / 10;
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
    return normalAtAngle(angle);
  }

  private normalAtPoint(point: Vec2) {
    const length = Math.hypot(point.x, point.y) || 1;
    return { x: point.x / length, y: point.y / length };
  }

  private localFrame(point: Vec2) {
    const normal = this.normalAtPoint(point);
    return {
      normal,
      tangent: { x: -normal.y, y: normal.x },
    };
  }

  private localUpAngleAt(angle: number) {
    const n = this.normalAtAngle(angle);
    return Math.atan2(n.x, n.y);
  }

  private surfacePoint(angle: number, offset = 0) {
    return surfacePoint(angle, this.terrainRadiusAtAngle(angle), offset);
  }

  private baseSurfacePoint(angle: number, offset = 0) {
    return surfacePoint(angle, this.baseTerrainRadiusAtAngle(angle), offset);
  }

  private surfacePenetration(point: Vec2) {
    return this.terrainRadiusAtAngle(this.angleOf(point)) - Math.hypot(point.x, point.y);
  }

  private surfaceDistance(a: number, b: number) {
    return surfaceDistance(a, b, this.bodyRadiusUnits());
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
    return Math.max(0, this.minGroundClearance(this.lander));
  }

  private minGroundClearance(snapshot: LanderSnapshot) {
    const points = [
      ...LEG_POINTS,
      { x: 0, y: HULL_BOTTOM },
    ].map((point) => this.bodyPointToWorld(point, snapshot));
    return Math.min(...points.map((point) => -this.surfacePenetration(point)));
  }

  private contactPoints(snapshot: LanderSnapshot): ContactPoint[] {
    const bodyPoints: Array<{ label: ContactPoint['label']; bodyPoint: Vec2 }> = [
      { label: 'left-leg', bodyPoint: LEG_POINTS[0] },
      { label: 'right-leg', bodyPoint: LEG_POINTS[1] },
      { label: 'hull', bodyPoint: { x: 0, y: HULL_BOTTOM } },
    ];

    return bodyPoints.map(({ label, bodyPoint }) => {
      const point = this.bodyPointToWorld(bodyPoint, snapshot);
      const normal = this.normalAtAngle(this.angleOf(point));
      const tangent = { x: -normal.y, y: normal.x };
      const radius = { x: point.x - snapshot.x, y: point.y - snapshot.y };
      const footVelocity = {
        x: snapshot.vx - snapshot.angularVelocity * radius.y,
        y: snapshot.vy + snapshot.angularVelocity * radius.x,
      };
      const radialVelocity = footVelocity.x * normal.x + footVelocity.y * normal.y;
      const tangentVelocity = footVelocity.x * tangent.x + footVelocity.y * tangent.y;
      return {
        label,
        point,
        bodyPoint,
        penetration: this.surfacePenetration(point),
        normal,
        tangent,
        footVelocity,
        radialVelocity,
        tangentVelocity,
      };
    });
  }

  private bodyPointToWorld(point: Vec2, snapshot: LanderSnapshot = this.lander) {
    return bodyPointToWorldInFrame(point, snapshot);
  }

  private legFootPoints(snapshot: LanderSnapshot = this.lander) {
    return LEG_POINTS.map((point) => this.bodyPointToWorld(point, snapshot));
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
    const dx = point.x - this.camera.x;
    const dy = point.y - this.camera.y;
    const cos = Math.cos(this.camera.rotation);
    const sin = Math.sin(this.camera.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      x: rx * this.camera.zoom + this.width / 2,
      y: this.height * 0.62 - ry * this.camera.zoom,
    };
  }

  private enableAudio() {
    this.audio.enable();
    const button = document.getElementById('audio-toggle');
    if (button) button.textContent = 'AUDIO ON';
  }

  private updateAudio() {
    const throttle = (!this.destroyed && !this.landed && this.lander.fuel > 0) ? this.input.state.throttle : 0;
    this.audio.updateEngine(throttle);
  }

  private playBurst(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.18) {
    this.audio.playBurst(frequency, duration, type, volume);
  }

  private playLandingTone() {
    this.audio.playLandingTone();
  }
}
