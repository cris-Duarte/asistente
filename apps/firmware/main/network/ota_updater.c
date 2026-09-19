/**
 * Productivity Assistant - OTA Updater Implementation
 */

#include "ota_updater.h"
#include <string.h>
#include "esp_log.h"
#include "esp_https_ota.h"
#include "esp_crt_bundle.h"
#include "esp_app_format.h"
#include "nvs_flash.h"
#include "nvs.h"

static const char *TAG = "OTA_UPDATER";

static char current_version[32] = "0.1.0";
static ota_callback_t ota_callback = NULL;

static void ota_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == ESP_HTTPS_OTA_EVENT) {
        switch (event_id) {
            case ESP_HTTPS_OTA_START:
                if (ota_updater_callback) ota_callback(OTA_EVENT_START, 0, "Iniciando actualización...");
                break;
            case ESP_HTTPS_OTA_CONNECTED:
                if (ota_callback) ota_callback(OTA_EVENT_PROGRESS, 5, "Conectado al servidor");
                break;
            case ESP_HTTPS_OTA_GET_IMG_DESC:
                if (ota_callback) ota_callback(OTA_EVENT_PROGRESS, 10, "Obteniendo información de firmware");
                break;
            case ESP_HTTPS_OTA_GET_IMG_CHUNK:
                if (ota_callback) ota_callback(OTA_EVENT_PROGRESS, 50, "Descargando firmware...");
                break;
            case ESP_HTTPS_OTA_WRITE_FLASH:
                if (ota_callback) ota_callback(OTA_EVENT_PROGRESS, 80, "Escribiendo en flash...");
                break;
            case ESP_HTTPS_OTA_UPDATE_BOOT_PARTITION:
                if (ota_callback) ota_callback(OTA_EVENT_PROGRESS, 95, "Actualizando partición de arranque");
                break;
            case ESP_HTTPS_OTA_FINISH:
                if (ota_callback) ota_callback(OTA_EVENT_SUCCESS, 100, "Actualización completada");
                break;
            case ESP_HTTPS_OTA_ABORT:
                if (ota_callback) ota_callback(OTA_EVENT_FAILED, 0, "Actualización abortada");
                break;
        }
    }
}

void ota_updater_init(void)
{
    ESP_LOGI(TAG, "Initializing OTA updater...");
    
    // Get current firmware version
    const esp_app_desc_t *app_desc = esp_app_get_description();
    if (app_desc) {
        strncpy(current_version, app_desc->version, sizeof(current_version) - 1);
    }
    
    ESP_ERROR_CHECK(esp_event_handler_register(ESP_HTTPS_OTA_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    
    ESP_LOGI(TAG, "OTA updater initialized. Current version: %s", current_version);
}

bool ota_updater_check_update(const char *current_version, char *latest_version, size_t version_size)
{
    // TODO: Implement version check against server
    // For now, return false
    return false;
}

esp_err_t ota_updater_start(const char *firmware_url)
{
    ESP_LOGI(TAG, "Starting OTA update from: %s", firmware_url);
    
    esp_http_client_config_t config = {
        .url = firmware_url,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 60000,
    };
    
    esp_https_ota_config_t ota_config = {
        .http_config = &config,
    };
    
    esp_err_t err = esp_https_ota(&ota_config);
    
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "OTA update successful, restarting...");
        esp_restart();
    } else {
        ESP_LOGE(TAG, "OTA update failed: %s", esp_err_to_name(err));
    }
    
    return err;
}

void ota_updater_register_callback(ota_callback_t callback)
{
    ota_callback = callback;
}

const char* ota_updater_get_current_version(void)
{
    return current_version;
}

esp_err_t ota_updater_rollback(void)
{
    ESP_LOGI(TAG, "Rolling back to previous firmware...");
    return esp_ota_mark_app_invalid_rollback_and_reboot();
}