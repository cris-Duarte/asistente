#include <assert.h>
#include <stdio.h>
#include "sync_model.h"

int main(void)
{
    assert(sync_backoff_ms(0) == 1000);
    assert(sync_backoff_ms(3) == 8000);
    assert(sync_backoff_ms(30) == 256000);
    assert(sync_duration_seconds(1000, 61500) == 60);
    assert(sync_duration_seconds(2000, 1000) == 0);
    assert(sync_server_may_replace(3, false, 3));
    assert(!sync_server_may_replace(3, true, 9));
    assert(!sync_server_may_replace(4, false, 3));
    assert(sync_is_success_status(201));
    assert(!sync_is_success_status(409));
    puts("firmware native tests: ok");
    return 0;
}
