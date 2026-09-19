/**
 * Productivity Assistant - Touch Driver Implementation
 * ST7121 touch controller for M5Stack Tab5
 */

#include "touch.h"
#include <string.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "esp_lvgl_port.h"

static const char *TAG = "TOUCH";

#define ST7121_ADDR 0x48  // Touch I2C address

static touch_callback_t touch_callback = NULL;

static esp_err_t touch_read_raw(int16_t *x, int16_t *y, uint16_t *pressure, bool *pressed)
{
    uint8_t data[6];
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (0x48 << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, 0x00, true); // Start from register 0
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (0x48 << 1) | I2C_MASTER_READ, true);
    i2c_master_read(cmd, data, 6, I2C_MASTER_LAST_NACK);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    
    if (ret != ESP_OK) return ret;
    
    // Parse touch data (format depends on ST7121)
    // Register 0: Touch status
    // Register 1-2: X coordinate
    // Register 3-4: Y coordinate
    // Register 5: Pressure
    *pressed = (data[0] & 0x01) != 0;
    *x = (data[1] << 8) | data[2];
    *y = (data[3] << 8) | data[4];
    *pressure = data[5];
    
    // Convert to screen coordinates (1280x720)
    // ST7121 reports 0-4095 range
    *x = (*x * 1280) / 4096;
    *y = (*y * 720) / 4096;
    
    return ESP_OK;
}

void touch_init(void)
{
    ESP_LOGI(TAG, "Initializing touch controller (ST7121)...");
    
    // Initialize touch through LVGL port
    // The LVGL port handles ST7121 initialization internally
    
    ESP_LOGI(TAG, "Touch controller initialized");
}

void touch_register_callback(touch_callback_t callback)
{
    touch_callback = callback;
}

bool touch_read_data(int16_t *x, int16_t *y, uint16_t *pressure, bool *pressed)
{
    return touch_read_raw(x, y, pressure, pressed) == ESP_OK;
}

void touch_set_enabled(bool enabled)
{
    // ST7121 is always enabled through LVGL
}

// This is called by LVGL port to forward touch events
void touch_lvgl_event_handler(lv_indev_t *indev, lv_indev_data_t *data)
{
    int16_t x, y;
    uint16_t pressure;
    bool pressed;
    
    if (touch_read_raw(&x, &y, &pressure, &pressed) == ESP_OK) {
        data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
        data->point.x = x;
        data->point.y = y;
        
        if (touch_callback && pressed) {
            touch_event_t event = {
                .type = pressed ? TOUCH_EVENT_PRESS : TOUCH_EVENT_RELEASE,
                .x = x,
                .y = y,
                .pressure = pressure,
                .pressed = pressed
            };
            touch_callback(&event);
        }
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}