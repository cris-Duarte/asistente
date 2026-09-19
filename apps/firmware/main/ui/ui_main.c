/**
 * Productivity Assistant - LVGL UI Implementation
 * Main screen for M5Stack Tab5 (1280x720)
 */

#include "ui_main.h"
#include <stdio.h>
#include <string.h>

// UI Objects
static lv_obj_t *main_screen = NULL;
static lv_obj_t *sync_status_label = NULL;
static lv_obj_t *battery_label = NULL;
static lv_obj_t *wifi_label = NULL;

static lv_obj_t *active_task_container = NULL;
static lv_obj_t *active_task_title = NULL;
static lv_obj_t *active_task_project = NULL;
static lv_obj_t *timer_label = NULL;
static lv_obj_t *progress_arc = NULL;
static lv_obj_t *progress_label = NULL;
static lv_obj_t *btn_pause = NULL;
static lv_obj_t *btn_stop = NULL;
static lv_obj_t *btn_done = NULL;

static lv_obj_t *task_list_container = NULL;
static lv_obj_t *task_list = NULL;

static lv_obj_t *notification_container = NULL;

// Colors
static const lv_color_t COLOR_PRIMARY = LV_COLOR_MAKE(0x3B, 0x82, 0xF6);
static const lv_color_t COLOR_SUCCESS = LV_COLOR_MAKE(0x10, 0xB9, 0x81);
static const lv_color_t COLOR_WARNING = LV_COLOR_MAKE(0xF5, 0x9E, 0x0B);
static const lv_color_t COLOR_ERROR = LV_COLOR_MAKE(0xEF, 0x44, 0x44);
static const lv_color_t COLOR_BG = LV_COLOR_MAKE(0xF8, 0xFA, 0xFC);
static const lv_color_t COLOR_CARD = LV_COLOR_WHITE;
static const lv_color_t COLOR_TEXT = LV_COLOR_MAKE(0x1F, 0x29, 0x37);
static const lv_color_t COLOR_TEXT_MUTED = LV_COLOR_MAKE(0x6B, 0x72, 0x80);

// Styles
static lv_style_t style_card;
static lv_style_t style_btn_primary;
static lv_style_t style_btn_secondary;
static lv_style_t style_btn_danger;
static lv_style_t style_text_title;
static lv_style_t style_text_body;
static lv_style_t style_text_muted;

static void init_styles(void)
{
    lv_style_init(&style_card);
    lv_style_set_bg_color(&style_card, COLOR_CARD);
    lv_style_set_border_color(&style_card, lv_color_make(0xE5, 0xE7, 0xEB));
    lv_style_set_border_width(&style_card, 1);
    lv_style_set_radius(&style_card, 12);
    lv_style_set_pad_all(&style_card, 16);
    lv_style_set_shadow_width(&style_card, 8);
    lv_style_set_shadow_color(&style_card, lv_color_make(0x00, 0x00, 0x00));
    lv_style_set_shadow_opa(&style_card, LV_OPA_10);

    lv_style_init(&style_btn_primary);
    lv_style_set_bg_color(&style_btn_primary, COLOR_PRIMARY);
    lv_style_set_text_color(&style_btn_primary, LV_COLOR_WHITE);
    lv_style_set_radius(&style_btn_primary, 8);
    lv_style_set_pad_ver(&style_btn_primary, 12);
    lv_style_set_pad_hor(&style_btn_primary, 24);
    lv_style_set_text_font(&style_btn_primary, &lv_font_montserrat_14);

    lv_style_init(&style_btn_secondary);
    lv_style_set_bg_color(&style_btn_secondary, lv_color_make(0xF3, 0xF4, 0xF6));
    lv_style_set_text_color(&style_btn_secondary, COLOR_TEXT);
    lv_style_set_radius(&style_btn_secondary, 8);
    lv_style_set_pad_ver(&style_btn_secondary, 12);
    lv_style_init(&style_btn_secondary);
    lv_style_set_bg_color(&style_btn_secondary, lv_color_make(0xF3, 0xF4, 0xF6));
    lv_style_set_text_color(&style_btn_secondary, COLOR_TEXT);
    lv_style_set_radius(&style_btn_secondary, 8);
    lv_style_set_pad_ver(&style_btn_secondary, 12);
    lv_style_set_pad_hor(&style_btn_secondary, 24);
    lv_style_set_text_font(&style_btn_secondary, &lv_font_montserrat_14);

    lv_style_init(&style_btn_danger);
    lv_style_set_bg_color(&style_btn_danger, COLOR_ERROR);
    lv_style_set_text_color(&style_btn_danger, LV_COLOR_WHITE);
    lv_style_set_radius(&style_btn_danger, 8);
    lv_style_set_pad_ver(&style_btn_danger, 12);
    lv_style_set_pad_hor(&style_btn_danger, 24);
    lv_style_set_text_font(&style_btn_danger, &lv_font_montserrat_14);

    lv_style_init(&style_text_title);
    lv_style_set_text_color(&style_text_title, COLOR_TEXT);
    lv_style_set_text_font(&style_text_title, &lv_font_montserrat_20);

    lv_style_init(&style_text_body);
    lv_style_set_text_color(&style_text_body, COLOR_TEXT);
    lv_style_set_text_font(&style_text_body, &lv_font_montserrat_14);

    lv_style_init(&style_text_muted);
    lv_style_set_text_color(&style_text_muted, COLOR_TEXT_MUTED);
    lv_style_set_text_font(&style_text_muted, &lv_font_montserrat_12);
}

static void create_header(lv_obj_t *parent)
{
    lv_obj_t *header = lv_obj_create(parent);
    lv_obj_set_size(header, LV_PCT(100), 80);
    lv_obj_set_style_bg_color(header, COLOR_CARD, 0);
    lv_obj_set_style_border_width(header, 0, 0);
    lv_obj_set_style_pad_all(header, 16);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Title
    lv_obj_t *title = lv_label_create(header);
    lv_label_set_text(title, "Productivity");
    lv_obj_add_style(title, &style_text_title, 0);

    // Status indicators container
    lv_obj_t *status_container = lv_obj_create(header);
    lv_obj_set_style_bg_opa(status_container, LV_OPA_0, 0);
    lv_obj_set_style_border_width(status_container, 0, 0);
    lv_obj_set_style_pad_all(status_container, 0);
    lv_obj_set_flex_flow(status_container, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(status_container, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(status_container, 12, 0);

    // Sync status
    sync_status_label = lv_label_create(status_container);
    lv_label_set_text(sync_status_label, LV_SYMBOL_WIFI " Offline");
    lv_obj_add_style(sync_status_label, &style_text_muted, 0);

    // WiFi
    wifi_label = lv_label_create(status_container);
    lv_label_set_text(wifi_label, LV_SYMBOL_WIFI " --");
    lv_obj_add_style(wifi_label, &style_text_muted, 0);

    // Battery
    battery_label = lv_label_create(status_container);
    lv_label_set_text(battery_label, LV_SYMBOL_BATTERY_FULL " 100%");
    lv_obj_add_style(battery_label, &style_text_muted, 0);
}

static void create_active_task_section(lv_obj_t *parent)
{
    active_task_container = lv_obj_create(parent);
    lv_obj_set_size(active_task_container, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_add_style(active_task_container, &style_card, 0);
    lv_obj_set_style_pad_all(active_task_container, 20, 0);
    lv_obj_set_flex_flow(active_task_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(active_task_container, 16, 0);

    // Header row
    lv_obj_t *header_row = lv_obj_create(active_task_container);
    lv_obj_set_size(header_row, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(header_row, LV_OPA_0, 0);
    lv_obj_set_style_border_width(header_row, 0, 0);
    lv_obj_set_style_pad_all(header_row, 0);
    lv_obj_set_flex_flow(header_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lv_obj_t *section_title = lv_label_create(header_row);
    lv_label_set_text(section_title, "Tarea Activa");
    lv_obj_add_style(section_title, &style_text_title, 0);

    lv_obj_t *btn_view_all = lv_btn_create(header_row);
    lv_obj_add_style(btn_view_all, &style_btn_secondary, 0);
    lv_obj_t *btn_label = lv_label_create(btn_view_all);
    lv_label_set_text(btn_label, "Ver todas");

    // Task info
    lv_obj_t *task_info = lv_obj_create(active_task_container);
    lv_obj_set_size(task_info, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(task_info, LV_OPA_0, 0);
    lv_obj_set_style_border_width(task_info, 0, 0);
    lv_obj_set_style_pad_all(task_info, 0);
    lv_obj_set_flex_flow(task_info, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(task_info, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(task_info, 16, 0);

    lv_obj_t *icon_container = lv_obj_create(task_info);
    lv_obj_set_size(icon_container, 64, 64);
    lv_obj_set_style_bg_color(icon_container, lv_color_make(0xDB, 0xE8, 0xFE), 0);
    lv_obj_set_style_radius(icon_container, 12, 0);
    lv_obj_set_style_pad_all(icon_container, 0);
    lv_obj_t *icon = lv_label_create(icon_container);
    lv_label_set_text(icon, LV_SYMBOL_TIMER);
    lv_obj_set_style_text_color(icon, COLOR_PRIMARY, 0);
    lv_obj_set_style_text_font(icon, &lv_font_montserrat_28, 0);
    lv_obj_center(icon);

    lv_obj_t *text_container = lv_obj_create(task_info);
    lv_obj_set_size(text_container, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(text_container, LV_OPA_0, 0);
    lv_obj_set_style_border_width(text_container, 0, 0);
    lv_obj_set_style_pad_all(text_container, 0);
    lv_obj_set_flex_flow(text_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(text_container, 4, 0);

    active_task_title = lv_label_create(text_container);
    lv_label_set_text(active_task_title, "Sin tarea activa");
    lv_obj_add_style(active_task_title, &style_text_title, 0);

    active_task_project = lv_label_create(text_container);
    lv_label_set_text(active_task_project, "Selecciona una tarea");
    lv_obj_add_style(active_task_project, &style_text_muted, 0);

    // Timer display
    lv_obj_t *timer_container = lv_obj_create(active_task_container);
    lv_obj_set_size(timer_container, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(timer_container, LV_OPA_0, 0);
    lv_obj_set_style_border_width(timer_container, 0, 0);
    lv_obj_set_style_pad_all(timer_container, 0);
    lv_obj_set_flex_flow(timer_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(timer_container, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(timer_container, 8, 0);

    timer_label = lv_label_create(timer_container);
    lv_label_set_text(timer_label, "00:00:00");
    lv_obj_set_style_text_font(timer_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(timer_label, COLOR_TEXT, 0);

    progress_label = lv_label_create(timer_container);
    lv_label_set_text(progress_label, "Selecciona una tarea");
    lv_obj_add_style(progress_label, &style_text_muted, 0);

    // Progress arc
    progress_arc = lv_arc_create(timer_container);
    lv_obj_set_size(progress_arc, 200, 200);
    lv_arc_set_rotation(progress_arc, 270);
    lv_arc_set_bg_angles(progress_arc, 0, 360);
    lv_arc_set_value(progress_arc, 0);
    lv_obj_set_style_arc_color(progress_arc, COLOR_PRIMARY, LV_PART_INDICATOR);
    lv_obj_set_style_arc_width(progress_arc, 8, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(progress_arc, lv_color_make(0xE5, 0xE7, 0xEB), LV_PART_MAIN);
    lv_obj_set_style_arc_width(progress_arc, 8, LV_PART_MAIN);
    lv_obj_remove_style(progress_arc, NULL, LV_PART_KNOB);
    lv_obj_clear_flag(progress_arc, LV_OBJ_FLAG_CLICKABLE);

    // Buttons row
    lv_obj_t *btn_row = lv_obj_create(active_task_container);
    lv_obj_set_size(btn_row, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(btn_row, LV_OPA_0, 0);
    lv_obj_set_style_border_width(btn_row, 0, 0);
    lv_obj_set_style_pad_all(btn_row, 0);
    lv_obj_set_flex_flow(btn_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(btn_row, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(btn_row, 12, 0);

    btn_pause = lv_btn_create(btn_row);
    lv_obj_add_style(btn_pause, &style_btn_secondary, 0);
    lv_obj_t *pause_label = lv_label_create(btn_pause);
    lv_label_set_text(pause_label, LV_SYMBOL_PAUSE " Pausar");

    btn_stop = lv_btn_create(btn_row);
    lv_obj_add_style(btn_stop, &style_btn_danger, 0);
    lv_obj_t *stop_label = lv_label_create(btn_stop);
    lv_label_set_text(stop_label, LV_SYMBOL_STOP " Detener");

    btn_done = lv_btn_create(btn_row);
    lv_obj_add_style(btn_done, &style_btn_primary, 0);
    lv_obj_t *done_label = lv_label_create(btn_done);
    lv_label_set_text(done_label, LV_SYMBOL_OK " Finalizar");

    // Initially hide buttons
    lv_obj_add_flag(btn_pause, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(btn_stop, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(btn_done, LV_OBJ_FLAG_HIDDEN);
}

static void create_task_list_section(lv_obj_t *parent)
{
    lv_obj_t *section_header = lv_obj_create(parent);
    lv_obj_set_size(section_header, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(section_header, LV_OPA_0, 0);
    lv_obj_set_style_border_width(section_header, 0, 0);
    lv_obj_set_style_pad_all(section_header, 0);
    lv_obj_set_flex_flow(section_header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(section_header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_top(section_header, 24, 0);

    lv_obj_t *title = lv_label_create(section_header);
    lv_label_set_text(title, "Próximas Tareas");
    lv_obj_add_style(title, &style_text_title, 0);

    task_list_container = lv_obj_create(parent);
    lv_obj_set_size(task_list_container, LV_PCT(100), 280);
    lv_obj_add_style(task_list_container, &style_card, 0);
    lv_obj_set_style_pad_all(task_list_container, 0, 0);

    task_list = lv_list_create(task_list_container);
    lv_obj_set_size(task_list, LV_PCT(100), LV_PCT(100));
    lv_obj_set_style_bg_opa(task_list, LV_OPA_0, 0);
    lv_obj_set_style_border_width(task_list, 0, 0);
    lv_obj_set_style_pad_all(task_list, 8, 0);
}

static void create_notification_area(lv_obj_t *parent)
{
    notification_container = lv_obj_create(parent);
    lv_obj_set_size(notification_container, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(notification_container, LV_OPA_0, 0);
    lv_obj_set_style_border_width(notification_container, 0, 0);
    lv_obj_set_style_pad_all(notification_container, 0, 0);
    lv_obj_set_flex_flow(notification_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(notification_container, 8, 0);
    lv_obj_add_flag(notification_container, LV_OBJ_FLAG_HIDDEN);
}

void ui_main_init(void)
{
    init_styles();

    main_screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(main_screen, COLOR_BG, 0);
    lv_obj_set_flex_flow(main_screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(main_screen, 0, 0);

    // Create scrollable content
    lv_obj_t *content = lv_obj_create(main_screen);
    lv_obj_set_size(content, LV_PCT(100), LV_PCT(100));
    lv_obj_set_style_bg_opa(content, LV_OPA_0, 0);
    lv_obj_set_style_border_width(content, 0, 0);
    lv_obj_set_style_pad_all(content, 20, 0);
    lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(content, 20, 0);
    lv_obj_set_scrollbar_mode(content, LV_SCROLLBAR_MODE_OFF);

    create_header(content);
    create_active_task_section(content);
    create_task_list_section(content);
    create_notification_area(content);

    lv_scr_load(main_screen);
}

void ui_main_update_sync_status(sync_status_t status)
{
    if (!sync_status_label) return;

    switch (status) {
        case SYNC_STATUS_OFFLINE:
            lv_label_set_text(sync_status_label, LV_SYMBOL_WIFI_OFF " Offline");
            lv_obj_set_style_text_color(sync_status_label, COLOR_TEXT_MUTED, 0);
            break;
        case SYNC_STATUS_CONNECTING:
            lv_label_set_text(sync_status_label, LV_SYMBOL_REFRESH " Conectando...");
            lv_obj_set_style_text_color(sync_status_label, COLOR_WARNING, 0);
            break;
        case SYNC_STATUS_SYNCED:
            lv_label_set_text(sync_status_label, LV_SYMBOL_OK " Sincronizado");
            lv_obj_set_style_text_color(sync_status_label, COLOR_SUCCESS, 0);
            break;
        case SYNC_STATUS_ERROR:
            lv_label_set_text(sync_status_label, LV_SYMBOL_CLOSE " Error");
            lv_obj_set_style_text_color(sync_status_label, COLOR_ERROR, 0);
            break;
    }
}

void ui_main_update_active_task(const ui_task_t *task)
{
    if (!active_task_title || !active_task_project) return;

    if (task) {
        lv_label_set_text(active_task_title, task->title);
        char project_text[64];
        snprintf(project_text, sizeof(project_text), "Proyecto: %s", task->project);
        lv_label_set_text(active_task_project, project_text);

        // Show buttons
        lv_obj_clear_flag(btn_pause, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(btn_stop, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(btn_done, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_label_set_text(active_task_title, "Sin tarea activa");
        lv_label_set_text(active_task_project, "Selecciona una tarea");
        
        // Hide buttons
        lv_obj_add_flag(btn_pause, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(btn_stop, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(btn_done, LV_OBJ_FLAG_HIDDEN);
    }
}

void ui_main_update_timer(int32_t seconds, float progress)
{
    if (!timer_label) return;

    int32_t hours = seconds / 3600;
    int32_t minutes = (seconds % 3600) / 60;
    int32_t secs = seconds % 60;

    char time_str[16];
    if (hours > 0) {
        snprintf(time_str, sizeof(time_str), "%02" PRId32 ":%02" PRId32 ":%02" PRId32, hours, minutes, secs);
    } else {
        snprintf(time_str, sizeof(time_str), "%02" PRId32 ":%02" PRId32, minutes, secs);
    }
    lv_label_set_text(timer_label, time_str);

    if (progress_arc) {
        lv_arc_set_value(progress_arc, (int16_t)progress);
    }

    if (progress_label) {
        if (progress >= 100) {
            lv_label_set_text(progress_label, "¡Tiempo estimado completado!");
            lv_obj_set_style_text_color(progress_label, COLOR_SUCCESS, 0);
        } else if (progress > 0) {
            char progress_str[32];
            snprintf(progress_str, sizeof(progress_str), "%.0f%% del tiempo estimado", progress);
            lv_label_set_text(progress_label, progress_str);
            lv_obj_set_style_text_color(progress_label, COLOR_TEXT_MUTED, 0);
        } else {
            lv_label_set_text(progress_label, "Selecciona una tarea");
            lv_obj_set_style_text_color(progress_label, COLOR_TEXT_MUTED, 0);
        }
    }
}

void ui_main_update_task_list(const ui_task_t *tasks, int count)
{
    if (!task_list) return;

    // Clear existing items
    lv_obj_clean(task_list);

    if (count == 0) {
        lv_obj_t *empty_label = lv_label_create(task_list);
        lv_label_set_text(empty_label, "No hay tareas pendientes");
        lv_obj_add_style(empty_label, &style_text_muted, 0);
        lv_obj_center(empty_label);
        return;
    }

    for (int i = 0; i < count; i++) {
        const ui_task_t *task = &tasks[i];
        
        lv_obj_t *item = lv_list_add_btn(task_list, LV_SYMBOL_RIGHT, task->title);
        lv_obj_set_style_pad_ver(item, 16, 0);
        lv_obj_set_style_pad_hor(item, 16, 0);
        
        // Add project label
        lv_obj_t *project_label = lv_label_create(item);
        lv_label_set_text_fmt(project_label, "%s · %s", task->project, 
            task->estimated_seconds > 0 ? "Estimado" : "Sin estimación");
        lv_obj_add_style(project_label, &style_text_muted, 0);
        lv_obj_align(project_label, LV_ALIGN_RIGHT_MID, -16, 0);
    }
}

void ui_main_toggle_timer(void)
{
    // This will be handled by the main app logic
    // Just a placeholder for the button callback
}

void ui_main_show_task_menu(void)
{
    // Placeholder for context menu
}

void ui_main_switch_task(void)
{
    // Placeholder for quick task switch
}

void ui_main_set_battery_level(uint8_t level)
{
    if (!battery_label) return;
    
    const char *icon;
    if (level >= 80) icon = LV_SYMBOL_BATTERY_FULL;
    else if (level >= 60) icon = LV_SYMBOL_BATTERY_3;
    else if (level >= 40) icon = LV_SYMBOL_BATTERY_2;
    else if (level >= 20) icon = LV_SYMBOL_BATTERY_1;
    else icon = LV_SYMBOL_BATTERY_EMPTY;

    char text[32];
    snprintf(text, sizeof(text), "%s %d%%", icon, level);
    lv_label_set_text(battery_label, text);
}

void ui_main_set_wifi_strength(uint8_t strength)
{
    if (!wifi_label) return;

    const char *icon;
    switch (strength) {
        case 4: icon = LV_SYMBOL_WIFI; break;
        case 3: icon = LV_SYMBOL_WIFI; break;
        case 2: icon = LV_SYMBOL_WIFI; break;
        case 1: icon = LV_SYMBOL_WIFI; break;
        default: icon = LV_SYMBOL_WIFI_OFF; break;
    }

    char text[32];
    snprintf(text, sizeof(text), "%s %d", icon, strength * 25);
    lv_label_set_text(wifi_label, text);
}

void ui_main_show_notification(const char *title, const char *message)
{
    if (!notification_container) return;

    lv_obj_clear_flag(notification_container, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *notif = lv_obj_create(notification_container);
    lv_obj_set_size(notif, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_color(notif, COLOR_PRIMARY, 0);
    lv_obj_set_style_radius(notif, 8, 0);
    lv_obj_set_style_pad_all(notif, 16, 0);
    lv_obj_set_flex_flow(notif, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(notif, 4, 0);

    lv_obj_t *title_label = lv_label_create(notif);
    lv_label_set_text(title_label, title);
    lv_obj_set_style_text_color(title_label, LV_COLOR_WHITE, 0);
    lv_obj_set_style_text_font(title_label, &lv_font_montserrat_14, 0);

    lv_obj_t *msg_label = lv_label_create(notif);
    lv_label_set_text(msg_label, message);
    lv_obj_set_style_text_color(msg_label, lv_color_make(0xDB, 0xE8, 0xFE), 0);
    lv_obj_set_style_text_font(msg_label, &lv_font_montserrat_12, 0);

    // Auto-hide after 5 seconds
    lv_timer_t *timer = lv_timer_create((lv_timer_cb_t)lv_obj_add_flag, 5000, notif);
    lv_timer_set_repeat_count(timer, 1);
}

const char* ui_main_get_active_task_id(void)
{
    // Would need to track this in the UI state
    return NULL;
}