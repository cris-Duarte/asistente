# Firmware M5Stack Tab5

Firmware ESP32-P4 basado en ESP-IDF 5.4.2 y el BSP oficial de M5Stack. El ESP32-C6 integrado proporciona Wi-Fi mediante SDIO y `esp_wifi_remote`.

## Artefactos reproducibles

Desde la raíz:

```bash
DISPLAY_VARIANT=all docker compose --profile firmware run --rm firmware
```

Se generan `artifacts/st7121` y `artifacts/st7123`, cada uno con aplicación, bootloader, tabla de particiones y argumentos de flasheo. Las revisiones usan el mismo código funcional y seleccionan el controlador de pantalla en compilación.

## Funciones incluidas

- Lista y detalle táctil de tareas, estado y temporizador.
- Configuración de red desde la pantalla.
- SQLite local para tareas, tramos, configuración, cola y conflictos.
- Operaciones con UUID, versión base, idempotencia, orden por recurso y espera exponencial.
- Vinculación de diez minutos mediante código de ocho dígitos y credencial revocable con alcance limitado.
- HTTPS con certificados raíz del sistema, OTA, verificación de imagen y rollback.
- Particiones A/B, almacenamiento local y espacio para coredump.

El build ejecuta primero `test/native_tests.c` en el host del contenedor. El hardware debe validarse antes de activar eFuses o distribuir una actualización.

El firmware consulta cada seis horas `CONFIG_PRODUCTIVITY_OTA_URL`. El manifiesto HTTPS debe contener `{"version":"1.2.0","secureVersion":2,"url":"https://.../firmware.bin"}`. Sólo instala una versión distinta cuyo `secureVersion` no retroceda; el bootloader valida la firma cuando se construye con `sdkconfig.production`.

## Seguridad de producción

`sdkconfig.production` construye imágenes firmadas si se entrega la clave privada fuera del repositorio. Secure Boot, Flash Encryption y NVS Encryption permanecen apagados en la plantilla para que ningún build o primer arranque programe eFuses por accidente. La credencial y contraseña quedan protegidas por el cifrado de flash cuando esas funciones se activan durante el aprovisionamiento final.
