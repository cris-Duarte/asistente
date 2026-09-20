cmake_minimum_required(VERSION 3.16)

# The firmware image checks out these exact upstream sources. They stay outside
# the project so generated and third-party code does not become application code.
set(EXTRA_COMPONENT_DIRS
    "/opt/m5tab5/platforms/tab5/components/m5stack_tab5"
    "/opt/m5tab5/platforms/tab5/components/power_monitor_ina226"
    "/opt/m5tab5/platforms/tab5/components/esp_lcd_st7121"
    "/opt/m5tab5/platforms/tab5/components/espressif__esp_lvgl_port"
    "/opt/lvgl"
    "/opt/sqlite/components/esp32-idf-sqlite3"
)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(productivity_assistant_tab5)
