set(DISPLAY_VARIANT "$ENV{DISPLAY_VARIANT}")
if(DISPLAY_VARIANT STREQUAL "st7121")
  set(DISPLAY_DEFINE PRODUCTIVITY_DISPLAY_ST7121=1)
elseif(DISPLAY_VARIANT STREQUAL "st7123")
  set(DISPLAY_DEFINE PRODUCTIVITY_DISPLAY_ST7123=1)
else()
  message(FATAL_ERROR "DISPLAY_VARIANT must be st7121 or st7123")
endif()

idf_component_register(
  SRCS
    "productivity_main.cpp"
    "core/sync_model.c"
    "storage/sqlite_store.c"
    "network/wifi_manager.c"
    "network/ota_updater.c"
    "sync/sync_client.c"
    "ui/ui_main.c"
  INCLUDE_DIRS "."
  REQUIRES
    m5stack_tab5
    power_monitor_ina226
    esp32-idf-sqlite3
    esp_wifi_remote
    esp_wifi
    esp_hosted
    esp_http_client
    esp_https_ota
    esp_event
    esp_netif
    nvs_flash
    json
    app_update
)

target_compile_definitions(${COMPONENT_LIB} PRIVATE ${DISPLAY_DEFINE})
