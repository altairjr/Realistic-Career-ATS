// Envia uma entrega de teste para a caixa "Viagens do jogo", como o leitor de telemetria vai fazer.
//   node tools/enviar-rascunho.mjs
// Pergunta e-mail, senha e os dados da entrega; entra na sua conta e cria o rascunho.
// Usa o servidor de src/config.js. A senha não é gravada em lugar nenhum.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const cfgText = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
// CARREIRA_SERVIDOR e CARREIRA_CHAVE trocam o servidor (usado nos testes)
const URL_ = process.env.CARREIRA_SERVIDOR || (cfgText.match(/url:\s*'([^']*)'/) || [])[1], KEY = process.env.CARREIRA_CHAVE || (cfgText.match(/key:\s*'([^']*)'/) || [])[1];
if (!URL_ || !KEY) { console.error('Preencha url e key em src/config.js.'); process.exit(1); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
let mute = false; rl._writeToOutput = s => { if (!mute || s.includes('\n')) process.stdout.write(mute ? '\n' : s); };
const ask = (q, def = '') => new Promise(r => rl.question(def ? `${q} [${def}]: ` : `${q}: `, a => r(a.trim() || def)));
const askHidden = q => new Promise(r => { process.stdout.write(q + ': '); mute = true; rl.question('', a => { mute = false; r(a); }); });
const num = async (q, def) => { const v = Number(String(await ask(q, def)).replace(',', '.')); return isFinite(v) ? v : 0; };

const call = async (path, opt = {}) => {
  const res = await fetch(URL_ + path, { method: opt.method || 'GET', headers: Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, opt.token ? { Authorization: 'Bearer ' + opt.token } : {}, opt.headers || {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) throw new Error((data && (data.msg || data.message || data.error_description)) || `Erro ${res.status}`);
  return data;
};

try {
  console.log(`Servidor: ${URL_}\n`);
  const email = await ask('E-mail da conta'), password = await askHidden('Senha');
  const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  console.log(`Conectado como ${s.user.email}.\n\nDados da entrega (Enter aceita o valor entre colchetes):`);
  const data = {
    vehicle: (await ask('Veículo (truck ou car)', 'truck')) === 'car' ? 'car' : 'truck',
    origin: await ask('Origem', 'Reno'), dest: await ask('Destino', 'Elko'),
    cargo: await ask('Carga', 'Madeira'),
    miles: await num('Distância (mi)', '290'), freight: await num('Frete do jogo (USD)', '3100'),
    fuel: await num('Combustível (USD)', '0'), tolls: await num('Pedágios (USD)', '0'),
    fines: await num('Multas (USD)', '0'), damage: await num('Danos (USD)', '0'),
    drive: await num('Horas de direção', '0'), hours: await num('Horas de serviço', '0')
  };
  await call('/rest/v1/trip_drafts?on_conflict=user_id,event_id', { method: 'POST', token: s.access_token, headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: { user_id: s.user.id, event_id: 'manual-' + randomUUID(), source: 'teste-manual', game: 'ats', data } });
  console.log('\nRascunho enviado. Abra o app: o aviso "viagem do jogo para revisar" aparece no Painel em até 15 segundos.');
  await call('/auth/v1/logout?scope=local', { method: 'POST', token: s.access_token }).catch(() => {});
} catch (e) {
  console.error('\nNão foi possível enviar: ' + e.message + (/schema cache|trip_drafts/.test(e.message) ? '\nRode de novo o supabase/schema.sql no SQL Editor do Supabase.' : ''));
  process.exitCode = 1;
} finally { rl.close(); }
