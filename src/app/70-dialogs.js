/* ---------- Modais ---------- */
function openModal(html, onMount) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="ov" data-ovl><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const sheet = root.querySelector('.sheet');
  root.querySelector('.ov').addEventListener('click', e => { if (e.target.hasAttribute('data-ovl')) closeModal(); });
  onMount && onMount(sheet);
  const f = sheet.querySelector('input,select,button'); f && f.focus({ preventScroll: true });
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-help]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const box = document.getElementById(b.dataset.help); if (!box) return;
  const open = box.hidden; box.hidden = !open; b.setAttribute('aria-expanded', open);
}, true);
function confirmBox(title, msg, ok = 'Confirmar', danger = false) {
  return new Promise(res => {
    openModal(`<h2>${title}</h2><div>${msg}</div><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button></div>`, sh => {
      sh.querySelector('[data-x]').onclick = () => { closeModal(); res(false); };
      sh.querySelector('[data-ok]').onclick = () => { closeModal(); res(true); };
    });
  });
}
function toast(msg) {
  const r = $('#toastRoot'); r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => { r.innerHTML = ''; }, 2600);
}

// Assistente de nova carreira: o mínimo para começar com saldo e contrato corretos
function newCareerFlow() {
  const d = E.defaults(), weekly = E.n(d.costs.housing.val);
  const f = (key, label, id, input) => { const L = labRow(key, label, id); return `<div class="field">${L.row}${input}${L.box}</div>`; };
  openModal(`<div class="row between"><h2>Nova carreira</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p class="muted" style="margin:0;font-size:13.5px">Só o essencial para começar. Salário, despesas e todas as outras regras ficam em Carreira e em Ajustes.</p>
    <div class="grid">
      ${f('profile.name', 'Nome do motorista', 'nw_name', '<input id="nw_name" type="text" placeholder="Ex.: Altair Junior">')}
      ${f('company.name', 'Empresa', 'nw_co', '<input id="nw_co" type="text" placeholder="Ex.: ADM Transport">')}
      <div class="field full">${(L => `${L.row}<select id="nw_cls">${CLASSIFICATIONS.map((x, i) => `<option value="${PRESET_KEYS[i]}">${esc(x)}</option>`).join('')}</select>${L.box}`)(labRow('nc.cls', 'Classificação do vínculo', 'nw_cls'))}</div>
      ${f('nc.op', 'Operação', 'nw_op', `<select id="nw_op">${E.OPERATIONS.map(x => `<option>${esc(x)}</option>`).join('')}</select>`)}
      ${f('gameDay', 'Dia atual do jogo', 'nw_day', '<input id="nw_day" type="number" inputmode="numeric" step="1" min="1" value="1">')}
      <div class="field full">${(L => `${L.row}<div class="money"><input id="nw_bal" type="number" inputmode="decimal" step="any" value="3000"></div><span class="muted" style="font-size:12px">A moradia (${fmt(weekly)} por semana) sai toda segunda, e o primeiro pagamento só chega na sexta da semana seguinte. Comece com pelo menos ${fmt(weekly * 2)}.</span>${L.box}`)(labRow('bank.opening', 'Saldo inicial', 'nw_bal'))}</div>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar carreira</button></div>`, sh => {
    sh.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    sh.querySelector('[data-ok]').onclick = () => {
      const v = id => sh.querySelector('#nw_' + id).value.trim();
      const st = newCareer({ name: v('name'), company: v('co'), clsKey: v('cls'), operation: v('op'), gameDay: v('day'), opening: E.n(v('bal')) });
      closeModal(); replaceAll(st, []); tab = 'painel'; render(); toast('Carreira criada. Lance a primeira viagem.');
    };
  });
}

// prefill: campos que já vêm preenchidos (rascunho vindo do jogo); onSaved: chamado com a viagem lançada
function openTrip(id, prefill = null, onSaved = null) {
  const s = SS();
  const editing = id ? S.week.trips.find(t => t.id === id) : null;
  const last = S.week.trips.slice().sort((a, b) => a.day - b.day).at(-1);
  const garage = ((companyOf(activeContract()) || {}).hq || '').split('/')[0].trim();
  const t = editing ? clone(editing) : { id: uid(), day: S.gameDay, type: 'company', origin: last ? last.dest : garage, dest: '', status: 'Excelente', miles: '', freight: '', bonus: 0, hours: 0, drive: 0, brk: false, away: isOtrOp(), detention: 0, stops: 0, layover: 0, breakdown: 0, tarp: false, fuel: 0, tolls: 0, breakfast: 0, lunch: 0, dinner: 0, hotel: 0, fines: 0, damage: 0, contractId: S.currentContractId };
  if (prefill && !editing) Object.assign(t, prefill);
  if (!s.borrowed.on && !editing) t.type = 'company';
  // regras congeladas na viagem: contrato, regra do carro, quem paga e frete de mercado
  if (!t.contract && (!editing || t.type !== 'borrowed')) Object.assign(t, E.snapshotFor('company', s));
  if (!t.car && (!editing || t.type === 'borrowed')) Object.assign(t, E.snapshotFor('borrowed', s));
  if (!editing) t.rules = E.rulesSnapshot(s);
  const origMode = editing && t.type !== 'borrowed' ? E.contractOf(t, s).mode : null;
  const modeLabel = m => (PAY_FORMS.find(p => p[0] === m) || [m, m])[1];
  const num = (k, label, money = true, step = 'any', extraAttr = '') => { const L = labRow('trip.' + k, label, 't_' + k); return `<div class="field" ${extraAttr}>${L.row}<div class="${money ? 'money' : ''}"><input id="t_${k}" data-k="${k}" type="number" inputmode="decimal" step="${step}" value="${esc(t[k] || (k === 'miles' || k === 'freight' ? t[k] : ''))}"></div><span class="muted" id="h_${k}" style="font-size:12px"></span>${L.box}</div>`; };
  const chk = (k, label) => { const h = help('trip.' + k, label); return `<span class="chk-row"><label class="inline-opt"><input type="checkbox" data-kb="${k}" ${t[k] ? 'checked' : ''}> ${label}</label>${h.btn}</span>${h.box}`; };
  const LB = (key, label) => labRow(key, label);
  const step = (k, label, on) => `<div class="step ${on ? '' : 'off'}"><div class="lab">${label}</div><div class="ctl"><button type="button" data-dec="${k}" aria-label="Menos ${label}">−</button><b id="st_${k}">${E.n(t[k])}</b><button type="button" data-inc="${k}" aria-label="Mais ${label}">+</button></div></div>`;
  const c = s.costs, X = s.contract.extras;
  openModal(`
    <div class="row between"><h2>${editing ? 'Editar viagem' : 'Nova viagem'}</h2><button class="btn ghost sm" data-x aria-label="Fechar">Fechar</button></div>
    ${s.borrowed.on || t.type === 'borrowed' ? `<div class="field">${(L => L.row + L.box)(LB('trip.type', 'Veículo'))}<div class="seg" role="group" aria-label="Veículo"><button type="button" data-type="company" aria-pressed="${t.type !== 'borrowed'}">Caminhão</button><button type="button" data-type="borrowed" aria-pressed="${t.type === 'borrowed'}">Carro</button></div><span class="muted" id="tFormula" style="font-size:12.5px"></span></div>` : ''}
    <div class="field" data-truck-only ${t.type === 'borrowed' ? 'hidden' : ''}>${(L => L.row + L.box)(LB('trip.contract', 'Contrato desta viagem'))}<div class="row between"><span id="ctInfo" style="font-size:13.5px"></span><button type="button" class="btn sm" data-ctnow hidden>Usar contrato atual</button></div></div>
    <div class="field" data-car-only ${t.type === 'borrowed' ? '' : 'hidden'}>${s.borrowed.ownOn || (t.car && t.car.mode === 'owned') ? `${(L => L.row + L.box)(LB('trip.carmode', 'De quem é o carro'))}<div class="seg" role="group" aria-label="De quem é o carro"><button type="button" data-carmode="borrowed" aria-pressed="${!(t.car && t.car.mode === 'owned')}">Emprestado</button><button type="button" data-carmode="owned" aria-pressed="${!!(t.car && t.car.mode === 'owned')}">Próprio</button></div>` : ''}<div class="row between"><span id="carRule" class="muted" style="font-size:13px"></span><button type="button" class="btn sm" data-carnow hidden>Usar regra atual</button></div></div>
    <div class="grid">
      <div class="field">${(L => L.row + L.box)(labRow('trip.origin', 'Origem', 't_origin'))}<input id="t_origin" data-k="origin" list="cityList" value="${esc(t.origin)}" autocomplete="off"></div>
      <div class="field">${(L => L.row + L.box)(labRow('trip.dest', 'Destino', 't_dest'))}<input id="t_dest" data-k="dest" list="cityList" value="${esc(t.dest)}" autocomplete="off"></div>
      ${num('miles', 'Distância (mi)', false)}
      ${num('freight', 'Frete bruto do jogo')}
      ${num('day', 'Dia do jogo', false, 1)}
      ${num('bonus', 'Bônus')}
    </div>
    <datalist id="cityList">${s.cities.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${(L => L.row + L.box)(LB('trip.meals', 'Refeições e noites em hotel'))}
    <div class="steppers"><span data-meals style="display:contents">${step('breakfast', 'Cafés', c.breakfast.on)}${step('lunch', 'Almoços', c.lunch.on)}${step('dinner', 'Jantas', c.dinner.on)}</span>${step('hotel', 'Noites em hotel', c.hotel.on)}</div>
    <p class="muted" id="mealsAuto" style="margin:-6px 0 0;font-size:12.5px" hidden>Refeições contadas por dia trabalhado (Ajustes › Custos de vida).</p>
    <details class="more" id="detOcc" ${(editing || prefill) && (t.status !== 'Excelente' || E.n(t.fines) || E.n(t.damage) || E.n(t.fuel) || E.n(t.tolls)) ? 'open' : ''}>
      <summary>Entrega, ocorrências e despesas</summary>
      <div class="grid">
        <div class="field">${(L => L.row + L.box)(labRow('trip.status', 'Status da entrega', 't_status'))}<select id="t_status" data-k="status">${E.STATUSES.map(x => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        ${num('fines', 'Multas de trânsito')}
        ${num('damage', 'Danos (carga ou veículo)', true, 'any', 'data-payer="damage"')}
        ${num('fuel', 'Combustível', true, 'any', 'data-payer="fuel"')}
        ${num('tolls', 'Pedágios', true, 'any', 'data-payer="tolls"')}
        <p class="full muted" id="paidByCo" style="margin:0;font-size:12.5px" hidden></p>
      </div>
    </details>
    <details class="more" data-truck-only ${t.type === 'borrowed' ? 'hidden' : ''} id="detHos" ${(editing || prefill) && (E.n(t.drive) || E.n(t.hours) || E.n(t.layover) || E.n(t.breakdown) || E.n(t.detention) || E.n(t.stops) || t.tarp || t.away) ? 'open' : ''}>
      <summary>Jornada e pagamentos extras</summary>
      <div class="grid">
        ${num('hours', 'Horas de serviço (on-duty)', false)}
        ${num('drive', 'Horas de direção', false)}
        ${num('detention', 'Horas de espera nas docas', false, 'any', 'data-mode-only="cpm" hidden')}
        ${num('stops', 'Paradas extras', false, 1, 'data-mode-only="cpm" hidden')}
        <div class="field full checks">${chk('brk', 'Fez a pausa de 30 min')}${chk('away', 'Dormiu fora de casa (per diem)')}${X.tarpOn ? chk('tarp', `Carga com lona (+${fmt(X.tarpRate)})`) : ''}</div>
        ${X.layoverOn ? num('layover', `Dias de layover (${fmt(X.layoverRate)}/dia)`, false) : ''}
        ${X.breakdownOn ? num('breakdown', `Horas de quebra (${fmt(X.breakdownRate)}/h)`, false) : ''}
      </div>
    </details>
    <div class="preview" id="tPrev"></div>
    <div class="row between">${editing ? '<button class="btn danger" data-del>Excluir</button>' : '<span></span>'}<div class="row"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-save>${editing ? 'Salvar' : 'Lançar viagem'}</button></div></div>
  `, sh => {
    const setH = (k, txt) => { const el = sh.querySelector('#h_' + k); if (el) el.textContent = txt || ''; };
    const prev = () => {
      const b = t.type === 'borrowed';
      if (b && !t.car) Object.assign(t, E.snapshotFor('borrowed', s));
      if (!b && !t.contract) Object.assign(t, E.snapshotFor('company', s));
      const k = E.contractOf(t, s), B = E.carRuleOf(t, s), bonusOn = b ? B.bonusOn !== false : k.tripBonus;
      const R = t.rules && t.rules.exp, mk = t.rules && t.rules.market;
      const costs = E.tripCosts(t, s), mf = E.marketFreight(t, s);
      const fEl = sh.querySelector('#tFormula');
      if (fEl) fEl.textContent = b
        ? `Carro: ${fmtN(B.pct)}% do frete${bonusOn ? ' + bônus' : ''} − despesas, fora do contrato.`
        : '';
      if (fEl) fEl.hidden = true;
      sh.querySelectorAll('[data-mode-only]').forEach(el => { el.hidden = b || el.dataset.modeOnly !== k.mode; });
      sh.querySelectorAll('[data-truck-only]').forEach(el => { el.hidden = b; });
      sh.querySelectorAll('[data-car-only]').forEach(el => { el.hidden = !b; });
      const cr = sh.querySelector('#carRule');
      if (cr) cr.textContent = B.mode === 'owned' ? `Próprio: 100% do frete × ${fmtN(B.factor)}, menos ${fmt(B.costPerMile)}/mi do carro, combustível, pedágio, danos e despesas pessoais.`
        : `Emprestado: ${fmtN(B.pct)}% do frete × ${fmtN(B.factor)}. O dono paga combustível, pedágio e danos.`;
      sh.querySelectorAll('[data-carmode]').forEach(bt => bt.setAttribute('aria-pressed', bt.dataset.carmode === (B.mode === 'owned' ? 'owned' : 'borrowed')));
      const ci = sh.querySelector('#ctInfo'), cb = sh.querySelector('[data-ctnow]');
      const tc = S.contracts.find(x => x.id === t.contractId);
      if (ci) ci.innerHTML = `<b>${esc(tc ? companyName(tc) : 'Contrato anterior')}</b> · ${esc(modeLabel(k.mode))}`;
      if (cb) cb.hidden = !editing || (t.contractId === S.currentContractId && JSON.stringify(t.contract) === JSON.stringify(s.contract) && JSON.stringify(t.rules || null) === JSON.stringify(E.rulesSnapshot(s)));
      const cn = sh.querySelector('[data-carnow]'); if (cn) cn.hidden = !b || JSON.stringify(t.car) === JSON.stringify(E.carSnapshot(s, B.mode));
      const paid = (key, label) => setH(key, !b && R && R[key] === 'company' ? `${label} paga pela empresa` : '');
      paid('fuel', 'Despesa'); paid('tolls', 'Despesa'); paid('fines', 'Multa');
      setH('damage', !b && R ? (R.damage === 'deductible' && E.n(t.damage) > E.n(R.deductible) ? `Motorista paga a franquia de ${fmt(R.deductible)}` : R.damage === 'company' ? 'Empresa paga' : '') : '');
      const mfx = b ? E.n(t.freight) * E.n(B.factor) : mf;
      setH('freight', mfx !== E.n(t.freight) ? `Frete de mercado: ${fmt(mfx)}${E.n(t.miles) ? ` (${fmt(mfx / E.n(t.miles))}/mi)` : ''}` : '');
      setH('bonus', bonusOn ? '' : `Bônus desligado para ${b ? 'carro' : 'caminhão'} em Ajustes.`);
      setH('hours', k.mode === 'hourly' ? 'Base do pagamento por hora' + (k.hourly.dailyCapOn ? ` (máx. ${fmtN(k.hourly.dailyCap)}h pagas/dia)` : '') : 'Para o controle de jornada');
      setH('drive', E.n(t.drive) > 11 ? 'Acima do limite de 11h' : '');
      const dayMeals = !b && s.costs.mealsMode === 'day';
      sh.querySelector('[data-meals]').hidden = dayMeals; sh.querySelector('[data-meals]').style.display = dayMeals ? 'none' : 'contents';
      sh.querySelector('#mealsAuto').hidden = !dayMeals;
      const carLent = b && B.mode === 'borrowed';
      const coPays = carLent ? ['fuel', 'tolls', 'damage'] : ['fuel', 'tolls'].filter(x => !b && R && R[x] === 'company');
      sh.querySelectorAll('[data-payer]').forEach(el => { el.hidden = coPays.includes(el.dataset.payer) && !E.n(t[el.dataset.payer]); });
      const pb = sh.querySelector('#paidByCo'); pb.hidden = !coPays.length;
      pb.textContent = carLent ? 'Combustível, pedágio e danos ficam com o dono do carro.' : coPays.length ? `${coPays.map(x => x === 'fuel' ? 'Combustível' : 'Pedágio').join(' e ')} ${coPays.length > 1 ? 'são pagos' : 'é pago'} pela empresa neste contrato.` : '';
      const det = sh.querySelector('#detHos'); if (det && !b && (k.mode === 'hourly' || k.mode === 'cpm') && !det.dataset.auto) { det.open = true; det.dataset.auto = '1'; }
      sh.querySelector('#tPrev').innerHTML = b
        ? (() => {
          const cb = E.carBreakdown(t, s), parts = [];
          parts.push(cb.mode === 'owned' ? `frete de mercado ${fmt(cb.market)}` : `${fmtN(B.pct)}% de ${fmt(cb.market)} = ${fmt(cb.share)}`);
          if (cb.bonus) parts.push(`bônus ${fmt(cb.bonus)}`);
          if (cb.vehicle) parts.push(`− carro ${fmt(cb.vehicle)}`);
          const desp = cb.fuel + cb.tolls + cb.damage + cb.fines + cb.personal;
          if (desp) parts.push(`− despesas ${fmt(desp)}`);
          return `<div><div class="eyebrow">Resultado da viagem de carro</div><span class="muted" style="font-size:13px">${parts.join(' · ')}</span></div><b class="${cb.total < 0 ? 'neg' : 'pos'}">${fmt(cb.total)}</b>`;
        })()
        : (() => {
          const p = E.tripPay(t, s), M = k[k.mode] || {}, crl = E.commissionRule(k), parts = [];
          if (k.mode === 'weekly') parts.push(`fixo de ${fmt(M.value)} entra no fechamento`);
          if (k.mode === 'hourly') parts.push(`${fmtN(M.dailyCapOn ? Math.min(E.n(t.hours), E.n(M.dailyCap)) : E.n(t.hours))}h × ${fmt(M.rate)} = ${fmt(p.base)}`);
          if (k.mode === 'cpm') { parts.push(`${fmtN(t.miles)} mi × ${fmt(M.rate)} = ${fmt(p.base)}`); if (p.detention) parts.push(`espera ${fmt(p.detention)}`); if (p.stops) parts.push(`paradas ${fmt(p.stops)}`); }
          if (crl.on) parts.push(`${fmtN(crl.pct)}% de ${fmt(mf)} = ${fmt(p.commission)}`);
          if (p.layover) parts.push(`layover ${fmt(p.layover)}`); if (p.breakdown) parts.push(`quebra ${fmt(p.breakdown)}`); if (p.tarp) parts.push(`lona ${fmt(p.tarp)}`);
          if (p.bonus) parts.push(`bônus ${fmt(p.bonus)}`);
          return `<div><div class="eyebrow">Ganho bruto da viagem</div><span class="muted" style="font-size:13px">${parts.join(' · ')}${costs.total ? ` · você paga ${fmt(costs.total)} de despesas` : ''}</span></div><b class="pos">${fmt(p.total)}</b>`;
        })();
    };
    prev();
    sh.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; t[k] = e.target.value; prev(); });
    sh.addEventListener('change', e => {
      if (e.target.id === 't_mode') { t.contract = clone(s.contract); t.contract.mode = e.target.value; prev(); return; }
      if (e.target.dataset.kb) { t[e.target.dataset.kb] = e.target.checked; prev(); return; }
      const k = e.target.dataset.k; if (k) { t[k] = e.target.value; prev(); }
    });
    sh.addEventListener('click', e => {
      const el = e.target.closest('button'); if (!el) return;
      if (el.dataset.type) {
        t.type = el.dataset.type; if (!t.rules && !editing) t.rules = E.rulesSnapshot(s);
        sh.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === t.type)); prev();
      }
      if (el.dataset.inc || el.dataset.dec) { const k = el.dataset.inc || el.dataset.dec; t[k] = Math.max(0, E.n(t[k]) + (el.dataset.inc ? 1 : -1)); sh.querySelector('#st_' + k).textContent = t[k]; prev(); }
      if (el.hasAttribute('data-carnow')) { t.car = E.carSnapshot(s, E.carRuleOf(t, s).mode); prev(); }
      if (el.dataset.carmode) { t.car = E.carSnapshot(s, el.dataset.carmode); prev(); }
      if (el.hasAttribute('data-ctnow')) { t.contract = clone(s.contract); t.rules = E.rulesSnapshot(s); t.contractId = S.currentContractId; prev(); }
      if (el.hasAttribute('data-x')) closeModal();
      if (el.hasAttribute('data-save')) {
        const clean = { ...t };
        ['miles', 'freight', 'bonus', 'hours', 'drive', 'detention', 'stops', 'layover', 'breakdown', 'fuel', 'tolls', 'fines', 'damage', 'breakfast', 'lunch', 'dinner', 'hotel'].forEach(k => clean[k] = E.r2(clean[k]));
        clean.day = Math.max(1, parseInt(clean.day) || S.gameDay);
        clean.origin = (clean.origin || '').trim(); clean.dest = (clean.dest || '').trim();
        if (!clean.dest) { toast('Informe o destino da viagem.'); sh.querySelector('#t_dest').focus(); return; }
        commit(st => {
          const i = st.week.trips.findIndex(x => x.id === clean.id);
          if (i >= 0) st.week.trips[i] = clean; else st.week.trips.push(clean);
          [clean.origin, clean.dest].forEach(cn => { if (cn && !st.settings.cities.some(x => x.toLowerCase() === cn.toLowerCase())) st.settings.cities.push(cn); });
        });
        closeModal(); toast(editing ? 'Viagem atualizada' : 'Viagem lançada');
        if (onSaved) onSaved(clean);
      }
      if (el.hasAttribute('data-del')) {
        commit(st => { st.week.trips = st.week.trips.filter(x => x.id !== t.id); });
        closeModal(); toast('Viagem excluída');
      }
    });
  });
}

async function closeWeekFlow() {
  const s = SS(), plan = weekClosePlan(), d = plan.d;
  const payday = s.payroll.lagOn ? E.paydayFor(S.week.start, s) : S.gameDay;
  const ok = await confirmBox(`Fechar semana ${weekLabel(S.week.start).toLowerCase()}?`,
    `<p style="margin:0 0 8px">As viagens vão para o histórico e o diário começa vazio.</p>
     <table class="bk"><tbody>
       <tr><td>Salário bruto${plan.safety ? ' (inclui bônus de segurança ' + fmt(plan.safety) + ')' : ''}</td><td>${fmt(d.revenue)}</td></tr>
       <tr><td>(−) Impostos e descontos</td><td>${fmt(d.deductions.total)}</td></tr>
       <tr class="t"><td>(=) Líquido do holerite</td><td>${fmt(d.takeHome)}</td></tr>
       <tr><td>(−) Despesas e custo de vida</td><td>${fmt(plan.living)}</td></tr>
       <tr class="t"><td>(=) Lucro líquido</td><td>${fmt(d.net)}</td></tr>
     </tbody></table>
     ${plan.viol.length ? `<div class="banner" style="margin-top:10px;flex-direction:column;align-items:flex-start;gap:4px"><b>${plan.viol.length} infraç${plan.viol.length === 1 ? 'ão' : 'ões'} de jornada nesta semana</b><span style="font-size:13px">${plan.viol.map(v => `Dia ${v.day}: ${esc(v.text)}`).join('<br>')}</span><span class="muted" style="font-size:12.5px">${s.hos.penalties ? `Ao fechar: ${s.hos.resetSafety ? 'o bônus de segurança zera; ' : ''}cada infração tem ${fmtN(s.hos.inspectChance)}% de chance de ser pega numa fiscalização, com multa de ${fmt(s.hos.fine)}.` : 'Consequências desligadas: só ficam registradas.'}</span></div>` : ''}
     <div class="preview" style="margin-top:10px"><div><div class="eyebrow">Holerite</div><span class="muted" style="font-size:13px">${s.payroll.lagOn ? 'Pagamento previsto para ' + dayFull(payday) : 'Depositado agora no saldo'}${plan.living ? `. As despesas (${fmt(plan.living)}) saem do saldo agora.` : ''}</span></div><b class="${d.takeHome < 0 ? 'neg' : 'pos'}">${fmt(d.takeHome)}</b></div>`, 'Fechar semana');
  if (!ok) return;
  let week;
  commit(st => {
    const start = st.week.start, trips = st.week.trips;
    week = { id: 'w' + start + '-' + uid().slice(0, 4), start, end: start + 6, trips: clone(trips), dre: d, settings: clone(s), closedDay: st.gameDay, contractId: st.currentContractId };
    const ids = new Set(trips.map(t => 'trip:' + t.id));
    st.ledger.forEach(e => { if (ids.has(e.ref)) e.locked = true; });
    const p = { id: uid(), weekStart: start, amount: d.takeHome, status: 'pending', payday,
      breakdown: { gross: d.revenue, ded: d.deductions.total, takeHome: d.takeHome, living: plan.living, net: d.net, tax: d.taxType, safety: plan.safety } };
    st.payroll.push(p);
    if (plan.living) st.ledger.push({ id: uid(), ref: 'living:' + p.id, day: st.gameDay, desc: `Despesas e custo de vida · semana ${weekLabel(start).toLowerCase()}`, amount: -plan.living, locked: true });
    if (!s.payroll.lagOn) payEntry(st, p, st.gameDay); else autoPay(st);
    st.career.safetyStreak = plan.newStreak;
    compact(st);
    // Fiscalização: sorteio por infração (só com consequências ligadas)
    st.career.violations = st.career.violations || [];
    for (const v of plan.viol) {
      const caught = s.hos.penalties && Math.random() * 100 < E.n(s.hos.inspectChance);
      const fine = caught ? E.r2(E.n(s.hos.fine)) : 0;
      st.career.violations.push({ id: uid(), day: v.day, code: v.code, text: v.text, caught, fine, week: start });
      if (caught && fine) st.ledger.push({ id: uid(), ref: 'fine:' + start, day: st.gameDay, desc: `Multa DOT · ${v.text} (dia ${v.day})`, amount: -fine, locked: true });
    }
    week.violations = plan.viol;
    st.career.k401 = E.r2(E.n(st.career.k401) + E.n(d.deductions.k401));
    st.week = { start: Math.max(E.weekStartOf(st.gameDay, s), start + 7), trips: [] };
  });
  H.push(week); H.sort((a, b) => a.start - b.start); saveLocal(); saveWeekRemote(week);
  const caughtNow = (S.career.violations || []).filter(v => v.week === week.start && v.caught);
  toast(caughtNow.length ? `Semana fechada · fiscalização pegou ${caughtNow.length} infraç${caughtNow.length === 1 ? 'ão' : 'ões'} (${fmt(caughtNow.reduce((a, v) => a + v.fine, 0))} em multas)` : plan.viol.length ? `Semana fechada · ${plan.viol.length} infraç${plan.viol.length === 1 ? 'ão' : 'ões'} registrada${plan.viol.length === 1 ? '' : 's'}, sem fiscalização` : plan.safety ? 'Semana fechada · bônus de segurança incluído' : 'Semana fechada · holerite gerado');
}

function exportFlow() {
  const data = JSON.stringify({ app: 'carreira-realista-ats', version: 1, exportedAt: new Date().toISOString(), state: S, history: H }, null, 2);
  const fallback = () => openModal(`<div class="row between"><h2>Exportar dados</h2><button class="btn ghost sm" data-x>Fechar</button></div><p class="muted" style="margin:0">Copie o texto abaixo e guarde num arquivo .json.</p><textarea id="expTxt" readonly>${esc(data)}</textarea><div class="row" style="justify-content:flex-end"><button class="btn primary" data-copy>Copiar</button></div>`, sh => {
    sh.querySelector('[data-x]').onclick = closeModal;
    sh.querySelector('[data-copy]').onclick = () => { const ta = sh.querySelector('#expTxt'); navigator.clipboard?.writeText(data).then(() => toast('Copiado'), () => { ta.select(); toast('Selecionado. Use Ctrl+C.'); }) ?? (ta.select(), toast('Selecionado. Use Ctrl+C.')); };
  });
  const filename = `carreira-ats-dia-${S.gameDay}.json`;
  // Fora do Claude o navegador baixa o arquivo direto
  if (!window.claude?.use) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Backup baixado'); }
    catch (e) { fallback(); }
    return;
  }
  window.claude.use('downloads').then(dl => {
    if (!dl) return fallback();
    dl.save({ filename, data }).then(() => toast('Arquivo salvo'), e => { if (e && e.code !== 'declined') fallback(); });
  }).catch(fallback);
}
function importFlow() {
  openModal(`<div class="row between"><h2>Importar dados</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <div class="field"><label for="impFile">Arquivo .json exportado</label><input id="impFile" type="file" accept=".json,application/json"></div>
    <div class="field"><label for="impTxt">Ou cole o conteúdo</label><textarea id="impTxt" placeholder='{"app":"carreira-realista-ats", ...}'></textarea></div>
    <p class="muted" style="margin:0;font-size:13px">Importar substitui todos os dados atuais.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-imp>Importar</button></div>`, sh => {
    sh.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    sh.querySelector('#impFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => sh.querySelector('#impTxt').value = r.result; r.readAsText(f); };
    sh.querySelector('[data-imp]').onclick = () => {
      try {
        const o = JSON.parse(sh.querySelector('#impTxt').value);
        if (!o.state || !o.state.settings) throw new Error();
        closeModal(); replaceAll(o.state, o.history || []); toast('Dados importados');
      } catch (e) { toast('Esse arquivo não é um backup válido do app.'); }
    };
  });
}
function adjustFlow() {
  openModal(`<h2>Ajustar saldo</h2>
    <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field">${(L => L.row + L.box)(labRow('adj.amount', 'Valor (negativo para débito)', 'adjAmt'))}<div class="money"><input id="adjAmt" type="number" inputmode="decimal" step="any"></div></div>
      <div class="field">${(L => L.row + L.box)(labRow('adj.day', 'Dia do jogo', 'adjDay'))}<input id="adjDay" type="number" step="1" value="${S.gameDay}"></div>
      <div class="field" style="grid-column:1/-1">${(L => L.row + L.box)(labRow('adj.desc', 'Descrição', 'adjDesc'))}<input id="adjDesc" type="text" placeholder="Ex.: Manutenção, prêmio, compra"></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Lançar</button></div>`, sh => {
    sh.querySelector('[data-x]').onclick = closeModal;
    sh.querySelector('[data-ok]').onclick = () => {
      const amount = E.r2(sh.querySelector('#adjAmt').value);
      if (!amount) { toast('Informe um valor.'); return; }
      const day = parseInt(sh.querySelector('#adjDay').value) || S.gameDay;
      const desc = sh.querySelector('#adjDesc').value.trim() || 'Ajuste manual';
      commit(st => st.ledger.push({ id: uid(), ref: 'adj', day, desc, amount, locked: true }));
      closeModal(); toast('Lançado no extrato');
    };
  });
}
