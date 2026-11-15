// Núcleo do programa do PC, usado pela janela de terminal (companion.mjs) e pelo app de PC (desktop/).
// A cada volta (cycle):
//   1. lê o game.log.txt do jogo → perfil carregado
//   2. lê as linhas novas do plugin (telemetria.jsonl) → entregas e situação do jogo (core.mjs)
//   3. aplica o controle: coleta pausada ou perfil não ligado à carreira → nada vai para a conta
//   4. envia rascunhos, situação do jogo e o sinal de vida do PC; busca o controle que está na conta
//   5. simulação (v0.21): pede ao plugin para digitar no console do jogo o warp e os avanços de tempo (comando.txt)
import { readFileSync, writeFileSync, existsSync, statSync, openSync, readSync, closeSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { renameSync } from 'node:fs';
import { createState, apply } from './core.mjs';
import { parseGameLog, profileAt, currentProfile } from './gamelog.mjs';

export const PAUSE_FLAG = 'pausado.flag';   // com este arquivo na pasta, o plugin não grava nada
const HEARTBEAT_MS = 60e3;
export const CMD_FILE = 'comando.txt';      // lido e apagado pelo plugin (veja telemetry/plugin)
// Simulação no jogo, ajustada no app (Ajustes › Telemetria do jogo): desligada até o usuário ligar
export const SIM_DEFAULT = { warpOn: false, warp: 0.9, loadOn: false, loadMinutes: 60 };
export function cleanSim(v) {
  const o = Object.assign({}, SIM_DEFAULT, v && typeof v === 'object' ? v : {});
  const n = (x, lo, hi, d) => { x = Number(x); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  return { warpOn: !!o.warpOn, warp: Math.round(n(o.warp, 0.1, 2, 0.9) * 100) / 100, loadOn: !!o.loadOn, loadMinutes: Math.round(n(o.loadMinutes, 0, 720, 60)) };
}
// O console do jogo está ligado? (config.cfg na mesma pasta do game.log.txt) 'ok' | 'off' | 'unknown'
export function consoleState(gameLogPath) {
  if (!gameLogPath) return 'unknown';
  try {
    const t = readFileSync(join(dirname(gameLogPath), 'config.cfg'), 'utf8');
    const on = k => new RegExp(`uset\\s+${k}\\s+"?1"?`).test(t);
    return on('g_console') && on('g_developer') ? 'ok' : 'off';
  } catch (e) { return 'unknown'; }
}

export function createRunner(opts) {
  const { dir, url, key } = opts;
  const now = opts.now || (() => Date.now());
  const log = opts.log || (() => {});
  const notify = opts.notify || (() => {});
  const fetchFn = opts.fetch || fetch;
  mkdirSync(dir, { recursive: true });
  const FILE = opts.file || join(dir, 'telemetria.jsonl');
  const STATE = join(dir, 'companheiro.json'), SESSION = join(dir, 'sessao.json'), CONTROL = join(dir, 'controle.json');
  const load = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return d; } };

  const saved = load(STATE, {});
  const S = { offset: saved.offset || 0, core: Object.assign(createState(), saved.core || {}), queue: saved.queue || [], status: saved.status || null, lastDelivery: saved.lastDelivery || null };
  // controle: coleta ligada e perfil ligado à carreira. Vem da conta; a cópia local vale sem internet.
  const control = Object.assign({ collect: true, linkedProfile: null, sim: null }, load(CONTROL, {}));
  let session = load(SESSION, null);
  let gameLog = null, gameLogPath = opts.gameLogPath || null, logMtime = 0;
  let lastStatusSent = null, lastBeat = 0, busy = false;
  const info = { sendError: null, lastCycle: null, lastSim: null, simWarned: null, noSimCols: false };
  const CMD = join(dir, CMD_FILE);
  let simQueue = [], simSeq = Math.floor(now() / 1000) % 1e6, warpDone = null;
  const sim = () => cleanSim(control.sim);

  const persist = () => writeFileSync(STATE, JSON.stringify({ offset: S.offset, core: S.core, queue: S.queue, status: S.status, lastDelivery: S.lastDelivery }));
  const saveControl = () => writeFileSync(CONTROL, JSON.stringify(control));
  // a pausa também desliga o plugin: ele confere este arquivo antes de gravar
  const syncPauseFlag = () => { const f = join(dir, PAUSE_FLAG); if (control.collect) rmSync(f, { force: true }); else if (!existsSync(f)) writeFileSync(f, 'Coleta pausada pelo Carreira Realista. Apague este arquivo para voltar a coletar.\n'); };
  syncPauseFlag();

  /* --- servidor --- */
  async function http(path, { method = 'GET', body, token, headers = {} } = {}) {
    const res = await fetchFn(url + path, { method, headers: Object.assign({ apikey: key, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers), body: body ? JSON.stringify(body) : undefined });
    const t = await res.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
    if (!res.ok) { const e = new Error((d && (d.msg || d.message || d.error_description)) || `Erro ${res.status}`); e.status = res.status; e.code = d && (d.code || d.error_code); throw e; }
    return d;
  }
  const sessionFrom = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(now() / 1000) + (d.expires_in || 3600), user: { id: d.user.id, email: d.user.email } });
  const saveSession = s => { session = s; if (s) { writeFileSync(SESSION, JSON.stringify(s)); try { chmodSync(SESSION, 0o600); } catch (e) {} } else rmSync(SESSION, { force: true }); };
  async function token() {
    if (!session) throw Object.assign(new Error('Sem login'), { status: 401, noSession: true });
    if (session.expires_at - 60 > now() / 1000) return session.access_token;
    try { saveSession(sessionFrom(await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }))); }
    catch (e) { if (e.status === 400 || e.status === 401) { saveSession(null); e.noSession = true; } throw e; }
    return session.access_token;
  }
  async function rest(path, o) {
    try { return await http('/rest/v1/' + path, Object.assign({}, o, { token: await token() })); }
    catch (e) { if (e.status !== 401 || !session) throw e; session.expires_at = 0; return http('/rest/v1/' + path, Object.assign({}, o, { token: await token() })); }
  }

  /* --- leitura --- */
  function readGameLog() {
    if (!gameLogPath) return;
    try { const m = statSync(gameLogPath).mtimeMs; if (m !== logMtime) { logMtime = m; gameLog = parseGameLog(readFileSync(gameLogPath, 'utf8')); } }
    catch (e) { gameLog = null; }
  }
  function readNew() {
    if (!existsSync(FILE)) return [];
    const size = statSync(FILE).size;
    if (size < S.offset) S.offset = 0;   // o plugin recomeçou o arquivo
    if (size === S.offset) return [];
    const fd = openSync(FILE, 'r'), buf = Buffer.alloc(size - S.offset);
    readSync(fd, buf, 0, buf.length, S.offset); closeSync(fd);
    const text = buf.toString('utf8'), cut = text.lastIndexOf('\n');
    if (cut < 0) return [];
    S.offset += Buffer.byteLength(text.slice(0, cut + 1));   // linha incompleta fica para a próxima volta
    return text.slice(0, cut).split('\n').filter(l => l.trim());
  }

  // Este registro pode ir para a conta? Coleta ligada e (perfil desconhecido ou o perfil ligado)
  function blockedReason(rec) {
    if (!control.collect) return 'paused';
    const p = rec && rec.real ? profileAt(gameLog, rec.real) : null;
    if (!control.linkedProfile && p) { control.linkedProfile = p; saveControl(); control.pendingLink = true; log(`Perfil "${p}" ligado à carreira. Outros perfis não enviam nada.`); notify({ type: 'profile-linked', profile: p }); }
    if (p && control.linkedProfile && p !== control.linkedProfile) return 'profile';
    return null;
  }

  function processLines(lines, diag) {
    for (const line of lines) {
      let rec; try { rec = JSON.parse(line); } catch (e) { continue; }
      if (diag) diag(line);
      const why = blockedReason(rec);
      for (const o of apply(S.core, rec)) {
        if (o.type === 'log') log(o.text);
        if (o.type === 'draft') {
          if (why) { log(`Entrega não enviada: ${why === 'paused' ? 'coleta pausada' : `perfil "${profileAt(gameLog, rec.real)}" não ligado à carreira`}.`); continue; }
          S.queue.push({ kind: 'draft', body: o.draft });
          S.lastDelivery = { at: new Date(now()).toISOString(), title: `${o.draft.data.origin || '?'} → ${o.draft.data.dest || '?'}`, freight: o.draft.data.freight, miles: o.draft.data.miles };
          notify({ type: 'delivery', draft: o.draft });
          // tempo de carga e descarga: o relógio do jogo anda depois da entrega (só entrega recente, não ao reler o arquivo)
          const sm = sim();
          if (sm.loadOn && sm.loadMinutes > 0 && recent(rec)) simQueue.push({ advance: sm.loadMinutes, why: 'load' });
        }
        if (o.type === 'cmd') {
          info.lastSim = { at: o.cmd.at || new Date(now()).toISOString(), ok: o.cmd.ok, text: o.cmd.ok ? o.cmd.text : o.cmd.error };
          notify({ type: 'sim', cmd: o.cmd });
        }
        if (o.type === 'status') S.status = Object.assign({}, o.status, { blocked: why });
      }
    }
  }

  const recent = rec => !rec.real || now() - Date.parse(rec.real) < 15 * 60e3;

  /* --- simulação: comandos para o console do jogo --- */
  // Por que agora não dá para mandar comandos ao jogo (null = pode)
  function simBlock() {
    if (!control.collect) return 'paused';
    if (S.status && S.status.blocked) return 'profile';
    if (!S.core.online) return 'offline';
    if (consoleState(gameLogPath) === 'off') return 'console';
    return null;
  }
  const SIM_WHY = { paused: 'coleta pausada', profile: 'perfil do jogo não ligado à carreira', offline: 'jogo fechado', console: 'o console do jogo está desligado (g_console e g_developer em config.cfg)' };
  function simTick() {
    const why = simBlock(), sm = sim();
    if (why) {
      if (why === 'console' && (sm.warpOn || sm.loadOn || simQueue.length) && info.simWarned !== 'console') { log('Simulação parada: ' + SIM_WHY.console + '.'); info.simWarned = 'console'; }
      if (simQueue.length && why !== 'console') log(`Comando do jogo descartado: ${SIM_WHY[why]}.`);
      simQueue = []; rmSync(CMD, { force: true }); return;
    }
    info.simWarned = null;
    // warp: uma vez por sessão do jogo e perfil; desligar volta ao normal (1)
    const ctx = `${S.core.session}|${currentProfile(gameLog) || ''}`;
    if (sm.warpOn && !(warpDone && warpDone.ctx === ctx && warpDone.value === sm.warp)) { simQueue.push({ warp: sm.warp }); warpDone = { ctx, value: sm.warp }; }
    else if (!sm.warpOn && warpDone && warpDone.ctx === ctx && warpDone.value !== 1) { simQueue.push({ warp: 1 }); warpDone = { ctx, value: 1 }; }
    // o plugin apaga o arquivo quando lê; só escreve outro depois disso (junta os pedidos que chegaram no meio)
    if (!simQueue.length || existsSync(CMD)) return;
    let warp = null, hour = null, advance = 0;
    for (const c of simQueue) { if (c.warp != null) warp = c.warp; if (c.hour) { hour = c.hour; advance = 0; } if (c.advance) advance += c.advance; }
    const lines = [`id ${++simSeq}`];
    if (warp != null) lines.push(`warp ${warp}`);
    if (hour) lines.push(`hora ${hour[0]} ${hour[1]}`);
    if (advance) lines.push(`avancar ${Math.min(2880, advance)}`);
    writeFileSync(CMD + '.tmp', lines.join('\n') + '\n'); renameSync(CMD + '.tmp', CMD);
    simQueue = [];
  }
  // Pedidos do overlay: avançar o tempo ou ir para uma hora
  function simRequest(c) {
    const why = simBlock();
    if (why) return { ok: false, error: `Não dá agora: ${SIM_WHY[why]}.` };
    simQueue.push(c); simTick();
    return { ok: true };
  }
  const advanceTime = minutes => { const m = Math.round(Number(minutes)); if (!(m >= 1 && m <= 2880)) return { ok: false, error: 'Tempo inválido.' }; return simRequest({ advance: m }); };
  const setTime = (h, m) => { h = Math.round(Number(h)); m = Math.round(Number(m)); if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return { ok: false, error: 'Hora inválida.' }; return simRequest({ hour: [h, m] }); };

  /* --- envio --- */
  function statusBody() {
    const st = S.status || {};
    const base = { user_id: session.user.id, pc_seen_at: new Date(now()).toISOString(), profile: currentProfile(gameLog), plugin: S.core.plugin || null, game_version: S.core.gameVersion || null, last_delivery: S.lastDelivery };
    if (!info.noSimCols) base.sim_last = info.lastSim;
    if (control.pendingLink) base.linked_profile = control.linkedProfile;
    // bloqueado: não envia dia, trabalho nem caminhão de outro perfil (o app ficaria com dados errados)
    if (st.blocked) return Object.assign(base, { online: !!st.online, blocked: st.blocked });
    return Object.assign(base, { online: !!st.online, blocked: null, game: st.game || 'ats', game_time: st.game_time ?? null, job: st.job ?? null, truck: st.truck ?? null, updated_at: new Date(now()).toISOString() });
  }
  async function pullControl() {
    let r;
    try { r = await rest(`game_status?select=collect,linked_profile${info.noSimCols ? '' : ',sim'}&user_id=eq.${session.user.id}`); }
    catch (e) { if (info.noSimCols || !/sim/.test(e.message)) throw e; info.noSimCols = true; return pullControl(); }
    const row = r && r[0];
    if (!row) return;
    let changed = false;
    if (typeof row.collect === 'boolean' && row.collect !== control.collect) { control.collect = row.collect; changed = true; log(row.collect ? 'Coleta ligada (pela conta).' : 'Coleta pausada (pela conta).'); }
    if (!control.pendingLink && row.linked_profile !== undefined && row.linked_profile !== control.linkedProfile) { control.linkedProfile = row.linked_profile; changed = true; if (row.linked_profile) log(`Perfil ligado à carreira: "${row.linked_profile}".`); }
    if (row.sim !== undefined && JSON.stringify(row.sim || null) !== JSON.stringify(control.sim || null)) { control.sim = row.sim || null; changed = true; const sm = sim(); log(`Simulação: warp ${sm.warpOn ? sm.warp : 'não muda'}; tempo de carga ${sm.loadOn ? sm.loadMinutes + ' min' : 'desligado'}.`); }
    if (changed) { saveControl(); syncPauseFlag(); notify({ type: 'control', control: snapshotControl() }); }
  }
  async function sendAll() {
    if (!session) return;
    while (S.queue.length) {
      await rest('trip_drafts?on_conflict=user_id,event_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: Object.assign({ user_id: session.user.id }, S.queue[0].body) });
      S.queue.shift(); persist();
    }
    const body = statusBody(), key_ = JSON.stringify(Object.assign({}, body, { pc_seen_at: null }));
    if (key_ !== lastStatusSent || now() - lastBeat >= HEARTBEAT_MS) {
      try { await rest('game_status?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body }); }
      catch (e) { if (info.noSimCols || !/sim_last/.test(e.message)) throw e; info.noSimCols = true; delete body.sim_last; await rest('game_status?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body }); }
      lastStatusSent = key_; lastBeat = now(); control.pendingLink = false;
    }
  }

  async function cycle(o = {}) {
    if (busy) return; busy = true;
    try {
      readGameLog();
      // controle da conta antes de ler: uma pausa feita no app já vale para as entregas desta volta
      if (session) { try { await pullControl(); } catch (e) {} }
      processLines(readNew(), o.diag); persist();
      try { simTick(); } catch (e) { log('Comando do jogo não gravado: ' + e.message); }
      try { await sendAll(); if (info.sendError) log('Conexão com a conta de volta. Tudo enviado.'); info.sendError = null; }
      catch (e) {
        const msg = e.noSession ? 'login' : /schema cache|game_status|trip_drafts/.test(e.message) || e.status === 404 ? 'setup' : 'offline';
        if (msg !== info.sendError) log(msg === 'login' ? 'Sessão expirada: entre de novo na conta.' : msg === 'setup' ? 'O servidor não tem as tabelas da telemetria. Rode de novo o supabase/schema.sql.' : `Sem conexão com a conta (${e.message}). Os dados ficam guardados e são enviados depois.`);
        info.sendError = msg;
      }
      info.lastCycle = now();
    } finally { busy = false; }
  }

  const snapshotControl = () => ({ collect: control.collect, linkedProfile: control.linkedProfile, sim: sim() });
  // Situação para telas (bandeja, painel): o que está funcionando e o que falta
  function snapshot() {
    return {
      account: session ? session.user.email : null, sendError: info.sendError, pending: S.queue.length,
      dataFile: existsSync(FILE), game: { online: !!S.core.online, version: S.core.gameVersion || (gameLog && gameLog.gameVersion) || null, plugin: S.core.plugin || null, gameDay: typeof S.core.gameTime === 'number' ? Math.floor(S.core.gameTime / 1440) + 1 : null, gameTime: typeof S.core.gameTime === 'number' ? S.core.gameTime : null, job: S.status && S.status.job || null },
      gameLog: gameLog ? { pluginLoaded: gameLog.pluginLoaded, pluginActive: gameLog.pluginActive, pluginError: gameLog.pluginError, profile: currentProfile(gameLog) } : null,
      simInfo: { block: simBlock(), why: simBlock() ? SIM_WHY[simBlock()] : null, console: consoleState(gameLogPath), pending: simQueue.length + (existsSync(CMD) ? 1 : 0), last: info.lastSim },
      control: snapshotControl(), blocked: S.status && S.status.blocked || null, lastDelivery: S.lastDelivery, lastCycle: info.lastCycle
    };
  }

  async function login(email, password) { saveSession(sessionFrom(await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }))); lastStatusSent = null; return session.user.email; }
  async function logout() { const s = session; saveSession(null); if (s) { try { await http('/auth/v1/logout?scope=local', { method: 'POST', token: s.access_token }); } catch (e) {} } }
  // Mudanças feitas neste PC (bandeja, painel) vão para a conta na próxima volta
  async function setCollect(on) { control.collect = !!on; saveControl(); syncPauseFlag(); log(on ? 'Coleta ligada.' : 'Coleta pausada: o plugin não grava e nada é enviado.'); if (session) { try { await rest('game_status?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: session.user.id, collect: control.collect } }); } catch (e) {} } }
  async function linkProfile(name) { control.linkedProfile = name || null; saveControl(); control.pendingLink = true; log(name ? `Perfil ligado à carreira: "${name}".` : 'Nenhum perfil ligado: todos enviam.'); lastStatusSent = null; }
  function setGameLogPath(p) { gameLogPath = p; logMtime = 0; }

  return { cycle, snapshot, login, logout, setCollect, linkProfile, setGameLogPath, advanceTime, setTime, hasSession: () => !!session, files: { FILE, STATE, SESSION, CONTROL } };
}
