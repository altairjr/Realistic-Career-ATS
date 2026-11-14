#pragma once
#include <cstdint>
typedef uint8_t scs_u8_t; typedef int32_t scs_s32_t; typedef uint32_t scs_u32_t; typedef uint64_t scs_u64_t; typedef int64_t scs_s64_t;
typedef float scs_float_t; typedef double scs_double_t; typedef const char *scs_string_t; typedef void *scs_context_t; typedef scs_u64_t scs_timestamp_t;
typedef scs_s32_t scs_result_t; typedef scs_s32_t scs_log_type_t;
const scs_result_t SCS_RESULT_ok = 0, SCS_RESULT_unsupported = -1, SCS_RESULT_generic_error = -7;
const scs_log_type_t SCS_LOG_TYPE_message = 0, SCS_LOG_TYPE_warning = 1, SCS_LOG_TYPE_error = 2;
const scs_u32_t SCS_U32_NIL = static_cast<scs_u32_t>(-1);
#define SCS_MAKE_VERSION(major, minor) (((major) << 16) | (minor))
#define SCS_GET_MAJOR_VERSION(version) (((version) >> 16) & 0xffff)
#define SCS_GET_MINOR_VERSION(version) ((version) & 0xffff)
#define SCSAPIFUNC
#define SCSAPI_VOID void SCSAPIFUNC
#define SCSAPI_RESULT scs_result_t SCSAPIFUNC
#define SCSAPI_VOID_FPTR(name) void (SCSAPIFUNC *name)
#define SCSAPI_RESULT_FPTR(name) scs_result_t (SCSAPIFUNC *name)
typedef SCSAPI_VOID_FPTR(scs_log_t)(const scs_log_type_t type, const scs_string_t message);
struct scs_sdk_init_params_v100_t { scs_string_t game_name; scs_string_t game_id; scs_u32_t game_version; scs_log_t log; };
