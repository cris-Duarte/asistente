/**
 * Productivity Assistant - Sync Client
 * Custom ElectricSQL Shape client for ESP32
 */

#ifndef SYNC_CLIENT_H
#define SYNC_CLIENT_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Mutation types
typedef enum {
    MUTATION_CREATE_TASK = 1,
    MUTATION_UPDATE_TASK = 2,
    MUTATION_DELETE_TASK = 3,
    MUTATION_CREATE_TIME_ENTRY = 4,
    MUTATION_UPDATE_TIME_ENTRY = 5,
    MUTATION_CREATE_PROJECT = 6,
    MUTATION_UPDATE_PROJECT = 6,
} mutation_type_t;

// Initialize sync client with device ID
void sync_client_init(const char *device_id);

// Pull changes from server (full sync on first run, incremental after)
void sync_client_pull_changes(void);

// Push pending local mutations to server
void sync_client_push_mutations(void);

// Queue a mutation locally (persists to NVS/SD)
bool sync_client_queue_mutation(mutation_type_t type, const char *json_payload);

// Check if there are pending mutations
bool sync_client_has_pending_mutations(void);

// Get last sync timestamp
uint64_t sync_client_get_last_sync_time(void);

// Set auth token for API requests
void sync_client_set_auth_token(const char *token);

// Set server URL
void sync_client_set_server_url(const char *url);

// Sync status callback
typedef void (*sync_status_callback_t)(int status, const char *message);
void sync_client_set_status_callback(sync_status_callback_t callback);

#ifdef __cplusplus
}
#endif

#endif // SYNC_CLIENT_H