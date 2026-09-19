import { createServer } from 'http';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const neonClient = neon('postgresql://postgres:postgres@127.0.0.1:5432/productivity?sslmode=disable');
const db = drizzle(neonClient);

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:8787`);
  
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));
    return;
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20, hasMore: false } }));
    return;
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      data: { 
        id: '00000000-0000-0000-0000-000000000001',
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      } 
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
};

const server = createServer((req, res) => handler(req, res));
server.listen(8787, () => console.log('API server running on http://localhost:8787'));