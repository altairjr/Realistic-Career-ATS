// Carreira Realista ATS — programa companheiro da telemetria.
// Deixe aberto enquanto joga: lê o que o plugin grava, envia cada entrega como rascunho de viagem
// e mantém atualizada a situação do jogo (dia atual e trabalho em andamento) na sua conta.
//
//   node telemetry/companion/companion.mjs              (ou: npm run telemetria)
//   opções: --diagnostico   mostra cada registro do plugin, como veio do jogo
//           --uma-vez       processa o que houver e sai
//           --arquivo <caminho do telemetria.jsonl>
//           --sair          apaga a sessão salva neste PC
//
// Arquivos (em %LOCALAPPDATA%\CarreiraRealistaATS, ou CARREIRA_TELEMETRIA_DIR):
//   telemetria.jsonl  gravado pelo plugin dentro do jogo
//   companheiro.json  onde parou a leitura e o que falta enviar
//   sessao.json       login deste PC (token de acesso; a senha nunca é gravada)
import { readFileSync, writeFileSync, existsSync, statSync, openSync, readSync, closeSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createState, apply } from './core.mjs';

const args = process.argv.slice(2), flag = f => args.includes(f), arg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DIAG = flag('--diagnostico'), ONCE = flag('--uma-vez');
const DIR = process.env.CARREIRA_TELEMETRIA_DIR || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'CarreiraRealistaATS') : join(homedir(), '.carreira-realista-ats'));
const FILE = arg('--arquivo') || join(DIR, 'telemetria.jsonl');
const STATE_FILE = join(DIR, 'companheiro.json'), SESSION_FILE = join(DIR, 'sessao.json');
mkdirSync(DIR, { recursive: true });

// Servidor: o mesmo do app (src/config.js); CARREIRA_SERVIDOR e CARREIRA_CHAVE trocam (testes)
const here = dirname(fileURLToPath(import.meta.url));
const cfgText = (() => { try { return readFileSync(join(here, '..', '..', 'src', 'config.js'), 'utf8'); } catch (e) { return ''; } })();
const URL_ = process.env.CARREIRA_SERVIDOR || (cfgText.match(/url:\s*'([^']*)'/) || [])[1];
const KEY = process.env.CARREIRA_CHAVE || (cfgText.match(/key:\s*'([^']*)'/) || [])[1];
const hora = () => new Date().toLocaleTimeString('pt-BR');
const say = t => console.log(`[${hora()}] ${t}`);

if (flag('--sair')) { rmSync(SESSION_FILE, { force: true }); console.log('Sessão apagada deste PC.'); process.exit(0); }
if (!URL_ || !KEY) { console.error('Servidor não configurado: preencha url e key em src/config.js.'); process.exit(1); }

/* --- estado salvo --- */
const load = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return d; } };
const saved = load(STATE_FILE, {});
const S = { offset: saved.offset || 0, size: saved.size || 0, core: Object.assign(createState(), saved.core || {}), queue: saved.queue || [], status: saved.status || null };
const persist = () => writeFileSync(STATE_FILE, JSON.stringify({ offset: S.offset, size: S.size, core: S.core, queue: S.queue, status: S.status }));

/* --- servidor --- */
let session = load(SESSION_FILE, null);
const saveSession = s => { session = s; writeFileSync(SESSION_FILE, JSON.stringify(s)); try { chmodSync(SESSION_FILE, 0o600); } catch (e) {} };
async function http(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(URL_ + path, { method, headers: Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers), body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
  if (!res.ok) { const e = new Error((d && (d.msg || d.message || d.error_description)) || `Erro ${res.status}`); e.status = res.status; e.code = d && (d.code || d.error_code); throw e; }
  return d;
}
const sessionFrom = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user.id, email: d.user.email } });
async function token() {
  if (!session) throw Object.assign(new Error('sem login'), { status: 401 });
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  saveSession(sessionFrom(await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })));
  return session.access_token;
}
async function rest(path, opt) {
  try { return await http('/rest/v1/' + path, Object.assign({}, opt, { token: await token() })); }
  catch (e) { if (e.status !== 401) throw e; session.expires_at = 0; return http('/rest/v1/' + path, Object.assign({}, opt, { token: await token() })); }
}

async function login() {
  if (!process.stdin.isTTY && !process.env.CARREIRA_EMAIL) { console.error('Sem login salvo. Rode o programa num terminal para entrar na conta.'); process.exit(1); }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  let mute = false; rl._writeToOutput = s => { if (!mute || s.includes('\n')) process.stdout.write(mute ? '\n' : s); };
  const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));
  const askHidden = q => new Promise(r => { process.stdout.write(q); mute = true; rl.question('', a => { mute = false; r(a); }); });
  console.log('Entre com a mesma conta do app (e-mail e senha). A senha não é gravada; só o acesso deste PC.');
  for (let i = 0; i < 3; i++) {
    const email = process.env.CARREIRA_EMAIL || await ask('E-mail: '), password = process.env.CARREIRA_SENHA || await askHidden('Senha: ');
    try { saveSession(sessionFrom(await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }))); rl.close(); say(`Conectado como ${session.user.email}.`); return; }
    catch (e) { console.log('Não entrou: ' + e.message); if (process.env.CARREIRA_EMAIL) break; }
  }
  rl.close(); process.exit(1);
}

/* --- leitura do arquivo do plugin --- */
let partial = '';
function readNew() {
  if (!existsSync(FILE)) return [];
  const size = statSync(FILE).size;
  if (size < S.offset) { say('Arquivo da telemetria recomeçou; lendo do início.'); S.offset = 0; partial = ''; }   // o plugin trocou de arquivo
  if (size === S.offset) return [];
  const fd = openSync(FILE, 'r'), buf = Buffer.alloc(size - S.offset);
  readSync(fd, buf, 0, buf.length, S.offset); closeSync(fd);
  S.offset = size; S.size = size;
  const lines = (partial + buf.toString('utf8')).split('\n'); partial = lines.pop();
  S.offset -= Buffer.byteLength(partial);   // linha incompleta: lê de novo na próxima volta
  partial = '';
  return lines.filter(l => l.trim());
}

function processLines(lines) {
  for (const line of lines) {
    let rec; try { rec = JSON.parse(line); } catch (e) { continue; }
    if (DIAG) console.log('  plugin → ' + line);
    for (const o of apply(S.core, rec)) {
      if (o.type === 'log') say(o.text);
      if (o.type === 'draft') S.queue.push({ kind: 'draft', body: o.draft });
      if (o.type === 'status') S.status = o.status;
    }
  }
}

let lastStatusSent = null, warned = false;
async function sendAll() {
  if (!session) return;
  while (S.queue.length) {
    const item = S.queue[0];
    await rest('trip_drafts?on_conflict=user_id,event_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: Object.assign({ user_id: session.user.id }, item.body) });
    S.queue.shift(); persist();
  }
  const st = S.status && JSON.stringify(S.status);
  if (st && st !== lastStatusSent) {
    await rest('game_status?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: Object.assign({ user_id: session.user.id, updated_at: new Date().toISOString() }, S.status) });
    lastStatusSent = st;
  }
  if (warned) { say('Conexão com a conta de volta. Tudo enviado.'); warned = false; }
}

let busy = false;
async function cycle() {
  if (busy) return; busy = true;
  try { await cycleInner(); } finally { busy = false; }
}
async function cycleInner() {
  processLines(readNew()); persist();
  try { await sendAll(); }
  catch (e) {
    if (/schema cache|game_status|trip_drafts/.test(e.message) || e.status === 404) { if (!warned) say('O servidor não tem as tabelas da telemetria. Rode de novo o supabase/schema.sql no Supabase.'); }
    else if (e.status === 400 || e.status === 401) { say('A sessão deste PC expirou. Entre de novo.'); session = null; rmSync(SESSION_FILE, { force: true }); if (!ONCE) await login(); }
    else if (!warned) say(`Sem conexão com a conta (${e.message}). Os dados ficam guardados e são enviados depois.`);
    warned = true;
  }
}

console.log('Carreira Realista ATS · telemetria');
console.log(`Lendo: ${FILE}`);
if (!session) await login(); else say(`Conectado como ${session.user.email}.`);
if (!existsSync(FILE)) say('Ainda não há dados do jogo. Abra o ATS com o plugin instalado (veja docs/telemetria.md).');
if (S.queue.length) say(`${S.queue.length} entrega(s) aguardando envio.`);
await cycle();
if (!ONCE) { say('Pronto. Deixe esta janela aberta enquanto joga (Ctrl+C para sair).'); setInterval(cycle, 2000); }
