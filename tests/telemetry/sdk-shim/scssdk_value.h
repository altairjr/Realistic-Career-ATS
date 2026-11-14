#pragma once
#include "scssdk.h"
typedef scs_u32_t scs_value_type_t;
const scs_value_type_t SCS_VALUE_TYPE_INVALID = 0, SCS_VALUE_TYPE_bool = 1, SCS_VALUE_TYPE_s32 = 2, SCS_VALUE_TYPE_u32 = 3, SCS_VALUE_TYPE_u64 = 4, SCS_VALUE_TYPE_float = 5,
  SCS_VALUE_TYPE_double = 6, SCS_VALUE_TYPE_fvector = 7, SCS_VALUE_TYPE_dvector = 8, SCS_VALUE_TYPE_euler = 9, SCS_VALUE_TYPE_fplacement = 10,
  SCS_VALUE_TYPE_dplacement = 11, SCS_VALUE_TYPE_string = 12, SCS_VALUE_TYPE_s64 = 13;
struct scs_value_bool_t { scs_u8_t value; }; struct scs_value_s32_t { scs_s32_t value; }; struct scs_value_u32_t { scs_u32_t value; };
struct scs_value_u64_t { scs_u64_t value; }; struct scs_value_s64_t { scs_s64_t value; }; struct scs_value_float_t { scs_float_t value; };
struct scs_value_double_t { scs_double_t value; }; struct scs_value_fvector_t { scs_float_t x, y, z; }; struct scs_value_dvector_t { scs_double_t x, y, z; };
struct scs_value_string_t { scs_string_t value; };
struct scs_value_t {
  scs_value_type_t type; scs_u32_t _padding;
  union { scs_value_bool_t value_bool; scs_value_s32_t value_s32; scs_value_u32_t value_u32; scs_value_u64_t value_u64; scs_value_float_t value_float;
    scs_value_double_t value_double; scs_value_fvector_t value_fvector; scs_value_dvector_t value_dvector; scs_value_string_t value_string; scs_value_s64_t value_s64; };
};
struct scs_named_value_t { scs_string_t name; scs_u32_t index; scs_value_t value; };
