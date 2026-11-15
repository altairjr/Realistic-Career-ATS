// Painel do app de PC (desktop/painel) no navegador, com a ponte do Electron simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const skip = !chromium && 'Playwright não instalado: rode "npm run e2e:instalar"';
const FILE = 'file://' + path.join(__dirname, '..', '..', 'desktop', 'painel', 'index.html');
const base = over => Object.assign({
  version: '0.20.0', level: 'ok', headline: 'Tudo funcionando', account: 'a@teste.com', sendError: null, pending: 0,
  game: { online: true, version: '1.62.2.2s', plugin: '0.2.0', gameDay: 19, job: { cargo: 'Madeira', origin: 'Reno', dest: 'Elko', plannedMiles: 290 } },
  gameLog: { pluginLoaded: true, pluginActive: true, pluginError: null, profile: 'Altair Junior' },
  control: { collect: true, linkedProfile: 'Altair Junior' }, blocked: null, lastDelivery: { at: new Date().toISOString(), title: 'Reno → Elko' },
  plugins: [{ game: 'ats', dir: 'E:\\SteamLibrary\\steamapps\\common\\American Truck Simulator', target: 'E:\\...\\plugins\\carreira-telemetria.dll', installed: true, upToDate: true, wrongCopies: [] }],
  settings: { game: 'ats', openWithGame: true, startWithWindows: false, hotkey: 'Control+Shift+Space' }, logs: [{ at: new Date().toISOString(), text: 'Entrega: Reno → Elko' }]
}, over);

const browsers = [];
test.after(async () => { for (const b of browsers) await b.close().catch(() => {}); });
async function open(state, calls) {
  const b = await chromium.launch(); browsers.push(b); const p = await b.newPage({ viewport: { width: 560, height: 900 } });
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.exposeFunction('__call', (name, args) => { calls.push([name, ...args]); });
  await p.addInitScript(s => {
    let st = s; const cbs = [];
    const call = (n, ...a) => { window.__call(n, a); return Promise.resolve({ ok: true }); };
    window.carreiraDesktop = { isDesktop: true, getState: () => Promise.resolve(st), onState: cb => cbs.push(cb), login: (e, pw) => call('login', e, pw), logout: () => call('logout'),
      setCollect: on => call('collect', on), linkProfile: n => call('link', n), install: g => call('install', g), remove: g => call('remove', g), settings: x => call('settings', x),
      openApp: () => call('openApp'), openFolder: () => call('openFolder'), toggleOverlay: () => call('overlay'), hideOverlay: () => call('hide') };
    window.confirm = () => true; window.alert = () => {};
  }, state);
  await p.goto(FILE); await p.waitForFunction(() => document.getElementById('headline').textContent !== 'Carregando…');
  return { b, p, errors };
}
const shot = (p, n) => process.env.E2E_FOTOS ? p.screenshot({ path: path.join(process.env.E2E_FOTOS, n + '.png'), fullPage: true }) : null;

test('painel: primeira vez, sem conta e sem plugin, com cópia em pasta errada', { skip }, async () => {
  const calls = [];
  const { b, p, errors } = await open(base({ level: 'off', headline: 'Entre na sua conta', account: null, game: { online: false }, gameLog: null,
    plugins: [{ game: 'ats', dir: 'E:\\Jogo', target: 'E:\\Jogo\\bin\\win_x64\\plugins\\carreira-telemetria.dll', installed: false, upToDate: false, wrongCopies: ['E:\\Jogo\\bin\\win_x64\\Plugin\\carreira-telemetria.dll'] }] }), calls);
  assert.equal(await p.isVisible('#loginForm'), true);
  const text = await p.locator('#checks').innerText();
  assert.match(text, /Plugin não instalado/); assert.match(text, /pasta que o jogo não lê/); assert.match(text, /ainda não foi aberto/);
  await shot(p, 'painel-primeira-vez');
  await p.fill('#inEmail', 'a@teste.com'); await p.fill('#inPass', 'x'); await p.click('#loginForm button[type=submit]');
  await p.click('[data-act="install"]');
  await p.waitForTimeout(100);
  assert.deepEqual(calls.map(c => c[0]), ['login', 'install']);
  assert.deepEqual(errors, []); await b.close();
});

test('painel: perfil não ligado avisa e oferece ligar; coleta e opções chamam o programa', { skip }, async () => {
  const calls = [];
  const { b, p, errors } = await open(base({ level: 'wait', headline: 'Perfil "Teste" não ligado à carreira', blocked: 'profile', gameLog: { pluginLoaded: true, pluginActive: true, profile: 'Teste' } }), calls);
  assert.match(await p.locator('#profileBox').innerText(), /nada dele vai para o app/);
  await shot(p, 'painel-perfil');
  await p.click('[data-act="link"]'); await p.click('#collect'); await p.click('#optWin'); await p.click('#btnOverlay');
  await p.waitForTimeout(100);
  assert.deepEqual(calls.map(c => c[0]), ['link', 'collect', 'settings', 'overlay']);
  assert.equal(calls[0][1], 'Teste'); assert.equal(calls[1][1], false);
  assert.deepEqual(errors, []); await b.close();
});

test('painel: tudo funcionando mostra jogo, trabalho e última entrega', { skip }, async () => {
  const { b, p, errors } = await open(base(), []);
  assert.equal(await p.locator('#headline').innerText(), 'Tudo funcionando');
  assert.match(await p.locator('#now').innerText(), /Dia 19 no jogo · Madeira: Reno → Elko, 290 mi/);
  assert.match(await p.locator('#subline').innerText(), /Última entrega: Reno → Elko/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await shot(p, 'painel-ok');
  assert.deepEqual(errors, []); await b.close();
});
