/* ---------- Viagens do jogo: caixa de entrada dos rascunhos ----------
   Cada entrega lida do jogo chega como rascunho. Aqui você lança (abre o formulário já preenchido),
   ou descarta. Nada entra na carreira sem passar por você. */
const draftList = () => (store.mode === 'cloud' && cloud.session ? cloud.drafts : []);

// Converte o rascunho (formato do leitor de telemetria, docs/telemetria.md) em campos do formulário de viagem
function draftToTrip(d) {
  const x = d.data || {}, n = v => E.r2(E.n(v));
  return {
    type: x.vehicle === 'car' ? 'borrowed' : 'company',
    origin: String(x.origin || '').trim(), dest: String(x.dest || '').trim(),
    miles: n(x.miles), freight: n(x.freight), bonus: n(x.bonus),
    fuel: n(x.fuel), tolls: n(x.tolls), fines: n(x.fines), damage: n(x.damage),
    hours: n(x.hours), drive: n(x.drive),
    status: E.STATUSES.includes(x.status) ? x.status : 'Excelente',
    draftId: d.id
  };
}
const draftTitle = d => { const x = d.data || {}; return `${x.origin || '?'} → ${x.dest || '?'}`; };
const draftWhen = d => { try { return new Date(d.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

function draftsBanner() {
  const n = draftList().length; if (!n) return '';
  const h = help('ui.rascunhos', 'Viagens do jogo');
  return `<div class="banner"><div style="flex:1;min-width:0"><div class="lab-row" style="justify-content:flex-start"><b>${n === 1 ? '1 viagem do jogo' : n + ' viagens do jogo'} para revisar</b>${h.btn}</div><div class="muted" style="font-size:13.5px">Entregas lidas do jogo. Confira e lance, ou descarte.</div>${h.box}</div><button class="btn primary" data-act="drafts">Revisar</button></div>`;
}

function draftsFlow() {
  const list = draftList();
  if (!list.length) { closeModal(); toast('Nenhuma viagem do jogo para revisar.'); return; }
  const row = d => { const x = d.data || {};
    return `<div class="li" style="align-items:center"><div style="min-width:0"><div><b>${esc(draftTitle(d))}</b></div>
      <div class="muted" style="font-size:12.5px">${fmtN(E.n(x.miles))} mi · frete ${fmt(E.n(x.freight))}${x.vehicle === 'car' ? ' · carro' : ''}${x.cargo ? ' · ' + esc(x.cargo) : ''} · recebida ${esc(draftWhen(d))}</div></div>
      <div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-ddel="${esc(d.id)}">Descartar</button><button class="btn sm primary" data-duse="${esc(d.id)}">Lançar</button></div></div>`; };
  openModal(`<div class="row between"><h2>Viagens do jogo</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p class="muted" style="margin:0;font-size:13.5px">"Lançar" abre o formulário já preenchido: confira o dia, as refeições e o status da entrega antes de salvar.</p>
    <div class="list">${list.map(row).join('')}</div>`, sh => {
    sh.querySelector('[data-x]').onclick = closeModal;
    sh.addEventListener('click', async e => {
      const use = e.target.closest('[data-duse]'), del = e.target.closest('[data-ddel]');
      if (use) {
        const d = list.find(x => x.id === use.dataset.duse); if (!d) return;
        openTrip(null, draftToTrip(d), () => { resolveDraft(d.id, 'accepted', d.id); render(); });
      }
      if (del) {
        const d = list.find(x => x.id === del.dataset.ddel); if (!d) return;
        if (!await confirmBox('Descartar viagem do jogo?', `<p style="margin:0">${esc(draftTitle(d))} sai da lista e não entra na carreira.</p>`, 'Descartar', true)) return draftsFlow();
        await resolveDraft(d.id, 'discarded'); render(); toast('Viagem descartada'); draftsFlow();
      }
    });
  });
}
// Chegou rascunho novo: atualiza o aviso se nenhuma janela estiver aberta
function onDraftsChange() { if (typeof document !== 'undefined' && !document.querySelector('#modalRoot .sheet') && ['painel', 'diario'].includes(tab)) render(); }
