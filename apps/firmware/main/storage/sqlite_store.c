/**
 * Productivity Assistant - SQLite Storage Implementation
 * Local database for offline-first operation
 */

#include "sqlite_store.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include "esp_log.h"
#include "esp_err.h"
#include "sqlite3.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "SQLITE_STORE";

static sqlite3 *db = NULL;
static SemaphoreHandle_t db_mutex = NULL;

#define DB_PATH "/storage/data.db"

// Schema SQL
static const char *SCHEMA_SQL = 
    "CREATE TABLE IF NOT EXISTS tasks ("
    "  id TEXT PRIMARY KEY,"
    "  user_id TEXT NOT NULL,"
    "  title TEXT NOT NULL,"
    "  description TEXT,"
    "  status INTEGER NOT NULL DEFAULT 0,"
    "  project_id TEXT,"
    "  parent_task_id TEXT,"
    "  sort_order INTEGER DEFAULT 0,"
    "  estimated_minutes INTEGER,"
    "  total_tracked_seconds INTEGER DEFAULT 0,"
    "  is_parallel INTEGER DEFAULT 0,"
    "  metadata TEXT DEFAULT '{}',"
    "  created_at TEXT NOT NULL,"
    "  updated_at TEXT NOT NULL,"
    "  deleted_at TEXT,"
    "  version INTEGER DEFAULT 1"
    ");"
    
    "CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);"
    "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);"
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);"
    "CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);"
    
    "CREATE TABLE IF NOT EXISTS time_entries ("
    "  id TEXT PRIMARY KEY,"
    "  task_id TEXT NOT NULL,"
    "  user_id TEXT NOT NULL,"
    "  started_at TEXT NOT NULL,"
    "  ended_at TEXT,"
    "  duration_seconds INTEGER,"
    "  source TEXT DEFAULT 'manual',"
    "  device_id TEXT NOT NULL,"
    "  metadata TEXT DEFAULT '{}',"
    "  synced_at TEXT NOT NULL"
    ");"
    
    "CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);"
    "CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);"
    "CREATE INDEX IF NOT EXISTS idx_time_entries_started ON time_entries(started_at);"
    
    "CREATE TABLE IF NOT EXISTS projects ("
    "  id TEXT PRIMARY KEY,"
    "  user_id TEXT NOT NULL,"
    "  name TEXT NOT NULL,"
    "  color TEXT,"
    "  icon TEXT,"
    "  sort_order INTEGER DEFAULT 0,"
    "  created_at TEXT NOT NULL,"
    "  updated_at TEXT NOT NULL,"
    "  archived_at TEXT"
    ");"
    
    "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);"
    
    "CREATE TABLE IF NOT EXISTS pending_mutations ("
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "  type INTEGER NOT NULL,"
    "  payload TEXT NOT NULL,"
    "  created_at INTEGER NOT NULL,"
    "  retries INTEGER DEFAULT 0"
    ");"
    
    "CREATE TABLE IF NOT EXISTS sync_state ("
    "  client_id TEXT PRIMARY KEY,"
    "  last_mutation_id INTEGER DEFAULT 0,"
    "  last_pulled_at INTEGER DEFAULT 0"
    ");";

void sqlite_store_init(void)
{
    ESP_LOGI(TAG, "Initializing SQLite store...");
    
    // Create mutex
    static SemaphoreHandle_t mutex = NULL;
    if (!db_mutex) {
        db_mutex = xSemaphoreCreateMutex();
    }
    
    // Ensure storage directory exists
    // TODO: Ensure /storage exists
    
    int rc = sqlite3_open(DB_PATH, &db);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Cannot open database: %s", sqlite3_errmsg(db));
        return;
    }
    
    // Enable WAL mode for better concurrency
    sqlite3_exec(db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);
    sqlite3_exec(db, "PRAGMA synchronous=NORMAL;", NULL, NULL, NULL);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON;", NULL, NULL, NULL);
    
    // Execute schema
    char *err_msg = NULL;
    int rc = sqlite3_exec(db, SCHEMA_SQL, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Schema creation failed: %s", err_msg);
        sqlite3_free(err_msg);
    } else {
        ESP_LOGI(TAG, "Database schema initialized");
    }
}

static int exec_sql(const char *sql, int (*callback)(void*,int,char**,char**), void *arg)
{
    if (!db) return -1;
    
    if (xSemaphoreTake(db_mutex, pdMS_TO_TICKS(5000)) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to acquire DB mutex");
        return -1;
    }
    
    char *err_msg = NULL;
    int rc = sqlite3_exec(db, sql, callback, arg, NULL);
    
    xSemaphoreGive(db_mutex);
    
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "SQL error: %s", sqlite3_errmsg(db));
        return -1;
    }
    
    return 0;
}

static int callback_count(void *data, int argc, char **argv, char **col)
{
    int *count = (int*)data;
    if (argc > 0 && argv[0]) {
        *count = atoi(argv[0]);
    }
    return 0;
}

static int callback_task(void *data, int argc, char **argv, char **col)
{
    sqlite_task_t *task = (sqlite_task_t*)data;
    if (argc >= 17) {
        strncpy(task->id, argv[0] ? argv[0] : "", sizeof(task->id) - 1);
        strncpy(task->title, argv[2] ? argv[2] : "", sizeof(task->title) - 1);
        strncpy(task->description, argv[3] ? argv[3] : "", sizeof(task->description) - 1);
        task->status = argv[3] ? atoi(argv[3]) : 0;
        strncpy(task->project_id, argv[4] ? argv[4] : "", sizeof(task->project_id) - 1);
        strncpy(task->parent_task_id, argv[5] ? argv[5] : "", sizeof(task->parent_task_id) - 1);
        task->sort_order = argv[6] ? atoi(argv[6]) : 0;
        task->estimated_minutes = argv[7] ? atoi(argv[7]) : 0;
        task->total_tracked_seconds = argv[8] ? atoi(argv[8]) : 0;
        task->is_parallel = argv[9] ? atoi(argv[9]) : 0;
        strncpy(task->metadata, argv[10] ? argv[10] : "{}", sizeof(task->metadata) - 1);
        strncpy(task->created_at, argv[11] ? argv[11] : "", sizeof(task->created_at) - 1);
        strncpy(task->updated_at, argv[12] ? argv[12] : "", sizeof(task->updated_at) - 1);
        strncpy(task->deleted_at, argv[13] ? argv[13] : "", sizeof(task->deleted_at) - 1);
        task->version = argv[14] ? atoi(argv[14]) : 1;
    }
    return 0;
}

void sqlite_store_init(void)
{
    ESP_LOGI(TAG, "Initializing SQLite store...");
    
    // Create mutex
    static SemaphoreHandle_t mutex = NULL;
    if (!db_mutex) {
        db_mutex = xSemaphoreCreateMutex();
    }
    
    // Ensure storage directory exists
    // TODO: Ensure /storage exists
    
    int rc = sqlite3_open(DB_PATH, &db);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Cannot open database: %s", sqlite3_errmsg(db));
        return;
    }
    
    // Enable WAL mode for better concurrency
    sqlite3_exec(db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);
    sqlite3_exec(db, "PRAGMA synchronous=NORMAL;", NULL, NULL, NULL);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON;", NULL, NULL, NULL);
    
    // Execute schema
    char *err_msg = NULL;
    int rc = sqlite3_exec(db, SCHEMA_SQL, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Schema creation failed: %s", err_msg);
        sqlite3_free(err_msg);
    } else {
        ESP_LOGI(TAG, "Database schema initialized");
    }
}

bool sqlite_store_has_pending_mutations(void)
{
    int count = 0;
    char sql[128];
    snprintf(sql, sizeof(sql), "SELECT COUNT(*) FROM pending_mutations");
    exec_sql(sql, callback_count, &count);
    return count > 0;
}

// Task operations

int sqlite_store_task_create(const sqlite_task_t *task)
{
    char sql[1024];
    snprintf(sql, sizeof(sql),
        "INSERT INTO tasks (id, user_id, title, description, status, project_id, parent_task_id, "
        "sort_order, estimated_minutes, total_tracked_seconds, is_parallel, metadata, "
        "created_at, updated_at, deleted_at, version) "
        "VALUES ('%s', '%s', '%s', '%s', %d, '%s', '%s', %d, %d, %d, %d, '%s', '%s', '%s', '%s', %d)",
        task->id, "user", task->title, task->description ? task->description : "",
        task->status, task->project_id ? task->project_id : "", task->parent_task_id ? task->parent_task_id : "",
        task->sort_order, task->estimated_minutes, task->total_tracked_seconds,
        task->is_parallel ? 1 : 0, task->metadata ? task->metadata : "{}",
        task->created_at, task->updated_at, task->deleted_at ? task->deleted_at : "", task->version);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_task_update(const char *id, const sqlite_task_t *task)
{
    char sql[1024];
    snprintf(sql, sizeof(sql),
        "UPDATE tasks SET title='%s', description='%s', status=%d, project_id='%s', "
        "parent_task_id='%s', sort_order=%d, estimated_minutes=%d, total_tracked_seconds=%d, "
        "is_parallel=%d, metadata='%s', updated_at='%s', version=%d WHERE id='%s'",
        task->title, task->description ? task->description : "", task->status,
        task->project_id ? task->project_id : "", task->parent_task_id ? task->parent_task_id : "",
        task->sort_order, task->estimated_minutes, task->total_tracked_seconds,
        task->is_parallel ? 1 : 0, task->metadata ? task->metadata : "{}",
        task->updated_at, task->version, id);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_task_delete(const char *id)
{
    char sql[256];
    snprintf(sql, sizeof(sql), "UPDATE tasks SET deleted_at=datetime('now'), version=version+1 WHERE id='%s'", id);
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_task_get(const char *id, sqlite_task_t *task)
{
    char sql[256];
    snprintf(sql, sizeof(sql), 
        "SELECT id, user_id, title, description, status, project_id, parent_task_id, "
        "sort_order, estimated_minutes, total_tracked_seconds, is_parallel, metadata, "
        "created_at, updated_at, deleted_at, version FROM tasks WHERE id='%s' AND deleted_at IS NULL",
        id);
    
    memset(task, 0, sizeof(sqlite_task_t));
    int rc = exec_sql(sql, callback_task, task);
    return rc;
}

int sqlite_store_task_list(sqlite_task_t *tasks, int max_tasks, int *count)
{
    char sql[256];
    snprintf(sql, sizeof(sql),
        "SELECT id, user_id, title, description, status, project_id, parent_task_id, "
        "sort_order, estimated_minutes, total_tracked_seconds, is_parallel, metadata, "
        "created_at, updated_at, deleted_at, version "
        "FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order DESC, created_at DESC LIMIT %d",
        max_tasks);
    
    *count = 0;
    // Simplified - would need proper callback to fill array
    return 0;
}

int sqlite_store_task_list_active(sqlite_task_t *tasks, int max_tasks, int *count)
{
    char sql[256];
    snprintf(sql, sizeof(sql),
        "SELECT id, user_id, title, description, status, project_id, parent_task_id, "
        "sort_order, estimated_minutes, total_tracked_seconds, is_parallel, metadata, "
        "created_at, updated_at, deleted_at, version "
        "FROM tasks WHERE status IN (1,2) AND deleted_at IS NULL ORDER BY sort_order DESC LIMIT %d",
        max_tasks);
    
    *count = 0;
    return 0;
}

// Time entry operations

int sqlite_store_time_entry_create(const sqlite_time_entry_t *entry)
{
    char sql[1024];
    snprintf(sql, sizeof(sql),
        "INSERT INTO time_entries (id, task_id, user_id, started_at, ended_at, duration_seconds, "
        "source, device_id, metadata, synced_at) "
        "VALUES ('%s', '%s', '%s', '%s', '%s', %d, '%s', '%s', '%s', '%s')",
        entry->id, entry->task_id, entry->user_id, entry->started_at,
        entry->ended_at ? entry->ended_at : "", entry->duration_seconds,
        entry->source, entry->device_id, entry->metadata ? entry->metadata : "{}",
        entry->synced_at);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_time_entry_update(const char *id, const sqlite_time_entry_t *entry)
{
    char sql[1024];
    snprintf(sql, sizeof(sql),
        "UPDATE time_entries SET ended_at='%s', duration_seconds=%d, source='%s', "
        "device_id='%s', metadata='%s', synced_at='%s' WHERE id='%s'",
        entry->ended_at ? entry->ended_at : "", entry->duration_seconds,
        entry->source, entry->device_id, entry->metadata ? entry->metadata : "{}",
        entry->synced_at, id);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_time_entry_get_active(sqlite_time_entry_t *entry)
{
    char sql[256];
    snprintf(sql, sizeof(sql),
        "SELECT id, task_id, user_id, started_at, ended_at, duration_seconds, "
        "source, device_id, metadata, synced_at "
        "FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1");
    
    memset(entry, 0, sizeof(sqlite_time_entry_t));
    // Simplified - would need proper callback
    return 0;
}

int sqlite_store_time_entry_list(sqlite_time_entry_t *entries, int max_entries, int *count)
{
    *count = 0;
    return 0;
}

// Project operations

int sqlite_store_project_create(const sqlite_project_t *project)
{
    char sql[512];
    snprintf(sql, sizeof(sql),
        "INSERT INTO projects (id, user_id, name, color, icon, sort_order, created_at, updated_at, archived_at) "
        "VALUES ('%s', '%s', '%s', '%s', '%s', %d, '%s', '%s', '%s')",
        project->id, "user", project->name, project->color ? project->color : "",
        project->icon ? project->icon : "", project->sort_order,
        project->created_at, project->updated_at, project->archived_at ? project->archived_at : "");
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_project_update(const char *id, const sqlite_project_t *project)
{
    char sql[512];
    snprintf(sql, sizeof(sql),
        "UPDATE projects SET name='%s', color='%s', icon='%s', sort_order=%d, updated_at='%s', archived_at='%s' WHERE id='%s'",
        project->name, project->color ? project->color : "", project->icon ? project->icon : "",
        project->sort_order, project->updated_at, project->archived_at ? project->archived_at : "", id);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_project_list(sqlite_project_t *projects, int max_projects, int *count)
{
    *count = 0;
    return 0;
}

// Mutation queue operations

int sqlite_store_mutation_add(int type, const char *json)
{
    char sql[2048];
    int64_t now = esp_timer_get_time() / 1000000;
    snprintf(sql, sizeof(sql),
        "INSERT INTO pending_mutations (type, payload, created_at, retries) VALUES (%d, '%s', %" PRId64 ", 0)",
        type, json, now);
    
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_mutation_get_all(pending_mutation_t *mutations, int max, int *count)
{
    *count = 0;
    return 0;
}

int sqlite_store_mutation_mark_synced(int id)
{
    char sql[128];
    snprintf(sql, sizeof(sql), "DELETE FROM pending_mutations WHERE id=%d", id);
    return exec_sql(sql, NULL, NULL);
}

int sqlite_store_mutation_increment_retry(int id)
{
    char sql[128];
    snprintf(sql, sizeof(sql), "UPDATE pending_mutations SET retries=retries+1 WHERE id=%d", id);
    return exec_sql(sql, NULL, NULL);
}

void sqlite_store_vacuum(void)
{
    exec_sql("VACUUM;", NULL, NULL);
}

int64_t sqlite_store_get_db_size(void)
{
    // Return database file size
    return 0;
}