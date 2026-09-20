#include <cinttypes>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <sys/time.h>

#include "bsp/m5stack_tab5.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "esp_sntp.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "ina226.hpp"
#include "network/ota_updater.h"
#include "network/wifi_manager.h"
#include "nvs_flash.h"
#include "storage/sqlite_store.h"
#include "sync/sync_client.h"
#include "ui/ui_main.h"

static const char *TAG = "productivity";
static QueueHandle_t s_actions;
static INA226 s_power_monitor;
static bool s_power_ready;

enum class ActionType { Status, Timer };
struct Action {
    ActionType type;
    stored_task_t task;
    char status[16];
};

static void uuid(char output[37])
{
    uint8_t bytes[16];
    esp_fill_random(bytes, sizeof(bytes));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    snprintf(output, 37,
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
             bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
}

static void iso_now(char output[40])
{
    time_t now;
    time(&now);
    struct tm utc;
    gmtime_r(&now, &utc);
    strftime(output, 40, "%Y-%m-%dT%H:%M:%SZ", &utc);
}

static int64_t epoch_seconds(void)
{
    time_t now;
    time(&now);
    return (int64_t)now;
}

static void refresh_tasks()
{
    stored_task_t tasks[STORAGE_MAX_TASKS];
    int count = sqlite_store_task_list(tasks, STORAGE_MAX_TASKS);
    ui_main_set_tasks(tasks, count);
}

static void queue_status(const stored_task_t *task, const char *status)
{
    Action action = {};
    action.type = ActionType::Status;
    action.task = *task;
    strlcpy(action.status, status, sizeof(action.status));
    xQueueSend(s_actions, &action, 0);
}

static void queue_timer(const stored_task_t *task)
{
    Action action = {};
    action.type = ActionType::Timer;
    action.task = *task;
    xQueueSend(s_actions, &action, 0);
}

static int scan_wifi(char ssids[][33], int rssi[], int capacity)
{
    return wifi_manager_scan(ssids, rssi, capacity);
}

static void connect_wifi(const char *ssid, const char *password)
{
    wifi_manager_save_and_connect(ssid, password);
}

static void wifi_changed(bool connected, const char *message)
{
    ui_main_set_wifi(connected, message);
    if (connected) sync_client_force_pull();
}

static void sync_changed(device_sync_status_t status, const char *message)
{
    (void)status;
    ui_main_set_sync(message, sqlite_store_pending_count());
}

static void pairing_changed(const char *code)
{
    ui_main_set_pairing_code(code);
}

static stored_mutation_t mutation_for(const char *entity, const char *resource_id,
                                      const char *method, const char *path,
                                      const char *payload, int base_version)
{
    stored_mutation_t mutation = {};
    uuid(mutation.id);
    strlcpy(mutation.entity, entity, sizeof(mutation.entity));
    strlcpy(mutation.resource_id, resource_id, sizeof(mutation.resource_id));
    strlcpy(mutation.method, method, sizeof(mutation.method));
    strlcpy(mutation.path, path, sizeof(mutation.path));
    strlcpy(mutation.payload, payload, sizeof(mutation.payload));
    mutation.base_version = base_version;
    mutation.next_attempt_ms = esp_timer_get_time() / 1000;
    return mutation;
}

static void perform_status(const Action &action)
{
    char timestamp[40];
    char path[96];
    char payload[80];
    iso_now(timestamp);
    snprintf(path, sizeof(path), "/api/tasks/%s", action.task.id);
    snprintf(payload, sizeof(payload), "{\"status\":\"%s\"}", action.status);
    stored_mutation_t mutation = mutation_for("tasks", action.task.id, "PATCH", path, payload, action.task.version);
    if (sqlite_store_task_set_status_local(action.task.id, action.status, timestamp, &mutation)) refresh_tasks();
}

static void perform_timer(const Action &action)
{
    stored_time_entry_t entry = {};
    char timestamp[40];
    iso_now(timestamp);
    if (sqlite_store_timer_get_active(&entry)) {
        strlcpy(entry.ended_at, timestamp, sizeof(entry.ended_at));
        char started_epoch[24] = {0};
        sqlite_store_kv_get("timer_start_epoch", started_epoch, sizeof(started_epoch));
        int64_t start = strtoll(started_epoch, nullptr, 10);
        entry.duration_seconds = (int32_t)(epoch_seconds() > start ? epoch_seconds() - start : 0);
        char path[96];
        char payload[96];
        snprintf(path, sizeof(path), "/api/time-entries/%s", entry.id);
        snprintf(payload, sizeof(payload), "{\"endedAt\":\"%s\"}", timestamp);
        stored_mutation_t mutation = mutation_for("time_entries", entry.id, "PATCH", path, payload, entry.version);
        sqlite_store_timer_stop_local(&entry, &mutation);
        sqlite_store_kv_set("timer_start_epoch", "0");
    } else {
        uuid(entry.id);
        strlcpy(entry.task_id, action.task.id, sizeof(entry.task_id));
        strlcpy(entry.started_at, timestamp, sizeof(entry.started_at));
        entry.version = 1;
        char payload[320];
        snprintf(payload, sizeof(payload),
                 "{\"id\":\"%s\",\"taskId\":\"%s\",\"startedAt\":\"%s\",\"source\":\"manual\",\"deviceId\":\"tab5\",\"metadata\":{}}",
                 entry.id, entry.task_id, entry.started_at);
        stored_mutation_t mutation = mutation_for("time_entries", entry.id, "POST", "/api/time-entries", payload, 0);
        if (sqlite_store_timer_start_local(&entry, &mutation)) {
            char start[24];
            snprintf(start, sizeof(start), "%" PRId64, epoch_seconds());
            sqlite_store_kv_set("timer_start_epoch", start);
        }
    }
    refresh_tasks();
}

static void app_task(void *argument)
{
    (void)argument;
    int64_t last_ui_second = -1;
    int64_t last_power_second = -30;
    float battery_voltage = 0.0f;
    while (true) {
        Action action;
        while (xQueueReceive(s_actions, &action, 0) == pdTRUE) {
            if (action.type == ActionType::Status) perform_status(action);
            else perform_timer(action);
        }
        sync_client_tick();
        int64_t second = epoch_seconds();
        if (second != last_ui_second) {
            last_ui_second = second;
            if (s_power_ready && second - last_power_second >= 30) {
                battery_voltage = s_power_monitor.readBusVoltage();
                last_power_second = second;
            }
            struct tm utc;
            time_t now = (time_t)second;
            gmtime_r(&now, &utc);
            char clock_text[20];
            strftime(clock_text, sizeof(clock_text), "%H:%M UTC", &utc);
            ui_main_set_device_status(clock_text, battery_voltage);
            stored_time_entry_t active = {};
            if (sqlite_store_timer_get_active(&active)) {
                char start_value[24] = {0};
                sqlite_store_kv_get("timer_start_epoch", start_value, sizeof(start_value));
                int64_t start = strtoll(start_value, nullptr, 10);
                ui_main_set_timer(&active, (uint32_t)(second > start ? second - start : 0), true);
            } else {
                ui_main_set_timer(nullptr, 0, false);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

extern "C" void app_main(void)
{
#if defined(PRODUCTIVITY_DISPLAY_ST7121)
    const char *expected_panel = "ST7121";
#else
    const char *expected_panel = "ST7123";
#endif
    esp_err_t result = nvs_flash_init();
    if (result == ESP_ERR_NVS_NO_FREE_PAGES || result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(result);
    ota_updater_confirm_running_image();

    ESP_ERROR_CHECK(bsp_i2c_init());
    bsp_io_expander_pi4ioe_init(bsp_i2c_get_handle());
    s_power_ready = s_power_monitor.begin(bsp_i2c_get_handle(), 0x41);
    if (s_power_ready) {
        s_power_monitor.configure(INA226_AVERAGES_16, INA226_BUS_CONV_TIME_1100US,
                                  INA226_SHUNT_CONV_TIME_1100US, INA226_MODE_SHUNT_BUS_CONT);
        s_power_monitor.calibrate(0.005, 8.192);
    } else {
        ESP_LOGW(TAG, "No se pudo inicializar el monitor de batería INA226");
    }
    bsp_reset_tp();
    bsp_display_cfg_t display_config = {
        .lvgl_port_cfg = ESP_LVGL_PORT_INIT_CONFIG(),
        .buffer_size = BSP_LCD_H_RES * BSP_LCD_V_RES,
        .double_buffer = true,
        .flags = { .buff_dma = true, .buff_spiram = true, .sw_rotate = true },
    };
    lv_display_t *display = bsp_display_start_with_config(&display_config);
    ESP_ERROR_CHECK(display ? ESP_OK : ESP_FAIL);
    lv_display_set_rotation(display, LV_DISPLAY_ROTATION_90);
    ESP_ERROR_CHECK(bsp_display_backlight_on());

    s_actions = xQueueCreate(16, sizeof(Action));
    ui_callbacks_t callbacks = {
        .set_task_status = queue_status,
        .toggle_timer = queue_timer,
        .scan_wifi = scan_wifi,
        .connect_wifi = connect_wifi,
    };
    ui_main_init(&callbacks);
    bsp_display_unlock();

    ESP_LOGI(TAG, "Firmware %s; panel esperado %s; panel detectado %s",
             esp_app_get_description()->version, expected_panel, bsp_display_get_panel_ic());
    ESP_ERROR_CHECK(bsp_spiffs_mount());
    ESP_ERROR_CHECK(sqlite_store_init() ? ESP_OK : ESP_FAIL);
    refresh_tasks();

    ESP_ERROR_CHECK(wifi_manager_init(wifi_changed) ? ESP_OK : ESP_FAIL);
    wifi_manager_connect_saved();
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, const_cast<char *>("pool.ntp.org"));
    esp_sntp_init();

    uint8_t mac[6];
    ESP_ERROR_CHECK(esp_efuse_mac_get_default(mac));
    char device_id[64];
    snprintf(device_id, sizeof(device_id), "tab5-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    sync_client_init(device_id, CONFIG_PRODUCTIVITY_API_URL, sync_changed, refresh_tasks, pairing_changed);
    xTaskCreatePinnedToCore(app_task, "productivity", 12288, nullptr, 5, nullptr, 1);
}
