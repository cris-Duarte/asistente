#include "storage/sqlite_store.h"

#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "sqlite3.h"

static const char *TAG = "storage";
static sqlite3 *s_db;
static SemaphoreHandle_t s_mutex;

static bool exec_locked(const char *sql)
{
    char *error = NULL;
    int result = sqlite3_exec(s_db, sql, NULL, NULL, &error);
    if (result != SQLITE_OK) {
        ESP_LOGE(TAG, "SQLite: %s", error ? error : sqlite3_errmsg(s_db));
        sqlite3_free(error);
        return false;
    }
    return true;
}

static bool lock_db(void)
{
    return s_db && xSemaphoreTake(s_mutex, pdMS_TO_TICKS(5000)) == pdTRUE;
}

static void unlock_db(void)
{
    xSemaphoreGive(s_mutex);
}

static void copy_text(char *destination, size_t size, const unsigned char *value)
{
    strlcpy(destination, value ? (const char *)value : "", size);
}

static bool enqueue_locked(const stored_mutation_t *mutation)
{
    sqlite3_stmt *statement = NULL;
    const char *sql = "INSERT INTO outbox(id,entity,resource_id,method,path,payload,base_version,attempts,next_attempt_ms,state,created_at) "
                      "VALUES(?,?,?,?,?,?,?,0,?,'pending',?)";
    if (sqlite3_prepare_v2(s_db, sql, -1, &statement, NULL) != SQLITE_OK) return false;
    sqlite3_bind_text(statement, 1, mutation->id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, mutation->entity, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 3, mutation->resource_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 4, mutation->method, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 5, mutation->path, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 6, mutation->payload, -1, SQLITE_TRANSIENT);
    if (mutation->base_version > 0) sqlite3_bind_int(statement, 7, mutation->base_version);
    else sqlite3_bind_null(statement, 7);
    sqlite3_bind_int64(statement, 8, mutation->next_attempt_ms);
    sqlite3_bind_int64(statement, 9, mutation->next_attempt_ms);
    bool ok = sqlite3_step(statement) == SQLITE_DONE;
    sqlite3_finalize(statement);
    return ok;
}

bool sqlite_store_init(void)
{
    s_mutex = xSemaphoreCreateMutex();
    if (!s_mutex || sqlite3_open("/spiffs/productivity.db", &s_db) != SQLITE_OK) {
        ESP_LOGE(TAG, "No se pudo abrir SQLite");
        return false;
    }
    sqlite3_busy_timeout(s_db, 5000);
    if (!lock_db()) return false;
    bool ok = exec_locked("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;") && exec_locked(
        "CREATE TABLE IF NOT EXISTS tasks("
        "id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,"
        "project_id TEXT,estimated_minutes INTEGER,total_tracked_seconds INTEGER NOT NULL DEFAULT 0,"
        "version INTEGER NOT NULL,last_write_id TEXT,updated_at TEXT NOT NULL);"
        "CREATE TABLE IF NOT EXISTS time_entries("
        "id TEXT PRIMARY KEY,task_id TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,duration_seconds INTEGER,"
        "version INTEGER NOT NULL,last_write_id TEXT);"
        "CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer ON time_entries((1)) WHERE ended_at IS NULL;"
        "CREATE TABLE IF NOT EXISTS outbox("
        "id TEXT PRIMARY KEY,entity TEXT NOT NULL,resource_id TEXT NOT NULL,method TEXT NOT NULL,path TEXT NOT NULL,"
        "payload TEXT NOT NULL,base_version INTEGER,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_ms INTEGER NOT NULL,"
        "state TEXT NOT NULL DEFAULT 'pending',server_value TEXT,created_at INTEGER NOT NULL);"
        "CREATE INDEX IF NOT EXISTS outbox_order ON outbox(resource_id,created_at);"
        "CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);"
    );
    unlock_db();
    ESP_LOGI(TAG, "SQLite lista");
    return ok;
}

int sqlite_store_task_list(stored_task_t *tasks, int capacity)
{
    if (!lock_db()) return 0;
    sqlite3_stmt *statement = NULL;
    int count = 0;
    const char *sql = "SELECT id,title,description,status,project_id,estimated_minutes,total_tracked_seconds,version,updated_at,last_write_id "
                      "FROM tasks ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,updated_at DESC LIMIT ?";
    if (sqlite3_prepare_v2(s_db, sql, -1, &statement, NULL) == SQLITE_OK) {
        sqlite3_bind_int(statement, 1, capacity);
        while (count < capacity && sqlite3_step(statement) == SQLITE_ROW) {
            stored_task_t *task = &tasks[count++];
            memset(task, 0, sizeof(*task));
            copy_text(task->id, sizeof(task->id), sqlite3_column_text(statement, 0));
            copy_text(task->title, sizeof(task->title), sqlite3_column_text(statement, 1));
            copy_text(task->description, sizeof(task->description), sqlite3_column_text(statement, 2));
            copy_text(task->status, sizeof(task->status), sqlite3_column_text(statement, 3));
            copy_text(task->project_id, sizeof(task->project_id), sqlite3_column_text(statement, 4));
            task->estimated_minutes = sqlite3_column_int(statement, 5);
            task->total_tracked_seconds = sqlite3_column_int(statement, 6);
            task->version = sqlite3_column_int(statement, 7);
            copy_text(task->updated_at, sizeof(task->updated_at), sqlite3_column_text(statement, 8));
            copy_text(task->last_write_id, sizeof(task->last_write_id), sqlite3_column_text(statement, 9));
        }
    }
    sqlite3_finalize(statement);
    unlock_db();
    return count;
}

bool sqlite_store_task_upsert_server(const stored_task_t *task)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    const char *sql = "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                      "title=excluded.title,description=excluded.description,status=excluded.status,project_id=excluded.project_id,"
                      "estimated_minutes=excluded.estimated_minutes,total_tracked_seconds=excluded.total_tracked_seconds,"
                      "version=excluded.version,last_write_id=excluded.last_write_id,updated_at=excluded.updated_at "
                      "WHERE excluded.version>=tasks.version AND NOT EXISTS(SELECT 1 FROM outbox WHERE entity='tasks' AND resource_id=excluded.id AND state!='done')";
    bool ok = sqlite3_prepare_v2(s_db, sql, -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        sqlite3_bind_text(statement, 1, task->id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, task->title, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 3, task->description, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 4, task->status, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 5, task->project_id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(statement, 6, task->estimated_minutes);
        sqlite3_bind_int(statement, 7, task->total_tracked_seconds);
        sqlite3_bind_int(statement, 8, task->version);
        sqlite3_bind_text(statement, 9, task->last_write_id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 10, task->updated_at, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    unlock_db();
    return ok;
}

bool sqlite_store_task_set_status_local(const char *task_id, const char *status, const char *updated_at,
                                        const stored_mutation_t *mutation)
{
    if (!lock_db()) return false;
    bool ok = exec_locked("BEGIN IMMEDIATE");
    sqlite3_stmt *statement = NULL;
    if (ok) ok = sqlite3_prepare_v2(s_db, "UPDATE tasks SET status=?,updated_at=?,version=version+1,last_write_id=? WHERE id=?", -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        sqlite3_bind_text(statement, 1, status, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, updated_at, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 3, mutation->id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 4, task_id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE && sqlite3_changes(s_db) == 1;
    }
    sqlite3_finalize(statement);
    if (ok) ok = enqueue_locked(mutation);
    exec_locked(ok ? "COMMIT" : "ROLLBACK");
    unlock_db();
    return ok;
}

bool sqlite_store_timer_start_local(const stored_time_entry_t *entry, const stored_mutation_t *mutation)
{
    if (!lock_db()) return false;
    bool ok = exec_locked("BEGIN IMMEDIATE");
    sqlite3_stmt *statement = NULL;
    if (ok) ok = sqlite3_prepare_v2(s_db, "INSERT INTO time_entries(id,task_id,started_at,version,last_write_id) VALUES(?,?,?,1,?)", -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        sqlite3_bind_text(statement, 1, entry->id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, entry->task_id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 3, entry->started_at, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 4, mutation->id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    if (ok) ok = enqueue_locked(mutation);
    exec_locked(ok ? "COMMIT" : "ROLLBACK");
    unlock_db();
    return ok;
}

bool sqlite_store_timer_stop_local(const stored_time_entry_t *entry, const stored_mutation_t *mutation)
{
    if (!lock_db()) return false;
    bool ok = exec_locked("BEGIN IMMEDIATE");
    sqlite3_stmt *statement = NULL;
    if (ok) ok = sqlite3_prepare_v2(s_db, "UPDATE time_entries SET ended_at=?,duration_seconds=?,version=version+1,last_write_id=? WHERE id=? AND ended_at IS NULL", -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        sqlite3_bind_text(statement, 1, entry->ended_at, -1, SQLITE_TRANSIENT);
        sqlite3_bind_int(statement, 2, entry->duration_seconds);
        sqlite3_bind_text(statement, 3, mutation->id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 4, entry->id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE && sqlite3_changes(s_db) == 1;
    }
    sqlite3_finalize(statement);
    statement = NULL;
    if (ok) {
        ok = sqlite3_prepare_v2(s_db, "UPDATE tasks SET total_tracked_seconds=total_tracked_seconds+?,updated_at=? WHERE id=?", -1, &statement, NULL) == SQLITE_OK;
        if (ok) {
            sqlite3_bind_int(statement, 1, entry->duration_seconds);
            sqlite3_bind_text(statement, 2, entry->ended_at, -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(statement, 3, entry->task_id, -1, SQLITE_TRANSIENT);
            ok = sqlite3_step(statement) == SQLITE_DONE;
        }
        sqlite3_finalize(statement);
    }
    if (ok) ok = enqueue_locked(mutation);
    exec_locked(ok ? "COMMIT" : "ROLLBACK");
    unlock_db();
    return ok;
}

bool sqlite_store_timer_get_active(stored_time_entry_t *entry)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    bool found = false;
    if (sqlite3_prepare_v2(s_db, "SELECT id,task_id,started_at,version,last_write_id FROM time_entries WHERE ended_at IS NULL LIMIT 1", -1, &statement, NULL) == SQLITE_OK && sqlite3_step(statement) == SQLITE_ROW) {
        memset(entry, 0, sizeof(*entry));
        copy_text(entry->id, sizeof(entry->id), sqlite3_column_text(statement, 0));
        copy_text(entry->task_id, sizeof(entry->task_id), sqlite3_column_text(statement, 1));
        copy_text(entry->started_at, sizeof(entry->started_at), sqlite3_column_text(statement, 2));
        entry->version = sqlite3_column_int(statement, 3);
        copy_text(entry->last_write_id, sizeof(entry->last_write_id), sqlite3_column_text(statement, 4));
        found = true;
    }
    sqlite3_finalize(statement);
    unlock_db();
    return found;
}

bool sqlite_store_timer_upsert_server(const stored_time_entry_t *entry)
{
    if (!lock_db()) return false;
    bool ok = exec_locked("BEGIN IMMEDIATE");
    sqlite3_stmt *statement = NULL;
    if (ok) {
        ok = sqlite3_prepare_v2(s_db,
            "DELETE FROM time_entries WHERE ended_at IS NULL AND id<>? AND NOT EXISTS("
            "SELECT 1 FROM outbox WHERE entity='time_entries' AND resource_id=time_entries.id AND state!='done')",
            -1, &statement, NULL) == SQLITE_OK;
    }
    if (ok) {
        sqlite3_bind_text(statement, 1, entry->id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    statement = NULL;
    if (ok) {
        ok = sqlite3_prepare_v2(s_db,
            "INSERT INTO time_entries(id,task_id,started_at,ended_at,duration_seconds,version,last_write_id) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,started_at=excluded.started_at,ended_at=excluded.ended_at,"
            "duration_seconds=excluded.duration_seconds,version=excluded.version,last_write_id=excluded.last_write_id "
            "WHERE excluded.version>=time_entries.version AND NOT EXISTS(SELECT 1 FROM outbox WHERE entity='time_entries' "
            "AND resource_id=excluded.id AND state!='done')",
            -1, &statement, NULL) == SQLITE_OK;
    }
    if (ok) {
        sqlite3_bind_text(statement, 1, entry->id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, entry->task_id, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 3, entry->started_at, -1, SQLITE_TRANSIENT);
        if (entry->ended_at[0]) sqlite3_bind_text(statement, 4, entry->ended_at, -1, SQLITE_TRANSIENT);
        else sqlite3_bind_null(statement, 4);
        if (entry->ended_at[0]) sqlite3_bind_int(statement, 5, entry->duration_seconds);
        else sqlite3_bind_null(statement, 5);
        sqlite3_bind_int(statement, 6, entry->version);
        sqlite3_bind_text(statement, 7, entry->last_write_id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    exec_locked(ok ? "COMMIT" : "ROLLBACK");
    unlock_db();
    return ok;
}

bool sqlite_store_timer_clear_server_active(void)
{
    if (!lock_db()) return false;
    bool ok = exec_locked(
        "DELETE FROM time_entries WHERE ended_at IS NULL AND NOT EXISTS(SELECT 1 FROM outbox "
        "WHERE entity='time_entries' AND resource_id=time_entries.id AND state!='done')");
    unlock_db();
    return ok;
}

bool sqlite_store_has_pending_for(const char *entity, const char *resource_id)
{
    if (!lock_db()) return true;
    sqlite3_stmt *statement = NULL;
    bool found = sqlite3_prepare_v2(s_db, "SELECT 1 FROM outbox WHERE entity=? AND resource_id=? AND state!='done' LIMIT 1", -1, &statement, NULL) == SQLITE_OK;
    if (found) {
        sqlite3_bind_text(statement, 1, entity, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, resource_id, -1, SQLITE_TRANSIENT);
        found = sqlite3_step(statement) == SQLITE_ROW;
    }
    sqlite3_finalize(statement);
    unlock_db();
    return found;
}

bool sqlite_store_mutation_next(int64_t now_ms, stored_mutation_t *mutation)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    const char *sql = "SELECT id,entity,resource_id,method,path,payload,COALESCE(base_version,0),attempts,next_attempt_ms FROM outbox "
                      "WHERE state='pending' AND next_attempt_ms<=? AND NOT EXISTS(SELECT 1 FROM outbox earlier WHERE earlier.resource_id=outbox.resource_id AND earlier.created_at<outbox.created_at) ORDER BY created_at LIMIT 1";
    bool found = sqlite3_prepare_v2(s_db, sql, -1, &statement, NULL) == SQLITE_OK;
    if (found) {
        sqlite3_bind_int64(statement, 1, now_ms);
        found = sqlite3_step(statement) == SQLITE_ROW;
    }
    if (found) {
        memset(mutation, 0, sizeof(*mutation));
        copy_text(mutation->id, sizeof(mutation->id), sqlite3_column_text(statement, 0));
        copy_text(mutation->entity, sizeof(mutation->entity), sqlite3_column_text(statement, 1));
        copy_text(mutation->resource_id, sizeof(mutation->resource_id), sqlite3_column_text(statement, 2));
        copy_text(mutation->method, sizeof(mutation->method), sqlite3_column_text(statement, 3));
        copy_text(mutation->path, sizeof(mutation->path), sqlite3_column_text(statement, 4));
        copy_text(mutation->payload, sizeof(mutation->payload), sqlite3_column_text(statement, 5));
        mutation->base_version = sqlite3_column_int(statement, 6);
        mutation->attempts = sqlite3_column_int(statement, 7);
        mutation->next_attempt_ms = sqlite3_column_int64(statement, 8);
    }
    sqlite3_finalize(statement);
    unlock_db();
    return found;
}

static bool mutation_update(const char *sql, const char *id, int attempts, int64_t next_attempt_ms, const char *server_value)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    bool ok = sqlite3_prepare_v2(s_db, sql, -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        int index = 1;
        if (attempts >= 0) sqlite3_bind_int(statement, index++, attempts);
        if (next_attempt_ms >= 0) sqlite3_bind_int64(statement, index++, next_attempt_ms);
        if (server_value) sqlite3_bind_text(statement, index++, server_value, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, index, id, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    unlock_db();
    return ok;
}

bool sqlite_store_mutation_complete(const char *id)
{
    return mutation_update("DELETE FROM outbox WHERE id=?", id, -1, -1, NULL);
}

bool sqlite_store_mutation_retry(const char *id, int attempts, int64_t next_attempt_ms)
{
    return mutation_update("UPDATE outbox SET attempts=?,next_attempt_ms=? WHERE id=?", id, attempts, next_attempt_ms, NULL);
}

bool sqlite_store_mutation_conflict(const char *id, const char *server_value)
{
    return mutation_update("UPDATE outbox SET state='conflict',server_value=? WHERE id=?", id, -1, -1, server_value);
}

int sqlite_store_pending_count(void)
{
    if (!lock_db()) return 0;
    sqlite3_stmt *statement = NULL;
    int count = 0;
    if (sqlite3_prepare_v2(s_db, "SELECT count(*) FROM outbox", -1, &statement, NULL) == SQLITE_OK && sqlite3_step(statement) == SQLITE_ROW) count = sqlite3_column_int(statement, 0);
    sqlite3_finalize(statement);
    unlock_db();
    return count;
}

bool sqlite_store_kv_set(const char *key, const char *value)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    bool ok = sqlite3_prepare_v2(s_db, "INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", -1, &statement, NULL) == SQLITE_OK;
    if (ok) {
        sqlite3_bind_text(statement, 1, key, -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, value, -1, SQLITE_TRANSIENT);
        ok = sqlite3_step(statement) == SQLITE_DONE;
    }
    sqlite3_finalize(statement);
    unlock_db();
    return ok;
}

bool sqlite_store_kv_get(const char *key, char *value, int value_size)
{
    if (!lock_db()) return false;
    sqlite3_stmt *statement = NULL;
    bool found = sqlite3_prepare_v2(s_db, "SELECT value FROM kv WHERE key=?", -1, &statement, NULL) == SQLITE_OK;
    if (found) {
        sqlite3_bind_text(statement, 1, key, -1, SQLITE_TRANSIENT);
        found = sqlite3_step(statement) == SQLITE_ROW;
    }
    if (found) copy_text(value, (size_t)value_size, sqlite3_column_text(statement, 0));
    sqlite3_finalize(statement);
    unlock_db();
    return found;
}
