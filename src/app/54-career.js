/* ---------- Aba Carreira: motorista, contrato, empresas ---------- */
let ctab = 'motorista';
try { const x = sessionStorage.getItem('ats-ctab'); if (x) ctab = x; } catch (e) {}
const tripsOfContract = id => [...H.flatMap(w => w.trips || []), ...S.week.trips].filter(t => t.contractId === id && t.type !== 'borrowed');

function carreira() {
  const TC = help('tab.carreira', 'Carreira');
  const tabs = [['motorista', 'Motorista'], ['contratos', 'Contrato'], ['empresas', 'Empresas']];
  return `<div class="sec-head"><div><div class="eyebrow">Carreira</div><h2 class="hrow">${({ motorista: 'Cadastro do motorista', contratos: 'Contrato de trabalho', empresas: 'Empresas' })[ctab]}${TC.btn}</h2></div></div>${TC.box}
    <div class="seg3" role="tablist" aria-label="Seções da carreira">${tabs.map(([k, l]) => `<button type="button" role="tab" data-ctab="${k}" aria-selected="${ctab === k}">${l}</button>`).join('')}</div>
    ${({ motorista: motoristaView, contratos: contratosView, empresas: empresasView })[ctab]()}`;
}

function motoristaView() {
  const P = S.profile, c = activeContract();
  const allTrips = [...H.flatMap(w => w.trips || []), ...S.week.trips].filter(t => t.type !== 'borrowed');
  const miles = allTrips.reduce((a, t) => a + E.n(t.miles), 0);
  const exp = EXPERIENCE.find(e => e[0] === P.experience) || EXPERIENCE[0];
  const timeline = S.contracts.slice().sort((a, b) => b.startDay - a.startDay).map(k => `<div class="li"><div><div><b>${esc(companyName(k))}</b> · ${esc(shortCls(k.classification))}</div><div class="muted" style="font-size:12.5px">${contractPeriod(k)} · ${esc(payFormShort(k.terms))} · ${tripsOfContract(k.id).length} viagens</div></div>${k.id === S.currentContractId ? '<span class="chip ok">Atual</span>' : `<span class="chip">${esc(k.endReason || 'Encerrado')}</span>`}</div>`).join('');
  return `
  <div class="stats">
    <div class="panel stat"><div class="eyebrow">Empregador atual</div><div class="v" style="font-size:22px">${esc(companyName(c))}</div><div class="s">${c ? 'Desde o dia ' + c.startDay + ' · ' + esc(shortCls(c.classification)) : ''}</div></div>
    <div class="panel stat"><div class="eyebrow">Milhas na carreira</div><div class="v">${fmtN(miles)} mi</div><div class="s">${allTrips.length} viagens de caminhão</div></div>
    <div class="panel stat"><div class="eyebrow">Empresas</div><div class="v">${new Set(S.contracts.map(k => k.companyId)).size}</div><div class="s">${S.contracts.length} contrato${S.contracts.length === 1 ? '' : 's'}</div></div>
  </div>
  ${mod('Dados pessoais', 'Quem é o motorista. Empresa e salário ficam no contrato; saldo no Holerite.', null,
    F.text('profile.name', 'Nome do motorista') + F.text('profile.nationality', 'Nacionalidade') + F.num('profile.level', 'Nível no jogo', { step: 1 }) +
    F.sel('profile.experience', 'Experiência como motorista', EXPERIENCE.map(e => [e[0], e[1]])) +
    hint(`Faixa de CPM para ${esc(exp[1].toLowerCase())}: ${fmt(exp[2])}–${fmt(exp[3])} por milha.`) +
    F.sel('profile.visa', 'Status migratório / CDL', VISAS, { full: true }) +
    hint(P.visa === 'other' ? '<b>Atenção:</b> desde 15/03/2026 a CDL não-domiciliada só é emitida para vistos H-2A, H-2B e E-2.' : 'Desde 15/03/2026, motorista estrangeiro sem residência permanente precisa de visto H-2A, H-2B ou E-2 para ter CDL não-domiciliada.'),
    `${P.name || 'Sem nome'} · ${exp[1]}`)}
  ${(() => {
    const rv = recentViolations(), h = help('ui.registro', 'Registro de segurança');
    const st = rv.length === 0 ? ['ok', 'Limpo'] : rv.length < 3 ? ['warn', 'Atenção'] : ['bad', 'Em risco'];
    return `<section class="panel pad" style="display:flex;flex-direction:column;gap:6px">
      <div class="sec-head"><h3 class="hrow">Registro de segurança${h.btn}</h3><span class="chip ${st[0]}">${st[1]} · ${rv.length} infraç${rv.length === 1 ? 'ão' : 'ões'} em 8 semanas</span></div>${h.box}
      ${rv.length ? `<div class="ledger">${rv.slice().reverse().map(v => `<div class="li"><div><div>${esc(v.text)}</div><div class="muted" style="font-size:12.5px">Dia ${v.day}${v.caught ? ` · pega na fiscalização · multa ${fmt(v.fine)}` : ' · não fiscalizada'}</div></div><span class="chip ${v.caught ? 'bad' : 'warn'}">${v.caught ? 'Multada' : 'Registrada'}</span></div>`).join('')}</div>` : '<p class="muted" style="margin:0;font-size:13px">Nenhuma infração de jornada nas últimas 8 semanas.</p>'}
      ${rv.length >= 3 ? '<p style="margin:0;font-size:13px"><b>Em risco:</b> na vida real, várias infrações seguidas levam a advertência, perda de bônus e até demissão. Respeite as horas nas próximas semanas para limpar o registro.</p>' : ''}
    </section>`;
  })()}
  <section class="panel pad" style="display:flex;flex-direction:column;gap:6px">
    <div class="sec-head"><h3>Histórico de empresas</h3><button class="btn sm" data-act="new-contract">Trocar de contrato</button></div>
    <div class="ledger">${timeline}</div>
  </section>`;
}

function empresasView() {
  const cur = activeContract();
  const list = S.companies.map(co => {
    const ks = S.contracts.filter(k => k.companyId === co.id);
    const isCur = cur && cur.companyId === co.id;
    return `<div class="panel pad" style="display:flex;flex-direction:column;gap:6px">
      <div class="row between"><div><h3>${esc(co.name)}</h3><div class="muted" style="font-size:13px">${[co.hq, co.dot].filter(Boolean).map(esc).join(' · ') || 'Sem sede cadastrada'}</div></div>${isCur ? '<span class="chip ok">Empregador atual</span>' : ks.length ? `<span class="chip">${ks.length} contrato${ks.length === 1 ? '' : 's'} anterior${ks.length === 1 ? '' : 'es'}</span>` : '<span class="chip">Sem contrato</span>'}</div>
      ${co.notes ? `<p class="muted" style="margin:0;font-size:13px">${esc(co.notes)}</p>` : ''}
      <div class="row"><button class="btn sm" data-editco="${esc(co.id)}">Editar</button>${!ks.length ? `<button class="btn sm danger" data-delco="${esc(co.id)}">Excluir</button>` : ''}${!isCur ? `<button class="btn sm" data-act="new-contract" data-co="${esc(co.id)}">Contratar por esta empresa</button>` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="row between"><p class="muted" style="margin:0;font-size:13.5px">Empresas cadastradas aparecem como opção nos contratos.</p><button class="btn primary sm" data-editco="">Cadastrar empresa</button></div>${list}`;
}

function contratosView() {
  const c = activeContract();
  const past = S.contracts.filter(k => k.id !== S.currentContractId).sort((a, b) => b.startDay - a.startDay);
  return `<div class="panel pad row between">
      <div><div class="eyebrow">Contrato ativo</div><h3>${esc(companyName(c))}</h3><div class="muted" style="font-size:13px">${esc(shortCls(c.classification))} · ${contractPeriod(c)} · ${tripsOfContract(c.id).length} viagens</div></div>
      <button class="btn sm" data-act="new-contract">Trocar de contrato</button>
    </div>
    ${hint('Cada viagem de caminhão usa este contrato no lançamento e guarda as condições. Mudar algo aqui vale para as próximas viagens.')}
    ${contractEditor(c)}
    ${past.length ? `<div class="sec-head"><h3>Contratos anteriores</h3></div>${past.map(k => `<details class="week"><summary><div><b>${esc(companyName(k))}</b><div class="muted" style="font-size:13px">${contractPeriod(k)} · ${esc(shortCls(k.classification))}</div></div><span class="chip">${esc(k.endReason || 'Encerrado')}</span></summary>
      <div class="body"><table class="bk"><tbody>
        <tr><td>Classificação</td><td>${esc(k.classification)}</td></tr><tr><td>Operação</td><td>${esc(k.operation)}</td></tr>
        <tr><td>Remuneração</td><td>${esc(payFormShort(k.terms))}</td></tr><tr><td>Tipo fiscal</td><td>${taxTypeFor(k.classification) === '1099' ? '1099 (autônomo)' : 'W-2 (empregado)'}</td></tr>
        <tr><td>Combustível / pedágio / hotel</td><td>${['fuel', 'tolls', 'hotel'].map(x => k.terms.expenses[x] === 'company' ? 'empresa' : 'motorista').join(' / ')}</td></tr>
        <tr><td>Caminhão</td><td>${esc(k.truck || '—')}</td></tr><tr><td>Viagens</td><td>${tripsOfContract(k.id).length}</td></tr>
      </tbody></table>${tripsOfContract(k.id).length ? '' : `<div class="row"><button class="btn sm danger" data-delct="${esc(k.id)}">Excluir contrato</button></div>`}</div></details>`).join('')}` : ''}`;
}

function contractEditor(c) {
  const i = S.contracts.indexOf(c), P = `contracts.${i}`, T = `${P}.terms`, tm = c.terms, k = tm.contract, X = k.extras, L = S.settings.lists;
  const pk = E.presetKeyFor(c.classification), w2 = taxTypeFor(c.classification) === 'w2';
  const exp = EXPERIENCE.find(e => e[0] === S.profile.experience) || EXPERIENCE[0];
  const payer = (key, label) => F.sel(`${T}.expenses.${key}`, label, [['company', 'Empresa paga'], ['driver', 'Motorista paga']]);
  const ex = tm.expenses, who = x => ex[x] === 'company' ? 'empresa' : 'motorista';
  const extras = [X.layoverOn && `layover ${fmt(X.layoverRate)}/dia`, X.breakdownOn && `quebra ${fmt(X.breakdownRate)}/h`, X.tarpOn && `lona ${fmt(X.tarpRate)}`].filter(Boolean);
  const B = tm.benefits;
  return `
  ${mod('Vínculo', 'Com quem e como o motorista trabalha.', null,
    F.sel(`${P}.companyId`, 'Empresa contratante', S.companies.map(co => [co.id, co.name]), { full: true }) +
    F.sel(`${P}.classification`, 'Classificação do vínculo', CLASSIFICATIONS.map(x => [x, x]), { full: true }) +
    F.sel(`${P}.operation`, 'Especificação da operação', L.operation.map(x => [x, x])) +
    hint(`Tipo fiscal: <b>${w2 ? 'W-2, empregado' : '1099, autônomo'}</b>, definido pela classificação.`) +
    F.num(`${P}.startDay`, 'Início do contrato (dia do jogo)', { step: 1 }) + F.num(`${P}.renomeLevel`, 'Renome na empresa', { step: 1 }) +
    F.text(`${P}.truck`, 'Caminhão', { ph: 'Modelo do caminhão' }) + F.text(`${P}.trailer`, 'Trailer', { ph: 'Modelo do trailer' }) +
    `<div class="full row"><button class="btn" data-ctpreset="${pk}">Restaurar condições padrão de ${esc(E.PRESETS[pk])}</button></div>`,
    `${shortCls(c.classification)} · ${c.operation}`)}
  ${mod('Remuneração', PAY_HELP[k.mode] || '', null,
    F.sel(`${T}.contract.mode`, 'Forma de pagamento', PAY_FORMS, { full: true }) +
    (k.mode === 'weekly' ? F.num(`${T}.contract.weekly.value`, 'Valor fixo por semana', { money: true }) +
      toggleNum(`${T}.contract.weekly.commissionOn`, `${T}.contract.weekly.commission`, 'Comissão sobre o frete', { pct: true }) : '') +
    (k.mode === 'hourly' ? F.num(`${T}.contract.hourly.rate`, 'Valor por hora', { money: true, hint: 'Mercado local 2026: $22–32/h.' }) +
      toggleNum(`${T}.contract.hourly.commissionOn`, `${T}.contract.hourly.commission`, 'Comissão sobre o frete', { pct: true }) +
      toggleNum(`${T}.contract.hourly.dailyCapOn`, `${T}.contract.hourly.dailyCap`, 'Máximo de horas pagas por dia', { hint: 'Padrão local: 10h (FMCSA permite até 14h de jornada).' }) +
      toggleNum(`${T}.contract.hourly.weeklyCapOn`, `${T}.contract.hours`, 'Máximo de horas pagas por semana', { hint: 'Contrato padrão: 50h.' }) +
      toggleNum(`${T}.contract.hourly.overtimeOn`, `${T}.contract.hourly.otAfter`, 'Hora extra após (horas na semana)', { hint: 'Motoristas são isentos de hora extra pela FLSA; ligue só se a empresa paga.' }) +
      (k.hourly.overtimeOn ? F.num(`${T}.contract.hourly.otMult`, 'Multiplicador da hora extra') : '') : '') +
    (k.mode === 'cpm' ? F.num(`${T}.contract.cpm.rate`, 'Valor por milha', { money: true, hint: `Faixa para ${esc(exp[1].toLowerCase())}: ${fmt(exp[2])}–${fmt(exp[3])}/mi.` }) +
      `<div class="field" style="justify-content:end"><button class="btn" data-act="suggest-cpm">Usar CPM da experiência (${fmt((exp[2] + exp[3]) / 2)})</button></div>` +
      toggleNum(`${T}.contract.cpm.detentionOn`, `${T}.contract.cpm.detentionRate`, 'Detention: por hora de espera', { money: true, hint: 'Mercado: $15–25/h.' }) +
      (k.cpm.detentionOn ? F.num(`${T}.contract.cpm.detentionFree`, 'Horas livres antes do detention') : '') +
      toggleNum(`${T}.contract.cpm.stopOn`, `${T}.contract.cpm.stopRate`, 'Stop pay: por parada extra', { money: true, hint: 'Mercado: $25–75.' }) +
      toggleNum(`${T}.contract.cpm.commissionOn`, `${T}.contract.cpm.commission`, 'Comissão sobre o frete', { pct: true }) : '') +
    (k.mode === 'percent' ? F.num(`${T}.contract.percent.commission`, 'Percentual do frete para o motorista', { pct: true, hint: 'Empresa: 25–30%. Lease e owner-operator recebem a maior parte, mas pagam o caminhão.' }) : '') +
    (k.mode !== 'weekly' ? toggleNum(`${T}.contract.minimum.on`, `${T}.contract.minimum.value`, 'Mínimo garantido por semana', { money: true, hint: 'Comum: $1.100–1.500.' }) : ''),
    payFormShort(tm) + (k.mode !== 'weekly' && k.minimum.on ? ` · mínimo ${fmt(k.minimum.value)}` : ''))}
  ${mod('Pagamentos extras', 'Acessoriais pagos pela empresa, lançados em cada viagem.', null,
    toggleNum(`${T}.contract.extras.layoverOn`, `${T}.contract.extras.layoverRate`, 'Layover: por dia parado', { money: true, hint: 'Mercado: $75–300/dia.' }) +
    toggleNum(`${T}.contract.extras.breakdownOn`, `${T}.contract.extras.breakdownRate`, 'Breakdown: por hora de quebra', { money: true }) +
    toggleNum(`${T}.contract.extras.tarpOn`, `${T}.contract.extras.tarpRate`, 'Tarp pay: por carga com lona', { money: true, hint: 'Só em flatbed: $50–100.' }),
    extras.join(' · ') || 'Nenhum')}
  ${mod('Bônus da empresa', 'Renome e programa de segurança.', null,
    toggleNum(`${T}.renome.on`, `${T}.renome.perLevel`, 'Bônus por nível de renome', { pct: true, hint: `Nível ${c.renomeLevel || 1} × ${fmtN(tm.renome.perLevel)}% = ${fmtN(E.n(tm.renome.perLevel) * Math.max(1, E.n(c.renomeLevel) || 1))}% sobre salário base e comissão.` }) +
    (toggleNum(`${T}.safety.on`, `${T}.safety.amount`, 'Bônus de segurança', { money: true, hint: 'Pago ao completar as semanas seguidas sem multa nem dano.' }) +
      (tm.safety.on ? F.num(`${T}.safety.weeks`, 'Semanas seguidas', { step: 1, hint: '13 semanas = um trimestre.' }) : '')),
    [tm.renome.on && `renome ${fmtN(E.n(tm.renome.perLevel) * Math.max(1, E.n(c.renomeLevel) || 1))}%`, tm.safety.on && `segurança ${fmt(tm.safety.amount)} a cada ${tm.safety.weeks} semanas`].filter(Boolean).join(' · ') || 'Nenhum')}
  ${`
  ${mod('Quem paga cada despesa', 'Despesas das viagens de caminhão neste contrato.', null,
    payer('fuel', 'Combustível') + payer('tolls', 'Pedágios') + payer('hotel', 'Hotel') + payer('fines', 'Multas de trânsito') +
    F.sel(`${T}.expenses.damage`, 'Danos à carga e ao caminhão', [['deductible', 'Motorista paga a franquia'], ['driver', 'Motorista paga tudo'], ['company', 'Empresa paga']]) +
    (ex.damage === 'deductible' ? F.num(`${T}.expenses.deductible`, 'Franquia por ocorrência', { money: true, hint: 'Comum: $500–1.000.' }) : ''),
    `Combustível: ${who('fuel')} · pedágio: ${who('tolls')} · hotel: ${who('hotel')} · danos: ${ex.damage === 'deductible' ? 'franquia ' + fmt(ex.deductible) : ex.damage === 'company' ? 'empresa' : 'motorista'}`)}
  ${mod('Benefícios e per diem', 'Descontados do contracheque ou pagos sem imposto.', null,
    toggleNum(`${T}.benefits.healthOn`, `${T}.benefits.health`, 'Plano de saúde por semana', { money: true }) +
    toggleNum(`${T}.benefits.k401On`, `${T}.benefits.k401Pct`, '401(k) · aposentadoria', { pct: true }) +
    toggleNum(`${T}.perDiem.on`, `${T}.perDiem.rate`, 'Per diem por noite fora de casa', { money: true, hint: 'IRS 2026: $80/dia. Marque "Dormiu fora de casa" na viagem.' }),
    [B.healthOn && `saúde ${fmt(B.health)}/sem`, B.k401On && `401(k) ${fmtN(B.k401Pct)}%`, tm.perDiem.on && `per diem ${fmt(tm.perDiem.rate)}`].filter(Boolean).join(' · ') || 'Nenhum')}
  ${mod('Custos operacionais do caminhão', 'Para lease e owner-operator, que pagam o próprio caminhão.', `${T}.opCosts.on`,
    F.num(`${T}.opCosts.maintenance`, 'Manutenção por milha', { money: true, hint: 'ATRI 2025: $0,404/mi.' }) +
    F.num(`${T}.opCosts.tires`, 'Pneus por milha', { money: true, hint: 'ATRI 2025: $0,05/mi.' }) +
    F.num(`${T}.opCosts.insurance`, 'Seguro por milha', { money: true }) +
    F.num(`${T}.opCosts.truckWeekly`, 'Parcela ou leasing por semana', { money: true }) +
    F.num(`${T}.opCosts.otherWeekly`, 'Licenças, IFTA, ELD e escrow por semana', { money: true }),
    tm.opCosts.on ? `${fmt(E.n(tm.opCosts.maintenance) + E.n(tm.opCosts.tires) + E.n(tm.opCosts.insurance))}/mi + ${fmt(E.n(tm.opCosts.truckWeekly) + E.n(tm.opCosts.otherWeekly))}/semana` : (w2 ? 'Desligado: o caminhão é da empresa' : 'Desligado'))}`}`;
}

function companyForm(id) {
  const co = id ? S.companies.find(x => x.id === id) : { name: '', hq: '', dot: '', notes: '' };
  openModal(`<div class="row between"><h2>${id ? 'Editar empresa' : 'Cadastrar empresa'}</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <div class="grid">
      <div class="field full">${(L => L.row + L.box)(labRow('company.name', 'Nome da empresa', 'co_name'))}<input id="co_name" value="${esc(co.name)}" placeholder="Ex.: ADM Transport"></div>
      <div class="field">${(L => L.row + L.box)(labRow('company.hq', 'Sede (cidade / estado)', 'co_hq'))}<input id="co_hq" value="${esc(co.hq)}" placeholder="Carson City / NV"></div>
      <div class="field">${(L => L.row + L.box)(labRow('company.dot', 'USDOT / MC (opcional)', 'co_dot'))}<input id="co_dot" value="${esc(co.dot)}"></div>
      <div class="field full">${(L => L.row + L.box)(labRow('company.notes', 'Observações', 'co_notes'))}<input id="co_notes" value="${esc(co.notes)}" placeholder="Ex.: frota de reefer, base em Reno"></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div>`, sh => {
    sh.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    sh.querySelector('[data-ok]').onclick = () => {
      const v = k => sh.querySelector('#co_' + k).value.trim();
      if (!v('name')) { toast('Informe o nome da empresa.'); return; }
      commit(st => {
        const data = { name: v('name'), hq: v('hq'), dot: v('dot'), notes: v('notes') };
        if (id) Object.assign(st.companies.find(x => x.id === id), data); else st.companies.push({ id: uid(), ...data });
      });
      closeModal(); toast(id ? 'Empresa atualizada' : 'Empresa cadastrada');
    };
  });
}

function newContractFlow(companyId) {
  const cur = activeContract(), L = S.settings.lists;
  openModal(`<div class="row between"><h2>Trocar de contrato</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p class="muted" style="margin:0;font-size:13.5px">O contrato atual com ${esc(companyName(cur))} é encerrado na véspera do início do novo. Viagens já lançadas continuam com as condições antigas.</p>
    <div class="grid">
      <div class="field full">${(L => L.row + L.box)(labRow('nc.co', 'Empresa', 'nc_co'))}<select id="nc_co">${S.companies.map(co => `<option value="${co.id}" ${co.id === (companyId || cur.companyId) ? 'selected' : ''}>${esc(co.name)}</option>`).join('')}<option value="__new">+ Cadastrar nova empresa</option></select></div>
      <div class="field full" id="nc_newbox" hidden><label for="nc_name">Nome da nova empresa</label><input id="nc_name" placeholder="Ex.: Sierra Freight"></div>
      <div class="field full">${(L => L.row + L.box)(labRow('nc.cls', 'Classificação do vínculo', 'nc_cls'))}<select id="nc_cls">${CLASSIFICATIONS.map(x => `<option ${x === cur.classification ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field">${(L => L.row + L.box)(labRow('nc.op', 'Operação', 'nc_op'))}<select id="nc_op">${L.operation.map(x => `<option ${x === cur.operation ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field">${(L => L.row + L.box)(labRow('nc.day', 'Início (dia do jogo)', 'nc_day'))}<input id="nc_day" type="number" step="1" value="${S.gameDay}"></div>
      <div class="field full">${(L => L.row + L.box)(labRow('nc.reason', 'Motivo da saída do contrato atual', 'nc_reason'))}<select id="nc_reason">${['Mudança de empresa', 'Promoção / novo vínculo', 'Pedido de demissão', 'Demissão', 'Fim do contrato'].map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="field full">${(L => L.row + L.box)(labRow('nc.terms', 'Condições do novo contrato'))}
        <label class="inline-opt"><input type="radio" name="nc_terms" value="preset" checked> Padrão da classificação escolhida</label>
        <label class="inline-opt"><input type="radio" name="nc_terms" value="copy"> Copiar as condições do contrato atual</label></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Iniciar contrato</button></div>`, sh => {
    sh.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    sh.querySelector('#nc_co').onchange = e => { sh.querySelector('#nc_newbox').hidden = e.target.value !== '__new'; };
    sh.querySelector('[data-ok]').onclick = () => {
      let coId = sh.querySelector('#nc_co').value;
      const newName = sh.querySelector('#nc_name').value.trim();
      if (coId === '__new' && !newName) { toast('Informe o nome da nova empresa.'); return; }
      const cls = sh.querySelector('#nc_cls').value, op = sh.querySelector('#nc_op').value;
      const start = Math.max(1, parseInt(sh.querySelector('#nc_day').value) || S.gameDay);
      const copy = sh.querySelector('input[name="nc_terms"]:checked').value === 'copy';
      const reason = sh.querySelector('#nc_reason').value;
      commit(st => {
        if (coId === '__new') { coId = uid(); st.companies.push({ id: coId, name: newName, hq: '', dot: '', notes: '' }); }
        const old = st.contracts.find(x => x.id === st.currentContractId);
        if (old) { old.endDay = Math.max(old.startDay, start - 1); old.endReason = reason; }
        const terms = copy && old ? clone(old.terms) : presetTermsFor(E.presetKeyFor(cls), null, opIsOtr(op));
        const nc = { id: uid(), companyId: coId, classification: cls, operation: op, startDay: start, endDay: null, truck: copy && old ? old.truck : '', trailer: copy && old ? old.trailer : '', renomeLevel: 1, terms };
        st.contracts.push(nc); st.currentContractId = nc.id;
      });
      closeModal(); ctab = 'contratos'; render(); toast('Novo contrato ativo');
    };
  });
}
