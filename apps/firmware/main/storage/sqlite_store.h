/**
 * Productivity Assistant - SQLite Storage
 * Local database for offline-first operation
 */

#ifndef SQLITE_STORE_H
#define SQLITE_STORE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Initialize SQLite database
void sqlite_store_init(void);

// Check if database has pending mutations
bool sqlite_store_has_pending_mutations(void);

// Task operations
typedef struct {
    char id[37];
    char title[64];
    char description[256];
    int status;          // 0=pending, 1=active, 2=paused, 3=done, 4=archived
    char project_id[37];
    char parent_task_id[37];
    int32_t sort_order;
    int32_t estimated_minutes;
    int32_t total_tracked_seconds;
    bool is_parallel;
    char metadata[512];
    char created_at[32];
    char updated_at[32];
    char deleted_at[32];
    int32_t version;
} sqlite_task_t;

int sqlite_store_task_create(const sqlite_task_t *task);
int sqlite_store_task_update(const char *id, const sqlite_task_t *task);
int sqlite_store_task_delete(const char *id);
int sqlite_store_task_get(const char *id, sqlite_task_t *task);
int sqlite_store_task_list(sqlite_task_t *tasks, int max_tasks, int *count);
int sqlite_store_task_list_active(sqlite_task_t *tasks, int max_tasks, int *count);

// Time entry operations
typedef struct {
    char id[37];
    char task_id[37];
    char user_id[37];
    char started_at[32];
    char ended_at[32];
    int32_t duration_seconds;
    char source[16];
    char device_id[32];
    char metadata[256];
    char synced_at[32];
} sqlite_time_entry_t;

int sqlite_store_time_entry_create(const sqlite_time_entry_t *entry);
int sqlite_store_time_entry_update(const char *id, const sqlite_time_entry_t *entry);
int sqlite_store_time_entry_get_active(sqlite_time_entry_t *entry);
int sqlite_store_time_entry_list(sqlite_time_entry_t *entries, int max_entries, int *count);

// Project operations
typedef struct {
    char id[37];
    char name[64];
    char color[8];
    char icon[16];
    int32_t sort_order;
    char created_at[32];
    char updated_at[32];
    char archived_at[32];
} sqlite_project_t;

int sqlite_store_project_create(const sqlite_project_t *project);
int sqlite_store_project_update(const char *id, const sqlite_project_t *project);
int sqlite_store_project_list(sqlite_project_t *projects, int max_projects, int *count);

// Mutation queue operations
typedef struct {
    int type;
    char payload[1024];
    int64_t created_at;
    int retries;
} pending_mutation_t;

int sqlite_store_mutation_add(int type, const char *json);
int sqlite_store_mutation_get_all(pending_mutation_t *mutations, int max, int *count);
int sqlite_store_mutation_mark_synced(int id);
int sqlite_store_mutation_increment_retry(int id);

// Database maintenance
void sqlite_store_vacuum(void);
int64_t sqlite_store_get_db_size(void);

#ifdef __cplusplus
}
#endif

#endif // SQLITE_STORE_H