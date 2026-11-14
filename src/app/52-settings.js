/* ---------- Aba Ajustes: regras gerais do jogo ---------- */
const PAY_FORMS = [['weekly', 'Pagamento fixo semanal + comissão'], ['hourly', 'Por hora (Hourly Pay) + comissão'], ['cpm', 'Por milha (Cents Per Mile)'], ['percent', 'Percentual do frete (sem fixo)']];
const PAY_HELP = {
  weekly: 'Recebe o valor fixo toda semana fechada, mais a comissão sobre o frete de cada viagem de caminhão.',
  hourly: 'Cada viagem informa as horas de serviço. Paga horas × valor, respeitando o limite diário e o semanal, mais a comissão.',
  cpm: 'Cada viagem paga milhas × valor. Espera nas docas acima das horas livres e paradas extras somam à parte.',
  percent: 'Sem salário fixo. O motorista fica com um percentual do frete de cada viagem. É o modelo típico de lease e owner-operator.'
};
const toggleNum = (onPath, valPath, label, o = {}) => `<div class="field ${o.full ? 'full' : ''}">${F.chk(onPath, label, valPath)}<div class="${o.money ? 'money' : o.pct ? 'pctf' : ''}"><input id="${fid(valPath)}" aria-label="${esc(label)}" type="number" inputmode="decimal" step="any" data-bind="${valPath}" data-type="num" value="${esc(getP(valPath))}" ${getP(onPath) ? '' : 'disabled'}></div>${o.hint ? `<span class="muted" style="font-size:12px">${o.hint}</span>` : ''}</div>`;
const hint = txt => `<p class="full muted" style="margin:0;font-size:13px">${txt}</p>`;
const yes = (v, a, b = '') => v ? a : b;
function listEditor(key, label, ph) {
  const items = S.settings.lists[key];
  const LR = labRow('lists.' + key, label);
  return `<div class="full field">${LR.row}${LR.box}<div class="cities">${items.map((c, i) => `<span class="chip">${esc(c)}<button type="button" data-dellist="${key}:${i}" aria-label="Remover ${esc(c)}">×</button></span>`).join('')}</div>
    <div class="row" style="flex-wrap:nowrap"><input id="new_${key}" type="text" placeholder="${esc(ph)}" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:8px 10px;min-height:40px"><button class="btn" data-addlist="${key}">Adicionar</button></div></div>`;
}

// Ajustes = regras gerais do jogo. Tudo que depende do empregador fica no contrato (aba Carreira).
function carModule() {
  const s = S.settings, b = s.borrowed;
  // Comparação por viagem: uma viagem de carro típica (distância e frete médios das suas viagens de carro)
  // contra o salário bruto médio por viagem de caminhão da semana atual.
  const carTrips = [...H.flatMap(w => w.trips || []), ...S.week.trips].filter(t => t.type === 'borrowed' && E.n(t.miles) > 0);
  const mi = carTrips.length ? Math.round(carTrips.reduce((a, t) => a + E.n(t.miles), 0) / carTrips.length) : 200;
  const gpm = carTrips.length ? carTrips.reduce((a, t) => a + E.n(t.freight), 0) / carTrips.reduce((a, t) => a + E.n(t.miles), 0) : 3.7;
  const mkt = mi * gpm * E.n(b.factor);
  const lent = mkt * E.n(b.pct) / 100, own = mkt - mi * E.n(b.costPerMile) - mi * 0.2;
  const wk = E.dre(S.week.trips.filter(t => t.type !== 'borrowed'), SS());
  const truckTrip = wk.counts.company ? wk.revenue / wk.counts.company : null;
  const cmp = v => truckTrip ? ` (${fmtN(v / truckTrip * 100)}% de uma viagem de caminhão)` : '';
  return mod('Viagens de carro', 'Fretes fora do contrato. Emprestado: % do frete, sem custos do veículo. Próprio: 100% do frete, com todos os custos.', 'settings.borrowed.on',
    F.num('settings.borrowed.factor', 'Fator sobre o frete do jogo', { hint: `Frete de mercado do carro = frete do jogo × ${fmtN(b.factor)}.` }) +
    `<div class="field">${F.chk('settings.borrowed.bonusFactor', 'Aplicar o fator também ao bônus')}</div>` +
    F.num('settings.borrowed.pct', 'Emprestado: comissão do motorista', { pct: true, hint: 'O dono do carro paga combustível, pedágio e danos.' }) +
    `<div class="field">${F.chk('settings.borrowed.personal', 'Emprestado: refeições, hotel e multas continuam com o motorista')}</div>` +
    `<div class="field">${F.chk('settings.borrowed.ownOn', 'Tenho carro próprio')}</div>` +
    (b.ownOn ? F.num('settings.borrowed.costPerMile', 'Próprio: custo do carro por milha', { money: true, hint: 'Manutenção, pneus, seguro e depreciação. Combustível e pedágio são lançados na viagem.' }) : '') +
    F.sel('settings.borrowed.settle', 'Quando o resultado cai no saldo', [['immediate', 'Na hora do lançamento'], ['payroll', 'Junto com o holerite da semana']]) +
    hint(`<b>Viagem de carro típica</b> (${mi} mi, frete do jogo ${fmt(gpm)}/mi, sem bônus): emprestado ${fmt(lent)}${cmp(lent)}${b.ownOn ? ` · próprio ${fmt(own)} com combustível estimado em $0,20/mi${cmp(own)}` : ''}.${truckTrip ? ` Caminhão na semana atual: ${fmt(truckTrip)} de salário bruto por viagem.` : ''} Alvo: carro emprestado entre 35% e 50% e próprio entre 55% e 75% de uma viagem de caminhão.`),
    `Emprestado ${fmtN(b.pct)}% · ${b.ownOn ? `próprio ${fmt(b.costPerMile)}/mi · ` : ''}frete × ${fmtN(b.factor)}`);
}

// Guia completo das regras de gameplay (Ajustes)
function rulesGuide() {
  const s = SS(), h = s.hos;
  const topic = (title, html) => `<details class="more full"><summary>${title}</summary><div class="help" style="margin:0 12px 12px">${html}</div></details>`;
  const R = (o, real, app, fix) => Rx(o, real, app, fix);
  return [
    topic('Semana de trabalho e fechamento', R(
      'Toda viagem lançada cai na semana em aberto (segunda a domingo do jogo). Quando o calendário passa do domingo, o Painel avisa que a semana terminou.',
      '', 'Fechar a semana gera o holerite, cobra as despesas da semana, aplica bônus e infrações e manda as viagens para o Histórico. Sem fechar, as novas viagens continuam na mesma semana e nenhum holerite é gerado. Se você trocar de contrato no meio da semana, cada viagem é paga pelo contrato em que foi lançada, e o salário fixo é dividido pelos dias.',
      'Feche a semana logo depois do domingo do jogo. Se lançou algo errado, edite a viagem antes de fechar: depois de fechada, a semana fica só para consulta.')),
    topic('Pagamento e pay lag', R(
      `O holerite de cada semana cai ${s.payroll.lagOn ? `na ${E.WEEKDAYS_FULL[s.payroll.paydayWeekday].toLowerCase()} de ${s.payroll.lagWeeks} semana(s) depois` : 'quando a semana é fechada'}. O valor depositado é o líquido do contracheque: salário bruto menos impostos, plano de saúde e 401(k).`,
      'Nos EUA é comum receber a semana trabalhada só na sexta seguinte. Por isso o primeiro mês de um emprego novo é apertado. Quem é autônomo (1099: lease e owner-operator) recebe um acerto (settlement) sem imposto retido e paga o imposto estimado a cada trimestre.',
      `${s.payroll.autoPay ? 'O depósito é automático no dia do pagamento.' : 'O depósito é manual: toque em "Receber" no Holerite.'} Despesas de viagem e custo de vida saem do saldo no fechamento, antes do holerite cair.`,
      'Comece com saldo suficiente para pelo menos duas semanas de contas (Ajustes › Início e contas fixas).')),
    topic('Contas fixas, saldo negativo e empréstimo', R(
      `${s.bills.on ? `Toda ${E.WEEKDAYS_FULL[s.bills.weekday].toLowerCase()} a moradia${s.opCosts.on ? ', a parcela do caminhão e as licenças' : ''} saem do saldo, com ou sem viagens.` : 'As contas fixas saem só no fechamento da semana.'} Parcelas de empréstimo saem no dia do vencimento, com juros sobre o saldo devedor.`,
      'Contas atrasadas geram juros, taxas de cheque especial e restrição de crédito.',
      'O app não bloqueia o jogo com saldo negativo: as contas continuam saindo e o Painel mostra um alerta vermelho. Se a parcela do empréstimo for menor que os juros, a dívida nunca termina, e a previsão do empréstimo avisa.',
      'Receba os holerites pendentes, faça fretes de carro, reduza a moradia ou registre um empréstimo e lance o valor recebido em "Ajustar saldo".')),
    topic('Jornada: limite de 11h de direção', ruleHtml('drive11')),
    topic('Jornada: janela de 14h', ruleHtml('duty14')),
    topic('Jornada: pausa de 30 minutos', ruleHtml('break30')),
    topic('Jornada: isenção local e raio de 150 mi', ruleHtml('radius')),
    topic('Jornada: ciclo de 70h/60h e restart de 34h', ruleHtml('cycle')),
    topic('Infrações, fiscalização e registro de segurança', R(
      'Infração é qualquer alerta vermelho de jornada (11h, 14h, pausa de 30 min, ciclo). Avisos amarelos, como sair do raio local, não são infrações.',
      'Infrações são descobertas em inspeções do DOT na estrada. Quem é pego fica fora de serviço até cumprir o descanso, paga multa e ganha pontos no CSA, o registro de segurança que empresas consultam.',
      h.penalties ? `No fechamento da semana, cada infração é sorteada com ${fmtN(h.inspectChance)}% de chance de fiscalização; se for pega, a multa de ${fmt(h.fine)} sai do saldo.${h.resetSafety ? ' Qualquer infração zera o bônus de segurança.' : ''} Todas ficam no registro de segurança (Carreira › Motorista) por 8 semanas; com 3 ou mais, o motorista aparece "em risco".` : 'As consequências estão desligadas: as infrações só aparecem como alerta.',
      'Toque em cada alerta no Diário para ver como corrigir. Se as horas foram lançadas erradas, edite a viagem antes de fechar a semana; depois de fechar, a infração fica registrada.')),
    topic('Multas de trânsito e danos', R(
      'Multas e danos informados no jogo são lançados na viagem, em "Entrega, ocorrências e despesas".',
      'Multa de trânsito é sempre do motorista. Dano costuma ser cobrado como franquia de $500–1.000 do empregado; o owner-operator paga tudo.',
      `Neste contrato: multas pagas pelo ${s.expenses.fines === 'company' ? 'empresa' : 'motorista'}; danos ${s.expenses.damage === 'deductible' ? `com franquia de ${fmt(s.expenses.deductible)} por ocorrência` : s.expenses.damage === 'company' ? 'pagos pela empresa' : 'pagos pelo motorista'}. Qualquer multa ou dano zera a contagem do bônus de segurança.`,
      'Lance o valor que o jogo cobrou, mesmo que o contrato mande a empresa pagar: o app desconta só a parte do motorista.')),
    topic('Bônus de segurança', R(
      s.safety.on ? `O contrato paga ${fmt(s.safety.amount)} a cada ${s.safety.weeks} semanas seguidas sem multa, dano${h.penalties && h.resetSafety ? ' ou infração de jornada' : ''}.` : 'O contrato atual não tem bônus de segurança.',
      'É comum transportadoras pagarem prêmios trimestrais de segurança.',
      'A contagem aparece no Holerite. Semanas sem viagem de caminhão não contam nem zeram. O bônus entra no holerite da semana em que a meta foi atingida.',
      'Dirija com cuidado no jogo e respeite as horas de jornada.')),
    topic('Contratos e troca de empresa', R(
      'Cada viagem de caminhão guarda as condições do contrato do dia em que foi lançada: forma de pagamento, valores e quem paga cada despesa.',
      '', 'Mudar o contrato vale para as próximas viagens. Impostos, benefícios, per diem e custos do caminhão são semanais e seguem o contrato ativo no fechamento. "Trocar de contrato" encerra o atual na véspera do novo e guarda o histórico.',
      'Para corrigir uma viagem lançada no contrato errado, abra a viagem e toque em "Usar contrato atual".')),
    topic('Viagens de carro', R(
      'Fretes fora do contrato. Emprestado: você recebe uma parte do frete e o dono paga combustível, pedágio e danos. Próprio: você recebe o frete inteiro, mas paga todos os custos e o desgaste do carro.',
      '', 'O resultado cai no saldo na hora (ou com o holerite, se configurado) e não conta para jornada, bônus de segurança nem impostos.',
      'O carro foi calibrado para render menos que o caminhão. Veja a comparação em Ajustes › Viagens de carro.')),
    topic('Status migratório e CDL', R(
      'O status escolhido na ficha do motorista.',
      'Desde 15/03/2026, estrangeiro sem residência permanente só tira a CDL não-domiciliada com visto H-2A, H-2B ou E-2. Dirigir sem CDL válida tira o motorista de serviço e gera multa.',
      'Com "Outro visto", o Painel mostra um aviso. O app não bloqueia viagens: o status serve para o enredo da carreira.', ''))
  ].join('');
}

function startModule() {
  const s = S.settings, C = S.career, L = s.loan, wd = E.WEEKDAYS_FULL.map((l, i) => [i, l]), eff = SS();
  const weekly = (s.costs.housing.on ? E.n(s.costs.housing.val) : 0) + (eff.opCosts.on ? E.n(eff.opCosts.truckWeekly) + E.n(eff.opCosts.otherWeekly) : 0);
  const sum = [`saldo inicial ${fmt(S.bank.opening)}`, s.bills.on ? `contas toda ${E.WEEKDAYS_FULL[s.bills.weekday].toLowerCase()}` : 'contas no fechamento', L.on ? `empréstimo ${fmt(S.bank.loanTotal)}` : 'sem empréstimo'].join(' · ');
  return mod('Início e contas fixas', 'Com quanto o motorista começa, quando as contas vencem e se há empréstimo.', null,
    F.num('bank.opening', 'Saldo inicial', { money: true, hint: `Antes de qualquer lançamento. Saldo atual: ${fmt(balance(S))}.` }) +
    F.num('career.startDay', 'Dia de início da carreira', { step: 1, hint: 'Contas e parcelas contam a partir deste dia.' }) +
    `<div class="field full">${F.chk('settings.bills.on', 'Cobrar as contas fixas toda semana, mesmo sem salário')}</div>` +
    (s.bills.on ? F.sel('settings.bills.weekday', 'Dia da cobrança', wd, { num: true }) : '') +
    hint(s.bills.on ? `Toda ${E.WEEKDAYS_FULL[s.bills.weekday].toLowerCase()} saem ${fmt(weekly)} do saldo (moradia${eff.opCosts.on ? ', parcela do caminhão e licenças' : ''}). Com o pay lag, o primeiro holerite só chega ${s.payroll.lagOn ? `na ${E.WEEKDAYS_FULL[s.payroll.paydayWeekday].toLowerCase()} da semana seguinte` : 'no fechamento'}; um saldo inicial de pelo menos ${fmt(weekly * 2)} cobre esse intervalo.` : 'Desligado: as contas fixas saem do saldo só quando a semana é fechada.') +
    `<div class="field full">${F.chk('settings.loan.on', 'Empréstimo ativo')}</div>` +
    (L.on ? F.num('bank.loanTotal', 'Valor devido', { money: true }) + F.num('settings.loan.installment', 'Valor da parcela', { money: true }) +
      F.sel('settings.loan.freq', 'Frequência da parcela', [['monthly', 'Mensal (a cada 30 dias)'], ['weekly', 'Semanal']]) +
      F.num('settings.loan.rate', 'Juros ao mês', { pct: true, hint: 'Sobre o saldo devedor, em cada parcela.' }) +
      F.num('career.loanNext', 'Próxima parcela (dia do jogo)', { step: 1 }) + hint(loanForecast(S)) : ''),
    sum);
}

function ajustes() {
  let TA;
  const s = S.settings, c = activeContract(), m = s.market, cs = s.costs;
  const wd = E.WEEKDAYS_FULL.map((l, i) => [i, l]);
  const meals = ['breakfast', 'lunch', 'dinner'].filter(x => cs.auto[x]).map(x => ({ breakfast: 'café', lunch: 'almoço', dinner: 'jantar' })[x]);
  return `<div class="sec-head"><div><div class="eyebrow">Regras gerais</div><h2 class="hrow">Ajustes${(TA = help('tab.ajustes', 'Ajustes')).btn}</h2></div><span class="muted" style="font-size:13px">Salário, despesas, benefícios e bônus da empresa ficam no contrato, na aba Carreira.</span></div>${TA.box}
  ${mod('Guia das regras do jogo', 'O que cada regra significa, as consequências e como resolver cada situação.', null, rulesGuide(), 'Jornada, infrações, pagamento, contas, multas, bônus, contratos e carro')}
  ${startModule()}
  ${mod('Frete de mercado', 'O ATS paga fretes muito acima do real. Converte o frete do jogo do caminhão antes da comissão e do percentual.', 'settings.market.on',
    F.sel('settings.market.mode', 'Como converter', [['factor', 'Multiplicar o frete do jogo'], ['rpm', 'Valor por milha da viagem']]) +
    (m.mode === 'factor' ? F.num('settings.market.factor', 'Fator sobre o frete do jogo', { hint: `Ex.: $4.543 × ${fmtN(m.factor)} = ${fmt(4543 * E.n(m.factor))} em 184 mi (${fmt(4543 * E.n(m.factor) / 184)}/mi).` }) :
      F.num('settings.market.rpm', 'Frete de mercado por milha', { money: true, hint: 'Custo real de operação: $2,34/mi (ATRI 2025).' })) +
    hint('Vale para as viagens de caminhão. O carro tem fator próprio, em Viagens de carro.'),
    m.on ? (m.mode === 'factor' ? `Frete do jogo × ${fmtN(m.factor)}` : `${fmt(m.rpm)} por milha`) : 'Desligado: usa o frete do jogo')}
  ${mod('Bônus das viagens', 'Onde o bônus da viagem entra no cálculo (100% do valor).', null,
    `<div class="field full">${F.chk('settings.tripBonus', 'Somar o bônus nas viagens de caminhão')}${F.chk('settings.borrowed.bonusOn', 'Somar o bônus nas viagens de carro')}</div>`,
    `Caminhão: ${yes(s.tripBonus !== false, 'soma', 'não soma')} · Carro: ${yes(s.borrowed.bonusOn !== false, 'soma', 'não soma')}`)}
  ${mod('Custos de vida', 'Refeições, hotel e moradia que saem do bolso do motorista.', null,
    F.sel('settings.costs.mealsMode', 'Como contar as refeições', [['trip', 'Lançar em cada viagem'], ['day', 'Automático por dia trabalhado']], { full: true }) +
    (cs.mealsMode === 'day' ? `<div class="field full">${(L => L.row + L.box)(labRow('settings.costs.auto', 'Refeições automáticas em cada dia com viagem de caminhão'))}<div class="checks">${F.chk('settings.costs.auto.breakfast', 'Café')}${F.chk('settings.costs.auto.lunch', 'Almoço')}${F.chk('settings.costs.auto.dinner', 'Jantar')}</div></div>` : '') +
    costField('breakfast', 'Café da manhã', 'Por café') + costField('lunch', 'Almoço', 'Por almoço') + costField('dinner', 'Jantar', 'Por jantar') +
    costField('hotel', 'Noite em hotel', 'Por noite lançada na viagem') + costField('housing', 'Moradia', 'Por semana fechada'),
    `${cs.mealsMode === 'day' ? 'Refeições por dia: ' + (meals.join(', ') || 'nenhuma') : 'Refeições por viagem'} · moradia ${fmt(cs.housing.val)}/semana`)}
  ${mod('Impostos', `Tabela federal de 2026. O tipo vem da classificação do contrato: ${c && taxTypeFor(c.classification) === '1099' ? '1099, autônomo' : 'W-2, empregado'}.`, null,
    F.sel('settings.taxes.filing', 'Declaração', [['single', 'Solteiro'], ['married', 'Casado (conjunta)']]) +
    F.num('settings.taxes.statePct', 'Imposto estadual', { pct: true, hint: 'Nevada não tem imposto de renda estadual.' }) +
    `<details class="more full"><summary>Avançado</summary><div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
      ${F.sel('settings.taxes.federal', 'Imposto de renda federal', [['table', 'Tabela progressiva 2026'], ['flat', 'Alíquota fixa']])}
      ${s.taxes.federal === 'flat' ? F.num('settings.taxes.flatPct', 'Alíquota fixa', { pct: true }) : ''}
      ${F.num('settings.taxes.ficaPct', 'FICA (W-2)', { pct: true, hint: '6,2% + 1,45%.' })}
      ${F.num('settings.taxes.sePct', 'Self-employment (1099)', { pct: true, hint: 'Sobre 92,35% do lucro.' })}
      <div class="field">${F.chk('settings.taxes.qbi', 'Dedução QBI de 20% para autônomo (1099)')}</div>
    </div></details>` +
    `${s.taxes.filing === 'married' ? 'Casado' : 'Solteiro'} · ${s.taxes.federal === 'flat' ? 'alíquota fixa ' + fmtN(s.taxes.flatPct) + '%' : 'tabela 2026'} · estadual ${fmtN(s.taxes.statePct)}%`)}
  ${carModule()}
  ${mod('Pay lag (folha de pagamento)', 'Atraso entre a semana trabalhada e o depósito. Desligado, o pagamento cai ao fechar a semana.', 'settings.payroll.lagOn',
    F.num('settings.payroll.lagWeeks', 'Semanas de atraso', { step: 1 }) + F.sel('settings.payroll.paydayWeekday', 'Dia do pagamento', wd, { num: true }) +
    `<div class="field">${F.chk('settings.payroll.autoPay', 'Depositar sozinho quando chegar o dia')}</div>`,
    `${s.payroll.lagWeeks} semana${s.payroll.lagWeeks == 1 ? '' : 's'} de atraso · ${E.WEEKDAYS_FULL[s.payroll.paydayWeekday].toLowerCase()}`)}
  ${mod('Jornada (Hours of Service)', 'Alertas das regras da FMCSA com as horas lançadas nas viagens.', 'settings.hos.on',
    F.sel('settings.hos.cycle', 'Ciclo semanal', [['70/8', '70 horas em 8 dias'], ['60/7', '60 horas em 7 dias']]) +
    F.num('settings.hos.radius', 'Raio da isenção local (milhas aéreas)', { step: 1, hint: 'Regra atual: 150 mi aéreas e até 14h de jornada.' }) +
    `<div class="field">${F.chk('settings.hos.shortHaul', 'Usar isenção de curta distância na operação local')}</div>` +
    `<div class="field">${F.chk('settings.hos.restart', 'Restart de 34h: um dia inteiro de folga zera o ciclo')}</div>` +
    `<div class="field full">${F.chk('settings.hos.penalties', 'Aplicar consequências das infrações')}</div>` +
    (s.hos.penalties ? F.num('settings.hos.inspectChance', 'Chance de fiscalização por infração', { pct: true }) + F.num('settings.hos.fine', 'Multa por infração pega', { money: true }) +
      `<div class="field">${F.chk('settings.hos.resetSafety', 'Infração zera o bônus de segurança')}</div>` : ''),
    `Ciclo ${s.hos.cycle.replace('/', 'h em ')} dias · raio local ${fmtN(s.hos.radius)} mi · ${s.hos.penalties ? `fiscalização ${fmtN(s.hos.inspectChance)}%, multa ${fmt(s.hos.fine)}` : 'sem consequências'}`)}
  ${mod('Calendário e cidades', 'Dia da semana do dia 1 e sugestões de origem e destino.', null,
    F.num('gameDay', 'Dia atual do jogo', { step: 1 }) + F.sel('settings.day1Weekday', 'O dia 1 do jogo é', wd, { num: true }) +
    (() => { const L = labRow('cities', 'Cidades sugeridas'); return `<div class="full">${L.row}${L.box}</div>`; })() + `<div class="full cities">${s.cities.map((x, i) => `<span class="chip">${esc(x)}<button type="button" data-delcity="${i}" aria-label="Remover ${esc(x)}">×</button></span>`).join('')}</div>
     <div class="field"><label for="newCity">Nova cidade</label><input id="newCity" type="text" placeholder="Ex.: Las Vegas"></div><div class="field" style="justify-content:end"><button class="btn" data-act="add-city">Adicionar</button></div>`,
    `Dia 1 = ${E.WEEKDAYS_FULL[s.day1Weekday].toLowerCase()} · ${s.cities.length} cidades`)}
  ${mod('Tipos de operação', 'Opções de "Especificação da operação" nos contratos.', null,
    listEditor('operation', 'Especificação da operação', 'Ex.: Dedicated Regional'), s.lists.operation.join(' · '))}
  ${mod('Dados e sincronização', 'Seus dados ficam na sua conta e aparecem no celular e no PC.', null,
    `<div class="full">${syncBadge()}</div>
     ${(L => `<div class="full">${L.row}${L.box}</div>`)(labRow('data.sheet', 'Planilha (.xlsx)'))}
     <div class="full row"><button class="btn primary" data-act="import-sheet">Importar planilha</button><button class="btn" data-act="sheet-template">Baixar modelo</button><button class="btn" data-act="export-sheet">Exportar planilha</button></div>
     ${(L => `<div class="full">${L.row}${L.box}</div>`)(labRow('data.json', 'Backup completo (.json)'))}
     <div class="full row"><button class="btn" data-act="export">Exportar JSON</button><button class="btn" data-act="import">Importar JSON</button></div>
     <div class="full row"><button class="btn" data-act="reset-rules">Restaurar regras gerais</button><button class="btn danger" data-act="wipe">Apagar tudo</button></div>`,
    store.status === 'on' ? 'Sincronizado na sua conta' : 'Exportar, importar ou recomeçar')}`;
}
