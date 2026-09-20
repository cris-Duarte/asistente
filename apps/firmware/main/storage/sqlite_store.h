#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define STORAGE_MAX_TASKS 64

typedef struct {
    char id[37];
    char title[161];
    char description[321];
    char status[16];
    char project_id[37];
    int32_t estimated_minutes;
    int32_t total_tracked_seconds;
    int32_t version;
    char updated_at[40];
    char last_write_id[37];
} stored_task_t;

typedef struct {
    char id[37];
    char task_id[37];
    char started_at[40];
    char ended_at[40];
    int32_t duration_seconds;
    int32_t version;
    char last_write_id[37];
} stored_time_entry_t;

typedef struct {
    char id[37];
    char entity[24];
    char resource_id[37];
    char method[8];
    char path[128];
    char payload[1024];
    int32_t base_version;
    int32_t attempts;
    int64_t next_attempt_ms;
} stored_mutation_t;

bool sqlite_store_init(void);
int sqlite_store_task_list(stored_task_t *tasks, int capacity);
bool sqlite_store_task_upsert_server(const stored_task_t *task);
bool sqlite_store_task_set_status_local(const char *task_id, const char *status, const char *updated_at,
                                        const stored_mutation_t *mutation);
bool sqlite_store_timer_start_local(const stored_time_entry_t *entry, const stored_mutation_t *mutation);
bool sqlite_store_timer_stop_local(const stored_time_entry_t *entry, const stored_mutation_t *mutation);
bool sqlite_store_timer_get_active(stored_time_entry_t *entry);

bool sqlite_store_has_pending_for(const char *entity, const char *resource_id);
bool sqlite_store_mutation_next(int64_t now_ms, stored_mutation_t *mutation);
bool sqlite_store_mutation_complete(const char *id);
bool sqlite_store_mutation_retry(const char *id, int attempts, int64_t next_attempt_ms);
bool sqlite_store_mutation_conflict(const char *id, const char *server_value);
int sqlite_store_pending_count(void);

bool sqlite_store_kv_set(const char *key, const char *value);
bool sqlite_store_kv_get(const char *key, char *value, int value_size);

#ifdef __cplusplus
}
#endif
