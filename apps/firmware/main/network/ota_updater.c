#include "network/ota_updater.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_system.h"

static const char *TAG = "ota";

typedef struct {
    char *data;
    size_t length;
} ota_response_t;

static esp_err_t manifest_event(esp_http_client_event_t *event)
{
    ota_response_t *response = (ota_response_t *)event->user_data;
    if (event->event_id != HTTP_EVENT_ON_DATA || event->data_len <= 0) return ESP_OK;
    char *next = realloc(response->data, response->length + (size_t)event->data_len + 1);
    if (!next) return ESP_ERR_NO_MEM;
    response->data = next;
    memcpy(response->data + response->length, event->data, (size_t)event->data_len);
    response->length += (size_t)event->data_len;
    response->data[response->length] = '\0';
    return ESP_OK;
}

void ota_updater_confirm_running_image(void)
{
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    if (esp_ota_get_state_partition(running, &state) == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY) {
        ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback());
    }
}

bool ota_updater_install(const char *signed_image_url)
{
    if (!signed_image_url || strncmp(signed_image_url, "https://", 8) != 0) return false;
    esp_http_client_config_t http = {
        .url = signed_image_url,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 30000,
        .keep_alive_enable = true,
    };
    esp_https_ota_config_t ota = { .http_config = &http };
    esp_err_t result = esp_https_ota(&ota);
    if (result != ESP_OK) {
        ESP_LOGE(TAG, "OTA falló: %s", esp_err_to_name(result));
        return false;
    }
    ESP_LOGI(TAG, "OTA verificada; reiniciando");
    esp_restart();
    return true;
}

bool ota_updater_check_manifest(const char *manifest_url, const char *device_token)
{
    if (!manifest_url || strncmp(manifest_url, "https://", 8) != 0) return false;
    ota_response_t response = {0};
    esp_http_client_config_t config = {
        .url = manifest_url,
        .event_handler = manifest_event,
        .user_data = &response,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 15000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return false;
    if (device_token && device_token[0]) {
        char authorization[128];
        snprintf(authorization, sizeof(authorization), "Bearer %s", device_token);
        esp_http_client_set_header(client, "Authorization", authorization);
    }
    esp_err_t result = esp_http_client_perform(client);
    int status = result == ESP_OK ? esp_http_client_get_status_code(client) : 0;
    esp_http_client_cleanup(client);
    if (status != 200 || !response.data) {
        free(response.data);
        return false;
    }

    cJSON *manifest = cJSON_Parse(response.data);
    free(response.data);
    cJSON *version = manifest ? cJSON_GetObjectItem(manifest, "version") : NULL;
    cJSON *url = manifest ? cJSON_GetObjectItem(manifest, "url") : NULL;
    cJSON *secure_version = manifest ? cJSON_GetObjectItem(manifest, "secureVersion") : NULL;
    const esp_app_desc_t *current = esp_app_get_description();
    bool valid = cJSON_IsString(version) && cJSON_IsString(url)
        && cJSON_IsNumber(secure_version)
        && secure_version->valueint >= (int)current->secure_version
        && strlen(url->valuestring) < 320
        && strncmp(url->valuestring, "https://", 8) == 0;
    bool update = valid && strcmp(version->valuestring, current->version) != 0;
    if (update) ESP_LOGI(TAG, "Actualización OTA disponible: %s", version->valuestring);
    char image_url[320] = {0};
    if (update) strlcpy(image_url, url->valuestring, sizeof(image_url));
    cJSON_Delete(manifest);
    return update ? ota_updater_install(image_url) : valid;
}
