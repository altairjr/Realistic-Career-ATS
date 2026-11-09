# Roadmap — onde estamos (v0.11, nov/2026)

| Fase | Objetivo | Status |
|---|---|---|
| 0 | Motor de regras separado da interface | ✅ Concluída |
| 1 | MVP em HTML | ✅ Concluída (e ampliada) |
| 2 | Celular + sincronização | 🟡 Parcial |
| 3 | Integração com o jogo (telemetria) | ⬜ Não iniciada |
| 4 | Overlay sobre o jogo | ⬜ Não iniciada |
| 5 | Carreira avançada | 🟡 Boa parte antecipada |

## Fase 0 — Motor de regras ✅
- `src/engine.js`: funções puras, sem interface (DRE, viagem, carro, impostos, jornada, presets).
- Reaproveitável no app, no companion de telemetria e no overlay.
- 10 testes automáticos (`npm test`).

## Fase 1 — MVP em HTML ✅
**Entregue:**
- Painel com DRE resumido.
- Diário de bordo.
- Fechamento de semana com pay lag.
- Holerite do bruto ao líquido.
- Histórico.
- Exportar e importar em JSON.

**Além do previsto:**
- Carreira com empresas, contratos e histórico.
- Regras gravadas por viagem.
- Camada de realismo EUA 2026 (impostos, quem paga, frete de mercado).
- Carro emprestado e próprio.
- Contas fixas pelo calendário.
- Empréstimo com juros.
- Ajuda em todos os campos.

## Fase 2 — Celular + sincronização 🟡
**Feito:**
- Interface pensada para celular.
- Sincronização entre PC e celular pela conta claude.ai, quando aberto como artifact.
- Cópia local de reserva.
- JSON para backup.

**Falta:**
- **App instalável (PWA)**: manifesto e service worker, hospedado fora do Claude (ex.: GitHub Pages), funcionando offline e com ícone na tela inicial.
- **Backend próprio de sincronização** (ex.: Supabase com login): a sincronização atual só existe dentro do claude.ai. O companion de telemetria e o overlay (fases 3 e 4) precisam gravar dados de fora, então essa é a decisão que destrava o resto.
- **Migração**: exportar JSON do artifact e importar na versão hospedada.

## Fase 3 — Telemetria do ATS ⬜
**Pré-requisitos prontos:**
- O modelo de viagem já tem os campos que a telemetria entrega: origem, destino, distância, frete, dano, multa, pedágio, combustível e horas.
- O motor é independente da interface.

**Falta:**
- Plugin do SDK de telemetria da SCS (DLL em `bin/win_x64/plugins`), usando um plugin da comunidade que expõe os dados por memória compartilhada.
- App companheiro no PC (Tauri ou Electron) que lê os eventos de entrega, multa, pedágio, abastecimento e o relógio do jogo.
- Criação de rascunhos de viagem para o jogador confirmar.
- Envio dos dados para o backend da fase 2.
- Mapeamento do relógio do jogo para o "dia do jogo" do app.

## Fase 4 — Overlay ⬜
- Janela transparente sempre por cima, aberta por atalho de teclado, reaproveitando o mesmo HTML.
- Requer o jogo em "janela sem borda". Tela cheia exclusiva exige injeção no DirectX e fica para o fim.
- Depende da fase 3 (companion) para receber dados ao vivo.

## Fase 5 — Carreira avançada 🟡
**Já feito:**
- 5 classificações, de W-2 a frota, com presets.
- Formas de pagamento: fixo, hora, CPM e percentual.
- Jornada FMCSA com alertas.
- Empréstimos.
- Renome.
- Bônus de segurança.
- Experiência e CPM sugerido.
- Status migratório e CDL.
- Custos de owner-operator.

**Falta:**
- **Home time**: folga em casa proporcional às semanas na estrada (OTR), com bloqueio de viagens nos dias de folga.
- **Restart de 34h e 10h de folga** entre turnos (exige horário de início e fim por viagem, que a telemetria resolve).
- **Progressão automática**: reajuste do CPM por milhas ou tempo de casa, e promoção sugerida (ex.: Company → Lease).
- **Caminhão próprio como bem**: compra, financiamento, valor de revenda e manutenção programada.
- **Eventos aleatórios**: inspeção DOT, quebra, multa de balança, bônus de cliente.
- **Metas e relatórios**: gráficos de lucro por semana, $/mi e comparação entre empresas.

## Dívida técnica
- **Arquivos grandes**: o app está em um arquivo só (`src/app.js`, cerca de 1.300 linhas). Antes da fase 3, vale separar em módulos (estado, telas, formulários) com um bundler leve, como Vite.
- **Testes**: só cobrem o motor. Faltam testes de migração de dados e de fechamento de semana.
- **Esquema de dados**: não está documentado. Antes do backend, definir o formato (`state`, `history`, versões e migrações).

## Próximas etapas sugeridas (em ordem)
1. **Repositório**: subir no GitHub, publicar `dist/` no GitHub Pages e configurar CI rodando `npm test`.
2. **Fase 2b**: PWA + backend de sincronização com login + importação do JSON atual.
3. **Refatoração leve**: módulos + Vite + documento do esquema de dados.
4. **Fase 3**: companion de telemetria gerando rascunhos de viagem.
5. **Fase 4**: overlay no companion.
6. **Fase 5 restante**: home time, progressão, caminhão próprio e eventos.
