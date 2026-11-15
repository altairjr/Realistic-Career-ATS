// Imita o jogo para testar o plugin fora do Windows: carrega o plugin, chama os callbacks como o jogo faria
// e segue um roteiro em texto (uma ação por linha). Espaços nos valores são escritos como '+'.
//   frame <ms> (espera e chama o fim do quadro) | file <nome> <texto> (grava na pasta do plugin; '+' = espaço, '|' = nova linha)
//   time <minutos> | speed <m/s> | odo <km> | pause 0|1 | job <atributos> | nojob | truck <atributos> | event <id> <atributos> | init <versao> | shutdown
//   atributo: tipo:nome=valor   (tipos: s, u32, u64, s32, s64, f, b)
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include "scssdk_telemetry.h"

static std::map<scs_event_t, scs_telemetry_event_callback_t> events;
static std::map<std::string, scs_telemetry_channel_callback_t> channels;
static SCSAPI_RESULT reg_event(const scs_event_t e, const scs_telemetry_event_callback_t cb, const scs_context_t) { events[e] = cb; return SCS_RESULT_ok; }
static SCSAPI_RESULT unreg_event(const scs_event_t e) { events.erase(e); return SCS_RESULT_ok; }
static SCSAPI_RESULT reg_channel(const scs_string_t n, const scs_u32_t, const scs_value_type_t, const scs_u32_t, const scs_telemetry_channel_callback_t cb, const scs_context_t) { channels[n] = cb; return SCS_RESULT_ok; }
static SCSAPI_RESULT unreg_channel(const scs_string_t n, const scs_u32_t, const scs_value_type_t) { channels.erase(n); return SCS_RESULT_ok; }
static SCSAPI_VOID game_log(const scs_log_type_t, const scs_string_t m) { std::fprintf(stderr, "log: %s\n", m); }

struct Attrs { std::vector<std::string> keep; std::vector<scs_named_value_t> list; };
static void parse_attrs(std::istringstream &in, Attrs &a) {
	std::string tok;
	std::vector<std::string> toks; while (in >> tok) toks.push_back(tok);
	a.keep.reserve(toks.size() * 2 + 2);
	for (auto &t : toks) {
		size_t c = t.find(':'), e = t.find('=');
		std::string type = t.substr(0, c), name = t.substr(c + 1, e - c - 1), val = t.substr(e + 1);
		for (auto &ch : val) if (ch == '+') ch = ' ';
		a.keep.push_back(name); a.keep.push_back(val);
		scs_named_value_t nv{}; nv.index = SCS_U32_NIL;
		if (type == "s") { nv.value.type = SCS_VALUE_TYPE_string; }
		else if (type == "u32") { nv.value.type = SCS_VALUE_TYPE_u32; nv.value.value_u32.value = (scs_u32_t)std::strtoul(val.c_str(), 0, 10); }
		else if (type == "u64") { nv.value.type = SCS_VALUE_TYPE_u64; nv.value.value_u64.value = std::strtoull(val.c_str(), 0, 10); }
		else if (type == "s32") { nv.value.type = SCS_VALUE_TYPE_s32; nv.value.value_s32.value = (scs_s32_t)std::strtol(val.c_str(), 0, 10); }
		else if (type == "s64") { nv.value.type = SCS_VALUE_TYPE_s64; nv.value.value_s64.value = std::strtoll(val.c_str(), 0, 10); }
		else if (type == "f") { nv.value.type = SCS_VALUE_TYPE_float; nv.value.value_float.value = std::strtof(val.c_str(), 0); }
		else if (type == "b") { nv.value.type = SCS_VALUE_TYPE_bool; nv.value.value_bool.value = val == "1"; }
		a.list.push_back(nv);
	}
	for (size_t i = 0; i < a.list.size(); i++) { a.list[i].name = a.keep[i * 2].c_str(); if (a.list[i].value.type == SCS_VALUE_TYPE_string) a.list[i].value.value_string.value = a.keep[i * 2 + 1].c_str(); }
	scs_named_value_t end{}; end.name = nullptr; a.list.push_back(end);
}
static void channel(const char *n, const scs_value_t &v) { auto it = channels.find(n); if (it != channels.end()) it->second(n, SCS_U32_NIL, &v, nullptr); }

int main(int argc, char **argv) {
	if (argc < 2) { std::fprintf(stderr, "uso: harness roteiro.txt\n"); return 2; }
	std::ifstream f(argv[1]); std::string line;
	scs_telemetry_init_params_v101_t p{};
	p.common.game_name = "American Truck Simulator"; p.common.game_id = "ats"; p.common.game_version = SCS_MAKE_VERSION(1, 5); p.common.log = game_log;
	p.register_for_event = reg_event; p.unregister_from_event = unreg_event; p.register_for_channel = reg_channel; p.unregister_from_channel = unreg_channel;
	while (std::getline(f, line)) {
		std::istringstream in(line); std::string cmd; if (!(in >> cmd) || cmd[0] == '#') continue;
		if (cmd == "init") { std::string v; in >> v; scs_u32_t ver = v == "1.00" ? SCS_TELEMETRY_VERSION_1_00 : SCS_TELEMETRY_VERSION_1_01;
			std::printf("init=%d\n", scs_telemetry_init(ver, &p)); }
		else if (cmd == "time") { scs_value_t v{}; v.type = SCS_VALUE_TYPE_u32; in >> v.value_u32.value; channel("game.time", v); }
		else if (cmd == "speed") { scs_value_t v{}; v.type = SCS_VALUE_TYPE_float; in >> v.value_float.value; channel("truck.speed", v); }
		else if (cmd == "odo") { scs_value_t v{}; v.type = SCS_VALUE_TYPE_float; in >> v.value_float.value; channel("truck.odometer", v); }
		else if (cmd == "pause") { int x; in >> x; auto cb = events[x ? SCS_TELEMETRY_EVENT_paused : SCS_TELEMETRY_EVENT_started]; if (cb) cb(x ? SCS_TELEMETRY_EVENT_paused : SCS_TELEMETRY_EVENT_started, nullptr, nullptr); }
		else if (cmd == "job" || cmd == "nojob" || cmd == "truck") { Attrs a; if (cmd != "nojob") parse_attrs(in, a); else { scs_named_value_t e{}; a.list.push_back(e); }
			scs_telemetry_configuration_t c{ cmd == "truck" ? "truck" : "job", a.list.data() }; auto cb = events[SCS_TELEMETRY_EVENT_configuration]; if (cb) cb(SCS_TELEMETRY_EVENT_configuration, &c, nullptr); }
		else if (cmd == "event") { std::string id; in >> id; Attrs a; parse_attrs(in, a);
			scs_telemetry_gameplay_event_t g{ id.c_str(), a.list.data() }; auto cb = events[SCS_TELEMETRY_EVENT_gameplay]; if (cb) cb(SCS_TELEMETRY_EVENT_gameplay, &g, nullptr); }
		else if (cmd == "frame") { int ms = 0; in >> ms; if (ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(ms)); auto cb = events[SCS_TELEMETRY_EVENT_frame_end]; if (cb) cb(SCS_TELEMETRY_EVENT_frame_end, nullptr, nullptr); }
		else if (cmd == "file") { std::string name, text; in >> name >> text; for (auto &ch : text) { if (ch == '+') ch = ' '; else if (ch == '|') ch = '\n'; }
			const char *d = std::getenv("CARREIRA_TELEMETRIA_DIR"); std::ofstream o(std::string(d ? d : ".") + "/" + name, std::ios::binary); o << text; }
		else if (cmd == "shutdown") scs_telemetry_shutdown();
	}
	return 0;
}
