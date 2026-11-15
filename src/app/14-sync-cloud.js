/* ---------- Sincronização em servidor próprio (Supabase) com login por e-mail e senha ----------
   Usada quando o app roda fora do Claude (GitHub Pages, app instalado, arquivo local).
   Fala direto com a API REST do Supabase, sem bibliotecas:
     /auth/v1  → criar conta, entrar, renovar sessão, trocar senha
     /rest/v1  → tabelas careers (estado) e career_weeks (semanas), protegidas por usuário (supabase/schema.sql)
   Não há canal em tempo real: o app confere o servidor a cada POLL_MS e quando volta a ficar visível ou online. */
const CLOUD_LS = 'carreira-ats-cloud';      // servidor informado na tela (quando o build não traz um)
const SESSION_LS = 'carreira-ats-session';  // sessão do usuário
const LINK_LS = 'carreira-ats-linked';      // conta com a qual os dados deste navegador já foram sincronizados
const WEEKQ_LS = 'carreira-ats-weekq';      // gravações de semanas que ainda não chegaram ao servidor
const POLL_MS = 15000;

const cloud = { session: lsGet(SESSION_LS), timer: null, busy: false, refreshing: null, choose: null, fetch: null, recovery: false };

/* --- Configuração do servidor --- */
const cleanUrl = u => String(u || '').trim().replace(/\/+$/, '');
function cloudCfg() {
  const b = typeof CLOUD_CONFIG !== 'undefined' ? CLOUD_CONFIG : null;
  if (b && b.url && b.key) return { url: cleanUrl(b.url), key: String(b.key).trim(), fixed: true };
  const r = lsGet(CLOUD_LS);
  return r && r.url && r.key ? { url: cleanUrl(r.url), key: String(r.key).trim(), fixed: false } : null;
}
function cloudSetCfg(url, key) {
  url = cleanUrl(url); key = String(key || '').trim();
  if (!/^https:\/\/[^\s/]+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw cloudErr('config', 'O endereço deve ser como https://seu-projeto.supabase.co, sem nada depois.');
  if (/^sb_secret_/.test(key) || jwtRole(key) === 'service_role') throw cloudErr('config', 'Essa é a chave secreta. Use a chave publicável (sb_publishable_...) ou a anon.');
  if (key.length < 20) throw cloudErr('config', 'Cole a chave publicável inteira (sb_publishable_...).');
  lsSet(CLOUD_LS, { url, key });
}
function jwtRole(k) { try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (e) { return null; } }
function cloudErr(code, message, status) { const e = new Error(message || code); e.code = code; e.status = status; return e; }

/* --- Chamadas HTTP --- */
const AUTH_MSG = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos e entre de novo.',
  user_already_exists: 'Já existe uma conta com esse e-mail. Use "Entrar".',
  email_exists: 'Já existe uma conta com esse e-mail. Use "Entrar".',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres.',
  signup_disabled: 'O servidor não aceita novas contas. Peça ao dono do servidor para liberar o cadastro.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Espere alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Espere um minuto e tente de novo.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  email_address_invalid: 'Esse e-mail não foi aceito pelo servidor.',
  validation_failed: 'Confira o e-mail e a senha.'
};
async function cloudHttp(path, { method = 'GET', body, headers = {}, token } = {}) {
  const cfg = cloudCfg(); if (!cfg) throw cloudErr('config', 'Servidor não configurado.');
  const f = cloud.fetch || fetch;
  let res;
  try {
    res = await f(cfg.url + path, {
      method,
      // a chave publicável vai só no cabeçalho apikey; o Authorization leva o token do usuário
      headers: Object.assign({ apikey: cfg.key }, token ? { Authorization: 'Bearer ' + token } : {}, body !== undefined ? { 'Content-Type': 'application/json' } : {}, headers),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw cloudErr('network', 'Sem conexão com o servidor.'); }
  let data = null; try { const t = await res.text(); data = t ? JSON.parse(t) : null; } catch (e) {}
  if (res.ok) return data;
  const ec = (data && (data.error_code || data.code || data.error)) || '';
  const msg = AUTH_MSG[ec] || (data && (data.msg || data.message || data.error_description)) || `Erro ${res.status} no servidor.`;
  if (path.startsWith('/rest/')) {
    if (res.status === 401 || ec === 'PGRST301' || ec === 'PGRST303') throw cloudErr('auth', msg, res.status);
    if (res.status === 404 || ec === 'PGRST205' || ec === '42P01' || ec === '42501') throw cloudErr('setup', 'O servidor não tem as tabelas do app. Rode o arquivo supabase/schema.sql no painel do Supabase.', res.status);
    if (res.status === 413) throw cloudErr('invalid_argument', msg, res.status);
  }
  if (res.status >= 500 || res.status === 429) throw cloudErr(res.status === 429 && path.startsWith('/auth/') ? 'rate' : 'network', msg, res.status);
  throw cloudErr(path.startsWith('/auth/') ? 'authfail' : 'server', msg, res.status);
}

/* --- Sessão --- */
function cloudSetSession(d) {
  cloud.session = d && d.access_token ? {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: { id: d.user.id, email: d.user.email }
  } : null;
  lsSet(SESSION_LS, cloud.session);
}
async function cloudToken() {
  const s = cloud.session; if (!s) throw cloudErr('auth', 'Entre na conta.');
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  return cloudRefresh();
}
// Renova o token. Chamadas simultâneas esperam a mesma renovação (o refresh token só vale uma vez).
function cloudRefresh() {
  if (cloud.refreshing) return cloud.refreshing;
  const s = cloud.session; if (!s) return Promise.reject(cloudErr('auth', 'Entre na conta.'));
  cloud.refreshing = cloudHttp('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })
    .then(d => { cloudSetSession(d); return d.access_token; },
      e => { if (e.code === 'authfail') { cloudSetSession(null); throw cloudErr('auth', 'Sessão expirada.'); } throw e; })
    .finally(() => { cloud.refreshing = null; });
  return cloud.refreshing;
}
// Chamada às tabelas com o token do usuário; se o servidor recusar o token, renova uma vez e repete.
async function cloudRest(path, opt = {}) {
  let token = await cloudToken();
  try { return await cloudHttp('/rest/v1/' + path, Object.assign({}, opt, { token })); }
  catch (e) {
    if (e.code !== 'auth' || !cloud.session) throw e;
    token = await cloudRefresh();
    return cloudHttp('/rest/v1/' + path, Object.assign({}, opt, { token }));
  }
}

/* --- Tabelas --- */
const meQ = () => 'user_id=eq.' + cloud.session.user.id;
const UPSERT = { Prefer: 'resolution=merge-duplicates,return=minimal' };
const cloudBackend = {
  name: 'cloud',
  saveMain: body => cloudRest('careers?on_conflict=user_id', { method: 'POST', headers: UPSERT, body: { user_id: cloud.session.user.id, state: body, rev: body._rev || 0, client: CLIENT, updated_at: new Date().toISOString() } }),
  // Semanas entram numa fila gravada no navegador: se a internet cair, a gravação é refeita depois.
  saveWeek: w => { weekQ(w.id, 'save'); return drainWeeks(); },
  deleteWeek: id => { weekQ(id, 'del'); return drainWeeks(); },
  wipe: async () => { lsSet(WEEKQ_LS, null); await cloudRest('career_weeks?' + meQ(), { method: 'DELETE' }); await cloudRest('careers?' + meQ(), { method: 'DELETE' }); }
};
function weekQ(id, op) { const q = lsGet(WEEKQ_LS) || {}; if (op) q[id] = op; else delete q[id]; lsSet(WEEKQ_LS, Object.keys(q).length ? q : null); }
const weekQPending = () => Object.keys(lsGet(WEEKQ_LS) || {}).length > 0;
let draining = null;
function drainWeeks() {
  if (draining) return draining.then(drainWeeks);
  draining = (async () => {
    const q = lsGet(WEEKQ_LS) || {};
    for (const id of Object.keys(q)) {
      const w = H.find(x => x.id === id);
      if (q[id] === 'save' && w) await cloudRest('career_weeks?on_conflict=user_id,week_id', { method: 'POST', headers: UPSERT, body: { user_id: cloud.session.user.id, week_id: id, start_day: Math.round(w.start || 0), data: w, updated_at: new Date().toISOString() } });
      else await cloudRest(`career_weeks?${meQ()}&week_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if ((lsGet(WEEKQ_LS) || {})[id] === q[id]) weekQ(id, null);
    }
  })().finally(() => { draining = null; });
  return draining;
}
async function cloudLoadMain() { const r = await cloudRest('careers?select=state,rev,client&' + meQ()); return r && r[0] ? r[0] : null; }
async function cloudLoadWeeks() { const r = await cloudRest('career_weeks?select=data&order=start_day.asc&' + meQ()); return (r || []).map(x => x.data).filter(Boolean); }
// Este aparelho manda: o servidor fica igual aos dados locais
async function cloudPushAll() {
  const remote = await cloudRest('career_weeks?select=week_id&' + meQ());
  (remote || []).forEach(r => { if (!H.find(w => w.id === r.week_id)) weekQ(r.week_id, 'del'); });
  H.forEach(w => weekQ(w.id, 'save'));
  await drainWeeks();
  if (S) { dirty = true; await flush(); }
}
// O servidor manda: os dados locais ficam iguais aos da conta
async function cloudPullAll(row) {
  lsSet(WEEKQ_LS, null); dirty = false;
  H = (await cloudLoadWeeks()).sort((a, b) => a.start - b.start);
  applyRemote(row.state);
}

/* --- Conexão e verificação periódica --- */
async function cloudStart() {
  cloudStop();
  if (!cloudCfg()) { setSync('local'); return; }
  cloud.session = lsGet(SESSION_LS);
  if (!cloud.session) { setSync('out'); return; }
  store.backend = cloudBackend; store.uid = cloud.session.user.id; store.loaded = false;
  setSync('loading');
  try {
    const row = await cloudLoadMain();
    const linked = lsGet(LINK_LS) === store.uid;
    if (!row) { store.loaded = true; await cloudPushAll(); }
    else if (!S) { store.loaded = true; await cloudPullAll(row); }
    else if ((S._rev || 0) === (row.rev || 0)) { store.loaded = true; await cloudSyncWeeks(); }
    else if (linked) { store.loaded = true; if ((S._rev || 0) > (row.rev || 0)) await cloudPushAll(); else await cloudPullAll(row); }
    else {
      // Carreira neste aparelho e outra na conta, nunca sincronizadas entre si: a pessoa escolhe qual fica.
      const pick = await (cloud.choose || cloudChoose)({ local: S, remote: row.state });
      if (pick === 'cancel') { await cloudSignOut(); return; }
      store.loaded = true;
      if (pick === 'local') await cloudPushAll(); else await cloudPullAll(row);
    }
    lsSet(LINK_LS, store.uid);
    if (store.status === 'loading') setSync('on');
    await refreshDrafts();
  } catch (e) {
    handleDbError(e);
    if (e.code === 'auth') { store.backend = null; return; }
  }
  if (typeof render === 'function' && typeof document !== 'undefined') render();
  cloud.timer = setInterval(cloudPoll, POLL_MS);
}
function cloudStop() { clearInterval(cloud.timer); cloud.timer = null; store.backend = null; store.loaded = false; dirty = false; cloud.drafts = []; cloud.game = null; }
// Confere o servidor: envia o que ficou pendente e busca o que mudou em outro aparelho.
async function cloudPoll() {
  if (cloud.busy || !cloud.session || store.backend !== cloudBackend) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  cloud.busy = true;
  try {
    if (!store.loaded) { cloud.busy = false; clearInterval(cloud.timer); return await cloudStart(); }
    if (weekQPending()) await drainWeeks();
    if (writing) return;
    const r = await cloudRest('careers?select=rev,client&' + meQ());
    const rev = r && r[0] ? r[0].rev || 0 : null, mine = S ? S._rev || 0 : 0;
    // conta sem carreira depois de carregada = foi apagada em outro aparelho: a cópia local fica e só volta à conta na próxima mudança
    if (dirty || (S && rev !== null && mine > rev)) { dirty = true; retries = 0; await flush(); }
    else if (rev !== null && rev > mine) { const row = await cloudLoadMain(); if (row && !dirty) await cloudPullAll(row); }
    else await cloudSyncWeeks();
    if (!dirty && ['err', 'setup', 'loading'].includes(store.status)) setSync('on');
    await refreshDrafts();
  } catch (e) { handleDbError(e); if (e.code === 'auth') cloudStop(); }
  finally { cloud.busy = false; }
}
// Mesmo estado nos dois lados: confere se a lista de semanas arquivadas também bate.
async function cloudSyncWeeks() {
  if (weekQPending()) return drainWeeks();
  const r = await cloudRest('career_weeks?select=week_id&' + meQ());
  const ids = (r || []).map(x => x.week_id).sort().join(), mine = H.map(w => w.id).sort().join();
  if (ids === mine || weekQPending()) return;
  H = (await cloudLoadWeeks()).sort((a, b) => a.start - b.start);
  saveLocal(); if (typeof document !== 'undefined' && tab === 'historico') render();
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cloudPoll(); });
  window.addEventListener('online', () => cloudPoll());
}

/* --- Conta --- */
async function cloudSignIn(email, password) {
  const d = await cloudHttp('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  cloudSetSession(d); await cloudStart();
}
// Cria a conta. Devolve true quando já entrou; false quando o servidor exige confirmar o e-mail antes.
async function cloudSignUp(email, password) {
  const redirect = typeof location !== 'undefined' && /^https?:/.test(location.protocol) ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '';
  const d = await cloudHttp('/auth/v1/signup' + redirect, { method: 'POST', body: { email: email.trim(), password } });
  if (d && d.access_token) { cloudSetSession(d); await cloudStart(); return true; }
  return false;
}
async function cloudSignOut() {
  const s = cloud.session;
  cloudStop(); cloudSetSession(null); setSync(cloudCfg() ? 'out' : 'local');
  if (s) { try { await cloudHttp('/auth/v1/logout?scope=local', { method: 'POST', token: s.access_token }); } catch (e) {} }
}
async function cloudRecover(email) {
  const redirect = typeof location !== 'undefined' && /^https?:/.test(location.protocol) ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '';
  await cloudHttp('/auth/v1/recover' + redirect, { method: 'POST', body: { email: email.trim() } });
}
async function cloudSetPassword(password) { await cloudHttp('/auth/v1/user', { method: 'PUT', token: await cloudToken(), body: { password } }); }
// Links enviados por e-mail (confirmar conta, trocar senha) voltam para o app com a sessão no endereço (#access_token=...).
async function cloudFromUrl() {
  if (typeof location === 'undefined' || !/access_token=|error_description=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (p.get('error_description')) return { error: p.get('error_description').replace(/\+/g, ' ') };
  if (!cloudCfg() || !p.get('access_token')) return null;
  try {
    const user = await cloudHttp('/auth/v1/user', { token: p.get('access_token') });
    // Um link pode ter sido enviado por outra pessoa: só entra na conta do link depois de confirmar qual é
    const cur = lsGet(SESSION_LS);
    if (!(cur && cur.user && cur.user.id === user.id) && typeof confirmBox === 'function' &&
      !await confirmBox('Entrar com este link?', `O link é da conta <b>${esc(user.email || 'sem e-mail')}</b>. Só continue se essa conta for sua e se você abriu o link do seu próprio e-mail.`, 'Entrar')) return null;
    cloudSetSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600, user });
    return { type: p.get('type') || 'signup' };
  } catch (e) { return { error: e.message }; }
}

/* --- Rascunhos de viagem vindos do jogo (tabela trip_drafts) ---
   Outro programa (o leitor de telemetria) só cria rascunhos; quem decide é você, no app.
   Lançar ou descartar fica numa fila no navegador até o servidor confirmar, para funcionar offline. */
const DRAFTQ_LS = 'carreira-ats-draftq';
cloud.drafts = []; cloud.draftsOff = false; cloud.game = null; cloud.gameOff = false;
const draftQ = () => lsGet(DRAFTQ_LS) || {};
// Rascunhos já lançados ou descartados neste ou em outro aparelho (a viagem guarda o id do rascunho)
function draftsDone() {
  const ids = new Set(Object.keys(draftQ()));
  if (S) [...S.week.trips, ...H.flatMap(w => w.trips || [])].forEach(t => { if (t.draftId) ids.add(t.draftId); });
  return ids;
}
async function cloudDrafts() {
  if (cloud.draftsOff || !cloud.session || store.backend !== cloudBackend) return cloud.drafts;
  // primeiro envia o que ficou pendente
  const q = draftQ();
  for (const id of Object.keys(q)) {
    await cloudRest(`trip_drafts?id=eq.${encodeURIComponent(id)}&${meQ()}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { status: q[id].status, trip_id: q[id].tripId || null, resolved_at: new Date().toISOString() } });
    const now = draftQ(); delete now[id]; lsSet(DRAFTQ_LS, Object.keys(now).length ? now : null);
  }
  const rows = await cloudRest('trip_drafts?select=id,created_at,source,data&status=eq.new&order=created_at.asc&' + meQ());
  const done = draftsDone();
  cloud.drafts = (rows || []).filter(r => r && r.data && !done.has(r.id));
  return cloud.drafts;
}
// Busca os rascunhos sem atrapalhar a sincronização: sem a tabela no servidor, o recurso só fica desligado
async function refreshDrafts() {
  const before = cloud.drafts.map(d => d.id).join() + '|' + JSON.stringify(cloud.game);
  try { await cloudDrafts(); }
  catch (e) { if (e.code === 'setup') { cloud.draftsOff = true; cloud.drafts = []; } else return; }
  // situação atual do jogo (gravada pelo programa companheiro da telemetria)
  if (!cloud.gameOff && cloud.session && store.backend === cloudBackend) {
    const cols = 'game,online,game_time,job,truck,updated_at,collect,linked_profile,profile,blocked,pc_seen_at,plugin,game_version,last_delivery';
    try { const r = await cloudRest(`game_status?select=${cols}${cloud.noSimCols ? '' : ',sim,sim_last'}&` + meQ()); cloud.game = r && r[0] ? r[0] : null; }
    catch (e) {
      if (e.code === 'setup') { cloud.gameOff = true; cloud.game = null; }
      // servidor sem as colunas da simulação (schema.sql antigo): o resto continua funcionando
      else if (!cloud.noSimCols && /sim/.test(e.message || '')) { cloud.noSimCols = true; try { const r = await cloudRest(`game_status?select=${cols}&` + meQ()); cloud.game = r && r[0] ? r[0] : null; } catch (x) {} }
    }
  }
  if (typeof onGameStatus === 'function') onGameStatus();
  if (cloud.drafts.map(d => d.id).join() + '|' + JSON.stringify(cloud.game) !== before && typeof onDraftsChange === 'function') onDraftsChange();
}
async function resolveDraft(id, status, tripId) {
  const q = draftQ(); q[id] = { status, tripId: tripId || null }; lsSet(DRAFTQ_LS, q);
  cloud.drafts = cloud.drafts.filter(d => d.id !== id);
  try { await cloudDrafts(); } catch (e) {}   // sem conexão: fica na fila e vai na próxima verificação
}

// Controle da telemetria feito no app (coleta, perfil ligado): só estas colunas mudam; o programa do PC obedece na próxima volta
async function setGameControl(patch) {
  await cloudRest('game_status?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: Object.assign({ user_id: cloud.session.user.id }, patch) });
  cloud.game = Object.assign({}, cloud.game || {}, patch);
}
