/* ---------- Eventos ---------- */
document.querySelector('nav.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab; try { sessionStorage.setItem('ats-tab', tab); } catch (x) {}
  render(); window.scrollTo({ top: 0 });
});
$('#fab').addEventListener('click', () => openTrip());
$('#dayPlus').addEventListener('click', () => { if (!S) return; commit(st => { st.gameDay += 1; autoPay(st); }); });
$('#dayMinus').addEventListener('click', () => { if (!S || S.gameDay <= 1) return; commit(st => { st.gameDay -= 1; }); });

$('#view').addEventListener('click', async e => {
  const el = e.target.closest('[data-goto],[data-act],[data-edit],[data-pay],[data-delweek],[data-delcity],[data-dellist],[data-addlist],[data-ctab],[data-editco],[data-delco],[data-delct],[data-ctpreset],[data-modt]'); if (!el) return;
  if (el.dataset.goto) { tab = el.dataset.goto; render(); window.scrollTo({ top: 0 }); return; }
  if (el.dataset.modt) {
    const key = el.dataset.modt, open = !openMods.has(key);
    open ? openMods.add(key) : openMods.delete(key);
    el.setAttribute('aria-expanded', open);
    el.querySelector('p').textContent = open || !el.dataset.sum ? el.dataset.desc : el.dataset.sum;
    el.closest('.mod').querySelector('.mod-b').hidden = !open;
    return;
  }
  if (el.dataset.ctab) { ctab = el.dataset.ctab; try { sessionStorage.setItem('ats-ctab', ctab); } catch (x) {} return render(); }
  if (el.dataset.editco !== undefined) return companyForm(el.dataset.editco || null);
  if (el.dataset.delco) {
    if (!await confirmBox('Excluir empresa?', 'A empresa sai da lista de opções.', 'Excluir', true)) return;
    return commit(st => { st.companies = st.companies.filter(x => x.id !== el.dataset.delco); });
  }
  if (el.dataset.delct) {
    if (!await confirmBox('Excluir contrato?', 'O contrato anterior sai do histórico. Ele não tem viagens ligadas.', 'Excluir', true)) return;
    return commit(st => { st.contracts = st.contracts.filter(x => x.id !== el.dataset.delct); });
  }
  if (el.dataset.ctpreset) {
    const key = el.dataset.ctpreset, label = E.PRESETS[key];
    if (!await confirmBox(`Aplicar condições de ${esc(label)}?`, `<p style="margin:0">Remuneração, quem paga as despesas, benefícios, bônus e custos do caminhão deste contrato voltam ao padrão de ${esc(label)}.</p><p class="muted" style="margin:8px 0 0;font-size:13px">Viagens já lançadas continuam como foram lançadas.</p>`, 'Aplicar')) return;
    commit(st => { const c = st.contracts.find(x => x.id === st.currentContractId); c.terms = presetTermsFor(key, c.terms, opIsOtr(c.operation)); });
    return toast('Condições aplicadas');
  }
  if (el.dataset.dellist) {
    const [key, i] = el.dataset.dellist.split(':');
    if (S.settings.lists[key].length <= 1) return toast('A lista precisa ter pelo menos uma opção.');
    return commit(st => { st.settings.lists[key].splice(+i, 1); });
  }
  if (el.dataset.addlist) {
    const key = el.dataset.addlist, inp = document.getElementById('new_' + key), v = inp.value.trim();
    if (!v) return; if (S.settings.lists[key].includes(v)) return toast('Essa opção já existe.');
    return commit(st => st.settings.lists[key].push(v));
  }
  if (el.dataset.edit) return openTrip(el.dataset.edit);
  if (el.dataset.pay) { commit(st => { const p = st.payroll.find(x => x.id === el.dataset.pay); if (p) payEntry(st, p, st.gameDay); }); return toast('Holerite depositado'); }
  if (el.dataset.delcity !== undefined) return commit(st => st.settings.cities.splice(+el.dataset.delcity, 1));
  if (el.dataset.delweek) {
    if (!await confirmBox('Excluir semana?', 'A semana sai do histórico. Holerite e saldo não mudam.', 'Excluir', true)) return;
    const id = el.dataset.delweek; H = H.filter(w => w.id !== id); saveLocal(); deleteWeekRemote(id); render(); return;
  }
  const a = el.dataset.act;
  if (await accountAction(a, el)) return;
  if (a === 'drafts') return draftsFlow();
  if (a === 'new-trip') openTrip();
  if (a === 'new-contract') return newContractFlow(el.dataset.co);
  if (a === 'suggest-cpm') { const ex = EXPERIENCE.find(x => x[0] === S.profile.experience) || EXPERIENCE[0]; commit(st => { st.contracts.find(x => x.id === st.currentContractId).terms.contract.cpm.rate = E.r2((ex[2] + ex[3]) / 2); }); toast('CPM ajustado pela experiência'); }
  if (a === 'close-week') closeWeekFlow();
  if (a === 'pay-ready') { commit(st => st.payroll.filter(p => p.status !== 'paid' && p.payday <= st.gameDay).forEach(p => payEntry(st, p, p.payday))); toast('Holerite depositado'); }
  if (a === 'adjust') adjustFlow();
  if (a === 'export') exportFlow();
  if (a === 'import') importFlow();
  if (a === 'add-city') { const inp = $('#newCity'); const v = inp.value.trim(); if (v && !S.settings.cities.includes(v)) commit(st => st.settings.cities.push(v)); }
  if (a === 'reset-rules') { if (await confirmBox('Restaurar regras gerais?', 'Impostos, custos de vida, pay lag, jornada e calendário voltam ao padrão. Contratos, empresas, cidades, viagens e saldo continuam.', 'Restaurar')) commit(st => { const c = st.settings.cities, L = st.settings.lists; st.settings = E.defaults(); st.settings.cities = c; st.settings.lists = L; TERM_KEYS.forEach(k => delete st.settings[k]); }); }
  if (a === 'start-blank') return newCareerFlow();
  if (a === 'import-sheet') importSheetFlow();
  if (a === 'sheet-template') downloadTemplate();
  if (a === 'export-sheet') exportSheet();
  if (a === 'wipe') {
    if (!await confirmBox('Apagar tudo?', 'Ficha, viagens, holerites e histórico serão apagados nesta conta. Exporte antes se quiser guardar.', 'Apagar tudo', true)) return;
    const ids = H.map(w => w.id); S = null; H = []; clearLocal(); render();
    await wipeRemote(ids);
  }
});
$('#view').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'accPass') { e.preventDefault(); document.querySelector('[data-act="acc-in"]').click(); }
  if (e.target.id === 'newCity') { e.preventDefault(); document.querySelector('[data-act="add-city"]').click(); }
  if (e.target.id && e.target.id.startsWith('new_')) { e.preventDefault(); document.querySelector(`[data-addlist="${e.target.id.slice(4)}"]`).click(); }
});
$('#view').addEventListener('change', e => {
  const el = e.target; const path = el.dataset.bind; if (!path) return;
  let v = el.dataset.type === 'bool' ? el.checked : el.dataset.type === 'num' ? E.n(el.value) : el.value;
  if (path === 'gameDay') v = Math.max(1, Math.round(v));
  if (path === 'settings.payroll.lagWeeks') v = Math.max(0, Math.round(v));
  commit(st => {
    setP(path, v);
    if (path === 'gameDay') autoPay(st);
    if ((path === 'settings.loan.on' && v) || path === 'settings.loan.freq') { if (!st.career.loanNext || path === 'settings.loan.freq') st.career.loanNext = st.gameDay + loanPeriod(st.settings); }
    if (path === 'career.loanNext') st.career.loanNext = Math.max(1, Math.round(v));
  }, { view: el.hasAttribute('data-rerender') || path === 'gameDay' || path.startsWith('settings.loan') || path === 'bank.loanTotal' || path === 'career.loanNext' || path === 'bank.opening' });
});

/* ---------- Medidas do cabeçalho (posição do aviso e da navegação no PC) ---------- */
function measureChrome() {
  const hdr = document.querySelector('header.sign'), nav = document.querySelector('nav.tabs'), root = document.documentElement;
  const h = hdr.offsetHeight, top = getComputedStyle(nav).position === 'sticky' ? nav.offsetHeight : 0;
  root.style.setProperty('--hdr-h', h + 'px');
  root.style.setProperty('--toast-top', (h + top + 10) + 'px');
}
window.addEventListener('resize', measureChrome);
if (window.ResizeObserver) new ResizeObserver(measureChrome).observe(document.querySelector('header.sign'));

/* ---------- Início ---------- */
try { const t = sessionStorage.getItem('ats-tab'); if (t) tab = t; } catch (e) {}
loadLocal();
store.mode = window.claude && window.claude.use ? 'claude' : cloudCfg() ? 'cloud' : 'local';
if (store.mode === 'cloud' && !cloud.session) store.status = 'out';
render();
measureChrome();
// Links de e-mail (confirmar conta, trocar senha) chegam com a sessão no endereço; depois conecta a sincronização.
cloudFromUrl().then(async r => {
  await connectSync();
  if (store.mode !== 'claude') render();
  if (r && r.error) toast('O link não funcionou: ' + r.error);
  else if (r && r.type === 'recovery') newPasswordFlow('Crie uma nova senha');
  else if (r) toast('Conta confirmada e conectada');
});
