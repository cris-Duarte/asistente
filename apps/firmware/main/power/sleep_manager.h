/**
 * Productivity Assistant - Sleep Manager
 * Handles deep sleep and wake sources
 */

#ifndef SLEEP_MANAGER_H
#define SLEEP_MANAGER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Wake sources
typedef enum {
    WAKE_SOURCE_TOUCH = 1,
    WAKE_SOURCE_BUTTON = 2,
    WAKE_SOURCE_IMU = 3,
    WAKE_SOURCE_RTC = 4,
    WAKE_SOURCE_TIMER = 5,
} wake_source_t;

// Initialize sleep manager
void sleep_manager_init(void);

// Enter deep sleep
void sleep_manager_deep_sleep(uint64_t time_us);

// Enter light sleep
void sleep_manager_light_sleep(uint64_t time_us);

// Wake from sleep (called on wakeup)
void sleep_manager_wake(void);

// Get wake source
wake_source_t sleep_manager_get_wake_source(void);

// Enable/disable wake sources
void sleep_manager_enable_wake_source(wake_source_t source, bool enable);

// Set wake timer
void sleep_manager_set_wake_timer(uint64_t time_us);

#ifdef __cplusplus
}
#endif

#endif // SLEEP_MANAGER_H