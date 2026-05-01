/**
 * Game - main game class tying together WASM physics, renderer, controls, HUD
 */

import * as THREE from 'three';
import { Renderer } from './renderer';
import { InputManager } from './controls';
import { CameraSystem, CameraMode } from './camera';
import { loadPhysics, WasmSimulation, EntityType, SasMode, EventType } from './wasm-bridge';
import { NetworkClient } from './network';

interface LandingPadInfo {
  id: number;
  name: string;
  position: [number, number, number];
  radius: number;
}

type LanderEntityType =
  | typeof EntityType.LANDER_SCOUT
  | typeof EntityType.LANDER_STANDARD
  | typeof EntityType.LANDER_HEAVY
  | typeof EntityType.LANDER_INTERCEPTOR;

export class Game {
  private renderer!: Renderer;
  private input!: InputManager;
  private camera!: CameraSystem;
  private sim!: WasmSimulation;
  private network!: NetworkClient;

  private playerId = 0;
  private serverEntityId = -1;
  private running = false;
  private lastTime = 0;
  private frameCount = 0;
  private multiplayer = false;
  private landed = false;
  private gameOver = false;
  private score = 0;
  private landingStreak = 0;
  private lastNonMapCameraMode = CameraMode.Auto;
  private selectedLanderType: LanderEntityType = EntityType.LANDER_STANDARD;
  private remoteRenderIds = new Set<number>();

  private pads: LandingPadInfo[] = [];
  private targetPadIndex = 0;
  private hudElements: Record<string, HTMLElement> = {};
  private minimapCanvas: HTMLCanvasElement | null = null;
  private navballCanvas: HTMLCanvasElement | null = null;
  private audioContext: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private lastWarningAt = 0;

  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private currentFps = 60;

  async init(statusEl: HTMLElement) {
    statusEl.textContent = 'Loading physics engine...';
    const WasmSim = await loadPhysics(statusEl);
    this.sim = new WasmSim();

    statusEl.textContent = 'Initializing renderer...';
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.camera = new CameraSystem(this.renderer.camera);

    this.cacheHudElements();
    this.setupUiBindings();

    statusEl.textContent = 'Spawning world...';
    this.setupWorld();
    this.setupNetwork();
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
    document.getElementById('audio-toggle')?.addEventListener('click', () => {
      this.enableAudio();
    });

    document.getElementById('controls-toggle')?.addEventListener('click', () => {
      document.getElementById('controls-panel')?.classList.toggle('visible');
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH' || event.code === 'Slash') {
        document.getElementById('controls-panel')?.classList.toggle('visible');
      }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        const landerTypes: LanderEntityType[] = [
          EntityType.LANDER_SCOUT,
          EntityType.LANDER_STANDARD,
          EntityType.LANDER_HEAVY,
          EntityType.LANDER_INTERCEPTOR,
        ];
        this.selectedLanderType = landerTypes[Number(event.code.replace('Digit', '')) - 1] ?? EntityType.LANDER_STANDARD;
        if (this.gameOver || this.landed) return;
        this.spawnPlayer();
      }
    });
  }

  private setupNetwork() {
    this.network = new NetworkClient();

    this.network.onWelcome = (data) => {
      this.multiplayer = true;
      this.network.sendSpawn({
        landerType: this.selectedLanderType,
        altitude: 850,
      });
      console.log(`[game] Connected as player ${data.playerId}`);
    };

    this.network.onSpawned = (data) => {
      this.serverEntityId = data.entityId ?? -1;
    };

    this.network.onState = (state) => {
      const nextRemoteRenderIds = new Set<number>();

      for (const entity of state.entities) {
        if (entity.id === this.serverEntityId) continue;

        const renderId = entity.id + 100000;
        nextRemoteRenderIds.add(renderId);

        if (entity.type >= EntityType.LANDER_SCOUT && entity.type <= EntityType.LANDER_INTERCEPTOR) {
          this.renderer.updateLander(
            renderId,
            [entity.x, entity.y, entity.z],
            [entity.qx, entity.qy, entity.qz, entity.qw],
            entity.throttle,
            entity.type,
          );
        } else if (entity.type === EntityType.PROJECTILE) {
          this.renderer.updateProjectile(renderId, [entity.x, entity.y, entity.z]);
        }
      }

      for (const renderId of this.remoteRenderIds) {
        if (!nextRemoteRenderIds.has(renderId)) this.renderer.removeEntity(renderId);
      }
      this.remoteRenderIds = nextRemoteRenderIds;
    };

    this.network.onDeath = (cause) => this.showDeathScreen(cause);
    this.network.onLanded = (data) => {
      this.score = data.totalScore ?? this.score + (data.score ?? 0);
      this.showLandingScreen(data.score ?? 0, data.padId ?? 0, 0, 0);
    };
    this.network.onDisconnect = () => {
      this.multiplayer = false;
      for (const renderId of this.remoteRenderIds) this.renderer.removeEntity(renderId);
      this.remoteRenderIds.clear();
      console.log('[game] Disconnected - running in offline mode');
    };

    void this.tryConnectNetwork();
  }

  private async tryConnectNetwork() {
    const onlineRequested = new URLSearchParams(window.location.search).has('online');
    if (!onlineRequested) return;

    const host = window.location.hostname;
    const probeUrl = `http://${host}:3001`;

    try {
      await fetch(probeUrl, { mode: 'no-cors', cache: 'no-store' });
      this.network.connect();
    } catch {
      this.multiplayer = false;
    }
  }

  private setupWorld() {
    const moonRadius = this.sim.moon_radius();
    this.pads = [
      { id: 0, name: 'Alpha', position: this.surfacePoint(moonRadius, 12, 8), radius: 55 },
      { id: 1, name: 'Ridge', position: this.surfacePoint(moonRadius, 28, 56), radius: 34 },
      { id: 2, name: 'Mare', position: this.surfacePoint(moonRadius, -24, 142), radius: 32 },
      { id: 3, name: 'Needle', position: this.surfacePoint(moonRadius, 36, 222), radius: 18 },
      { id: 4, name: 'Faraday', position: this.surfacePoint(moonRadius, -38, 304), radius: 24 },
    ];

    for (const pad of this.pads) {
      this.sim.add_pad(pad.id, pad.position[0], pad.position[1], pad.position[2], pad.radius, true);
      this.renderer.createPadMarker(pad.position[0], pad.position[1], pad.position[2], pad.radius);
    }
  }

  private spawnPlayer() {
    if (this.sim?.is_active(this.playerId)) {
      this.sim.destroy_entity(this.playerId);
      this.renderer.removeEntity(this.playerId);
    }

    const moonRadius = this.sim.moon_radius();
    const spawnAlt = 650 + Math.random() * 650;
    this.targetPadIndex = Math.floor(Math.random() * this.pads.length);
    const target = this.pads[this.targetPadIndex];
    const normal = new THREE.Vector3(...target.position).normalize();
    const tangentSeed = Math.abs(normal.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(tangentSeed, normal).normalize();
    const north = new THREE.Vector3().crossVectors(normal, east).normalize();
    const angle = Math.random() * Math.PI * 2;
    const lateral = east.multiplyScalar(Math.cos(angle)).add(north.multiplyScalar(Math.sin(angle)));
    const spawnPos = normal.clone().multiplyScalar(moonRadius + spawnAlt).add(lateral.multiplyScalar(420 + Math.random() * 280));
    const descent = normal.clone().multiplyScalar(-(4 + Math.random() * 4));
    const drift = lateral.normalize().multiplyScalar(-(1.5 + Math.random() * 2.5));
    this.playerId = this.sim.spawn_lander(
      this.selectedLanderType,
      spawnPos.x,
      spawnPos.y,
      spawnPos.z,
      descent.x + drift.x,
      descent.y + drift.y,
      descent.z + drift.z,
    );
    const upright = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.sim.set_orientation(this.playerId, upright.x, upright.y, upright.z, upright.w);

    this.landed = false;
    this.gameOver = false;
    this.input.state.throttle = 0.28;
    this.input.state.sasMode = SasMode.STABILITY;
    this.input.state.rcsMode = false;

    const pos = this.sim.get_position(this.playerId);
    this.camera.snapTo(new THREE.Vector3(pos[0], pos[1], pos[2]), normal);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  private loop(time: number) {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator >= 1.0) {
      this.currentFps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsAccumulator = 0;
    }

    this.input.update();
    this.updateCameraModeFromInput();
    this.updateTargetFromInput();

    if (!this.landed && !this.gameOver && this.sim.is_active(this.playerId)) {
      const s = this.input.state;
      const throttle = s.brakeAssist ? Math.max(s.throttle, 0.62) : s.throttle;
      const sasMode = s.brakeAssist ? SasMode.RETROGRADE : s.sasMode;
      this.sim.apply_input(
        this.playerId,
        throttle,
        s.pitch,
        s.yaw,
        s.roll,
        s.translateX,
        s.translateY,
        s.translateZ,
        sasMode,
        s.fire,
        s.boost,
        s.rcsMode,
        s.fineControl,
      );

      if (this.multiplayer && this.network.connected) {
        this.network.sendInput({
          throttle,
          pitch: s.pitch,
          yaw: s.yaw,
          roll: s.roll,
          translateX: s.translateX,
          translateY: s.translateY,
          translateZ: s.translateZ,
          sasMode,
          fire: s.fire,
          boost: s.boost,
          rcsMode: s.rcsMode,
          fineControl: s.fineControl,
        });
      }
    }

    const steps = Math.max(1, Math.round(dt * 60));
    for (let i = 0; i < steps; i++) {
      this.sim.tick();
      this.processEvents();
    }

    this.updateVisuals(dt);
    this.updateTrajectoryPreview();
    this.updateCamera(dt);
    this.updateHUD();
    this.updateAudio();

    if (this.frameCount % 30 === 0) {
      this.updatePerfMonitor();
    }

    this.renderer.render();
    this.frameCount++;
    requestAnimationFrame((t) => this.loop(t));
  }

  private updateCameraModeFromInput() {
    if (this.input.state.cameraCycle) {
      const mode = this.camera.cycleMode();
      if (mode !== CameraMode.Orbital) this.lastNonMapCameraMode = mode;
      this.input.state.cameraCycle = false;
    }

    if (this.input.state.mapView && this.camera.getMode() !== CameraMode.Orbital) {
      this.lastNonMapCameraMode = this.camera.getMode();
      this.camera.setMode(CameraMode.Orbital);
    } else if (!this.input.state.mapView && this.camera.getMode() === CameraMode.Orbital) {
      this.camera.setMode(this.lastNonMapCameraMode);
    }
  }

  private updateTargetFromInput() {
    if (!this.input.state.targetCycle) return;
    this.targetPadIndex = (this.targetPadIndex + 1) % this.pads.length;
    this.input.state.targetCycle = false;
  }

  private processEvents() {
    if (this.gameOver) {
      this.sim.read_events();
      return;
    }

    const events = this.sim.read_events();
    let offset = 0;

    while (offset < events.length) {
      const type = events[offset];

      switch (type) {
        case EventType.CRASH: {
          const entity = events[offset + 1];
          if (entity === this.playerId && !this.landed) {
            this.renderer.spawnImpactFx([events[offset + 2], events[offset + 3], events[offset + 4]]);
            this.playBurst(62, 0.45, 'sawtooth');
            this.showDeathScreen('Crashed into terrain');
          }
          offset += 6;
          break;
        }
        case EventType.DESTROYED: {
          const entity = events[offset + 1];
          if (entity === this.playerId) {
            this.showDeathScreen('Lander destroyed');
          } else {
            this.renderer.removeEntity(entity);
          }
          offset += 4;
          break;
        }
        case EventType.LANDING: {
          const entity = events[offset + 1];
          if (entity === this.playerId && !this.landed) {
            const padId = events[offset + 2];
            const touchdownVelocity = events[offset + 3];
            const precision = events[offset + 4];
            const fuelRemaining = events[offset + 5];
            const score = this.computeLandingScore(precision, touchdownVelocity, fuelRemaining);
            this.score += score;
            this.landingStreak++;
            this.renderer.spawnImpactFx(this.sim.get_position(this.playerId), 0x84ffd3);
            this.playLandingTone();
            this.showLandingScreen(score, padId, precision, touchdownVelocity);
          }
          offset += 6;
          break;
        }
        case EventType.PROJECTILE_FIRED: {
          const owner = events[offset + 1];
          if (owner === this.playerId) {
            const pos = this.sim.get_position(this.playerId);
            const orientation = this.sim.get_orientation(this.playerId);
            const ori = new THREE.Quaternion(orientation[0], orientation[1], orientation[2], orientation[3]);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ori);
            this.renderer.spawnMuzzleFx(pos, [dir.x, dir.y, dir.z]);
            this.playBurst(420, 0.08, 'square');
          }
          offset += 3;
          break;
        }
        case EventType.PROJECTILE_EXPIRED: {
          const projectile = events[offset + 1];
          this.renderer.removeEntity(projectile);
          offset += 2;
          break;
        }
        case EventType.DAMAGE: {
          offset += 5;
          break;
        }
        case EventType.COLLISION: {
          offset += 4;
          break;
        }
        case EventType.SPAWNED: {
          offset += 3;
          break;
        }
        default:
          offset += 1;
          break;
      }
    }
  }

  private computeLandingScore(precision: number, touchdownVelocity: number, fuelRemaining: number): number {
    const target = this.pads[this.targetPadIndex] ?? this.pads[0];
    const precisionScore = Math.max(0, 220 * (1 - precision / Math.max(1, target.radius)));
    const speedScore = Math.max(0, 140 * (1 - touchdownVelocity / 5));
    const fuelScore = Math.max(0, fuelRemaining * 160);
    const streakScore = Math.min(150, this.landingStreak * 25);
    return Math.round(150 + precisionScore + speedScore + fuelScore + streakScore);
  }

  private updateVisuals(dt: number) {
    const states = this.sim.read_states(1000);
    const ids = this.sim.active_entity_ids(1000);
    const floatsPerEntity = 15;
    const count = Math.min(ids.length, states.length / floatsPerEntity);
    const activeIds = new Set<number>();

    for (let i = 0; i < count; i++) {
      const offset = i * floatsPerEntity;
      const id = ids[i];
      const active = states[offset + 14];
      if (active < 0.5) continue;

      const position = [states[offset], states[offset + 1], states[offset + 2]];
      const orientation = [states[offset + 6], states[offset + 7], states[offset + 8], states[offset + 9]];
      const throttle = states[offset + 12];
      const entityType = states[offset + 13];

      activeIds.add(id);

      if (entityType === EntityType.PROJECTILE) {
        this.renderer.updateProjectile(id, position);
      } else if (entityType >= EntityType.LANDER_SCOUT && entityType <= EntityType.LANDER_INTERCEPTOR) {
        this.renderer.updateLander(id, position, orientation, throttle, entityType);
      }
    }

    for (const id of this.remoteRenderIds) activeIds.add(id);
    this.renderer.pruneEntities(activeIds);
    this.renderer.update(dt);
  }

  private updateCamera(dt: number) {
    if (!this.sim.is_active(this.playerId)) return;

    const pos = this.sim.get_position(this.playerId);
    const ori = this.sim.get_orientation(this.playerId);
    const vel = this.sim.get_velocity(this.playerId);
    const normal = this.sim.get_surface_normal(pos[0], pos[1], pos[2]);
    const target = this.pads[this.targetPadIndex] ?? this.pads[0];

    this.camera.update(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion(ori[0], ori[1], ori[2], ori[3]),
      new THREE.Vector3(vel[0], vel[1], vel[2]),
      this.input.state.cameraOrbitX,
      this.input.state.cameraOrbitY,
      this.input.state.cameraPanX,
      this.input.state.cameraPanY,
      this.input.state.cameraZoom,
      dt,
      new THREE.Vector3(normal[0], normal[1], normal[2]),
      new THREE.Vector3(target.position[0], target.position[1], target.position[2]),
    );

    this.input.state.cameraZoom = 0;
    this.input.state.cameraPanX = 0;
    this.input.state.cameraPanY = 0;
  }

  private updateHUD() {
    if (!this.sim.is_active(this.playerId)) return;

    const pos = this.sim.get_position(this.playerId);
    const vel = this.sim.get_velocity(this.playerId);
    const health = this.sim.get_health(this.playerId);
    const fuelPct = this.sim.get_fuel_pct(this.playerId);
    const orientation = this.sim.get_orientation(this.playerId);
    const altitude = this.sim.get_altitude(pos[0], pos[1], pos[2]);
    const normal = this.sim.get_surface_normal(pos[0], pos[1], pos[2]);

    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    const verticalVel = vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];
    const horizontalVel = Math.sqrt(Math.max(0, speed * speed - verticalVel * verticalVel));

    const throttle = Math.round(this.input.state.throttle * 100);
    this.hudElements['score'].textContent = `${this.score}`;
    this.hudElements['rank'].textContent = this.network?.statusLabel ?? 'OFFLINE';
    this.hudElements['throttle-fill'].style.height = `${throttle}%`;
    this.hudElements['throttle-label'].textContent = `${throttle}%`;

    this.hudElements['altitude'].textContent = altitude.toFixed(0);
    this.hudElements['velocity'].textContent = speed.toFixed(1);
    this.hudElements['vel-vertical'].textContent = verticalVel.toFixed(1);
    this.hudElements['vel-horizontal'].textContent = horizontalVel.toFixed(1);

    const fuelPct100 = Math.max(0, Math.min(100, Math.round(fuelPct * 100)));
    this.hudElements['fuel-fill'].style.height = `${fuelPct100}%`;
    this.hudElements['fuel-label'].textContent = `${fuelPct100}%`;

    const hpPct = Math.max(0, Math.min(100, Math.round(health)));
    this.hudElements['hp-fill'].style.width = `${hpPct}%`;
    this.hudElements['hp-text'].textContent = `${hpPct}/100`;

    const sasNames = ['OFF', 'STB', 'PRO', 'RET', 'RAD-', 'RAD+', 'TGT'];
    const sasEl = this.hudElements['sas-indicator'];
    sasEl.textContent = `SAS ${sasNames[this.input.state.sasMode]}`;
    sasEl.classList.toggle('active', this.input.state.sasMode > 0);

    const rcsEl = this.hudElements['rcs-indicator'];
    rcsEl.textContent = this.input.state.rcsMode ? 'RCS ON' : 'RCS OFF';
    rcsEl.classList.toggle('active', this.input.state.rcsMode);

    const target = this.pads[this.targetPadIndex] ?? this.pads[0];
    const distance = Math.hypot(
      pos[0] - target.position[0],
      pos[1] - target.position[1],
      pos[2] - target.position[2],
    );
    this.hudElements['target-info'].textContent = `${target.name} ${distance.toFixed(0)}m`;
    this.hudElements['objective-title'].textContent = `LAND ${target.name.toUpperCase()}`;
    this.hudElements['objective-detail'].textContent = `touchdown < 5 m/s | ${this.landerName()} | Tab target | 1-4 lander`;

    this.drawMinimap(pos, target);
    this.drawNavball(pos, vel, normal, orientation);
  }

  private updateTrajectoryPreview() {
    if (!this.sim.is_active(this.playerId)) {
      this.renderer.updateTrajectory([]);
      return;
    }

    const position = new THREE.Vector3(...this.sim.get_position(this.playerId));
    const velocity = new THREE.Vector3(...this.sim.get_velocity(this.playerId));
    const points: THREE.Vector3[] = [];
    const moonRadius = this.sim.moon_radius();
    const gm = this.sim.moon_gm();
    const dt = 0.45;

    for (let i = 0; i < 42; i++) {
      const r = Math.max(1, position.length());
      const accel = position.clone().normalize().multiplyScalar(-gm / (r * r));
      velocity.add(accel.multiplyScalar(dt));
      position.add(velocity.clone().multiplyScalar(dt));
      points.push(position.clone());
      if (position.length() <= moonRadius + 4) break;
    }

    this.renderer.updateTrajectory(points);
  }

  private drawMinimap(pos: number[], target: LandingPadInfo) {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const c = w / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2, 8, 12, 0.85)';
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 255, 208, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(130, 255, 208, 0.12)';
    for (let r = 24; r < c; r += 24) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const basis = this.surfaceBasis(target.position);
    const scale = 0.11;
    const delta = [
      pos[0] - target.position[0],
      pos[1] - target.position[1],
      pos[2] - target.position[2],
    ];
    const px = c + this.dot(delta, basis.east) * scale;
    const py = c - this.dot(delta, basis.north) * scale;

    ctx.fillStyle = '#84ffd3';
    ctx.beginPath();
    ctx.arc(c, c, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(Math.max(10, Math.min(w - 10, px)), Math.max(10, Math.min(h - 10, py)));
    ctx.stroke();

    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.arc(Math.max(8, Math.min(w - 8, px)), Math.max(8, Math.min(h - 8, py)), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawNavball(pos: number[], vel: number[], normal: number[], orientation: number[]) {
    if (!this.navballCanvas) return;
    const ctx = this.navballCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.navballCanvas.width;
    const h = this.navballCanvas.height;
    const c = w / 2;
    const radius = c - 5;
    const q = new THREE.Quaternion(orientation[0], orientation[1], orientation[2], orientation[3]);
    const inv = q.clone().invert();
    const worldNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
    const basis = this.surfaceBasis(pos);
    const east = new THREE.Vector3(basis.east[0], basis.east[1], basis.east[2]);
    const north = new THREE.Vector3(basis.north[0], basis.north[1], basis.north[2]);
    const forwardFlat = shipForward.clone().sub(worldNormal.clone().multiplyScalar(shipForward.dot(worldNormal)));
    if (forwardFlat.lengthSq() < 0.0001) forwardFlat.copy(north);
    else forwardFlat.normalize();
    const heading = Math.atan2(forwardFlat.dot(east), forwardFlat.dot(north));
    const pitch = Math.asin(Math.max(-1, Math.min(1, shipForward.dot(worldNormal))));
    const roll = Math.atan2(shipRight.dot(worldNormal), shipUp.dot(worldNormal));
    const vertical = vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-roll);
    ctx.translate(0, pitch * 70);

    const sky = ctx.createLinearGradient(0, -radius * 2, 0, 0);
    sky.addColorStop(0, '#1d63b0');
    sky.addColorStop(1, '#16385f');
    ctx.fillStyle = sky;
    ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 2);

    const ground = ctx.createLinearGradient(0, 0, 0, radius * 2);
    ground.addColorStop(0, '#7a6043');
    ground.addColorStop(1, '#2d2118');
    ctx.fillStyle = ground;
    ctx.fillRect(-radius * 2, 0, radius * 4, radius * 2);

    ctx.strokeStyle = '#f2f2ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 2, 0);
    ctx.lineTo(radius * 2, 0);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1;
    for (let p = -60; p <= 60; p += 15) {
      if (p === 0) continue;
      const y = -p * 1.12;
      const half = p % 30 === 0 ? 32 : 18;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }

    const headingSpacing = 24;
    const headingOffset = (heading / (Math.PI * 2)) * headingSpacing * 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = -18; i <= 18; i++) {
      const x = i * headingSpacing - ((headingOffset % headingSpacing) + headingSpacing) % headingSpacing;
      const major = i % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(x, -radius * 1.6);
      ctx.lineTo(x, radius * 1.6);
      ctx.stroke();
      if (major && Math.abs(x) < radius * 1.65) {
        const degrees = (((Math.round((headingOffset / headingSpacing) + i) * 30) % 360) + 360) % 360;
        ctx.fillText(`${degrees}`, x, -radius * 0.52);
      }
    }

    ctx.restore();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();

    ctx.strokeStyle = '#f2f2ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c - 28, c);
    ctx.lineTo(c - 9, c);
    ctx.moveTo(c + 9, c);
    ctx.lineTo(c + 28, c);
    ctx.moveTo(c, c - 8);
    ctx.lineTo(c, c + 8);
    ctx.stroke();

    const inputX = this.input.state.rcsMode ? this.input.state.translateX : this.input.state.yaw;
    const inputY = this.input.state.rcsMode ? -this.input.state.translateZ : this.input.state.pitch;
    const cueX = c + inputX * radius * 0.38;
    const cueY = c + inputY * radius * 0.38;
    ctx.strokeStyle = '#ffcf5a';
    ctx.fillStyle = 'rgba(255, 207, 90, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(cueX, cueY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cueX, cueY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (Math.abs(this.input.state.roll) > 0.01) {
      ctx.strokeStyle = '#ffcf5a';
      ctx.beginPath();
      const start = -Math.PI / 2;
      const end = start + this.input.state.roll * Math.PI * 0.42;
      ctx.arc(c, c, radius * 0.78, start, end, this.input.state.roll < 0);
      ctx.stroke();
    }

    const velocity = new THREE.Vector3(vel[0], vel[1], vel[2]);
    if (velocity.lengthSq() > 0.1) {
      const localVel = velocity.normalize().applyQuaternion(inv);
      const marker = this.projectNavballVector(localVel, radius * 0.74);
      this.drawNavMarker(ctx, c + marker.x, c + marker.y, vertical < -5 ? '#ff716a' : '#ffcf5a', true);

      const retro = localVel.clone().multiplyScalar(-1);
      const retroMarker = this.projectNavballVector(retro, radius * 0.74);
      this.drawNavMarker(ctx, c + retroMarker.x, c + retroMarker.y, '#84ffd3', false);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.stroke();

    const headingDeg = ((heading * 180 / Math.PI) + 360) % 360;
    ctx.fillStyle = '#84ffd3';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(headingDeg).toString().padStart(3, '0')}`, c, c - radius + 14);
  }

  private projectNavballVector(v: THREE.Vector3, scale: number) {
    const zScale = Math.max(0.28, 1 - Math.max(0, v.z) * 0.55);
    return {
      x: Math.max(-scale, Math.min(scale, v.x * scale * zScale)),
      y: Math.max(-scale, Math.min(scale, -v.y * scale * zScale)),
    };
  }

  private drawNavMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, filled: boolean) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    if (filled) ctx.fill();
    else ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
  }

  private showDeathScreen(cause: string) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.landingStreak = 0;

    const deathScreen = document.getElementById('death-screen')!;
    const deathInfo = document.getElementById('death-info')!;
    deathInfo.textContent = cause;
    deathScreen.classList.add('visible');

    document.getElementById('respawn-btn')!.onclick = () => {
      deathScreen.classList.remove('visible');
      this.spawnPlayer();
      if (this.multiplayer && this.network.connected) {
        this.network.sendSpawn({ landerType: this.selectedLanderType, altitude: 850 });
      }
    };
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
    lowpass.frequency.value = 180;
    this.engineOsc.connect(lowpass);
    lowpass.connect(this.engineGain);
    this.engineOsc.start();

    const button = document.getElementById('audio-toggle');
    if (button) button.textContent = 'AUDIO ON';
  }

  private updateAudio() {
    if (!this.audioContext || !this.engineGain || !this.engineOsc || !this.sim.is_active(this.playerId)) return;

    const now = this.audioContext.currentTime;
    const throttle = this.input.state.throttle;
    this.engineGain.gain.setTargetAtTime(throttle > 0.01 ? 0.035 + throttle * 0.16 : 0.0001, now, 0.035);
    this.engineOsc.frequency.setTargetAtTime(38 + throttle * 72 + (this.input.state.boost ? 20 : 0), now, 0.04);

    const pos = this.sim.get_position(this.playerId);
    const vel = this.sim.get_velocity(this.playerId);
    const normal = this.sim.get_surface_normal(pos[0], pos[1], pos[2]);
    const altitude = this.sim.get_altitude(pos[0], pos[1], pos[2]);
    const vertical = vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];
    const warningDue = performance.now() - this.lastWarningAt > 850;
    if (altitude < 140 && vertical < -8 && warningDue && !this.landed && !this.gameOver) {
      this.lastWarningAt = performance.now();
      this.playBurst(880, 0.07, 'sine', 0.13);
      setTimeout(() => this.playBurst(660, 0.06, 'sine', 0.1), 90);
    }
  }

  private playBurst(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.18,
  ) {
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

  private showLandingScreen(score: number, padId: number, precision: number, touchdownVelocity: number) {
    this.landed = true;
    const screen = document.getElementById('landing-screen')!;
    const scoreEl = document.getElementById('landing-score')!;
    const detailEl = document.getElementById('landing-detail')!;
    const continueBtn = document.getElementById('continue-btn')!;
    const pad = this.pads.find((p) => p.id === padId) ?? this.pads[0];

    scoreEl.textContent = `+${score}`;
    detailEl.textContent = `${pad.name} | ${precision.toFixed(1)}m | ${touchdownVelocity.toFixed(1)} m/s`;
    screen.classList.add('visible');

    continueBtn.onclick = () => {
      screen.classList.remove('visible');
      this.targetPadIndex = 0;
      this.spawnPlayer();
    };
  }

  private updatePerfMonitor() {
    const perf = this.renderer.getPerfInfo();
    this.hudElements['perf-fps'].textContent = `${this.currentFps}`;
    this.hudElements['perf-entities'].textContent = `${this.sim.active_entity_count()}`;
    this.hudElements['perf-draw'].textContent = `${perf.drawCalls}`;
  }

  private surfaceBasis(position: number[]) {
    const normal = new THREE.Vector3(position[0], position[1], position[2]).normalize();
    const reference = Math.abs(normal.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const east = new THREE.Vector3().crossVectors(reference, normal).normalize();
    const north = new THREE.Vector3().crossVectors(normal, east).normalize();
    return {
      east: [east.x, east.y, east.z],
      north: [north.x, north.y, north.z],
    };
  }

  private dot(a: number[], b: number[]) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  private landerName() {
    switch (this.selectedLanderType) {
      case EntityType.LANDER_SCOUT: return 'Scout';
      case EntityType.LANDER_HEAVY: return 'Heavy';
      case EntityType.LANDER_INTERCEPTOR: return 'Interceptor';
      default: return 'Standard';
    }
  }

  private surfacePoint(radius: number, latitudeDeg: number, longitudeDeg: number): [number, number, number] {
    const lat = latitudeDeg * Math.PI / 180;
    const lon = longitudeDeg * Math.PI / 180;
    return [
      radius * Math.cos(lat) * Math.cos(lon),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.sin(lon),
    ];
  }
}
