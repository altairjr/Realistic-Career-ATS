#pragma once
#include "scssdk_value.h"
const scs_u32_t SCS_TELEMETRY_CHANNEL_FLAG_none = 0, SCS_TELEMETRY_CHANNEL_FLAG_each_frame = 1, SCS_TELEMETRY_CHANNEL_FLAG_no_value = 2;
typedef SCSAPI_VOID_FPTR(scs_telemetry_channel_callback_t)(const scs_string_t name, const scs_u32_t index, const scs_value_t *const value, const scs_context_t context);
typedef SCSAPI_RESULT_FPTR(scs_telemetry_register_for_channel_t)(const scs_string_t name, const scs_u32_t index, const scs_value_type_t type, const scs_u32_t flags,
  const scs_telemetry_channel_callback_t callback, const scs_context_t context);
typedef SCSAPI_RESULT_FPTR(scs_telemetry_unregister_from_channel_t)(const scs_string_t name, const scs_u32_t index, const scs_value_type_t type);
