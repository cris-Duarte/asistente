/**
 * Productivity Assistant - IMU Driver Implementation
 * BMI270 6-axis IMU
 */

#include "imu.h"
#include <string.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "IMU";

#define BMI270_ADDR 0x68
#define I2C_NUM I2C_NUM_0

// BMI270 Registers
#define BMI270_REG_CHIP_ID      0x00
#define BMI270_REG_ACCEL_X      0x0C
#define BMI270_REG_ACCEL_Y      0x0E
#define BMI270_REG_ACCEL_Z      0x10
#define BMI270_REG_GYRO_X       0x12
#define BMI270_REG_GYRO_Y       0x14
#define BMI270_REG_GYRO_Z       0x16
#define BMI270_REG_TEMP         0x1E
#define BMI270_REG_INT_STATUS   0x1C
#define BMI270_REG_INT_CTRL     0x1F
#define BMI270_REG_ACCEL_CONF   0x3D
#define BMI270_REG_GYRO_CONF    0x3E
#define BMI270_REG_INT1_MAP     0x56
#define BMI270_REG_INT2_MAP     0x57
#define BMI270_REG_WAKEUP_CONF  0x5A
#define BMI270_REG_TAP_CONF     0x5C
#define BMI270_REG_CMD          0x7E

static imu_callback_t imu_callback = NULL;

static esp_err_t imu_read_reg(uint8_t reg, uint8_t *data, size_t len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (BMI270_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, reg, true);
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (BMI270_ADDR << 1) | I2C_MASTER_READ, true);
    if (len > 1) {
        i2c_master_read(cmd, data, len - 1, I2C_MASTER_ACK);
    }
    i2c_master_read_byte(cmd, data + len - 1, I2C_MASTER_NACK);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    return ret;
}

static esp_err_t imu_write_reg(uint8_t reg, uint8_t value)
{
    uint8_t data[2] = {reg, value};
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write(cmd, data, 2, true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    return ret;
}

void imu_init(void)
{
    ESP_LOGI(TAG, "Initializing BMI270 IMU...");
    
    // Read chip ID
    uint8_t chip_id;
    imu_read_reg(BMI270_REG_CHIP_ID, &chip_id, 1);
    ESP_LOGI(TAG, "BMI270 Chip ID: 0x%02X", chip_id);
    
    // Soft reset
    imu_write_reg(BMI270_REG_CMD, 0xB6);
    vTaskDelay(pdMS_TO_TICKS(100));
    
    // Configure accelerometer: 25Hz, 2G, normal mode
    imu_write_reg(BMI270_REG_ACCEL_CONF, 0x28); // 25Hz, 2G, avg4
    
    // Configure gyroscope: 25Hz, 2000dps
    imu_write_reg(BMI270_REG_GYRO_CONF, 0x28); // 25Hz, 2000dps
    
    // Enable interrupt on INT1 pin
    imu_write_reg(BMI270_REG_INT1_MAP, 0x04); // Data ready interrupt
    imu_write_reg(BMI270_REG_INT_CTRL, 0x01); // Enable interrupts
    
    ESP_LOGI(TAG, "BMI270 initialized");
}

void imu_register_callback(imu_callback_t callback)
{
    // Store callback for interrupt handler
}

void imu_read_accel(int16_t *ax, int16_t *ay, int16_t *az)
{
    uint8_t data[6];
    imu_read_reg(BMI270_REG_ACCEL_X, data, 6);
    *ax = (int16_t)((data[1] << 8) | data[0]);
    *ay = (int16_t)((data[3] << 8) | data[2]);
    *az = (int16_t)((data[5] << 8) | data[4]);
}

void imu_read_gyro(int16_t *gx, int16_t *gy, int16_t *gz)
{
    uint8_t data[6];
    imu_read_reg(BMI270_REG_GYRO_X, data, 6);
    *gx = (int16_t)((data[1] << 8) | data[0]);
    *gy = (int16_t)((data[3] << 8) | data[2]);
    *gz = (int16_t)((data[5] << 8) | data[4]);
}

float imu_read_temperature(void)
{
    uint8_t data[2];
    imu_read_reg(BMI270_REG_TEMP, data, 2);
    int16_t temp_raw = (int16_t)((data[1] << 8) | data[0]);
    // Temperature = 23 + temp_raw / 512.0
    return 23.0f + temp_raw / 512.0f;
}

void imu_enable_wake_on_motion(bool enable, uint16_t threshold_mg)
{
    if (enable) {
        // Configure wake on motion
        // Set threshold (0x5A register)
        uint8_t threshold = threshold_mg / 64; // 64mg per LSB
        imu_write_reg(BMI270_REG_WAKEUP_CONF, threshold);
        
        // Enable wake interrupt
        imu_write_reg(BMI270_REG_INT1_MAP, 0x20); // Wake interrupt on INT1
        imu_write_reg(BMI270_REG_INT_CTRL, 0x02); // Enable wake interrupt
    } else {
        imu_write_reg(BMI270_REG_INT1_MAP, 0x00);
    }
}

void imu_enable_tap_detection(bool enable)
{
    if (enable) {
        // Configure tap detection
        imu_write_reg(BMI270_REG_TAP_CONF, 0x89); // Single tap, normal sensitivity
        imu_write_reg(BMI270_REG_INT1_MAP, 0x10); // Tap interrupt on INT1
        imu_write_reg(BMI270_REG_INT_CTRL, 0x04); // Enable tap interrupt
    } else {
        imu_write_reg(BMI270_REG_INT1_MAP, 0x00);
    }
}