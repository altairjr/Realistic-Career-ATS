// Carreira Realista — programa do PC em janela de terminal (o app de PC, em desktop/, faz o mesmo com ícone na bandeja).
// Lê o que o plugin grava no jogo e envia para a sua conta: entregas (rascunhos), dia e trabalho em andamento.
//
//   npm run telemetria                      deixe aberto enquanto joga
//   npm run telemetria -- --diagnostico     mostra cada registro do plugin como veio do jogo
//   npm run telemetria -- --pausar | --retomar   pausa ou retoma a coleta
//   npm run telemetria -- --sair            apaga o login salvo neste PC
//   outras: --uma-vez (processa e sai), --arquivo <telemetria.jsonl>, --jogo ets2
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createRunner } from './runner.mjs';
import { gameLogPath } from './install.mjs';

const args = process.argv.slice(2), flag = f => args.includes(f), arg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DIR = process.env.CARREIRA_TELEMETRIA_DIR || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'CarreiraRealistaATS') : join(homedir(), '.carreira-realista-ats'));
const here = dirname(fileURLToPath(import.meta.url));
const cfgText = (() => { try { return readFileSync(join(here, '..', '..', 'src', 'config.js'), 'utf8'); } catch (e) { return ''; } })();
const URL_ = process.env.CARREIRA_SERVIDOR || (cfgText.match(/url:\s*'([^']*)'/) || [])[1];
const KEY = process.env.CARREIRA_CHAVE || (cfgText.match(/key:\s*'([^']*)'/) || [])[1];
const say = t => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${t}`);

if (flag('--sair')) { rmSync(join(DIR, 'sessao.json'), { force: true }); console.log('Login apagado deste PC.'); process.exit(0); }
if (!URL_ || !KEY) { console.error('Servidor não configurado: preencha url e key em src/config.js.'); process.exit(1); }

const runner = createRunner({
  dir: DIR, url: URL_, key: KEY, file: arg('--arquivo') || undefined,
  gameLogPath: process.env.CARREIRA_GAMELOG || (process.platform === 'win32' ? gameLogPath(arg('--jogo') === 'ets2' ? 'ets2' : 'ats') : null),
  log: say
});

async function login() {
  if (!process.stdin.isTTY && !process.env.CARREIRA_EMAIL) { console.error('Sem login salvo. Rode num terminal para entrar na conta.'); process.exit(1); }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  let mute = false; rl._writeToOutput = s => { if (!mute || s.includes('\n')) process.stdout.write(mute ? '\n' : s); };
  const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));
  const askHidden = q => new Promise(r => { process.stdout.write(q); mute = true; rl.question('', a => { mute = false; r(a); }); });
  console.log('Entre com a mesma conta do app. A senha não é gravada; só o acesso deste PC.');
  for (let i = 0; i < 3; i++) {
    const email = process.env.CARREIRA_EMAIL || await ask('E-mail: '), password = process.env.CARREIRA_SENHA || await askHidden('Senha: ');
    try { say(`Conectado como ${await runner.login(email, password)}.`); rl.close(); return; }
    catch (e) { console.log('Não entrou: ' + e.message); if (process.env.CARREIRA_EMAIL) break; }
  }
  rl.close(); process.exit(1);
}

console.log('Carreira Realista · telemetria');
console.log(`Pasta: ${DIR}`);
if (!runner.hasSession()) await login(); else say(`Conectado como ${runner.snapshot().account}.`);
if (flag('--pausar') || flag('--retomar')) { await runner.setCollect(flag('--retomar')); await runner.cycle(); process.exit(0); }
const diag = flag('--diagnostico') ? l => console.log('  plugin → ' + l) : null;
const s0 = runner.snapshot();
if (!s0.control.collect) say('Coleta PAUSADA. Para voltar: npm run telemetria -- --retomar');
if (s0.control.linkedProfile) say(`Perfil ligado à carreira: "${s0.control.linkedProfile}".`);
if (!s0.dataFile) say('Ainda não há dados do jogo. Abra o ATS com o plugin instalado (veja docs/telemetria.md).');
await runner.cycle({ diag });
if (flag('--uma-vez')) process.exit(0);
say('Pronto. Deixe esta janela aberta enquanto joga (Ctrl+C para sair).');
setInterval(() => runner.cycle({ diag }), 2000);
