/**
 * Productivity Assistant - RTC Driver Implementation
 * RX8130CE Real-Time Clock
 */

#include "rtc.h"
#include <string.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "time.h"
#include "esp_system.h"

static const char *TAG = "RTC";

#define RX8130_ADDR 0x32

// RX8130 Registers
#define RX8130_REG_SEC      0x00
#define RX8130_REG_MIN      0x01
#define RX8130_REG_HOUR     0x02
#define RX8130_REG_WEEKDAY  0x03
#define RX8130_REG_DAY      0x04
#define RX8130_REG_MONTH    0x05
#define RX8130_REG_YEAR     0x06
#define RX8130_REG_ALARM_MIN    0x07
#define RX8130_REG_ALARM_HOUR   0x08
#define RX8130_REG_ALARM_WEEK   0x09
#define RX8130_REG_ALARM_DAY    0x0A
#define RX8130_REG_FLAG     0x0C
#define RX8130_REG_CTRL1    0x0D
#define RX8130_REG_CTRL2    0x0E
#define RX8130_REG_EXT      0x0F

static uint8_t bcd_to_dec(uint8_t bcd)
{
    return (bcd >> 4) * 10 + (bcd & 0x0F);
}

static uint8_t dec_to_bcd(uint8_t dec)
{
    return ((dec / 10) << 4) | (dec % 10);
}

static esp_err_t rtc_read_reg(uint8_t reg, uint8_t *data, size_t len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RX8130_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, reg, true);
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RX8130_ADDR << 1) | I2C_MASTER_READ, true);
    if (len > 1) {
        i2c_master_read(cmd, data, len - 1, I2C_MASTER_ACK);
    }
    i2c_master_read_byte(cmd, data + len - 1, I2C_MASTER_NACK);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    return ret;
}

static esp_err_t rtc_write_reg(uint8_t reg, uint8_t value)
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

void rtc_init(void)
{
    ESP_LOGI(TAG, "Initializing RX8130CE RTC...");
    
    // Check if RTC is running
    uint8_t ctrl1;
    rtc_read_reg(RX8130_REG_CTRL1, &ctrl1, 1);
    
    // Enable oscillator if stopped
    if (ctrl1 & 0x20) { // STOP bit
        ctrl1 &= ~0x20;
        rtc_write_reg(RX8130_REG_CTRL1, ctrl1);
        ESP_LOGI(TAG, "RTC oscillator started");
    }
    
    // Enable 24-hour format
    ctrl1 &= ~0x40; // 24H bit
    rtc_write_reg(RX8130_REG_CTRL1, ctrl1);
    
    ESP_LOGI(TAG, "RTC initialized");
}

bool rtc_get_datetime(rtc_datetime_t *dt)
{
    uint8_t data[7];
    esp_err_t ret = rtc_read_reg(RX8130_REG_SEC, data, 7);
    if (ret != ESP_OK) return false;
    
    dt->second = bcd_to_dec(data[0] & 0x7F);
    dt->minute = bcd_to_dec(data[1] & 0x7F);
    dt->hour = bcd_to_dec(data[2] & 0x3F);
    dt->weekday = bcd_to_dec(data[3] & 0x07);
    dt->day = bcd_to_dec(data[4] & 0x3F);
    dt->month = bcd_to_dec(data[5] & 0x1F);
    dt->year = bcd_to_dec(data[6]);
    
    return true;
}

bool rtc_set_datetime(const rtc_datetime_t *dt)
{
    uint8_t data[7] = {
        dec_to_bcd(dt->second),
        dec_to_bcd(dt->minute),
        dec_to_bcd(dt->hour),
        dec_to_bcd(dt->weekday),
        dec_to_bcd(dt->day),
        dec_to_bcd(dt->month),
        dec_to_bcd(dt->year),
    };
    
    // Stop oscillator during write
    uint8_t ctrl1;
    rtc_read_reg(RX8130_REG_CTRL1, &ctrl1, 1);
    ctrl1 |= 0x20; // STOP bit
    rtc_write_reg(RX8130_REG_CTRL1, ctrl1);
    
    // Write time
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RX8130_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, RX8130_REG_SEC, true);
    i2c_master_write(cmd, data, 7, true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    
    // Restart oscillator
    rtc_read_reg(RX8130_REG_CTRL1, &ctrl1, 1);
    ctrl1 &= ~0x20;
    rtc_write_reg(RX8130_REG_CTRL1, ctrl1);
    
    return ret == ESP_OK;
}

bool rtc_set_alarm(const rtc_datetime_t *dt, bool enable)
{
    if (!enable) {
        // Disable alarm
        uint8_t ctrl2;
        rtc_read_reg(RX8130_REG_CTRL2, &ctrl2, 1);
        ctrl2 &= ~0x01; // AIE bit
        rtc_write_reg(RX8130_REG_CTRL2, ctrl2);
        return true;
    }
    
    uint8_t data[4] = {
        dec_to_bcd(dt->minute),
        dec_to_bcd(dt->hour),
        dec_to_bcd(dt->weekday),
        dec_to_bcd(dt->day),
    };
    
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RX8130_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, RX8130_REG_ALARM_MIN, true);
    i2c_master_write(cmd, data, 4, true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(cmd);
    
    if (ret != ESP_OK) return false;
    
    // Enable alarm interrupt
    uint8_t ctrl2;
    rtc_read_reg(RX8130_REG_CTRL2, &ctrl2, 1);
    ctrl2 |= 0x01; // AIE bit
    rtc_write_reg(RX8130_REG_CTRL2, ctrl2);
    
    return true;
}

bool rtc_check_alarm(void)
{
    uint8_t flag;
    rtc_read_reg(RX8130_REG_FLAG, &flag, 1);
    return (flag & 0x01) != 0; // AF bit
}

void rtc_clear_alarm(void)
{
    uint8_t flag;
    rtc_read_reg(RX8130_REG_FLAG, &flag, 1);
    flag &= ~0x01; // Clear AF bit
    rtc_write_reg(RX8130_REG_FLAG, flag);
}

void rtc_enable_alarm_interrupt(bool enable)
{
    uint8_t ctrl2;
    rtc_read_reg(RX8130_REG_CTRL2, &ctrl2, 1);
    if (enable) {
        ctrl2 |= 0x01; // AIE bit
    } else {
        ctrl2 &= ~0x01;
    }
    rtc_write_reg(RX8130_REG_CTRL2, ctrl2);
}

int64_t rtc_get_timestamp(void)
{
    rtc_datetime_t dt;
    if (!rtc_get_datetime(&dt)) return 0;
    
    struct tm tm = {
        .tm_year = dt->year + 100, // Years since 1900
        .tm_mon = dt->month - 1,
        .tm_mday = dt->day,
        .tm_hour = dt->hour,
        .tm_min = dt->minute,
        .tm_sec = dt->second,
        .tm_isdst = 0,
    };
    
    time_t time = mktime(&tm);
    return (int64_t)time;
}

void rtc_set_timestamp(int64_t timestamp)
{
    time_t time = (time_t)timestamp;
    struct tm *tm = localtime(&time);
    
    rtc_datetime_t dt = {
        .year = tm->tm_year - 100,
        .month = tm->tm_mon + 1,
        .day = tm->tm_mday,
        .hour = tm->tm_hour,
        .minute = tm->tm_min,
        .second = tm->tm_sec,
        .weekday = tm->tm_wday == 0 ? 7 : tm->tm_wday,
    };
    
    rtc_set_datetime(&dt);
}

void rtc_sync_system_time(void)
{
    // Set system time from RTC
    int64_t timestamp = rtc_get_timestamp();
    if (timestamp > 0) {
        struct timeval tv = {.tv_sec = timestamp, .tv_usec = 0};
        settimeofday(&tv, NULL);
        ESP_LOGI(TAG, "System time synced from RTC");
    }
}