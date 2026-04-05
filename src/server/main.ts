/**
 * Lunar3D Game Server (Bun)
 * 
 * WebSocket game server with authoritative physics via WASM.
 */

import { WebSocket } from 'bun';

// We'll load WASM on the server side too
let WasmSimulation: any = null;

async function loadWasm() {
  try {
    const wasm = await import('../../pkg/lunar_physics_wasm.js');
    await wasm.default();
    WasmSimulation = wasm.WasmSimulation;
    console.log('[server] WASM physics engine loaded');
  } catch (e) {
    console.error('[server] Failed to load WASM:', e);
    process.exit(1);
  }
}

interface Player {
  id: number;
  name: string;
  ws: any; // Bun WebSocket
  entityId: number;
  connected: number;
  lastInput: number;
  score: number;
  xp: number;
}

class GameServer {
  private players: Map<number, Player> = new Map();
  private sim: any = null;
  private nextPlayerId = 1;
  private tickRate = 60;
  private running = false;

  async start(port: number = 3001) {
    await loadWasm();
    
    this.sim = new WasmSimulation();
    this.setupWorld();
    
    console.log(`[server] Starting game server on port ${port}`);
    
    // Start WebSocket server
    const server = Bun.serve({
      port,
      fetch(req, server) {
        const success = server.upgrade(req, {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        });
        if (success) {
          return undefined; // WebSocket upgrade successful
        }
        return new Response('Lunar3D Game Server', { status: 200 });
      },
      websocket: {
        open: (ws) => this.onConnect(ws),
        close: (ws) => this.onDisconnect(ws),
        message: (ws, message) => this.onMessage(ws, message),
      },
    });

    // Start game loop
    this.running = true;
    this.gameLoop();

    console.log(`[server] Server running at http://localhost:${port}`);
  }

  private setupWorld() {
    const moonRadius = this.sim.moon_radius();
    
    // Landing pads
    const pads = [
      [0, moonRadius, 0, 50],
      [moonRadius * 0.5, moonRadius * 0.866, 0, 25],
      [0, moonRadius * 0.866, moonRadius * 0.5, 25],
      [-moonRadius * 0.3, moonRadius * 0.95, moonRadius * 0.1, 10],
    ];

    for (let i = 0; i < pads.length; i++) {
      const [x, y, z, r] = pads[i];
      this.sim.add_pad(i, x, y, z, r, true);
    }

    console.log(`[server] World initialized with ${pads.length} landing pads`);
  }

  private onConnect(ws: any) {
    const id = this.nextPlayerId++;
    ws.data = { playerId: id };
    
    const player: Player = {
      id,
      name: `Player ${id}`,
      ws,
      entityId: 0,
      connected: Date.now(),
      lastInput: Date.now(),
      score: 0,
      xp: 0,
    };
    
    this.players.set(id, player);
    console.log(`[server] Player ${id} connected (${this.players.size} online)`);
    
    // Send welcome
    this.send(ws, {
      type: 'welcome',
      playerId: id,
      moonRadius: this.sim.moon_radius(),
      moonGm: this.sim.moon_gm(),
    });

    // Send leaderboard
    this.sendLeaderboard(ws);
  }

  private onDisconnect(ws: any) {
    const id = ws.data.playerId;
    const player = this.players.get(id);
    
    if (player) {
      // Destroy their entity
      if (player.entityId && this.sim.is_active(player.entityId)) {
        this.sim.destroy_entity(player.entityId);
      }
      this.players.delete(id);
      console.log(`[server] Player ${id} disconnected (${this.players.size} online)`);
    }
  }

  private onMessage(ws: any, message: any) {
    const id = ws.data.playerId;
    const player = this.players.get(id);
    if (!player) return;

    try {
      let data: any;
      if (typeof message === 'string') {
        data = JSON.parse(message);
      } else {
        // Binary message — TODO: handle binary protocol
        return;
      }

      switch (data.type) {
        case 'spawn':
          this.handleSpawn(player, data);
          break;
        case 'input':
          this.handleInput(player, data);
          break;
        case 'name':
          player.name = data.name || `Player ${player.id}`;
          break;
        case 'emote':
          this.broadcastEmote(player, data.emote);
          break;
      }

      player.lastInput = Date.now();
    } catch (e) {
      console.error(`[server] Error processing message from player ${id}:`, e);
    }
  }

  private handleSpawn(player: Player, data: any) {
    const moonRadius = this.sim.moon_radius();
    const landerType = data.landerType || 1; // Standard
    
    // Spawn at requested position or default orbit
    const spawnAlt = data.altitude || 2000;
    const x = data.x || 0;
    const y = data.y || moonRadius + spawnAlt;
    const z = data.z || 0;
    
    // Calculate orbital velocity if in orbit
    const vOrbit = this.sim.circular_orbit_velocity(spawnAlt);
    const vx = data.vx || (z !== 0 ? 0 : vOrbit);
    const vy = data.vy || 0;
    const vz = data.vz || (z !== 0 ? vOrbit : 0);

    // Destroy old entity if exists
    if (player.entityId && this.sim.is_active(player.entityId)) {
      this.sim.destroy_entity(player.entityId);
    }

    player.entityId = this.sim.spawn_lander(landerType, x, y, z, vx, vy, vz);

    this.send(player.ws, {
      type: 'spawned',
      entityId: player.entityId,
      position: this.sim.get_position(player.entityId),
      velocity: this.sim.get_velocity(player.entityId),
    });
  }

  private handleInput(player: Player, data: any) {
    if (!player.entityId || !this.sim.is_active(player.entityId)) return;

    this.sim.apply_input(
      player.entityId,
      data.throttle || 0,
      data.pitch || 0,
      data.yaw || 0,
      data.roll || 0,
      data.translateX || 0,
      data.translateY || 0,
      data.translateZ || 0,
      data.sasMode || 0,
      data.fire || false,
      data.boost || false,
      data.rcsMode || false,
      data.fineControl || false,
    );
  }

  private broadcastEmote(player: Player, emote: string) {
    const msg = JSON.stringify({
      type: 'emote',
      playerId: player.id,
      name: player.name,
      emote,
    });
    
    for (const [, p] of this.players) {
      if (p.id !== player.id) {
        try { p.ws.send(msg); } catch {}
      }
    }
  }

  private sendLeaderboard(ws: any) {
    const entries: Array<{ name: string; score: number }> = [];
    for (const [, p] of this.players) {
      entries.push({ name: p.name, score: p.score });
    }
    entries.sort((a, b) => b.score - a.score);
    
    this.send(ws, {
      type: 'leaderboard',
      entries: entries.slice(0, 20),
    });
  }

  private send(ws: any, data: any) {
    try {
      ws.send(JSON.stringify(data));
    } catch {}
  }

  private broadcast(data: any) {
    const msg = JSON.stringify(data);
    for (const [, p] of this.players) {
      try { p.ws.send(msg); } catch {}
    }
  }

  private gameLoop() {
    if (!this.running) return;

    const tickInterval = 1000 / this.tickRate;
    
    setInterval(() => {
      if (this.players.size === 0) return;

      // Process inputs (already applied via handleInput)
      
      // Run physics tick
      const eventCount = this.sim.tick();
      
      // Process events
      this.processEvents();
      
      // Broadcast state to all players
      this.broadcastState();
      
    }, tickInterval);
  }

  private processEvents() {
    const events = this.sim.read_events();
    let offset = 0;

    while (offset < events.length) {
      const type = events[offset];
      
      switch (type) {
        case 1: { // Crash
          const entity = events[offset + 1];
          const player = this.findPlayerByEntity(entity);
          if (player) {
            this.send(player.ws, { type: 'death', cause: 'Crashed into terrain' });
          }
          offset += 6;
          break;
        }
        case 2: { // Landing
          const entity = events[offset + 1];
          const padId = events[offset + 2];
          const vel = events[offset + 3];
          const precision = events[offset + 4];
          const fuelRemaining = events[offset + 5];
          
          const player = this.findPlayerByEntity(entity);
          if (player) {
            const score = Math.round(100 + (1 - precision / 50) * 200 + fuelRemaining * 150);
            player.score += score;
            this.send(player.ws, {
              type: 'landed',
              score,
              totalScore: player.score,
              padId,
            });
          }
          offset += 6;
          break;
        }
        case 3: { // Destroyed
          const entity = events[offset + 1];
          const hasKiller = events[offset + 2];
          const killer = events[offset + 3];
          
          const player = this.findPlayerByEntity(entity);
          if (player) {
            let cause = 'Lander destroyed';
            if (hasKiller > 0.5) {
              const killerPlayer = this.findPlayerByEntity(killer);
              if (killerPlayer) {
                cause = `Destroyed by ${killerPlayer.name}`;
                killerPlayer.score += 100;
              }
            }
            this.send(player.ws, { type: 'death', cause });
          }
          offset += 4;
          break;
        }
        default:
          offset += 1;
          break;
      }
    }
  }

  private broadcastState() {
    // Read all entity states
    const states = this.sim.read_states(1000);
    const floatsPerEntity = 15;
    const count = states.length / floatsPerEntity;

    // Build compact state update
    const entities: any[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * floatsPerEntity;
      entities.push({
        // We'll need entity IDs in the state buffer — for now, send as-is
        x: states[o], y: states[o + 1], z: states[o + 2],
        vx: states[o + 3], vy: states[o + 4], vz: states[o + 5],
        qx: states[o + 6], qy: states[o + 7], qz: states[o + 8], qw: states[o + 9],
        hp: states[o + 10],
        fuel: states[o + 11],
        throttle: states[o + 12],
        type: states[o + 13],
      });
    }

    this.broadcast({
      type: 'state',
      t: this.sim.time(),
      entities,
    });
  }

  private findPlayerByEntity(entityId: number): Player | undefined {
    for (const [, p] of this.players) {
      if (p.entityId === entityId) return p;
    }
    return undefined;
  }
}

// Start server
const server = new GameServer();
server.start(parseInt(process.env.PORT || '3001'));
