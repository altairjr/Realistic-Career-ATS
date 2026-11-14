/* Servidor de sincronização (Supabase). Opcional.
   Preencha com os dados do SEU projeto (Settings › API Keys) e rode o build.
   A chave publicável (sb_publishable_...) pode ficar no código: quem protege os dados
   são as regras de acesso por usuário (RLS) criadas pelo arquivo supabase/schema.sql.
   NUNCA coloque aqui a chave secreta (sb_secret_... ou service_role).
   Vazio = o app pergunta o servidor em Ajustes › Dados e sincronização. */
const CLOUD_CONFIG = {
  url: 'https://tjaplchckxsiraouzqtz.supabase.co',
  key: 'sb_publishable_JeaaGtd1YBcTltujOzqV5g_PfCtsMm5'
};
