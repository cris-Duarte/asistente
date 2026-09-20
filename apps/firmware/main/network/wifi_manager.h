#pragma once

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*wifi_manager_callback_t)(bool connected, const char *message);

bool wifi_manager_init(wifi_manager_callback_t callback);
bool wifi_manager_connect_saved(void);
bool wifi_manager_save_and_connect(const char *ssid, const char *password);
bool wifi_manager_is_connected(void);
int wifi_manager_scan(char ssids[][33], int rssi[], int capacity);

#ifdef __cplusplus
}
#endif
