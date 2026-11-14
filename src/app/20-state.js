/* ---------- Estado: carreira, empresas e contratos ---------- */
const SCHEMA = 3;                 // versão do formato dos dados salvos (ver docs/esquema-de-dados.md)
const KEEP_DAYS = 84;             // extrato, holerites e infrações ficam 12 semanas no documento principal
const CLASSIFICATIONS = E.CLASSIFICATIONS;
const PRESET_KEYS = ['w2', 'lease', 'owner', 'authority', 'fleet'];
const TERM_KEYS = ['contract', 'expenses', 'benefits', 'perDiem', 'opCosts', 'safety', 'renome'];   // vivem no contrato, não nos ajustes
const taxTypeFor = E.taxTypeFor;
const opIsLocal = op => /local|day cab/i.test(op || '');
const opIsOtr = op => /otr|sleeper|long haul|longa/i.test(op || '');
// Nomes de operação de versões antigas → padrão americano
const OP_RENAME = { 'Local/Dedicated': 'Local (Day Cab)', 'Local / Regional (Day Cab)': 'Regional', 'OTR / Longa Distância (Sleeper Cab)': 'OTR / Long Haul (Sleeper Cab)' };

function normTerms(tm) {
  const m = E.mergeDefaults({ contract: tm.contract, expenses: tm.expenses, benefits: tm.benefits, perDiem: tm.perDiem, opCosts: tm.opCosts, safety: tm.safety });
  const r = tm.renome || {};
  return { contract: m.contract, expenses: m.expenses, benefits: m.benefits, perDiem: m.perDiem, opCosts: m.opCosts, safety: m.safety,
    renome: { on: !!r.on, perLevel: E.n(r.perLevel ?? r.pct) } };
}
// Condições padrão de uma classificação. Com `base`, parte das condições atuais do contrato.
function presetTermsFor(key, base, otr = false) {
  const d = E.defaults(), src = base || d;
  const t = clone({ contract: src.contract, expenses: src.expenses, benefits: src.benefits, perDiem: src.perDiem, opCosts: src.opCosts, safety: src.safety });
  E.applyPreset(t, key, { otr });
  return normTerms({ ...t, renome: base ? base.renome : { on: false, perLevel: 0 } });
}
const activeContract = (st = S) => st.contracts.find(c => c.id === st.currentContractId) || st.contracts[st.contracts.length - 1];
const companyOf = (c, st = S) => st.companies.find(x => x.id === (c && c.companyId));
const companyName = (c, st = S) => (companyOf(c, st) || {}).name || 'Sem empresa';

// Regras efetivas = ajustes gerais + condições do contrato ativo. O tipo fiscal sai da classificação.
function effSettings(st = S) {
  const c = activeContract(st), T = c.terms, G = st.settings;
  return { ...G,
    contract: { ...T.contract, tripBonus: G.tripBonus !== false },
    expenses: T.expenses, benefits: T.benefits, perDiem: T.perDiem, opCosts: T.opCosts, safety: T.safety,
    renome: { on: !!T.renome.on, pct: E.n(T.renome.perLevel) * Math.max(1, E.n(c.renomeLevel) || 1) },
    taxes: { ...G.taxes, on: true, type: taxTypeFor(c.classification) }
  };
}
const SS = () => effSettings(S);

// Cria uma carreira nova: um motorista, uma empresa e um contrato com as condições padrão do vínculo
function newCareer(o = {}) {
  const settings = E.defaults();
  if (o.day1 != null) settings.day1Weekday = o.day1;
  const coId = uid(), ctId = uid(), key = PRESET_KEYS.includes(o.clsKey) ? o.clsKey : 'w2';
  const operation = o.operation || E.OPERATIONS[0], gameDay = Math.max(1, parseInt(o.gameDay) || 1);
  return normalize({ v: SCHEMA, settings, gameDay,
    profile: { name: o.name || '', nationality: o.nationality || '', level: o.level || 1, experience: 'grad', visa: 'unset' },
    bank: { opening: E.r2(o.opening || 0), archived: 0, loanTotal: 0 },
    companies: [{ id: coId, name: o.company || 'Empresa contratante', hq: o.hq || '', dot: '', notes: '' }],
    contracts: [{ id: ctId, companyId: coId, classification: CLASSIFICATIONS[PRESET_KEYS.indexOf(key)], operation, startDay: o.startDay || 1, endDay: null,
      truck: '', trailer: '', renomeLevel: 1, terms: presetTermsFor(key, null, opIsOtr(operation)) }],
    currentContractId: ctId,
    week: { start: E.weekStartOf(gameDay, settings), trips: [] }, payroll: [], ledger: [],
    career: { billedThrough: o.billedThrough ?? gameDay - 1, startDay: gameDay }
  });
}

// Completa e confere o estado carregado (do navegador, da conta, de um backup ou de uma planilha)
function normalize(st) {
  const before = st.v || 0;
  st.settings = E.mergeDefaults(st.settings);
  st.profile = Object.assign({ name: '', nationality: '', level: 1, experience: 'grad', visa: 'unset' }, st.profile || {});
  st.bank = Object.assign({ opening: 0, archived: 0, loanTotal: 0 }, st.bank || {});
  st.gameDay = Math.max(1, parseInt(st.gameDay) || 1);
  st.career = Object.assign({ safetyStreak: 0, k401: 0, startDay: 1, loanNext: null, violations: [] }, st.career || {});
  if (st.career.billedThrough === undefined) st.career.billedThrough = st.gameDay;   // sem cobrança retroativa
  st.week = st.week || { start: 1, trips: [] };
  st.week.trips = st.week.trips || [];
  st.payroll = st.payroll || [];
  st.ledger = st.ledger || [];
  const L = st.settings.lists, P = st.profile;
  L.operation = [...new Set((L.operation || []).map(o => OP_RENAME[o] || o))];
  if (before < 3) E.OPERATIONS.forEach(o => { if (!L.operation.includes(o)) L.operation.push(o); });
  if (!L.operation.length) L.operation = E.OPERATIONS.slice();
  const fixCls = cls => CLASSIFICATIONS.includes(cls) ? cls : CLASSIFICATIONS[PRESET_KEYS.indexOf(E.presetKeyFor(cls))] || CLASSIFICATIONS[0];
  // Garante uma empresa e um contrato (dados muito antigos guardavam isso na ficha do motorista)
  if (!Array.isArray(st.companies) || !st.companies.length) st.companies = [{ id: uid(), name: P.company || 'Empresa contratante', hq: P.garage || '', dot: '', notes: '' }];
  if (!Array.isArray(st.contracts) || !st.contracts.length) {
    st.contracts = [{ id: uid(), companyId: st.companies[0].id, classification: fixCls(P.classification), operation: P.operation || L.operation[0], startDay: 1, endDay: null,
      truck: P.truck || '', trailer: P.trailer || '', renomeLevel: P.renomeLevel || 1, terms: null }];
  }
  for (const c of st.contracts) {
    c.classification = fixCls(c.classification);
    c.operation = OP_RENAME[c.operation] || c.operation || L.operation[0];
    if (!L.operation.includes(c.operation)) L.operation.push(c.operation);
    c.terms = normTerms(c.terms || presetTermsFor(E.presetKeyFor(c.classification), null, opIsOtr(c.operation)));
  }
  if (!st.contracts.find(c => c.id === st.currentContractId)) st.currentContractId = st.contracts[st.contracts.length - 1].id;
  // Campos de versões antigas que não existem mais
  ['company', 'garage', 'classification', 'operation', 'truck', 'trailer', 'renomeLevel', 'payForm'].forEach(k => delete P[k]);
  TERM_KEYS.forEach(k => delete st.settings[k]);
  ['_v6', 'tripCosts'].forEach(k => delete st.settings[k]);
  delete L.classification; delete st.settings.payroll.deposit; delete st.settings.market.applyCar; delete st.settings.borrowed.sheetPct; delete st.settings.taxes.type;
  st.companies.forEach(co => delete co.kind);
  // Viagens da semana em aberto sem regras gravadas recebem as regras atuais
  const eff = effSettings(st);
  for (const t of st.week.trips) {
    if (E.STATUS_OLD[t.status]) t.status = E.STATUS_OLD[t.status];
    if (t.type === 'borrowed') { if (!(t.car && t.car.mode)) t.car = E.carSnapshot(eff, 'borrowed'); continue; }
    if (!t.contract) Object.assign(t, E.snapshotFor('company', eff));
    if (!t.rules) t.rules = E.rulesSnapshot(eff);
    if (!t.contractId) t.contractId = st.currentContractId;
  }
  st.v = SCHEMA;
  return st;
}
// Mantém o documento principal pequeno: lançamentos antigos viram um saldo acumulado
function compact(st) {
  const cut = st.gameDay - KEEP_DAYS;
  if (cut < 1) return;
  let moved = 0;
  st.ledger = st.ledger.filter(e => { if (e.locked && e.day < cut) { moved += E.n(e.amount); return false; } return true; });
  st.bank.archived = E.r2(E.n(st.bank.archived) + moved);
  st.payroll = st.payroll.filter(p => !(p.status === 'paid' && E.n(p.paidDay) < cut));
  st.career.violations = (st.career.violations || []).filter(v => v.day >= cut);
}
const EXPERIENCE = [
  ['grad', 'Recém-formado (0–6 meses)', 0.38, 0.45],
  ['6m', '6 meses a 1 ano', 0.45, 0.52],
  ['1y', '1 a 3 anos', 0.50, 0.58],
  ['3y', '3 a 5 anos', 0.55, 0.65],
  ['5y', '5 anos ou mais', 0.60, 0.72]
];
const VISAS = [
  ['unset', 'Não definido'],
  ['citizen', 'Cidadão ou residente permanente (CDL padrão)'],
  ['h2a', 'Visto H-2A (CDL não-domiciliada)'],
  ['h2b', 'Visto H-2B (CDL não-domiciliada)'],
  ['e2', 'Visto E-2 (CDL não-domiciliada)'],
  ['other', 'Outro visto ou sem status']
];
const isLocalOp = () => opIsLocal((activeContract() || {}).operation);
const isOtrOp = () => opIsOtr((activeContract() || {}).operation);
const payFormShort = T => {
  const k = T.contract, M = k[k.mode] || {};
  return ({ weekly: `Fixo ${fmt(M.value)}/semana${M.commissionOn ? ` + ${fmtN(M.commission)}%` : ''}`, hourly: `${fmt(M.rate)}/hora${M.commissionOn ? ` + ${fmtN(M.commission)}%` : ''}`, cpm: `${fmt(M.rate)}/milha`, percent: `${fmtN(M.commission)}% do frete` })[k.mode] || '';
};
const contractPeriod = c => `Dia ${c.startDay} – ${c.endDay ? 'dia ' + c.endDay : 'atual'}`;
const shortCls = cls => E.PRESETS[E.presetKeyFor(cls)];
const balance = st => E.r2(E.n(st.bank.opening) + E.n(st.bank.archived) + st.ledger.reduce((a, e) => a + E.n(e.amount), 0));
const pendingPay = st => E.r2(st.payroll.filter(p => p.status !== 'paid').reduce((a, p) => a + E.n(p.amount), 0));
const weekLabel = start => `Dia ${start}–${start + 6}`;
const dayFull = d => `Dia ${d} · ${E.dayLabel(d, S.settings)}`;

const carLabel = t => (t.car && t.car.mode === 'owned') ? 'Carro próprio' : 'Carro emprestado';
function borrowedDesc(t) { return `${carLabel(t)} · ${t.origin || '?'} → ${t.dest || '?'}`; }
function syncBorrowedLedger(st) {
  const s = effSettings(st);
  const cur = new Map(st.week.trips.filter(t => t.type === 'borrowed').map(t => [t.id, t]));
  const want = s.borrowed.on && s.borrowed.settle === 'immediate';
  st.ledger = st.ledger.filter(e => {
    if (e.locked || !e.ref || !e.ref.startsWith('trip:')) return true;
    return want && cur.has(e.ref.slice(5));
  });
  if (!want) return;
  for (const t of cur.values()) {
    const amount = E.borrowedValue(t, s);
    const e = st.ledger.find(x => x.ref === 'trip:' + t.id);
    if (e) { e.amount = amount; e.day = t.day; e.desc = borrowedDesc(t); }
    else st.ledger.push({ id: uid(), ref: 'trip:' + t.id, day: t.day, desc: borrowedDesc(t), amount });
  }
}
function payEntry(st, p, day) {
  if (p.status === 'paid') return;
  p.status = 'paid'; p.paidDay = day;
  const label = p.breakdown && p.breakdown.tax === '1099' ? 'Acerto (settlement)' : 'Holerite';
  st.ledger.push({ id: uid(), ref: 'pay:' + p.id, day, desc: `${label} · semana ${weekLabel(p.weekStart).toLowerCase()}`, amount: p.amount, locked: true });
}
