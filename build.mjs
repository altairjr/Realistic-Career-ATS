// Junta o shell, a configuração, o motor e os módulos do app em um arquivo único.
//   node build.mjs                      → dist/ (index.html + manifesto, ícones e service worker: app instalável)
//   node build.mjs --artifact <arquivo> → só o conteúdo do <body>, para publicar como artifact no Claude
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const shell = readFileSync('src/shell.html', 'utf8');
const config = readFileSync('src/config.js', 'utf8');
const engine = readFileSync('src/engine.js', 'utf8').replace(/^if \(typeof module.*$/m, '');
// Os módulos são scripts clássicos que compartilham o escopo global; a ordem é a do nome do arquivo.
const modules = readdirSync('src/app').filter(f => f.endsWith('.js')).sort();
const app = modules.map(f => readFileSync(`src/app/${f}`, 'utf8')).join('\n');
const body = `${shell}\n<script>\nconst APP_VERSION = '${version}';\n${config}\n${engine}\n${app}\n</script>\n`;

// Só a versão hospedada registra o service worker (dentro do Claude e em file:// ele não existe).
const swRegister = `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
</script>`;
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Carreira realista para American Truck Simulator: diário de bordo, contratos, resultado da semana e holerite.">
<meta name="theme-color" content="#0d6a3c">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Carreira ATS">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}${swRegister}
</body>
</html>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
// Arquivos do app instalável. O service worker recebe uma marca do conteúdo: mudou o app, renova o cache.
cpSync('public', 'dist', { recursive: true });
const stamp = version + '-' + createHash('sha256').update(html).digest('hex').slice(0, 8);
writeFileSync('dist/sw.js', readFileSync('public/sw.js', 'utf8').replace('__BUILD__', stamp));
console.log(`dist/ gerado: v${version} (${modules.length} módulos, index.html com ${(html.length / 1024).toFixed(0)} KB, cache ${stamp})`);

const i = process.argv.indexOf('--artifact');
if (i > 0 && process.argv[i + 1]) { writeFileSync(process.argv[i + 1], body); console.log(`artifact: ${process.argv[i + 1]}`); }
