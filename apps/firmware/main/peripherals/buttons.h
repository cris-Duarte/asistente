/**
 * Productivity Assistant - Buttons Driver
 * Physical buttons for M5Stack Tab5
 */

#ifndef BUTTONS_H
#define BUTTONS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Button events
typedef enum {
    BUTTON_EVENT_NONE = 0,
    BUTTON_SHORT_PRESS = 1,
    BUTTON_LONG_PRESS = 2,
    BUTTON_DOUBLE_PRESS = 3,
} button_event_t;

typedef void (*button_callback_t)(button_event_t event);

// Initialize buttons
void buttons_init(void);

// Register button callback
void buttons_register_callback(button_callback_t callback);

// Get current button state
bool buttons_is_pressed(void);

// Enable/disable button interrupts
void buttons_set_enabled(bool enabled);

#ifdef __cplusplus
}
#endif

#endif // BUTTONS_H