/**
 * Network client — WebSocket connection to game server
 * 
 * Handles:
 * - Connection and reconnection
 * - Sending player inputs
 * - Receiving state updates
 * - Receiving events (deaths, landings, scores)
 */

export interface ServerState {
  time: number;
  entities: ServerEntity[];
}

export interface ServerEntity {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  qx: number; qy: number; qz: number; qw: number;
  hp: number;
  fuel: number;
  throttle: number;
  type: number;
}

export interface ScoreEntry {
  name: string;
  score: number;
}

export type NetworkEventType = 'welcome' | 'state' | 'spawned' | 'death' | 'landed' | 'leaderboard' | 'emote' | 'error';

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  public connected = false;
  public playerId: number = 0;
  public latestState: ServerState | null = null;
  public leaderboard: ScoreEntry[] = [];
  
  // Event callbacks
  public onWelcome: ((data: any) => void) | null = null;
  public onState: ((state: ServerState) => void) | null = null;
  public onSpawned: ((data: any) => void) | null = null;
  public onDeath: ((cause: string) => void) | null = null;
  public onLanded: ((data: any) => void) | null = null;
  public onLeaderboard: ((entries: ScoreEntry[]) => void) | null = null;
  public onEmote: ((data: any) => void) | null = null;
  public onError: ((msg: string) => void) | null = null;
  public onConnect: (() => void) | null = null;
  public onDisconnect: (() => void) | null = null;

  constructor(url?: string) {
    // Default to same host, port 3001
    const host = window.location.hostname;
    const port = 3001;
    this.url = url || `ws://${host}:${port}`;
  }

  get statusLabel(): string {
    if (this.connected) return 'ONLINE';
    if (this.reconnectAttempts > 0 && this.reconnectAttempts < this.maxReconnectAttempts) return 'RECONNECT';
    return 'OFFLINE';
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[net] Connected to server');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onConnect?.();
      };

      this.ws.onclose = () => {
        console.log('[net] Disconnected from server');
        this.connected = false;
        this.onDisconnect?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[net] WebSocket error:', err);
        this.onError?.('Connection error');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (e) {
      console.error('[net] Failed to connect:', e);
      this.scheduleReconnect();
    }
  }

  private handleMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      
      switch (data.type as NetworkEventType) {
        case 'welcome':
          this.playerId = data.playerId;
          this.onWelcome?.(data);
          break;

        case 'state':
          // Assign entity IDs based on order (temporary — server should include IDs)
          this.latestState = {
            time: data.t,
            entities: data.entities,
          };
          this.onState?.(this.latestState);
          break;

        case 'spawned':
          this.onSpawned?.(data);
          break;

        case 'death':
          this.onDeath?.(data.cause);
          break;

        case 'landed':
          this.onLanded?.(data);
          break;

        case 'leaderboard':
          this.leaderboard = data.entries;
          this.onLeaderboard?.(data.entries);
          break;

        case 'emote':
          this.onEmote?.(data);
          break;

        case 'error':
          this.onError?.(data.message);
          break;
      }
    } catch (e) {
      console.error('[net] Failed to parse message:', e);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[net] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    console.log(`[net] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // --- Send methods ---

  /**
   * Send player name
   */
  sendName(name: string) {
    this.send({ type: 'name', name });
  }

  /**
   * Request to spawn at a location
   */
  sendSpawn(data: {
    landerType?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    altitude?: number;
  }) {
    this.send({ type: 'spawn', ...data });
  }

  /**
   * Send player input state
   */
  sendInput(input: {
    throttle: number;
    pitch: number;
    yaw: number;
    roll: number;
    translateX: number;
    translateY: number;
    translateZ: number;
    sasMode: number;
    fire: boolean;
    boost: boolean;
    rcsMode: boolean;
    fineControl: boolean;
  }) {
    this.send({ type: 'input', ...input });
  }

  /**
   * Send an emote
   */
  sendEmote(emote: string) {
    this.send({ type: 'emote', emote });
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
