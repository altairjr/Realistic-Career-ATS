/* ---------- Importar / exportar planilha no modelo "Carreira Realista ATS" ----------
   O modelo é a planilha original da carreira, com 9 abas. O app lê e escreve exatamente esse desenho:
     Config                 custos de refeição, hotel, moradia e % do carro emprestado
     Parametros             lista de cidades
     Motorista & Carreira   motorista, saldo, empréstimo, contrato e empresa
     Diário de bordo        viagens de caminhão da semana em aberto
     Dashboard & DRE        fórmulas da planilha (o app só preenche o pay lag)
     Histórioco holerite    holerites pagos e a pagar
     Historico de fretes    viagens de caminhão das semanas fechadas, com "Final de semana" entre elas
     Diário de bordo carro  todas as viagens de carro
     Dashboard carro        fórmulas da planilha, uma linha por viagem de carro
   A exportação parte do modelo embutido (61-sheet-model.js) e troca só as células de dados. */
const SM = {
  config: 'Config', params: 'Parametros', driver: 'Motorista & Carreira', diary: 'Diário de bordo', dre: 'Dashboard & DRE',
  pay: 'Histórioco holerite', hist: 'Historico de fretes', car: 'Diário de bordo carro', carDre: 'Dashboard carro',
  first: 5,          // primeira linha de dados das tabelas
  minRows: 20,       // linhas já formatadas que o diário leva, mesmo vazio
  weekend: 'Final de semana',
  // opções das listas da planilha ↔ valores do app
  cls: { w2: 'Nivel 1: Company Driver (Empregado W-2)', owner: 'Nível 2: Owner-Operator Lease-On (Agregado - 1099)', authority: 'Nível 3: Independent Owner-Operator (Autônomo com Autoridade Própria)' },
  pay_: { weekly: 'Pagamento fixo semanal', hourly: 'Valor por Hora', cpm: 'Por distância percorrida', percent: 'Percentual do frete' },
  opLocal: 'Local/Dedicated', opOtr: 'OTR (Over the Road)',
  carOwned: 'Carro próprio', carBorrowed: 'Carro Emprestado',
  truckPh: 'Modelo do caminhão', trailerPh: 'Modelo do trailer',
  commissionF: '5% + INT((C5 - 1) / 2) * 1%',
  diaryCols: ['Dia do jogo', 'Origem', 'Destino', 'Status da Entrega', 'Distância (mi)', 'Frete Bruto (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Cafés Da Manhã', 'Almoços', 'Janta', 'Diárias', 'Multas / Danos (USD)'],
  carCols: ['ID Viagem', 'Dia do jogo', 'Origem', 'Destino', 'Tipo do trabalho', 'Status da Entrega', 'Distância (mi)', 'Frete Bruto (USD)', 'Bonus (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Cafés Da Manhã', 'Almoços', 'Janta', 'Diárias', 'Multas / Danos (USD)'],
  required: ['Dia do jogo', 'Destino', 'Distância (mi)', 'Frete Bruto (USD)']
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
// Percentuais vêm como fração (0,05) ou como texto ("5%"); o app guarda em pontos (5)
function parsePct(v) {
  if (typeof v === 'string' && v.includes('%')) return parseNum(v.replace('%', ''));
  const n = parseNum(v); return n === null || isNaN(n) ? n : Math.abs(n) <= 1 ? E.r2(n * 100) : n;
}

/* ---------- Leitura: planilha → dados ---------- */
// Lê e valida a planilha. Devolve { ok, errors[], data }
function parseCareerSheet(book) {
  const errors = [];
  const find = name => { const k = Object.keys(book).find(x => normTxt(x) === normTxt(name)); return k ? book[k] : null; };
  const drv = find(SM.driver), diary = find(SM.diary);
  const missing = [[SM.driver, drv], [SM.diary, diary]].filter(x => !x[1]).map(x => `"${x[0]}"`);
  if (missing.length) return { ok: false, errors: [`Faltam as abas ${missing.join(' e ')}. Use a planilha no modelo Carreira Realista ATS, sem renomear as abas. Abas encontradas: ${Object.keys(book).join(', ') || 'nenhuma'}.`] };
  const num = (v, where, { req = false, int = false, min = null, pct = false } = {}) => {
    const n = pct ? parsePct(v) : parseNum(v);
    if (n === null) { if (req) errors.push(`${where}: campo obrigatório vazio.`); return null; }
    if (isNaN(n)) { errors.push(`${where}: "${v}" não é um número.`); return null; }
    if (int && !Number.isInteger(n)) { errors.push(`${where}: use um número inteiro (recebido ${v}).`); return null; }
    if (min !== null && n < min) { errors.push(`${where}: o valor mínimo é ${min} (recebido ${v}).`); return null; }
    return n;
  };
  const txt = v => String(v ?? '').trim();

  /* Motorista & Carreira: cada título tem o valor na célula logo abaixo */
  const below = {};
  drv.forEach((row, r) => (row || []).forEach((cell, c) => { const k = normTxt(cell); if (k && typeof cell === 'string' && !(k in below)) below[k] = { v: (drv[r + 1] || [])[c], ref: XL.colName(c) + (r + 2) }; }));
  const F = label => below[normTxt(label)] || null;
  const val = label => { const f = F(label); return f ? f.v : undefined; };
  const at = label => `${SM.driver} › ${label}${F(label) ? ` (${F(label).ref})` : ''}`;
  for (const label of ['Nome Do Motorista', 'Saldo Bancario (USD)', 'Classificação do Vínculo', 'Nome da Empresa'])
    if (!F(label)) errors.push(`${SM.driver}: não achei o título "${label}". Os títulos do modelo não podem ser alterados.`);
  const balanceV = F('Saldo Bancario (USD)') ? num(val('Saldo Bancario (USD)'), at('Saldo Bancario (USD)'), { req: true }) : null;
  const level = num(val('Capacitação (Nivel do Motorista no Jogo)'), at('Capacitação (Nivel do Motorista no Jogo)'), { int: true, min: 1 }) || 1;
  const loanTotal = num(val('Emprestimo Total / Parcelas (USD)'), at('Emprestimo Total / Parcelas (USD)'), { min: 0 }) || 0;
  const loanInst = num(val('Emprestimo Parcelas (USD)'), at('Emprestimo Parcelas (USD)'), { min: 0 }) || 0;
  const coName = txt(val('Nome da Empresa'));
  if (F('Nome da Empresa') && !coName) errors.push(`${at('Nome da Empresa')}: campo obrigatório vazio.`);
  const clsRaw = normTxt(val('Classificação do Vínculo'));
  const clsKey = !clsRaw ? null : clsRaw.includes('frota') || clsRaw.includes('fleet') ? 'fleet' : clsRaw.includes('autoridade') || clsRaw.includes('independent') || clsRaw.includes('mc/dot') ? 'authority'
    : clsRaw.includes('lease operator') || clsRaw.includes('arrendat') ? 'lease' : clsRaw.includes('owner') || clsRaw.includes('1099') || clsRaw.includes('agregado') ? 'owner'
    : clsRaw.includes('w-2') || clsRaw.includes('w2') || clsRaw.includes('company') || clsRaw.includes('empregado') ? 'w2' : null;
  if (F('Classificação do Vínculo') && !clsRaw) errors.push(`${at('Classificação do Vínculo')}: campo obrigatório vazio. Escolha uma opção da lista.`);
  else if (clsRaw && !clsKey) errors.push(`${at('Classificação do Vínculo')}: "${val('Classificação do Vínculo')}" não é reconhecida. Escolha uma opção da lista.`);
  const opRaw = normTxt(val('Especificações da Operação')), OPS = E.OPERATIONS;
  const operation = !opRaw || opRaw.startsWith('local') || opRaw.includes('day cab') ? OPS[0] : opRaw.startsWith('regional') ? OPS[1] : opRaw.startsWith('dedic') ? OPS[2] : opRaw.includes('otr') || opRaw.includes('long') || opRaw.includes('sleeper') ? OPS[3] : null;
  if (opRaw && !operation) errors.push(`${at('Especificações da Operação')}: "${val('Especificações da Operação')}" não é reconhecida. Use ${SM.opLocal} ou ${SM.opOtr}.`);
  const payRaw = normTxt(val('Forma de Pagamento'));
  const payMode = !payRaw ? null : payRaw.includes('fixo') || payRaw.includes('semanal') ? 'weekly' : payRaw.includes('hora') ? 'hourly' : payRaw.includes('distancia') || payRaw.includes('milha') || payRaw.includes('cpm') ? 'cpm' : payRaw.includes('percent') || payRaw.includes('%') ? 'percent' : 'bad';
  if (payMode === 'bad') errors.push(`${at('Forma de Pagamento')}: "${val('Forma de Pagamento')}" não é reconhecida. Escolha uma opção da lista.`);
  const baseV = num(val('Valor (USD)'), at('Valor (USD)'), { min: 0 });
  const commV = num(val('Comissão'), at('Comissão'), { min: 0, pct: true });
  const hours = num(val('Horas de Trabalho Contratual (Horas por Semanal)'), at('Horas de Trabalho Contratual (Horas por Semanal)'), { min: 0 });
  const renomeLevel = num(val('Renome na Empresa'), at('Renome na Empresa'), { int: true, min: 1 }) || 1;
  const renomePct = num(val('Bonus Por Renome'), at('Bonus Por Renome'), { min: 0, pct: true }) || 0;
  const model = (v, ph) => normTxt(v) === normTxt(ph) ? '' : txt(v);

  /* Config e Parametros (opcionais): custos e cidades */
  const cfg = find(SM.config), costs = {}; let borrowedPct = null;
  if (cfg) {
    const row = key => cfg.find(r => r && normTxt(r[0]).includes(key));
    const cost = (key, name, label) => { const r = row(key); if (!r) return; const n = num(r[1], `${SM.config} › ${label}`, { min: 0 }); if (n !== null) costs[name] = n; };
    cost('cafe da manha', 'breakfast', 'Alimentação - Café da Manhã'); cost('almoco', 'lunch', 'Alimentação - Almoço'); cost('jantar', 'dinner', 'Alimentação - Jantar');
    cost('pernoite', 'hotel', 'Diária de Pernoite / Hotel'); cost('moradia', 'housing', 'Moradia / Custo de Vida Fixo');
    const b = row('carro emprestado'); if (b) borrowedPct = num(b[1], `${SM.config} › Porcentagem comissão frete carro emprestado`, { min: 0, pct: true });
  }
  const par = find(SM.params), cities = par ? [...new Set(par.slice(1).map(r => txt(r && r[0])).filter(Boolean))] : [];

  /* Histórioco holerite (opcional): diz quais semanas já foram pagas */
  const payRows = find(SM.pay), pays = [];
  if (payRows) {
    const hr = payRows.findIndex(r => r && r.some(c => normTxt(c) === 'status pagamento'));
    if (hr >= 0) {
      const head = payRows[hr].map(normTxt), ci = k => head.findIndex(h => h.includes(k)), cRef = ci('semana trabalhada'), cSt = ci('status pagamento'), cPaid = ci('dia do pagamento');
      payRows.slice(hr + 1).forEach(r => {
        const ref = r && cRef >= 0 ? String(r[cRef] ?? '').match(/\d+/) : null, stt = normTxt(r && r[cSt]); if (!ref || !stt) return;
        const pd = cPaid >= 0 ? parseNum(r[cPaid]) : null;
        pays.push({ day: +ref[0], paid: stt === 'pago', paidDay: pd && !isNaN(pd) ? pd : null });
      });
    }
  }

  /* Tabelas de viagens: colunas achadas pelo título, em qualquer ordem */
  const readTrips = (name, rows, cols, car) => {
    const out = []; if (!rows) return out;
    const hr = rows.findIndex(r => r && r.some(c => normTxt(c) === 'dia do jogo'));
    if (hr < 0) { errors.push(`${name}: não achei a linha de títulos (com "Dia do jogo").`); return out; }
    const head = rows[hr].map(normTxt), col = {};
    cols.forEach(h => { const i = head.indexOf(normTxt(h)); if (i >= 0) col[h] = i; });
    const miss = SM.required.filter(h => col[h] === undefined);
    if (miss.length) { errors.push(`${name}: faltam as colunas ${miss.map(x => `"${x}"`).join(', ')} na linha ${hr + 1}. Colunas encontradas: ${rows[hr].filter(Boolean).join(', ') || 'nenhuma'}.`); return out; }
    rows.slice(hr + 1).forEach((r, i) => {
      const line = hr + 2 + i, cell = h => col[h] === undefined || !r ? '' : r[col[h]];
      const filled = h => { const v = cell(h); return v !== '' && v != null; };
      if (!r || !['Dia do jogo', 'Destino', 'Distância (mi)', 'Frete Bruto (USD)'].some(filled)) return;        // linha vazia
      if (typeof cell('Dia do jogo') === 'string' && isNaN(parseNum(cell('Dia do jogo'))) && !filled('Frete Bruto (USD)')) return;   // "Final de semana" e outras anotações
      const where = h => `${name} › linha ${line} › ${h}`;
      const day = num(cell('Dia do jogo'), where('Dia do jogo'), { req: true, int: true, min: 1 });
      const dest = txt(cell('Destino')); if (!dest) errors.push(`${where('Destino')}: campo obrigatório vazio.`);
      const stRaw = txt(cell('Status da Entrega')), stN = normTxt(stRaw);
      const status = !stRaw ? 'Excelente' : E.STATUSES.find(x => normTxt(x) === stN) || E.STATUS_OLD[Object.keys(E.STATUS_OLD).find(k => normTxt(k) === stN)];
      if (stRaw && !status) errors.push(`${where('Status da Entrega')}: "${stRaw}" não é válido. Use ${E.STATUSES.join(', ')}.`);
      const tRaw = normTxt(cell('Tipo do trabalho'));
      if (car && tRaw && !tRaw.includes('carro')) errors.push(`${where('Tipo do trabalho')}: "${cell('Tipo do trabalho')}" não é válido. Use ${SM.carBorrowed} ou ${SM.carOwned}.`);
      const n = (h, int = false) => num(cell(h), where(h), { req: SM.required.includes(h), int, min: h === 'Bonus (USD)' ? null : 0 }) ?? 0;
      out.push({ id: uid(), day: day || 1, type: car ? 'borrowed' : 'company', carMode: tRaw.includes('propri') ? 'owned' : 'borrowed', origin: txt(cell('Origem')), dest, status: status || 'Excelente',
        miles: n('Distância (mi)'), freight: n('Frete Bruto (USD)'), bonus: car ? n('Bonus (USD)') : 0, fuel: n('Combustível (USD)'), tolls: n('Pedágios (USD)'), fines: n('Multas / Danos (USD)'), damage: 0,
        breakfast: n('Cafés Da Manhã', true), lunch: n('Almoços', true), dinner: n('Janta', true), hotel: n('Diárias', true), drive: 0, hours: 0,
        detention: 0, stops: 0, layover: 0, breakdown: 0, tarp: false, brk: false, away: false });
    });
    return out;
  };
  const open = readTrips(SM.diary, diary, SM.diaryCols, false), past = readTrips(SM.hist, find(SM.hist), SM.diaryCols, false), cars = readTrips(SM.car, find(SM.car), SM.carCols, true);
  // Uma viagem repetida no diário e no histórico de fretes entra uma vez só
  const key = t => [t.day, t.origin, t.dest, t.miles, t.freight].join('|'), seen = new Map();
  open.forEach(t => seen.set(key(t), (seen.get(key(t)) || 0) + 1));
  const trips = [...open, ...past.filter(t => { const k = key(t), c = seen.get(k) || 0; if (c > 0) { seen.set(k, c - 1); return false; } return true; }), ...cars].sort((a, b) => a.day - b.day);
  // A planilha não guarda o dia atual: vale o dia da última viagem lançada
  const gameDay = trips.length ? Math.max(...trips.map(t => t.day)) : 1;

  return { ok: !errors.length, errors, data: {
    profile: { name: txt(val('Nome Do Motorista')), nationality: txt(val('Nacionalidade')), level },
    balance: balanceV, gameDay, day1: 0, company: { name: coName, hq: txt(val('Garagem Sede / Estado / País')) }, clsKey, operation, payMode, baseV, commV, startV: 1, trips,
    extras: { costs, borrowedPct, cities, pays, loanTotal, loanInst, hours, renomeLevel, renomePct, truck: model(val('Caminhão Fixo (Emprestado)'), SM.truckPh), trailer: model(val('Trailer Fixo (Emprestado)'), SM.trailerPh) } } };
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
  if (k.mode === 'percent' && D.commV > 0 && !D.baseV) k.percent.commission = D.commV;
  if (D.commV !== null && D.commV !== undefined && (k.mode === 'weekly' || k.mode === 'hourly')) { k[k.mode].commissionOn = D.commV > 0; k[k.mode].commission = D.commV; }
  const X = D.extras || {};
  Object.keys(X.costs || {}).forEach(c => { st.settings.costs[c].val = X.costs[c]; });
  if (X.borrowedPct !== null && X.borrowedPct !== undefined) st.settings.borrowed.pct = X.borrowedPct;
  if (X.hours) k.hours = X.hours;
  ct.renomeLevel = X.renomeLevel || 1; ct.truck = X.truck || ''; ct.trailer = X.trailer || '';
  if (X.renomePct > 0) ct.terms.renome = { on: true, perLevel: E.r2(X.renomePct / ct.renomeLevel) };
  if (X.loanTotal > 0) { st.bank.loanTotal = X.loanTotal; st.settings.loan.on = X.loanInst > 0; st.settings.loan.installment = X.loanInst || 0; st.career.loanNext = D.gameDay + loanPeriod(st.settings); }
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
    // a aba de holerites da planilha manda; sem linha para a semana, vale o calendário do pay lag
    const hp = (X.pays || []).find(x => x.day >= start && x.day <= start + 6);
    if (hp ? hp.paid : payday <= D.gameDay) payEntry(st, p, Math.min(D.gameDay, hp && hp.paidDay ? hp.paidDay : payday));
    trips.filter(t => t.type === 'borrowed').forEach(t => st.ledger.push({ id: uid(), ref: 'trip:' + t.id, day: t.day, desc: borrowedDesc(t), amount: E.borrowedValue(t, eff), locked: true }));
    return w;
  });
  syncBorrowedLedger(st);
  // saldo final = saldo informado na planilha
  st.bank.opening = E.r2(D.balance - st.ledger.reduce((a, e) => a + E.n(e.amount), 0));
  if (X.cities && X.cities.length) st.settings.cities = X.cities.slice();
  st.settings.cities = [...new Set([...st.settings.cities, ...all.flatMap(t => [t.origin, t.dest]).filter(Boolean)])];
  st._rev = Date.now();
  return { state: st, history: hist };
}

/* ---------- Escrita: dados → planilha no modelo ---------- */
// Monta o arquivo .xlsx. Sem estado (st = null), devolve o modelo vazio para preencher à mão.
async function buildSheetFile(st, hist) {
  const book = await XL.open(XL.b64(SHEET_MODEL_B64));
  const eff = st ? effSettings(st) : E.defaults(), ct = st ? activeContract(st) : null, co = ct ? companyOf(ct, st) : null;
  const ed = {}; for (const k of ['config', 'params', 'driver', 'diary', 'dre', 'pay', 'hist', 'car', 'carDre']) ed[k] = XL.sheetEdit(book.files.get(book.sheets[SM[k]]));
  const F = SM.first, status = s => { const x = E.STATUS_OLD[s] || s || 'Excelente'; return x === 'Razoável' ? 'Razoável ' : x; };   // a lista da planilha traz "Razoável " com espaço
  const all = st ? [...(hist || []).flatMap(w => w.trips || []), ...st.week.trips] : [];
  const byDay = (a, b) => a.day - b.day;

  /* Config e Parametros */
  const c = eff.costs;
  ed.config.set('B7', E.n(c.breakfast.val)).set('B8', E.n(c.lunch.val)).set('B9', E.n(c.dinner.val)).set('B10', E.n(c.hotel.val)).set('B11', E.n(c.housing.val)).set('B12', E.r2(E.n(eff.borrowed.pct)) / 100);
  const cities = (st ? st.settings.cities : eff.cities) || [], cityStyle = ed.params.style('A2');
  ed.params.dropFrom(2).set('B1', cities[0] || '');
  cities.forEach((x, i) => ed.params.set('A' + (2 + i), x, cityStyle));

  /* Motorista & Carreira */
  if (st) {
    const k = ct.terms.contract, M = k[k.mode], P = st.profile;
    const clsKey = E.presetKeyFor(ct.classification), op = ct.operation || '';
    const comm = k.mode === 'percent' ? E.n(M.commission) : M.commissionOn ? E.n(M.commission) : 0;
    const byLevel = 5 + Math.floor((Math.max(1, E.n(P.level)) - 1) / 2);
    ed.driver.set('A5', P.name || '').set('B5', P.nationality || '').set('C5', Math.max(1, E.n(P.level) || 1)).set('D5', balance(st)).set('E5', E.n(st.bank.loanTotal)).set('F5', st.settings.loan.on ? E.n(st.settings.loan.installment) : 0)
      .set('A7', SM.cls[clsKey] || ct.classification).set('B7', SM.pay_[k.mode]).set('C7', opIsOtr(op) ? SM.opOtr : /^(local|dedic)/i.test(op) ? SM.opLocal : op)
      .set('D7', E.n(k.hours)).set('E7', k.mode === 'weekly' ? E.n(M.value) : k.mode === 'percent' ? 0 : E.n(M.rate)).set('F7', k.mode !== 'percent' && comm === byLevel ? { f: SM.commissionF } : comm / 100)
      .set('A9', co ? co.name || '' : '').set('B9', co ? co.hq || '' : '').set('C9', Math.max(1, E.n(ct.renomeLevel) || 1)).set('D9', E.r2(E.n(eff.renome.on ? eff.renome.pct : 0)) / 100)
      .set('E9', ct.truck || SM.truckPh).set('F9', ct.trailer || SM.trailerPh);
  } else ed.driver.set('C5', 1).set('D5', 0).set('E5', 0).set('F5', 0).set('D7', 50).set('F7', { f: SM.commissionF }).set('C9', 1).set('D9', 0).set('E9', SM.truckPh).set('F9', SM.trailerPh);

  /* Tabelas de viagens: cada linha copia o estilo da linha-modelo */
  const fill = (e, proto, r, vals) => { if (r !== proto) e.cloneRow(proto, r); vals.forEach((v, i) => e.set(XL.colName(i) + r, v)); };
  const truckRow = t => [t.day, t.origin || '', t.dest || '', status(t.status), E.n(t.miles), E.n(t.freight), E.n(t.fuel), E.n(t.tolls), E.n(t.breakfast), E.n(t.lunch), E.n(t.dinner), E.n(t.hotel), E.r2(E.n(t.fines) + E.n(t.damage))];
  // Diário de bordo: caminhão, semana em aberto
  const open = (st ? st.week.trips : []).filter(t => t.type !== 'borrowed').sort(byDay);
  const lastDiary = F + Math.max(open.length, SM.minRows) - 1;
  for (let r = F + 1; r <= lastDiary; r++) ed.diary.cloneRow(F, r);
  open.forEach((t, i) => fill(ed.diary, F, F + i, [...truckRow(t), 'Aberto']));
  ed.diary.extendValidations(F, Math.max(lastDiary, 1003));
  // Histórico de fretes: semanas fechadas, com duas linhas mescladas "Final de semana" depois de cada uma
  const weeks = (hist || []).slice().sort((a, b) => a.start - b.start).map(w => (w.trips || []).filter(t => t.type !== 'borrowed').sort(byDay)).filter(w => w.length);
  const sepStyle = ed.hist.style('A11'), merges = []; let hr = F;
  ed.hist.cloneRow(11, 9001).cloneRow(12, 9002).dropFrom(F + 1, 9000);   // guarda os modelos do separador fora da área usada
  weeks.forEach(w => {
    w.forEach(t => fill(ed.hist, F, hr++, truckRow(t)));
    ed.hist.cloneRow(9001, hr).cloneRow(9002, hr + 1).set('A' + hr, SM.weekend, sepStyle); merges.push(`A${hr}:M${hr + 1}`); hr += 2;
  });
  ed.hist.dropFrom(9001);
  if (merges.length) ed.hist.tail(t => `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` + t);
  ed.hist.extendValidations(F, Math.max(hr, 1000));
  // Diário de bordo carro e Dashboard carro: todas as viagens de carro, uma fórmula por linha
  const cars = all.filter(t => t.type === 'borrowed').sort(byDay);
  const lastCar = F + Math.max(cars.length, SM.minRows) - 1;
  for (let r = F + 1; r <= lastCar; r++) ed.car.cloneRow(F, r);
  cars.forEach((t, i) => fill(ed.car, F, F + i, [i + 1, t.day, t.origin || '', t.dest || '', t.car && t.car.mode === 'owned' ? SM.carOwned : SM.carBorrowed, status(t.status), E.n(t.miles), E.n(t.freight), E.n(t.bonus), E.n(t.fuel), E.n(t.tolls), E.n(t.breakfast), E.n(t.lunch), E.n(t.dinner), E.n(t.hotel), E.r2(E.n(t.fines) + E.n(t.damage))]));
  ed.car.extendValidations(F, Math.max(lastCar, 1000));
  const q = `'${SM.car}'!`, dStyle = 'ABCDEFGHIJKL'.split('').map(x => ed.carDre.style(x + F));
  cars.forEach((t, i) => {
    const r = F + i;
    [`${q}A${r}`, `${q}H${r}`, `${q}I${r}`, `SUM(${q}J${r})`, `SUM(${q}K${r})`, `SUM(${q}L${r}) * (Config!$B$7)`, `SUM(${q}M${r}) * (Config!$B$8)`, `SUM(${q}N${r}) * (Config!$B$9)`, `SUM(${q}O${r}) * (Config!$B$10)`, `${q}P${r}`, `${q}E${r}`,
      `IF(K${r}="${SM.carBorrowed}", (B${r}) * SUM(Config!$B$12)) -J${r}-I${r}-H${r}-G${r}-F${r}-E${r}-D${r}+C${r}`].forEach((f, ci) => ed.carDre.set(XL.colName(ci) + r, { f }, dStyle[ci]));
  });
  ed.carDre.extendValidations(F, Math.max(lastCar, 1000));

  /* Holerites e pay lag */
  const pays = st ? st.payroll.slice().sort((a, b) => a.weekStart - b.weekStart) : [];
  pays.forEach((p, i) => {
    const r = F + i, w = (hist || []).find(x => x.start === p.weekStart), wt = w ? (w.trips || []).filter(t => t.type !== 'borrowed') : [], days = wt.length ? wt.map(t => t.day) : null;
    fill(ed.pay, F, r, [p.payday, p.status === 'paid' ? E.n(p.paidDay) || p.payday : '', days ? `${Math.min(...days)} - ${Math.max(...days)}` : `${p.weekStart} - ${p.weekStart + 6}`, E.r2(p.amount), p.status === 'paid' ? 'Pago' : 'A pagar',
      { f: `IF(E${r}="A pagar", D${r} + '${SM.driver}'!$D$5, IF(E${r}="Pago", "Conta paga", ""))` }]);
  });
  if (!pays.length) ed.pay.set('F' + F, { f: `IF(E${F}="A pagar", D${F} + '${SM.driver}'!$D$5, IF(E${F}="Pago", "Conta paga", ""))` });
  ed.pay.extendValidations(F, Math.max(F + pays.length, 1000));
  ed.dre.set('B21', st ? pendingPay(st) : 0);

  for (const k of Object.keys(ed)) book.files.set(book.sheets[SM[k]], ed[k].xml());
  return XL.save(book.files);
}
async function downloadTemplate() { try { await saveBytes('Carreira Realista ATS - modelo.xlsx', await buildSheetFile(null, [])); } catch (e) { toast('Não foi possível gerar a planilha neste navegador.'); } }
async function exportSheet() { try { await saveBytes(`Carreira Realista ATS - dia ${S.gameDay}.xlsx`, await buildSheetFile(S, H)); } catch (e) { toast('Não foi possível gerar a planilha neste navegador.'); } }

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

function importSheetFlow() {
  openModal(`<div class="row between"><h2>Importar planilha</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p style="margin:0;font-size:14px">Use a planilha <b>Carreira Realista ATS</b> (.xlsx), no modelo original com as abas <b>Motorista &amp; Carreira</b>, <b>Diário de bordo</b>, <b>Historico de fretes</b> e <b>Diário de bordo carro</b>. Se ainda não tem, baixe o modelo, preencha e volte aqui.</p>
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
      out.innerHTML = `<div class="banner" style="border-color:var(--ok);background:var(--ok-bg);flex-direction:column;align-items:flex-start;gap:4px"><b>Planilha válida</b><span style="font-size:13.5px">${esc(parsed.profile.name || 'Motorista sem nome')} · ${esc(parsed.company.name)} · ${esc(E.PRESETS[parsed.clsKey])}<br>Dia atual ${parsed.gameDay} (o da última viagem) · saldo ${fmt(parsed.balance)}<br>${parsed.trips.length} viagens: ${nCur} na semana em aberto e ${parsed.trips.length - nCur} em ${weeks} semana${weeks === 1 ? '' : 's'} anterior${weeks === 1 ? '' : 'es'} (ficam no Histórico, já pagas)</span><span class="muted" style="font-size:12.5px">Importar substitui todos os dados atuais. Salário, impostos e despesas são recalculados com as regras do app.</span></div>`;
      btn.disabled = false;
    };
    btn.onclick = () => {
      if (!parsed) return;
      try { const r = buildFromSheet(parsed); closeModal(); replaceAll(r.state, r.history); tab = 'painel'; render(); toast('Planilha importada'); }
      catch (err) { fail('Falha ao montar os dados', [String(err && err.message || err)]); }
    };
  });
}
