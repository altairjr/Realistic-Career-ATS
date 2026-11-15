/* ---------- Banco (conta, extrato detalhado, empréstimo) e Vida (aluguel e outras escolhas do motorista) ---------- */

/* --- Aluguel: o jogador paga; nada sai sozinho do saldo ---
   Cada semana do calendário tem um aluguel (Ajustes › Custos de vida › Moradia) que vence no dia das contas fixas.
   Pagar sempre quita a semana mais antiga em aberto, como um senhorio faria. career.rent.paidThrough = início da
   última semana paga. */
function rentDueDay(ws, s) {
  for (let d = ws; d <= ws + 6; d++) if (E.weekdayIdx(d, s) === E.n(s.bills.weekday)) return d;
  return ws;
}
function rentInfo(st = S) {
  const s = st.settings, on = !!(s.costs.housing.on && E.n(s.costs.housing.val) > 0), value = E.r2(E.n(s.costs.housing.val));
  const cur = E.weekStartOf(st.gameDay, s), R = st.career.rent || { paidThrough: cur - 7 };
  const open = [];
  if (on) for (let w = R.paidThrough + 7; w <= cur; w += 7) { const due = rentDueDay(w, s); open.push({ ws: w, due, overdue: st.gameDay > due }); }
  const overdue = open.filter(o => o.overdue);
  const paidCur = R.paidThrough >= cur;
  return { on, value, cur, paidThrough: R.paidThrough, open, overdue, overdueTotal: E.r2(overdue.length * value), openTotal: E.r2(open.length * value), paidCur,
    curDue: rentDueDay(cur, s), nextWeek: R.paidThrough + 7 };
}
function payRent(st, count) {
  const info = rentInfo(st);
  const weeks = info.open.slice(0, Math.max(0, count));
  for (const o of weeks) {
    st.ledger.push({ id: uid(), ref: 'rent:' + o.ws, day: st.gameDay, desc: `Aluguel · semana ${weekLabel(o.ws).toLowerCase()}`, amount: -info.value, locked: true,
      detail: [{ label: `Aluguel da semana ${weekLabel(o.ws).toLowerCase()}`, value: -info.value }, { label: `Venceu no ${dayFull(o.due).toLowerCase()}${st.gameDay > o.due ? ` · pago com ${st.gameDay - o.due} dia${st.gameDay - o.due === 1 ? '' : 's'} de atraso` : ''}`, value: null }] });
    st.career.rent.paidThrough = o.ws;
  }
  return weeks.length;
}

/* --- Detalhe de cada lançamento do extrato: de onde veio o total --- */
const L_ = (label, value, cls = '') => ({ label, value: value === null ? null : E.r2(value), cls });
// Despesas da semana (viagens, caminhão e, nas semanas antigas, moradia), a partir do DRE da semana
function livingLines(d, s, { housing = true } = {}) {
  const c = s.costs, V = d.variable || {}, O = d.opCosts || {}, out = [];
  const cnt = (v, price) => (E.n(price) > 0 ? ` (${Math.round(E.n(v) / E.n(price))} × ${fmt(price)})` : '');
  const add = (label, v) => { if (E.n(v)) out.push(L_(label, -v)); };
  add('Combustível', V.fuel); add('Pedágios', V.tolls);
  add('Cafés da manhã' + cnt(V.breakfast, c.breakfast.val), V.breakfast); add('Almoços' + cnt(V.lunch, c.lunch.val), V.lunch);
  add('Jantas' + cnt(V.dinner, c.dinner.val), V.dinner); add('Hotel / diárias' + cnt(V.hotel, c.hotel.val), V.hotel);
  add('Multas de trânsito', V.fines); add('Danos', V.damage);
  if (E.n(O.total)) {
    const oc = s.opCosts || {};
    add(`Manutenção (${fmtN(d.miles)} mi × ${fmt(oc.maintenance)})`, O.maintenance); add(`Pneus (${fmtN(d.miles)} mi × ${fmt(oc.tires)})`, O.tires);
    add(`Seguro (${fmtN(d.miles)} mi × ${fmt(oc.insurance)})`, O.insurance); add('Parcela / leasing do caminhão', O.truck); add('Licenças, IFTA, ELD e escrow', O.other);
  }
  if (housing && d.fixed && E.n(d.fixed.housing)) add('Moradia (aluguel da semana)', d.fixed.housing);
  return out;
}
// Fecha a conta: se as linhas não somam o lançamento, mostra a diferença (o que já tinha sido cobrado antes)
function reconcile(lines, amount, why) {
  // subtotais "(=)" não somam; a diferença entra antes do último subtotal, se houver
  const sum = E.r2(lines.reduce((a, l) => a + (l.cls === 'total' ? 0 : l.value || 0), 0)), diff = E.r2(amount - sum);
  if (Math.abs(diff) >= 0.01) {
    const line = L_(why, diff, 'muted'), last = lines.length && lines[lines.length - 1].cls === 'total' ? lines.length - 1 : lines.length;
    lines.splice(last, 0, line);
  }
  return lines;
}
const weekOfPay = id => { const p = S.payroll.find(x => x.id === id); return p ? H.find(w => w.start === p.weekStart) : null; };
const weekByStart = ws => H.find(w => w.start === ws);
function payLines(d, s) {
  const out = [], add = (label, v) => { if (E.n(v)) out.push(L_(label, v)); };
  for (const b of d.baseLines || []) add(({ weekly: `Salário fixo${b.share < 1 ? ` (${b.days} de ${b.totalDays} dias)` : ''}`, hourly: `Horas pagas (${fmtN(b.hoursPaid)} h × ${fmt(b.rate)})`, cpm: `Milhas (${fmtN(b.miles)} mi${b.rate ? ' × ' + fmt(b.rate) : ''})`, percent: 'Percentual do frete' })[b.mode] || 'Salário', b.value);
  add('Hora extra', d.overtime); add('Espera (detention)', d.detention); add('Paradas extras', d.stops); add('Layover', d.layover); add('Quebra do caminhão', d.breakdown); add('Lona', d.tarp);
  add(`Comissão${d.commissionPct ? ` (${fmtN(d.commissionPct)}% do frete)` : ''}`, d.commission); add('Bônus das viagens', d.tripBonus);
  add('Complemento do mínimo semanal', d.minimum); add('Renome da empresa', d.renome); add('Bônus de segurança', d.safety); add('Viagens de carro (pagas no holerite)', d.borrowed);
  out.push(L_(d.taxType === '1099' ? '(=) Receita bruta' : '(=) Salário bruto', d.revenue, 'total'));
  const D = d.deductions || {};
  const ded = (label, v) => { if (E.n(v)) out.push(L_(label, -v)); };
  ded('Imposto de renda federal', D.federal); ded('FICA (Seguridade Social e Medicare)', D.fica); ded('Self-employment tax', D.se); ded('Imposto estadual', D.state);
  ded('Plano de saúde', D.health); ded('401(k) (aposentadoria, fica guardado)', D.k401);
  out.push(L_(d.taxType === '1099' ? '(=) Líquido do acerto' : '(=) Líquido do holerite', d.takeHome, 'total'));
  return out;
}
function entryDetail(e) {
  if (Array.isArray(e.detail) && e.detail.length) return e.detail;
  const ref = String(e.ref || ''), s = SS();
  if (ref.startsWith('living:')) {
    const w = weekOfPay(ref.slice(7)) || weekByStart((String(e.desc).match(/dia (\d+)/) || [])[1] * 1);
    if (!w) return [L_('O detalhe desta semana não está mais guardado (semana excluída do histórico).', null, 'muted')];
    // Antes da v0.22 a moradia entrava aqui só quando não tinha saído pelo calendário: mostra a versão que fecha a conta
    const ws = E.mergeDefaults(w.settings || s), sumOf = ls => E.r2(ls.reduce((a, l) => a + (l.value || 0), 0));
    const withH = livingLines(w.dre, ws), noH = livingLines(w.dre, ws, { housing: false });
    if (sumOf(noH) === E.r2(e.amount) && sumOf(withH) !== E.r2(e.amount)) return noH.concat([L_('A moradia desta semana saiu à parte, pelo calendário (lançamento "Moradia" no extrato).', null, 'muted')]);
    return reconcile(withH, e.amount, '(+) Já cobrado antes pelo calendário (contas fixas da semana)');
  }
  if (ref.startsWith('pay:')) {
    const w = weekOfPay(ref.slice(4));
    if (!w) { const p = S.payroll.find(x => x.id === ref.slice(4)); return p && p.breakdown ? [L_('Salário bruto', p.breakdown.gross), L_('Impostos e descontos', -p.breakdown.ded), L_('(=) Líquido', p.breakdown.takeHome, 'total')] : []; }
    return reconcile(payLines(w.dre, E.mergeDefaults(w.settings || s)), e.amount, 'Diferença (ajuste do pagamento)');
  }
  if (ref.startsWith('bill:')) {
    if (/^Moradia/.test(e.desc)) return [L_('Moradia (aluguel da semana), cobrada pelo calendário', e.amount), L_('Desde a versão 0.22 o aluguel é pago por você na aba Vida.', null, 'muted')];
    const O = s.opCosts || {};
    return reconcile([L_('Parcela / leasing do caminhão', -E.n(O.truckWeekly)), L_('Licenças, IFTA, ELD e escrow', -E.n(O.otherWeekly))].filter(l => l.value), e.amount, 'Valores do contrato na época');
  }
  if (ref.startsWith('trip:')) {
    const id = ref.slice(5), t = S.week.trips.find(x => x.id === id) || H.flatMap(w => w.trips || []).find(x => x.id === id);
    if (!t) return [];
    const b = E.carBreakdown(t, s), out = [L_(`${carLabel(t)}: ${t.origin || '?'} → ${t.dest || '?'}, ${fmtN(t.miles)} mi`, null, 'muted')];
    out.push(L_(b.mode === 'owned' ? 'Frete (100%, carro próprio)' : `Sua parte do frete (${fmtN(t.car && t.car.pct)}%)`, b.share));
    if (b.bonus) out.push(L_('Bônus', b.bonus));
    [['Custo do veículo', b.vehicle], ['Combustível', b.fuel], ['Pedágios', b.tolls], ['Danos', b.damage], ['Multas', b.fines], ['Refeições e hotel', b.personal]].forEach(([l, v]) => { if (E.n(v)) out.push(L_(l, -v)); });
    return reconcile(out, e.amount, 'Diferença');
  }
  if (ref.startsWith('loan:')) {
    const m = String(e.desc).match(/juros ([^)]+)\)/);
    return [L_('Parcela paga', e.amount), m ? L_(`Inclui juros de ${m[1]}; o resto abate a dívida`, null, 'muted') : L_('Abate a dívida do empréstimo', null, 'muted')];
  }
  if (ref.startsWith('fine:')) return [L_('Multa da fiscalização do DOT por infração de jornada (Hours of Service)', e.amount)];
  if (ref === 'adj') return [L_('Lançamento manual (Ajustar saldo)', e.amount), L_(e.desc, null, 'muted')];
  return [];
}
function detailTable(lines) {
  return `<table class="bk lx-bk"><tbody>${lines.map(l => `<tr class="${l.cls === 'total' ? 't' : ''}"><td class="${l.cls === 'muted' ? 'muted' : ''}">${esc(l.label)}</td><td class="${l.value < 0 ? 'neg' : ''}">${l.value === null ? '' : (l.value > 0 && l.cls !== 'total' ? '+' : '') + fmt(l.value)}</td></tr>`).join('')}</tbody></table>`;
}
let ledgerOpen = false;   // "+ opções": abre todos os detalhes do extrato
function ledgerItem(e) {
  const lines = entryDetail(e), meta = `${dayFull(e.day)}${!e.locked && e.ref && e.ref.startsWith('trip:') ? ' · semana em aberto' : ''}`;
  const head = `<div style="min-width:0"><div>${esc(e.desc)}</div><div class="muted" style="font-size:12.5px">${meta}</div></div><b class="${e.amount < 0 ? 'neg' : 'pos'}">${e.amount < 0 ? '' : '+'}${fmt(e.amount)}</b>`;
  if (!lines.length) return `<div class="li">${head}</div>`;
  return `<details class="lx"${ledgerOpen ? ' open' : ''}><summary class="li"><span class="lx-plus" aria-hidden="true">+</span>${head}</summary><div class="lx-body">${detailTable(lines)}</div></details>`;
}

/* --- Aba Banco --- */
function banco() {
  const s = SS(), TB = help('tab.banco', 'Banco'), bal = balance(S), pend = pendingPay(S);
  const since = S.gameDay - 27, recent = S.ledger.filter(e => e.day >= since);
  const inc = E.r2(recent.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0)), out = E.r2(recent.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0));
  const acct = String(Math.abs([...(S.profile.name || 'motorista')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 10000).padStart(4, '0');
  const led = S.ledger.slice().sort((a, b) => b.day - a.day || 0).slice(0, 60).map(ledgerItem).join('') || '<div class="muted">Sem movimentações.</div>';
  const loanOn = s.loan.on && E.n(S.bank.loanTotal) > 0;
  return `<div class="sec-head"><div><div class="eyebrow">Conta corrente</div><h2 class="hrow">Banco${TB.btn}</h2></div></div>${TB.box}
  <section class="panel pad bank-card">
    <div><div class="eyebrow">Titular</div><b>${esc(S.profile.name || 'Motorista')}</b><div class="muted" style="font-size:13px">Conta corrente · •••• ${acct}</div></div>
    <div><div class="eyebrow">Saldo disponível</div><div class="bank-bal ${bal < 0 ? 'neg' : ''}">${fmt(bal)}</div></div>
    <div class="stats two" style="margin:0">
      <div class="stat"><div class="eyebrow">A receber</div><div class="v" style="font-size:20px">${fmt(pend)}</div><div class="s">Holerites ainda não pagos</div></div>
      <div class="stat"><div class="eyebrow">Últimos 28 dias</div><div class="v" style="font-size:20px">${fmt(inc + out)}</div><div class="s"><span class="pos">+${fmt(inc)}</span> · <span class="neg">${fmt(out)}</span></div></div>
    </div>
  </section>
  <section class="panel pad" style="display:flex;flex-direction:column;gap:8px">
    <div class="sec-head"><div><div class="eyebrow">Crédito</div><h3>Empréstimo</h3></div><button class="btn sm" disabled title="Em breve">Pedir empréstimo</button></div>
    <p class="muted" style="margin:0;font-size:13px">${loanOn ? `Empréstimo registrado: ${fmt(S.bank.loanTotal)} devidos, parcela de ${fmt(s.loan.installment)} no dia ${S.career.loanNext}. ` : ''}Pedir empréstimo ao banco chega numa próxima versão.</p>
  </section>
  <section class="panel pad" style="display:flex;flex-direction:column;gap:8px">
    ${(h => `<div class="sec-head"><h2 class="hrow">Extrato${h.btn}</h2><div class="row" style="gap:6px"><button class="btn sm" data-act="ledger-all">${ledgerOpen ? '− Recolher' : '+ Detalhes'}</button><button class="btn sm" data-act="adjust">Ajustar saldo</button></div></div>${h.box}`)(help('ui.extrato', 'Extrato'))}
    <div class="ledger">${led}</div>
    ${E.n(S.bank.archived) ? `<p class="muted" style="margin:0;font-size:12.5px">Lançamentos com mais de 12 semanas ficam somados no saldo (${fmt(S.bank.archived)}) e saem desta lista.</p>` : ''}
  </section>`;
}

/* --- Aba Vida: escolhas do motorista fora do caminhão (por enquanto, o aluguel) --- */
function rentBanner() {
  const r = rentInfo(); if (!r.on || !r.overdue.length) return '';
  return `<div class="banner" style="border-color:var(--red);background:var(--red-bg)"><div style="flex:1;min-width:0"><b>Aluguel em atraso: ${r.overdue.length} semana${r.overdue.length === 1 ? '' : 's'} (${fmt(r.overdueTotal)})</b><div class="muted" style="font-size:13.5px">O aluguel não sai sozinho do saldo: pague na aba Vida.</div></div><button class="btn" data-goto="vida">Pagar aluguel</button></div>`;
}
function vida() {
  const TV = help('tab.vida', 'Vida'), r = rentInfo();
  const paidList = S.ledger.filter(e => String(e.ref || '').startsWith('rent:')).sort((a, b) => b.day - a.day).slice(0, 6);
  let card;
  if (!r.on) card = `<p class="muted" style="margin:0">Sem aluguel: a moradia está desligada ou sem valor em Ajustes › Custos de vida.</p><div class="row"><button class="btn sm" data-goto="ajustes">Abrir Ajustes</button></div>`;
  else {
    const status = r.paidCur ? `<span class="chip ok">Semana atual paga</span>` : r.overdue.length ? `<span class="chip bad">${r.overdue.length} semana${r.overdue.length === 1 ? '' : 's'} em atraso</span>` : `<span class="chip warn">Vence no ${dayFull(r.curDue).toLowerCase()}</span>`;
    const rows = r.open.map(o => `<tr><td>Semana ${weekLabel(o.ws).toLowerCase()} · vence dia ${o.due}</td><td class="${o.overdue ? 'neg' : ''}">${o.overdue ? 'Atrasado' : 'A vencer'} · ${fmt(r.value)}</td></tr>`).join('');
    card = `<div class="row between"><div><div class="eyebrow">Aluguel semanal</div><div class="bank-bal" style="font-size:26px">${fmt(r.value)}</div></div>${status}</div>
      ${r.open.length ? `<table class="bk"><tbody>${rows}<tr class="t"><td>Total em aberto</td><td>${fmt(r.openTotal)}</td></tr></tbody></table>` : `<p class="muted" style="margin:0;font-size:13px">Tudo em dia. O aluguel da semana ${weekLabel(r.cur + 7).toLowerCase()} vence no dia ${rentDueDay(r.cur + 7, S.settings)}.</p>`}
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${r.open.length ? `<button class="btn primary" data-act="rent-pay" data-n="1">Pagar ${r.overdue.length ? 'a semana mais antiga' : 'o aluguel da semana'} · ${fmt(r.value)}</button>` : ''}
        ${r.open.length > 1 ? `<button class="btn" data-act="rent-pay" data-n="${r.open.length}">Pagar tudo (${r.open.length} semanas) · ${fmt(r.openTotal)}</button>` : ''}
      </div>
      <p class="muted" style="margin:0;font-size:12.5px">O aluguel vence toda ${E.WEEKDAYS_FULL[S.settings.bills.weekday].toLowerCase()} (dia das contas fixas) e não sai sozinho do saldo. Cada pagamento quita a semana mais antiga em aberto. O valor muda em Ajustes › Custos de vida › Moradia.</p>`;
  }
  return `<div class="sec-head"><div><div class="eyebrow">Vida do motorista</div><h2 class="hrow">Vida${TV.btn}</h2></div></div>${TV.box}
  <section class="panel pad" style="display:flex;flex-direction:column;gap:10px"><div class="sec-head"><div><div class="eyebrow">Moradia</div><h3>Aluguel</h3></div></div>${card}</section>
  ${paidList.length ? `<section class="panel pad" style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow">Últimos aluguéis pagos</div>${paidList.map(e => `<div class="li"><div><div>${esc(e.desc)}</div><div class="muted" style="font-size:12.5px">Pago no ${dayFull(e.day).toLowerCase()}</div></div><b class="neg">${fmt(e.amount)}</b></div>`).join('')}</section>` : ''}
  <section class="panel pad" style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow">Em breve</div><p class="muted" style="margin:0;font-size:13px">Outras escolhas da vida do motorista (tempo em casa, carro próprio, documentos) entram aqui nas próximas versões.</p></section>`;
}
async function lifeAction(a, el) {
  if (a === 'ledger-all') { ledgerOpen = !ledgerOpen; render(); return true; }
  if (a === 'rent-pay') {
    const n = parseInt(el.dataset.n) || 1, r = rentInfo(), total = E.r2(Math.min(n, r.open.length) * r.value);
    if (!r.open.length) return true;
    if (n > 1 && !(await confirmBox(`Pagar ${n} semanas de aluguel?`, `<p style="margin:0">${fmt(total)} saem do saldo agora (saldo atual ${fmt(balance(S))}).</p>`, 'Pagar'))) return true;
    let paid = 0; commit(st => { paid = payRent(st, n); });
    toast(`${paid === 1 ? 'Aluguel pago' : paid + ' aluguéis pagos'} · ${fmt(-total)}`);
    return true;
  }
  return false;
}
