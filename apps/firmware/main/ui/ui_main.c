#include "ui/ui_main.h"

#include <stdint.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include "bsp/m5stack_tab5.h"
#include "lvgl.h"

static ui_callbacks_t s_callbacks;
static stored_task_t s_tasks[STORAGE_MAX_TASKS];
static int s_task_count;
static int s_selected = -1;
static bool s_timer_running;
static char s_timer_task_id[37];

static lv_obj_t *s_list;
static lv_obj_t *s_title;
static lv_obj_t *s_description;
static lv_obj_t *s_timer;
static lv_obj_t *s_timer_button_label;
static lv_obj_t *s_sync;
static lv_obj_t *s_device_status;
static lv_obj_t *s_wifi;
static lv_obj_t *s_pairing;
static lv_obj_t *s_pairing_code;
static lv_obj_t *s_wifi_modal;
static lv_obj_t *s_wifi_dropdown;
static lv_obj_t *s_wifi_password;

static lv_obj_t *button(lv_obj_t *parent, const char *text, lv_event_cb_t callback)
{
    lv_obj_t *item = lv_button_create(parent);
    lv_obj_set_height(item, 54);
    lv_obj_add_event_cb(item, callback, LV_EVENT_CLICKED, NULL);
    lv_obj_t *label = lv_label_create(item);
    lv_label_set_text(label, text);
    lv_obj_center(label);
    return item;
}

static void update_detail(void)
{
    if (s_selected < 0 || s_selected >= s_task_count) {
        lv_label_set_text(s_title, "Selecciona una tarea");
        lv_label_set_text(s_description, "La lista se conserva sin conexión.");
        return;
    }
    const stored_task_t *task = &s_tasks[s_selected];
    lv_label_set_text(s_title, task->title);
    char detail[420];
    snprintf(detail, sizeof(detail), "%s\n\nEstado: %s  ·  Estimado: %" PRId32 " min  ·  Registrado: %" PRId32 " min",
             task->description[0] ? task->description : "Sin descripción", task->status,
             task->estimated_minutes, task->total_tracked_seconds / 60);
    lv_label_set_text(s_description, detail);
    lv_label_set_text(s_timer_button_label,
                      s_timer_running && strcmp(s_timer_task_id, task->id) == 0 ? "Pausar" : "Iniciar");
}

static void task_clicked(lv_event_t *event)
{
    s_selected = (int)(intptr_t)lv_event_get_user_data(event);
    update_detail();
}

static void done_clicked(lv_event_t *event)
{
    (void)event;
    if (s_selected >= 0 && s_callbacks.set_task_status) {
        s_callbacks.set_task_status(&s_tasks[s_selected], "done");
    }
}

static void timer_clicked(lv_event_t *event)
{
    (void)event;
    if (s_selected >= 0 && s_callbacks.toggle_timer) s_callbacks.toggle_timer(&s_tasks[s_selected]);
}

static void wifi_close(lv_event_t *event)
{
    (void)event;
    if (s_wifi_modal) lv_obj_add_flag(s_wifi_modal, LV_OBJ_FLAG_HIDDEN);
}

static void wifi_connect(lv_event_t *event)
{
    (void)event;
    if (!s_callbacks.connect_wifi) return;
    char ssid[33] = {0};
    lv_dropdown_get_selected_str(s_wifi_dropdown, ssid, sizeof(ssid));
    s_callbacks.connect_wifi(ssid, lv_textarea_get_text(s_wifi_password));
    lv_obj_add_flag(s_wifi_modal, LV_OBJ_FLAG_HIDDEN);
}

static void wifi_open(lv_event_t *event)
{
    (void)event;
    if (!s_wifi_modal) return;
    char ssids[12][33] = {{0}};
    int rssi[12] = {0};
    int count = s_callbacks.scan_wifi ? s_callbacks.scan_wifi(ssids, rssi, 12) : 0;
    char options[512] = {0};
    for (int index = 0; index < count; ++index) {
        if (index) strlcat(options, "\n", sizeof(options));
        strlcat(options, ssids[index], sizeof(options));
    }
    lv_dropdown_set_options(s_wifi_dropdown, count ? options : "No se encontraron redes");
    lv_obj_remove_flag(s_wifi_modal, LV_OBJ_FLAG_HIDDEN);
}

static void textarea_focus(lv_event_t *event)
{
    lv_obj_t *textarea = lv_event_get_target_obj(event);
    lv_obj_t *keyboard = lv_keyboard_create(s_wifi_modal);
    lv_obj_set_size(keyboard, LV_PCT(100), 270);
    lv_obj_align(keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_keyboard_set_textarea(keyboard, textarea);
    lv_obj_add_event_cb(keyboard, wifi_close, LV_EVENT_CANCEL, NULL);
}

void ui_main_init(const ui_callbacks_t *callbacks)
{
    s_callbacks = *callbacks;
    lv_obj_t *screen = lv_screen_active();
    lv_obj_set_style_bg_color(screen, lv_color_hex(0xF4F6FA), 0);
    lv_obj_set_style_pad_all(screen, 18, 0);

    lv_obj_t *header = lv_obj_create(screen);
    lv_obj_set_size(header, LV_PCT(100), 68);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *brand = lv_label_create(header);
    lv_label_set_text(brand, "Productividad");
    lv_obj_set_style_text_font(brand, &lv_font_montserrat_28, 0);
    s_device_status = lv_label_create(header);
    lv_label_set_text(s_device_status, "--:-- UTC · Bat --");
    s_sync = lv_label_create(header);
    lv_label_set_text(s_sync, "Sin conexión");
    s_wifi = lv_label_create(header);
    lv_label_set_text(s_wifi, LV_SYMBOL_WIFI " Configurar");
    lv_obj_add_flag(s_wifi, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(s_wifi, wifi_open, LV_EVENT_CLICKED, NULL);

    lv_obj_t *body = lv_obj_create(screen);
    lv_obj_set_size(body, LV_PCT(100), 600);
    lv_obj_align(body, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_flex_flow(body, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(body, 18, 0);

    s_list = lv_list_create(body);
    lv_obj_set_size(s_list, 430, LV_PCT(100));

    lv_obj_t *detail = lv_obj_create(body);
    lv_obj_set_flex_grow(detail, 1);
    lv_obj_set_height(detail, LV_PCT(100));
    lv_obj_set_flex_flow(detail, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(detail, 18, 0);
    s_title = lv_label_create(detail);
    lv_obj_set_style_text_font(s_title, &lv_font_montserrat_28, 0);
    lv_label_set_text(s_title, "Selecciona una tarea");
    s_description = lv_label_create(detail);
    lv_obj_set_width(s_description, LV_PCT(100));
    lv_label_set_long_mode(s_description, LV_LABEL_LONG_WRAP);
    lv_label_set_text(s_description, "La lista se conserva sin conexión.");
    s_timer = lv_label_create(detail);
    lv_obj_set_style_text_font(s_timer, &lv_font_montserrat_48, 0);
    lv_label_set_text(s_timer, "00:00:00");

    lv_obj_t *actions = lv_obj_create(detail);
    lv_obj_set_size(actions, LV_PCT(100), 80);
    lv_obj_set_flex_flow(actions, LV_FLEX_FLOW_ROW);
    lv_obj_t *timer_button = button(actions, "Iniciar", timer_clicked);
    s_timer_button_label = lv_obj_get_child(timer_button, 0);
    button(actions, "Completar", done_clicked);

    s_pairing = lv_obj_create(detail);
    lv_obj_set_width(s_pairing, LV_PCT(100));
    lv_obj_add_flag(s_pairing, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *pairing_text = lv_label_create(s_pairing);
    lv_label_set_text(pairing_text, "Vincula esta Tab5 en Ajustes con el código:");
    s_pairing_code = lv_label_create(s_pairing);
    lv_obj_set_style_text_font(s_pairing_code, &lv_font_montserrat_28, 0);
    lv_obj_align(s_pairing_code, LV_ALIGN_BOTTOM_MID, 0, 0);

    s_wifi_modal = lv_obj_create(screen);
    lv_obj_set_size(s_wifi_modal, 760, 600);
    lv_obj_center(s_wifi_modal);
    lv_obj_set_flex_flow(s_wifi_modal, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(s_wifi_modal, 14, 0);
    lv_obj_add_flag(s_wifi_modal, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *wifi_title = lv_label_create(s_wifi_modal);
    lv_label_set_text(wifi_title, "Conectar Wi-Fi");
    lv_obj_set_style_text_font(wifi_title, &lv_font_montserrat_28, 0);
    s_wifi_dropdown = lv_dropdown_create(s_wifi_modal);
    lv_obj_set_width(s_wifi_dropdown, LV_PCT(100));
    s_wifi_password = lv_textarea_create(s_wifi_modal);
    lv_textarea_set_placeholder_text(s_wifi_password, "Contraseña");
    lv_textarea_set_password_mode(s_wifi_password, true);
    lv_obj_set_width(s_wifi_password, LV_PCT(100));
    lv_obj_add_event_cb(s_wifi_password, textarea_focus, LV_EVENT_FOCUSED, NULL);
    lv_obj_t *wifi_actions = lv_obj_create(s_wifi_modal);
    lv_obj_set_size(wifi_actions, LV_PCT(100), 75);
    lv_obj_set_flex_flow(wifi_actions, LV_FLEX_FLOW_ROW);
    button(wifi_actions, "Conectar", wifi_connect);
    button(wifi_actions, "Cerrar", wifi_close);
}

void ui_main_set_tasks(const stored_task_t *tasks, int count)
{
    if (!bsp_display_lock(1000)) return;
    s_task_count = count > STORAGE_MAX_TASKS ? STORAGE_MAX_TASKS : count;
    memcpy(s_tasks, tasks, sizeof(stored_task_t) * (size_t)s_task_count);
    lv_obj_clean(s_list);
    for (int index = 0; index < s_task_count; ++index) {
        char text[210];
        snprintf(text, sizeof(text), "%s  ·  %s", s_tasks[index].title, s_tasks[index].status);
        lv_obj_t *item = lv_list_add_button(s_list, strcmp(s_tasks[index].status, "done") == 0 ? LV_SYMBOL_OK : LV_SYMBOL_RIGHT, text);
        lv_obj_add_event_cb(item, task_clicked, LV_EVENT_CLICKED, (void *)(intptr_t)index);
    }
    if (s_selected >= s_task_count) s_selected = -1;
    update_detail();
    bsp_display_unlock();
}

void ui_main_set_timer(const stored_time_entry_t *entry, uint32_t elapsed_seconds, bool running)
{
    if (!bsp_display_lock(1000)) return;
    s_timer_running = running;
    strlcpy(s_timer_task_id, entry ? entry->task_id : "", sizeof(s_timer_task_id));
    char text[16];
    snprintf(text, sizeof(text), "%02" PRIu32 ":%02" PRIu32 ":%02" PRIu32,
             elapsed_seconds / 3600, (elapsed_seconds / 60) % 60, elapsed_seconds % 60);
    lv_label_set_text(s_timer, text);
    update_detail();
    bsp_display_unlock();
}

void ui_main_set_sync(const char *message, int pending)
{
    if (!bsp_display_lock(1000)) return;
    char text[128];
    snprintf(text, sizeof(text), "%s%s%d", message, pending ? " · pendientes: " : "", pending);
    lv_label_set_text(s_sync, text);
    bsp_display_unlock();
}

void ui_main_set_device_status(const char *clock_text, float battery_voltage)
{
    if (!bsp_display_lock(1000)) return;
    char text[64];
    if (battery_voltage > 0.0f) {
        snprintf(text, sizeof(text), "%s · Bat %.2f V", clock_text, (double)battery_voltage);
    } else {
        snprintf(text, sizeof(text), "%s · Bat --", clock_text);
    }
    lv_label_set_text(s_device_status, text);
    bsp_display_unlock();
}

void ui_main_set_pairing_code(const char *code)
{
    if (!bsp_display_lock(1000)) return;
    lv_label_set_text(s_pairing_code, code ? code : "");
    if (code && code[0]) lv_obj_remove_flag(s_pairing, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(s_pairing, LV_OBJ_FLAG_HIDDEN);
    bsp_display_unlock();
}

void ui_main_set_wifi(bool connected, const char *message)
{
    if (!bsp_display_lock(1000)) return;
    char text[96];
    snprintf(text, sizeof(text), LV_SYMBOL_WIFI " %s", message ? message : (connected ? "Conectado" : "Sin conexión"));
    lv_label_set_text(s_wifi, text);
    bsp_display_unlock();
}
