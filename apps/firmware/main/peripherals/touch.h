/**
 * Productivity Assistant - Touch Driver
 * ST7121 touch controller for M5Stack Tab5
 */

#ifndef TOUCH_H
#define TOUCH_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Touch events
typedef enum {
    TOUCH_EVENT_PRESS = 1,
    TOUCH_EVENT_RELEASE = 2,
    TOUCH_EVENT_MOVE = 3,
} touch_event_type_t;

typedef struct {
    touch_event_type_t type;
    int16_t x;
    int16_t y;
    uint16_t pressure;
    bool pressed;
} touch_event_t;

typedef void (*touch_callback_t)(const touch_event_t *event);

// Initialize touch controller
void touch_init(void);

// Register touch callback
void touch_register_callback(touch_callback_t callback);

// Read touch data (for polling)
bool touch_read_data(int16_t *x, int16_t *y, uint16_t *pressure, bool *pressed);

// Enable/disable touch
void touch_set_enabled(bool enabled);

#ifdef __cplusplus
}
#endif

#endif // TOUCH_H