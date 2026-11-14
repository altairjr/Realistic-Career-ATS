/* ---------- Viagens do jogo: caixa de entrada dos rascunhos ----------
   Cada entrega lida do jogo chega como rascunho. Aqui você lança (abre o formulário já preenchido),
   ou descarta. Nada entra na carreira sem passar por você. */
const draftList = () => (store.mode === 'cloud' && cloud.session ? cloud.drafts : []);

// Converte o rascunho (formato do leitor de telemetria, docs/telemetria.md) em campos do formulário de viagem
function draftToTrip(d) {
  const x = d.data || {}, n = v => E.r2(E.n(v)), day = appDayOf(x.gameDay);
  return {
    day: day || S.gameDay, gameDay: x.gameDay || null,
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
      <div class="muted" style="font-size:12.5px">${fmtN(E.n(x.miles))} mi · frete ${fmt(E.n(x.freight))}${x.vehicle === 'car' ? ' · carro' : ''}${x.cargo ? ' · ' + esc(x.cargo) : ''}${x.gameDay ? ` · dia ${appDayOf(x.gameDay) || '?'} no app (${x.gameDay} no jogo)` : ''}${x.cargoDamagePct ? ` · carga ${fmtN(x.cargoDamagePct)}% danificada` : ''}${E.n(x.tolls) || E.n(x.fines) ? ` · pedágios ${fmt(x.tolls)}, multas ${fmt(x.fines)}` : ''} · recebida ${esc(draftWhen(d))}</div></div>
      <div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-ddel="${esc(d.id)}">Descartar</button><button class="btn sm primary" data-duse="${esc(d.id)}">Lançar</button></div></div>`; };
  openModal(`<div class="row between"><h2>Viagens do jogo</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p class="muted" style="margin:0;font-size:13.5px">"Lançar" abre o formulário já preenchido: confira o dia, as refeições e o status da entrega antes de salvar.</p>
    <div class="list">${list.map(row).join('')}</div>`, sh => {
    sh.querySelector('[data-x]').onclick = closeModal;
    sh.addEventListener('click', async e => {
      const use = e.target.closest('[data-duse]'), del = e.target.closest('[data-ddel]');
      if (use) {
        const d = list.find(x => x.id === use.dataset.duse); if (!d) return;
        const pre = draftToTrip(d);
        openTrip(null, pre, saved => {
          // primeira entrega lançada sem o dia ligado ao jogo: liga agora, pelo dia que você confirmou
          if (telOffset() === null && pre.gameDay) { commit(st => { st.settings.telemetry = { offset: saved.day - pre.gameDay }; }); toast(`Dia do app ligado ao jogo (dia ${pre.gameDay} no jogo = dia ${saved.day} no app)`); }
          if (saved.day > S.gameDay) commit(st => { st.gameDay = saved.day; autoPay(st); });
          resolveDraft(d.id, 'accepted', d.id); render();
        });
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

/* ---------- Situação do jogo: dia atual e trabalho em andamento ----------
   O programa companheiro grava a situação do jogo; o app mostra no Painel e pode seguir o dia do jogo.
   Ligação: dia do app = dia do jogo + diferença (guardada em Ajustes, settings.telemetry.offset). */
const telOffset = () => { const t = S && S.settings.telemetry; return t && typeof t.offset === 'number' ? t.offset : null; };
const gameDayNow = () => cloud.game && typeof cloud.game.game_time === 'number' ? Math.floor(cloud.game.game_time / 1440) + 1 : null;
function appDayOf(gameDay) { const o = telOffset(); return gameDay && o !== null ? Math.max(1, gameDay + o) : null; }
const gameFresh = () => { const g = cloud.game; if (!g || !g.updated_at) return false; return Date.now() - new Date(g.updated_at).getTime() < 3 * 24 * 3600e3; };

// Dia ligado ao jogo: quando o jogo passa para um dia depois do dia do app, o app avança junto (nunca volta)
let lastGameDayApplied = null;
function onGameStatus() {
  if (!S || telOffset() === null) return;
  const gd = gameDayNow(); if (!gd || gd === lastGameDayApplied) return;
  lastGameDayApplied = gd;
  const target = appDayOf(gd);
  if (target > S.gameDay) {
    const from = S.gameDay;
    commit(st => { st.gameDay = target; autoPay(st); }, { view: !document.querySelector('#modalRoot .sheet') });
    toast(`Dia avançado pelo jogo: ${from} → ${target}`);
  }
}

function gameCard() {
  if (store.mode !== 'cloud' || !cloud.session || !gameFresh()) return '';
  const g = cloud.game, j = g.job, gd = gameDayNow(), linked = telOffset() !== null, h = help('ui.jogo', 'No jogo');
  const job = j ? `<div style="font-size:14px"><b>${esc(j.cargo || 'Carga')}</b> · ${esc(j.origin || '?')} → ${esc(j.dest || '?')}</div>
      <div class="muted" style="font-size:12.5px">${j.plannedMiles ? fmtN(j.plannedMiles) + ' mi planejadas · ' : ''}${j.income ? 'frete ' + fmt(j.income) : ''}${typeof j.deadline === 'number' && gd ? ` · prazo dia ${Math.floor(j.deadline / 1440) + 1} do jogo` : ''}</div>`
    : `<div class="muted" style="font-size:13.5px">Sem trabalho no momento.</div>`;
  const dayLine = gd ? `Dia ${gd} no jogo${linked ? ` = dia ${appDayOf(gd)} no app` : ''}` : 'Dia do jogo ainda desconhecido';
  return `<section class="panel pad" style="display:flex;flex-direction:column;gap:6px">
    <div class="sec-head"><div><div class="eyebrow">${g.online ? 'No jogo agora' : 'Última sessão no jogo'}${g.truck ? ' · ' + esc(g.truck) : ''}</div><h2 class="hrow" style="font-size:18px">${dayLine}${h.btn}</h2></div></div>
    ${h.box}${job}
    <div class="row">${linked ? `<span class="muted" style="font-size:12.5px">O dia do app acompanha o jogo.</span><button class="btn sm ghost" data-act="tel-unlink">Desligar</button>`
      : gd ? `<button class="btn sm" data-act="tel-link">Ligar o dia do app ao jogo</button>` : ''}</div>
  </section>`;
}
async function telemetryAction(a) {
  if (a === 'tel-link') {
    const gd = gameDayNow(); if (!gd) return true;
    if (!await confirmBox('Ligar o dia do app ao jogo?', `<p style="margin:0">Hoje é o dia <b>${gd}</b> no jogo e o dia <b>${S.gameDay}</b> no app. Daqui para frente, quando o jogo virar o dia, o app vira junto (contas fixas e pagamentos seguem o calendário do app). O app nunca volta dias.</p>`, 'Ligar')) return true;
    lastGameDayApplied = gd;
    commit(st => { st.settings.telemetry = { offset: st.gameDay - gd }; }); toast('Dia do app ligado ao jogo'); return true;
  }
  if (a === 'tel-unlink') { commit(st => { st.settings.telemetry = { offset: null }; }); toast('O dia do app volta a ser controlado só por você'); return true; }
  return false;
}
