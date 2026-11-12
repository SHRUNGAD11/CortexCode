

cmake_minimum_required(VERSION 3.20)

project(CortexCode LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(cortexcode
    src/main.cpp
    src/CodeAnalyzer.cpp
)

target_include_directories(cortexcode PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_options(cortexcode PRIVATE
    -Wall
    -Wextra
    -Wpedantic
)
