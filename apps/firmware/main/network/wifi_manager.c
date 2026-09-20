#include "network/wifi_manager.h"

#include <stdlib.h>
#include <string.h>
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "nvs.h"

static const char *TAG = "wifi";
static const int CONNECTED_BIT = BIT0;
static EventGroupHandle_t s_events;
static wifi_manager_callback_t s_callback;
static bool s_started;
static int s_retries;

static void event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)data;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_events, CONNECTED_BIT);
        if (s_retries++ < 12) {
            esp_wifi_connect();
            if (s_callback) s_callback(false, "Reconectando Wi-Fi");
        } else if (s_callback) {
            s_callback(false, "Wi-Fi sin conexión");
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        s_retries = 0;
        xEventGroupSetBits(s_events, CONNECTED_BIT);
        if (s_callback) s_callback(true, "Wi-Fi conectado");
    }
}

bool wifi_manager_init(wifi_manager_callback_t callback)
{
    s_callback = callback;
    s_events = xEventGroupCreate();
    if (!s_events) return false;
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&config));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, event_handler, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    s_started = true;
    return true;
}

bool wifi_manager_connect_saved(void)
{
    nvs_handle_t nvs;
    char ssid[33] = {0};
    char password[65] = {0};
    size_t ssid_size = sizeof(ssid);
    size_t password_size = sizeof(password);
    if (nvs_open("wifi", NVS_READONLY, &nvs) != ESP_OK) return false;
    esp_err_t result = nvs_get_str(nvs, "ssid", ssid, &ssid_size);
    if (result == ESP_OK) result = nvs_get_str(nvs, "password", password, &password_size);
    nvs_close(nvs);
    return result == ESP_OK && wifi_manager_save_and_connect(ssid, password);
}

bool wifi_manager_save_and_connect(const char *ssid, const char *password)
{
    if (!s_started || !ssid || !ssid[0]) return false;
    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, ssid, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, password ? password : "", sizeof(config.sta.password));
    config.sta.threshold.authmode = password && password[0] ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
    config.sta.pmf_cfg.capable = true;
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));

    nvs_handle_t nvs;
    if (nvs_open("wifi", NVS_READWRITE, &nvs) == ESP_OK) {
        nvs_set_str(nvs, "ssid", ssid);
        nvs_set_str(nvs, "password", password ? password : "");
        nvs_commit(nvs);
        nvs_close(nvs);
    }
    s_retries = 0;
    esp_wifi_disconnect();
    esp_err_t result = esp_wifi_connect();
    ESP_LOGI(TAG, "Conectando a %s", ssid);
    return result == ESP_OK;
}

bool wifi_manager_is_connected(void)
{
    return s_events && (xEventGroupGetBits(s_events) & CONNECTED_BIT) != 0;
}

int wifi_manager_scan(char ssids[][33], int rssi[], int capacity)
{
    if (!s_started || capacity <= 0) return 0;
    wifi_scan_config_t config = { .show_hidden = false, .scan_type = WIFI_SCAN_TYPE_ACTIVE };
    if (esp_wifi_scan_start(&config, true) != ESP_OK) return 0;
    uint16_t count = (uint16_t)capacity;
    wifi_ap_record_t *records = calloc((size_t)capacity, sizeof(*records));
    if (!records) return 0;
    if (esp_wifi_scan_get_ap_records(&count, records) != ESP_OK) count = 0;
    for (int index = 0; index < count; ++index) {
        strlcpy(ssids[index], (const char *)records[index].ssid, 33);
        rssi[index] = records[index].rssi;
    }
    free(records);
    return count;
}
