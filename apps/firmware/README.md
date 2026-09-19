# Productivity Assistant - M5Stack Tab5 Firmware

Firmware for M5Stack Tab5 (ESP32-P4) running ESP-IDF v5.x with LVGL v9.

## Hardware

- **MCU**: ESP32-P4 (Dual-core RISC-V @ 400MHz, 32MB PSRAM)
- **Display**: 5" IPS 1280x720 (ST7121)
- **Touch**: ST7121 capacitive
- **IMU**: BMI270 6-axis
- **RTC**: RX8130CE
- **Battery**: NP-F550 7.4V 2000mAh (INA226 monitor)
- **Storage**: microSD + 16MB Flash

## Features

- **LVGL v9 UI**: 1280x720 touch interface
- **Offline-first**: SQLite local storage with ElectricSQL sync
- **Tasks**: Create, edit, timer, kanban/list views
- **Timer**: Real-time with progress arc
- **Sync**: ElectricSQL Shapes over HTTP/HTTPS
- **Power**: Deep sleep, wake on touch/button/IMU/RTC
- **OTA**: HTTPS firmware updates
- **Battery**: INA226 monitoring with low-battery alert

## Prerequisites

```bash
# Install ESP-IDF v5.1+
git clone -b v5.1 --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32p4

# Set up environment
. ./export.sh
```

## Building

```bash
cd apps/firmware

# Configure (optional - uses sdkconfig.defaults)
idf.py menuconfig

# Build
idf.py build

# Flash (adjust port)
idf.py -p /dev/ttyUSB0 flash monitor
```

## Configuration

Key settings in `sdkconfig.defaults`:
- Partition table: `partitions.csv` (OTA + storage)
- LVGL: Double buffer, 1280x720 RGB565
- PSRAM: Octal 80MHz
- WiFi: STA mode with auto-reconnect
- OTA: HTTPS with cert bundle

## Project Structure

```
apps/firmware/
├── main/
│   ├── main.c                 # Entry point, tasks
│   ├── ui/
│   │   ├── ui_main.h/c        # Main screen, timer, tasks
│   ├── sync/
│   │   ├── sync_client.h/c    # ElectricSQL Shape client
│   ├── storage/
│   │   ├── sqlite_store.h/c   # SQLite local DB
│   ├── network/
│   │   ├── wifi_manager.h/c   # WiFi + reconnect
│   │   ├── ota_updater.h/c    # HTTPS OTA
│   ├── power/
│   │   ├── battery_monitor.h/c # INA226
│   │   ├── sleep_manager.h/c   # Deep/light sleep
│   ├── peripherals/
│   │   ├── touch.h/c          # ST7121
│   │   ├── buttons.h/c        # Physical buttons
│   │   ├── imu.h/c            # BMI270
│   │   ├── rtc.h/c            # RX8130CE
├── CMakeLists.txt
├── sdkconfig.defaults
├── partitions.csv
```

## Sync Protocol

Custom ElectricSQL Shape client:
- **Pull**: GET `/v1/shape?table=X&offset=N` (incremental)
- **Push**: POST `/api/mutations` (batched)
- **Queue**: Local SQLite `pending_mutations` table
- **Conflict**: Last-writer-wins + user prompt on complex conflicts

## Power Management

- **Active**: ~200mA @ 7.4V (screen on, WiFi active)
- **Light Sleep**: ~20mA (screen off, WiFi associated)
- **Deep Sleep**: ~500μA (RTC + wake sources)
- **Wake Sources**: Touch, Button, IMU motion, RTC alarm, Timer

## Battery

- **INA226**: Shunt voltage, bus voltage, current, power
- **Levels**: 100% (4.2V) → 0% (3.0V)
- **Charging**: IP2326, 5V USB-C, 2A max
- **Alerts**: 20% low, 10% critical, 5% emergency sleep

## OTA Updates

```bash
# Server provides: https://api.example.com/firmware/latest.bin
# ESP32 downloads, verifies signature, writes to OTA partition
# Automatic rollback on boot failure
```

## Debugging

```bash
# Monitor serial output
idf.py monitor

# GDB debugging
idf.py gdb

# Core dump analysis
idf.py coredump-info build/esp32p4.elf
```

## License

MIT License