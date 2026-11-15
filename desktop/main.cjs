// Carreira Realista — app de PC (Windows).
//  - instala e confere o plugin de telemetria no ATS/ETS2
//  - envia ao app as entregas, o dia e o trabalho em andamento (mesmo núcleo do programa de terminal)
//  - coleta pausável e só do perfil do jogo ligado à carreira
//  - ícone na bandeja com o status, avisos a cada entrega
//  - overlay: o app por cima do jogo com um atalho (padrão Ctrl+Shift+Espaço); ao esconder, o jogo volta a receber o teclado
//  - simulação: warp e avanços de tempo digitados no console do jogo pelo plugin (runner.mjs → comando.txt)
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, Notification, shell, dialog, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_URL = 'https://altairjr.github.io/Realistic-Career-ATS/';
const DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'CarreiraRealistaATS');
const SETTINGS_FILE = path.join(DIR, 'desktop.json');
const DEFAULTS = { openWithGame: true, startWithWindows: false, hotkey: 'Control+Shift+Space', game: 'ats', overlayBounds: null, overlaySize: 2, overlayOpacity: 0.97, askedInstall: false };
const LIB = app.isPackaged ? path.join(__dirname, 'lib') : path.join(__dirname, '..', 'telemetry', 'companion');
const BUNDLED_DLL = app.isPackaged ? path.join(process.resourcesPath, 'carreira-telemetria.dll') : path.join(__dirname, 'resources', 'carreira-telemetria.dll');

let settings, runner, install, tray, painel = null, overlay = null, lastState = null, quitting = false;
const logs = [];
const pushLog = t => { logs.push({ at: new Date().toISOString(), text: t }); if (logs.length > 60) logs.shift(); };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showPainel());
app.setAppUserModelId('io.github.altairjr.carreirarealista');

function loadSettings() {
  let s; try { s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { s = {}; }
  // v0.21: overlay um pouco maior; quem já tinha um tamanho salvo ganha o mesmo aumento uma vez
  if (s.overlayBounds && !s.overlaySize) s.overlayBounds = Object.assign({}, s.overlayBounds, { width: Math.round(s.overlayBounds.width * 1.15), height: Math.round(s.overlayBounds.height * 1.1) });
  const out = Object.assign({}, DEFAULTS, s, { overlaySize: 2 });
  if (!s.overlaySize && Object.keys(s).length) { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(out, null, 2)); } catch (e) {} }
  return out;
}
function saveSettings() { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); applySettings(); }
function serverConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(LIB, 'config.json'), 'utf8')); } catch (e) {}
  const t = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8');
  return { url: (t.match(/url:\s*'([^']*)'/) || [])[1], key: (t.match(/key:\s*'([^']*)'/) || [])[1] };
}

// Opções que dependem do sistema: abrir com o jogo (o plugin lê este arquivo), iniciar com o Windows, atalho
function applySettings() {
  const launcher = path.join(DIR, 'abrir-com-jogo.txt');
  if (settings.openWithGame && app.isPackaged) fs.writeFileSync(launcher, process.execPath); else fs.rmSync(launcher, { force: true });
  app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows, args: ['--oculto'] });
  globalShortcut.unregisterAll();
  try { if (settings.hotkey && !globalShortcut.register(settings.hotkey, toggleOverlay)) pushLog(`O atalho ${settings.hotkey} já está em uso por outro programa.`); }
  catch (e) { pushLog(`Atalho inválido: ${settings.hotkey}`); }
  if (overlay) overlay.setOpacity(settings.overlayOpacity);
}

/* --- plugin no jogo --- */
function pluginInfo() {
  const bundled = fs.existsSync(BUNDLED_DLL) ? fs.readFileSync(BUNDLED_DLL) : null;
  return install.findGames().map(g => Object.assign({ game: g.game, dir: g.dir }, install.pluginStatus(g.dir, bundled)));
}
async function installPlugin(game) {
  const g = install.findGames().find(x => x.game === game);
  if (!g) return { ok: false, error: 'Jogo não encontrado na Steam.' };
  if (!fs.existsSync(BUNDLED_DLL)) return { ok: false, error: 'O instalador não trouxe a DLL. Baixe de novo o Carreira Realista.' };
  const r = install.installPlugin(g.dir, BUNDLED_DLL);
  pushLog(r.ok ? `Plugin instalado em ${install.pluginsDir(g.dir)}. Abra (ou reabra) o jogo.` : `Plugin não instalado: ${r.error}`);
  return r;
}

/* --- estado para a bandeja e o painel --- */
function computeState() {
  const s = runner.snapshot(), plugins = pluginInfo(), game = plugins.find(p => p.game === settings.game) || null;
  let level = 'ok', headline = 'Tudo funcionando';
  if (!s.account) { level = 'off'; headline = 'Entre na sua conta'; }
  else if (!game) { level = 'off'; headline = 'Jogo não encontrado na Steam'; }
  else if (!game.installed) { level = 'off'; headline = 'Plugin não instalado no jogo'; }
  else if (!s.control.collect) { level = 'wait'; headline = 'Coleta pausada'; }
  else if (s.blocked === 'profile') { level = 'wait'; headline = `Perfil "${s.gameLog && s.gameLog.profile}" não ligado à carreira`; }
  else if (s.sendError === 'offline') { level = 'wait'; headline = 'Sem internet: guardando para enviar depois'; }
  else if (s.sendError === 'setup') { level = 'off'; headline = 'Servidor sem as tabelas da telemetria'; }
  else if (!s.game.online) { level = 'wait'; headline = 'Esperando o jogo abrir'; }
  return Object.assign({}, s, { level, headline, plugins, settings, logs: logs.slice(-30), appUrl: APP_URL, version: app.getVersion() });
}
function refreshUi() {
  lastState = computeState();
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icons', `${lastState.level}-32.png`));
  if (tray) { tray.setImage(icon); tray.setToolTip(`Carreira Realista — ${lastState.headline}`); tray.setContextMenu(trayMenu()); }
  if (painel && !painel.isDestroyed()) painel.webContents.send('state', lastState);
}
function trayMenu() {
  const s = lastState || {};
  return Menu.buildFromTemplate([
    { label: s.headline || 'Carreira Realista', enabled: false },
    { type: 'separator' },
    { label: 'Abrir painel', click: showPainel },
    { label: `Mostrar/ocultar o app no jogo (${settings.hotkey.replace('Control', 'Ctrl').replace('Space', 'Espaço')})`, click: toggleOverlay },
    { label: 'Abrir o app no navegador', click: () => shell.openExternal(APP_URL) },
    { type: 'separator' },
    { label: 'Coleta ligada', type: 'checkbox', checked: !!(s.control && s.control.collect), click: async m => { await runner.setCollect(m.checked); refreshUi(); } },
    { label: s.control && s.control.linkedProfile ? `Perfil ligado: ${s.control.linkedProfile}` : 'Nenhum perfil ligado', enabled: false },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]);
}

/* --- janelas --- */
const prefs = (extra, preload = 'preload.cjs') => Object.assign({ preload: path.join(__dirname, preload), contextIsolation: true, nodeIntegration: false, sandbox: true }, extra);
function showPainel() {
  if (painel && !painel.isDestroyed()) { painel.show(); painel.focus(); return; }
  painel = new BrowserWindow({ width: 560, height: 820, minWidth: 420, title: 'Carreira Realista', icon: path.join(__dirname, 'icons', 'app.png'), backgroundColor: '#0e1311', autoHideMenuBar: true, webPreferences: prefs() });
  painel.loadFile(path.join(__dirname, 'painel', 'index.html'));
  painel.on('close', e => { if (!quitting) { e.preventDefault(); painel.hide(); } });   // fechar = esconder na bandeja
  painel.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function createOverlay() {
  const area = screen.getPrimaryDisplay().workArea, b = settings.overlayBounds || { width: 510, height: Math.min(900, area.height - 40) };
  b.width = Math.min(b.width, area.width - 20); b.height = Math.min(b.height, area.height - 20);
  overlay = new BrowserWindow({
    x: b.x ?? area.x + area.width - b.width - 20, y: b.y ?? area.y + 20, width: b.width, height: b.height,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, show: false, resizable: true, minWidth: 380, minHeight: 460,
    webPreferences: prefs({ partition: 'persist:carreira' }, 'preload-overlay.cjs')
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');   // acima de janelas em tela cheia sem borda
  overlay.setOpacity(settings.overlayOpacity);
  overlay.loadURL(APP_URL + '?overlay=1');
  overlay.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  const keep = () => { if (overlay.isMinimized() || !overlay.isVisible()) return; settings.overlayBounds = overlay.getBounds(); saveSettings(); };
  overlay.on('moved', keep); overlay.on('resized', keep);
  overlay.on('close', e => { if (!quitting) { e.preventDefault(); hideOverlay(); } });
}
// Esconder devolve o teclado ao jogo: minimizar faz o Windows ativar a janela de baixo (o jogo) antes de esconder.
// Só esconder deixaria o foco perdido e seria preciso clicar no jogo.
function hideOverlay() {
  if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
  overlay.blur(); overlay.minimize(); overlay.hide();
}
function toggleOverlay() {
  if (!overlay || overlay.isDestroyed()) createOverlay();
  if (overlay.isVisible() && !overlay.isMinimized() && overlay.isFocused()) return hideOverlay();
  if (overlay.isMinimized()) overlay.restore();
  overlay.show(); overlay.focus();
}

/* --- comandos das janelas --- */
function handlers() {
  ipcMain.handle('get-state', () => lastState || computeState());
  ipcMain.handle('login', async (e, email, pw) => { try { const who = await runner.login(email, pw); pushLog(`Conectado como ${who}.`); await runner.cycle(); refreshUi(); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('logout', async () => { await runner.logout(); pushLog('Você saiu da conta neste PC.'); refreshUi(); return { ok: true }; });
  ipcMain.handle('collect', async (e, on) => { await runner.setCollect(on); refreshUi(); return { ok: true }; });
  ipcMain.handle('link-profile', async (e, name) => { await runner.linkProfile(name); await runner.cycle(); refreshUi(); return { ok: true }; });
  ipcMain.handle('install', async (e, game) => { const r = await installPlugin(game); refreshUi(); return r; });
  ipcMain.handle('remove', async (e, game) => {
    const g = install.findGames().find(x => x.game === game); if (!g) return { ok: false, error: 'Jogo não encontrado.' };
    const r = install.removePlugin(g.dir); pushLog(r.ok ? 'Plugin removido do jogo. Nada mais é coletado até instalar de novo.' : r.error); refreshUi(); return r;
  });
  ipcMain.handle('settings', (e, patch) => { Object.assign(settings, patch || {}); saveSettings(); if (patch && patch.game) runner.setGameLogPath(install.gameLogPath(settings.game)); refreshUi(); return settings; });
  ipcMain.handle('open-app', () => shell.openExternal(APP_URL));
  ipcMain.handle('open-folder', () => shell.openPath(DIR));
  ipcMain.handle('toggle-overlay', () => toggleOverlay());
  ipcMain.handle('hide-overlay', () => hideOverlay());
  // tempo no jogo (overlay): o pedido vai para o plugin, que digita no console quando você volta ao jogo com o caminhão parado
  ipcMain.handle('game-clock', () => { const s = runner.snapshot(); return { online: s.game.online, gameTime: s.game.gameTime, sim: s.simInfo, settings: s.control.sim }; });
  ipcMain.handle('advance-time', (e, minutes) => { const r = runner.advanceTime(minutes); if (r.ok) pushLog(`Pedido: avançar ${Math.round(minutes / 60 * 10) / 10} h no jogo.`); refreshUi(); return r; });
  ipcMain.handle('set-time', (e, h, m) => { const r = runner.setTime(h, m); if (r.ok) pushLog(`Pedido: hora do jogo ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}.`); refreshUi(); return r; });
}

function onNotify(n) {
  if (!Notification.isSupported()) return;
  if (n.type === 'delivery') {
    const d = n.draft.data;
    new Notification({ title: 'Entrega enviada para o app', body: `${d.origin || '?'} → ${d.dest || '?'} · ${d.miles} mi · $${Number(d.freight).toLocaleString('pt-BR')}. Revise em "Viagens do jogo".`, icon: path.join(__dirname, 'icons', 'app.png') }).show();
  }
  if (n.type === 'sim') new Notification({ title: n.cmd.ok ? 'Aplicado no jogo' : 'Comando não aplicado no jogo', body: n.cmd.ok ? n.cmd.text : n.cmd.error || 'erro', silent: true }).show();
  if (n.type === 'profile-linked') new Notification({ title: 'Perfil ligado à carreira', body: `"${n.profile}" envia para o app. Outros perfis do jogo não enviam nada.` }).show();
}

app.whenReady().then(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  settings = loadSettings();
  install = await import(pathToFileURL(path.join(LIB, 'install.mjs')).href);
  const { createRunner } = await import(pathToFileURL(path.join(LIB, 'runner.mjs')).href);
  const cfg = serverConfig();
  runner = createRunner({ dir: DIR, url: cfg.url, key: cfg.key, gameLogPath: install.gameLogPath(settings.game), log: pushLog, notify: onNotify });
  handlers(); applySettings();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icons', 'wait-32.png')));
  tray.on('click', showPainel);
  refreshUi();
  // primeira vez ou algo faltando: abre o painel; aberto pelo jogo ou pelo Windows: fica só na bandeja
  const hidden = process.argv.includes('--oculto') || process.argv.includes('--pelo-jogo');
  if (!hidden || lastState.level === 'off') showPainel();
  // plugin ausente ou desatualizado: oferece instalar
  const g = lastState.plugins.find(p => p.game === settings.game);
  if (g && (!g.installed || !g.upToDate) && fs.existsSync(BUNDLED_DLL)) {
    const r = await dialog.showMessageBox({ type: 'question', buttons: ['Instalar agora', 'Depois'], defaultId: 0, title: 'Carreira Realista',
      message: g.installed ? 'Há uma versão nova do plugin de telemetria.' : 'Instalar o plugin de telemetria no American Truck Simulator?',
      detail: `Pasta: ${install.pluginsDir(g.dir)}${g.wrongCopies.length ? `\n\nAtenção: há uma cópia numa pasta que o jogo não lê:\n${g.wrongCopies.join('\n')}` : ''}\n\nO jogo precisa estar fechado.` });
    if (r.response === 0) await installPlugin(settings.game);
  }
  const tick = async () => { await runner.cycle(); try { fs.writeFileSync(path.join(DIR, 'app.vivo'), String(Date.now())); } catch (e) {} refreshUi(); };
  await tick(); setInterval(tick, 2000);
});
app.on('window-all-closed', e => e.preventDefault());   // continua na bandeja
app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); try { fs.rmSync(path.join(DIR, 'app.vivo'), { force: true }); } catch (e) {} });
