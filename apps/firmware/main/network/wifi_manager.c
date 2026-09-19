/**
 * Productivity Assistant - WiFi Manager Implementation
 */

#include "wifi_manager.h"
#include <string.h>
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

static const char *TAG = "WIFI_MGR";

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define MAX_RETRY          10

static EventGroupHandle_t wifi_event_group;
static wifi_event_callback_t event_callback = NULL;
static char stored_ssid[33] = {0};
static char stored_password[65] = {0};
static int retry_count = 0;
static bool auto_reconnect = true;

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (auto_reconnect && retry_count < MAX_RETRY) {
            esp_wifi_connect();
            retry_count++;
            ESP_LOGI(TAG, "Reconnecting to WiFi... (%d/%d)", retry_count, MAX_RETRY);
            if (event_callback) event_callback(WIFI_EVENT_RECONNECTING, NULL);
        } else {
            xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
            if (event_callback) event_callback(WIFI_EVENT_DISCONNECTED, NULL);
            ESP_LOGI(TAG, "WiFi disconnected");
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t*)event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        retry_count = 0;
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
        if (event_callback) event_callback(WIFI_EVENT_CONNECTED, NULL);
    }
}

void wifi_manager_init(void)
{
    ESP_LOGI(TAG, "Initializing WiFi manager...");
    
    wifi_event_group = xEventGroupCreate();
    
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    
    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));
    
    // Load stored credentials
    nvs_handle_t nvs_handle;
    if (nvs_open("wifi", NVS_READONLY, &nvs_handle) == ESP_OK) {
        size_t ssid_len = sizeof(stored_ssid);
        size_t pass_len = sizeof(stored_password);
        nvs_get_str(nvs_handle, "ssid", stored_ssid, &ssid_len);
        nvs_get_str(nvs_handle, "password", stored_password, &pass_len);
        nvs_close(nvs_handle);
    }
    
    ESP_LOGI(TAG, "WiFi manager initialized");
}

void wifi_manager_connect(void)
{
    if (strlen(stored_ssid) == 0) {
        ESP_LOGW(TAG, "No WiFi credentials stored");
        return;
    }
    
    wifi_config_t wifi_config = {0};
    strncpy((char*)wifi_config.sta.ssid, stored_ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char*)wifi_config.sta.password, stored_password, sizeof(wifi_config.sta.password) - 1);
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;
    
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    
    ESP_LOGI(TAG, "Connecting to %s...", stored_ssid);
}

void wifi_manager_disconnect(void)
{
    auto_reconnect = false;
    esp_wifi_disconnect();
    esp_wifi_stop();
}

void wifi_manager_set_credentials(const char *ssid, const char *password)
{
    strncpy(stored_ssid, ssid, sizeof(stored_ssid) - 1);
    strncpy(stored_password, password, sizeof(stored_password) - 1);
    
    // Save to NVS
    nvs_handle_t nvs_handle;
    if (nvs_open("wifi", NVS_READWRITE, &nvs_handle) == ESP_OK) {
        nvs_set_str(nvs_handle, "ssid", stored_ssid);
        nvs_set_str(nvs_handle, "password", stored_password);
        nvs_commit(nvs_handle);
        nvs_close(nvs_handle);
    }
    
    ESP_LOGI(TAG, "WiFi credentials updated: %s", stored_ssid);
}

bool wifi_manager_is_connected(void)
{
    EventBits_t bits = xEventGroupGetBits(wifi_event_group);
    return (bits & WIFI_CONNECTED_BIT) != 0;
}

const char* wifi_manager_get_ip(void)
{
    static char ip_str[16] = {0};
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (netif) {
        esp_netif_ip_info_t ip_info;
        if (esp_netif_get_ip_info(netif, &ip_info) == ESP_OK) {
            snprintf(ip_str, sizeof(ip_str), IPSTR, IP2STR(&ip_info.ip));
            return ip_str;
        }
    }
    return "0.0.0.0";
}

int wifi_manager_get_rssi(void)
{
    wifi_ap_record_t ap_info;
    if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
        return ap_info.rssi;
    }
    return -100;
}

void wifi_manager_register_callback(wifi_event_callback_t callback)
{
    // TODO: Store and call callback on events
}

void wifi_manager_scan(void)
{
    wifi_scan_config_t scan_config = {
        .show_hidden = true,
        .scan_type = WIFI_SCAN_TYPE_ACTIVE,
        .scan_time.active.min = 100,
        .scan_time.active.max = 300,
    };
    esp_wifi_scan_start(&scan_config, false);
}

int wifi_manager_get_scan_results(char *buffer, int buffer_size)
{
    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    
    if (ap_count == 0) {
        return snprintf(buffer, buffer_size, "[]");
    }
    
    wifi_ap_record_t *ap_records = malloc(ap_count * sizeof(wifi_ap_record_t));
    if (!ap_records) return 0;
    
    esp_wifi_scan_get_ap_records(&ap_count, ap_records);
    
    int offset = snprintf(buffer, buffer_size, "[");
    for (int i = 0; i < ap_count && offset < buffer_size - 2; i++) {
        offset += snprintf(buffer + offset, buffer_size - offset,
            "%s{\"ssid\":\"%s\",\"rssi\":%d,\"auth\":%d}",
            i > 0 ? "," : "",
            ap_records[i].ssid, ap_records[i].rssi, ap_records[i].authmode);
    }
    offset += snprintf(buffer + offset, buffer_size - offset, "]");
    
    free(ap_records);
    return offset;
}