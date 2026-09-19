/**
 * Productivity Assistant - Battery Monitor Implementation
 * INA226 based battery monitoring
 */

#include "battery_monitor.h"
#include <string.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

static const char *TAG = "BATTERY_MON";

#define INA226_ADDR 0x40
#define I2C_NUM I2C_NUM_0

// INA226 Registers
#define INA226_REG_CONFIG     0x00
#define INA226_REG_SHUNT_V    0x01
#define INA226_REG_BUS_V      0x02
#define INA226_REG_POWER      0x03
#define INA226_REG_CURRENT    0x04
#define INA226_REG_CALIB      0x05
#define INA226_REG_MASK       0x06
#define INA226_REG_ALERT      0x07
#define INA226_REG_MANUF_ID   0xFE
#define INA226_REG_DIE_ID     0xFF

// Configuration
#define INA226_SHUNT_RESISTOR 0.01f  // 10mOhm
#define INA226_MAX_CURRENT    5.0f   // 5A max

static uint8_t battery_level = 100;
static bool is_charging = false;
static bool low_battery = false;
static TimerHandle_t monitor_timer = NULL;
static void (*battery_callback)(uint8_t, bool, bool) = NULL;

static esp_err_t ina226_read_reg(uint8_t reg, uint16_t *value)
{
    uint8_t reg_addr = reg;
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (INA226_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, reg_addr, true);
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (INA226_ADDR << 1) | I2C_MASTER_READ, true);
    i2c_master_read_byte(cmd, (uint8_t*)value, I2C_MASTER_NACK);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return ret;
}

static esp_err_t ina226_write_reg(uint8_t reg, uint16_t value)
{
    uint8_t data[3] = {reg, (value >> 8) & 0xFF, value & 0xFF};
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write(cmd, data, 3, true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return ret;
}

static void monitor_timer_callback(TimerHandle_t xTimer)
{
    uint16_t bus_v_raw, current_raw;
    float bus_voltage, current;
    
    // Read bus voltage (LSB = 1.25mV)
    if (ina226_read_reg(INA226_REG_BUS_V, &bus_v_raw) == ESP_OK) {
        float voltage = bus_v_raw * 1.25f; // mV
        int level = (voltage - 3000) * 100 / (4200 - 3000); // 3.0V-4.2V range
        if (level > 100) level = 100;
        if (level < 0) level = 0;
        battery_level = (uint8_t)level;
    }
    
    // Read current (LSB depends on calibration)
    if (ina226_read_reg(INA226_REG_CURRENT, (uint16_t*)&current) == ESP_OK) {
        // Current is signed, LSB = 1mA with proper calibration
        int16_t current_raw = *(int16_t*)&current;
        current = current_raw * 1.0f; // mA
        
        // Determine charging status
        is_charging = current > 50; // >50mA means charging
    }
    
    low_battery = battery_level < 20;
    
    if (battery_callback) {
        battery_callback(battery_level, is_charging, low_battery);
    }
}

void battery_monitor_init(void)
{
    ESP_LOGI(TAG, "Initializing battery monitor...");
    
    // Configure INA226
    // Config: Continuous mode, shunt+bus, 1.1ms conversion time, 16 averages
    uint16_t config = 0x4527; // See datasheet
    ina226_write_reg(INA226_REG_CONFIG, config);
    
    // Calibration: 0.01 ohm shunt, 5A max
    // Current_LSB = Max_Current / 2^15 = 5 / 32768 = 0.00015258789 A = 0.15258789 mA
    // Cal = 0.00512 / (Current_LSB * R_shunt) = 0.00512 / (0.00015258789 * 0.01) = 3355
    uint16_t calibration = 3355;
    ina226_write_reg(INA226_REG_CALIB, calibration);
    
    // Create periodic timer (every 30 seconds)
    monitor_timer = xTimerCreate("battery_mon", pdMS_TO_TICKS(30000), pdTRUE, NULL, monitor_timer_callback);
    
    ESP_LOGI(TAG, "Battery monitor initialized");
}

void battery_monitor_start(void)
{
    if (monitor_timer) {
        xTimerStart(monitor_timer, 0);
    }
}

void battery_monitor_stop(void)
{
    if (monitor_timer) {
        xTimerStop(monitor_timer, 0);
    }
}

uint8_t battery_monitor_get_level(void)
{
    return battery_level;
}

int battery_monitor_get_voltage_mv(void)
{
    // Approximate from level
    return 3000 + (battery_level * 12);
}

int battery_monitor_get_current_ma(void)
{
    // Would need actual INA226 read
    return 0;
}

bool battery_monitor_is_charging(void)
{
    return is_charging;
}

bool battery_monitor_is_low(void)
{
    return low_battery;
}

void battery_monitor_register_callback(void (*callback)(uint8_t, bool, bool))
{
    battery_callback = callback;
}