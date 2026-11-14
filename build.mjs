// Junta o shell, a configuração, o motor e os módulos do app em um arquivo único.
//   node build.mjs                      → dist/ (index.html + manifesto, ícones e service worker: app instalável)
//   node build.mjs --artifact <arquivo> → só o conteúdo do <body>, para publicar como artifact no Claude
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const shell = readFileSync('src/shell.html', 'utf8');
const config = readFileSync('src/config.js', 'utf8');
// Proteção: chave secreta nunca pode ir para o app (ele é público)
const keyIn = (config.match(/key:\s*'([^']*)'/) || [])[1] || '';
const role = (() => { try { return JSON.parse(Buffer.from(keyIn.split('.')[1], 'base64url').toString()).role; } catch (e) { return null; } })();
if (/^sb_secret_/.test(keyIn) || role === 'service_role') throw new Error('src/config.js tem a chave SECRETA do Supabase. Use a chave publicável (sb_publishable_...).');
const cloudUrl = (config.match(/url:\s*'([^']*)'/) || [])[1] || '';
const cloudOrigin = (() => { try { return new URL(cloudUrl).origin; } catch (e) { return ''; } })();
const engine = readFileSync('src/engine.js', 'utf8').replace(/^if \(typeof module.*$/m, '');
// Os módulos são scripts clássicos que compartilham o escopo global; a ordem é a do nome do arquivo.
const modules = readdirSync('src/app').filter(f => f.endsWith('.js')).sort();
const app = modules.map(f => readFileSync(`src/app/${f}`, 'utf8')).join('\n');
const body = `${shell}\n<script>\nconst APP_VERSION = '${version}';\n${config}\n${engine}\n${app}\n</script>\n`;

// Só a versão hospedada registra o service worker (dentro do Claude e em file:// ele não existe).
// Versão nova publicada: o service worker novo assume e a página recarrega uma vez sozinha.
const swRegister = `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => {});
  });
}
</script>`;
// Política de conteúdo: o app só conversa com o próprio site, com o servidor de sincronização e com as fontes do Google.
// Com o servidor gravado em src/config.js, só ele é aceito; sem ele, qualquer https (o servidor é informado na tela).
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", `connect-src 'self' ${cloudOrigin || 'https:'}`,
  "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Carreira realista para American Truck Simulator: diário de bordo, contratos, resultado da semana e holerite.">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
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
writeFileSync('dist/sw.js', readFileSync('public/sw.js', 'utf8').replaceAll('__BUILD__', stamp));
if (readFileSync('dist/sw.js', 'utf8').includes('__BUILD__')) throw new Error('sw.js ficou sem a marca de versão');
console.log(`dist/ gerado: v${version} (${modules.length} módulos, index.html com ${(html.length / 1024).toFixed(0)} KB, cache ${stamp})`);

const i = process.argv.indexOf('--artifact');
if (i > 0 && process.argv[i + 1]) { writeFileSync(process.argv[i + 1], body); console.log(`artifact: ${process.argv[i + 1]}`); }
