cmake_minimum_required(VERSION 3.4.1)

add_library(expo_worker_crash SHARED
    src/main/cpp/crash.cpp
)

find_library(log-lib log)

target_link_libraries(expo_worker_crash
    ${log-lib}
)
