#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "storage/sqlite_store.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    void (*set_task_status)(const stored_task_t *task, const char *status);
    void (*toggle_timer)(const stored_task_t *task);
    int (*scan_wifi)(char ssids[][33], int rssi[], int capacity);
    void (*connect_wifi)(const char *ssid, const char *password);
} ui_callbacks_t;

void ui_main_init(const ui_callbacks_t *callbacks);
void ui_main_set_tasks(const stored_task_t *tasks, int count);
void ui_main_set_timer(const stored_time_entry_t *entry, uint32_t elapsed_seconds, bool running);
void ui_main_set_sync(const char *message, int pending);
void ui_main_set_device_status(const char *clock_text, float battery_voltage);
void ui_main_set_pairing_code(const char *code);
void ui_main_set_wifi(bool connected, const char *message);

#ifdef __cplusplus
}
#endif
