#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    DEVICE_SYNC_OFFLINE,
    DEVICE_SYNC_PAIRING,
    DEVICE_SYNC_SYNCING,
    DEVICE_SYNC_SYNCED,
    DEVICE_SYNC_CONFLICT,
    DEVICE_SYNC_ERROR,
} device_sync_status_t;

typedef void (*sync_status_callback_t)(device_sync_status_t status, const char *message);
typedef void (*sync_tasks_callback_t)(void);
typedef void (*sync_pairing_callback_t)(const char *code);

void sync_client_init(const char *device_id, const char *api_url,
                      sync_status_callback_t status_callback,
                      sync_tasks_callback_t tasks_callback,
                      sync_pairing_callback_t pairing_callback);
void sync_client_tick(void);
void sync_client_force_pull(void);
bool sync_client_is_paired(void);

#ifdef __cplusplus
}
#endif
