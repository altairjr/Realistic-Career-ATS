# Roadmap — onde estamos (v0.18, nov/2026)

| Fase | Objetivo | Status |
|---|---|---|
| 0 | Motor de regras separado da interface | ✅ Concluída |
| 1 | App em HTML | ✅ Concluída |
| 1b | Revisão para escalar (código, dados, regras dos EUA) | ✅ Concluída |
| 2 | Celular + sincronização | ✅ Concluída (site publicado, app instalável, login e sincronização) |
| 3 | Integração com o jogo (telemetria) | 🟡 Base pronta (rascunhos); falta o leitor do jogo |
| 4 | Overlay sobre o jogo | ⬜ Não iniciada |
| 5 | Carreira avançada | 🟡 Boa parte entregue |

## Etapas concluídas
### Fase 0 — Motor de regras
- `src/engine.js`: funções puras para resultado da semana, viagem, carro, impostos, jornada e predefinições.

### Fase 1 — App
- Painel, Diário, Holerite, Histórico, Carreira (motorista, contrato, empresas) e Ajustes.
- Regras gravadas por viagem; contratos com histórico; pay lag; contas fixas pelo calendário; empréstimo com juros.
- Carro emprestado e próprio; infrações de jornada com fiscalização; ajuda em todos os campos e guia das regras.
- Importação e exportação em planilha (.xlsx) e backup em JSON.

### Fase 1b — Revisão para escalar (v0.14)
- **Código**:
  - App dividido em 13 módulos (`src/app/`), com build por concatenação e sem dependências.
  - 23 testes automáticos: 14 do motor e 9 do estado (carreira, contas, empréstimo, compactação, infrações, planilha).
  - Código morto e migrações antigas removidos.
- **Dados**:
  - Esquema versionado (v3) e documentado em `esquema-de-dados.md`.
  - Compactação do extrato e dos holerites com mais de 12 semanas, para respeitar o limite de 256 KiB por documento.
  - Erros de sincronização agora aparecem na tela e a gravação é tentada de novo.
- **Regras dos EUA**:
  - Autônomo (1099): self-employment tax sobre o lucro do negócio, sem abater plano de saúde e 401(k); dedução QBI de 20%; holerite chamado de acerto (settlement) e imposto tratado como reserva do estimado trimestral.
  - Jornada: restart de 34h (um dia inteiro de folga zera o ciclo).
  - Tipos de operação no padrão do mercado: Local, Regional, Dedicated e OTR.
- **Interface**:
  - Assistente de nova carreira no primeiro acesso.
  - Cabeçalho compacto no celular; navegação no topo no PC.
  - Botão de nova viagem menor no celular; avisos não cobrem mais o cabeçalho.
  - Formulário de viagem em duas colunas no celular; valores longos não são mais cortados.
  - Holerite e Histórico sem números repetidos do cabeçalho.

### Fase 2 — Celular e sincronização
- Interface para celular e PC.
- Sincronização pela conta claude.ai quando aberto como artifact; cópia local; backup em JSON.

### Fase 2b — App instalável e sincronização própria (v0.15)
- **App instalável (PWA)**: manifesto, ícones e service worker. Abre sem internet e se atualiza sozinho.
- **Publicação**: workflow do GitHub Pages que testa, gera e publica a cada envio para a `main`.
- **Sincronização própria com login**:
  - `10-storage.js` virou um controlador com dois backends: conta Claude (`12-sync-claude.js`) e servidor próprio (`14-sync-cloud.js`).
  - Servidor Supabase acessado por REST, sem bibliotecas: criar conta, entrar, sair, trocar e recuperar senha.
  - Tabelas `careers` e `career_weeks` com acesso por usuário (`supabase/schema.sql`).
  - Fila offline, renovação de sessão, verificação a cada 15 s e escolha entre a carreira do aparelho e a da conta no primeiro login.
- **Interface**: bloco de conta, servidor e instalação em Ajustes › Dados e sincronização; login já na tela de primeiro acesso; Exportar JSON baixa o arquivo direto fora do Claude.
- **Testes**: 31 automáticos (8 novos de sincronização, com servidor de teste) e teste de dois aparelhos no navegador.
- **Documentação**: `sincronizacao.md` com o passo a passo.

### Planilha no modelo original (v0.16)
- Importar e exportar no modelo da planilha Carreira Realista ATS (9 abas), com as mesmas colunas, listas, cores e fórmulas.
- O modelo fica embutido no app sem nenhum dado (`61-sheet-model.js`, gerado por `tools/make-sheet-model.mjs`).
- Avaliações de entrega iguais às do jogo e da planilha (8 opções).
- Publicação no GitHub Pages e primeiro login no Supabase real confirmados.

### Atualização automática e segurança (v0.16.1 e v0.17)
- O app publicado percebe a versão nova sozinho e recarrega uma vez (o defeito que mantinha a versão antiga foi corrigido).
- Endereço e chave publicável do Supabase gravados no app: qualquer aparelho abre direto no login.
- Build recusa chave secreta; política de conteúdo (CSP) limita o site ao próprio endereço, ao Supabase e às fontes.
- Link de e-mail de outra conta só é aceito com confirmação; limites de tamanho e permissões revisadas no `schema.sql`; `.gitignore` bloqueia planilhas, backups e `.env`.
- Guia `seguranca.md` com o que pode e o que não pode ficar público.

### Preparação da fase 3 (v0.18, esta versão)
- **Viagens do jogo**: tabela `trip_drafts` e caixa de entrada no app. O leitor de telemetria só cria rascunhos; você lança (formulário já preenchido) ou descarta. Funciona offline e entre aparelhos. Formato em `telemetria.md`.
- **Ferramenta de teste**: `tools/enviar-rascunho.mjs` envia uma entrega de exemplo para a sua conta.
- **Testes no navegador no repositório**: 5 testes (telas, planilha, dois aparelhos, offline, atualização, viagens do jogo) rodando no GitHub antes de cada publicação. Total: 37 automáticos + 5 no navegador.
- **Supabase configurado**: cadastro fechado, senha mínima de 8, `schema.sql` aplicado, senha do banco trocada; celular confirmado.

### Fase 5 — parte já feita
- 5 classificações com predefinições; fixo, hora, CPM e percentual; jornada FMCSA; empréstimo; renome; bônus de segurança; experiência e CPM sugerido; status migratório; custos de owner-operator.

## Etapas que faltam
### Fase 3 — Telemetria do ATS
- **Fonte dos dados**: o SDK de telemetria da SCS (plugin `.dll` carregado pelo jogo). As versões recentes do SDK trazem eventos de jogo, como entrega concluída (frete, distância, dano da carga), multa, pedágio e abastecimento, que cobrem quase todos os campos de uma viagem. Confirmar no SDK atual antes de começar.
- **Leitor no PC**: plugin próprio ou um plugin da comunidade que já exponha esses eventos, mais um programa pequeno que fica aberto junto do jogo, entra na mesma conta e envia cada entrega.
- ~~Rascunhos~~: pronto na v0.18.
- **Regras com horário real**: 10h de folga entre turnos e restart de 34h exatos, com o relógio do jogo.

### Fase 4 — Overlay
- Janela transparente sempre por cima, por atalho de teclado, com o jogo em "janela sem borda".

### Fase 5 — restante
- Folga em casa (home time) para OTR.
- Progressão automática: reajuste do CPM por tempo de casa e promoção sugerida.
- Caminhão próprio como bem: compra, financiamento, revenda e manutenção programada.
- Documentos do motorista: exame médico do DOT, proficiência em inglês e endossos da CDL (Hazmat, Tanker, Doubles/Triples).
- Eventos aleatórios (inspeção, quebra) e gráficos de evolução.

### Futuro
- **ETS2**: o nome do projeto já prevê o Euro Truck Simulator 2. Exige outro conjunto de regras (euro, tacógrafo da UE, impostos europeus), aproveitando o mesmo motor e a mesma telemetria.

## Próxima etapa de implementação
**Fase 3a — prova de conceito do leitor do jogo:**
1. Confirmar no SDK de telemetria atual da SCS quais eventos chegam na entrega e com quais campos.
2. Escolher entre plugin próprio e um plugin da comunidade.
3. Gravar as entregas de uma sessão de jogo num arquivo e comparar com o lançamento manual.
4. Programa companheiro que entra na conta e envia cada entrega como rascunho (`telemetria.md`).
