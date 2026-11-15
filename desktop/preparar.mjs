// Junta o que o app de PC precisa antes de empacotar: o núcleo da telemetria e o servidor de src/config.js.
//   node desktop/preparar.mjs   (o workflow "desktop" roda isto antes do electron-builder)
// A DLL (desktop/resources/carreira-telemetria.dll) vem da compilação do plugin no mesmo workflow.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), lib = join(here, 'lib');
mkdirSync(lib, { recursive: true });
for (const f of ['core.mjs', 'gamelog.mjs', 'install.mjs', 'runner.mjs']) copyFileSync(join(root, 'telemetry', 'companion', f), join(lib, f));
const cfg = readFileSync(join(root, 'src', 'config.js'), 'utf8');
const url = (cfg.match(/url:\s*'([^']*)'/) || [])[1], key = (cfg.match(/key:\s*'([^']*)'/) || [])[1];
if (!url || !key) throw new Error('Preencha url e key em src/config.js antes de empacotar.');
if (/^sb_secret_/.test(key)) throw new Error('src/config.js tem a chave SECRETA. Use a publicável.');
writeFileSync(join(lib, 'config.json'), JSON.stringify({ url, key }, null, 2));
// versão do app de PC = versão do projeto
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
pkg.version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(join(here, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`desktop/lib pronto (v${pkg.version})${existsSync(join(here, 'resources', 'carreira-telemetria.dll')) ? '' : ' — atenção: falta desktop/resources/carreira-telemetria.dll'}`);
