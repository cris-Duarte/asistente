# Desarrollo y validación

## Entorno

El entorno canónico es Docker. Las versiones principales están fijadas: Node 22, pnpm 9.4, PostgreSQL 16.4, Redis 7.4.1, Electric 1.8.0 y ESP-IDF 5.4.2.

```bash
cp .env.example .env
docker compose up --build
```

El servicio `migrate` debe terminar con código 0 antes de iniciar la API. `docker compose ps` debe mostrar saludables `postgres`, `redis`, `electric` y `api`.

Para ejecutar el código TypeScript directamente:

```bash
corepack enable
corepack prepare pnpm@9.4.0 --activate
pnpm install --frozen-lockfile
docker compose up -d postgres redis electric migrate
pnpm dev:local
```

## Propietario y autenticación

`owner:init` es idempotente respecto a la cuenta: la primera ejecución crea el propietario y las posteriores sólo pueden emitir un nuevo token de configuración mientras no exista una passkey.

```bash
OWNER_EMAIL=propietario@local OWNER_NAME=Propietario \
  docker compose exec api pnpm --filter @productivity-assistant/api owner:init
```

En la imagen optimizada se usa el CLI ya compilado:

```bash
OWNER_EMAIL=propietario@local OWNER_NAME=Propietario \
  docker compose -f compose.prod.yaml exec api owner:init
```

El secreto viaja en el fragmento del enlace, por lo que no llega al servidor ni a logs HTTP. El desafío WebAuthn se guarda en Redis con expiración y consumo único. El servidor valida `Origin` y `RP_ID`. Después del alta, el login descubre la credencial residente sin solicitar email.

La cookie de sesión es `HttpOnly` y `SameSite=Strict`; sólo `COOKIE_SECURE=false` en la composición local permite HTTP. La sesión móvil rueda hasta 30 días y nunca supera 90 días. Una recuperación consume el código, exige registrar otra passkey y rota todos los códigos.

## Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

La CI repite estas comprobaciones, aplica migraciones en una base vacía, construye y levanta las imágenes Docker, ejecuta un respaldo/restauración y compila ambas matrices de firmware. No hay pasos de despliegue.

## Sincronización y conflictos

PGlite es la única base local por propietario. `packages/electric-client` normaliza filas `snake_case` de Electric y DTO `camelCase` de la API. La tabla local `outbox` contiene UUID, entidad, recurso, versión base, cuerpo, intentos y próximo reintento.

Para probar el modo offline:

1. Abre DevTools, activa Offline y crea o modifica una tarea.
2. Recarga la página y comprueba que el dato y el contador pendiente siguen visibles.
3. Recupera la red. La operación debe enviarse una sola vez y desaparecer al regresar por Electric.
4. Edita la misma versión desde otro cliente. Ajustes debe mostrar el conflicto y permitir conservar la copia local o aceptar el servidor.

El service worker conserva la interfaz. La cola no depende de Background Sync y vuelve a intentar también al abrir la aplicación o recuperar el evento `online`.

## Respaldo y restauración

```bash
BACKUP_DIR=backups sh infra/scripts/backup.sh
sh infra/scripts/restore.sh backups/productivity-YYYYMMDDTHHMMSSZ.sql.gz
```

Los respaldos contienen órdenes `DROP ... IF EXISTS`, de modo que la restauración sustituye los objetos respaldados y falla ante cualquier error SQL.

## Firmware

El contenedor descarga revisiones fijas del BSP oficial de M5Stack, LVGL y SQLite sobre ESP-IDF 5.4.2. Compila primero las pruebas nativas de serialización, orden y reintento.

```bash
# Las dos variantes
DISPLAY_VARIANT=all docker compose --profile firmware run --rm firmware

# Una variante
DISPLAY_VARIANT=st7121 docker compose --profile firmware run --rm firmware
DISPLAY_VARIANT=st7123 docker compose --profile firmware run --rm firmware
```

Los binarios quedan en `apps/firmware/artifacts/<variante>/`. El flasheo y monitor se hacen desde macOS con ESP-IDF 5.4.2, usando el `flash_args` generado:

```bash
cd apps/firmware
python "$IDF_PATH/components/esptool_py/esptool/esptool.py" \
  --chip esp32p4 --port /dev/cu.usbmodemXXXX write_flash @artifacts/st7123/flash_args
idf.py -p /dev/cu.usbmodemXXXX monitor
```

`sdkconfig.production` prepara binarios firmados y rollback, pero deja Secure Boot, Flash Encryption y NVS Encryption desactivados. Actívalos sólo durante un procedimiento de aprovisionamiento documentado y revisado: ESP-IDF puede programar eFuses de forma irreversible en el primer arranque. Ningún script de este repositorio los quema automáticamente.

La integración física pendiente se valida en una Tab5: táctil de ambas revisiones, escaneo/alta Wi-Fi mediante ESP32-C6 por SDIO, batería/reloj, suspensión, vinculación, sincronización entre dos clientes, OTA firmada y rollback.

## Variables importantes

| Variable | Uso |
| --- | --- |
| `APP_URL` | Base usada al imprimir el enlace inicial |
| `APP_ORIGINS` | Lista de orígenes CORS permitidos |
| `WEBAUTHN_RP_ID` | RP ID exacto de WebAuthn |
| `WEBAUTHN_ORIGIN` | Origen HTTPS exacto de WebAuthn |
| `COOKIE_SECURE` | Debe permanecer `true` fuera del modo local |
| `ELECTRIC_SECRET` | Sólo API y Electric; nunca se incluye en el cliente |
| `CONFIG_PRODUCTIVITY_API_URL` | API HTTPS que usa el firmware |
