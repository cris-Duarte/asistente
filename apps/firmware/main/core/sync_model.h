#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

uint32_t sync_backoff_ms(uint32_t attempts);
uint32_t sync_duration_seconds(int64_t started_ms, int64_t ended_ms);
bool sync_server_may_replace(uint32_t local_version, bool has_pending_write, uint32_t server_version);
bool sync_is_success_status(int status_code);

#ifdef __cplusplus
}
#endif
