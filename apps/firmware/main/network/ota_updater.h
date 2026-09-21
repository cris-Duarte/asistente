#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void ota_updater_confirm_running_image(void);
bool ota_updater_install(const char *signed_image_url);
bool ota_updater_check_manifest(const char *manifest_url, const char *device_token);

#ifdef __cplusplus
}
#endif
