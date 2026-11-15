// Acha o ATS e o ETS2 pela Steam e instala, confere ou remove o plugin (carreira-telemetria.dll).
// Sem dependências; as funções de sistema (registro, arquivos) podem ser trocadas nos testes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const GAMES = {
  ats: { appid: '270880', folder: 'American Truck Simulator', exe: 'amtrucks.exe', docs: 'American Truck Simulator', name: 'American Truck Simulator' },
  ets2: { appid: '227300', folder: 'Euro Truck Simulator 2', exe: 'eurotrucks2.exe', docs: 'Euro Truck Simulator 2', name: 'Euro Truck Simulator 2' }
};
export const DLL = 'carreira-telemetria.dll';

function regQuery(key, value) {
  try {
    const out = execFileSync('reg', ['query', key, '/v', value], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(new RegExp(value + '\\s+REG_\\w+\\s+(.+)'));
    return m ? m[1].trim() : null;
  } catch (e) { return null; }
}
const expandEnv = s => String(s || '').replace(/%([^%]+)%/g, (a, k) => process.env[k] ?? a);

// Pastas de bibliotecas da Steam (libraryfolders.vdf), com os jogos de cada uma
export function parseLibraryFolders(vdf) {
  const libs = [];
  const blocks = String(vdf).split(/\n\s*"\d+"\s*\n\s*\{/).slice(1);
  for (const b of blocks) {
    const p = b.match(/"path"\s+"([^"]+)"/);
    if (!p) continue;
    const apps = [...(b.match(/"apps"\s*\{([^}]*)\}/) || ['', ''])[1].matchAll(/"(\d+)"/g)].map(m => m[1]);
    libs.push({ path: p[1].replace(/\\\\/g, '\\'), apps });
  }
  return libs;
}

export function findSteam(sys = {}) {
  const q = sys.regQuery || regQuery;
  const candidates = [q('HKCU\\Software\\Valve\\Steam', 'SteamPath'), q('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'), 'C:\\Program Files (x86)\\Steam'];
  const exists = sys.exists || fs.existsSync;
  return candidates.filter(Boolean).map(p => p.replace(/\//g, '\\')).find(p => exists(path.win32.join(p, 'steamapps'))) || null;
}

// Onde estão os jogos: [{ game, dir }]
export function findGames(sys = {}) {
  const exists = sys.exists || fs.existsSync, read = sys.readFile || (f => fs.readFileSync(f, 'utf8'));
  const steam = sys.steamPath || findSteam(sys);
  if (!steam) return [];
  const j = path.win32.join;
  let libs = [];
  try { libs = parseLibraryFolders(read(j(steam, 'steamapps', 'libraryfolders.vdf'))); } catch (e) {}
  if (!libs.some(l => l.path.toLowerCase() === steam.toLowerCase())) libs.push({ path: steam, apps: [] });
  const found = [];
  for (const [game, g] of Object.entries(GAMES)) {
    const ordered = [...libs.filter(l => l.apps.includes(g.appid)), ...libs.filter(l => !l.apps.includes(g.appid))];
    for (const l of ordered) {
      const dir = j(l.path, 'steamapps', 'common', g.folder);
      if (exists(j(dir, 'bin', 'win_x64', g.exe))) { found.push({ game, dir }); break; }
    }
  }
  return found;
}

const hash = buf => crypto.createHash('sha256').update(buf).digest('hex');
export const pluginsDir = gameDir => path.win32.join(gameDir, 'bin', 'win_x64', 'plugins');

// Situação do plugin num jogo: instalado, igual ao do programa, cópias em pastas erradas
export function pluginStatus(gameDir, bundled, sys = {}) {
  const exists = sys.exists || fs.existsSync, readBuf = sys.readBuffer || (f => fs.readFileSync(f)), list = sys.listDir || (d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (e) { return []; } });
  const bin = path.win32.join(gameDir, 'bin', 'win_x64'), target = path.win32.join(pluginsDir(gameDir), DLL);
  const installed = exists(target);
  let upToDate = false;
  if (installed && bundled) { try { upToDate = hash(readBuf(target)) === hash(bundled); } catch (e) {} }
  const wrongCopies = [bin, ...list(bin).filter(n => n !== 'plugins').map(n => path.win32.join(bin, n))].map(d => path.win32.join(d, DLL)).filter(f => exists(f));
  return { target, installed, upToDate, wrongCopies };
}

export function installPlugin(gameDir, bundledPath, sys = {}) {
  const mkdir = sys.mkdir || (d => fs.mkdirSync(d, { recursive: true })), copy = sys.copy || fs.copyFileSync;
  const dir = pluginsDir(gameDir);
  try { mkdir(dir); copy(bundledPath, path.win32.join(dir, DLL)); return { ok: true }; }
  catch (e) { return { ok: false, error: ['EBUSY', 'EPERM', 'EACCES'].includes(e.code) ? 'Feche o jogo e tente de novo: a DLL está em uso.' : e.message }; }
}
export function removePlugin(gameDir, sys = {}) {
  const rm = sys.rm || (f => fs.rmSync(f, { force: true }));
  try { rm(path.win32.join(pluginsDir(gameDir), DLL)); return { ok: true }; }
  catch (e) { return { ok: false, error: ['EBUSY', 'EPERM', 'EACCES'].includes(e.code) ? 'Feche o jogo e tente de novo: a DLL está em uso.' : e.message }; }
}

// Pasta Documentos (pode estar no OneDrive) → game.log.txt de cada jogo
export function documentsDir(sys = {}) {
  const q = sys.regQuery || regQuery, exists = sys.exists || fs.existsSync;
  const home = sys.home || os.homedir();
  const c = [expandEnv(q('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', 'Personal')), path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'), path.join(home, 'OneDrive', 'Documentos')];
  return c.filter(Boolean).find(p => exists(p)) || path.join(home, 'Documents');
}
export const gameLogPath = (game, sys = {}) => path.join(documentsDir(sys), GAMES[game].docs, 'game.log.txt');
