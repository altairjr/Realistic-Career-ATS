#pragma once
#include "scssdk_value.h"
typedef scs_u32_t scs_event_t;
const scs_event_t SCS_TELEMETRY_EVENT_invalid = 0, SCS_TELEMETRY_EVENT_frame_start = 1, SCS_TELEMETRY_EVENT_frame_end = 2, SCS_TELEMETRY_EVENT_paused = 3,
  SCS_TELEMETRY_EVENT_started = 4, SCS_TELEMETRY_EVENT_configuration = 5, SCS_TELEMETRY_EVENT_gameplay = 6;
struct scs_telemetry_configuration_t { scs_string_t id; const scs_named_value_t *attributes; };
struct scs_telemetry_gameplay_event_t { scs_string_t id; const scs_named_value_t *attributes; };
typedef SCSAPI_VOID_FPTR(scs_telemetry_event_callback_t)(const scs_event_t event, const void *const event_info, const scs_context_t context);
typedef SCSAPI_RESULT_FPTR(scs_telemetry_register_for_event_t)(const scs_event_t event, const scs_telemetry_event_callback_t callback, const scs_context_t context);
typedef SCSAPI_RESULT_FPTR(scs_telemetry_unregister_from_event_t)(const scs_event_t event);
