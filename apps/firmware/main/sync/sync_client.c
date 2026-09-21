#include "sync/sync_client.h"

#include <inttypes.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "core/sync_model.h"
#include "esp_app_desc.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "network/wifi_manager.h"
#include "network/ota_updater.h"
#include "nvs.h"
#include "storage/sqlite_store.h"

static char s_device_id[64];
static char s_api_url[192];
static char s_token[96];
static char s_pairing_id[40];
static char s_polling_token[96];
static int64_t s_next_pair_poll_ms;
static int64_t s_next_pull_ms;
static int64_t s_next_ota_check_ms;
static sync_status_callback_t s_status_callback;
static sync_tasks_callback_t s_tasks_callback;
static sync_pairing_callback_t s_pairing_callback;

typedef struct {
    char *data;
    size_t length;
    size_t capacity;
} response_buffer_t;

static esp_err_t http_event(esp_http_client_event_t *event)
{
    response_buffer_t *buffer = (response_buffer_t *)event->user_data;
    if (event->event_id != HTTP_EVENT_ON_DATA || event->data_len <= 0) return ESP_OK;
    size_t required = buffer->length + (size_t)event->data_len + 1;
    if (required > buffer->capacity) {
        size_t capacity = required < 4096 ? 4096 : required * 2;
        char *next = realloc(buffer->data, capacity);
        if (!next) return ESP_ERR_NO_MEM;
        buffer->data = next;
        buffer->capacity = capacity;
    }
    memcpy(buffer->data + buffer->length, event->data, (size_t)event->data_len);
    buffer->length += (size_t)event->data_len;
    buffer->data[buffer->length] = '\0';
    return ESP_OK;
}

static int request(const char *method, const char *path, const char *body,
                   const char *idempotency_key, int base_version, char **response)
{
    char url[320];
    snprintf(url, sizeof(url), "%s%s", s_api_url, path);
    response_buffer_t buffer = {0};
    esp_http_client_config_t config = {
        .url = url,
        .event_handler = http_event,
        .user_data = &buffer,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 15000,
        .keep_alive_enable = true,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return 0;
    if (strcmp(method, "POST") == 0) esp_http_client_set_method(client, HTTP_METHOD_POST);
    else if (strcmp(method, "PATCH") == 0) esp_http_client_set_method(client, HTTP_METHOD_PATCH);
    else if (strcmp(method, "DELETE") == 0) esp_http_client_set_method(client, HTTP_METHOD_DELETE);
    else esp_http_client_set_method(client, HTTP_METHOD_GET);
    esp_http_client_set_header(client, "Accept", "application/json");
    if (body) {
        esp_http_client_set_header(client, "Content-Type", "application/json");
        esp_http_client_set_post_field(client, body, (int)strlen(body));
    }
    if (s_token[0]) {
        char auth[128];
        snprintf(auth, sizeof(auth), "Bearer %s", s_token);
        esp_http_client_set_header(client, "Authorization", auth);
    }
    if (idempotency_key) esp_http_client_set_header(client, "Idempotency-Key", idempotency_key);
    if (base_version > 0) {
        char version[16];
        snprintf(version, sizeof(version), "%d", base_version);
        esp_http_client_set_header(client, "X-Base-Version", version);
    }
    esp_err_t result = esp_http_client_perform(client);
    int status = result == ESP_OK ? esp_http_client_get_status_code(client) : 0;
    esp_http_client_cleanup(client);
    if (!buffer.data) buffer.data = strdup("");
    *response = buffer.data;
    return status;
}

static void save_pairing_state(void)
{
    nvs_handle_t nvs;
    if (nvs_open("device", NVS_READWRITE, &nvs) != ESP_OK) return;
    nvs_set_str(nvs, "token", s_token);
    nvs_set_str(nvs, "pairing_id", s_pairing_id);
    nvs_set_str(nvs, "poll_token", s_polling_token);
    nvs_commit(nvs);
    nvs_close(nvs);
}

static void load_pairing_state(void)
{
    nvs_handle_t nvs;
    if (nvs_open("device", NVS_READONLY, &nvs) != ESP_OK) return;
    size_t size = sizeof(s_token);
    nvs_get_str(nvs, "token", s_token, &size);
    size = sizeof(s_pairing_id);
    nvs_get_str(nvs, "pairing_id", s_pairing_id, &size);
    size = sizeof(s_polling_token);
    nvs_get_str(nvs, "poll_token", s_polling_token, &size);
    nvs_close(nvs);
}

static void start_pairing(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "hardwareId", s_device_id);
    cJSON_AddStringToObject(root, "name", "M5Stack Tab5");
    cJSON_AddStringToObject(root, "firmwareVersion", esp_app_get_description()->version);
    char *body = cJSON_PrintUnformatted(root);
    char *response = NULL;
    int status = request("POST", "/api/devices/pairing/start", body, NULL, 0, &response);
    cJSON_free(body);
    cJSON_Delete(root);
    if (status == 201) {
        cJSON *json = cJSON_Parse(response);
        cJSON *data = json ? cJSON_GetObjectItem(json, "data") : NULL;
        cJSON *pairing = data ? cJSON_GetObjectItem(data, "pairingId") : NULL;
        cJSON *poll = data ? cJSON_GetObjectItem(data, "pollingToken") : NULL;
        cJSON *code = data ? cJSON_GetObjectItem(data, "code") : NULL;
        if (cJSON_IsString(pairing) && cJSON_IsString(poll) && cJSON_IsString(code)) {
            strlcpy(s_pairing_id, pairing->valuestring, sizeof(s_pairing_id));
            strlcpy(s_polling_token, poll->valuestring, sizeof(s_polling_token));
            save_pairing_state();
            if (s_pairing_callback) s_pairing_callback("");
            if (s_pairing_callback) s_pairing_callback(code->valuestring);
            if (s_status_callback) s_status_callback(DEVICE_SYNC_PAIRING, "Confirma el código en Ajustes");
        }
        cJSON_Delete(json);
    } else if (s_status_callback) {
        s_status_callback(DEVICE_SYNC_ERROR, "No se pudo iniciar la vinculación");
    }
    free(response);
    s_next_pair_poll_ms = esp_timer_get_time() / 1000 + 5000;
}

static void poll_pairing(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "pairingId", s_pairing_id);
    cJSON_AddStringToObject(root, "pollingToken", s_polling_token);
    char *body = cJSON_PrintUnformatted(root);
    char *response = NULL;
    int status = request("POST", "/api/devices/pairing/poll", body, NULL, 0, &response);
    cJSON_free(body);
    cJSON_Delete(root);
    if (status == 200) {
        cJSON *json = cJSON_Parse(response);
        cJSON *data = json ? cJSON_GetObjectItem(json, "data") : NULL;
        cJSON *token = data ? cJSON_GetObjectItem(data, "token") : NULL;
        if (cJSON_IsString(token)) {
            strlcpy(s_token, token->valuestring, sizeof(s_token));
            s_pairing_id[0] = '\0';
            s_polling_token[0] = '\0';
            save_pairing_state();
            s_next_pull_ms = 0;
            if (s_status_callback) s_status_callback(DEVICE_SYNC_SYNCING, "Dispositivo vinculado");
        }
        cJSON_Delete(json);
    } else if (status == 404 || status == 410) {
        s_pairing_id[0] = '\0';
        s_polling_token[0] = '\0';
        save_pairing_state();
    }
    free(response);
    s_next_pair_poll_ms = esp_timer_get_time() / 1000 + 5000;
}

static bool json_task(cJSON *value, stored_task_t *task)
{
    cJSON *id = cJSON_GetObjectItem(value, "id");
    cJSON *title = cJSON_GetObjectItem(value, "title");
    cJSON *status = cJSON_GetObjectItem(value, "status");
    if (!cJSON_IsString(id) || !cJSON_IsString(title) || !cJSON_IsString(status)) return false;
    memset(task, 0, sizeof(*task));
    strlcpy(task->id, id->valuestring, sizeof(task->id));
    strlcpy(task->title, title->valuestring, sizeof(task->title));
    cJSON *description = cJSON_GetObjectItem(value, "description");
    if (cJSON_IsString(description)) strlcpy(task->description, description->valuestring, sizeof(task->description));
    strlcpy(task->status, status->valuestring, sizeof(task->status));
    cJSON *project = cJSON_GetObjectItem(value, "projectId");
    if (cJSON_IsString(project)) strlcpy(task->project_id, project->valuestring, sizeof(task->project_id));
    cJSON *estimate = cJSON_GetObjectItem(value, "estimatedMinutes");
    cJSON *tracked = cJSON_GetObjectItem(value, "totalTrackedSeconds");
    cJSON *version = cJSON_GetObjectItem(value, "version");
    task->estimated_minutes = cJSON_IsNumber(estimate) ? estimate->valueint : 0;
    task->total_tracked_seconds = cJSON_IsNumber(tracked) ? tracked->valueint : 0;
    task->version = cJSON_IsNumber(version) ? version->valueint : 1;
    cJSON *updated = cJSON_GetObjectItem(value, "updatedAt");
    cJSON *last_write = cJSON_GetObjectItem(value, "lastWriteId");
    if (cJSON_IsString(updated)) strlcpy(task->updated_at, updated->valuestring, sizeof(task->updated_at));
    if (cJSON_IsString(last_write)) strlcpy(task->last_write_id, last_write->valuestring, sizeof(task->last_write_id));
    return true;
}

static bool json_time_entry(cJSON *value, stored_time_entry_t *entry)
{
    cJSON *id = cJSON_GetObjectItem(value, "id");
    cJSON *task_id = cJSON_GetObjectItem(value, "taskId");
    cJSON *started_at = cJSON_GetObjectItem(value, "startedAt");
    if (!cJSON_IsString(id) || !cJSON_IsString(task_id) || !cJSON_IsString(started_at)) return false;
    memset(entry, 0, sizeof(*entry));
    strlcpy(entry->id, id->valuestring, sizeof(entry->id));
    strlcpy(entry->task_id, task_id->valuestring, sizeof(entry->task_id));
    strlcpy(entry->started_at, started_at->valuestring, sizeof(entry->started_at));
    cJSON *ended_at = cJSON_GetObjectItem(value, "endedAt");
    cJSON *duration = cJSON_GetObjectItem(value, "durationSeconds");
    cJSON *version = cJSON_GetObjectItem(value, "version");
    cJSON *last_write = cJSON_GetObjectItem(value, "lastWriteId");
    if (cJSON_IsString(ended_at)) strlcpy(entry->ended_at, ended_at->valuestring, sizeof(entry->ended_at));
    entry->duration_seconds = cJSON_IsNumber(duration) ? duration->valueint : 0;
    entry->version = cJSON_IsNumber(version) ? version->valueint : 1;
    if (cJSON_IsString(last_write)) strlcpy(entry->last_write_id, last_write->valuestring, sizeof(entry->last_write_id));
    return true;
}

static void pull_active_timer(void)
{
    char *response = NULL;
    int status = request("GET", "/api/time-entries/active", NULL, NULL, 0, &response);
    if (sync_is_success_status(status)) {
        cJSON *json = cJSON_Parse(response);
        cJSON *data = json ? cJSON_GetObjectItem(json, "data") : NULL;
        stored_time_entry_t entry;
        if (cJSON_IsObject(data) && json_time_entry(data, &entry)) sqlite_store_timer_upsert_server(&entry);
        else if (cJSON_IsNull(data)) sqlite_store_timer_clear_server_active();
        cJSON_Delete(json);
    }
    free(response);
}

static void pull_tasks(void)
{
    char *response = NULL;
    int status = request("GET", "/api/tasks?pageSize=500&includeDeleted=false", NULL, NULL, 0, &response);
    if (status == 401 || status == 403) {
        s_token[0] = '\0';
        save_pairing_state();
    } else if (sync_is_success_status(status)) {
        cJSON *json = cJSON_Parse(response);
        cJSON *data = json ? cJSON_GetObjectItem(json, "data") : NULL;
        cJSON *items = data ? cJSON_GetObjectItem(data, "items") : NULL;
        cJSON *item = NULL;
        cJSON_ArrayForEach(item, items) {
            stored_task_t task;
            if (json_task(item, &task)) sqlite_store_task_upsert_server(&task);
        }
        cJSON_Delete(json);
        if (s_tasks_callback) s_tasks_callback();
        if (s_status_callback) s_status_callback(DEVICE_SYNC_SYNCED, "Sincronizado");
    } else if (s_status_callback) {
        s_status_callback(DEVICE_SYNC_ERROR, "Error al leer tareas");
    }
    free(response);
    s_next_pull_ms = esp_timer_get_time() / 1000 + 30000;
}

static void flush_one(void)
{
    int64_t now = esp_timer_get_time() / 1000;
    stored_mutation_t mutation;
    if (!sqlite_store_mutation_next(now, &mutation)) return;
    char *response = NULL;
    int status = request(mutation.method, mutation.path, mutation.payload[0] ? mutation.payload : NULL,
                         mutation.id, mutation.base_version, &response);
    if (sync_is_success_status(status)) {
        sqlite_store_mutation_complete(mutation.id);
        if (strcmp(mutation.entity, "tasks") == 0) {
            cJSON *json = cJSON_Parse(response);
            cJSON *data = json ? cJSON_GetObjectItem(json, "data") : NULL;
            stored_task_t task;
            if (data && json_task(data, &task)) sqlite_store_task_upsert_server(&task);
            cJSON_Delete(json);
        }
    } else if (status == 409) {
        sqlite_store_mutation_conflict(mutation.id, response);
        if (s_status_callback) s_status_callback(DEVICE_SYNC_CONFLICT, "Conflicto pendiente en Tab5");
    } else {
        int attempts = mutation.attempts + 1;
        sqlite_store_mutation_retry(mutation.id, attempts, now + sync_backoff_ms((uint32_t)attempts));
    }
    free(response);
}

void sync_client_init(const char *device_id, const char *api_url,
                      sync_status_callback_t status_callback,
                      sync_tasks_callback_t tasks_callback,
                      sync_pairing_callback_t pairing_callback)
{
    strlcpy(s_device_id, device_id, sizeof(s_device_id));
    strlcpy(s_api_url, api_url, sizeof(s_api_url));
    size_t length = strlen(s_api_url);
    while (length && s_api_url[length - 1] == '/') s_api_url[--length] = '\0';
    s_status_callback = status_callback;
    s_tasks_callback = tasks_callback;
    s_pairing_callback = pairing_callback;
    load_pairing_state();
}

void sync_client_tick(void)
{
    int64_t now = esp_timer_get_time() / 1000;
    if (!wifi_manager_is_connected()) {
        if (s_status_callback) s_status_callback(DEVICE_SYNC_OFFLINE, "Sin conexión");
        return;
    }
    if (!s_token[0]) {
        if (!s_pairing_id[0]) start_pairing();
        else if (now >= s_next_pair_poll_ms) poll_pairing();
        return;
    }
    if (s_status_callback) s_status_callback(DEVICE_SYNC_SYNCING, "Sincronizando");
    flush_one();
    if (now >= s_next_pull_ms) {
        pull_tasks();
        pull_active_timer();
    }
    if (now >= s_next_ota_check_ms) {
        ota_updater_check_manifest(CONFIG_PRODUCTIVITY_OTA_URL, s_token);
        s_next_ota_check_ms = now + 6 * 60 * 60 * 1000;
    }
}

void sync_client_force_pull(void)
{
    s_next_pull_ms = 0;
}

bool sync_client_is_paired(void)
{
    return s_token[0] != '\0';
}
