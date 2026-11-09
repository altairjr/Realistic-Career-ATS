// Gera dist/index.html (arquivo único) juntando shell + motor + app.
// Uso: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const shell = readFileSync('src/shell.html', 'utf8');
const engine = readFileSync('src/engine.js', 'utf8').replace(/^if \(typeof module.*$/m, '');
const app = readFileSync('src/app.js', 'utf8');
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${shell}
<script>
${engine}
${app}
</script>
</body>
</html>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html gerado (${(html.length / 1024).toFixed(0)} KB)`);
