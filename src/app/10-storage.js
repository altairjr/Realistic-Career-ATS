/* ---------- Armazenamento ---------- */
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify({ state: S, history: H })); } catch (e) {} }
function loadLocal() { try { const r = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (r && r.state) { S = normalize(r.state); H = r.history || []; } } catch (e) {} }
function clearLocal() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }

const mainRef = () => store.db.doc(`data/users/${store.uid}/app`);
const weeksCol = () => mainRef().collection('weeks');
let writeTimer = null, writing = false, dirty = false, lastWriteRev = 0, retries = 0;

function persist() {
  saveLocal();
  if (!store.db) return;
  dirty = true; clearTimeout(writeTimer); writeTimer = setTimeout(flush, 700);
  setSync('wait');
}
async function flush() {
  if (writing || !dirty || !store.db || !S) return;
  writing = true; dirty = false;
  const body = clone(S); body._by = CLIENT; lastWriteRev = body._rev || 0;
  try { await mainRef().set(body); retries = 0; setSync('on'); }
  catch (e) { handleDbError(e, true); }
  finally { writing = false; if (dirty) flush(); }
}
async function saveWeekRemote(w) { if (!store.db) return; try { await weeksCol().doc(w.id).set(clone(w)); } catch (e) { handleDbError(e); } }
async function deleteWeekRemote(id) { if (!store.db) return; try { await weeksCol().doc(id).delete(); } catch (e) { handleDbError(e); } }
// Erros do armazenamento na conta. A cópia local continua valendo em todos os casos.
function handleDbError(e, wasWrite) {
  const code = e && e.code;
  if (code === 'quota_exceeded') { setSync('full'); toast('Armazenamento da conta cheio. Exporte um backup e exclua semanas antigas do Histórico.'); return; }
  if (code === 'invalid_argument' || code === 'transform_error') { setSync('big'); toast('Dados grandes demais para sincronizar. Feche a semana ou exporte um backup em Ajustes.'); return; }
  if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) { store.db = null; setSync('local'); return; }
  setSync('err');
  // falha passageira: tenta gravar de novo, no máximo 3 vezes
  if (wasWrite && retries < 3) { retries++; clearTimeout(writeTimer); writeTimer = setTimeout(() => { dirty = true; flush(); }, 3000 * retries); }
}
function setSync(st) { store.status = st; const el = document.getElementById('syncState'); if (el) el.outerHTML = syncBadge(); }
function syncBadge() {
  const m = { on: ['on', 'Sincronizado na sua conta'], wait: ['wait', 'Salvando…'], local: ['', 'Salvo só neste navegador'], err: ['wait', 'Sem conexão · cópia local'], loading: ['wait', 'Conectando…'], big: ['wait', 'Sem sincronizar: dados grandes demais'], full: ['wait', 'Sem sincronizar: armazenamento cheio'] }[store.status] || ['', ''];
  return `<span class="sync" id="syncState"><span class="dot ${m[0]}"></span>${m[1]}</span>`;
}

async function connectDb() {
  if (!window.claude || !window.claude.use) { setSync('local'); return; }
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const id = user ? await user.id() : null;
    if (!db || !id) { setSync('local'); return; }
    store.db = db; store.uid = id; setSync('loading');
    const timer = setTimeout(() => { if (!store.loaded) setSync('err'); }, 10000);
    mainRef().onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists) {
        if (snap.metadata.fromCache) return;
        clearTimeout(timer);
        if (!store.loaded) { store.loaded = true; if (S) { persist(); H.forEach(saveWeekRemote); } setSync(S ? 'wait' : 'on'); render(); }
        return;
      }
      const d = snap.data();
      if (!snap.metadata.fromCache) { clearTimeout(timer); if (store.status !== 'wait') setSync('on'); }
      const first = !store.loaded; store.loaded = true;
      if (d._by === CLIENT && (d._rev || 0) <= lastWriteRev) return;
      if (first && S && (S._rev || 0) > (d._rev || 0)) { persist(); return; }
      if (!first && dirty) return;
      S = normalize(clone(d)); delete S._by; saveLocal(); render();
    }, err => { clearTimeout(timer); handleDbError(err); });
    weeksCol().onSnapshot(qs => {
      if (qs.metadata.fromCache && qs.empty) return;
      if (qs.empty && H.length) { H.forEach(saveWeekRemote); return; }
      H = qs.docs.map(d => clone(d.data())).sort((a, b) => a.start - b.start);
      saveLocal(); if (tab === 'historico') render();
    }, err => handleDbError(err));
  } catch (e) { setSync('local'); }
}
