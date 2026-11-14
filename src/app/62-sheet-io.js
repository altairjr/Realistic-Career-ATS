/* ---------- Importar / exportar planilha no formato do app ---------- */
const SHEET_FMT = {
  version: 'Carreira Realista ATS · modelo v1',
  motorista: [
    ['Nome do motorista', 'texto', 'Ex.: Altair Junior'],
    ['Nacionalidade', 'texto', 'Ex.: Brasileiro'],
    ['Nível no jogo', 'número', 'Ex.: 1'],
    ['Saldo bancário atual (USD)', 'número · obrigatório', 'Saldo hoje, já com tudo que entrou e saiu. Ex.: 8239.15'],
    ['Dia atual do jogo', 'número · obrigatório', 'O dia do calendário do jogo. Ex.: 17'],
    ['Dia 1 do jogo é', 'Segunda a Domingo', 'Opcional. Padrão: Segunda']
  ],
  empresa: [
    ['Nome da empresa', 'texto · obrigatório', 'Ex.: ADM'],
    ['Sede (cidade / estado)', 'texto', 'Ex.: Carson City / NV'],
    ['Classificação', 'W-2 · Lease · Owner-Operator · Autoridade própria · Frota', 'Obrigatório'],
    ['Operação', 'Local · Regional · Dedicated · OTR', 'Opcional. Padrão: Local'],
    ['Forma de pagamento', 'Fixo semanal · Por hora · Por milha · Percentual', 'Opcional. Padrão da classificação'],
    ['Valor base', 'número', 'Fixo: $ por semana · Hora: $ por hora · Milha: $ por milha · Percentual: % do frete'],
    ['Comissão (%)', 'número', 'Opcional. Sobre o frete de mercado (fixo e por hora)'],
    ['Início do contrato (dia)', 'número', 'Opcional. Padrão: 1']
  ],
  viagens: ['Dia', 'Veículo', 'Origem', 'Destino', 'Distância (mi)', 'Frete (USD)', 'Bônus (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Multas (USD)', 'Danos (USD)', 'Cafés', 'Almoços', 'Jantas', 'Noites em hotel', 'Horas de direção', 'Horas de serviço', 'Status'],
  required: ['Dia', 'Veículo', 'Destino', 'Distância (mi)', 'Frete (USD)']
};
const normTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v ?? '').replace(/[$\s]/g, '').replace(/usd/i, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s); return isFinite(n) ? n : NaN;
}

function templateRows(data) {
  const weekdays = E.WEEKDAYS_FULL;
  const kv = (fields, values) => [['Campo', 'Valor', 'Formato', 'Observação'], ...fields.map(([f, fmt, obs], i) => [f, values ? values[i] ?? '' : '', fmt, obs])];
  const readme = [
    ['Modelo de importação', SHEET_FMT.version],
    [''],
    ['Como usar'],
    ['1. Preencha as abas Motorista, Empresa e Viagens. Não mude o nome das abas nem os títulos das colunas.'],
    ['2. Na aba Viagens, uma linha por viagem. Colunas obrigatórias: ' + SHEET_FMT.required.join(', ') + '.'],
    ['3. Veículo: Caminhão, Carro emprestado ou Carro próprio.'],
    ['4. Status: Excelente, Bom, Regular, Ruim ou Atrasada (vazio = Excelente).'],
    ['5. Valores em dólar sem o símbolo. Pode usar vírgula ou ponto como decimal: 1234,56 ou 1234.56.'],
    ['6. Viagens da semana do "Dia atual do jogo" ficam em aberto. As mais antigas viram semanas fechadas no Histórico, já pagas.'],
    ['7. No app: Ajustes › Dados e sincronização › Importar planilha. Importar substitui todos os dados atuais.'],
    [''],
    ['Os cálculos (salário, impostos, despesas) são refeitos com as regras do app.']
  ];
  const p = data && data.profile, co = data && data.company, ct = data && data.contract;
  const payName = { weekly: 'Fixo semanal', hourly: 'Por hora', cpm: 'Por milha', percent: 'Percentual' };
  const clsName = { w2: 'W-2', lease: 'Lease', owner: 'Owner-Operator', authority: 'Autoridade própria', fleet: 'Frota' };
  const k = ct && ct.terms.contract, M = k && k[k.mode];
  return [
    { name: 'Leia-me', rows: readme, widths: [110, 40] },
    { name: 'Motorista', header: true, widths: [30, 22, 22, 60], rows: kv(SHEET_FMT.motorista, p ? [p.name, p.nationality, p.level, data.balance, data.gameDay, weekdays[data.day1 || 0]] : null) },
    { name: 'Empresa', header: true, widths: [28, 22, 48, 60], rows: kv(SHEET_FMT.empresa, co ? [co.name, co.hq, clsName[E.presetKeyFor(ct.classification)], ct.operation, payName[k.mode], k.mode === 'weekly' ? M.value : k.mode === 'percent' ? M.commission : M.rate, M.commissionOn ? M.commission : '', ct.startDay] : null) },
    { name: 'Viagens', header: true, widths: [6, 16, 18, 18, 13, 12, 12, 16, 13, 12, 12, 7, 8, 7, 14, 15, 15, 11], rows: [SHEET_FMT.viagens, ...((data && data.trips) || []).map(t => [t.day, t.type === 'borrowed' ? (t.car && t.car.mode === 'owned' ? 'Carro próprio' : 'Carro emprestado') : 'Caminhão', t.origin || '', t.dest || '', E.n(t.miles), E.n(t.freight), E.n(t.bonus), E.n(t.fuel), E.n(t.tolls), E.n(t.fines), E.n(t.damage), E.n(t.breakfast), E.n(t.lunch), E.n(t.dinner), E.n(t.hotel), E.n(t.drive), E.n(t.hours), t.status || 'Excelente'])] }
  ];
}

async function saveBytes(filename, bytes) {
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename, data: bytes }); toast('Arquivo salvo'); }
    catch (e) { if (e && e.code !== 'declined') toast('Não foi possível salvar o arquivo aqui.'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadTemplate() { saveBytes('modelo-carreira-ats.xlsx', XL.write(templateRows(null))); }
function exportSheet() {
  const c = activeContract();
  const trips = [...H.flatMap(w => w.trips || []), ...S.week.trips].sort((a, b) => a.day - b.day);
  saveBytes(`carreira-ats-planilha-dia-${S.gameDay}.xlsx`, XL.write(templateRows({ profile: S.profile, company: companyOf(c) || { name: '' }, contract: c, trips, balance: balance(S), gameDay: S.gameDay, day1: S.settings.day1Weekday })));
}

// Lê e valida a planilha. Devolve { ok, errors[], data }
function parseCareerSheet(book) {
  const errors = [];
  const find = name => { const k = Object.keys(book).find(x => normTxt(x) === normTxt(name)); return k ? book[k] : null; };
  const mot = find('Motorista'), emp = find('Empresa'), via = find('Viagens');
  const missing = [['Motorista', mot], ['Empresa', emp], ['Viagens', via]].filter(x => !x[1]).map(x => x[0]);
  if (missing.length) return { ok: false, errors: [`Faltam as abas: ${missing.join(', ')}. Use o modelo do app, sem renomear as abas. Abas encontradas: ${Object.keys(book).join(', ') || 'nenhuma'}.`] };
  const kv = rows => { const m = {}; rows.slice(1).forEach(r => { if (r && r[0] !== '' && r[0] != null) m[normTxt(r[0])] = r[1]; }); return m; };
  const M = kv(mot), C = kv(emp), get = (m, f) => m[normTxt(f)];
  const num = (v, where, { req = false, int = false, min = null } = {}) => {
    const n = parseNum(v);
    if (n === null) { if (req) errors.push(`${where}: campo obrigatório vazio.`); return null; }
    if (isNaN(n)) { errors.push(`${where}: "${v}" não é um número.`); return null; }
    if (int && !Number.isInteger(n)) { errors.push(`${where}: use um número inteiro (recebido ${v}).`); return null; }
    if (min !== null && n < min) { errors.push(`${where}: o valor mínimo é ${min} (recebido ${v}).`); return null; }
    return n;
  };
  const balanceV = num(get(M, 'Saldo bancário atual (USD)'), 'Motorista › Saldo bancário atual (USD)', { req: true });
  const gameDay = num(get(M, 'Dia atual do jogo'), 'Motorista › Dia atual do jogo', { req: true, int: true, min: 1 });
  let day1 = 0; const d1 = get(M, 'Dia 1 do jogo é');
  if (d1 !== undefined && d1 !== '') { day1 = E.WEEKDAYS_FULL.findIndex(w => normTxt(w).startsWith(normTxt(d1).slice(0, 3))); if (day1 < 0) { errors.push(`Motorista › Dia 1 do jogo é: "${d1}" não é um dia da semana.`); day1 = 0; } }
  const coName = String(get(C, 'Nome da empresa') ?? '').trim();
  if (!coName) errors.push('Empresa › Nome da empresa: campo obrigatório vazio.');
  const clsRaw = normTxt(get(C, 'Classificação'));
  const clsKey = !clsRaw ? null : clsRaw.includes('frota') || clsRaw.includes('fleet') ? 'fleet' : clsRaw.includes('autoridade') || clsRaw.includes('mc') ? 'authority' : clsRaw.includes('lease') || clsRaw.includes('arrend') ? 'lease' : clsRaw.includes('owner') || clsRaw.includes('1099') ? 'owner' : clsRaw.includes('w-2') || clsRaw.includes('w2') || clsRaw.includes('company') || clsRaw.includes('empregado') ? 'w2' : null;
  if (!clsRaw) errors.push('Empresa › Classificação: campo obrigatório vazio. Use W-2, Lease, Owner-Operator, Autoridade própria ou Frota.');
  else if (!clsKey) errors.push(`Empresa › Classificação: "${get(C, 'Classificação')}" não é reconhecida. Use W-2, Lease, Owner-Operator, Autoridade própria ou Frota.`);
  const opRaw = normTxt(get(C, 'Operação'));
  const OPS = E.OPERATIONS;
  const operation = !opRaw || opRaw.startsWith('local') || opRaw.includes('day cab') ? OPS[0] : opRaw.startsWith('regional') ? OPS[1] : opRaw.startsWith('dedic') ? OPS[2] : opRaw.includes('otr') || opRaw.includes('long') || opRaw.includes('sleeper') ? OPS[3] : null;
  if (opRaw && !operation) errors.push(`Empresa › Operação: "${get(C, 'Operação')}" não é reconhecida. Use Local, Regional, Dedicated ou OTR.`);
  const payRaw = normTxt(get(C, 'Forma de pagamento'));
  const payMode = !payRaw ? null : payRaw.startsWith('fixo') || payRaw.includes('semanal') ? 'weekly' : payRaw.includes('hora') ? 'hourly' : payRaw.includes('milha') || payRaw.includes('cpm') ? 'cpm' : payRaw.includes('percent') || payRaw.includes('%') ? 'percent' : 'bad';
  if (payMode === 'bad') errors.push(`Empresa › Forma de pagamento: "${get(C, 'Forma de pagamento')}" não é reconhecida. Use Fixo semanal, Por hora, Por milha ou Percentual.`);
  const baseV = num(get(C, 'Valor base'), 'Empresa › Valor base', { min: 0 });
  const commV = num(get(C, 'Comissão (%)'), 'Empresa › Comissão (%)', { min: 0 });
  const startV = num(get(C, 'Início do contrato (dia)'), 'Empresa › Início do contrato (dia)', { int: true, min: 1 });

  const head = (via[0] || []).map(normTxt);
  const col = {}; SHEET_FMT.viagens.forEach(h => { const i = head.indexOf(normTxt(h)); if (i >= 0) col[h] = i; });
  const missCols = SHEET_FMT.required.filter(h => col[h] === undefined);
  if (missCols.length) errors.push(`Viagens: faltam as colunas obrigatórias ${missCols.map(x => `"${x}"`).join(', ')} na linha 1. Colunas encontradas: ${(via[0] || []).filter(Boolean).join(', ') || 'nenhuma'}.`);
  const trips = [];
  if (!missCols.length) {
    via.slice(1).forEach((r, i) => {
      const line = i + 2, cell = h => col[h] === undefined ? '' : r[col[h]];
      if (!r || r.every(v => v === '' || v == null)) return;
      const where = h => `Viagens › linha ${line} › ${h}`;
      const day = num(cell('Dia'), where('Dia'), { req: true, int: true, min: 1 });
      if (day !== null && gameDay && day > gameDay) errors.push(`${where('Dia')}: dia ${day} é depois do dia atual do jogo (${gameDay}).`);
      const vRaw = normTxt(cell('Veículo'));
      const type = vRaw.startsWith('caminh') || vRaw === 'truck' ? 'company' : vRaw.startsWith('carro') ? 'borrowed' : null;
      if (!type) errors.push(`${where('Veículo')}: "${cell('Veículo')}" não é válido. Use Caminhão, Carro emprestado ou Carro próprio.`);
      const carMode = vRaw.includes('propri') ? 'owned' : 'borrowed';
      const dest = String(cell('Destino') ?? '').trim(); if (!dest) errors.push(`${where('Destino')}: campo obrigatório vazio.`);
      const stRaw = String(cell('Status') ?? '').trim();
      const status = !stRaw ? 'Excelente' : E.STATUSES.find(x => normTxt(x) === normTxt(stRaw));
      if (stRaw && !status) errors.push(`${where('Status')}: "${stRaw}" não é válido. Use ${E.STATUSES.join(', ')}.`);
      const n = (h, int = false) => num(cell(h), where(h), { req: SHEET_FMT.required.includes(h), int, min: h === 'Bônus (USD)' ? null : 0 }) ?? 0;
      trips.push({ id: uid(), day: day || 1, type: type || 'company', carMode, origin: String(cell('Origem') ?? '').trim(), dest, status: status || 'Excelente',
        miles: n('Distância (mi)'), freight: n('Frete (USD)'), bonus: n('Bônus (USD)'), fuel: n('Combustível (USD)'), tolls: n('Pedágios (USD)'), fines: n('Multas (USD)'), damage: n('Danos (USD)'),
        breakfast: n('Cafés', true), lunch: n('Almoços', true), dinner: n('Jantas', true), hotel: n('Noites em hotel', true), drive: n('Horas de direção'), hours: n('Horas de serviço'),
        detention: 0, stops: 0, layover: 0, breakdown: 0, tarp: false, brk: false, away: false });
    });
  }
  if (!errors.length && !trips.length) errors.push('Viagens: nenhuma viagem encontrada a partir da linha 2.');
  return { ok: !errors.length, errors, data: { profile: { name: String(get(M, 'Nome do motorista') ?? '').trim(), nationality: String(get(M, 'Nacionalidade') ?? '').trim(), level: num(get(M, 'Nível no jogo'), 'x') || 1 },
    balance: balanceV, gameDay, day1, company: { name: coName, hq: String(get(C, 'Sede (cidade / estado)') ?? '').trim() }, clsKey, operation, payMode, baseV, commV, startV, trips } };
}

// Monta o estado completo do app a partir dos dados lidos (cálculos refeitos com as regras atuais)
function buildFromSheet(D) {
  const st = newCareer({ name: D.profile.name, nationality: D.profile.nationality, level: D.profile.level, company: D.company.name, hq: D.company.hq,
    clsKey: D.clsKey, operation: D.operation, gameDay: D.gameDay, day1: D.day1, startDay: D.startV || 1, billedThrough: D.gameDay });
  st.career.startDay = 1;
  const ct = activeContract(st);
  const k = ct.terms.contract;
  if (D.payMode) k.mode = D.payMode;
  if (D.baseV !== null && D.baseV !== undefined) { if (k.mode === 'weekly') k.weekly.value = D.baseV; else if (k.mode === 'hourly') k.hourly.rate = D.baseV; else if (k.mode === 'cpm') k.cpm.rate = D.baseV; else k.percent.commission = D.baseV; }
  if (D.commV !== null && D.commV !== undefined && (k.mode === 'weekly' || k.mode === 'hourly')) { k[k.mode].commissionOn = D.commV > 0; k[k.mode].commission = D.commV; }
  const eff = effSettings(st);
  const stamp = t => {
    const o = { ...t }; delete o.carMode;
    if (t.type === 'borrowed') o.car = E.carSnapshot(eff, t.carMode);
    else Object.assign(o, E.snapshotFor('company', eff), { rules: E.rulesSnapshot(eff), contractId: ct.id });
    return o;
  };
  const curStart = E.weekStartOf(D.gameDay, st.settings);
  const all = D.trips.map(stamp);
  st.week = { start: curStart, trips: all.filter(t => t.day >= curStart) };
  const byWeek = {};
  all.filter(t => t.day < curStart).forEach(t => { const w = E.weekStartOf(t.day, st.settings); (byWeek[w] = byWeek[w] || []).push(t); });
  const hist = Object.keys(byWeek).map(Number).sort((a, b) => a - b).map(start => {
    const trips = byWeek[start], d = E.dre(trips, eff), living = E.r2(d.variable.total + d.opCosts.total + d.fixed.total);
    const w = { id: 'w' + start + '-' + uid().slice(0, 4), start, end: start + 6, trips, dre: d, settings: clone(eff), closedDay: start + 7, contractId: ct.id };
    const payday = E.paydayFor(start, eff);
    const p = { id: uid(), weekStart: start, payday, amount: d.takeHome, status: 'pending', breakdown: { gross: d.revenue, ded: d.deductions.total, takeHome: d.takeHome, living, net: d.net, tax: d.taxType, safety: 0 } };
    st.payroll.push(p);
    st.ledger.push({ id: uid(), ref: 'living:' + p.id, day: Math.min(start + 7, D.gameDay), desc: `Despesas e custo de vida · semana ${weekLabel(start).toLowerCase()}`, amount: -living, locked: true });
    if (payday <= D.gameDay) payEntry(st, p, payday);
    trips.filter(t => t.type === 'borrowed').forEach(t => st.ledger.push({ id: uid(), ref: 'trip:' + t.id, day: t.day, desc: borrowedDesc(t), amount: E.borrowedValue(t, eff), locked: true }));
    return w;
  });
  syncBorrowedLedger(st);
  // saldo final = saldo informado na planilha
  st.bank.opening = E.r2(D.balance - st.ledger.reduce((a, e) => a + E.n(e.amount), 0));
  st.settings.cities = [...new Set([...st.settings.cities, ...all.flatMap(t => [t.origin, t.dest]).filter(Boolean)])];
  st._rev = Date.now();
  return { state: st, history: hist };
}

function importSheetFlow() {
  openModal(`<div class="row between"><h2>Importar planilha</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p style="margin:0;font-size:14px">Use a planilha no formato do app (.xlsx), com as abas <b>Motorista</b>, <b>Empresa</b> e <b>Viagens</b>. Se ainda não tem, baixe o modelo, preencha e volte aqui.</p>
    <div class="row"><button class="btn" data-tpl>Baixar modelo (.xlsx)</button></div>
    <div class="field"><div class="lab-row"><label for="sheetFile">Arquivo da planilha</label></div><input id="sheetFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
    <div id="sheetResult"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-imp disabled>Importar</button></div>`, sh => {
    let parsed = null;
    sh.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    sh.querySelector('[data-tpl]').onclick = downloadTemplate;
    const out = sh.querySelector('#sheetResult'), btn = sh.querySelector('[data-imp]');
    const fail = (title, list) => { parsed = null; btn.disabled = true; out.innerHTML = `<div class="banner" style="border-color:var(--red);background:var(--red-bg);flex-direction:column;align-items:flex-start;gap:6px"><b>${esc(title)}</b>${list.length ? `<ul style="margin:0;padding-left:18px;font-size:13px">${list.slice(0, 15).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${list.length > 15 ? `<span style="font-size:13px">E mais ${list.length - 15} problema(s).</span>` : ''}` : ''}<span class="muted" style="font-size:12.5px">Nada foi alterado. Corrija a planilha e selecione de novo, ou baixe o modelo para conferir o formato.</span></div>`; };
    sh.querySelector('#sheetFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      out.innerHTML = '<p class="muted" style="margin:0">Lendo a planilha…</p>';
      let book;
      try { book = await XL.read(await f.arrayBuffer()); }
      catch (err) { return fail('Falha ao ler o arquivo', [`"${f.name}" não é uma planilha .xlsx válida. Salve no Excel ou Google Planilhas como "Pasta de trabalho do Excel (.xlsx)" e tente de novo.`]); }
      const r = parseCareerSheet(book);
      if (!r.ok) return fail(`Falha na conversão: ${r.errors.length} problema${r.errors.length === 1 ? '' : 's'} encontrado${r.errors.length === 1 ? '' : 's'}`, r.errors);
      parsed = r.data;
      const curStart = E.weekStartOf(parsed.gameDay, { day1Weekday: parsed.day1 });
      const nCur = parsed.trips.filter(t => t.day >= curStart).length, weeks = new Set(parsed.trips.filter(t => t.day < curStart).map(t => E.weekStartOf(t.day, { day1Weekday: parsed.day1 }))).size;
      out.innerHTML = `<div class="banner" style="border-color:var(--ok);background:var(--ok-bg);flex-direction:column;align-items:flex-start;gap:4px"><b>Planilha válida</b><span style="font-size:13.5px">${esc(parsed.profile.name || 'Motorista sem nome')} · ${esc(parsed.company.name)} · ${esc(E.PRESETS[parsed.clsKey])}<br>Dia atual ${parsed.gameDay} · saldo ${fmt(parsed.balance)}<br>${parsed.trips.length} viagens: ${nCur} na semana em aberto e ${parsed.trips.length - nCur} em ${weeks} semana${weeks === 1 ? '' : 's'} anterior${weeks === 1 ? '' : 'es'} (ficam no Histórico, já pagas)</span><span class="muted" style="font-size:12.5px">Importar substitui todos os dados atuais. Salário, impostos e despesas são recalculados com as regras do app.</span></div>`;
      btn.disabled = false;
    };
    btn.onclick = () => {
      if (!parsed) return;
      try { const r = buildFromSheet(parsed); closeModal(); replaceAll(r.state, r.history); tab = 'painel'; render(); toast('Planilha importada'); }
      catch (err) { fail('Falha ao montar os dados', [String(err && err.message || err)]); }
    };
  });
}
