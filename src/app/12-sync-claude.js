/* ---------- Sincronização na conta Claude (quando o app roda como artifact) ----------
   Documentos: data/users/<id>/app (estado) e .../app/weeks/<id> (semanas). Limite de 256 KiB por documento. */
async function connectClaude() {
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const id = user ? await user.id() : null;
    if (!db || !id) { setSync('local'); return; }
    const mainRef = () => db.doc(`data/users/${id}/app`);
    const weeksCol = () => mainRef().collection('weeks');
    store.uid = id; setSync('loading');
    store.backend = {
      name: 'claude',
      saveMain: body => mainRef().set(body),
      saveWeek: w => weeksCol().doc(w.id).set(w),
      deleteWeek: wid => weeksCol().doc(wid).delete(),
      wipe: async ids => { await mainRef().delete(); for (const wid of ids) await weeksCol().doc(wid).delete(); }
    };
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
      applyRemote(d);
    }, err => { clearTimeout(timer); handleDbError(err); });
    weeksCol().onSnapshot(qs => {
      if (qs.metadata.fromCache && qs.empty) return;
      if (qs.empty && H.length) { H.forEach(saveWeekRemote); return; }
      H = qs.docs.map(d => clone(d.data())).sort((a, b) => a.start - b.start);
      saveLocal(); if (tab === 'historico') render();
    }, err => handleDbError(err));
  } catch (e) { store.backend = null; setSync('local'); }
}
