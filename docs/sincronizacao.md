# App instalável e sincronização própria (v0.17)

> Este repositório já vem ligado ao servidor do projeto (`src/config.js`): o app publicado abre pedindo só e-mail e senha. Para usar outro servidor, troque os dois valores de `src/config.js`. Regras de segurança em `seguranca.md`.

O app tem três formas de guardar os dados. Ele escolhe sozinho:

| Onde o app roda | Onde os dados ficam | Sincroniza entre aparelhos? |
|---|---|---|
| Dentro do Claude (artifact) | Conta Claude | Sim, pela conta Claude |
| Publicado (GitHub Pages) ou instalado, **com conta** | Navegador + servidor próprio (Supabase) | Sim, com login por e-mail e senha |
| Publicado, instalado ou aberto como arquivo, **sem conta** | Só no navegador | Não (use Exportar/Importar JSON) |

O app sempre funciona sem servidor. A conta só acrescenta a sincronização.

## Passo 1 — Publicar no GitHub Pages
1. No GitHub, abra o repositório › **Settings › Pages** › em *Source* escolha **GitHub Actions**.
2. Envie o código para a branch `main` (por exemplo, fazendo o merge de `development` em `main`).
3. O workflow `.github/workflows/pages.yml` roda os testes, gera `dist/` e publica. Acompanhe na aba **Actions**.
4. O endereço fica no formato `https://SEU-USUARIO.github.io/Realistic-Career-ATS/`.

Em repositório privado, o GitHub Pages exige plano pago. Com o repositório público, é gratuito.

## Passo 2 — Instalar no celular e no PC
Abra o endereço publicado e vá em **Ajustes › Dados e sincronização › Instalar o app**.
- **Android e PC (Chrome, Edge):** botão *Instalar app* ou menu do navegador › *Instalar app*.
- **iPhone e iPad (Safari):** *Compartilhar › Adicionar à Tela de Início*.

Depois de aberto uma vez, o app abre sem internet. Com internet, ele busca a versão nova sozinho ao abrir.

## Passo 3 — Criar o servidor de sincronização (Supabase)
1. Crie uma conta e um projeto em https://supabase.com (o plano gratuito basta).
2. No painel, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas `careers` e `career_weeks` e a regra que deixa cada usuário ver só os próprios dados.
3. Em **Authentication › URL Configuration**, coloque o endereço publicado do app em *Site URL*. Os links de confirmação de e-mail e de troca de senha voltam para esse endereço.
4. Em **Settings › API Keys**, copie o **endereço do projeto** (`https://xxxx.supabase.co`) e a **chave publicável** (`sb_publishable_...`).
5. Ligue o app ao servidor, de um destes jeitos:
   - **Para todos os aparelhos (recomendado):** preencha `src/config.js` com o endereço e a chave, rode `npm run build` e envie para a `main`. O app publicado já abre pedindo só e-mail e senha.
   - **Só neste navegador:** em *Ajustes › Dados e sincronização*, preencha *Endereço do servidor* e *Chave publicável* e toque em *Salvar servidor*.
6. No app, toque em **Criar conta**. Nos outros aparelhos, use **Entrar** com o mesmo e-mail e senha.

Recomendado (detalhes em `seguranca.md`):
- **Sem confirmação de e-mail:** em *Authentication › Sign In / Providers › Email*, desligue *Confirm email*. A conta já entra ao ser criada.
- **Fechar o cadastro:** depois de criar a sua conta, desligue *Allow new users to sign up* para ninguém mais criar conta no seu servidor.

Observações sobre o plano gratuito do Supabase: projetos sem uso por um tempo podem ser pausados (basta reativar no painel) e o envio de e-mails de confirmação tem limite por hora.

## Passo 4 — Trazer a carreira que está no Claude
1. Na versão do Claude: **Ajustes › Dados e sincronização › Exportar JSON**.
2. Na versão publicada: **Importar JSON**. Com a conta conectada, a carreira importada vai para a conta e aparece nos outros aparelhos.

## Como a sincronização se comporta
- Cada mudança é gravada no navegador na hora e enviada ao servidor em menos de 1 segundo.
- O app confere o servidor a cada 15 segundos, quando volta para a tela e quando a internet volta. Há também o botão **Sincronizar agora**.
- **Sem internet**, tudo continua funcionando. As mudanças ficam guardadas e sobem quando a conexão voltar, mesmo que o app tenha sido fechado.
- **Dois aparelhos mudando ao mesmo tempo:** vale a carreira com a mudança mais recente, inteira (não há mistura de viagens). Evite lançar viagens em dois aparelhos enquanto um deles estiver offline.
- **Primeiro login num aparelho que já tem outra carreira:** o app mostra as duas e pergunta qual fica.
- **Sair** não apaga nada: os dados continuam no navegador e na conta.
- **Apagar tudo** apaga a carreira deste aparelho e da conta. Outro aparelho que ainda tenha a carreira guarda a cópia dele e a envia de novo na próxima mudança.

## Segurança
- A chave publicável pode ficar no código e no repositório público. Ela só identifica o projeto.
- Quem protege os dados é a regra por usuário (Row Level Security) do `schema.sql`: sem login não se lê nem grava nada, e cada conta só acessa as próprias linhas.
- **Nunca** use a chave secreta (`sb_secret_...` ou `service_role`) no app. O app recusa essa chave.
- A chave vai no cabeçalho `apikey`; o `Authorization` leva o token do usuário logado, como a documentação do Supabase orienta.

## Mensagens na tela
| Mensagem | Significado | O que fazer |
|---|---|---|
| Sincronizado na sua conta | Servidor e aparelho iguais | Nada |
| Salvando… | Mudança a caminho do servidor | Esperar |
| Sem conexão · cópia local | Servidor inacessível | Continuar usando; envia sozinho depois |
| Sessão expirada · entre de novo | O login perdeu a validade | Entrar de novo; nada se perde |
| Servidor sem as tabelas do app | O `schema.sql` não foi rodado (ou falta permissão) | Rodar o `schema.sql` no SQL Editor |
| Salvo só neste navegador | Sem conta conectada | Entrar ou criar conta, se quiser sincronizar |

## Como isso foi testado
- **Testes automáticos** (`npm test`, arquivo `tests/sync.test.cjs`): um servidor de teste (`tests/mock-supabase.cjs`) imita o login e as tabelas do Supabase. Cobrem criar conta, entrar em outro aparelho, mudança nos dois sentidos, offline, app fechado offline, token vencido, sessão revogada, conflito de carreiras, isolamento entre contas e mensagens de erro.
- **No navegador** (com o mesmo servidor de teste): dois aparelhos (PC e celular), instalação do service worker, abertura offline e envio ao voltar a conexão.
- **Ainda não testado contra um projeto Supabase real.** O primeiro uso com o seu projeto é o teste final; se alguma mensagem do servidor vier diferente do esperado, o app mostra o texto original do erro.
