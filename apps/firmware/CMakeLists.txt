# Productivity Assistant - M5Stack Tab5 Firmware
# ESP-IDF v5.x + LVGL v9.x

cmake_minimum_required(3.16)

# Include ESP-IDF build system
include($ENV{IDF_PATH}/tools/cmake/project.cmake)

project(productivity-assistant-firmware)

# Component requirements
set(COMPONENT_REQUIRES
    lvgl
    esp_lvgl_port
    esp_lcd_touch_st7121
    driver
    esp_wifi
    esp_netif
    nvs_flash
    esp_timer
    esp_event
    json
    mbedtls
    esp_https_ota
    esp_http_client
    esp_crt_bundle
    fatfs
    sdmmc
    wear_levelling
    spi_flash
    esp_partition
    esp_system
    log
    freertos
    soc
    hal
)

# SDK config defaults
idf_build_set_property(SDKCONFIG_DEFAULTS "sdkconfig.defaults" "sdkconfig.release")

# Build configuration
idf_build_process("main")