/* ---------- Render ---------- */
function renderHeader() {
  if (!S) { $('#dayNum').textContent = '—'; $('#dayWd').textContent = 'Dia'; $('#hdrBal').textContent = '—'; $('#hdrSub').textContent = 'American Truck Simulator'; return; }
  $('#dayNum').textContent = S.gameDay;
  $('#dayWd').textContent = E.WEEKDAYS[E.weekdayIdx(S.gameDay, S.settings)];
  $('#hdrBal').textContent = fmt(balance(S));
  const p = S.profile;
  const ac = activeContract();
  $('#hdrSub').textContent = [p.name, ac ? companyName(ac) : '', ac ? E.PRESETS[E.presetKeyFor(ac.classification)] : ''].filter(Boolean).join(' · ') || 'American Truck Simulator';
}
function render() {
  renderHeader();
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const fabOn = !!S && (tab === 'painel' || tab === 'diario');
  $('#fab').hidden = !fabOn; document.body.classList.toggle('has-fab', fabOn);
  const v = $('#view');
  if (!S) { v.innerHTML = onboarding(); return; }
  v.innerHTML = ({ painel, diario, holerite, historico, ajustes, carreira })[tab]();
}

function onboarding() {
  const intro = `<section class="panel onb">
    <div class="eyebrow">${loginFirst() ? 'Ou comece do zero' : 'Primeiro acesso'}</div>
    <h2>Monte sua carreira no American</h2>
    <p>Diário de bordo, contrato com a empresa, resultado da semana, fechamento com pay lag e holerite do bruto ao líquido, com regras do mercado americano em 2026. Tudo pode ser ajustado depois.</p>
    <div class="row"><button class="btn ${loginFirst() ? '' : 'primary'}" data-act="start-blank">Criar carreira</button></div>
    <p class="muted" style="font-size:13px;margin:0">Já tem seus dados numa planilha ou num backup? Crie a carreira e depois use Ajustes › Dados e sincronização › Importar planilha (ou Importar JSON). ${store.mode === 'claude' ? syncBadge() : ''}</p>
  </section>`;
  if (store.mode === 'claude') return intro;
  const acc = `<section class="panel"><div class="mod-b" style="padding-top:14px">${cloud.session ? '' : `<div class="full"><div class="eyebrow">Já usa o app em outro aparelho?</div><p style="margin:4px 0 0">Entre na sua conta e a carreira chega sozinha.</p></div>`}${accountBlock()}</div></section>`;
  // Com servidor configurado e sem login, entrar na conta vem antes de criar uma carreira nova
  return loginFirst() ? acc + intro : intro + acc;
}
const loginFirst = () => store.mode !== 'claude' && !!cloudCfg() && !cloud.session;

const needClose = () => S.week.trips.length && S.gameDay >= S.week.start + 7;

function painel() {
  const s = SS(), d = weekDre(), TP = help('tab.painel', 'Painel');
  const next = S.payroll.filter(p => p.status !== 'paid').sort((a, b) => a.payday - b.payday)[0];
  const bh = (key, label) => help(key, label);
  const banner = needClose() ? (h => `<div class="banner"><div style="flex:1;min-width:0"><div class="lab-row" style="justify-content:flex-start"><b>A semana ${weekLabel(S.week.start).toLowerCase()} terminou.</b>${h.btn}</div><div class="muted" style="font-size:13.5px">Feche para gerar o holerite e começar uma semana nova.</div>${h.box}</div><button class="btn primary" data-act="close-week">Fechar semana</button></div>`)(bh('ui.fechar', 'Semana terminou')) : '';
  const vNow = weekViolations();
  const violB = vNow.length ? (h => `<div class="banner" style="border-color:var(--red);background:var(--red-bg)"><div style="flex:1;min-width:0"><div class="lab-row" style="justify-content:flex-start"><b>${vNow.length} infraç${vNow.length === 1 ? 'ão' : 'ões'} de jornada nesta semana</b>${h.btn}</div><div class="muted" style="font-size:13.5px">${s.hos.penalties ? `No fechamento: ${s.hos.resetSafety ? 'bônus de segurança zerado e ' : ''}${fmtN(s.hos.inspectChance)}% de chance de multa de ${fmt(s.hos.fine)} por infração.` : 'Consequências desligadas.'} Veja os detalhes no Diário.</div>${h.box}</div><button class="btn" data-goto="diario">Ver no Diário</button></div>`)(bh('ui.infracoes', 'Infrações')) : '';
  const negB = balance(S) < 0 ? (h => `<div class="banner" style="border-color:var(--red);background:var(--red-bg)"><div style="flex:1;min-width:0"><div class="lab-row" style="justify-content:flex-start"><b>Saldo negativo: ${fmt(balance(S))}</b>${h.btn}</div><div class="muted" style="font-size:13.5px">As contas continuam saindo. ${pendingPay(S) > 0 ? `Há ${fmt(pendingPay(S))} em holerites a receber.` : 'Não há holerites a receber.'}</div>${h.box}</div></div>`)(bh('ui.negativo', 'Saldo negativo')) : '';
  const ready = S.payroll.filter(p => p.status !== 'paid' && p.payday <= S.gameDay);
  const readyB = ready.length ? `<div class="banner"><div><b>${ready.length === 1 ? 'Um holerite está' : ready.length + ' holerites estão'} disponível${ready.length === 1 ? '' : 'is'}.</b><div class="muted" style="font-size:13.5px">${fmt(ready.reduce((a, p) => a + p.amount, 0))} para depositar no saldo.</div></div><button class="btn primary" data-act="pay-ready">Receber</button></div>` : '';
  const visaB = S.profile.visa === 'other' ? (h => `<div class="banner"><div style="flex:1;min-width:0"><div class="lab-row" style="justify-content:flex-start"><b>CDL não-domiciliada restrita.</b>${h.btn}</div><div class="muted" style="font-size:13.5px">Desde 15/03/2026, a FMCSA só emite CDL não-domiciliada para vistos H-2A, H-2B e E-2. Ajuste o status em Carreira › Motorista.</div>${h.box}</div></div>`)(bh('ui.visto', 'CDL')) : '';
  return `${draftsBanner()}${banner}${negB}${violB}${readyB}${visaB}
  <div class="stats two">
    <div class="panel stat">${eyeH('ui.receber', 'A receber')}<div class="v">${fmt(pendingPay(S))}</div><div class="s">${next ? 'Próximo: ' + dayFull(next.payday) : 'Nenhum holerite pendente'}</div></div>
    <div class="panel stat">${eyeH('ui.totalsaldo', 'Total com saldo')}<div class="v">${fmt(balance(S) + pendingPay(S))}</div><div class="s">Saldo + holerites pendentes</div></div>
  </div>
  <section class="panel pad" style="display:flex;flex-direction:column;gap:8px">
    <div class="sec-head"><div><div class="eyebrow">Resultado da semana</div><h2 class="hrow">Semana ${weekLabel(S.week.start).toLowerCase()}${TP.btn}</h2></div>
      <button class="btn sm" data-act="close-week" ${S.week.trips.length ? '' : 'disabled'}>Fechar semana</button></div>
    ${TP.box}${dreSummary(d)}
    <details class="more"><summary>Ver detalhamento</summary><div style="padding:0 12px 12px">${dreTable(d, s)}</div></details>
    <p class="muted" style="margin:6px 0 0;font-size:13px">${d.taxType === '1099' ? 'Ao fechar, o acerto (settlement) deposita o líquido no dia do pagamento, já sem a reserva de impostos; as despesas e os custos saem do saldo.' : 'Ao fechar, o holerite deposita o líquido do contracheque no dia do pagamento, e as despesas e o custo de vida saem do saldo.'}${s.borrowed.on && d.counts.borrowed && s.borrowed.settle === 'immediate' ? ` Viagens de carro na semana: ${fmt(d.borrowedTotal)}, já creditado no saldo.` : ''}</p>
  </section>
  <div class="muted" style="font-size:13px">${syncBadge()}</div>`;
}

function dreSummary(d) {
  const r = (label, v, note = '', cls = '', key = '') => { const h = help(key, label); return `<tr class="${cls}"><td><span class="lab-row" style="justify-content:flex-start">${label}${h.btn}</span>${note ? `<small>${note}</small>` : ''}${h.box}</td><td class="${cls === 'tot' ? (v < 0 ? 'neg' : 'pos') : ''}">${fmt(v)}</td></tr>`; };
  const D = d.deductions || { total: 0 }, O = d.opCosts || { total: 0 };
  let h = '<table class="sumtbl"><tbody>';
  h += r(d.taxType === '1099' ? 'Receita bruta' : 'Salário bruto', d.revenue, `${d.counts.company} viage${d.counts.company === 1 ? 'm' : 'ns'} de caminhão · ${fmtN(d.miles)} mi`, '', 'ui.bruto');
  const self = d.taxType === '1099';
  if (D.total) h += r(self ? '(−) Reserva de impostos e descontos' : '(−) Impostos e descontos', D.total, `${self ? 'Líquido do acerto (settlement)' : 'Líquido do holerite'} ${fmt(d.takeHome)}`, '', self ? 'ui.reserva' : 'ui.impostos');
  if (d.variable.total) h += r('(−) Despesas de viagem', d.variable.total, '', '', 'ui.despesas');
  if (O.total) h += r('(−) Custos do caminhão', O.total, '', '', 'ui.caminhao');
  if (d.fixed.total) h += r('(−) Moradia e custos fixos', d.fixed.total, [d.fixed.loan ? `inclui parcela do empréstimo ${fmt(d.fixed.loan)}` : '', S.settings.bills.on ? `cobrados toda ${E.WEEKDAYS_FULL[S.settings.bills.weekday].toLowerCase()}` : ''].filter(Boolean).join(' · '), '', 'ui.fixos');
  h += r('(=) Lucro líquido', d.net, '', 'tot', 'ui.lucro');
  return h + '</tbody></table>';
}

function dreTable(d, s) {
  const R = d.revenue;
  const pct = v => R ? fmtN(v / R * 100) + '%' : '—';
  const k = s.contract, c = s.costs;
  const row = (label, v, cls = 'sub', on = true, keep = false) => (cls.startsWith('sub') && !cls.includes('subtotal') && !keep && Math.abs(E.n(v)) < 0.005) ? '' : `<tr class="${cls}${on ? '' : ' off'}"><td>${label}</td><td class="num">${fmt(v)}</td><td class="pct">${cls.includes('info') ? '' : pct(v)}</td></tr>`;
  let g = 0;
  const grp = (label, v) => row(`${++g}. ${label}`, v, 'grp');
  const M = k[k.mode] || {}, mode = d.mode || k.mode;
  const lines = d.baseLines || (mode === 'percent' || mode === 'none' ? [] : [{ mode, value: d.base, rate: mode === 'weekly' ? M.value : M.rate, hoursPaid: d.hoursPaid, hoursWorked: d.hoursWorked, miles: d.miles, share: 1, detentionRate: M.detentionRate, detentionFree: M.detentionFree, stopRate: M.stopRate }]);
  const lab = l => ({
    weekly: `Salário fixo semanal${l.share < 1 ? ` (${l.days} de ${l.totalDays} dias neste contrato × ${fmt(l.rate)})` : ''}`,
    hourly: `Horas trabalhadas (${fmtN(l.hoursPaid || 0)}h pagas${(l.hoursWorked || 0) > (l.hoursPaid || 0) ? ` de ${fmtN(l.hoursWorked)}h` : ''} × ${fmt(l.rate)})`,
    cpm: `Milhas rodadas (${fmtN(l.miles)} mi${l.rate != null ? ` × ${fmt(l.rate)}` : ', taxas por viagem'})`
  })[l.mode] || 'Salário base';
  let h = '<table class="dre"><tbody>';
  h += grp(d.taxType === '1099' ? 'Receita bruta (settlement)' : 'Receita bruta (salário)', R);
  if (!lines.length) h += row('Sem salário fixo', 0, 'sub', false, true);
  for (const l of lines) h += row(lab(l), l.value, 'sub', true, true);
  const hl = lines.find(l => l.mode === 'hourly');
  if (d.overtime) h += row(`Hora extra (acima de ${fmtN(hl && hl.otAfter)}h × ${fmtN(hl && hl.otMult)})`, d.overtime);
  const cpmL = lines.find(l => l.mode === 'cpm');
  if (cpmL || d.detention) h += row(`Detention · espera nas docas${cpmL && cpmL.detentionRate ? ` (${fmt(cpmL.detentionRate)}/h após ${fmtN(cpmL.detentionFree)}h)` : ''}`, d.detention || 0);
  if (cpmL || d.stops) h += row(`Stop pay · paradas extras${cpmL && cpmL.stopRate ? ` (${fmt(cpmL.stopRate)} cada)` : ''}`, d.stops || 0);
  if (d.layover) h += row('Layover · dias parado aguardando carga', d.layover);
  if (d.breakdown) h += row('Breakdown pay · caminhão quebrado', d.breakdown);
  if (d.tarp) h += row('Tarp pay · cargas com lona', d.tarp);
  const pcts = d.commissionPcts || (d.commissionPct ? [d.commissionPct] : []);
  const mkt = d.marketTotal !== undefined && Math.abs(d.marketTotal - d.freight) > 0.005;
  if (d.commission || pcts.length) h += row(`Comissão (${pcts.length > 1 ? 'taxa de cada viagem' : fmtN(pcts[0] || 0) + '%'} de ${mkt ? `${fmt(d.marketTotal)} de frete de mercado` : fmt(d.freight)})`, d.commission);
  if (k.tripBonus || d.tripBonus) h += row('Bônus das viagens de caminhão', d.tripBonus);
  if (d.minimum) h += row('Complemento do mínimo garantido', d.minimum);
  if (s.renome.on) h += row(`Bônus por renome (${fmtN(s.renome.pct)}%)`, d.renome);
  if (d.safety) h += row('Bônus de segurança', d.safety);
  if (s.borrowed.on && s.borrowed.settle === 'payroll') h += row('Viagens de carro emprestado (líquido)', d.borrowed);

  const D = d.deductions;
  if (D && D.total) {
    const self = d.taxType === '1099';
    h += grp(self ? '(−) Reserva de impostos e descontos' : '(−) Impostos e descontos', D.total);
    if (D.federal) h += row(self ? `Imposto de renda federal (estimado${s.taxes.qbi !== false ? ', com dedução QBI de 20%' : ''})` : 'Imposto de renda federal (retido)', D.federal);
    if (D.fica) h += row(`FICA · Seguridade Social + Medicare (${fmtN(s.taxes.ficaPct)}%)`, D.fica);
    if (D.se) h += row(`Self-employment tax · autônomo (${fmtN(s.taxes.sePct)}%)`, D.se);
    if (D.state) h += row(`Imposto estadual (${fmtN(s.taxes.statePct)}%)`, D.state);
    if (D.health) h += row('Plano de saúde', D.health);
    if (D.k401) h += row(`401(k) · aposentadoria (${fmtN(s.benefits.k401Pct)}%)`, D.k401);
    if (d.perDiem) h += row(`Diária isenta: ${d.awayDays} dia${d.awayDays === 1 ? '' : 's'} fora reduzem a base do imposto`, d.perDiem, 'sub info');
    h += row(self ? '(=) Líquido do acerto (settlement)' : '(=) Líquido do holerite', d.takeHome, 'sub subtotal');
  }

  const V = d.variable, pays = key => (s.expenses || {})[key];
  h += grp('(−) Despesas de viagem', V.total);
  h += row(`Combustível${pays('fuel') === 'company' ? ' · empresa paga' : ''}`, V.fuel, 'sub', V.fuel > 0 || pays('fuel') !== 'company');
  h += row(`Pedágios${pays('tolls') === 'company' ? ' · empresa paga' : ''}`, V.tolls, 'sub', V.tolls > 0 || pays('tolls') !== 'company');
  h += row(`Cafés da manhã (${fmt(c.breakfast.val)} cada)`, V.breakfast, 'sub', c.breakfast.on);
  h += row(`Almoços (${fmt(c.lunch.val)} cada)`, V.lunch, 'sub', c.lunch.on);
  h += row(`Jantas (${fmt(c.dinner.val)} cada)`, V.dinner, 'sub', c.dinner.on);
  h += row(`Diárias / hotel (${fmt(c.hotel.val)} cada)${pays('hotel') === 'company' ? ' · empresa paga' : ''}`, V.hotel, 'sub', c.hotel.on && (V.hotel > 0 || pays('hotel') !== 'company'));
  h += row('Multas de trânsito', V.fines);
  if (V.damage !== undefined) h += row(`Danos${pays('damage') === 'deductible' ? ` (franquia até ${fmt(s.expenses.deductible)})` : ''}`, V.damage, 'sub', V.damage > 0 || pays('damage') !== 'company');

  const O = d.opCosts;
  if (O && O.total) {
    const oc = s.opCosts;
    h += grp('(−) Custos operacionais do caminhão', O.total);
    h += row(`Manutenção (${fmtN(d.miles)} mi × ${fmt(oc.maintenance)})`, O.maintenance);
    h += row(`Pneus (${fmtN(d.miles)} mi × ${fmt(oc.tires)})`, O.tires);
    h += row(`Seguro (${fmtN(d.miles)} mi × ${fmt(oc.insurance)})`, O.insurance);
    h += row('Parcela / leasing do caminhão', O.truck);
    h += row('Licenças, IFTA, ELD e escrow', O.other);
  }

  h += grp('(−) Custos fixos & pessoais', d.fixed.total);
  h += row('Moradia / custo de vida fixo', d.fixed.housing, 'sub', c.housing.on);
  if (s.loan.on || d.fixed.loan) h += row('Parcela do empréstimo', d.fixed.loan, 'sub', s.loan.on);
  h += `<tr class="total"><td>${++g}. (=) Lucro líquido real</td><td class="num ${d.net < 0 ? 'neg' : 'pos'}">${fmt(d.net)}</td><td class="pct">${pct(d.net)}</td></tr>`;
  return h + '</tbody></table>';
}

const statusChip = st => `<span class="chip ${({ Excelente: 'ok', 'Bom trabalho': 'ok', Bom: 'ok', 'Satisfatório': 'ok', 'Razoável': 'warn', Regular: 'warn', 'Tolerável': 'warn', Danificado: 'bad', Imprudente: 'bad', Ruim: 'bad', Atrasado: 'bad', Atrasada: 'bad' })[st] || ''}">${esc(st || '—')}</span>`;
function mealsText(t) {
  const parts = [];
  const add = (n, a, b) => { n = E.n(n); if (n) parts.push(`${n} ${n === 1 ? a : b}`); };
  add(t.breakfast, 'café', 'cafés'); add(t.lunch, 'almoço', 'almoços'); add(t.dinner, 'janta', 'jantas'); add(t.hotel, 'diária', 'diárias');
  return parts.join(' · ');
}
function tripRow(t) {
  const s = SS(), b = t.type === 'borrowed';
  const val = b ? E.borrowedValue(t, s) : E.tripPay(t, s).total;
  const md = E.contractOf(t, s).mode;
  const tags = [];
  if (!b && md === 'hourly' && E.n(t.hours)) tags.push(`${fmtN(t.hours)} h serviço`);
  if (!b && E.n(t.drive)) tags.push(`${fmtN(t.drive)} h direção`);
  if (!b && md === 'cpm' && E.n(t.detention)) tags.push(fmtN(t.detention) + ' h espera');
  if (!b && md === 'cpm' && E.n(t.stops)) tags.push(t.stops + ' parada' + (t.stops == 1 ? '' : 's'));
  if (E.n(t.layover)) tags.push(fmtN(t.layover) + ' dia' + (t.layover == 1 ? '' : 's') + ' layover');
  if (E.n(t.breakdown)) tags.push(fmtN(t.breakdown) + ' h quebra');
  if (t.tarp) tags.push('lona');
  if (t.away) tags.push('pernoite fora');
  const extras = [mealsText(t), E.n(t.fines) ? 'multa ' + fmt(t.fines) : '', E.n(t.damage) ? 'dano ' + fmt(t.damage) : '', E.n(t.fuel) ? 'comb. ' + fmt(t.fuel) : '', E.n(t.tolls) ? 'pedágio ' + fmt(t.tolls) : ''].filter(Boolean);
  const mkt = !b && t.rules && t.rules.market && t.rules.market.on;
  return `<button type="button" class="trip" data-edit="${esc(t.id)}">
    <div class="route">${esc(t.origin || '?')}<span class="arr">→</span>${esc(t.dest || '?')}</div>
    <div class="amt">${fmt(t.freight)}</div>
    <div class="meta"><span class="chip ${b ? 'loan' : ''}">${b ? carLabel(t) : 'Caminhão · ' + ({ weekly: 'Fixo', hourly: 'Por hora', cpm: 'CPM', percent: '% frete' })[md]}</span>${statusChip(t.status)}<span>${fmtN(t.miles)} mi</span>${mkt ? `<span>mercado ${fmt(E.marketFreight(t, s))}</span>` : ''}${[...tags, ...extras].length ? `<span>${esc([...tags, ...extras].join(' · '))}</span>` : ''}</div>
    <div class="res ${val < 0 ? 'neg' : 'pos'}">${b ? 'Resultado ' : 'Ganho '}${fmt(val)}</div>
  </button>`;
}

function hosPanel(days) {
  const s = SS();
  if (!s.hos.on) return '';
  const recent = [...H.slice(-2).flatMap(w => w.trips || []), ...S.week.trips];
  const rep = E.hos(recent, s, { local: isLocalOp(), gameDay: S.gameDay, days });
  const anyHours = S.week.trips.some(t => t.type !== 'borrowed' && (E.n(t.drive) || E.n(t.hours)));
  const cyc = rep.over ? 'bad' : rep.cycleLeft < 10 ? 'warn' : 'ok';
  const chips = (alerts, extra = []) => {
    const all = [...alerts, ...extra]; if (!all.length) return { chips: '<span class="chip ok">Dentro do limite</span>', boxes: '' };
    const hs = all.map(a => ({ a, h: ruleHelp(a.code) }));
    return { chips: hs.map(({ a, h }) => `<button type="button" class="chip ${a.level} rulechip" data-help="${h.id}" aria-expanded="false" aria-controls="${h.id}">${esc(a.text)} <span class="ri" aria-hidden="true">?</span></button>`).join(''), boxes: hs.map(({ h }) => h.box).join('') };
  };
  const rows = rep.rows.map(r => { const c = chips(r.alerts); return `<div class="hosrow"><div><b>Dia ${r.day}</b> <span class="muted">· ${fmtN(r.drive)}h direção · ${fmtN(r.duty)}h serviço${r.exempt ? ' · isenção local' : ''}</span></div><div class="alerts">${c.chips}</div>${c.boxes ? `<div class="hosboxes">${c.boxes}</div>` : ''}</div>`; }).join('');
  const cycBox = rep.over ? chips([], [{ code: 'cycle', level: 'bad', text: 'Ciclo semanal estourado' }]) : null;
  const HJ = help('ui.hos', 'Jornada');
  return `<section class="panel pad" style="display:flex;flex-direction:column;gap:6px">
    <div class="sec-head"><div><div class="eyebrow">FMCSA · Hours of Service</div><h3 class="hrow">Jornada${HJ.btn}</h3></div><span class="chip ${cyc} wrapok">Ciclo ${rep.limit}h/${rep.window} dias: ${fmtN(rep.cycleUsed)}h usadas · ${fmtN(rep.cycleLeft)}h livres${rep.restartDay ? ` · restart no dia ${rep.restartDay}` : ''}</span></div>${HJ.box}
    <p class="muted" style="margin:0;font-size:13px">${isLocalOp() && s.hos.shortHaul ? `Operação local: isenção de curta distância até ${fmtN(s.hos.radius)} mi aéreas da base e 14h de jornada, sem pausa obrigatória de 30 min. Direção continua limitada a 11h.` : 'Limites: 11h de direção e 14h de jornada por dia, pausa de 30 min após 8h dirigindo e 10h de folga antes do próximo turno.'}</p>
    ${cycBox ? `<div class="alerts">${cycBox.chips}</div>${cycBox.boxes}` : ''}
    ${anyHours ? rows + '<p class="muted" style="margin:0;font-size:12.5px">Toque em um alerta para ver o que significa, a consequência e como resolver. Vermelho = infração; amarelo = aviso.</p>' : '<p class="muted" style="margin:0;font-size:13px">Informe as horas de direção e de serviço nas viagens para acompanhar a jornada.</p>'}
  </section>`;
}

function diario() {
  const TD = help('tab.diario', 'Diário');
  const trips = S.week.trips.slice().sort((a, b) => a.day - b.day);
  const days = [...new Set(trips.map(t => t.day))];
  const d = weekDre();
  let body = days.map(day => `<div class="daygrp"><div class="dayhead"><b>Dia ${day}</b><span class="muted">${E.WEEKDAYS_FULL[E.weekdayIdx(day, S.settings)]}</span></div>${trips.filter(t => t.day === day).map(tripRow).join('')}</div>`).join('');
  if (!trips.length) body = `<div class="empty">Nenhuma viagem nesta semana ainda.<br><button class="btn primary" style="margin-top:12px" data-act="new-trip">Lançar a primeira viagem</button></div>`;
  return `<div class="sec-head"><div><div class="eyebrow">Diário de bordo</div><h2 class="hrow">Semana ${weekLabel(S.week.start).toLowerCase()}${TD.btn}</h2></div>
    <div class="muted" style="font-size:13.5px">${trips.length} lançamento${trips.length === 1 ? '' : 's'} · ${fmtN(trips.reduce((a, t) => a + E.n(t.miles), 0))} mi</div></div>
    ${TD.box}${needClose() ? `<div class="banner"><b>Semana encerrada no calendário do jogo.</b><button class="btn primary" data-act="close-week">Fechar semana</button></div>` : ''}
    ${trips.some(t => t.type !== 'borrowed') ? hosPanel(days.filter(dd => trips.some(t => t.day === dd && t.type !== 'borrowed'))) : ''}
    ${body}
    ${trips.length ? `<div class="panel pad row between"><span class="muted">Salário bruto da semana</span><b>${fmt(d.revenue)}</b></div>` : ''}`;
}

function holerite() {
  const s = SS();
  const list = S.payroll.slice().sort((a, b) => b.weekStart - a.weekStart);
  const items = list.map(p => {
    const paid = p.status === 'paid', ready = !paid && p.payday <= S.gameDay, left = p.payday - S.gameDay;
    const self = p.breakdown && p.breakdown.tax === '1099';
    const chip = paid ? `<span class="chip ok">Pago no dia ${p.paidDay}</span>` : ready ? `<span class="chip warn">Disponível</span>` : `<span class="chip">Previsto · falta${left === 1 ? '' : 'm'} ${left} dia${left === 1 ? '' : 's'}</span>`;
    const bk = p.breakdown ? `<table class="bk"><tbody>
        <tr><td>${self ? 'Receita bruta' : 'Salário bruto'}${p.breakdown.safety ? ' (inclui bônus de segurança)' : ''}</td><td>${fmt(p.breakdown.gross)}</td></tr>
        <tr><td>(−) ${self ? 'Reserva de impostos e descontos' : 'Impostos e descontos'}</td><td>${fmt(p.breakdown.ded)}</td></tr>
        <tr class="t"><td>(=) ${self ? 'Líquido do acerto' : 'Líquido do holerite'}</td><td>${fmt(p.breakdown.takeHome)}</td></tr>
        ${p.amount === p.breakdown.takeHome && E.n(p.breakdown.living) > 0 ? `<tr><td class="muted">Despesas e custo de vida (já debitados do saldo)</td><td class="muted">${fmt(-p.breakdown.living)}</td></tr>` : ''}
      </tbody></table>` : '';
    return `<div class="panel pad" style="display:flex;flex-direction:column;gap:8px">
      <div class="row between"><div><div class="eyebrow">${self ? 'Acerto (settlement) da semana' : 'Holerite da semana'}</div><h3>${weekLabel(p.weekStart)}</h3></div><div style="font-family:var(--display);font-size:24px;font-weight:600" class="${p.amount < 0 ? 'neg' : ''}">${fmt(p.amount)}</div></div>
      ${bk}
      <div class="row between"><div class="row" style="gap:8px">${chip}<span class="muted" style="font-size:13px">Pagamento: ${dayFull(p.payday)}</span></div>
      ${paid ? '' : `<button class="btn sm ${ready ? 'primary' : ''}" data-pay="${esc(p.id)}">${ready ? 'Receber' : 'Receber agora'}</button>`}</div>
    </div>`;
  }).join('') || `<div class="empty">Nenhum holerite ainda. Feche uma semana no Painel para gerar o primeiro.</div>`;
  const led = S.ledger.slice().sort((a, b) => b.day - a.day || 0).slice(0, 40).map(e => `<div class="li"><div><div>${esc(e.desc)}</div><div class="muted" style="font-size:12.5px">${dayFull(e.day)}${!e.locked && e.ref && e.ref.startsWith('trip:') ? ' · semana em aberto' : ''}</div></div><b class="${e.amount < 0 ? 'neg' : 'pos'}">${e.amount < 0 ? '' : '+'}${fmt(e.amount)}</b></div>`).join('') || '<div class="muted">Sem movimentações.</div>';
  const sf = s.safety, streak = S.career.safetyStreak || 0;
  const extra = s.loan.on ? ['Empréstimo', fmt(S.bank.loanTotal), `Parcela de ${fmt(s.loan.installment)} no dia ${S.career.loanNext}`] : S.career.k401 ? ['401(k) acumulado', fmt(S.career.k401), 'Aposentadoria guardada'] : null;
  return `<div class="stats two">
    <div class="panel stat">${eyeH('ui.receber', 'A receber')}<div class="v">${fmt(pendingPay(S))}</div><div class="s">${s.payroll.lagOn ? `Pay lag de ${s.payroll.lagWeeks} semana${s.payroll.lagWeeks == 1 ? '' : 's'} · ${E.WEEKDAYS_FULL[s.payroll.paydayWeekday].toLowerCase()}` : 'Pagamento ao fechar a semana'}</div></div>
    ${extra ? `<div class="panel stat"><div class="eyebrow">${extra[0]}</div><div class="v">${extra[1]}</div><div class="s">${extra[2]}</div></div>` : `<div class="panel stat"><div class="eyebrow">Holerites pagos</div><div class="v">${S.payroll.filter(p => p.status === 'paid').length}</div><div class="s">Nas últimas 12 semanas</div></div>`}
  </div>
  ${sf.on ? `<div class="panel pad row between"><div>${eyeH('ui.seguranca', 'Bônus de segurança')}<div>${streak % sf.weeks} de ${sf.weeks} semanas seguidas sem multa ou dano</div></div><b>${fmt(sf.amount)}</b></div>` : ''}
  ${(h => `<div class="sec-head"><h2 class="hrow">Holerites${h.btn}</h2></div>${h.box}`)(help('ui.holerite', 'Holerites'))}
  ${items}

  <section class="panel pad" style="display:flex;flex-direction:column;gap:8px">
    ${(h => `<div class="sec-head"><h2 class="hrow">Extrato${h.btn}</h2><button class="btn sm" data-act="adjust">Ajustar saldo</button></div>${h.box}`)(help('ui.extrato', 'Extrato'))}
    <div class="ledger">${led}</div>
    ${E.n(S.bank.archived) ? `<p class="muted" style="margin:0;font-size:12.5px">Lançamentos com mais de 12 semanas ficam somados no saldo (${fmt(S.bank.archived)}) e saem desta lista.</p>` : ''}
  </section>`;
}

function historico() {
  const weeks = H.slice().sort((a, b) => b.start - a.start);
  if (!weeks.length) return `<div class="sec-head"><h2>Histórico</h2></div><div class="empty">As semanas fechadas aparecem aqui, com DRE e todas as viagens.</div>`;
  const totals = weeks.reduce((a, w) => ({ net: a.net + w.dre.net, gross: a.gross + E.n(w.dre.revenue), miles: a.miles + w.dre.miles }), { net: 0, gross: 0, miles: 0 });
  const TH = help('tab.historico', 'Histórico');
  return `<div class="sec-head"><div><div class="eyebrow">Fretes realizados</div><h2 class="hrow">Histórico${TH.btn}</h2></div></div>${TH.box}
  <div class="stats">
    <div class="panel stat"><div class="eyebrow">Lucro acumulado</div><div class="v">${fmt(totals.net)}</div><div class="s">${weeks.length} semana${weeks.length === 1 ? '' : 's'} fechada${weeks.length === 1 ? '' : 's'}</div></div>
    <div class="panel stat"><div class="eyebrow">Ganho bruto</div><div class="v">${fmt(totals.gross)}</div><div class="s">${totals.miles ? fmt(totals.gross / totals.miles) + ' por milha' : 'Antes de impostos'}</div></div>
    <div class="panel stat"><div class="eyebrow">Distância</div><div class="v">${fmtN(totals.miles)} mi</div><div class="s">Viagens de caminhão</div></div>
  </div>
  ${weeks.map(w => {
    const ws = E.mergeDefaults(w.settings || SS());
    const rows = w.trips.slice().sort((a, b) => a.day - b.day).map(t => `<tr><td>${t.day}</td><td>${esc(t.origin)}</td><td>${esc(t.dest)}</td><td>${t.type === 'borrowed' ? 'Carro' : 'Caminhão'}</td><td>${esc(t.status)}</td><td class="num">${fmtN(t.miles)}</td><td class="num">${fmt(t.freight)}</td><td class="num">${fmt(t.bonus || 0)}</td><td class="num">${[t.breakfast, t.lunch, t.dinner, t.hotel].map(x => E.n(x)).join('/')}</td><td class="num">${fmt(t.fines || 0)}</td><td class="num">${t.type === 'borrowed' ? fmt(E.borrowedValue(t, ws)) : fmt(E.tripPay(t, ws).total)}</td></tr>`).join('');
    return `<details class="week"><summary><div><b>Semana ${weekLabel(w.start).toLowerCase()}</b><div class="muted" style="font-size:13px">${w.trips.length} viage${w.trips.length === 1 ? 'm' : 'ns'} · ${fmtN(w.dre.miles)} mi · bruto ${fmt(w.dre.revenue)}</div></div><b class="${w.dre.net < 0 ? 'neg' : 'pos'}" style="font-size:20px">${fmt(w.dre.net)}</b></summary>
      <div class="body">${dreTable(w.dre, ws)}
        <div class="scroll"><table class="tbl"><thead><tr><th>Dia</th><th>Origem</th><th>Destino</th><th>Tipo</th><th>Status</th><th class="num">mi</th><th class="num">Frete</th><th class="num">Bônus</th><th class="num" title="Cafés / almoços / jantas / noites em hotel">C/A/J/H</th><th class="num">Multas</th><th class="num">Ganho / resultado</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="row"><button class="btn sm danger" data-delweek="${esc(w.id)}">Excluir semana</button></div>
      </div></details>`;
  }).join('')}`;
}
