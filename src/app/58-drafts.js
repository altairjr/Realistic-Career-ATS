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
      <div class="muted" style="font-size:12.5px">${fmtN(E.n(x.miles))} mi · frete ${fmt(E.n(x.freight))}${x.vehicle === 'car' ? ' · carro' : ''}${x.cargo ? ' · ' + esc(x.cargo) : ''}${x.gameDay ? (appDayOf(x.gameDay) ? ` · dia ${appDayOf(x.gameDay)} no app (${x.gameDay} no jogo)` : ` · dia ${x.gameDay} no jogo`) : ''}${x.cargoDamagePct ? ` · carga ${fmtN(x.cargoDamagePct)}% danificada` : ''}${E.n(x.tolls) || E.n(x.fines) ? ` · pedágios ${fmt(x.tolls)}, multas ${fmt(x.fines)}` : ''} · recebida ${esc(draftWhen(d))}</div></div>
      <div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-ddel="${esc(d.id)}">Descartar</button><button class="btn sm primary" data-duse="${esc(d.id)}">Lançar</button></div></div>`; };
  openModal(`<div class="row between"><h2>Viagens do jogo</h2><button class="btn ghost sm" data-x>Fechar</button></div>
    <p class="muted" style="margin:0;font-size:13.5px">"Lançar" abre o formulário já preenchido: confira o dia, as refeições e o status da entrega antes de salvar.${telOffset() === null && list.some(d => d.data && d.data.gameDay) ? ' O dia do app ainda não está ligado ao jogo: o dia que você confirmar na primeira entrega faz essa ligação.' : ''}</p>
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
    ${h.box}${g.collect === false ? '<div class="banner" style="margin:0;padding:8px 10px">Coleta pausada: nada do jogo é enviado.</div>' : g.blocked === 'profile' ? `<div class="banner" style="margin:0;padding:8px 10px">Jogando no perfil "${esc(g.profile)}", que não está ligado à carreira: nada é enviado.</div>` : ''}${job}
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

/* ---------- Ajustes › Telemetria do jogo: o que está funcionando, coleta e perfil ligado ---------- */
const DESKTOP_URL = 'https://github.com/altairjr/Realistic-Career-ATS/releases/latest/download/CarreiraRealista-Setup.exe';
const agoTxt = iso => { if (!iso) return ''; const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 90 ? 'agora há pouco' : s < 3600 ? `há ${Math.round(s / 60)} min` : s < 86400 ? `há ${Math.round(s / 3600)} h` : `há ${Math.round(s / 86400)} dia(s)`; };
const pcOnline = g => !!(g && g.pc_seen_at && Date.now() - Date.parse(g.pc_seen_at) < 3 * 60e3);
const light = (lv, t, d) => `<div class="full" style="display:flex;gap:8px;align-items:flex-start"><span class="dot ${lv}" style="margin-top:6px;flex:none"></span><div><b style="font-weight:600">${t}</b>${d ? `<div class="muted" style="font-size:12.5px">${d}</div>` : ''}</div></div>`;

function telemetryBlock() {
  if (store.mode !== 'cloud' || !cloud.session) return hint('Entre na sua conta (Dados e sincronização) para usar a telemetria do jogo.');
  if (cloud.gameOff) return hint('O servidor ainda não tem as tabelas da telemetria. Rode de novo o supabase/schema.sql no Supabase.');
  const g = cloud.game || {}, collect = g.collect !== false;
  const lights = [
    pcOnline(g) ? light('on', 'Programa do PC conectado', `visto ${agoTxt(g.pc_seen_at)}`) : light('', 'Programa do PC desligado', g.pc_seen_at ? `visto pela última vez ${agoTxt(g.pc_seen_at)}` : 'Instale o Carreira Realista no PC (botão abaixo).'),
    g.online && pcOnline(g) ? light('on', 'Jogo aberto', `${esc(g.game_version || '')}${g.plugin ? ` · plugin ${esc(g.plugin)}` : ''}`) : light('', 'Jogo fechado', g.plugin ? `plugin ${esc(g.plugin)}` : ''),
    !collect ? light('wait', 'Coleta pausada', 'O plugin não grava e nada é enviado.') : g.blocked === 'profile' ? light('wait', `Perfil "${esc(g.profile)}" não ligado à carreira`, 'Nada deste perfil vai para o app.') : light('on', 'Coleta ligada', ''),
    g.last_delivery ? light('on', `Última entrega: ${esc(g.last_delivery.title)}`, `${fmtN(E.n(g.last_delivery.miles))} mi · ${fmt(g.last_delivery.freight)} · ${agoTxt(g.last_delivery.at)}`) : ''
  ].join('');
  const L = labRow('tel.perfil', 'Perfil do jogo ligado à carreira');
  return `${lights}
    <div class="full"><label class="inline-opt"><input type="checkbox" data-act="tel-collect" ${collect ? 'checked' : ''}> Coleta ligada</label></div>
    <div class="full">${L.row}${L.box}<div style="font-size:14px">Ligado: <b>${esc(g.linked_profile || 'nenhum (todos os perfis enviam)')}</b>${g.profile ? ` · no jogo agora: <b>${esc(g.profile)}</b>` : ''}</div></div>
    <div class="full row">${g.profile && g.profile !== g.linked_profile ? `<button class="btn sm" data-act="tel-profile" data-name="${esc(g.profile)}">Ligar "${esc(g.profile)}"</button>` : ''}${g.linked_profile ? '<button class="btn sm ghost" data-act="tel-profile" data-name="">Aceitar todos os perfis</button>' : ''}</div>
    ${simBlock(g)}
    <div class="full row"><a class="btn sm primary" href="${DESKTOP_URL}" target="_blank" rel="noopener">Baixar o Carreira Realista para PC</a></div>
    ${hint('O programa do PC instala o plugin no jogo, envia as entregas e mostra o app por cima do jogo (Ctrl+Shift+Espaço). Guia em docs/telemetria.md.')}`;
}
function telemetrySummary() {
  if (store.mode !== 'cloud' || !cloud.session) return 'Entre na conta para usar';
  const g = cloud.game || {};
  return [pcOnline(g) ? 'PC conectado' : 'PC desligado', g.collect === false ? 'coleta pausada' : g.blocked === 'profile' ? 'perfil não ligado' : 'coleta ligada', g.linked_profile ? `perfil ${g.linked_profile}` : ''].filter(Boolean).join(' · ');
}
/* Simulação no jogo: warp ao abrir o jogo e tempo de carga depois de cada entrega (o programa do PC digita no console) */
const SIM_DEFAULT = { warpOn: false, warp: 0.9, loadOn: false, loadMinutes: 60 };
const simOf = g => Object.assign({}, SIM_DEFAULT, (g && g.sim) || {});
function simBlock(g) {
  if (cloud.noSimCols) return `<div class="full">${hint('Simulação no jogo (warp e tempo de carga): rode de novo o supabase/schema.sql no Supabase para liberar.')}</div>`;
  const s = simOf(g), L = labRow('tel.sim', 'Simulação no jogo'), last = g.sim_last;
  return `<div class="full">${L.row}${L.box}</div>
    <div class="full"><label class="inline-opt"><input type="checkbox" data-act="sim-set" data-key="warpOn" ${s.warpOn ? 'checked' : ''}> Aplicar o warp ao abrir o jogo</label></div>
    <div class="field"><label for="simWarp">Warp (1 = normal)</label><input id="simWarp" type="number" inputmode="decimal" step="0.05" min="0.1" max="2" value="${s.warp}"></div>
    <div class="full"><label class="inline-opt"><input type="checkbox" data-act="sim-set" data-key="loadOn" ${s.loadOn ? 'checked' : ''}> Avançar o relógio do jogo depois de cada entrega (carga e descarga)</label></div>
    <div class="field"><label for="simLoad">Tempo de carga (horas)</label><input id="simLoad" type="number" inputmode="decimal" step="0.25" min="0" max="12" value="${Math.round(s.loadMinutes / 15) / 4}"></div>
    <div class="full row"><button class="btn sm" data-act="sim-save">Salvar valores</button>${last ? `<span class="muted" style="font-size:12.5px">${last.ok ? 'Último aplicado no jogo' : 'Último com erro'}: ${esc(last.text || '')} · ${agoTxt(last.at)}</span>` : ''}</div>`;
}
async function saveSim(patch) {
  const s = Object.assign(simOf(cloud.game), patch);
  s.warp = Math.min(2, Math.max(0.1, Math.round(E.n(s.warp) * 100) / 100 || 0.9));
  s.loadMinutes = Math.min(720, Math.max(0, Math.round(E.n(s.loadMinutes))));
  await setGameControl({ sim: s });
  return s;
}

/* Overlay (app de PC por cima do jogo): relógio do jogo e botões para avançar o tempo */
const hhmm = t => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
function overlayClock() {
  const D = window.carreiraDesktop;
  if (!D || !D.gameClock || !document.documentElement.classList.contains('overlay')) return '';
  return `<section class="panel pad ov-clock" id="ovClock">
    <div class="sec-head"><div><div class="eyebrow">Tempo no jogo</div><h2 class="hrow" style="font-size:18px" id="ovClockNow">…</h2></div></div>
    <div class="row">${[1, 2, 4, 8].map(h => `<button class="btn sm" data-act="ov-adv" data-min="${h * 60}">+${h} h</button>`).join('')}</div>
    <div class="row" style="flex-wrap:nowrap;align-items:end"><div class="field" style="flex:1"><label for="ovH">Ir para</label><input id="ovH" type="time" step="60" value="06:00"></div><button class="btn sm primary" data-act="ov-set">Ir</button></div>
    <div class="muted" style="font-size:12px" id="ovClockMsg">O comando é digitado no console quando você volta ao jogo (no menu do Esc ou parado).</div>
  </section>`;
}
async function overlayClockTick() {
  const el = document.getElementById('ovClockNow'); if (!el || !window.carreiraDesktop) return;
  try {
    const c = await window.carreiraDesktop.gameClock(), msg = document.getElementById('ovClockMsg');
    el.textContent = c.online && typeof c.gameTime === 'number' ? `Dia ${Math.floor(c.gameTime / 1440) + 1} · ${hhmm(c.gameTime)}` : 'Jogo fechado';
    if (msg && c.sim) msg.textContent = c.sim.why ? `Parado: ${c.sim.why}.` : c.sim.pending ? 'Pedido na fila: volte ao jogo (menu do Esc ou parado).' : c.sim.last ? `${c.sim.last.ok ? 'Aplicado' : 'Erro'}: ${c.sim.last.text}` : 'O comando é digitado no console quando você volta ao jogo (no menu do Esc ou parado).';
  } catch (e) {}
}
if (window.carreiraDesktop && window.carreiraDesktop.gameClock) setInterval(overlayClockTick, 2000);

async function telemetryControlAction(a, el) {
  if (a === 'ov-adv' || a === 'ov-set') {
    const D = window.carreiraDesktop; if (!D) return true;
    let r;
    if (a === 'ov-adv') r = await D.advanceTime(+el.dataset.min);
    else { const v = (document.getElementById('ovH').value || '').split(':'); r = await D.setTime(+v[0], +v[1]); }
    toast(r && r.ok ? (a === 'ov-adv' ? `Avançar ${+el.dataset.min / 60} h: na fila` : 'Hora na fila') + ' — volte ao jogo' : (r && r.error) || 'Não deu certo.');
    overlayClockTick(); return true;
  }
  if (a === 'sim-set' || a === 'sim-save') {
    try {
      const patch = a === 'sim-set' ? { [el.dataset.key]: el.checked } : {};
      patch.warp = E.n(document.getElementById('simWarp').value); patch.loadMinutes = E.n(document.getElementById('simLoad').value) * 60;
      const s = await saveSim(patch);
      toast(a === 'sim-save' ? 'Simulação salva' : el.dataset.key === 'warpOn' ? (s.warpOn ? `Warp ${String(s.warp).replace('.', ',')} será aplicado no jogo` : 'O warp volta ao normal no jogo') : (s.loadOn ? `O relógio avança ${String(s.loadMinutes / 60).replace('.', ',')} h depois de cada entrega` : 'Tempo de carga desligado'));
    } catch (e) { if (el.type === 'checkbox') el.checked = !el.checked; toast('Sem conexão: tente de novo.'); }
    render(); return true;
  }
  if (a === 'tel-collect') {
    try { await setGameControl({ collect: el.checked }); toast(el.checked ? 'Coleta ligada' : 'Coleta pausada: o PC para de enviar em alguns segundos'); }
    catch (e) { el.checked = !el.checked; toast('Sem conexão: tente de novo.'); }
    render(); return true;
  }
  if (a === 'tel-profile') {
    try { await setGameControl({ linked_profile: el.dataset.name || null }); toast(el.dataset.name ? `Perfil "${el.dataset.name}" ligado à carreira` : 'Todos os perfis enviam'); }
    catch (e) { toast('Sem conexão: tente de novo.'); }
    render(); return true;
  }
  return false;
}
