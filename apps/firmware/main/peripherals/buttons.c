/**
 * Productivity Assistant - Buttons Driver Implementation
 */

#include "buttons.h"
#include <string.h>
#include "esp_log.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

static const char *TAG = "BUTTONS";

#define BUTTON_GPIO GPIO_NUM_1  // Adjust based on Tab5 schematic
#define DEBOUNCE_MS 50
#define LONG_PRESS_MS 1000
#define DOUBLE_PRESS_MS 300

static button_callback_t button_callback = NULL;
static TimerHandle_t debounce_timer = NULL;
static TimerHandle_t long_press_timer = NULL;
static TimerHandle_t double_press_timer = NULL;
static bool button_pressed = false;
static bool long_press_detected = false;
static uint32_t last_press_time = 0;
static int press_count = 0;

static void debounce_timer_callback(TimerHandle_t xTimer)
{
    // Check if button is still pressed
    if (gpio_get_level(BUTTON_GPIO) == 0) {
        button_pressed = true;
        
        // Start long press timer
        xTimerStart(long_press_timer, 0);
    }
}

static void long_press_timer_callback(TimerHandle_t xTimer)
{
    if (button_pressed) {
        long_press_detected = true;
        if (button_callback) {
            button_callback(BUTTON_LONG_PRESS);
        }
    }
}

static void double_press_timer_callback(TimerHandle_t xTimer)
{
    if (press_count == 1) {
        // Single press
        if (!long_press_detected && button_callback) {
            button_callback(BUTTON_SHORT_PRESS);
        }
    } else if (press_count >= 2) {
        // Double press
        if (button_callback) {
            button_callback(BUTTON_DOUBLE_PRESS);
        }
    }
    press_count = 0;
    long_press_detected = false;
}

static void IRAM_ATTR button_isr_handler(void *arg)
{
    static uint32_t last_isr_time = 0;
    uint32_t now = xTaskGetTickCountFromISR();
    
    if (now - last_isr_time < pdMS_TO_TICKS(DEBOUNCE_MS)) {
        return;
    }
    last_isr_time = now;
    
    bool level = gpio_get_level(BUTTON_GPIO) == 0;
    
    if (level) {
        // Button pressed
        BaseType_t higher_priority_task_woken = pdFALSE;
        xTimerStartFromISR(debounce_timer, &higher_priority_task_woken);
        press_count++;
        
        if (press_count == 1) {
            xTimerStartFromISR(double_press_timer, &higher_priority_task_woken);
        }
    } else {
        // Button released
        if (long_press_detected) {
            // Long press was handled, reset
            long_press_detected = false;
        } else {
            // Short press, will be handled by double press timer
        }
    }
    
    if (higher_priority_task_woken) {
        portYIELD_FROM_ISR();
    }
}

void buttons_init(void)
{
    ESP_LOGI(TAG, "Initializing buttons...");
    
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << BUTTON_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_ANYEDGE,
    };
    ESP_ERROR_CHECK(gpio_config(&io_conf));
    
    // Create timers
    debounce_timer = xTimerCreate("btn_debounce", pdMS_TO_TICKS(DEBOUNCE_MS), pdFALSE, NULL, debounce_timer_callback);
    long_press_timer = xTimerCreate("btn_long", pdMS_TO_TICKS(LONG_PRESS_MS), pdFALSE, NULL, long_press_timer_callback);
    double_press_timer = xTimerCreate("btn_double", pdMS_TO_TICKS(DOUBLE_PRESS_MS), pdFALSE, NULL, double_press_timer_callback);
    
    // Install ISR
    ESP_ERROR_CHECK(gpio_install_isr_service(0));
    ESP_ERROR_CHECK(gpio_isr_handler_add(BUTTON_GPIO, button_isr_handler, NULL));
    
    ESP_LOGI(TAG, "Buttons initialized");
}

void buttons_register_callback(button_callback_t callback)
{
    button_callback = callback;
}

bool buttons_is_pressed(void)
{
    return gpio_get_level(BUTTON_GPIO) == 0;
}

void buttons_set_enabled(bool enabled)
{
    if (enabled) {
        gpio_intr_enable(BUTTON_GPIO);
    } else {
        gpio_intr_disable(BUTTON_GPIO);
    }
}