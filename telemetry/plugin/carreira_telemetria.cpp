/* Carreira Realista ATS — plugin de telemetria para American Truck Simulator / Euro Truck Simulator 2
   (SDK de telemetria da SCS, versão 1.16).

   O que faz: grava, numa linha JSON por registro, o que acontece no jogo e que importa para a carreira:
     start / stop        jogo abriu ou fechou
     time                mudou o dia no jogo (com o tempo do jogo em minutos)
     job                 trabalho atual (todos os atributos que o SDK informa; vazio = sem trabalho)
     truck               caminhão em uso (só os textos: marca, modelo...)
     event               eventos de jogo (entrega, cancelamento, multa, pedágio, balsa, trem, abastecimento...)
                         com todos os atributos, o tempo do jogo, o odômetro e os minutos dirigidos no trabalho
   Não interpreta nada: quem decide o que é viagem, frete ou despesa é o programa companheiro
   (telemetry/companion), que lê este arquivo. Assim, mudanças do SDK não exigem recompilar o plugin.

   Arquivo: %LOCALAPPDATA%\CarreiraRealistaATS\telemetria.jsonl (ou a pasta em CARREIRA_TELEMETRIA_DIR).
   Instalação: copiar a DLL para <pasta do jogo>\bin\win_x64\plugins\ */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <filesystem>

#include "scssdk_telemetry.h"

#define PLUGIN_VERSION "0.1.0"
#define PLUGIN_TAG "[carreira-telemetria] "

// Exporta as duas funções que o jogo procura, com o nome exato, seja qual for a ligação declarada no SDK.
#if defined(_MSC_VER)
#  define CARREIRA_EXPORT __pragma(comment(linker, "/EXPORT:" __FUNCTION__ "=" __FUNCDNAME__))
#else
#  define CARREIRA_EXPORT
#endif

namespace {

scs_log_t game_log = nullptr;
std::string out_file;
std::string game_id = "?";

bool paused = true;
bool have_time = false;
scs_u32_t game_time = 0;          // minutos desde o início do perfil
long last_day = -1;
float speed = 0.0f;               // m/s
float odometer = -1.0f;           // km
bool job_active = false;
double drive_minutes = 0.0;       // minutos de jogo com o caminhão andando, desde o início do trabalho
float job_odometer_start = -1.0f;

void log_msg(const char *msg) {
	if (!game_log) return;
	std::string s = std::string(PLUGIN_TAG) + msg;
	game_log(SCS_LOG_TYPE_message, s.c_str());
}

std::string esc(const char *s) {
	std::string o = "\"";
	for (const unsigned char *p = reinterpret_cast<const unsigned char *>(s ? s : ""); *p; ++p) {
		switch (*p) {
			case '"': o += "\\\""; break;
			case '\\': o += "\\\\"; break;
			case '\n': o += "\\n"; break;
			case '\r': o += "\\r"; break;
			case '\t': o += "\\t"; break;
			default:
				if (*p < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", *p); o += b; }
				else o += static_cast<char>(*p);
		}
	}
	return o + "\"";
}

std::string num(double v) { char b[64]; std::snprintf(b, sizeof b, "%.6g", v); return b; }

std::string now_iso() {
	std::time_t t = std::time(nullptr);
	std::tm g{};
#if defined(_WIN32)
	gmtime_s(&g, &t);
#else
	gmtime_r(&t, &g);
#endif
	char b[32]; std::strftime(b, sizeof b, "%Y-%m-%dT%H:%M:%SZ", &g);
	return b;
}

std::string value_json(const scs_value_t &v) {
	switch (v.type) {
		case SCS_VALUE_TYPE_bool: return v.value_bool.value ? "true" : "false";
		case SCS_VALUE_TYPE_s32: return std::to_string(v.value_s32.value);
		case SCS_VALUE_TYPE_u32: return std::to_string(v.value_u32.value);
		case SCS_VALUE_TYPE_u64: return std::to_string(v.value_u64.value);
		case SCS_VALUE_TYPE_s64: return std::to_string(v.value_s64.value);
		case SCS_VALUE_TYPE_float: return num(v.value_float.value);
		case SCS_VALUE_TYPE_double: return num(v.value_double.value);
		case SCS_VALUE_TYPE_string: return esc(v.value_string.value);
		case SCS_VALUE_TYPE_fvector: return "[" + num(v.value_fvector.x) + "," + num(v.value_fvector.y) + "," + num(v.value_fvector.z) + "]";
		case SCS_VALUE_TYPE_dvector: return "[" + num(v.value_dvector.x) + "," + num(v.value_dvector.y) + "," + num(v.value_dvector.z) + "]";
		default: return "null";   // posições e rotações não interessam à carreira
	}
}

// Atributos { "nome": valor } (com "[n]" quando o atributo é indexado). only_text: só textos (caminhão).
std::string attrs_json(const scs_named_value_t *a, bool only_text = false) {
	std::string o = "{"; bool first = true;
	for (; a && a->name; ++a) {
		if (only_text && a->value.type != SCS_VALUE_TYPE_string) continue;
		std::string key = a->name;
		if (a->index != SCS_U32_NIL) key += "[" + std::to_string(a->index) + "]";
		o += (first ? "" : ",") + esc(key.c_str()) + ":" + value_json(a->value);
		first = false;
	}
	return o + "}";
}

std::string context_json() {
	std::string o = ",\"gameTime\":" + (have_time ? std::to_string(game_time) : std::string("null"));
	o += ",\"odometer\":" + (odometer >= 0 ? num(odometer) : std::string("null"));
	return o + ",\"real\":" + esc(now_iso().c_str());
}

void write_line(const std::string &line) {
	if (out_file.empty()) return;
	std::error_code ec;
	// arquivo grande demais: guarda a versão anterior e começa outro
	if (std::filesystem::exists(out_file, ec) && std::filesystem::file_size(out_file, ec) > 5u * 1024u * 1024u) {
		std::filesystem::rename(out_file, out_file + ".1", ec);
	}
	FILE *f = std::fopen(out_file.c_str(), "ab");
	if (!f) return;
	std::fputs(line.c_str(), f); std::fputc('\n', f);
	std::fclose(f);
}

/* --- Canais (valores que mudam a cada instante) --- */
SCSAPI_VOID on_game_time(const scs_string_t, const scs_u32_t, const scs_value_t *const value, const scs_context_t) {
	if (!value || value->type != SCS_VALUE_TYPE_u32) return;
	const scs_u32_t t = value->value_u32.value;
	// minutos dirigidos: o tempo do jogo andou e o caminhão estava em movimento (saltos grandes = dormir, balsa, trem)
	if (have_time && job_active && !paused && t > game_time && t - game_time <= 30 && (speed > 1.0f || speed < -1.0f)) drive_minutes += t - game_time;
	game_time = t; have_time = true;
	const long day = static_cast<long>(t / 1440u);
	if (day != last_day) {
		last_day = day;
		write_line("{\"t\":\"time\"" + context_json() + "}");
	}
}
SCSAPI_VOID on_speed(const scs_string_t, const scs_u32_t, const scs_value_t *const value, const scs_context_t) {
	if (value && value->type == SCS_VALUE_TYPE_float) speed = value->value_float.value;
}
SCSAPI_VOID on_odometer(const scs_string_t, const scs_u32_t, const scs_value_t *const value, const scs_context_t) {
	if (value && value->type == SCS_VALUE_TYPE_float) odometer = value->value_float.value;
}

/* --- Eventos --- */
SCSAPI_VOID on_pause(const scs_event_t event, const void *const, const scs_context_t) {
	paused = (event == SCS_TELEMETRY_EVENT_paused);
}

SCSAPI_VOID on_configuration(const scs_event_t, const void *const event_info, const scs_context_t) {
	const scs_telemetry_configuration_t *info = static_cast<const scs_telemetry_configuration_t *>(event_info);
	if (!info || !info->id) return;
	if (std::strcmp(info->id, "job") == 0) {
		const bool has_job = info->attributes && info->attributes->name;
		if (has_job && !job_active) { job_active = true; drive_minutes = 0.0; job_odometer_start = odometer; }
		if (!has_job) job_active = false;
		write_line("{\"t\":\"job\",\"attrs\":" + attrs_json(info->attributes) + ",\"jobOdometerStart\":" + (job_odometer_start >= 0 ? num(job_odometer_start) : std::string("null")) + context_json() + "}");
	}
	else if (std::strcmp(info->id, "truck") == 0) {
		write_line("{\"t\":\"truck\",\"attrs\":" + attrs_json(info->attributes, true) + context_json() + "}");
	}
}

SCSAPI_VOID on_gameplay(const scs_event_t, const void *const event_info, const scs_context_t) {
	const scs_telemetry_gameplay_event_t *info = static_cast<const scs_telemetry_gameplay_event_t *>(event_info);
	if (!info || !info->id) return;
	write_line("{\"t\":\"event\",\"id\":" + esc(info->id) + ",\"attrs\":" + attrs_json(info->attributes) +
		",\"driveMinutes\":" + num(drive_minutes) + ",\"jobOdometerStart\":" + (job_odometer_start >= 0 ? num(job_odometer_start) : std::string("null")) + context_json() + "}");
	if (std::strcmp(info->id, "job.delivered") == 0 || std::strcmp(info->id, "job.cancelled") == 0) job_active = false;
}

std::string output_path() {
	const char *dir = std::getenv("CARREIRA_TELEMETRIA_DIR");
	std::string base;
	if (dir && *dir) base = dir;
	else {
		const char *local = std::getenv("LOCALAPPDATA");
		if (!local || !*local) return "";
		base = std::string(local) + "/CarreiraRealistaATS";
	}
	std::error_code ec;
	std::filesystem::create_directories(base, ec);
	return base + "/telemetria.jsonl";
}

} // namespace

SCSAPI_RESULT scs_telemetry_init(const scs_u32_t version, const scs_telemetry_init_params_t *const params) {
	CARREIRA_EXPORT
	if (version != SCS_TELEMETRY_VERSION_1_01 && version != SCS_TELEMETRY_VERSION_1_00) return SCS_RESULT_unsupported;
	const scs_telemetry_init_params_v100_t *const p = static_cast<const scs_telemetry_init_params_v100_t *>(params);
	game_log = p->common.log;
	game_id = p->common.game_id ? p->common.game_id : "?";
	out_file = output_path();
	if (out_file.empty()) { log_msg("sem pasta para gravar (LOCALAPPDATA vazio); plugin desligado"); return SCS_RESULT_generic_error; }

	bool ok = p->register_for_event(SCS_TELEMETRY_EVENT_paused, on_pause, nullptr) == SCS_RESULT_ok
		&& p->register_for_event(SCS_TELEMETRY_EVENT_started, on_pause, nullptr) == SCS_RESULT_ok
		&& p->register_for_event(SCS_TELEMETRY_EVENT_configuration, on_configuration, nullptr) == SCS_RESULT_ok;
	// eventos de jogo (entrega, multa, pedágio...) existem a partir da versão 1.01 da telemetria
	const bool gameplay = version >= SCS_TELEMETRY_VERSION_1_01 && p->register_for_event(SCS_TELEMETRY_EVENT_gameplay, on_gameplay, nullptr) == SCS_RESULT_ok;
	ok = ok && p->register_for_channel("game.time", SCS_U32_NIL, SCS_VALUE_TYPE_u32, SCS_TELEMETRY_CHANNEL_FLAG_none, on_game_time, nullptr) == SCS_RESULT_ok;
	p->register_for_channel("truck.speed", SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, on_speed, nullptr);
	p->register_for_channel("truck.odometer", SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, on_odometer, nullptr);
	if (!ok) { log_msg("não foi possível registrar os eventos"); return SCS_RESULT_generic_error; }

	char ver[32]; std::snprintf(ver, sizeof ver, "%u.%u", SCS_GET_MAJOR_VERSION(p->common.game_version), SCS_GET_MINOR_VERSION(p->common.game_version));
	write_line(std::string("{\"t\":\"start\",\"plugin\":\"" PLUGIN_VERSION "\",\"game\":") + esc(game_id.c_str()) + ",\"gameName\":" + esc(p->common.game_name) +
		",\"gameVersion\":\"" + ver + "\",\"gameplayEvents\":" + (gameplay ? "true" : "false") + ",\"real\":" + esc(now_iso().c_str()) + "}");
	log_msg((std::string("ativo, gravando em ") + out_file).c_str());
	return SCS_RESULT_ok;
}

SCSAPI_VOID scs_telemetry_shutdown(void) {
	CARREIRA_EXPORT
	write_line("{\"t\":\"stop\"" + context_json() + "}");
	game_log = nullptr;
}
