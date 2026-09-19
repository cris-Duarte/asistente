/**
 * Productivity Assistant - OTA Updater
 * Handles firmware over-the-air updates
 */

#ifndef OTA_UPDATER_H
#define OTA_UPDATER_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// OTA events
typedef enum {
    OTA_EVENT_START = 1,
    OTA_EVENT_PROGRESS = 2,
    OTA_EVENT_SUCCESS = 3,
    OTA_EVENT_FAILED = 4,
} ota_event_t;

typedef void (*ota_callback_t)(ota_event_t event, int progress, const char *message);

// Initialize OTA updater
void ota_updater_init(void);

// Check for firmware updates
bool ota_updater_check_update(const char *current_version, char *latest_version, size_t version_size);

// Start OTA update
esp_err_t ota_updater_start(const char *firmware_url);

// Register callback
void ota_updater_register_callback(ota_callback_t callback);

// Get current firmware version
const char* ota_updater_get_current_version(void);

// Rollback to previous firmware
esp_err_t ota_updater_rollback(void);

#ifdef __cplusplus
}
#endif

#endif // OTA_UPDATER_H