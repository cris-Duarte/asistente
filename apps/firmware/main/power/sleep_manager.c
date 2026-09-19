/**
 * Productivity Assistant - Sleep Manager Implementation
 */

#include "sleep_manager.h"
#include <string.h>
#include "esp_log.h"
#include "esp_sleep.h"
#include "driver/rtc_io.h"
#include "driver/gpio.h"
#include "esp_pm.h"

static const char *TAG = "SLEEP_MGR";

static wake_source_t last_wake_source = WAKE_SOURCE_TIMER;

void sleep_manager_init(void)
{
    ESP_LOGI(TAG, "Initializing sleep manager...");
    
    // Get wake source
    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    switch (cause) {
        case ESP_SLEEP_WAKEUP_EXT0:
        case ESP_SLEEP_WAKEUP_EXT1:
            last_wake_source = WAKE_SOURCE_BUTTON;
            break;
        case ESP_SLEEP_WAKEUP_TOUCHPAD:
            last_wake_source = WAKE_SOURCE_TOUCH;
            break;
        case ESP_SLEEP_WAKEUP_TIMER:
            last_wake_source = WAKE_SOURCE_TIMER;
            break;
        case ESP_SLEEP_WAKEUP_ULP:
            last_wake_source = WAKE_SOURCE_IMU;
            break;
        default:
            last_wake_source = WAKE_SOURCE_TIMER;
            break;
    }
    
    // Configure RTC GPIO for wake sources
    // GPIO_NUM_0 - Touch interrupt
    // GPIO_NUM_1 - Button
    // GPIO_NUM_2 - IMU interrupt
    
    ESP_LOGI(TAG, "Sleep manager initialized. Wake source: %d", last_wake_source);
}

void sleep_manager_deep_sleep(uint64_t time_us)
{
    ESP_LOGI(TAG, "Entering deep sleep for %" PRIu64 " us", time_us);
    
    // Configure wake sources
    esp_sleep_enable_timer_wakeup(time_us);
    
    // Enable touch wakeup
    esp_sleep_enable_touchpad_wakeup();
    
    // Enable ext1 wakeup (buttons)
    // GPIO_NUM_1 = Button
    esp_sleep_enable_ext1_wakeup(1ULL << 1, ESP_EXT1_WAKEUP_ANY_HIGH);
    
    // Configure RTC peripherals to stay on
    esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
    esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_SLOW_MEM, ESP_PD_OPTION_ON);
    esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_FAST_MEM, ESP_PD_OPTION_ON);
    
    ESP_LOGI(TAG, "Entering deep sleep...");
    esp_deep_sleep_start();
}

void sleep_manager_light_sleep(uint64_t time_us)
{
    ESP_LOGI(TAG, "Entering light sleep for %" PRIu64 " us", time_us);
    
    esp_sleep_enable_timer_wakeup(time_us);
    esp_sleep_enable_touchpad_wakeup();
    
    // Light sleep keeps more peripherals on
    esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
    esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_SLOW_MEM, ESP_PD_OPTION_ON);
    
    esp_light_sleep_start();
}

void sleep_manager_wake(void)
{
    // Called after wake from light sleep
    ESP_LOGI(TAG, "Woke from light sleep");
    
    // Re-initialize peripherals if needed
    // esp_pm_lock_release();
}

wake_source_t sleep_manager_get_wake_source(void)
{
    return last_wake_source;
}

void sleep_manager_enable_wake_source(wake_source_t source, bool enable)
{
    switch (source) {
        case WAKE_SOURCE_TOUCH:
            if (enable) {
                esp_sleep_enable_touchpad_wakeup();
            } else {
                esp_sleep_disable_touchpad_wakeup();
            }
            break;
        case WAKE_SOURCE_BUTTON:
            if (enable) {
                esp_sleep_enable_ext1_wakeup(1ULL << 1, ESP_EXT1_WAKEUP_ANY_HIGH);
            } else {
                esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_EXT1);
            }
            break;
        case WAKE_SOURCE_IMU:
            if (enable) {
                esp_sleep_enable_ulp_wakeup();
            } else {
                esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ULP);
            }
            break;
        case WAKE_SOURCE_RTC:
            if (enable) {
                // RTC wake is handled by timer
            }
            break;
        case WAKE_SOURCE_TIMER:
            // Timer is handled separately
            break;
    }
}

void sleep_manager_set_wake_timer(uint64_t time_us)
{
    esp_sleep_enable_timer_wakeup(time_us);
}