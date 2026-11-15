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

test('sessão real (ATS 1.62.2.2): nomes do SDK reconhecidos e rascunho correto', async () => {
  const { createState, apply } = await core();
  const st = createState(), outs = [];
  for (const l of fs.readFileSync(path.join(__dirname, 'fixtures', 'telemetria-ats-1.62.jsonl'), 'utf8').trim().split('\n')) outs.push(...apply(st, JSON.parse(l)));
  const d = outs.find(o => o.type === 'draft').draft;
  assert.equal(d.event_id, 'ats-26317-351-carson-city');
  assert.deepEqual([d.data.origin, d.data.dest, d.data.cargo, d.data.originCompany, d.data.destCompany], ['Carson City', 'Carson City', 'Equipamento para gado', 'ADM', 'XPO Logistics']);
  assert.equal(d.data.freight, 351); assert.equal(d.data.miles, 1.9); assert.equal(d.data.xp, 18); assert.equal(d.data.jobMinutes, 10);
  assert.equal(d.data.gameDay, 19); assert.equal(d.data.truck, 'Kenworth W900');
  assert.equal(st.gameVersion, '1.62.2.2s', 'versão do jogo vem do nome, não da versão da telemetria');
  const jobStatus = outs.filter(o => o.type === 'status').map(o => o.status.job).find(Boolean);
  assert.equal(jobStatus.plannedMiles, 1.2); assert.equal(jobStatus.deadline, 26496); assert.equal(jobStatus.special, false); assert.equal(jobStatus.market, 'quick_job');
});

// Caminho completo: precisa de um compilador C++ (g++), presente no GitHub Actions e na maioria dos Linux/macOS
// no Windows o plugin usa a API do Windows (abrir o programa), que o g++ do MinGW não liga sem ajustes: lá a DLL é testada pelo workflow
const gpp = process.platform !== 'win32' && spawnSync('g++', ['--version']).status === 0;
test('ponta a ponta: sessão de jogo simulada chega à conta como rascunho e situação do jogo', { skip: !gpp && 'g++ não instalado' }, async () => {
  const dir = tmp(), exe = path.join(dir, process.platform === 'win32' ? 'jogo.exe' : 'jogo');
  execFileSync('g++', ['-std=c++17', '-I', path.join(__dirname, 'telemetry', 'sdk-shim'), '-o', exe, path.join(__dirname, 'telemetry', 'harness.cpp'), path.join(ROOT, 'telemetry', 'plugin', 'carreira_telemetria.cpp')]);
  execFileSync(exe, [path.join(__dirname, 'telemetry', 'sessao-exemplo.txt')], { env: { ...process.env, CARREIRA_TELEMETRIA_DIR: dir }, stdio: 'pipe' });
  const lines = fs.readFileSync(path.join(dir, 'telemetria.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => l.t), ['start', 'time', 'truck', 'job', 'event', 'time', 'event', 'event', 'job', 'stop']);
  assert.equal(lines.find(l => l.t === 'job').jobOdometerStart, null, 'no início do trabalho o odômetro ainda não chegou');
  assert.equal(lines.find(l => l.id === 'job.delivered').driveMinutes, 21, 'só conta minutos com o caminhão andando');
  assert.equal(lines.find(l => l.id === 'job.delivered').jobOdometerStart, 15000, 'odômetro que chega depois do trabalho vira o início do trabalho');
  assert.equal(lines[0].telemetryGameVersion, '1.5');

  // com a coleta pausada (arquivo pausado.flag), o plugin não grava nada
  const pdir = tmp(); fs.writeFileSync(path.join(pdir, 'pausado.flag'), '');
  execFileSync(exe, [path.join(__dirname, 'telemetry', 'sessao-exemplo.txt')], { env: { ...process.env, CARREIRA_TELEMETRIA_DIR: pdir }, stdio: 'pipe' });
  assert.ok(!fs.existsSync(path.join(pdir, 'telemetria.jsonl')), 'pausado: nenhum arquivo gravado');
  fs.rmSync(pdir, { recursive: true, force: true });

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

/* ---------- Perfis, pausa e instalador (v0.20) ---------- */
const at = (h, m, s) => new Date(2026, 10, 14, h, m, s).toISOString();   // horário local deste computador, como o jogo grava
const fakeLog = profiles => ['************ : log created on : Saturday November 14 2026 @ 20:00:00', '00:00:00.000 : [sys] running',
  "00:00:05.000 : loading 'carreira-telemetria' 'E:/x/plugins/carreira-telemetria.dll'", '00:00:05.100 : [carreira-telemetria] ativo, gravando em C:/x',
  ...profiles.map(([mm, ss, name]) => `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000 : New profile selected: '${name}'`)].join('\n');
const delivery = (real, dest, revenue, gameTime) => [
  { t: 'job', attrs: { 'source.city': 'Reno', 'destination.city': dest, income: revenue }, real },
  { t: 'event', id: 'job.delivered', attrs: { revenue, 'distance.km': 100 }, gameTime, real }];

test('game.log: perfil carregado, versão e plugin; perfil de cada registro pelo horário', async () => {
  const { parseGameLog, profileAt, currentProfile } = await import(path.join(ROOT, 'telemetry', 'companion', 'gamelog.mjs'));
  const g = parseGameLog(fakeLog([[0, 10, 'Carreira'], [5, 0, 'Teste']]) + '\n00:05:01.000 : [TRUCKY] Game: American Truck Simulator 1.62.2.2s');
  assert.equal(g.pluginLoaded, true); assert.equal(g.pluginActive, true); assert.equal(g.gameVersion, '1.62.2.2s');
  assert.equal(currentProfile(g), 'Teste');
  assert.equal(profileAt(g, at(20, 3, 0)), 'Carreira'); assert.equal(profileAt(g, at(20, 6, 0)), 'Teste');
  assert.equal(profileAt(g, at(19, 0, 0)), null, 'registro de antes desta sessão do jogo: perfil desconhecido');
});

test('runner: só o perfil ligado envia; outro perfil e coleta pausada não mandam nada; controle vem da conta', async () => {
  const { createRunner } = await import(path.join(ROOT, 'telemetry', 'companion', 'runner.mjs'));
  const dir = tmp(), m = createMock(), url = await m.listen();
  try {
    await fetch(url + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@teste.com', password: 'senha-forte-1' }) });
    const logFile = path.join(dir, 'game.log.txt'), data = path.join(dir, 'telemetria.jsonl'), logs = [], notes = [];
    const write = recs => fs.appendFileSync(data, recs.map(r => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(logFile, fakeLog([[0, 10, 'Carreira']]));
    const r = createRunner({ dir, url, key: 'sb_publishable_teste', gameLogPath: logFile, log: t => logs.push(t), notify: n => notes.push(n) });
    await r.login('a@teste.com', 'senha-forte-1');
    // 1ª entrega no perfil "Carreira": liga o perfil e envia
    write([{ t: 'start', game: 'ats', plugin: '0.2.0', real: at(20, 0, 6) }, ...delivery(at(20, 1, 0), 'Elko', 1000, 1500)]);
    await r.cycle();
    assert.equal(m.db.drafts.size, 1);
    const uid = m.db.users.get('a@teste.com').id;
    assert.equal(m.db.status.get(uid).linked_profile, 'Carreira');
    assert.ok(notes.some(n => n.type === 'profile-linked'));
    // troca para o perfil "Teste": nada vai para a conta, nem dia nem trabalho
    fs.writeFileSync(logFile, fakeLog([[0, 10, 'Carreira'], [5, 0, 'Teste']]));
    write([{ t: 'time', gameTime: 99999, real: at(20, 5, 30) }, ...delivery(at(20, 6, 0), 'Wells', 2000, 99999)]);
    await r.cycle();
    assert.equal(m.db.drafts.size, 1, 'entrega do outro perfil não foi enviada');
    assert.ok(logs.some(t => /perfil "Teste" não ligado/.test(t)));
    const st = m.db.status.get(uid);
    assert.equal(st.blocked, 'profile'); assert.equal(st.profile, 'Teste'); assert.equal(st.game_time, 1500, 'o dia do outro perfil não chega ao app');
    // de volta ao perfil ligado: envia de novo
    fs.writeFileSync(logFile, fakeLog([[0, 10, 'Carreira'], [5, 0, 'Teste'], [8, 0, 'Carreira']]));
    write(delivery(at(20, 9, 0), 'Ely', 3000, 2000)); await r.cycle();
    assert.equal(m.db.drafts.size, 2); assert.equal(m.db.status.get(uid).blocked, null);
    // pausa pela conta (app): o programa obedece e cria o arquivo que desliga o plugin
    m.db.status.get(uid).collect = false;
    write(delivery(at(20, 10, 0), 'Austin', 500, 2100)); await r.cycle();
    assert.equal(r.snapshot().control.collect, false);
    assert.ok(fs.existsSync(path.join(dir, 'pausado.flag')));
    write(delivery(at(20, 11, 0), 'Dallas', 600, 2200)); await r.cycle();
    assert.equal(m.db.drafts.size, 2, 'pausado: nada enviado');
    // retoma pelo PC: a conta fica sabendo e o arquivo some
    await r.setCollect(true);
    assert.equal(m.db.status.get(uid).collect, true); assert.ok(!fs.existsSync(path.join(dir, 'pausado.flag')));
    const snap = r.snapshot();
    assert.equal(snap.account, 'a@teste.com'); assert.equal(snap.gameLog.pluginActive, true); assert.equal(snap.game.plugin, '0.2.0');
    assert.ok(m.db.status.get(uid).pc_seen_at, 'sinal de vida do PC');
  } finally { await m.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('instalador: acha o ATS pela biblioteca da Steam, instala na pasta plugins e aponta cópia em pasta errada', async () => {
  const ins = await import(path.join(ROOT, 'telemetry', 'companion', 'install.mjs'));
  const files = new Map([
    ['C:\\Steam\\steamapps', 1],
    ['C:\\Steam\\steamapps\\libraryfolders.vdf', '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Steam"\n\t\t"apps"\n\t\t{\n\t\t\t"228980"\t\t"1"\n\t\t}\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"E:\\\\SteamLibrary"\n\t\t"apps"\n\t\t{\n\t\t\t"270880"\t\t"5"\n\t\t\t"227300"\t\t"9"\n\t\t}\n\t}\n}\n'],
    ['E:\\SteamLibrary\\steamapps\\common\\American Truck Simulator\\bin\\win_x64\\amtrucks.exe', 1],
    ['E:\\SteamLibrary\\steamapps\\common\\Euro Truck Simulator 2\\bin\\win_x64\\eurotrucks2.exe', 1],
    ['E:\\SteamLibrary\\steamapps\\common\\American Truck Simulator\\bin\\win_x64\\Plugin\\carreira-telemetria.dll', Buffer.from('old')]
  ]);
  const sys = {
    regQuery: (k, v) => (v === 'SteamPath' ? 'C:/Steam' : null), exists: f => files.has(f), readFile: f => files.get(f), readBuffer: f => files.get(f),
    listDir: d => [...new Set([...files.keys()].filter(f => f.startsWith(d + '\\')).map(f => f.slice(d.length + 1).split('\\')[0]).filter(n => !n.includes('.')))],
    mkdir: () => {}, copy: (from, to) => files.set(to, Buffer.from('nova'))
  };
  assert.deepEqual(ins.parseLibraryFolders(files.get('C:\\Steam\\steamapps\\libraryfolders.vdf')).map(l => l.path), ['C:\\Steam', 'E:\\SteamLibrary']);
  const games = ins.findGames(sys);
  assert.deepEqual(games.map(g => g.game), ['ats', 'ets2']);
  assert.equal(games[0].dir, 'E:\\SteamLibrary\\steamapps\\common\\American Truck Simulator');
  let st = ins.pluginStatus(games[0].dir, Buffer.from('nova'), sys);
  assert.equal(st.installed, false); assert.equal(st.wrongCopies.length, 1); assert.match(st.wrongCopies[0], /\\Plugin\\carreira-telemetria\.dll$/);
  assert.equal(ins.installPlugin(games[0].dir, 'pacote.dll', sys).ok, true);
  st = ins.pluginStatus(games[0].dir, Buffer.from('nova'), sys);
  assert.equal(st.installed, true); assert.equal(st.upToDate, true);
  assert.equal(st.target, 'E:\\SteamLibrary\\steamapps\\common\\American Truck Simulator\\bin\\win_x64\\plugins\\carreira-telemetria.dll');
  const busy = ins.installPlugin(games[0].dir, 'x', Object.assign({}, sys, { copy: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } }));
  assert.match(busy.error, /Feche o jogo/);
});
