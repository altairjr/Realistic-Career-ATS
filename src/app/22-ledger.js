/* ---------- Contas fixas e empréstimo pelo calendário ---------- */
const loanPeriod = s => s.loan.freq === 'weekly' ? 7 : 30;
function payLoan(st, s, d) {
  const C = st.career, total = E.n(st.bank.loanTotal);
  if (total <= 0) { st.settings.loan.on = false; C.loanNext = null; return; }
  const interest = E.r2(total * E.n(s.loan.rate) / 100 * (s.loan.freq === 'weekly' ? 7 / 30 : 1));
  const amount = E.r2(Math.min(E.n(s.loan.installment), total + interest));
  st.bank.loanTotal = E.r2(Math.max(0, total + interest - amount));
  st.ledger.push({ id: uid(), ref: 'loan:' + d, day: d, desc: `Parcela do empréstimo${interest ? ` (juros ${fmt(interest)})` : ''}`, amount: -amount, locked: true });
  C.loanNext = C.loanNext + loanPeriod(s);
  if (st.bank.loanTotal <= 0) { st.settings.loan.on = false; C.loanNext = null; }
}
// Cobra, dia a dia, as contas fixas (no dia da semana escolhido) e as parcelas vencidas
function runBills(st) {
  const s = effSettings(st), C = st.career, to = st.gameDay;
  if (to <= C.billedThrough) return;
  for (let d = C.billedThrough + 1; d <= to; d++) {
    if (d < E.n(C.startDay)) continue;
    if (s.bills.on && E.weekdayIdx(d, s) === E.n(s.bills.weekday)) {
      const ws = E.weekStartOf(d, s), items = [];
      if (s.costs.housing.on && E.n(s.costs.housing.val)) items.push(['Moradia', E.n(s.costs.housing.val)]);
      if (s.opCosts.on && (E.n(s.opCosts.truckWeekly) + E.n(s.opCosts.otherWeekly))) items.push(['Parcela do caminhão e licenças', E.n(s.opCosts.truckWeekly) + E.n(s.opCosts.otherWeekly)]);
      for (const [label, v] of items) st.ledger.push({ id: uid(), ref: 'bill:' + ws, day: d, desc: `${label} · semana ${weekLabel(ws).toLowerCase()}`, amount: -E.r2(v), locked: true });
    }
    if (s.loan.on && C.loanNext && d >= C.loanNext) payLoan(st, s, d);
  }
  C.billedThrough = to;
}
function loanDueInWeek(st, start) {
  const s = effSettings(st), C = st.career; let sum = 0;
  for (const e of st.ledger) if (e.ref && e.ref.startsWith('loan:') && e.day >= start && e.day <= start + 6) sum -= E.n(e.amount);
  if (s.loan.on && C.loanNext) for (let d = C.loanNext; d <= start + 6; d += loanPeriod(s)) if (d >= start && d > C.billedThrough) sum += E.n(s.loan.installment);
  return E.r2(sum);
}
const billedThisWeek = st => E.r2(-st.ledger.filter(e => e.ref === 'bill:' + st.week.start).reduce((a, e) => a + E.n(e.amount), 0));
const weekDre = (extra = {}) => E.dre(S.week.trips, SS(), { loan: loanDueInWeek(S, S.week.start), ...extra });
function loanForecast(st) {
  const s = st.settings; let total = E.n(st.bank.loanTotal), n = 0, d = st.career.loanNext || st.gameDay;
  if (!s.loan.on || total <= 0 || E.n(s.loan.installment) <= 0) return '';
  while (total > 0.005 && n < 600) { const i = total * E.n(s.loan.rate) / 100 * (s.loan.freq === 'weekly' ? 7 / 30 : 1); if (E.n(s.loan.installment) <= i) return 'A parcela não cobre os juros: a dívida nunca termina.'; total = total + i - E.n(s.loan.installment); n++; d += loanPeriod(s); }
  return `Faltam ${n} parcela${n === 1 ? '' : 's'}; a última vence por volta do dia ${d - loanPeriod(s)}.`;
}

// Infrações de jornada da semana em aberto (só alertas de nível 'bad' + ciclo estourado)
function weekViolations() {
  const s = SS(); if (!s.hos.on) return [];
  const trucks = S.week.trips.filter(t => t.type !== 'borrowed');
  if (!trucks.length) return [];
  const days = [...new Set(trucks.map(t => t.day))].sort((a, b) => a - b);
  const recent = [...H.slice(-2).flatMap(w => w.trips || []), ...S.week.trips];
  const rep = E.hos(recent, s, { local: isLocalOp(), gameDay: days[days.length - 1], days });
  const v = [];
  rep.rows.forEach(r => r.alerts.filter(a => a.level === 'bad').forEach(a => v.push({ day: r.day, code: a.code, text: a.text })));
  const over = days.map(d => ({ d, r: E.hos(recent, s, { gameDay: d, days: [] }) })).find(x => x.r.over);
  if (over) v.push({ day: over.d, code: 'cycle', text: `Ciclo de ${over.r.limit}h estourado (${fmtN(over.r.cycleUsed)}h)` });
  return v;
}
const recentViolations = (st = S) => (st.career.violations || []).filter(v => v.day > st.gameDay - 56);

function weekClosePlan() {
  const s = SS();
  const hasTruck = S.week.trips.some(t => t.type !== 'borrowed');
  const viol = weekViolations();
  const hosHit = s.hos.penalties && s.hos.resetSafety && viol.length > 0;
  const clean = weekDre().clean && !hosHit;
  const streak = S.career.safetyStreak || 0;
  let newStreak = streak, safety = 0;
  if (s.safety.on && hasTruck) {
    if (clean) { newStreak = streak + 1; if (newStreak % Math.max(1, E.n(s.safety.weeks)) === 0) safety = E.n(s.safety.amount); }
    else newStreak = 0;
  }
  const d = weekDre({ safety });
  // parcelas do empréstimo e contas já cobradas pelo calendário não saem de novo no fechamento
  const living = E.r2(Math.max(0, d.variable.total + d.opCosts.total + d.fixed.total - d.fixed.loan - billedThisWeek(S)));
  return { d, safety, newStreak, living, viol, hosHit };
}

function autoPay(st) {
  if (!st.settings.payroll.autoPay) return;
  st.payroll.filter(p => p.status !== 'paid' && p.payday <= st.gameDay).forEach(p => payEntry(st, p, p.payday));
}
function normalizeWeek(st) {
  if (!st.week.trips.length) st.week.start = E.weekStartOf(st.gameDay, st.settings);
}
function commit(fn, { view = true } = {}) {
  fn(S);
  runBills(S);
  syncBorrowedLedger(S); normalizeWeek(S);
  S._rev = Date.now();
  persist();
  view ? render() : renderHeader();
}

/* ---------- Troca completa dos dados (nova carreira, importação) ---------- */
async function replaceAll(state, history) {
  const old = H.map(w => w.id);
  S = normalize(state); H = (history || []).slice().sort((a, b) => a.start - b.start);
  runBills(S);
  S._rev = Date.now();
  persist(); render();
  if (store.backend) {
    for (const id of old) if (!H.find(w => w.id === id)) await deleteWeekRemote(id);
    for (const w of H) await saveWeekRemote(w);
  }
}
