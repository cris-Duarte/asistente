/**
 * Productivity Assistant - LVGL UI Components
 * Main screen and widgets for M5Stack Tab5
 */

#ifndef UI_MAIN_H
#define UI_MAIN_H

#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

// Sync status enum
typedef enum {
    SYNC_STATUS_OFFLINE = 0,
    SYNC_STATUS_CONNECTING,
    SYNC_STATUS_SYNCED,
    SYNC_STATUS_ERROR,
} sync_status_t;

// Task structure for UI
typedef struct {
    char id[37];
    char title[64];
    char project[32];
    int32_t estimated_seconds;
    int32_t tracked_seconds;
    int status;  // 0=pending, 1=active, 2=paused, 3=done
    bool is_parallel;
} ui_task_t;

// Initialize UI
void ui_main_init(void);

// Update sync status indicator
void ui_main_update_sync_status(sync_status_t status);

// Update active task display
void ui_main_update_active_task(const ui_task_t *task);

// Update timer display
void ui_main_update_timer(int32_t seconds, float progress);

// Update task list
void ui_main_update_task_list(const ui_task_t *tasks, int count);

// Toggle timer start/stop
void ui_main_toggle_timer(void);

// Show task context menu
void ui_main_show_task_menu(void);

// Switch to next task
void ui_main_switch_task(void);

// Set battery level (0-100)
void ui_main_set_battery_level(uint8_t level);

// Set WiFi signal strength (0-4)
void ui_main_set_wifi_strength(uint8_t strength);

// Show notification toast
void ui_main_show_notification(const char *title, const char *message);

// Get current active task ID
const char* ui_main_get_active_task_id(void);

#ifdef __cplusplus
}
#endif

#endif // UI_MAIN_H