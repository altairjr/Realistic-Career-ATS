/* Componentes de formulário: campos ligados ao estado, blocos recolhíveis */
const getP = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S);
function setP(path, val) { const ks = path.split('.'); let o = S; ks.slice(0, -1).forEach(k => { if (o[k] == null) o[k] = {}; o = o[k]; }); o[ks.at(-1)] = val; }
const fid = p => 'f_' + p.replace(/[^a-z0-9]/gi, '_');
const F = {
  num: (path, label, o = {}) => { const L = labRow(o.help || path, label, fid(path)); return `<div class="field ${o.full ? 'full' : ''}">${L.row}<div class="${o.money ? 'money' : o.pct ? 'pctf' : ''}"><input id="${fid(path)}" type="number" inputmode="decimal" step="${o.step || 'any'}" data-bind="${path}" data-type="num" value="${esc(o.value !== undefined ? o.value : getP(path))}" ${o.disabled ? 'disabled' : ''}></div>${o.hint ? `<span class="muted" style="font-size:12px">${o.hint}</span>` : ''}${L.box}</div>`; },
  text: (path, label, o = {}) => { const L = labRow(path, label, fid(path)); return `<div class="field ${o.full ? 'full' : ''}">${L.row}<input id="${fid(path)}" type="text" data-bind="${path}" value="${esc(getP(path))}" placeholder="${esc(o.ph || '')}">${L.box}</div>`; },
  sel: (path, label, opts, o = {}) => { const L = labRow(path, label, fid(path)); return `<div class="field ${o.full ? 'full' : ''}">${L.row}<select id="${fid(path)}" data-bind="${path}" data-type="${o.num ? 'num' : 'str'}" data-rerender>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(getP(path)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${L.box}</div>`; },
  chk: (path, label, hkey = path) => { const h = help(hkey, label); return `<span class="chk-row"><label class="inline-opt"><input type="checkbox" id="${fid(path)}" data-bind="${path}" data-type="bool" data-rerender ${getP(path) ? 'checked' : ''}> ${label}</label>${h.btn}</span>${h.box}`; }
};
const sw = (path, label) => `<span class="switch"><input type="checkbox" id="${fid(path)}" aria-label="${esc(label)}" data-bind="${path}" data-type="bool" data-rerender ${getP(path) ? 'checked' : ''}><span></span></span>`;
// Blocos recolhíveis: fechados mostram um resumo; o estado aberto sobrevive ao re-render
const openMods = new Set(['Dados pessoais']);
const mod = (title, desc, path, body, sum = '') => {
  const open = openMods.has(title), on = !path || getP(path);
  const line = !open && sum ? sum : desc;
  const hb = path ? help(path, title) : { btn: '', box: '' };
  return `<section class="mod ${path && !on ? 'off' : ''}"><div class="mod-h"><button type="button" class="mod-t" data-modt="${esc(title)}" aria-expanded="${open}" data-desc="${esc(desc)}" data-sum="${esc(sum)}"><span class="t"><h3>${title}</h3><p>${esc(line)}</p></span><span class="caret" aria-hidden="true"></span></button>${hb.btn}${path ? sw(path, title) : ''}</div>${hb.box ? `<div style="padding:0 14px 10px">${hb.box}</div>` : ''}<div class="mod-b" ${open ? '' : 'hidden'}>${body}</div></section>`;
};
const costField = (key, label, hint) => `<div class="field">${F.chk(`settings.costs.${key}.on`, label)}<div class="money"><input id="${fid('settings.costs.' + key + '.val')}" aria-label="${label} (valor)" type="number" inputmode="decimal" step="any" data-bind="settings.costs.${key}.val" data-type="num" value="${getP('settings.costs.' + key + '.val')}" ${getP('settings.costs.' + key + '.on') ? '' : 'disabled'}></div><span class="muted" style="font-size:12px">${hint}</span></div>`;
