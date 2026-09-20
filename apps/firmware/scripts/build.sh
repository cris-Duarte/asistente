#!/usr/bin/env bash
set -euo pipefail

cd /project
mkdir -p build artifacts

cc -std=c11 -Wall -Wextra -Werror -I main/core \
  main/core/sync_model.c test/native_tests.c -o build/native_tests
build/native_tests

if [[ "${DISPLAY_VARIANT:-all}" == "all" ]]; then
  variants=(st7121 st7123)
else
  variants=("${DISPLAY_VARIANT}")
fi

for variant in "${variants[@]}"; do
  if [[ "${variant}" != "st7121" && "${variant}" != "st7123" ]]; then
    echo "DISPLAY_VARIANT must be st7121, st7123 or all" >&2
    exit 2
  fi
  export DISPLAY_VARIANT="${variant}"
  if [[ ! -f "sdkconfig.${variant}" ]]; then
    idf.py -B "build/${variant}" -D SDKCONFIG="sdkconfig.${variant}" set-target esp32p4
  fi
  idf.py -B "build/${variant}" -D SDKCONFIG="sdkconfig.${variant}" build
  mkdir -p "artifacts/${variant}"
  cp "build/${variant}/productivity_assistant_tab5.bin" "artifacts/${variant}/firmware.bin"
  cp "build/${variant}/bootloader/bootloader.bin" "artifacts/${variant}/bootloader.bin"
  cp "build/${variant}/partition_table/partition-table.bin" "artifacts/${variant}/partition-table.bin"
  cp "build/${variant}/flash_args" "artifacts/${variant}/flash_args"
done
