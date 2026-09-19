/**
 * Productivity Assistant - WiFi Manager
 * Handles WiFi connection, reconnection, and event handling
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// WiFi events
typedef enum {
    WIFI_EVENT_CONNECTED = 1,
    WIFI_EVENT_DISCONNECTED = 2,
    WIFI_EVENT_RECONNECTING = 3,
    WIFI_EVENT_FAILED = 4,
} wifi_event_t;

typedef void (*wifi_event_callback_t)(wifi_event_t event, void *data);

// Initialize WiFi manager
void wifi_manager_init(void);

// Connect to WiFi (uses stored credentials)
void wifi_manager_connect(void);

// Disconnect from WiFi
void wifi_manager_disconnect(void);

// Set WiFi credentials
void wifi_manager_set_credentials(const char *ssid, const char *password);

// Get current connection status
bool wifi_manager_is_connected(void);

// Get IP address as string
const char* wifi_manager_get_ip(void);

// Get RSSI
int wifi_manager_get_rssi(void);

// Register event callback
void wifi_manager_register_callback(wifi_event_callback_t callback);

// Start WiFi scan
void wifi_manager_scan(void);

// Get scan results
int wifi_manager_get_scan_results(char *buffer, int buffer_size);

#ifdef __cplusplus
}
#endif

#endif // WIFI_MANAGER_H