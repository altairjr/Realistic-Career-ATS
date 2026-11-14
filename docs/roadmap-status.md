# Roadmap — onde estamos (v0.16, nov/2026)

| Fase | Objetivo | Status |
|---|---|---|
| 0 | Motor de regras separado da interface | ✅ Concluída |
| 1 | App em HTML | ✅ Concluída |
| 1b | Revisão para escalar (código, dados, regras dos EUA) | ✅ Concluída |
| 2 | Celular + sincronização | ✅ Concluída (publicado e ligado ao Supabase) |
| 3 | Integração com o jogo (telemetria) | ⬜ Não iniciada |
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

### Planilha no modelo original (v0.16, esta versão)
- Importar e exportar no modelo da planilha Carreira Realista ATS (9 abas), com as mesmas colunas, listas, cores e fórmulas.
- O modelo fica embutido no app sem nenhum dado (`61-sheet-model.js`, gerado por `tools/make-sheet-model.mjs`).
- Avaliações de entrega iguais às do jogo e da planilha (8 opções).
- Publicação no GitHub Pages e primeiro login no Supabase real confirmados.

### Fase 5 — parte já feita
- 5 classificações com predefinições; fixo, hora, CPM e percentual; jornada FMCSA; empréstimo; renome; bônus de segurança; experiência e CPM sugerido; status migratório; custos de owner-operator.

## Etapas que faltam
### Fase 2b — o que falta conferir
- Segundo aparelho (celular) entrando na mesma conta e recebendo a carreira.
- Gravar endereço e chave em `src/config.js` para os aparelhos novos não precisarem digitar.

### Fase 3 — Telemetria do ATS
- Plugin do SDK de telemetria da SCS e app companheiro no PC (Tauri ou Electron).
- Cada entrega vira um rascunho de viagem para confirmar (distância, frete, dano, multa, pedágio, combustível, horas).
- Com horários reais, entram as regras que hoje dependem de aproximação: 10h de folga entre turnos e restart de 34h exato.

### Fase 4 — Overlay
- Janela transparente sempre por cima, por atalho de teclado, com o jogo em "janela sem borda".

### Fase 5 — restante
- Folga em casa (home time) para OTR.
- Progressão automática: reajuste do CPM por tempo de casa e promoção sugerida.
- Caminhão próprio como bem: compra, financiamento, revenda e manutenção programada.
- Documentos do motorista: exame médico do DOT, proficiência em inglês e endossos da CDL (Hazmat, Tanker, Doubles/Triples).
- Eventos aleatórios (inspeção, quebra) e gráficos de evolução.

## Próxima etapa de implementação
**Fase 3: telemetria do ATS.**
1. Protótipo do leitor: plugin do SDK de telemetria da SCS gravando os dados da entrega.
2. App companheiro no PC que lê esses dados, entra na mesma conta e grava rascunhos de viagem no servidor.
3. No app, tela de rascunhos: confirmar, corrigir ou descartar cada entrega.
