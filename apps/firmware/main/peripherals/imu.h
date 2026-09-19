/**
 * Productivity Assistant - IMU Driver
 * BMI270 6-axis IMU for motion detection and wake
 */

#ifndef IMU_H
#define IMU_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// IMU events
typedef enum {
    IMU_EVENT_NONE = 0,
    IMU_EVENT_WAKEUP = 1,
    IMU_EVENT_TAP = 2,
    IMU_EVENT_ORIENTATION = 3,
} imu_event_type_t;

typedef struct {
    imu_event_type_t type;
    int16_t ax, ay, az;
    int16_t gx, gy, gz;
    float temperature;
} imu_event_t;

typedef void (*imu_callback_t)(const imu_event_t *event);

// Initialize IMU
void imu_init(void);

// Register IMU callback
void imu_register_callback(imu_callback_t callback);

// Read accelerometer data
void imu_read_accel(int16_t *ax, int16_t *ay, int16_t *az);

// Read gyroscope data
void imu_read_gyro(int16_t *gx, int16_t *gy, int16_t *gz);

// Read temperature
float imu_read_temperature(void);

// Enable/disable wake on motion
void imu_enable_wake_on_motion(bool enable, uint16_t threshold_mg);

// Enable/disable tap detection
void imu_enable_tap_detection(bool enable);

#ifdef __cplusplus
}
#endif

#endif // IMU_H