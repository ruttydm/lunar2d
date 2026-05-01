import type { RemotePlayer } from '../domain/model';

export interface LocalMultiplayerState {
  name: string;
  bodyId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  throttle: number;
  score: number;
}

export class MultiplayerClient {
  readonly remotePlayers = new Map<number, RemotePlayer>();

  private socket: WebSocket | null = null;
  private id = 0;
  private sendTimer = 0;

  constructor(private readonly url: string) {}

  connect(name: string) {
    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener('open', () => this.send({ type: 'hello', name }));
      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => {
        this.socket = null;
        this.remotePlayers.clear();
      });
      socket.addEventListener('error', () => socket.close());
    } catch {
      this.socket = null;
    }
  }

  update(dt: number, state: LocalMultiplayerState) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = 1 / 15;
    this.send({ type: 'state', ...state });
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private send(data: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(data));
  }

  private handleMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'welcome') {
        this.id = data.id;
        return;
      }
      if (data.type === 'peer-left') {
        this.remotePlayers.delete(data.id);
        return;
      }
      if (data.type !== 'state' || data.id === this.id) return;
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
}
