#pragma once
#include "scssdk.h"
#include "scssdk_value.h"
#include "scssdk_telemetry_event.h"
#include "scssdk_telemetry_channel.h"
#define SCS_TELEMETRY_VERSION_1_00 SCS_MAKE_VERSION(1, 0)
#define SCS_TELEMETRY_VERSION_1_01 SCS_MAKE_VERSION(1, 1)
struct scs_telemetry_init_params_t { void method_indicating_this_is_not_a_c_struct(void); };
struct scs_telemetry_init_params_v100_t : public scs_telemetry_init_params_t {
  scs_sdk_init_params_v100_t common; scs_telemetry_register_for_event_t register_for_event; scs_telemetry_unregister_from_event_t unregister_from_event;
  scs_telemetry_register_for_channel_t register_for_channel; scs_telemetry_unregister_from_channel_t unregister_from_channel;
};
typedef scs_telemetry_init_params_v100_t scs_telemetry_init_params_v101_t;
SCSAPI_RESULT scs_telemetry_init(const scs_u32_t version, const scs_telemetry_init_params_t *const params);
SCSAPI_VOID scs_telemetry_shutdown(void);
