// Testes do app no navegador (Chromium, via Playwright): telas, planilha, dois aparelhos, offline,
// atualização de versão e viagens do jogo. Usam o app gerado em dist/ e um servidor de teste no lugar do Supabase.
//   npm run e2e:instalar   (uma vez: baixa o Playwright e o Chromium)
//   npm run test:e2e
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMock } = require('../mock-supabase.cjs');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'planilha-exemplo.xlsx');

let chromium = null;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core')); } catch (x) {} }
const skip = !chromium ? 'Playwright não instalado: rode "npm run e2e:instalar"' : !fs.existsSync(path.join(DIST, 'index.html')) ? 'rode "npm run build" antes' : false;

// Servidor do app com o endereço do GitHub Pages (/Realistic-Career-ATS/). A pasta servida pode ser trocada (nova versão) e o servidor pode cair.
function siteServer() {
  const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const s = { dir: DIST, down: false };
  s.server = http.createServer((q, r) => {
    if (s.down) return q.socket.destroy();
    let p = q.url.split('?')[0].replace(/^\/Realistic-Career-ATS/, ''); if (p === '/' || p === '') p = '/index.html';
    const f = path.join(s.dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(s.dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    r.end(fs.readFileSync(f));
  });
  s.start = () => new Promise(res => s.server.listen(0, '127.0.0.1', () => { s.url = `http://localhost:${s.server.address().port}/Realistic-Career-ATS/`; res(s.url); }));
  s.stop = () => new Promise(res => { s.server.closeAllConnections && s.server.closeAllConnections(); s.server.close(res); });
  return s;
}

// Endereço do Supabase gravado no app; sem ele, o teste informa um endereço falso na tela
const cfgText = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
const FIXED = (cfgText.match(/url:\s*'([^']*)'/) || [])[1] || '';
const ORIGIN = FIXED ? new URL(FIXED).origin : 'https://teste-e2e.supabase.co';

let browser, site, mock, mockUrl;
test.before(async () => {
  if (skip) return;
  browser = await chromium.launch();
  site = siteServer(); await site.start();
  mock = createMock(); mockUrl = await mock.listen();
});
test.after(async () => { if (browser) await browser.close(); if (site) await site.stop(); if (mock) await mock.close(); });

// Um "aparelho": contexto próprio do navegador, com o Supabase redirecionado para o servidor de teste
async function device(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'allow' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(ORIGIN + '/**', async r => {
    const q = r.request(), u = new URL(q.url());
    try {
      const res = await fetch(mockUrl + u.pathname + u.search, { method: q.method(), headers: q.headers(), body: q.postData() || undefined });
      await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { await r.abort('internetdisconnected'); }
  });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  return { ctx, page };
}
async function openApp(page, url = site.url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof store !== 'undefined');
  if (!FIXED && await page.locator('#cloudUrl').count()) {
    await page.fill('#cloudUrl', ORIGIN); await page.fill('#cloudKey', 'sb_publishable_teste_e2e_0123456789');
    await page.click('[data-act="cloud-save"]'); await page.waitForSelector('#accEmail');
  }
}
async function createCareer(page) {
  await page.click('[data-act="start-blank"]');
  await page.locator('#modalRoot .sheet button.primary').last().click();
  await page.waitForFunction(() => !!S);
}
async function openData(page) {
  await page.click('[data-tab="ajustes"]');
  if (!(await page.locator('[data-act="import-sheet"]').isVisible())) await page.locator('[data-modt]', { hasText: 'Dados e sincronização' }).click();
}
async function login(page, email, pass, create = false) {
  if (!(await page.locator('#accEmail').isVisible())) await openData(page);
  await page.fill('#accEmail', email); await page.fill('#accPass', pass);
  await page.click(create ? '[data-act="acc-up"]' : '[data-act="acc-in"]');
  await page.waitForFunction(() => store.status === 'on', null, { timeout: 15000 });
}
async function importFixture(page) {
  await openData(page);
  await page.click('[data-act="import-sheet"]');
  await page.setInputFiles('#sheetFile', FIXTURE);
  await page.waitForSelector('#sheetResult .banner');
  await page.click('[data-imp]');
  await page.waitForFunction(() => S && S.week.trips.length > 0);
}
// E2E_FOTOS=pasta salva fotos das telas principais para conferência visual
const shot = (page, name) => process.env.E2E_FOTOS ? page.screenshot({ path: path.join(process.env.E2E_FOTOS, name + '.png') }) : null;
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
let accounts = 0;
const newAccount = () => [`e2e${++accounts}@teste.com`, 'senha-forte-e2e'];

test('telas: todas as abas sem rolagem lateral e sem erros, no celular e no PC', { skip }, async () => {
  for (const vp of [{ width: 360, height: 760 }, { width: 1280, height: 900 }]) {
    const { ctx, page } = await device(vp);
    await openApp(page); await createCareer(page); await importFixture(page);
    for (const t of ['painel', 'diario', 'holerite', 'historico', 'carreira', 'ajustes']) {
      await page.click(`[data-tab="${t}"]`);
      assert.ok(await overflow(page) <= 0, `${t} em ${vp.width}px tem rolagem lateral`);
    }
    await page.click('[data-tab="diario"]'); await page.locator('[data-edit]').first().click();
    await page.waitForSelector('#modalRoot .sheet');
    assert.ok(await overflow(page) <= 0, `formulário de viagem em ${vp.width}px tem rolagem lateral`);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
});

test('planilha: importa o modelo, exporta no mesmo modelo e a exportada volta igual', { skip }, async () => {
  const { ctx, page } = await device();
  await openApp(page); await createCareer(page); await importFixture(page);
  const before = await page.evaluate(() => ({ bal: balance(S), day: S.gameDay, open: S.week.trips.length, weeks: H.length, name: S.profile.name }));
  assert.equal(before.name, 'Motorista Exemplo'); assert.equal(before.bal, 8239.15);
  await openData(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export-sheet"]')]);
  const bytes = [...fs.readFileSync(await dl.path())];
  const again = await page.evaluate(async b => {
    const book = await XL.read(new Uint8Array(b).buffer), r = parseCareerSheet(book); if (!r.ok) return r.errors;
    const x = buildFromSheet(r.data);
    return { sheets: Object.keys(book).length, bal: balance(x.state), day: x.state.gameDay, open: x.state.week.trips.length, weeks: x.history.length, name: x.state.profile.name };
  }, bytes);
  assert.deepEqual(again, { sheets: 9, bal: before.bal, day: before.day, open: before.open, weeks: before.weeks, name: before.name });
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('dois aparelhos: mudança chega no outro; offline o app abre e envia ao voltar', { skip }, async () => {
  const [email, pass] = newAccount();
  const pc = await device();
  await openApp(pc.page); await createCareer(pc.page); await login(pc.page, email, pass, true);
  const phone = await device({ width: 360, height: 760 });
  await openApp(phone.page);
  assert.equal(await phone.page.locator('#cloudUrl').count(), 0, 'o celular abre direto no login');
  await login(phone.page, email, pass);
  await pc.page.click('#dayPlus'); await pc.page.click('#dayPlus');
  await pc.page.waitForFunction(() => store.status === 'on');
  const day = await pc.page.locator('#dayNum').innerText();
  await phone.page.evaluate(() => cloudPoll());
  await phone.page.waitForFunction(d => document.getElementById('dayNum').textContent === d, day);
  // offline: abre pela cópia do app instalado, muda o dia e envia quando volta
  await phone.page.evaluate(() => navigator.serviceWorker.ready);
  await phone.ctx.setOffline(true); mock.flags.offline = true;
  await phone.page.reload(); await phone.page.waitForSelector('#dayNum');
  assert.equal(await phone.page.locator('#dayNum').innerText(), day);
  await phone.page.click('#dayPlus'); await phone.page.waitForTimeout(1200);
  await phone.ctx.setOffline(false); mock.flags.offline = false;
  await phone.page.evaluate(() => cloudPoll());
  await phone.page.waitForFunction(() => store.status === 'on', null, { timeout: 15000 });
  const row = [...mock.db.careers.values()].find(r => r.state.gameDay === Number(day) + 1);
  assert.ok(row, 'a mudança feita offline chegou ao servidor');
  assert.deepEqual([...pc.page.errors, ...phone.page.errors], []);
  await pc.ctx.close(); await phone.ctx.close();
});

test('atualização: versão nova publicada chega sozinha, até na aba que já estava aberta', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carreira-e2e-'));
  const A = path.join(tmp, 'A'), B = path.join(tmp, 'B');
  fs.cpSync(DIST, A, { recursive: true }); fs.cpSync(DIST, B, { recursive: true });
  const html = fs.readFileSync(path.join(B, 'index.html'), 'utf8').replace(/const APP_VERSION = '[^']+'/, "const APP_VERSION = '9.9.9-e2e'");
  fs.writeFileSync(path.join(B, 'index.html'), html);
  const sw = fs.readFileSync(path.join(B, 'sw.js'), 'utf8');
  assert.ok(!sw.includes('__BUILD__'), 'o sw.js precisa da marca de versão');
  fs.writeFileSync(path.join(B, 'sw.js'), sw.replace(/carreira-ats-[\w.-]+'/, "carreira-ats-9.9.9-e2e'"));
  site.dir = A;
  const { ctx, page } = await device();
  try {
    await page.goto(site.url); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
    const v1 = await page.evaluate(() => APP_VERSION);
    site.dir = B;
    const p2 = await ctx.newPage(); await p2.goto(site.url);
    await p2.waitForFunction(() => APP_VERSION === '9.9.9-e2e', null, { timeout: 10000 });
    await page.waitForFunction(() => APP_VERSION === '9.9.9-e2e', null, { timeout: 10000 }).catch(() => {});
    assert.notEqual(v1, '9.9.9-e2e');
    assert.equal(await page.evaluate(() => APP_VERSION), '9.9.9-e2e', 'a aba aberta recarregou com a versão nova');
    site.down = true;
    const p3 = await ctx.newPage(); await p3.goto(site.url).catch(() => {});
    await p3.waitForFunction(() => typeof APP_VERSION !== 'undefined', null, { timeout: 10000 });
    assert.equal(await p3.evaluate(() => APP_VERSION), '9.9.9-e2e', 'sem servidor, abre a versão nova guardada');
  } finally { site.down = false; site.dir = DIST; await ctx.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('viagens do jogo: o rascunho aparece no Painel, é lançado pelo formulário ou descartado', { skip }, async () => {
  const [email, pass] = newAccount();
  const { ctx, page } = await device({ width: 360, height: 760 });
  await openApp(page); await createCareer(page); await login(page, email, pass, true);
  const d1 = mock.addDraft(email, { origin: 'Reno', dest: 'Elko', miles: 290, freight: 3100, tolls: 12, cargo: 'Madeira' });
  const d2 = mock.addDraft(email, { origin: 'Elko', dest: 'Wells', miles: 50, freight: 600, vehicle: 'car' });
  await page.click('[data-tab="painel"]'); await page.evaluate(() => cloudPoll());
  await page.waitForSelector('[data-act="drafts"]');
  assert.match(await page.locator('.banner', { hasText: 'viagens do jogo' }).innerText(), /2 viagens do jogo/);
  await shot(page, 'rascunhos-aviso');
  await page.click('[data-act="drafts"]'); await shot(page, 'rascunhos-lista');
  await page.click(`[data-duse="${d1.id}"]`);
  assert.equal(await page.inputValue('#t_dest'), 'Elko');
  assert.equal(await page.inputValue('#t_miles'), '290');
  await shot(page, 'rascunhos-formulario');
  await page.click('[data-save]');
  await page.waitForFunction(id => S.week.trips.some(t => t.draftId === id), d1.id);
  await page.waitForFunction(() => store.status === 'on');
  assert.equal(mock.db.drafts.get(d1.id).status, 'accepted');
  await page.click('[data-act="drafts"]'); await page.click(`[data-ddel="${d2.id}"]`);
  await page.click('#modalRoot [data-ok]');
  await page.waitForFunction(() => !document.querySelector('[data-act="drafts"]'));
  assert.equal(mock.db.drafts.get(d2.id).status, 'discarded');
  assert.equal(await page.evaluate(() => S.week.trips.length), 1);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('situação do jogo: cartão no Painel, dia do app ligado ao jogo e rascunho no dia certo', { skip }, async () => {
  const [email, pass] = newAccount();
  const { ctx, page } = await device({ width: 360, height: 760 });
  await openApp(page); await createCareer(page); await login(page, email, pass, true);
  const uid = mock.db.users.get(email).id;
  const setStatus = (minutes, job) => mock.db.status.set(uid, { user_id: uid, game: 'ats', online: true, game_time: minutes, truck: 'Kenworth T680', updated_at: new Date().toISOString(), job });
  setStatus(10 * 1440 + 600, { cargo: 'Madeira', origin: 'Reno', dest: 'Elko', plannedMiles: 290, income: 3100, deadline: 11 * 1440 });
  await page.click('[data-tab="painel"]'); await page.evaluate(() => cloudPoll());
  await page.waitForSelector('text=Dia 11 no jogo');
  assert.match(await page.locator('section', { hasText: 'No jogo agora' }).first().innerText(), /Madeira[\s\S]*Reno → Elko/);
  await shot(page, 'jogo-cartao');
  // liga o dia: app no dia 1, jogo no dia 11
  await page.click('[data-act="tel-link"]'); await page.click('#modalRoot [data-ok]');
  await page.waitForFunction(() => S.settings.telemetry && S.settings.telemetry.offset === -10);
  // o jogo vira para o dia 13: o app vai para o dia 3 sozinho
  setStatus(12 * 1440 + 30, null); await page.evaluate(() => cloudPoll());
  await page.waitForFunction(() => S.gameDay === 3);
  assert.equal(await page.locator('#dayNum').innerText(), '3');
  // rascunho do dia 13 do jogo abre no dia 3 do app
  const d = mock.addDraft(email, { origin: 'Reno', dest: 'Elko', miles: 290, freight: 3100, gameDay: 13 });
  await page.evaluate(() => cloudPoll()); await page.click('[data-act="drafts"]'); await page.click(`[data-duse="${d.id}"]`);
  assert.equal(await page.inputValue('#t_day'), '3');
  await page.click('[data-save]'); await page.waitForFunction(() => S.week.trips.length === 1);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('telemetria no app: luzes, pausar coleta, ligar perfil e aviso no cartão do jogo', { skip }, async () => {
  const [email, pass] = newAccount();
  const { ctx, page } = await device({ width: 360, height: 760 });
  await openApp(page); await createCareer(page); await login(page, email, pass, true);
  const uid = mock.db.users.get(email).id, iso = new Date().toISOString();
  mock.db.status.set(uid, { user_id: uid, game: 'ats', online: true, game_time: 20 * 1440, updated_at: iso, pc_seen_at: iso, collect: true, linked_profile: 'Altair Junior', profile: 'Teste', blocked: 'profile', plugin: '0.2.0', game_version: '1.62.2.2s', last_delivery: { title: 'Reno → Elko', miles: 290, freight: 3100, at: iso } });
  await page.evaluate(() => cloudPoll());
  await page.click('[data-tab="painel"]');
  await page.waitForSelector('text=não está ligado à carreira');
  await page.click('[data-tab="ajustes"]'); await page.locator('[data-modt]', { hasText: 'Telemetria do jogo' }).click();
  const box = page.locator('.mod', { hasText: 'Telemetria do jogo' }).last();
  assert.match(await box.innerText(), /Programa do PC conectado[\s\S]*Jogo aberto[\s\S]*Perfil "Teste" não ligado[\s\S]*Última entrega: Reno → Elko/);
  await shot(page, 'telemetria-ajustes');
  await page.click('[data-act="tel-collect"]');
  await page.waitForFunction(() => cloud.game && cloud.game.collect === false);
  assert.equal(mock.db.status.get(uid).collect, false); assert.equal(mock.db.status.get(uid).game_time, 20 * 1440, 'só a coluna da coleta mudou');
  await page.click('[data-act="tel-profile"][data-name="Teste"]');
  await page.waitForFunction(() => cloud.game.linked_profile === 'Teste');
  assert.equal(mock.db.status.get(uid).linked_profile, 'Teste');
  // simulação no jogo: warp e tempo de carga vão para a conta (o PC aplica no jogo)
  await page.click('[data-act="sim-set"][data-key="warpOn"]');
  await page.waitForFunction(() => cloud.game.sim && cloud.game.sim.warpOn === true);
  assert.deepEqual(mock.db.status.get(uid).sim, { warpOn: true, warp: 0.9, loadOn: false, loadMinutes: 60 });
  await page.fill('#simLoad', '1.5'); await page.click('[data-act="sim-set"][data-key="loadOn"]');
  await page.waitForFunction(() => cloud.game.sim.loadOn === true);
  assert.equal(mock.db.status.get(uid).sim.loadMinutes, 90);
  await shot(page, 'telemetria-simulacao');
  assert.ok(await overflow(page) <= 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('overlay: modo compacto com botão de esconder quando aberto pelo app de PC', { skip }, async () => {
  const { ctx, page } = await device({ width: 440, height: 800 });
  await ctx.addInitScript(() => {
    window.__hidden = 0; window.__adv = []; window.__set = [];
    window.carreiraDesktop = { isDesktop: true, overlay: true, hideOverlay: () => { window.__hidden++; },
      gameClock: async () => ({ online: true, gameTime: 870, sim: { block: null, why: null, pending: 0, last: null } }),
      advanceTime: async m => { window.__adv.push(m); return { ok: true }; }, setTime: async (h, m) => { window.__set.push([h, m]); return { ok: false, error: 'Não dá agora: jogo fechado.' }; } };
  });
  await page.goto(site.url + '?overlay=1'); await page.waitForFunction(() => typeof store !== 'undefined');
  await createCareer(page);
  // relógio do jogo e avanço rápido do tempo
  await page.waitForFunction(() => (document.getElementById('ovClockNow') || {}).textContent === 'Dia 1 · 14:30');
  await page.click('[data-act="ov-adv"][data-min="240"]');
  assert.deepEqual(await page.evaluate(() => window.__adv), [240]);
  await page.fill('#ovH', '07:15'); await page.click('[data-act="ov-set"]');
  assert.deepEqual(await page.evaluate(() => window.__set), [[7, 15]]);
  await page.waitForSelector('text=jogo fechado');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('overlay')), true);
  await shot(page, 'overlay');
  await page.click('.ov-close');
  assert.equal(await page.evaluate(() => window.__hidden), 1);
  assert.ok(await overflow(page) <= 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
