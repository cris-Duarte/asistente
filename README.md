# Productivity Assistant

Aplicación personal de productividad para un único propietario. Incluye una PWA offline, API Hono, PostgreSQL, Redis, Electric y firmware para M5Stack Tab5. La autenticación usa passkeys y sesiones opacas; no hay registro público ni contraseñas.

El paquete histórico `packages/ai-agent` se conserva como referencia, pero está fuera del workspace, los builds, Docker y CI.

## Inicio rápido

Requisitos: Docker Desktop con Compose. Node.js 22 y pnpm 9.4 sólo son necesarios para ejecutar herramientas fuera de Docker.

```bash
cp .env.example .env
docker compose up --build
```

Compose crea PostgreSQL y Redis persistentes, inicia Electric, aplica todas las migraciones y levanta la API y la web con recarga automática. Cuando los servicios estén saludables:

```bash
docker compose exec api pnpm --filter @productivity-assistant/api owner:init
```

El comando crea el único propietario, imprime un enlace temporal y guarda solamente el hash del secreto. Abre el enlace completo, incluido su fragmento `#token=...`, en `http://localhost:5173` y registra la primera passkey. Los diez códigos de recuperación se muestran una sola vez.

Servicios locales:

| Servicio | Dirección |
| --- | --- |
| Web | http://localhost:5173 |
| API y healthcheck | http://localhost:8787/health |
| Electric | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

Los puertos pueden cambiarse con `WEB_PORT`, `API_PORT`, `ELECTRIC_PORT`, `POSTGRES_PORT` y `REDIS_PORT`.

## Funciones

- Proyectos: crear, editar, archivar y restaurar.
- Tareas: CRUD, búsqueda, filtros, lista, kanban y cambios de estado.
- Temporizador persistente con tramos de tiempo y una sola ejecución activa.
- Dashboard y reportes calculados con datos reales; exportación CSV/JSON.
- Importación validada, previsualización e idempotencia conservando IDs.
- Passkeys múltiples, sesiones revocables, recuperación y dispositivos Tab5 vinculados.
- PWA con PGlite, cola transaccional durable, reintentos ordenados, confirmación por Electric y bandeja de conflictos.
- Firmware Tab5 con SQLite, tareas, temporizador, Wi-Fi táctil, código de vinculación, cola offline y OTA HTTPS con rollback.

## Arquitectura

Las lecturas sincronizadas llegan desde Electric a través de un proxy autenticado de la API. El navegador nunca recibe el secreto de Electric. Todas las escrituras pasan por la API con `Idempotency-Key`, versión base y recibos de mutación. PostgreSQL impone el propietario único y el único tramo activo.

La PWA guarda el cambio local y su operación de salida en una misma transacción de PGlite. Al volver la red, reintenta en orden por recurso. Un `409` conserva ambas versiones para que el propietario elija. Los borrados son lógicos y también se sincronizan.

## Operación

```bash
# Estado y logs
docker compose ps
docker compose logs -f api web electric

# Detener sin borrar datos / reconstruir
docker compose stop
docker compose up --build

# Aplicar migraciones manualmente
docker compose run --rm migrate

# Respaldo y restauración
pnpm backup
pnpm restore -- backups/productivity-YYYYMMDDTHHMMSSZ.sql.gz

# Detener y retirar contenedores; conserva volúmenes
docker compose down
```

No uses `docker compose down -v` si quieres conservar los datos.

## Producción preparada

No se publica ningún servicio desde este repositorio. Para construir la composición local de producción:

```bash
cp .env.example .env
# Define APP_DOMAIN y secretos fuertes en .env
docker compose -f compose.prod.yaml config
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
docker compose -f compose.prod.yaml exec api owner:init --email propietario@local --name Propietario
```

La composición de producción expone solamente Caddy en 80/443. PostgreSQL, Redis, Electric, API y web permanecen en la red interna. Caddy obtiene certificados cuando `APP_DOMAIN` resuelve al host y éste es accesible desde Internet.

Consulta [DEVELOPMENT.md](DEVELOPMENT.md) para pruebas, seguridad, firmware y solución de problemas.
