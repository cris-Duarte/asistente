FROM espressif/idf:v5.4.2

ARG M5TAB5_COMMIT=68b19d37fbf9cefd5f256992f5dca34794c62ab4
ARG LVGL_COMMIT=7f07a129e8d77f4984fff8e623fd5be18ff42e74
ARG SQLITE_COMMIT=bf5a8617a9c1933b525f9484ed7e328a1d8bd02f

RUN git init /opt/m5tab5 \
    && git -C /opt/m5tab5 remote add origin https://github.com/m5stack/M5Tab5-UserDemo.git \
    && git -C /opt/m5tab5 fetch --depth 1 origin ${M5TAB5_COMMIT} \
    && git -C /opt/m5tab5 checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/m5tab5 rev-parse HEAD)" = "${M5TAB5_COMMIT}"

RUN git init /opt/lvgl \
    && git -C /opt/lvgl remote add origin https://github.com/lvgl/lvgl.git \
    && git -C /opt/lvgl fetch --depth 1 origin ${LVGL_COMMIT} \
    && git -C /opt/lvgl checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/lvgl rev-parse HEAD)" = "${LVGL_COMMIT}"

RUN git init /opt/sqlite \
    && git -C /opt/sqlite remote add origin https://github.com/nopnop2002/esp32-idf-sqlite3.git \
    && git -C /opt/sqlite fetch --depth 1 origin ${SQLITE_COMMIT} \
    && git -C /opt/sqlite checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/sqlite rev-parse HEAD)" = "${SQLITE_COMMIT}"

WORKDIR /project
COPY apps/firmware/ /project/
RUN chmod +x /project/scripts/build.sh

ENV DISPLAY_VARIANT=all
CMD ["bash", "/project/scripts/build.sh"]
