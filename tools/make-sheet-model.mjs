// Gera src/app/61-sheet-model.js a partir de uma planilha no modelo "Carreira Realista ATS".
//   node tools/make-sheet-model.mjs caminho/da/planilha.xlsx
// O modelo embutido no app guarda a aparência, os títulos, as fórmulas e as validações da planilha,
// mas NÃO os dados: todas as células de dados são esvaziadas aqui e preenchidas pelo app na exportação.
// Use de novo só se o desenho da planilha mudar (novas colunas, cores, textos).
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync, deflateRawSync, crc32 as zcrc } from 'node:zlib';

const src = process.argv[2];
if (!src) { console.error('Informe o arquivo .xlsx do modelo.'); process.exit(1); }
const buf = readFileSync(src);

/* --- zip: leitura --- */
let eocd = buf.length - 22; while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
const files = new Map(); let p = buf.readUInt32LE(eocd + 16);
for (let k = 0, n = buf.readUInt16LE(eocd + 10); k < n; k++) {
  const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
  const name = buf.toString('utf8', p + 46, p + 46 + nlen);
  const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), data = buf.subarray(start, start + csize);
  files.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
  p += 46 + nlen + elen + clen;
}

/* --- quais abas são quais --- */
const rels = Object.fromEntries([...files.get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => [m[0].match(/Id="([^"]+)"/)[1], 'xl/' + m[0].match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, '')]));
const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const sheets = Object.fromEntries([...files.get('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map(m => [unesc(m[0].match(/name="([^"]+)"/)[1]), rels[m[0].match(/r:id="([^"]+)"/)[1]]]));
const need = ['Config', 'Parametros', 'Motorista & Carreira', 'Diário de bordo', 'Dashboard & DRE', 'Histórioco holerite', 'Historico de fretes', 'Diário de bordo carro', 'Dashboard carro'];
for (const n of need) if (!sheets[n]) { console.error(`Aba "${n}" não encontrada. Abas: ${Object.keys(sheets).join(', ')}`); process.exit(1); }

/* --- limpeza das células de dados --- */
const cleared = new Set();   // índices de textos compartilhados usados só por células esvaziadas
const blank = (xml, test) => xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (all, attrs, inner) => {
  const ref = attrs.match(/\br="([A-Z]+)(\d+)"/); if (!ref || !test(ref[1], +ref[2])) return all;
  if (/\bt="s"/.test(attrs) && inner) cleared.add(+inner.match(/<v>(\d+)<\/v>/)[1]);
  const s = attrs.match(/\bs="\d+"/);
  return `<c r="${ref[1]}${ref[2]}"${s ? ' ' + s[0] : ''}/>`;
});
const edit = (name, fn) => files.set(sheets[name], fn(files.get(sheets[name])));
// linhas além do protótipo saem; o app recria as linhas de dados copiando o estilo do protótipo
const dropRows = (xml, test) => xml.replace(/<row\b([^>]*?)(?:\/>|>[\s\S]*?<\/row>)/g, (all, attrs) => test(+attrs.match(/\br="(\d+)"/)[1]) ? '' : all);
const col = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

edit('Config', x => blank(x, (c, r) => (c === 'B' && r === 1) || (c === 'B' && r >= 7 && r <= 12)));
edit('Parametros', x => blank(x, (c, r) => (c === 'A' && r >= 2) || (c === 'B' && r === 1)));
edit('Motorista & Carreira', x => blank(x, (c, r) => [5, 7, 9].includes(r) && col(c) <= 6));
edit('Diário de bordo', x => blank(dropRows(x, r => r > 5), (c, r) => r === 5));
edit('Dashboard & DRE', x => blank(x, (c, r) => c === 'B' && r === 21));
edit('Histórioco holerite', x => blank(x, (c, r) => r === 5 && col(c) <= 6));
// protótipos: linha 5 (viagem) e linhas 11-12 (separador "Final de semana", mesclado)
edit('Historico de fretes', x => blank(dropRows(x, r => r > 5 && r !== 11 && r !== 12), (c, r) => r === 5).replace(/<mergeCells[\s\S]*?<\/mergeCells>/, ''));
edit('Diário de bordo carro', x => blank(dropRows(x, r => r > 5), (c, r) => r === 5));
edit('Dashboard carro', x => blank(x, (c, r) => r >= 5 && col(c) <= 12));

// valores já calculados das fórmulas também são dados: saem, e a planilha recalcula ao abrir
for (const f of Object.values(sheets)) files.set(f, files.get(f).replace(/<c\b([^>]*)>(<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>)<v>[\s\S]*?<\/v><\/c>/g, (all, attrs, f) => `<c${attrs.replace(/\s+t="[^"]*"/, '')}>${f}</c>`));

// textos compartilhados que só existiam em células esvaziadas são apagados (nenhum dado pessoal fica no modelo)
const used = new Set();
for (const f of Object.values(sheets)) for (const m of files.get(f).matchAll(/<c\b[^>]*\bt="s"[^>]*><v>(\d+)<\/v>/g)) used.add(+m[1]);
let i = 0, wiped = 0;
files.set('xl/sharedStrings.xml', files.get('xl/sharedStrings.xml').replace(/<si>[\s\S]*?<\/si>/g, all => { const idx = i++; if (used.has(idx)) return all; wiped++; return '<si><t></t></si>'; }));
// recalcular as fórmulas ao abrir
files.set('xl/workbook.xml', files.get('xl/workbook.xml').replace(/<calcPr[^>]*\/>/, '<calcPr fullCalcOnLoad="1"/>'));

/* --- zip: escrita (comprimido) e saída como módulo do app --- */
const parts = [], central = []; let off = 0;
for (const [name, text] of files) {
  const nb = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw, { level: 9 }), crc = zcrc(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
  parts.push(lh, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
const out = Buffer.concat([...parts, cd, end]);
const b64 = out.toString('base64').replace(/(.{120})/g, "$1',\n  '");
writeFileSync('src/app/61-sheet-model.js', `/* Modelo da planilha "Carreira Realista ATS" (aparência, títulos, fórmulas e validações), sem dados.
   Arquivo gerado por tools/make-sheet-model.mjs. Não edite à mão. */
const SHEET_MODEL_B64 = [
  '${b64}'
].join('');
`);
console.log(`src/app/61-sheet-model.js gerado: ${(out.length / 1024).toFixed(0)} KB comprimido, ${wiped} textos de dados apagados.`);
