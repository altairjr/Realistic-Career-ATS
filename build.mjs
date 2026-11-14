// Junta o shell, o motor e os módulos do app em um arquivo único.
//   node build.mjs                      → dist/index.html (abre direto no navegador)
//   node build.mjs --artifact <arquivo> → só o conteúdo do <body>, para publicar como artifact no Claude
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const shell = readFileSync('src/shell.html', 'utf8');
const engine = readFileSync('src/engine.js', 'utf8').replace(/^if \(typeof module.*$/m, '');
// Os módulos são scripts clássicos que compartilham o escopo global; a ordem é a do nome do arquivo.
const modules = readdirSync('src/app').filter(f => f.endsWith('.js')).sort();
const app = modules.map(f => readFileSync(`src/app/${f}`, 'utf8')).join('\n');
const body = `${shell}\n<script>\n${engine}\n${app}\n</script>\n`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}</body>
</html>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html gerado (${modules.length} módulos, ${(html.length / 1024).toFixed(0)} KB)`);

const i = process.argv.indexOf('--artifact');
if (i > 0 && process.argv[i + 1]) { writeFileSync(process.argv[i + 1], body); console.log(`artifact: ${process.argv[i + 1]}`); }
