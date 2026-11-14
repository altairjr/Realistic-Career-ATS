# Segurança (v0.17)

O repositório e o site são públicos. Este documento diz o que pode ficar à mostra, o que protege os dados e o que nunca pode ir para o repositório.

## O que pode ficar público
| Item | Onde fica | Por que pode |
|---|---|---|
| Endereço do projeto Supabase | `src/config.js` | Só identifica o servidor |
| Chave publicável (`sb_publishable_...`) | `src/config.js` | Feita para ficar no navegador. Sozinha não lê nem grava nada: sem login, o banco recusa tudo |

## O que nunca pode ir para o repositório, nem para o app
- **Chave secreta** (`sb_secret_...`) ou a antiga `service_role`: ignora todas as regras de acesso. O build falha se ela estiver em `src/config.js`, e a tela do app recusa essa chave.
- **Senha do banco** (Database password): dá acesso direto ao Postgres, sem passar pelas regras. O app não usa essa senha.
- **Planilhas e backups pessoais**: podem ter anotações ou senhas. O `.gitignore` bloqueia `.xlsx` na raiz, backups `.json` e arquivos `.env`.

## O que protege os dados
- **Acesso por usuário (RLS)**: em `supabase/schema.sql`, cada conta só lê e grava as próprias linhas. Visitantes sem login não têm permissão nenhuma.
- **Limite de tamanho** das linhas, para ninguém usar o banco como depósito de arquivos.
- **Sessão no navegador**: o token de login fica no armazenamento do próprio navegador e vale por 1 hora, renovado sozinho. "Sair" encerra a sessão.
- **Política de conteúdo (CSP)** no site publicado: a página só conversa com o próprio site, com o servidor do Supabase e com as fontes do Google. Mesmo que um texto malicioso entrasse no app, ele não conseguiria enviar dados para outro endereço.
- **Textos escapados**: tudo o que vem de planilha, backup, servidor ou digitação é exibido como texto, nunca como código.
- **Links de e-mail**: um link que traga o login de outra conta só é aceito depois de você confirmar o e-mail mostrado na tela.

## Configurações recomendadas no painel do Supabase
1. **Fechar o cadastro** depois de criar a sua conta: *Authentication › Sign In / Providers › Email* › desligue **Allow new users to sign up**. Como o app é público, qualquer pessoa poderia criar conta no seu servidor e gastar a cota gratuita. Ela não veria seus dados, mas ocuparia espaço.
2. **Senha mínima de 8 caracteres**: *Authentication › Sign In / Providers › Email* › **Minimum password length** = 8 (o app já exige 8; o servidor aceita 6 por padrão).
3. **Proteção contra vazamento de senhas** (*Leaked password protection*), se estiver disponível no seu plano.
4. **Rodar de novo o `supabase/schema.sql`** sempre que ele mudar. Ele pode ser executado várias vezes sem perder dados.
5. **Se a senha do banco já apareceu em algum arquivo** (planilha, print, repositório), troque em *Database › Settings › Reset database password*.

## O que não é objetivo
O app não é anti-trapaça: o dono da conta pode editar a própria carreira como quiser. A proteção é para que ninguém mais leia ou altere os seus dados.
