# Roadmap — onde estamos (v0.14, nov/2026)

| Fase | Objetivo | Status |
|---|---|---|
| 0 | Motor de regras separado da interface | ✅ Concluída |
| 1 | App em HTML | ✅ Concluída |
| 1b | Revisão para escalar (código, dados, regras dos EUA) | ✅ Concluída |
| 2 | Celular + sincronização | 🟡 Parcial |
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

### Fase 1b — Revisão para escalar (esta versão)
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

### Fase 2 — parte já feita
- Interface para celular e PC.
- Sincronização pela conta claude.ai quando aberto como artifact; cópia local; backup em JSON.

### Fase 5 — parte já feita
- 5 classificações com predefinições; fixo, hora, CPM e percentual; jornada FMCSA; empréstimo; renome; bônus de segurança; experiência e CPM sugerido; status migratório; custos de owner-operator.

## Etapas que faltam
### Fase 2 — restante
- **App instalável (PWA)**: manifesto e service worker, hospedado fora do Claude (GitHub Pages), com ícone na tela inicial e uso offline.
- **Sincronização própria com login** (ex.: Supabase): a atual só existe dentro do claude.ai, e o leitor de telemetria e o overlay precisam gravar de fora.
- **Migração**: exportar o JSON do artifact e importar na versão hospedada.

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
**Fase 2b: app instalável e sincronização própria.**
1. Subir o repositório no GitHub e publicar `dist/` no GitHub Pages (os testes já rodam a cada envio).
2. Transformar em PWA: manifesto, ícones e service worker para uso offline.
3. Criar a camada de sincronização com login, usando o esquema v3, e trocar `src/app/10-storage.js` por um adaptador com dois modos (conta Claude ou serviço próprio).
4. Importar o JSON exportado da versão atual.

Essa etapa vem antes da telemetria porque o app companheiro precisa de um lugar para gravar as viagens fora do Claude.
