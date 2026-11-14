/* ---------- Armazenamento: cópia local + sincronização ----------
   A cópia local (localStorage) sempre vale. Quando há um backend ativo, cada mudança também é enviada a ele.
   Um backend é um objeto com: saveMain(corpo), saveWeek(semana), deleteWeek(id), wipe(ids).
   Backends: conta Claude (12-sync-claude.js) e servidor próprio com login (14-sync-cloud.js). */
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify({ state: S, history: H })); } catch (e) {} }
function loadLocal() { try { const r = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (r && r.state) { S = normalize(r.state); H = r.history || []; } } catch (e) {} }
function clearLocal() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }

let writeTimer = null, writing = false, dirty = false, lastWriteRev = 0, retries = 0;

function persist() {
  saveLocal();
  if (!store.backend) return;
  dirty = true; flushSoon(700);
  if (store.loaded) setSync('wait');
}
// Envia o estado ao backend. Só depois da primeira leitura, para nunca gravar por cima de dados que ainda não chegaram.
async function flush() {
  if (writing || !dirty || !store.backend || !store.loaded || !S) return;
  const backend = store.backend;
  writing = true; dirty = false;
  const body = clone(S); body._by = CLIENT; lastWriteRev = body._rev || 0;
  let ok = false;
  try { await backend.saveMain(body); ok = true; retries = 0; if (store.backend === backend) setSync(dirty ? 'wait' : 'on'); }
  catch (e) { if (store.backend === backend) { dirty = true; handleDbError(e, true); } }
  finally { writing = false; if (ok && dirty) flushSoon(0); }
}
function flushSoon(ms) { clearTimeout(writeTimer); writeTimer = setTimeout(() => { writeTimer = null; flush(); }, ms); }
async function saveWeekRemote(w) { if (!store.backend) return; try { await store.backend.saveWeek(clone(w)); } catch (e) { handleDbError(e); } }
async function deleteWeekRemote(id) { if (!store.backend) return; try { await store.backend.deleteWeek(id); } catch (e) { handleDbError(e); } }
async function wipeRemote(ids) { if (!store.backend) return; try { await store.backend.wipe(ids); } catch (e) { handleDbError(e); } }
// Dados que chegaram do backend passam a valer neste aparelho
function applyRemote(d) { S = normalize(clone(d)); delete S._by; saveLocal(); render(); }

// Erros de sincronização. A cópia local continua valendo em todos os casos.
function handleDbError(e, wasWrite) {
  const code = e && e.code;
  if (code === 'quota_exceeded') { setSync('full'); toast('Armazenamento da conta cheio. Exporte um backup e exclua semanas antigas do Histórico.'); return; }
  if (code === 'invalid_argument' || code === 'transform_error') { setSync('big'); toast('Dados grandes demais para sincronizar. Feche a semana ou exporte um backup em Ajustes.'); return; }
  if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) { store.backend = null; setSync('local'); return; }
  if (code === 'auth') { setSync('login'); toast('Sua sessão expirou. Entre de novo em Ajustes › Dados e sincronização.'); return; }
  if (code === 'setup') { setSync('setup'); return; }
  setSync('err');
  // falha passageira: tenta gravar de novo, no máximo 3 vezes (o servidor próprio tenta de novo a cada verificação)
  if (wasWrite && retries < 3) { retries++; flushSoon(3000 * retries); }
}
function setSync(st) {
  const was = store.status; store.status = st;
  if (typeof document === 'undefined') return;
  const el = document.getElementById('syncState'); if (el) el.outerHTML = syncBadge();
  if (was !== st && typeof onSyncChange === 'function') onSyncChange(st, was);
}
const SYNC_TEXT = {
  on: ['on', 'Sincronizado na sua conta'], wait: ['wait', 'Salvando…'], local: ['', 'Salvo só neste navegador'],
  err: ['wait', 'Sem conexão · cópia local'], loading: ['wait', 'Conectando…'],
  big: ['wait', 'Sem sincronizar: dados grandes demais'], full: ['wait', 'Sem sincronizar: armazenamento cheio'],
  out: ['', 'Salvo só neste navegador · entre na conta para sincronizar'], login: ['wait', 'Sessão expirada · entre de novo'],
  setup: ['wait', 'Servidor sem as tabelas do app']
};
function syncBadge() {
  const m = SYNC_TEXT[store.status] || ['', ''];
  return `<span class="sync" id="syncState"><span class="dot ${m[0]}"></span>${m[1]}</span>`;
}

// Escolhe o modo: dentro do Claude usa a conta Claude; fora, o servidor próprio (se configurado); senão, só local.
async function connectSync() {
  if (typeof window !== 'undefined' && window.claude && window.claude.use) { store.mode = 'claude'; return connectClaude(); }
  store.mode = cloudCfg() ? 'cloud' : 'local';
  return cloudStart();
}
