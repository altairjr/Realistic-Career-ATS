// Painel do app de PC: mostra o que está funcionando e o que falta, com o botão para resolver cada item.
const api = window.carreiraDesktop;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GAME_NAME = { ats: 'American Truck Simulator', ets2: 'Euro Truck Simulator 2' };
const ago = iso => { if (!iso) return ''; const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'agora há pouco' : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`; };
const check = (level, title, detail) => `<div class="check"><span class="dot ${level}"></span><div>${title}${detail ? `<small>${detail}</small>` : ''}</div></div>`;
let busy = false, S = null;

function render(s) {
  S = s;
  $('ver').textContent = `versão ${s.version || '?'} · telemetria do jogo`;
  $('heroDot').className = 'dot ' + s.level; $('headline').textContent = s.headline;
  $('subline').textContent = s.pending ? `${s.pending} entrega(s) aguardando envio` : s.lastDelivery ? `Última entrega: ${s.lastDelivery.title}, ${ago(s.lastDelivery.at)}` : '';
  $('logged').hidden = !s.account; $('loginForm').hidden = !!s.account; $('email').textContent = s.account || '';

  const g = s.plugins.find(p => p.game === s.settings.game), L = s.gameLog, name = GAME_NAME[s.settings.game];
  const items = [];
  if (!g) items.push(check('off', `${name} não encontrado`, 'Procurei nas bibliotecas da Steam deste PC.'));
  else {
    items.push(check('ok', `${name} encontrado`, esc(g.dir)));
    items.push(g.installed ? check(g.upToDate ? 'ok' : 'wait', g.upToDate ? 'Plugin instalado e atualizado' : 'Plugin instalado, mas há versão nova', esc(g.target))
      : check('off', 'Plugin não instalado', 'Clique em "Instalar plugin" com o jogo fechado.'));
    if (g.wrongCopies.length) items.push(check('wait', 'Cópia do plugin numa pasta que o jogo não lê', g.wrongCopies.map(esc).join('<br>') + '<br>Pode apagar; o jogo só lê a pasta <b>plugins</b>.'));
  }
  if (L) items.push(L.pluginActive ? check('ok', 'O jogo carregou o plugin', 'Confirmado no game.log.txt da última vez que o jogo abriu.')
    : check('off', 'O jogo não carregou o plugin na última vez que abriu', L.pluginError ? esc(L.pluginError) : 'Instale e reabra o jogo.'));
  else items.push(check('wait', 'O jogo ainda não foi aberto', 'Abra o jogo para conferir se o plugin carregou.'));
  items.push(s.game.online ? check('ok', 'Jogo aberto', `${esc(s.game.version || '')}${s.game.plugin ? ` · plugin ${esc(s.game.plugin)}` : ''}`) : check('wait', 'Jogo fechado', ''));
  items.push(!s.account ? check('off', 'Sem conta conectada', '') : s.sendError === 'offline' ? check('wait', 'Sem internet', 'Os dados ficam guardados e são enviados depois.') : s.sendError === 'setup' ? check('off', 'Servidor sem as tabelas', 'Rode o supabase/schema.sql no Supabase.') : check('ok', 'Conta conectada', esc(s.account)));
  const sim = s.control.sim || {}, si = s.simInfo || {};
  if (sim.warpOn || sim.loadOn) {
    const what = [sim.warpOn ? `warp ${sim.warp}` : '', sim.loadOn ? `+${Math.round(sim.loadMinutes / 6) / 10} h após cada entrega` : ''].filter(Boolean).join(' · ');
    items.push(si.console === 'off' ? check('off', 'Simulação: console do jogo desligado', 'Em Documentos\\American Truck Simulator\\config.cfg mude <b>uset g_console "1"</b> e <b>uset g_developer "1"</b> (com o jogo fechado).')
      : check(si.block && si.block !== 'offline' ? 'wait' : 'ok', `Simulação: ${esc(what)}`, si.last ? `${si.last.ok ? 'Último aplicado' : 'Último com erro'}: ${esc(si.last.text)}, ${ago(si.last.at)}` : si.pending ? 'Aguardando você voltar ao jogo com o caminhão parado.' : si.why ? esc('Parado: ' + si.why) : ''));
  }
  $('checks').innerHTML = items.join('');
  $('pluginBtns').innerHTML = g ? `<button class="primary" data-act="install">${g.installed ? 'Reinstalar plugin' : 'Instalar plugin'}</button>${g.installed ? '<button class="danger" data-act="remove">Remover plugin do jogo</button>' : ''}` : '';

  $('collect').checked = !!s.control.collect;
  const cur = L && L.profile, linked = s.control.linkedProfile;
  $('profileBox').innerHTML = `<div>Perfil no jogo: <b>${esc(cur || '—')}</b></div><div>Perfil ligado à carreira: <b>${esc(linked || 'nenhum (todos enviam)')}</b></div>
    ${s.blocked === 'profile' ? '<div class="warn">Este perfil não está ligado à carreira: nada dele vai para o app.</div>' : ''}
    <div class="row">${cur && cur !== linked ? `<button data-act="link" data-name="${esc(cur)}">Ligar "${esc(cur)}" à carreira</button>` : ''}${linked ? '<button data-act="unlink">Aceitar todos os perfis</button>' : ''}</div>`;

  const job = s.game.job;
  $('now').innerHTML = s.game.gameDay ? `Dia ${s.game.gameDay} no jogo${job ? ` · <b>${esc(job.cargo || 'carga')}</b>: ${esc(job.origin)} → ${esc(job.dest)}${job.plannedMiles ? `, ${job.plannedMiles} mi` : ''}` : ' · sem trabalho'}` : 'Sem dados do jogo ainda.';
  $('hk').textContent = (s.settings.hotkey || '').replace('Control', 'Ctrl').replace('Space', 'Espaço');
  if (document.activeElement !== $('optHotkey')) $('optHotkey').value = s.settings.hotkey || '';
  $('optGame').checked = !!s.settings.openWithGame; $('optWin').checked = !!s.settings.startWithWindows; $('optJogo').value = s.settings.game;
  $('log').textContent = (s.logs || []).map(l => `${new Date(l.at).toLocaleTimeString('pt-BR')}  ${l.text}`).join('\n') || 'Nada ainda.';
}

async function act(fn) { if (busy) return; busy = true; try { const r = await fn(); if (r && r.ok === false) alert(r.error); } finally { busy = false; render(await api.getState()); } }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const g = S.settings.game;
  if (b.dataset.act === 'install') act(() => api.install(g));
  if (b.dataset.act === 'remove' && confirm('Remover o plugin do jogo? Nada mais é coletado até instalar de novo.')) act(() => api.remove(g));
  if (b.dataset.act === 'link') act(() => api.linkProfile(b.dataset.name));
  if (b.dataset.act === 'unlink') act(() => api.linkProfile(null));
});
$('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; act(async () => { const r = await api.login($('inEmail').value.trim(), $('inPass').value); if (!r.ok) $('loginErr').textContent = r.error; else $('inPass').value = ''; return { ok: true }; }); });
$('btnSair').onclick = () => confirm('Sair da conta neste PC?') && act(() => api.logout());
$('collect').onchange = e => act(() => api.setCollect(e.target.checked));
$('optGame').onchange = e => act(() => api.settings({ openWithGame: e.target.checked }));
$('optWin').onchange = e => act(() => api.settings({ startWithWindows: e.target.checked }));
$('optHotkey').onchange = e => act(() => api.settings({ hotkey: e.target.value.trim() || 'Control+Shift+Space' }));
$('optJogo').onchange = e => act(() => api.settings({ game: e.target.value }));
$('btnOverlay').onclick = () => api.toggleOverlay();
$('btnApp').onclick = () => api.openApp();
$('btnPasta').onclick = () => api.openFolder();
api.onState(render);
api.getState().then(render);
