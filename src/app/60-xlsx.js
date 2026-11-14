/* ---------- Planilha (.xlsx) sem bibliotecas externas ----------
   Leitura: zip (DecompressionStream) + XML. Escrita: zip sem compressão.
   A exportação parte do modelo embutido (61-sheet-model.js) e troca só as células de dados (sheetEdit). */
const XL = (() => {
  const td = new TextDecoder(), te = new TextEncoder();
  async function unzip(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not_zip');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('not_zip');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      files[td.decode(new Uint8Array(buf, p + 46, nlen))] = { method, csize, lho };
      p += 46 + nlen + elen + clen;
    }
    const read = async name => {
      const f = files[name]; if (!f) return null;
      const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
      const data = new Uint8Array(buf, start, f.csize);
      if (f.method === 0) return td.decode(data);
      if (f.method === 8) return td.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw new Error('zip_method');
    };
    return { files, read };
  }
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const tags = (node, name) => Array.from(node.getElementsByTagName(name));
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  // Lê o arquivo e devolve { nomeDaAba: [[célula, ...], ...] }
  async function read(buf) {
    const z = await unzip(buf);
    const wbx = await z.read('xl/workbook.xml'); if (!wbx) throw new Error('not_xlsx');
    const rels = {}; const relx = await z.read('xl/_rels/workbook.xml.rels');
    if (relx) tags(xml(relx), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const shared = []; const ssx = await z.read('xl/sharedStrings.xml');
    if (ssx) tags(xml(ssx), 'si').forEach(si => shared.push(tags(si, 't').filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join('')));
    const out = {};
    for (const sh of tags(xml(wbx), 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || ''; target = target.replace(/^\//, ''); if (!target.startsWith('xl/')) target = 'xl/' + target;
      const sx = await z.read(target); if (!sx) continue;
      const rows = [];
      for (const r of tags(xml(sx), 'row')) {
        const ri = (parseInt(r.getAttribute('r')) || rows.length + 1) - 1, row = [];
        for (const c of tags(r, 'c')) {
          const t = c.getAttribute('t'), v = tags(c, 'v')[0], ci = c.getAttribute('r') ? colIdx(c.getAttribute('r')) : row.length;
          let val = '';
          if (t === 's') val = shared[parseInt(v && v.textContent)] ?? '';
          else if (t === 'inlineStr') val = tags(c, 't').map(x => x.textContent).join('');
          else if (t === 'b') val = v && v.textContent === '1';
          else if (v) val = t === 'str' || t === 'e' ? v.textContent : (isFinite(+v.textContent) ? +v.textContent : v.textContent);
          row[ci] = val;
        }
        rows[ri] = row;
      }
      out[sh.getAttribute('name')] = Array.from(rows, r => Array.from(r || [], x => x ?? ''));
    }
    return out;
  }
  /* --- escrita --- */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(entries) {
    const parts = [], central = []; let off = 0;
    for (const [name, text] of entries) {
      const nb = te.encode(name), data = te.encode(text), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const b64 = str => { const bin = atob(str), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };
  // Abre um .xlsx e devolve { files: Map(caminho → texto), sheets: { nomeDaAba: caminho } }
  async function open(buf) {
    const z = await unzip(buf), files = new Map();
    for (const name of Object.keys(z.files)) files.set(name, await z.read(name));
    const rels = {};
    for (const m of (files.get('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b[^>]*>/g)) rels[m[0].match(/\bId="([^"]+)"/)[1]] = 'xl/' + m[0].match(/\bTarget="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, '');
    const sheets = {};
    for (const m of (files.get('xl/workbook.xml') || '').matchAll(/<sheet\b[^>]*>/g)) sheets[unesc(m[0].match(/\bname="([^"]+)"/)[1])] = rels[m[0].match(/\br:id="([^"]+)"/)[1]];
    return { files, sheets };
  }
  const save = files => zip([...files]);
  /* Editor de uma aba: troca valores mantendo o estilo de cada célula.
     Valores: número, texto, { f: 'fórmula' } ou null (célula vazia com estilo). */
  function sheetEdit(xmlText) {
    const m = xmlText.match(/<sheetData>([\s\S]*?)<\/sheetData>|<sheetData\/>/);
    const head = xmlText.slice(0, m.index); let tail = xmlText.slice(m.index + m[0].length);
    const rows = new Map();
    for (const r of (m[1] || '').matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const n = +r[1].match(/\br="(\d+)"/)[1], cells = new Map();
      for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = c[1].match(/\br="([A-Z]+)\d+"/)[1], s = c[1].match(/\bs="(\d+)"/), t = c[1].match(/\bt="([^"]+)"/);
        cells.set(colIdx(ref), { s: s ? s[1] : null, t: t ? t[1] : null, body: c[2] || '' });
      }
      rows.set(n, { attrs: r[1].replace(/\s*\br="\d+"/, '').replace(/\s*\bspans="[^"]*"/, '').trim(), cells });
    }
    const split = ref => { const x = ref.match(/^([A-Z]+)(\d+)$/); return [colIdx(x[1]), +x[2]]; };
    const row = n => { if (!rows.has(n)) rows.set(n, { attrs: '', cells: new Map() }); return rows.get(n); };
    const api = {
      style(ref) { const [c, r] = split(ref), cell = rows.get(r) && rows.get(r).cells.get(c); return cell ? cell.s : null; },
      set(ref, v, s) {
        const [c, r] = split(ref), R = row(r), old = R.cells.get(c), st = s !== undefined ? s : old ? old.s : null;
        if (v === null || v === undefined || v === '') R.cells.set(c, { s: st, t: null, body: '' });
        else if (typeof v === 'number') R.cells.set(c, { s: st, t: null, body: `<v>${v}</v>` });
        else if (typeof v === 'object') R.cells.set(c, { s: st, t: null, body: `<f>${esc(v.f)}</f>` });
        else R.cells.set(c, { s: st, t: 'inlineStr', body: `<is><t xml:space="preserve">${esc(v)}</t></is>` });
        return api;
      },
      // copia altura e estilos de uma linha para outra, sem os valores
      cloneRow(from, to) { const F = rows.get(from); if (!F) return api; rows.set(to, { attrs: F.attrs, cells: new Map([...F.cells].map(([c, x]) => [c, { s: x.s, t: null, body: '' }])) }); return api; },
      dropFrom(n, to = Infinity) { for (const k of [...rows.keys()]) if (k >= n && k <= to) rows.delete(k); return api; },
      tail(fn) { tail = fn(tail); return api; },
      // validações de lista que começam na linha `first` passam a cobrir até a linha `last`
      extendValidations(first, last) {
        tail = tail.replace(/(<dataValidation\b[^>]*\bsqref=")([^"]+)(")/g, (all, a, sq, z) => {
          const t = sq.split(' ')[0].match(/^([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/); if (!t || +t[2] !== first) return all;
          return `${a}${t[1]}${first}:${t[3] || t[1]}${last}${z}`;
        });
        return api;
      },
      xml() {
        const body = [...rows.keys()].sort((a, b) => a - b).map(n => {
          const R = rows.get(n), cs = [...R.cells.keys()].sort((a, b) => a - b).map(c => { const x = R.cells.get(c), at = `r="${colName(c)}${n}"${x.s !== null ? ` s="${x.s}"` : ''}${x.t ? ` t="${x.t}"` : ''}`; return x.body ? `<c ${at}>${x.body}</c>` : `<c ${at}/>`; }).join('');
          return `<row r="${n}"${R.attrs ? ' ' + R.attrs : ''}>${cs}</row>`;
        }).join('');
        return `${head}<sheetData>${body}</sheetData>${tail}`;
      }
    };
    return api;
  }
  return { read, open, save, sheetEdit, b64, colName };
})();
