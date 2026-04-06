/**
 * Game — main game class tying together WASM physics, renderer, controls, HUD
 */

import * as THREE from 'three';
import { Renderer } from './renderer';
import { InputManager } from './controls';
import { CameraSystem, CameraMode } from './camera';
import { loadPhysics, WasmSimulation, EntityType, SasMode, EventType } from './wasm-bridge';
import { NetworkClient } from './network';

export class Game {
  private renderer!: Renderer;
  private input!: InputManager;
  private camera!: CameraSystem;
  private sim!: InstanceType<WasmSimulation>;
  private network!: NetworkClient;
  
  private playerId: number = 0;
  private running = false;
  private lastTime = 0;
  private frameCount = 0;
  private multiplayer = false;
  
  // HUD elements
  private hudElements: Record<string, HTMLElement> = {};
  
  // Perf tracking
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private currentFps = 60;

  async init(statusEl: HTMLElement) {
    // Load WASM physics
    statusEl.textContent = 'Loading physics engine (Rust/WASM)...';
    const WasmSim = await loadPhysics(statusEl);
    this.sim = new WasmSim();
    
    statusEl.textContent = 'Initializing renderer...';
    
    // Setup renderer
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    
    // Setup input
    this.input = new InputManager(canvas);
    
    // Setup camera
    this.camera = new CameraSystem(this.renderer.camera);
    
    // Cache HUD elements
    this.cacheHudElements();
    
    statusEl.textContent = 'Spawning world...';
    
    // Setup world
    this.setupWorld();
    
    // Setup network (connect to server, fall back to offline mode)
    statusEl.textContent = 'Connecting to server...';
    this.setupNetwork();
    
    // Spawn player (offline by default; online spawn happens on 'welcome')
    this.spawnPlayer();
    
    statusEl.textContent = 'Ready!';
  }

  private cacheHudElements() {
    const ids = [
      'score', 'rank', 'throttle-fill', 'throttle-label',
      'altitude', 'velocity', 'vel-vertical', 'vel-horizontal',
      'fuel-fill', 'fuel-label', 'hp-fill', 'hp-text',
      'sas-indicator', 'rcs-indicator', 'target-info',
      'perf-fps', 'perf-entities', 'perf-draw',
    ];
    for (const id of ids) {
      this.hudElements[id] = document.getElementById(id)!;
    }
  }

  private setupNetwork() {
    this.network = new NetworkClient();
    
    this.network.onWelcome = (data) => {
      console.log(`[game] Connected as player ${data.playerId}`);
      this.multiplayer = true;
      
      // Request spawn on server
      this.network.sendSpawn({
        landerType: EntityType.LANDER_STANDARD,
        altitude: 2000,
      });
    };

    this.network.onState = (state) => {
      // Update other players' visuals from server state
      for (const entity of state.entities) {
        if (entity.type >= 0 && entity.type <= 3) {
          // It's a lander
          this.renderer.updateLander(
            -1, // We don't have entity IDs from server yet — needs fix
            [entity.x, entity.y, entity.z],
            [entity.qx, entity.qy, entity.qz, entity.qw],
            entity.throttle,
            entity.type,
          );
        }
      }
    };

    this.network.onDeath = (cause) => {
      this.showDeathScreen(cause);
    };

    this.network.onLanded = (data) => {
      console.log(`[game] Landed! Score: +${data.score} (total: ${data.totalScore})`);
      // TODO: Show landing success overlay
    };

    this.network.onLeaderboard = (entries) => {
      // Update HUD leaderboard
      if (entries.length > 0) {
        const top3 = entries.slice(0, 3).map((e, i) => `${i + 1}. ${e.name}: ${e.score}`).join(' | ');
        console.log(`[game] Leaderboard: ${top3}`);
      }
    };

    this.network.onDisconnect = () => {
      this.multiplayer = false;
      console.log('[game] Disconnected — running in offline mode');
    };

    this.network.connect();
  }

  private setupWorld() {
    const moonRadius = this.sim.moon_radius();
    
    // Add some landing pads
    const padPositions = [
      [0, moonRadius, 0],                          // Equator pad
      [moonRadius * 0.5, moonRadius * 0.866, 0],   // 30° lat
      [0, moonRadius * 0.866, moonRadius * 0.5],   // 30° lat rotated
      [-moonRadius * 0.3, moonRadius * 0.95, moonRadius * 0.1], // Near pole
    ];

    for (let i = 0; i < padPositions.length; i++) {
      const [x, y, z] = padPositions[i];
      const radius = [50, 25, 25, 10][i]; // Decreasing size
      this.sim.add_pad(i, x, y, z, radius, true);
      this.renderer.createPadMarker(x, y, z, radius);
    }
  }

  private spawnPlayer() {
    const moonRadius = this.sim.moon_radius();
    
    // Spawn in low orbit above equator pad
    const spawnAlt = 2000;
    this.playerId = this.sim.spawn_lander(
      EntityType.LANDER_STANDARD,
      0, moonRadius + spawnAlt, 0,  // Position
      this.sim.circular_orbit_velocity(spawnAlt), 0, 0,  // Orbital velocity (tangential)
    );
    
    // Snap camera
    const pos = this.sim.get_position(this.playerId);
    this.camera.snapTo(new THREE.Vector3(pos[0], pos[1], pos[2]));
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

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // Cap at 50ms
    this.lastTime = time;

    // FPS tracking
    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator >= 1.0) {
      this.currentFps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsAccumulator = 0;
    }

    // Update input
    this.input.update();

    // Send input to WASM (local prediction)
    if (this.sim.is_active(this.playerId)) {
      const s = this.input.state;
      this.sim.apply_input(
        this.playerId,
        s.throttle,
        s.pitch,
        s.yaw,
        s.roll,
        s.translateX,
        s.translateY,
        s.translateZ,
        s.sasMode,
        s.fire,
        s.boost,
        s.rcsMode,
        s.fineControl,
      );

      // Send input to server too (for authoritative sim)
      if (this.multiplayer && this.network.connected) {
        this.network.sendInput({
          throttle: s.throttle,
          pitch: s.pitch,
          yaw: s.yaw,
          roll: s.roll,
          translateX: s.translateX,
          translateY: s.translateY,
          translateZ: s.translateZ,
          sasMode: s.sasMode,
          fire: s.fire,
          boost: s.boost,
          rcsMode: s.rcsMode,
          fineControl: s.fineControl,
        });
      }
    }

    // Run physics tick(s)
    const steps = Math.max(1, Math.round(dt * 60));
    for (let i = 0; i < steps; i++) {
      const eventCount = this.sim.tick();
      this.processEvents();
    }

    // Update visuals
    this.updateVisuals(dt);

    // Update camera
    if (this.sim.is_active(this.playerId)) {
      const pos = this.sim.get_position(this.playerId);
      const ori = this.sim.get_orientation(this.playerId);
      const vel = this.sim.get_velocity(this.playerId);
      
      this.camera.update(
        new THREE.Vector3(pos[0], pos[1], pos[2]),
        new THREE.Quaternion(ori[0], ori[1], ori[2], ori[3]),
        new THREE.Vector3(vel[0], vel[1], vel[2]),
        this.input.state.cameraOrbitX,
        this.input.state.cameraOrbitY,
        this.input.state.cameraZoom,
        dt,
      );
      
      // Consume camera input
      this.input.state.cameraZoom = 0;
    }

    // Update HUD
    this.updateHUD();

    // Render
    this.renderer.render();

    // Perf monitor
    if (this.frameCount % 30 === 0) {
      this.updatePerfMonitor();
    }

    this.frameCount++;
    requestAnimationFrame((t) => this.loop(t));
  }

  private processEvents() {
    const events = this.sim.read_events();
    let offset = 0;

    while (offset < events.length) {
      const type = events[offset];
      
      switch (type) {
        case EventType.CRASH: {
          const entity = events[offset + 1];
          if (entity === this.playerId) {
            this.showDeathScreen('Crashed into terrain');
          }
          offset += 6; // type, entity, x, y, z, velocity
          break;
        }
        case EventType.DESTROYED: {
          const entity = events[offset + 1];
          if (entity === this.playerId) {
            this.showDeathScreen('Lander destroyed');
          } else {
            this.renderer.removeEntity(entity);
          }
          offset += 4; // type, entity, has_killer, killer
          break;
        }
        case EventType.LANDING: {
          const entity = events[offset + 1];
          if (entity === this.playerId) {
            // TODO: Show landing score screen
            console.log('Landed successfully!', events.slice(offset, offset + 6));
          }
          offset += 6; // type, entity, pad_id, vel, precision, fuel
          break;
        }
        case EventType.PROJECTILE_FIRED: {
          offset += 3; // type, owner, projectile
          break;
        }
        case EventType.PROJECTILE_EXPIRED: {
          const proj = events[offset + 1];
          this.renderer.removeEntity(proj);
          offset += 2;
          break;
        }
        case EventType.DAMAGE: {
          offset += 5; // type, entity, amount, has_source, source
          break;
        }
        case EventType.COLLISION: {
          offset += 4; // type, entity_a, entity_b, rel_vel
          break;
        }
        case EventType.SPAWNED: {
          offset += 3; // type, entity, entity_type
          break;
        }
        default:
          offset += 1;
          break;
      }
    }
  }

  private updateVisuals(dt: number) {
    // Read all entity states from WASM
    const states = this.sim.read_states(1000);
    const floatsPerEntity = 15;
    const count = states.length / floatsPerEntity;

    const activeIds = new Set<number>();

    for (let i = 0; i < count; i++) {
      const o = i * floatsPerEntity;
      const x = states[o], y = states[o + 1], z = states[o + 2];
      const vx = states[o + 3], vy = states[o + 4], vz = states[o + 5];
      const qx = states[o + 6], qy = states[o + 7], qz = states[o + 8], qw = states[o + 9];
      const health = states[o + 10];
      const fuel = states[o + 11];
      const throttle = states[o + 12];
      const entityType = states[o + 13];
      const active = states[o + 14];

      if (active < 0.5) continue;

      // We need entity IDs — read_states doesn't include them directly
      // For now, update based on mesh presence. This needs improvement.
    }

    // Update player specifically
    if (this.sim.is_active(this.playerId)) {
      const pos = this.sim.get_position(this.playerId);
      const ori = this.sim.get_orientation(this.playerId);
      const throttle = this.input.state.throttle;
      this.renderer.updateLander(this.playerId, pos, ori, throttle, EntityType.LANDER_STANDARD);
      activeIds.add(this.playerId);
    }

    // TODO: Update other players' landers and projectiles from server state
  }

  private updateHUD() {
    if (!this.sim.is_active(this.playerId)) return;
    
    const pos = this.sim.get_position(this.playerId);
    const vel = this.sim.get_velocity(this.playerId);
    const health = this.sim.get_health(this.playerId);
    const fuelPct = this.sim.get_fuel_pct(this.playerId);
    const altitude = this.sim.get_altitude(pos[0], pos[1], pos[2]);
    const normal = this.sim.get_surface_normal(pos[0], pos[1], pos[2]);

    // Velocity components
    const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]);
    const verticalVel = vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];
    const horizontalVel = Math.sqrt(Math.max(0, speed * speed - verticalVel * verticalVel));

    // Throttle
    const throttle = Math.round(this.input.state.throttle * 100);
    (this.hudElements['throttle-fill'] as HTMLElement).style.height = `${throttle}%`;
    this.hudElements['throttle-label'].textContent = `${throttle}%`;

    // Telemetry
    this.hudElements['altitude'].textContent = altitude.toFixed(0);
    this.hudElements['velocity'].textContent = speed.toFixed(1);
    this.hudElements['vel-vertical'].textContent = verticalVel.toFixed(1);
    this.hudElements['vel-horizontal'].textContent = horizontalVel.toFixed(1);

    // Fuel
    const fuelPct100 = Math.round(fuelPct * 100);
    (this.hudElements['fuel-fill'] as HTMLElement).style.height = `${fuelPct100}%`;
    this.hudElements['fuel-label'].textContent = `${fuelPct100}%`;

    // HP
    const hpPct = Math.round(health);
    (this.hudElements['hp-fill'] as HTMLElement).style.width = `${hpPct}%`;
    this.hudElements['hp-text'].textContent = `${hpPct}/100`;

    // SAS mode
    const sasNames = ['OFF', 'STB', 'PRO', 'RET', 'RAD-', 'RAD+', 'TGT'];
    const sasEl = this.hudElements['sas-indicator'];
    sasEl.textContent = `SAS: ${sasNames[this.input.state.sasMode]}`;
    sasEl.classList.toggle('active', this.input.state.sasMode > 0);

    // RCS mode
    const rcsEl = this.hudElements['rcs-indicator'];
    rcsEl.classList.toggle('active', this.input.state.rcsMode);
  }

  private showDeathScreen(cause: string) {
    const deathScreen = document.getElementById('death-screen')!;
    const deathInfo = document.getElementById('death-info')!;
    deathInfo.textContent = cause;
    deathScreen.classList.add('visible');

    document.getElementById('respawn-btn')!.onclick = () => {
      deathScreen.classList.remove('visible');
      this.spawnPlayer();
      if (this.multiplayer && this.network.connected) {
        this.network.sendSpawn({ landerType: EntityType.LANDER_STANDARD, altitude: 2000 });
      }
    };
  }

  private updatePerfMonitor() {
    const perf = this.renderer.getPerfInfo();
    this.hudElements['perf-fps'].textContent = `${this.currentFps}`;
    this.hudElements['perf-entities'].textContent = `${this.sim.active_entity_count()}`;
    this.hudElements['perf-draw'].textContent = `${perf.drawCalls}`;
  }
}
