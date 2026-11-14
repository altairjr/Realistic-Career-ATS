// Testes da sincronização com servidor próprio (login, envio, recebimento, offline, conflito).
// Usam um servidor de mentira (mock-supabase.cjs); cada "aparelho" é um contexto isolado com seu próprio armazenamento.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createMock } = require('./mock-supabase.cjs');

const KEY = 'sb_publishable_teste_0123456789abcdef';
function device(url) {
  const mem = new Map();
  const localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const soft = fn => (...a) => { const t = fn(...a); t.unref && t.unref(); return t; };
  const ctx = vm.createContext({ console, Math, Date, JSON, Promise, URLSearchParams, TextDecoder, TextEncoder, fetch, atob, localStorage,
    setTimeout: soft(setTimeout), clearTimeout, setInterval: soft(setInterval), clearInterval });
  const run = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  ['engine.js', 'app/00-core.js', 'app/10-storage.js', 'app/14-sync-cloud.js', 'app/20-state.js', 'app/22-ledger.js'].forEach(run);
  const js = code => vm.runInContext(code, ctx);
  js(`var toasts = []; function toast(m) { toasts.push(m); } function render() {} function renderHeader() {}`);
  if (url) js(`cloudSetCfg(${JSON.stringify(url)}, ${JSON.stringify(KEY)})`);
  return { js, mem, status: () => js('store.status'), state: () => JSON.parse(JSON.stringify(js('S'))), weeks: () => JSON.parse(JSON.stringify(js('H'))) };
}
const newCareer = (d, name, opening) => d.js(`S = newCareer({ name: ${JSON.stringify(name)}, company: 'ADM', clsKey: 'w2', opening: ${opening} }); S._rev = Date.now(); saveLocal();`);
const edit = (d, code) => d.js(`(async () => { commit(st => { ${code} }); await flush(); })()`);
const week = (id, start) => ({ id, start, trips: [], label: 'semana ' + id });
const tick = () => new Promise(r => setTimeout(r, 3));   // garante marcas de tempo diferentes entre mudanças

async function withServer(fn, opt) { const m = createMock(opt); const url = await m.listen(); try { await fn(m, url); } finally { await m.close(); } }

test('criar conta envia a carreira; outro aparelho entra e recebe tudo', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000);
  A.js(`H = [${JSON.stringify(week('w1', 1))}]`);
  assert.equal(await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`), true);
  assert.equal(A.status(), 'on');
  assert.equal(m.db.careers.size, 1); assert.equal(m.db.weeks.size, 1);

  const B = device(url);
  await B.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`);
  assert.equal(B.status(), 'on');
  assert.equal(B.state().profile.name, 'Altair');
  assert.equal(B.state().bank.opening, 3000);
  assert.deepEqual(B.weeks().map(w => w.id), ['w1']);
  A.js('cloudStop()'); B.js('cloudStop()');
}));

test('mudança num aparelho chega no outro na verificação seguinte, nos dois sentidos', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000);
  await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`);
  const B = device(url); await B.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`);
  await tick(); await edit(A, 'st.gameDay = 9;');
  await B.js('cloudPoll()'); assert.equal(B.state().gameDay, 9);
  await tick(); await edit(B, 'st.gameDay = 12;');
  await A.js('cloudPoll()'); assert.equal(A.state().gameDay, 12);
  // semana fechada no A aparece no B; excluída no B some do A
  await A.js(`(async () => { const w = ${JSON.stringify(week('w7', 8))}; H.push(w); saveLocal(); await saveWeekRemote(w); })()`);
  await B.js('cloudPoll()'); assert.deepEqual(B.weeks().map(w => w.id), ['w7']);
  await B.js(`(async () => { H = []; saveLocal(); await deleteWeekRemote('w7'); })()`);
  await A.js('cloudPoll()'); assert.deepEqual(A.weeks(), []);
  A.js('cloudStop()'); B.js('cloudStop()');
}));

test('sem internet: continua local, avisa, e envia tudo quando a conexão volta', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000);
  await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`);
  m.flags.offline = true;
  await tick(); await edit(A, 'st.gameDay = 20;');
  await A.js(`(async () => { const w = ${JSON.stringify(week('w3', 15))}; H.push(w); saveLocal(); await saveWeekRemote(w); })()`);
  assert.equal(A.status(), 'err');
  assert.equal(JSON.parse(A.mem.get('carreira-ats-v1')).state.gameDay, 20, 'a cópia local guarda a mudança');
  assert.equal(m.db.careers.get([...m.db.careers.keys()][0]).state.gameDay, 1, 'o servidor ainda tem o dado antigo');
  m.flags.offline = false;
  await A.js('cloudPoll()');
  assert.equal(A.status(), 'on');
  assert.equal([...m.db.careers.values()][0].state.gameDay, 20);
  assert.equal(m.db.weeks.size, 1);
  A.js('cloudStop()');
}));

test('app fechado sem internet: ao reabrir, a mudança pendente vai para a conta', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000);
  await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`);
  m.flags.offline = true; await tick(); await edit(A, 'st.gameDay = 33;'); A.js('cloudStop()');
  m.flags.offline = false;
  const A2 = device(url); for (const [k, v] of A.mem) A2.mem.set(k, v);   // mesmo navegador, app reaberto
  A2.js('loadLocal()'); await A2.js('cloudStart()');
  assert.equal(A2.status(), 'on');
  assert.equal([...m.db.careers.values()][0].state.gameDay, 33);
  A2.js('cloudStop()');
}));

test('token vencido é renovado sozinho; sessão revogada pede login de novo sem perder dados', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000);
  await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`);
  m.expireAccessTokens();
  await tick(); await edit(A, 'st.gameDay = 5;');
  assert.equal(A.status(), 'on');
  assert.equal([...m.db.careers.values()][0].state.gameDay, 5);
  m.revokeSessions();
  await tick(); await edit(A, 'st.gameDay = 6;');
  assert.equal(A.status(), 'login');
  assert.equal(A.js('cloud.session'), null);
  assert.equal(A.state().gameDay, 6);
  assert.ok(A.js('toasts').some(t => /sessão expirou/i.test(t)));
  // entra de novo: a mudança feita sem sessão sobe
  await A.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`);
  assert.equal(A.status(), 'on');
  assert.equal([...m.db.careers.values()][0].state.gameDay, 6);
  A.js('cloudStop()');
}));

test('carreira local diferente da conta: a pessoa escolhe qual fica', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Conta', 3000);
  await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`); A.js('cloudStop()');
  const mk = async pick => { await tick(); const d = device(url); newCareer(d, 'Aparelho', 500); d.js(`var asked = 0; cloud.choose = async () => { asked++; return '${pick}'; }`); await d.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`); return d; };

  const C = await mk('cancel');
  assert.equal(C.js('asked'), 1); assert.equal(C.js('cloud.session'), null);
  assert.equal(C.state().profile.name, 'Aparelho'); assert.equal([...m.db.careers.values()][0].state.profile.name, 'Conta');

  const R = await mk('remote');
  assert.equal(R.state().profile.name, 'Conta'); assert.equal(R.status(), 'on'); R.js('cloudStop()');

  const L = await mk('local');
  assert.equal([...m.db.careers.values()][0].state.profile.name, 'Aparelho'); assert.equal(L.status(), 'on');
  // depois de ligado à conta, não pergunta de novo
  L.js('cloudStop()'); await L.js('cloudStart()'); assert.equal(L.js('asked'), 1); L.js('cloudStop()');
}));

test('cada conta só vê a própria carreira; apagar tudo limpa só a conta de quem apagou', () => withServer(async (m, url) => {
  const A = device(url); newCareer(A, 'Altair', 3000); await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`);
  const B = device(url); newCareer(B, 'Bruno', 100); await B.js(`cloudSignUp('b@teste.com', 'senha-forte-2')`);
  assert.equal(m.db.careers.size, 2);
  const C = device(url); await C.js(`cloudSignIn('b@teste.com', 'senha-forte-2')`);
  assert.equal(C.state().profile.name, 'Bruno');
  await B.js(`wipeRemote([])`);
  assert.equal(m.db.careers.size, 1);
  assert.equal([...m.db.careers.values()][0].state.profile.name, 'Altair');
  [A, B, C].forEach(d => d.js('cloudStop()'));
}));

test('mensagens de erro: senha errada, e-mail a confirmar, servidor sem tabelas, chave secreta', async () => {
  await withServer(async (m, url) => {
    const A = device(url); newCareer(A, 'Altair', 3000);
    assert.equal(await A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`), false, 'com confirmação de e-mail, a conta nasce sem sessão');
    await assert.rejects(A.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`), /Confirme seu e-mail/);
    m.confirm('a@teste.com');
    await assert.rejects(A.js(`cloudSignIn('a@teste.com', 'errada')`), /E-mail ou senha incorretos/);
    await assert.rejects(A.js(`cloudSignUp('a@teste.com', 'senha-forte-1')`), /Já existe uma conta/);
    m.flags.noTables = true;
    await A.js(`cloudSignIn('a@teste.com', 'senha-forte-1')`);
    assert.equal(A.status(), 'setup');
    m.flags.noTables = false;
    await A.js('cloudPoll()');
    assert.equal(A.status(), 'on'); assert.equal(m.db.careers.size, 1);
    A.js('cloudStop()');
  }, { confirmEmail: true });
  const D = device();
  assert.equal(D.js('cloudCfg()'), null);
  assert.throws(() => D.js(`cloudSetCfg('https://x.supabase.co', 'sb_secret_abcdefghijklmnopqrstuv')`), /chave secreta/);
  assert.throws(() => D.js(`cloudSetCfg('x.supabase.co/rest', '${KEY}')`), /endereço/);
  D.js(`cloudSetCfg('https://x.supabase.co/', '${KEY}')`);
  assert.equal(D.js('cloudCfg().url'), 'https://x.supabase.co');
  await D.js('cloudStart()'); assert.equal(D.status(), 'out');
});
