/**
 * Productivity Assistant - RTC Driver
 * RX8130CE Real-Time Clock
 */

#ifndef RTC_H
#define RTC_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint8_t year;
    uint8_t month;
    uint8_t day;
    uint8_t hour;
    uint8_t minute;
    uint8_t second;
    uint8_t weekday; // 1=Monday, 7=Sunday
} rtc_datetime_t;

// Initialize RTC
void rtc_init(void);

// Get current date/time
bool rtc_get_datetime(rtc_datetime_t *dt);

// Set date/time
bool rtc_set_datetime(const rtc_datetime_t *dt);

// Set alarm
bool rtc_set_alarm(const rtc_datetime_t *dt, bool enable);

// Check if alarm triggered
bool rtc_check_alarm(void);

// Clear alarm flag
void rtc_clear_alarm(void);

// Enable/disable alarm interrupt
void rtc_enable_alarm_interrupt(bool enable);

// Get timestamp (Unix time)
int64_t rtc_get_timestamp(void);

// Set timestamp
void rtc_set_timestamp(int64_t timestamp);

// Sync with system time
void rtc_sync_system_time(void);

#ifdef __cplusplus
}
#endif

#endif // RTC_H