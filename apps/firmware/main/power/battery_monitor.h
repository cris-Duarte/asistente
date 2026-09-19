/**
 * Productivity Assistant - Battery Monitor
 * Handles battery level monitoring via INA226
 */

#ifndef BATTERY_MONITOR_H
#define BATTERY_MONITOR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Battery callback
typedef void (*battery_callback_t)(uint8_t level, bool charging, bool low_battery);

// Initialize battery monitor
void battery_monitor_init(void);

// Start periodic monitoring
void battery_monitor_start(void);

// Stop monitoring
void battery_monitor_stop(void);

// Get current battery level (0-100)
uint8_t battery_monitor_get_level(void);

// Get battery voltage in mV
int battery_monitor_get_voltage_mv(void);

// Get battery current in mA
int battery_monitor_get_current_ma(void);

// Check if charging
bool battery_monitor_is_charging(void);

// Check if battery is low (< 20%)
bool battery_monitor_is_low(void);

// Register callback
void battery_monitor_register_callback(battery_callback_t callback);

#ifdef __cplusplus
}
#endif

#endif // BATTERY_MONITOR_H