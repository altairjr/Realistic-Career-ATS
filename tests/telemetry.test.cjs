// Testes da telemetria: interpretação dos registros do plugin (core.mjs) e o caminho completo
// jogo simulado → plugin (compilado com g++ e cabeçalhos de simulação) → programa companheiro → servidor de teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
// roda o companheiro sem travar este processo (o servidor de teste vive aqui)
const runAsync = (cmd, args, opt) => new Promise(res => { const p = spawn(cmd, args, opt); let stdout = '', stderr = ''; p.stdout.on('data', d => stdout += d); p.stderr.on('data', d => stderr += d); p.on('close', status => res({ status, stdout, stderr })); });
const { createMock } = require('./mock-supabase.cjs');

const ROOT = path.join(__dirname, '..');
const core = () => import(path.join(ROOT, 'telemetry', 'companion', 'core.mjs'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'carreira-tel-'));

test('core: entrega vira rascunho com rota, milhas, frete, pedágio, multa e horas dirigidas', async () => {
  const { createState, apply } = await core();
  const st = createState(), outs = [];
  const feed = r => outs.push(...apply(st, r));
  feed({ t: 'start', game: 'ats', plugin: '0.1.0', gameplayEvents: true });
  feed({ t: 'time', gameTime: 2870 });
  feed({ t: 'truck', attrs: { brand: 'Kenworth', name: 'T680' } });
  feed({ t: 'job', attrs: { cargo: 'Madeira', 'source.city': 'Reno', 'destination.city': 'Elko', income: 3100, 'planned_distance.km': 470 }, jobOdometerStart: 15000, gameTime: 2870 });
  feed({ t: 'event', id: 'player.tollgate.paid', attrs: { 'pay.amount': 12 } });
  feed({ t: 'event', id: 'player.use.ferry', attrs: { 'pay.amount': 40 } });
  feed({ t: 'event', id: 'player.fined', attrs: { 'fine.offence': 'speeding', 'fine.amount': 150 } });
  feed({ t: 'event', id: 'job.delivered', attrs: { revenue: 3100, 'distance.km': 467.3, 'delivery.time': 390, 'cargo.damage': 0.02, 'earned.xp': 520 }, driveMinutes: 312, gameTime: 3260, odometer: 15467.3 });
  const drafts = outs.filter(o => o.type === 'draft');
  assert.equal(drafts.length, 1);
  const d = drafts[0].draft;
  assert.equal(d.event_id, 'ats-3260-3100-elko');
  assert.deepEqual([d.data.origin, d.data.dest, d.data.cargo], ['Reno', 'Elko', 'Madeira']);
  assert.equal(d.data.miles, 290.4); assert.equal(d.data.freight, 3100);
  assert.equal(d.data.tolls, 52); assert.equal(d.data.fines, 150);
  assert.equal(d.data.drive, 5.2); assert.equal(d.data.cargoDamagePct, 2); assert.equal(d.data.gameDay, 3);
  assert.equal(d.data.truck, 'Kenworth T680');
  // depois da entrega, os acumulados zeram e a situação fica sem trabalho
  const last = outs.filter(o => o.type === 'status').at(-1).status;
  assert.equal(last.job, null); assert.equal(last.game_time, 3260); assert.equal(last.online, true);
  assert.deepEqual(st.acc, { fines: 0, tolls: 0, fuel: 0, fuelLiters: 0, events: [] });
});

test('core: trabalho cancelado não vira rascunho; sem distância do evento, usa o odômetro', async () => {
  const { createState, apply } = await core();
  const st = createState();
  apply(st, { t: 'job', attrs: { 'source.city': 'A', 'destination.city': 'B', income: 900 }, jobOdometerStart: 100 });
  assert.equal(apply(st, { t: 'event', id: 'job.cancelled', attrs: { 'cancel.penalty': 300 } }).filter(o => o.type === 'draft').length, 0);
  apply(st, { t: 'job', attrs: { 'source.city': 'A', 'destination.city': 'C', income: 800 }, jobOdometerStart: 200 });
  const d = apply(st, { t: 'event', id: 'job.delivered', attrs: { revenue: 800 }, odometer: 300, gameTime: 5000 }).find(o => o.type === 'draft').draft;
  assert.equal(d.data.miles, 62.1, '100 km pelo odômetro');
  assert.equal(d.data.dest, 'C');
});

// Caminho completo: precisa de um compilador C++ (g++), presente no GitHub Actions e na maioria dos Linux/macOS
const gpp = spawnSync('g++', ['--version']).status === 0;
test('ponta a ponta: sessão de jogo simulada chega à conta como rascunho e situação do jogo', { skip: !gpp && 'g++ não instalado' }, async () => {
  const dir = tmp(), exe = path.join(dir, process.platform === 'win32' ? 'jogo.exe' : 'jogo');
  execFileSync('g++', ['-std=c++17', '-I', path.join(__dirname, 'telemetry', 'sdk-shim'), '-o', exe, path.join(__dirname, 'telemetry', 'harness.cpp'), path.join(ROOT, 'telemetry', 'plugin', 'carreira_telemetria.cpp')]);
  execFileSync(exe, [path.join(__dirname, 'telemetry', 'sessao-exemplo.txt')], { env: { ...process.env, CARREIRA_TELEMETRIA_DIR: dir }, stdio: 'pipe' });
  const lines = fs.readFileSync(path.join(dir, 'telemetria.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => l.t), ['start', 'time', 'truck', 'job', 'event', 'time', 'event', 'event', 'job', 'stop']);
  assert.equal(lines.find(l => l.id === 'job.delivered').driveMinutes, 21, 'só conta minutos com o caminhão andando');

  const m = createMock(); const url = await m.listen();
  try {
    await fetch(url + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@teste.com', password: 'senha-forte-1' }) });
    const run = () => runAsync(process.execPath, [path.join(ROOT, 'telemetry', 'companion', 'companion.mjs'), '--uma-vez'], {
      env: { ...process.env, CARREIRA_TELEMETRIA_DIR: dir, CARREIRA_SERVIDOR: url, CARREIRA_CHAVE: 'sb_publishable_teste', CARREIRA_EMAIL: 'a@teste.com', CARREIRA_SENHA: 'senha-forte-1' } });
    const r1 = await run();
    assert.equal(r1.status, 0, r1.stderr + r1.stdout);
    assert.match(r1.stdout, /Entrega: Reno → Elko, 290\.4 mi/);
    const drafts = [...m.db.drafts.values()];
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].source, 'telemetria'); assert.equal(drafts[0].data.freight, 3100); assert.equal(drafts[0].data.tolls, 12); assert.equal(drafts[0].data.fines, 150);
    const status = [...m.db.status.values()][0];
    assert.equal(status.online, false, 'jogo fechado no fim da sessão'); assert.equal(status.game_time, 3260); assert.equal(status.job, null);
    assert.ok(fs.existsSync(path.join(dir, 'sessao.json')), 'login salvo para a próxima vez');
    assert.ok(!fs.readFileSync(path.join(dir, 'sessao.json'), 'utf8').includes('senha-forte-1'), 'a senha não é gravada');
    // rodar de novo não reenvia nada; novas linhas (inclusive incompletas) são lidas na próxima volta
    assert.equal((await run()).status, 0); assert.equal(m.db.drafts.size, 1);
    fs.appendFileSync(path.join(dir, 'telemetria.jsonl'), '{"t":"job","attrs":{"cargo":"Leite","source.city":"Elko","destination.city":"Wells","income":600}}\n{"t":"event","id":"job.del');
    assert.equal((await run()).status, 0); assert.equal(m.db.drafts.size, 1);
    assert.equal([...m.db.status.values()][0].job.dest, 'Wells', 'trabalho em andamento aparece na conta');
    fs.appendFileSync(path.join(dir, 'telemetria.jsonl'), 'ivered","attrs":{"revenue":600,"distance.km":80},"gameTime":4000}\n');
    assert.equal((await run()).status, 0); assert.equal(m.db.drafts.size, 2, 'a linha completada virou a segunda entrega');
    // sem internet: a entrega fica guardada e vai na próxima vez
    fs.appendFileSync(path.join(dir, 'telemetria.jsonl'), '{"t":"job","attrs":{"source.city":"Wells","destination.city":"Ely","income":700}}\n{"t":"event","id":"job.delivered","attrs":{"revenue":700,"distance.km":200},"gameTime":5000}\n');
    m.flags.offline = true; const off = await run(); m.flags.offline = false;
    assert.match(off.stdout, /Sem conexão/); assert.equal(m.db.drafts.size, 2);
    assert.equal((await run()).status, 0); assert.equal(m.db.drafts.size, 3);
  } finally { await m.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
