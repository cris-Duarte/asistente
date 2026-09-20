#include "sync_model.h"

uint32_t sync_backoff_ms(uint32_t attempts)
{
    uint32_t shift = attempts > 8 ? 8 : attempts;
    uint32_t delay = 1000U << shift;
    return delay > 300000U ? 300000U : delay;
}

uint32_t sync_duration_seconds(int64_t started_ms, int64_t ended_ms)
{
    if (ended_ms <= started_ms) return 0;
    return (uint32_t)((ended_ms - started_ms) / 1000);
}

bool sync_server_may_replace(uint32_t local_version, bool has_pending_write, uint32_t server_version)
{
    return !has_pending_write && server_version >= local_version;
}

bool sync_is_success_status(int status_code)
{
    return status_code >= 200 && status_code < 300;
}
