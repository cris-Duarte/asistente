# Development Commands & Setup

## Prerequisites
- Node.js 22+
- pnpm 9+
- Docker & Docker Compose
- Python 3.10+
- ESP-IDF 5.x (for M5Stack Tab5 firmware)

## Quick Start

### 1. Start Infrastructure (PostgreSQL + ElectricSQL)
```bash
cd /Users/cristhianduarte/Documents/Asistente
docker compose -f infra/docker-compose.yml up -d
```

### 2. Run Database Migrations
```bash
cd packages/db-schema
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productivity?sslmode=disable pnpm db:migrate
```

### 3. Start API Server (Local Development)
```bash
cd apps/api
# Set environment variables
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/productivity?sslmode=disable
export DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@127.0.0.1:5432/productivity?sslmode=disable
export JWT_SECRET=dev-jwt-secret-at-least-32-characters-long
export ELECTRIC_URL=http://localhost:3000
export ELECTRIC_SECRET=dev-secret

# Run minimal API server (Node.js + Neon serverless)
node minimal_api.js
# API available at http://localhost:8787
```

### 4. Start Web App
```bash
cd apps/web
pnpm dev
# Web App available at http://localhost:5173
```

### 5. Verify ElectricSQL Sync Service
```bash
curl http://localhost:3000/v1/health
# Should return: {"status":"active"}
```

## Service URLs (Local Development)
- **Web App**: http://localhost:5173
- **API Server**: http://localhost:8787
- **ElectricSQL Sync**: http://localhost:3000
- **PostgreSQL**: postgresql://postgres:postgres@localhost:5432/productivity
- **ElectricSQL Shape Endpoint**: http://localhost:3000/v1/shape?table=tasks

## Database Schema
Run migrations from `packages/db-schema`:
```bash
cd packages/db-schema
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productivity?sslmode=disable pnpm db:migrate
```

## Project Structure
```
asistente/
├── apps/
│   ├── api/                 # Node.js API server (Hono + Neon)
│   ├── web/                 # React + Vite + PWA (ElectricSQL client)
│   └── firmware/            # ESP-IDF + LVGL (M5Stack Tab5)
├── packages/
│   ├── shared/              # Shared types & Zod schemas
    ├── db-schema/           # Drizzle ORM schema & migrations
    └── electric-client/     # ElectricSQL client integration
├── infra/
│   ├── docker-compose.yml   # Postgres + ElectricSQL + Redis
    ├── fly.toml             # ElectricSQL deployment config
    └── init-sql/            # DB initialization scripts
└── .github/workflows/       # CI/CD pipelines
```

## Key Integration Points Verified

✅ **PostgreSQL** - Running on port 5432, accepting connections
✅ **ElectricSQL Sync** - Running on port 3000, streaming logical replication
✅ **PostgreSQL → ElectricSQL** - Logical replication slot active
✅ **API Server** - Running on port 8787, CRUD operations working
✅ **Database Persistence** - Tasks created via API are stored in PostgreSQL
✅ **ElectricSQL Sync** - Shape endpoint serving `/v1/shape?table=tasks`
✅ **Web App** - Vite dev server running on port 5173
✅ **ElectricSQL Client** - `@electric-sql/pglite` + `@electric-sql/pglite-sync` integrated

## Testing Integration

### Create a Task
```bash
curl -X POST http://localhost:8787/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid-jwt>" \
  -H "X-User-ID: <user-id>" \
  -H "X-Device-ID: web" \
  -d '{"title":"Test Task","description":"Test","status":"pending","userId":"<user-uuid>"}'
```

### List Tasks
```bash
curl http://localhost:8787/api/tasks \
  -H "Authorization: Bearer <valid-jwt>" \
  -H "X-User-ID: <user-id>"
```

### Check ElectricSQL Sync
```bash
curl http://localhost:3000/v1/shape?table=tasks
# Should return shape data with tasks
```

## Firmware Development (M5Stack Tab5)

### Prerequisites
```bash
# Install ESP-IDF v5.x
git clone -b v5.1 --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32p4
. ./export.sh
```

### Build & Flash
```bash
cd apps/firmware
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

### Key Firmware Components
- **UI**: LVGL v9 on 1280x720 ST7121 display
- **Storage**: SQLite (esp-sqlite3) with identical schema
- **Sync**: Custom ElectricSQL Shape client (HTTP long-polling)
- **Peripherals**: ST7121 touch, BMI270 IMU, RX8130CE RTC, INA226 battery monitor
- **Power**: Deep sleep with touch/button/IMU/RTC wake sources
- **OTA**: HTTPS firmware updates via API

## Deployment

### ElectricSQL (Fly.io)
```bash
cd infra
fly deploy -c fly.toml
```

### API (Cloudflare Workers)
```bash
cd apps/api
wrangler deploy
```

### Web App (Cloudflare Pages)
```bash
cd apps/web
pnpm build
wrangler pages deploy dist --project-name=productivity-assistant
```

### Database (Neon/Cloudflare D1)
Configure secrets in Cloudflare dashboard:
- `DATABASE_URL`
- `JWT_SECRET`
- `ELECTRIC_URL`
- `ELECTRIC_SECRET`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is healthy: `docker compose -f infra/docker-compose.yml ps`
- Check ElectricSQL logs: `docker logs productivity-electric`
- Verify connection string uses `127.0.0.1` not `localhost` (Docker networking)

### ElectricSQL Sync Issues
- Check replication slot: `SELECT * FROM pg_replication_slots;`
- Verify publication: `SELECT * FROM pg_publication;`
- Check ElectricSQL logs: `docker logs productivity-electric -f`

### API Connection Issues
- Verify `DATABASE_URL` uses `127.0.0.1` not `localhost`
- Check Neon serverless driver compatibility
- Verify JWT_SECRET is set and ≥32 characters

### Web App Sync Issues
- Check browser console for ElectricSQL client errors
- Verify `VITE_ELECTRIC_URL` points to `http://localhost:3000`
- Check PWA service worker registration

## Next Phases
- **Phase 5**: Full Web App + ElectricSQL client integration
- **Phase 6**: M5Stack Tab5 firmware integration testing
- **Phase 7**: Passkey/WebAuthn authentication flow
- **Phase 8**: AI agent integration (event store, MCP server)