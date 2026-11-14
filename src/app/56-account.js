/* ---------- Conta, servidor de sincronização e instalação do app (Ajustes › Dados e sincronização) ---------- */
let installEvt = null;   // convite de instalação guardado pelo navegador (Chrome, Edge, Android)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (tab === 'ajustes') render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('App instalado'); if (tab === 'ajustes') render(); });
}
const isInstalled = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isHosted = () => /^https?:$/.test(location.protocol);

function accountBlock() {
  if (store.mode === 'claude') return `<div class="full">${syncBadge()}</div>${hint('Esta versão roda dentro do Claude e salva na sua conta Claude. Para usar o app instalado no celular ou no PC, exporte o JSON aqui e importe na versão publicada.')}`;
  const cfg = cloudCfg(), L = labRow('data.account', 'Conta e sincronização');
  const head = `<div class="full">${L.row}${L.box}</div>`;
  if (!cfg) return head + `${hint('Sem servidor, os dados ficam só neste navegador. Para sincronizar celular e PC, informe o servidor (projeto Supabase). O passo a passo está em docs/sincronizacao.md.')}
    <div class="field"><label for="cloudUrl">Endereço do servidor</label><input id="cloudUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://seu-projeto.supabase.co"></div>
    <div class="field"><label for="cloudKey">Chave publicável</label><input id="cloudKey" type="text" autocomplete="off" spellcheck="false" placeholder="sb_publishable_..."></div>
    <div class="full row"><button class="btn primary" data-act="cloud-save">Salvar servidor</button><span>${syncBadge()}</span></div>`;
  if (!cloud.session) return head + `
    <div class="field"><label for="accEmail">E-mail</label><input id="accEmail" type="email" inputmode="email" autocomplete="username" placeholder="voce@exemplo.com"></div>
    <div class="field"><label for="accPass">Senha</label><input id="accPass" type="password" autocomplete="current-password" placeholder="Pelo menos 8 caracteres"></div>
    <div class="full row"><button class="btn primary" data-act="acc-in">Entrar</button><button class="btn" data-act="acc-up">Criar conta</button><button class="btn ghost" data-act="acc-forgot">Esqueci a senha</button>${cfg.fixed ? '' : '<button class="btn ghost" data-act="cloud-clear">Trocar servidor</button>'}</div>
    <div class="full">${syncBadge()}</div>`;
  return head + `<div class="full row between"><span>Conectado como <b>${esc(cloud.session.user.email)}</b></span>${syncBadge()}</div>
    <div class="full row"><button class="btn" data-act="acc-sync">Sincronizar agora</button><button class="btn" data-act="acc-pass">Trocar senha</button><button class="btn" data-act="acc-out">Sair</button></div>`;
}
function installBlock() {
  if (store.mode === 'claude') return '';
  const L = labRow('data.install', 'Instalar o app');
  const body = isInstalled() ? hint('O app está instalado neste aparelho e abre sem internet.')
    : !isHosted() ? hint('Para instalar, abra o app pelo endereço publicado (GitHub Pages). Aberto como arquivo, ele funciona, mas não instala nem atualiza sozinho.')
    : installEvt ? `<div class="full row"><button class="btn primary" data-act="install">Instalar app</button></div>`
    : hint('No iPhone ou iPad (Safari): Compartilhar › Adicionar à Tela de Início. No Android ou no PC (Chrome, Edge): menu do navegador › Instalar app.');
  return `<div class="full">${L.row}${L.box}</div>${body}`;
}
function dataSummary() {
  if (store.mode === 'claude') return store.status === 'on' ? 'Sincronizado na sua conta' : 'Exportar, importar ou recomeçar';
  if (cloud.session) return `Conta ${cloud.session.user.email} · ${(SYNC_TEXT[store.status] || ['', ''])[1].toLowerCase()}`;
  return cloudCfg() ? 'Entre na conta para sincronizar celular e PC' : 'Salvo só neste navegador';
}

// Carreira neste aparelho diferente da que está na conta: mostra as duas e pergunta qual fica.
function cloudChoose({ local, remote }) {
  const card = (t, st) => { let b = 0; try { b = balance(normalize(clone(st))); } catch (e) {} return `<div class="panel pad" style="flex:1;min-width:150px"><div class="eyebrow">${t}</div><b>${esc((st.profile && st.profile.name) || 'Sem nome')}</b><div class="muted" style="font-size:13px">Dia ${fmtN(st.gameDay || 1)} · saldo ${fmt(b)}</div></div>`; };
  return new Promise(res => {
    openModal(`<h2>Qual carreira fica?</h2>
      <p style="margin:0">Este aparelho tem uma carreira e a conta já tem outra. Só uma pode ficar; a outra é substituída.</p>
      <div class="row" style="align-items:stretch">${card('Neste aparelho', local)}${card('Na conta', remote)}</div>
      <p class="muted" style="margin:0;font-size:13px">Na dúvida, cancele e faça um backup em Exportar JSON antes de entrar.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-pick="cancel">Cancelar</button><button class="btn" data-pick="local">Enviar a deste aparelho</button><button class="btn primary" data-pick="remote">Usar a da conta</button></div>`, sh => {
      sh.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { closeModal(); res(b.dataset.pick); });
    });
  });
}
function newPasswordFlow(title = 'Trocar senha') {
  openModal(`<h2>${title}</h2>
    <div class="field"><label for="npw">Nova senha</label><input id="npw" type="password" autocomplete="new-password" placeholder="Pelo menos 8 caracteres"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar senha</button></div>`, sh => {
    sh.querySelector('[data-x]').onclick = closeModal;
    sh.querySelector('[data-ok]').onclick = async () => {
      const pw = sh.querySelector('#npw').value;
      if (pw.length < 8) return toast('Use pelo menos 8 caracteres.');
      try { await cloudSetPassword(pw); closeModal(); toast('Senha alterada'); } catch (e) { toast(e.message); }
    };
  });
}

// Ações dos botões do bloco. Devolve true quando a ação era daqui.
async function accountAction(a, el) {
  const val = id => (document.getElementById(id) || {}).value || '';
  const busy = async fn => { el.disabled = true; try { await fn(); } catch (e) { toast(e.message || 'Não foi possível concluir.'); } finally { el.disabled = false; } };
  if (a === 'cloud-save') {
    try { cloudSetCfg(val('cloudUrl'), val('cloudKey')); } catch (e) { toast(e.message); return true; }
    store.mode = 'cloud'; await cloudStart(); render(); toast('Servidor salvo. Agora entre ou crie sua conta.'); return true;
  }
  if (a === 'cloud-clear') {
    if (!await confirmBox('Trocar servidor?', 'O endereço e a chave salvos neste navegador são apagados. Seus dados locais continuam.', 'Trocar')) return true;
    await cloudSignOut(); lsSet(CLOUD_LS, null); lsSet(LINK_LS, null); store.mode = 'local'; setSync('local'); render(); return true;
  }
  if (a === 'acc-in' || a === 'acc-up') {
    const email = val('accEmail').trim(), pw = val('accPass');
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Informe um e-mail válido.'); return true; }
    if (pw.length < (a === 'acc-up' ? 8 : 1)) { toast(a === 'acc-up' ? 'Use uma senha com pelo menos 8 caracteres.' : 'Informe a senha.'); return true; }
    await busy(async () => {
      if (a === 'acc-in') { await cloudSignIn(email, pw); if (cloud.session) toast('Conta conectada'); }
      else if (await cloudSignUp(email, pw)) toast('Conta criada e conectada');
      else { await confirmBox('Confirme seu e-mail', `Enviamos um link para <b>${esc(email)}</b>. Abra o link e depois volte aqui para entrar.`, 'Entendi'); return; }
      render();
    });
    return true;
  }
  if (a === 'acc-forgot') {
    const email = val('accEmail').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Preencha o e-mail da conta e toque de novo.'); return true; }
    await busy(async () => { await cloudRecover(email); await confirmBox('Veja seu e-mail', `Se existir uma conta com <b>${esc(email)}</b>, enviamos um link para criar uma nova senha. Abra o link neste aparelho.`, 'Entendi'); });
    return true;
  }
  if (a === 'acc-sync') { await busy(async () => { await cloudPoll(); toast(store.status === 'on' ? 'Tudo sincronizado' : (SYNC_TEXT[store.status] || ['', 'Sem conexão'])[1]); }); return true; }
  if (a === 'acc-pass') { newPasswordFlow(); return true; }
  if (a === 'acc-out') {
    if (!await confirmBox('Sair da conta?', 'Os dados continuam neste navegador e na conta. Este aparelho só para de sincronizar até você entrar de novo.', 'Sair')) return true;
    await cloudSignOut(); render(); toast('Você saiu da conta'); return true;
  }
  if (a === 'install') { if (installEvt) { const ev = installEvt; installEvt = null; ev.prompt(); try { await ev.userChoice; } catch (e) {} render(); } return true; }
  return false;
}
// Quando a sessão cai ou volta, a tela de Ajustes troca entre o formulário de login e a conta conectada.
function onSyncChange(st, was) {
  const off = x => ['out', 'login', 'local'].includes(x);
  if (tab === 'ajustes' && off(st) !== off(was) && !document.querySelector('#modalRoot .sheet')) render();
}
