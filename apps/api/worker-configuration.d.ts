interface CloudflareBindings {
  WEBSOCKET_SERVER: DurableObjectNamespace<WebSocketServer>;
  BACKUPS: R2Bucket;
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
  JWT_SECRET: string;
  ELECTRIC_URL: string;
  ELECTRIC_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  NEON_API_KEY: string;
}

interface WebSocketServer extends DurableObject {
  fetch(request: Request): Promise<Response>;
  handleWebSocketMessage(ws: WebSocket, message: string): void;
}

declare module 'hono' {
  interface Env {
    Bindings: CloudflareBindings;
  }
}