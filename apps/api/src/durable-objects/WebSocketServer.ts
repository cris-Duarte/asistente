export class WebSocketServer {
  private sessions: Map<WebSocket, { id: string; userId: string }> = new Map();

  constructor(private ctx: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    const sessionId = crypto.randomUUID();
    const userId = new URL(request.url).searchParams.get('userId') || 'anonymous';

    this.sessions.set(server, { id: sessionId, userId });

    server.addEventListener('message', (event) => {
      this.handleMessage(server, event.data);
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
      this.broadcast({ type: 'user_disconnected', userId, sessionId }, server);
    });

    server.addEventListener('error', () => {
      this.sessions.delete(server);
    });

    this.broadcast({ type: 'user_connected', userId, sessionId }, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private handleMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);
      const session = this.sessions.get(ws);

      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        case 'subscribe':
          // Handle subscription to specific channels
          break;
        case 'task_update':
          this.broadcast({ type: 'task_update', payload: data.payload, userId: session?.userId }, ws);
          break;
        case 'timer_update':
          this.broadcast({ type: 'timer_update', payload: data.payload, userId: session?.userId }, ws);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  }

  private broadcast(message: any, exclude?: WebSocket) {
    const data = JSON.stringify(message);
    for (const [ws, session] of this.sessions) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  broadcastToUser(userId: string, message: any) {
    const data = JSON.stringify(message);
    for (const [ws, session] of this.sessions) {
      if (session.userId === userId && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}