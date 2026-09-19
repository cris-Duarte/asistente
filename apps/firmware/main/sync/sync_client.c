/**
 * Productivity Assistant - Sync Client Implementation
 * Custom ElectricSQL Shape client for ESP32
 */

#include "sync_client.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "cJSON.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char *TAG = "SYNC_CLIENT";

// Configuration
static char device_id[32] = {0};
static char server_url[128] = "https://api.productivity-assistant.local";
static char auth_token[256] = {0};
static uint64_t last_sync_time = 0;

// Mutation queue
#define MAX_PENDING_MUTATIONS 100
static SemaphoreHandle_t mutation_mutex = NULL;
static int pending_count = 0;

// Status callback
static void (*status_callback)(int, const char *) = NULL;

// Forward declarations
static void save_mutations_to_nvs(void);
static void load_mutations_from_nvs(void);
static esp_err_t http_request(const char *method, const char *path, const char *body, char **response);
static void process_pull_response(const char *response);
static void process_push_response(const char *response);

void sync_client_init(const char *dev_id)
{
    ESP_LOGI(TAG, "Initializing sync client for device: %s", dev_id);
    
    strncpy(device_id, dev_id, sizeof(device_id) - 1);
    
    // Create mutex for mutation queue
    mutation_mutex = xSemaphoreCreateMutex();
    
    // Load pending mutations from NVS
    load_mutations_from_nvs();
    
    // Load last sync time
    nvs_handle_t nvs_handle;
    if (nvs_open("sync", NVS_READONLY, &nvs_handle) == ESP_OK) {
        size_t required_size = sizeof(last_sync_time);
        nvs_get_blob(nvs_handle, "last_sync", &last_sync_time, &required_size);
        nvs_close(nvs_handle);
    }
    
    ESP_LOGI(TAG, "Sync client initialized. Last sync: %" PRIu64, last_sync_time);
}

void sync_client_set_auth_token(const char *token)
{
    strncpy(auth_token, token, sizeof(auth_token) - 1);
}

void sync_client_set_server_url(const char *url)
{
    strncpy(server_url, url, sizeof(server_url) - 1);
}

void sync_client_set_status_callback(void (*callback)(int, const char *))
{
    status_callback = callback;
}

void sync_client_pull_changes(void)
{
    ESP_LOGI(TAG, "Pulling changes from server...");
    
    if (status_callback) status_callback(1, "Sincronizando...");
    
    // Build request URL with last sync timestamp
    char url[256];
    snprintf(url, sizeof(url), "%s/v1/shape?table=tasks&offset=%" PRIu64 "&live=false", server_url, last_sync_time);
    
    char *response = NULL;
    esp_err_t err = http_request("GET", url, NULL, &response);
    
    if (err == ESP_OK && response) {
        process_pull_response(response);
        free(response);
        
        // Update last sync time
        last_sync_time = esp_timer_get_time() / 1000000; // Convert to seconds
        
        // Save to NVS
        nvs_handle_t nvs_handle;
        if (nvs_open("sync", NVS_READWRITE, &nvs_handle) == ESP_OK) {
            nvs_set_blob(nvs_handle, "last_sync", &last_sync_time, sizeof(last_sync_time));
            nvs_commit(nvs_handle);
            nvs_close(nvs_handle);
        }
        
        if (status_callback) status_callback(2, "Sincronizado");
    } else {
        ESP_LOGE(TAG, "Failed to pull changes: %s", esp_err_to_name(err));
        if (status_callback) status_callback(-1, "Error de sincronización");
    }
}

void sync_client_push_mutations(void)
{
    // TODO: Implement mutation pushing
    // This would send queued mutations to the server
    ESP_LOGI(TAG, "Pushing %d pending mutations", pending_count);
}

bool sync_client_queue_mutation(int type, const char *json_payload)
{
    // TODO: Implement mutation queuing to NVS/SD
    return true;
}

bool sync_client_has_pending_mutations(void)
{
    return pending_count > 0;
}

uint64_t sync_client_get_last_sync_time(void)
{
    return last_sync_time;
}

// Private functions

static void load_mutations_from_nvs(void)
{
    // TODO: Load pending mutations from NVS
    pending_count = 0;
}

static void save_mutations_to_nvs(void)
{
    // TODO: Save pending mutations to NVS
}

static esp_err_t http_request(const char *method, const char *path, const char *body, char **response)
{
    esp_http_client_config_t config = {
        .url = path,
        .method = strcmp(method, "POST") == 0 ? HTTP_METHOD_POST : HTTP_METHOD_GET,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 10000,
        .buffer_size = 8192,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        return ESP_FAIL;
    }
    
    // Set headers
    if (strlen(auth_token) > 0) {
        char auth_header[512];
        snprintf(auth_header, sizeof(auth_header), "Bearer %s", auth_token);
        esp_http_client_set_header(client, "Authorization", auth_header);
    }
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-Device-ID", device_id);
    
    if (body) {
        esp_http_client_set_post_field(client, body, strlen(body));
    }
    
    esp_err_t err = esp_http_client_perform(client);
    
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        int content_length = esp_http_client_get_content_length(client);
        
        if (status_code >= 200 && status_code < 300) {
            *response = malloc(content_length + 1);
            if (*response) {
                int read_len = esp_http_client_read_response(client, *response, content_length);
                (*response)[read_len] = '\0';
            }
        } else {
            ESP_LOGE(TAG, "HTTP error: %d", status_code);
            err = ESP_FAIL;
        }
    }
    
    esp_http_client_cleanup(client);
    return err;
}

static void process_pull_response(const char *response)
{
    cJSON *root = cJSON_Parse(response);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse JSON response");
        return;
    }
    
    // Process tasks
    cJSON *tasks = cJSON_GetObjectItem(root, "tasks");
    if (tasks && cJSON_IsArray(tasks)) {
        int task_count = cJSON_GetArraySize(tasks);
        ESP_LOGI(TAG, "Received %d tasks", task_count);
        
        // TODO: Process tasks and store in SQLite
        for (int i = 0; i < task_count; i++) {
            cJSON *task = cJSON_GetArrayItem(tasks, i);
            // Process each task
        }
    }
    
    // Process time entries
    cJSON *time_entries = cJSON_GetObjectItem(root, "time_entries");
    if (time_entries && cJSON_IsArray(time_entries)) {
        int entry_count = cJSON_GetArraySize(time_entries);
        ESP_LOGI(TAG, "Received %d time entries", entry_count);
        
        // TODO: Process time entries and store in SQLite
    }
    
    // Process projects
    cJSON *projects = cJSON_GetObjectItem(root, "projects");
    if (projects && cJSON_IsArray(projects)) {
        int project_count = cJSON_GetArraySize(projects);
        ESP_LOGI(TAG, "Received %d projects", project_count);
        
        // TODO: Process projects and store in SQLite
    }
    
    cJSON_Delete(root);
}

static void process_push_response(const char *response)
{
    // Process server response after push
    cJSON *root = cJSON_Parse(response);
    if (root) {
        // Check for conflicts, etc.
        cJSON_Delete(root);
    }
}