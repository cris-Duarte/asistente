#include "network/ota_updater.h"

#include <string.h>
#include "esp_crt_bundle.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_system.h"

static const char *TAG = "ota";

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
