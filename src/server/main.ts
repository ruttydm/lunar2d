/**
 * Lunar2D multiplayer relay.
 *
 * The 2D client owns local physics; this server keeps multiplayer simple and
 * reliable by relaying compact player state to peers at the browser send rate.
 */

interface Peer {
  id: number;
  ws: ServerWebSocket;
  name: string;
  score: number;
  lastSeen: number;
}

type ServerWebSocket = Parameters<Parameters<typeof Bun.serve>[0]['websocket']['open']>[0];

const DIST_DIR = new URL('../../dist/', import.meta.url);
const INDEX_FILE = new URL('./index.html', DIST_DIR);

async function serveClient(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

  if (pathname.includes('..')) {
    return new Response('Bad request', { status: 400 });
  }

  const file = Bun.file(new URL(`.${pathname}`, DIST_DIR));
  if (await file.exists()) {
    return new Response(file);
  }

  if (!pathname.startsWith('/assets/')) {
    const index = Bun.file(INDEX_FILE);
    if (await index.exists()) {
      return new Response(index);
    }
  }

  return Response.json({
    name: 'Lunar2D Relay',
    status: 'client-build-not-found',
  }, { status: 404 });
}

class RelayServer {
  private peers = new Map<number, Peer>();
  private nextId = 1;

  start(port = 3001) {
    Bun.serve({
      port,
      fetch: async (req, server) => {
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const upgraded = server.upgrade(req, {
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
          });
          if (upgraded) return undefined;
        }

        return serveClient(req);
      },
      websocket: {
        open: (ws) => this.open(ws),
        close: (ws) => this.close(ws),
        message: (ws, message) => this.message(ws, message),
      },
    });

    console.log(`[server] Lunar2D relay listening on http://localhost:${port}`);
  }

  private open(ws: ServerWebSocket) {
    const id = this.nextId++;
    ws.data = { id };
    const peer: Peer = {
      id,
      ws,
      name: `Pilot ${id}`,
      score: 0,
      lastSeen: Date.now(),
    };
    this.peers.set(id, peer);
    this.send(ws, { type: 'welcome', id });
    console.log(`[server] peer ${id} connected (${this.peers.size} online)`);
  }

  private close(ws: ServerWebSocket) {
    const id = Number(ws.data?.id);
    if (!id) return;
    this.peers.delete(id);
    this.broadcast({ type: 'peer-left', id });
    console.log(`[server] peer ${id} disconnected (${this.peers.size} online)`);
  }

  private message(ws: ServerWebSocket, message: string | Buffer) {
    const id = Number(ws.data?.id);
    const peer = this.peers.get(id);
    if (!peer || typeof message !== 'string') return;

    try {
      const data = JSON.parse(message);
      peer.lastSeen = Date.now();
      if (typeof data.name === 'string') peer.name = data.name.slice(0, 24);
      if (Number.isFinite(data.score)) peer.score = Number(data.score);

      if (data.type === 'hello') {
        this.send(ws, { type: 'welcome', id });
        return;
      }

      if (data.type !== 'state') return;
      this.broadcast({
        type: 'state',
        id,
        name: peer.name,
        bodyId: data.bodyId,
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        vx: Number(data.vx) || 0,
        vy: Number(data.vy) || 0,
        angle: Number(data.angle) || 0,
        hp: Number(data.hp) || 0,
        throttle: Number(data.throttle) || 0,
        score: peer.score,
        t: Date.now(),
      }, id);
    } catch {
      this.send(ws, { type: 'error', message: 'bad-json' });
    }
  }

  private send(ws: ServerWebSocket, data: Record<string, unknown>) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Peer will be cleaned up on close.
    }
  }

  private broadcast(data: Record<string, unknown>, exceptId = 0) {
    const payload = JSON.stringify(data);
    for (const peer of this.peers.values()) {
      if (peer.id === exceptId) continue;
      try {
        peer.ws.send(payload);
      } catch {
        this.peers.delete(peer.id);
      }
    }
  }
}

new RelayServer().start(Number(process.env.PORT || 3001));
