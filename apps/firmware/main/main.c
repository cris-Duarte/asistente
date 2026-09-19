/**
 * Productivity Assistant - M5Stack Tab5 Firmware
 * Main entry point for ESP32-P4 with LVGL UI
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_timer.h"
#include "esp_sleep.h"
#include "esp_pm.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_https_ota.h"
#include "esp_crt_bundle.h"
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "lvgl.h"
#include "esp_lvgl_port.h"

#include "ui/ui_main.h"
#include "sync/sync_client.h"
#include "storage/sqlite_store.h"
#include "network/wifi_manager.h"
#include "network/ota_updater.h"
#include "power/battery_monitor.h"
#include "power/sleep_manager.h"
#include "peripherals/touch.h"
#include "peripherals/buttons.h"
#include "peripherals/imu.h"
#include "peripherals/rtc.h"

static const char *TAG = "MAIN";

// Device configuration
#define DEVICE_ID_MAX_LEN 32
#define SYNC_INTERVAL_MS 30000
#define WIFI_RECONNECT_INTERVAL_MS 60000

// Event bits
#define WIFI_CONNECTED_BIT      BIT0
#define SYNC_REQUEST_BIT        BIT1
#define OTA_UPDATE_BIT          BIT2

// Global state
static char device_id[DEVICE_ID_MAX_LEN];
static EventGroupHandle_t sync_events;
static TaskHandle_t sync_task_handle = NULL;
static TaskHandle_t ui_task_handle = NULL;

// Forward declarations
static void init_hardware(void);
static void init_nvs(void);
static void init_lvgl(void);
static void init_wifi(void);
static void init_sync(void);
static void init_power_management(void);
static void sync_task(void *pvParameters);
static void ui_task(void *pvParameters);
static void register_device(void);
static void handle_sync_event(void);

void app_main(void)
{
    ESP_LOGI(TAG, "Starting Productivity Assistant Firmware v0.1.0");
    ESP_LOGI(TAG, "ESP-IDF version: %s", esp_get_idf_version());
    ESP_LOGI(TAG, "Free heap: %" PRIu32 " bytes", esp_get_free_heap_size());

    // Initialize hardware
    init_hardware();
    init_nvs();
    init_lvgl();
    init_wifi();
    init_sync();
    init_power_management();

    // Register device with backend
    register_device();

    // Create tasks
    sync_events = xEventGroupCreate();
    
    xTaskCreatePinnedToCore(
        sync_task,
        "sync_task",
        8192,
        NULL,
        5,
        &sync_task_handle,
        1  // Core 1
    );

    xTaskCreatePinnedToCore(
        ui_task,
        "ui_task",
        8192,
        NULL,
        5,
        &ui_task_handle,
        0  // Core 0
    );

    ESP_LOGI(TAG, "All tasks started. Free heap: %" PRIu32 " bytes", esp_get_free_heap_size());
}

static void init_hardware(void)
{
    ESP_LOGI(TAG, "Initializing hardware...");

    // Initialize I2C for peripherals (battery monitor, RTC, IMU)
    i2c_config_t i2c_conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = GPIO_NUM_1,    // Adjust based on Tab5 schematic
        .scl_io_num = GPIO_NUM_2,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 400000,
    };
    ESP_ERROR_CHECK(i2c_param_config(I2C_NUM_0, &i2c_conf));
    ESP_ERROR_CHECK(i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0));

    // Initialize peripherals
    touch_init();
    buttons_init();
    imu_init();
    rtc_init();
    battery_monitor_init();

    ESP_LOGI(TAG, "Hardware initialized");
}

static void init_nvs(void)
{
    ESP_LOGI(TAG, "Initializing NVS...");
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Generate/load device ID
    nvs_handle_t nvs_handle;
    ESP_ERROR_CHECK(nvs_open("device", NVS_READWRITE, &nvs_handle));
    
    size_t required_size = DEVICE_ID_MAX_LEN;
    ret = nvs_get_str(nvs_handle, "device_id", device_id, &required_size);
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        // Generate new device ID
        uint8_t mac[6];
        esp_read_mac(mac, ESP_MAC_WIFI_STA);
        snprintf(device_id, DEVICE_ID_MAX_LEN, "tab5-%02x%02x%02x%02x%02x%02x",
                 mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        ESP_ERROR_CHECK(nvs_set_str(nvs_handle, "device_id", device_id));
        ESP_ERROR_CHECK(nvs_commit(nvs_handle));
        ESP_LOGI(TAG, "Generated new device ID: %s", device_id);
    } else {
        ESP_LOGI(TAG, "Loaded device ID: %s", device_id);
    }
    nvs_close(nvs_handle);
}

static void init_lvgl(void)
{
    ESP_LOGI(TAG, "Initializing LVGL...");

    // LVGL port configuration for M5Stack Tab5 (ST7121 display)
    const lvgl_port_cfg_t lvgl_cfg = {
        .task_priority = 5,
        .task_stack = 8192,
        .task_affinity = 0,
        .task_max_sleep_ms = 500,
        .timer_period_ms = 5,
    };
    ESP_ERROR_CHECK(lvgl_port_init(&lvgl_cfg));

    // Display configuration for 5" 1280x720 ST7121
    const lvgl_port_display_cfg_t disp_cfg = {
        .io_handle = NULL,  // Will be set by esp_lvgl_port_add_disp
        .panel_handle = NULL,
        .control_handle = NULL,
        .buffer_size = 1280 * 720,
        .double_buffer = true,
        .hres = 1280,
        .vres = 720,
        .monochrome = false,
        .rotation = {
            .swap_xy = false,
            .mirror_x = false,
            .mirror_y = false,
        },
        .color_format = LV_COLOR_FORMAT_RGB565,
        .flags = {
            .buff_dma = true,
            .buff_spiram = true,
            .swap_bytes = false,
            .full_refresh = false,
            .direct_mode = false,
        },
    };
    lvgl_port_add_disp(&disp_cfg);

    // Touch configuration
    const lvgl_port_touch_cfg_t touch_cfg = {
        .disp = NULL,
        .handle = NULL,
    };
    lvgl_port_add_touch(&touch_cfg);

    // Initialize UI
    ui_main_init();

    ESP_LOGI(TAG, "LVGL initialized");
}

static void init_wifi(void)
{
    ESP_LOGI(TAG, "Initializing WiFi...");
    wifi_manager_init();
    wifi_manager_connect();
}

static void init_sync(void)
{
    ESP_LOGI(TAG, "Initializing sync client...");
    sync_client_init(device_id);
    sqlite_store_init();
}

static void init_power_management(void)
{
    ESP_LOGI(TAG, "Initializing power management...");

    // Configure power management
    esp_pm_config_t pm_config = {
        .max_freq_mhz = 400,
        .min_freq_mhz = 40,
        .light_sleep_enable = true,
    };
    ESP_ERROR_CHECK(esp_pm_configure(&pm_config));

    // Configure deep sleep wakeup sources
    sleep_manager_init();

    // Battery monitoring
    battery_monitor_start();

    ESP_LOGI(TAG, "Power management initialized");
}

static void register_device(void)
{
    ESP_LOGI(TAG, "Registering device with backend...");
    // TODO: Implement device registration with backend
    // This would send device_id, firmware version, hardware info to API
}

static void sync_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Sync task started");

    while (1) {
        // Wait for WiFi connection or timeout
        EventBits_t bits = xEventGroupWaitBits(
            sync_events,
            WIFI_CONNECTED_BIT | SYNC_REQUEST_BIT,
            pdFALSE,
            pdFALSE,
            pdMS_TO_TICKS(SYNC_INTERVAL_MS)
        );

        if (bits & WIFI_CONNECTED_BIT) {
            handle_sync_event();
        }

        // Check for pending mutations to push
        if (sqlite_store_has_pending_mutations()) {
            sync_client_push_mutations();
        }
    }
}

static void ui_task(void *pvParameters)
{
    ESP_LOGI(TAG, "UI task started");

    while (1) {
        // LVGL timer handler
        lv_timer_handler();
        
        // Small delay to prevent watchdog issues
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

static void handle_sync_event(void)
{
    ESP_LOGI(TAG, "Handling sync event...");
    
    // Pull changes from server
    sync_client_pull_changes();
    
    // Push local mutations
    if (sqlite_store_has_pending_mutations()) {
        sync_client_push_mutations();
    }
    
    // Update UI with sync status
    ui_main_update_sync_status(SYNC_STATUS_SYNCED);
}

// Event handlers
void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_CONNECTED) {
        xEventGroupSetBits(sync_events, WIFI_CONNECTED_BIT);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(sync_events, WIFI_CONNECTED_BIT);
        ui_main_update_sync_status(SYNC_STATUS_OFFLINE);
    }
}

void button_event_handler(button_event_t event)
{
    switch (event) {
        case BUTTON_SHORT_PRESS:
            // Toggle timer start/stop
            ui_main_toggle_timer();
            break;
        case BUTTON_LONG_PRESS:
            // Open task menu
            ui_main_show_task_menu();
            break;
        case BUTTON_DOUBLE_PRESS:
            // Quick task switch
            ui_main_switch_task();
            break;
    }
}

void touch_event_handler(touch_event_t event)
{
    // Forward to LVGL
    lvgl_port_touch_input(event.x, event.y, event.pressed);
}

void imu_event_handler(imu_event_t event)
{
    if (event.type == IMU_WAKEUP) {
        // Wake from deep sleep
        sleep_manager_wake();
    }
}