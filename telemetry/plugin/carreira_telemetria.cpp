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
   Controle pela mesma pasta (escrito pelo programa do PC):
     pausado.flag         existe = coleta pausada: o plugin não grava nada
     abrir-com-jogo.txt   caminho do programa do PC: o plugin o abre quando o jogo inicia (se ainda não estiver aberto)
     app.vivo             atualizado pelo programa do PC enquanto está aberto
     comando.txt          comandos de simulação (v0.3): o plugin os digita no console do jogo e apaga o arquivo
                            id <n> | warp <x> | avancar <minutos> | hora <h> <m> | tecla <scancode do console>
                          Só com o jogo em foco, sem pausa e com o caminhão parado há 1,5 s. O resultado vira um
                          registro "cmd" no telemetria.jsonl. (O console precisa estar ligado: g_console e g_developer.)
   Instalação: copiar a DLL para <pasta do jogo>\bin\win_x64\plugins\ */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <filesystem>
#include <chrono>
#include <vector>
#include <sstream>

#if defined(_WIN32)
#  ifndef NOMINMAX
#    define NOMINMAX
#  endif
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#  include <shellapi.h>
#  pragma comment(lib, "shell32.lib")
#  pragma comment(lib, "user32.lib")   // SendInput, GetForegroundWindow (comandos no console)
#endif

#include "scssdk_telemetry.h"

#define PLUGIN_VERSION "0.3.0"
#define PLUGIN_TAG "[carreira-telemetria] "

// Exporta as duas funções que o jogo procura, com o nome exato, seja qual for a ligação declarada no SDK.
#if defined(_MSC_VER)
#  define CARREIRA_EXPORT __pragma(comment(linker, "/EXPORT:" __FUNCTION__ "=" __FUNCDNAME__))
#else
#  define CARREIRA_EXPORT
#endif

namespace {

scs_log_t game_log = nullptr;
std::string out_dir;
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

bool paused_by_user() {
	std::error_code ec;
	return std::filesystem::exists(std::filesystem::u8path(out_dir + "/pausado.flag"), ec);
}

void write_line(const std::string &line) {
	if (out_file.empty()) return;
	if (paused_by_user()) return;   // coleta pausada no programa do PC ou no app: nada é gravado
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
	if (!value || value->type != SCS_VALUE_TYPE_float) return;
	odometer = value->value_float.value;
	// trabalho carregado antes do primeiro valor do odômetro (jogo acabou de abrir): começa a contar daqui
	if (job_active && job_odometer_start < 0) job_odometer_start = odometer;
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
		if (has_job && !job_active) { job_active = true; drive_minutes = 0.0; job_odometer_start = odometer; }   // odômetro -1 = ainda desconhecido
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

/* --- Comandos de simulação no console do jogo (warp, avançar o tempo) ---
   O SDK de telemetria só lê o jogo; para mudar algo, o plugin digita o comando no console, como o jogador faria.
   As teclas vão por código de posição (scancode), então funcionam no teclado americano e no ABNT2. */
long long now_ms() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
int cmd_step = -1;                  // -1 parado; 0 abrir console; 1..n digitar comando n; n+1 fechar console
long long cmd_at = 0, next_check = 0, ready_since = 0;
std::vector<std::string> cmd_console;
std::string cmd_id = "0";
unsigned console_scancode = 0x29;   // tecla abaixo do Esc (` no teclado americano, ' no ABNT2)

bool game_has_focus() {
#if defined(_WIN32)
	HWND w = GetForegroundWindow(); DWORD pid = 0;
	if (!w) return false;
	GetWindowThreadProcessId(w, &pid);
	return pid == GetCurrentProcessId();
#else
	return true;
#endif
}
bool ready_for_console() { return !paused && speed < 0.5f && speed > -0.5f && game_has_focus(); }

// scancode (teclado americano) e se precisa de Shift; 0 = caractere não suportado
unsigned scan_of(char c, bool &shift) {
	static const char *row1 = "1234567890-", *rq = "qwertyuiop", *ra = "asdfghjkl", *rz = "zxcvbnm";
	shift = false;
	if (c == '_') { shift = true; return 0x0C; }
	if (c == ' ') return 0x39;
	if (c == '.') return 0x34;
	if (const char *p = std::strchr(row1, c)) return 0x02 + static_cast<unsigned>(p - row1);
	if (const char *p = std::strchr(rq, c)) return 0x10 + static_cast<unsigned>(p - rq);
	if (const char *p = std::strchr(ra, c)) return 0x1E + static_cast<unsigned>(p - ra);
	if (const char *p = std::strchr(rz, c)) return 0x2C + static_cast<unsigned>(p - rz);
	return 0;
}
#if defined(_WIN32)
void key_scan(unsigned sc, bool up) {
	INPUT in{}; in.type = INPUT_KEYBOARD; in.ki.wScan = static_cast<WORD>(sc); in.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
	SendInput(1, &in, sizeof in);
}
void press(unsigned sc, bool shift = false) { if (shift) key_scan(0x2A, false); key_scan(sc, false); key_scan(sc, true); if (shift) key_scan(0x2A, true); }
#else
// fora do Windows (testes): registra as teclas num arquivo em vez de apertá-las
void typed(const std::string &s) { FILE *f = std::fopen((out_dir + "/teclado.txt").c_str(), "ab"); if (f) { std::fputs(s.c_str(), f); std::fputc('\n', f); std::fclose(f); } }
#endif
void press_console() {
#if defined(_WIN32)
	press(console_scancode);
#else
	typed("<console>");
#endif
}
void type_line(const std::string &text) {
#if defined(_WIN32)
	for (char c : text) { bool sh; const unsigned sc = scan_of(c, sh); if (sc) press(sc, sh); }
	press(0x1C);   // Enter
#else
	typed(text);
#endif
}

void write_cmd_result(bool ok, const char *error) {
	std::string list = "[";
	for (size_t i = 0; i < cmd_console.size(); ++i) list += (i ? "," : "") + esc(cmd_console[i].c_str());
	write_line("{\"t\":\"cmd\",\"id\":" + esc(cmd_id.c_str()) + ",\"ok\":" + (ok ? "true" : "false") + ",\"console\":" + list + "]" +
		(error ? ",\"error\":" + esc(error) : std::string()) + context_json() + "}");
}

// Lê comando.txt e traduz para comandos do console. Retorna mensagem de erro ou nullptr.
const char *load_commands() {
	const std::string path = out_dir + "/comando.txt";
	FILE *fp = std::fopen(path.c_str(), "rb");
	if (!fp) return "";
	std::string text; char buf[512]; size_t n;
	while ((n = std::fread(buf, 1, sizeof buf, fp)) > 0) text.append(buf, n);
	std::fclose(fp);
	std::istringstream all(text);
	std::error_code ec; std::filesystem::remove(std::filesystem::u8path(path), ec);
	cmd_console.clear(); cmd_id = "0";
	std::string line; scs_u32_t t = game_time;
	while (std::getline(all, line)) {
		std::istringstream in(line); std::string op; if (!(in >> op)) continue;
		if (op == "id") in >> cmd_id;
		else if (op == "tecla") { unsigned sc = 0; if (in >> sc && sc > 0 && sc < 0x80) console_scancode = sc; }
		else if (op == "warp") {
			double w = 0; if (!(in >> w) || !(w >= 0.1 && w <= 10.0)) return "valor de warp inválido";
			char b[32]; std::snprintf(b, sizeof b, "warp %g", w); cmd_console.push_back(b);
		}
		else if (op == "hora") {
			int h = -1, m = -1; if (!(in >> h >> m) || h < 0 || h > 23 || m < 0 || m > 59) return "hora inválida";
			char b[32]; std::snprintf(b, sizeof b, "g_set_time %d %d", h, m); cmd_console.push_back(b);
			if (have_time) { const scs_u32_t now_day = t % 1440u, want = static_cast<scs_u32_t>(h * 60 + m); t += want > now_day ? want - now_day : 1440u - now_day + want; }
		}
		else if (op == "avancar") {
			long mins = 0; if (!(in >> mins) || mins < 1 || mins > 2880) return "tempo para avançar inválido";
			if (!have_time) return "o jogo ainda não informou a hora";
			// g_set_time só anda para frente e vai até 24 h: passos de até 12 h
			while (mins > 0) {
				const long step = mins > 720 ? 720 : mins; t += static_cast<scs_u32_t>(step); mins -= step;
				char b[32]; std::snprintf(b, sizeof b, "g_set_time %u %u", (t / 60u) % 24u, t % 60u); cmd_console.push_back(b);
			}
		}
	}
	return nullptr;
}

SCSAPI_VOID on_frame_end(const scs_event_t, const void *const, const scs_context_t) {
	const long long t = now_ms();
	if (cmd_step < 0) {
		if (t < next_check) return;
		next_check = t + 250;
		if (!ready_for_console()) { ready_since = 0; return; }
		if (!ready_since) ready_since = t;
		if (t - ready_since < 1500) return;
		std::error_code ec;
		if (!std::filesystem::exists(std::filesystem::u8path(out_dir + "/comando.txt"), ec)) return;
		const char *err = load_commands();
		if (err && *err) { write_cmd_result(false, err); return; }
		if (err || cmd_console.empty()) return;
		cmd_step = 0; cmd_at = t;
	}
	if (t < cmd_at) return;
	if (!game_has_focus()) { write_cmd_result(false, "o jogo perdeu o foco no meio do comando"); cmd_step = -1; ready_since = 0; return; }
	const int n = static_cast<int>(cmd_console.size());
	if (cmd_step == 0) { press_console(); cmd_step = 1; cmd_at = t + 350; return; }
	if (cmd_step <= n) { type_line(cmd_console[cmd_step - 1]); ++cmd_step; cmd_at = t + 250; return; }
	press_console();
	write_cmd_result(true, nullptr);
	log_msg(("comando no console: " + cmd_console.back()).c_str());
	cmd_step = -1; ready_since = 0;
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
	std::filesystem::create_directories(std::filesystem::u8path(base), ec);
	out_dir = base;
	return base + "/telemetria.jsonl";
}

// Abre o programa do PC junto com o jogo, se o usuário ativou essa opção e ele ainda não estiver aberto
void launch_desktop_app() {
#if defined(_WIN32)
	namespace fs = std::filesystem;
	std::error_code ec;
	FILE *f = std::fopen((out_dir + "/abrir-com-jogo.txt").c_str(), "rb");
	if (!f) return;
	char buf[1024] = {0}; size_t n = std::fread(buf, 1, sizeof buf - 1, f); std::fclose(f);
	std::string exe(buf, n);
	while (!exe.empty() && (exe.back() == '\n' || exe.back() == '\r' || exe.back() == ' ')) exe.pop_back();
	if (exe.empty() || !fs::exists(fs::u8path(exe), ec)) return;
	const fs::path alive = fs::u8path(out_dir + "/app.vivo");
	if (fs::exists(alive, ec)) {
		const auto age = fs::file_time_type::clock::now() - fs::last_write_time(alive, ec);
		if (!ec && age < std::chrono::seconds(20)) return;   // já está aberto
	}
	const std::wstring wexe = fs::u8path(exe).wstring();
	const HINSTANCE r = ShellExecuteW(nullptr, L"open", wexe.c_str(), L"--pelo-jogo", nullptr, SW_SHOWMINNOACTIVE);
	log_msg(reinterpret_cast<INT_PTR>(r) > 32 ? "programa do PC aberto junto com o jogo" : "não foi possível abrir o programa do PC");
#endif
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
	{ std::error_code ec; std::filesystem::remove(std::filesystem::u8path(out_dir + "/comando.txt"), ec); }   // comando de outra sessão não vale

	bool ok = p->register_for_event(SCS_TELEMETRY_EVENT_paused, on_pause, nullptr) == SCS_RESULT_ok
		&& p->register_for_event(SCS_TELEMETRY_EVENT_started, on_pause, nullptr) == SCS_RESULT_ok
		&& p->register_for_event(SCS_TELEMETRY_EVENT_configuration, on_configuration, nullptr) == SCS_RESULT_ok;
	// eventos de jogo (entrega, multa, pedágio...) existem a partir da versão 1.01 da telemetria
	const bool gameplay = version >= SCS_TELEMETRY_VERSION_1_01 && p->register_for_event(SCS_TELEMETRY_EVENT_gameplay, on_gameplay, nullptr) == SCS_RESULT_ok;
	ok = ok && p->register_for_channel("game.time", SCS_U32_NIL, SCS_VALUE_TYPE_u32, SCS_TELEMETRY_CHANNEL_FLAG_each_frame, on_game_time, nullptr) == SCS_RESULT_ok;
	p->register_for_channel("truck.speed", SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_each_frame, on_speed, nullptr);
	p->register_for_event(SCS_TELEMETRY_EVENT_frame_end, on_frame_end, nullptr);
	p->register_for_channel("truck.odometer", SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_each_frame, on_odometer, nullptr);
	if (!ok) { log_msg("não foi possível registrar os eventos"); return SCS_RESULT_generic_error; }

	char ver[32]; std::snprintf(ver, sizeof ver, "%u.%u", SCS_GET_MAJOR_VERSION(p->common.game_version), SCS_GET_MINOR_VERSION(p->common.game_version));
	write_line(std::string("{\"t\":\"start\",\"plugin\":\"" PLUGIN_VERSION "\",\"game\":") + esc(game_id.c_str()) + ",\"gameName\":" + esc(p->common.game_name) +
		",\"telemetryGameVersion\":\"" + ver + "\",\"gameplayEvents\":" + (gameplay ? "true" : "false") + ",\"real\":" + esc(now_iso().c_str()) + "}");
	log_msg((std::string("ativo, gravando em ") + out_file + (paused_by_user() ? " (coleta pausada)" : "")).c_str());
	launch_desktop_app();
	return SCS_RESULT_ok;
}

SCSAPI_VOID scs_telemetry_shutdown(void) {
	CARREIRA_EXPORT
	write_line("{\"t\":\"stop\"" + context_json() + "}");
	game_log = nullptr;
}
