# Roadmap — onde estamos (v0.21, nov/2026)

| Fase | Objetivo | Status |
|---|---|---|
| 0 | Motor de regras separado da interface | ✅ Concluída |
| 1 | App em HTML | ✅ Concluída |
| 1b | Revisão para escalar (código, dados, regras dos EUA) | ✅ Concluída |
| 2 | Celular + sincronização | ✅ Concluída (site publicado, app instalável, login e sincronização) |
| 3 | Integração com o jogo (telemetria) | ✅ Funcionando no jogo (falta testar multa, pedágio e cancelamento) |
| 4 | Overlay sobre o jogo | 🟡 Feito no app de PC (v0.20); falta testar no Windows |
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

### Preparação da fase 3 (v0.18)
- **Viagens do jogo**: tabela `trip_drafts` e caixa de entrada no app. O leitor de telemetria só cria rascunhos; você lança (formulário já preenchido) ou descarta. Funciona offline e entre aparelhos. Formato em `telemetria.md`.
- **Ferramenta de teste**: `tools/enviar-rascunho.mjs` envia uma entrega de exemplo para a sua conta.
- **Testes no navegador no repositório**: 5 testes (telas, planilha, dois aparelhos, offline, atualização, viagens do jogo) rodando no GitHub antes de cada publicação. Total: 37 automáticos + 5 no navegador.
- **Supabase configurado**: cadastro fechado, senha mínima de 8, `schema.sql` aplicado, senha do banco trocada; celular confirmado.

### Fase 3 — Telemetria (v0.19, esta versão)
- **Plugin do jogo** (C++, SDK oficial 1.16 da SCS): grava trabalho, entregas, multas, pedágios, balsas, trens, abastecimentos, dia do jogo, odômetro e minutos dirigidos. Compilado pelo GitHub (workflow `telemetria`).
- **Programa companheiro** (Node): lê o arquivo do plugin, envia cada entrega como rascunho e a situação do jogo para a conta; login salvo no PC, fila offline, sem duplicar, modo diagnóstico.
- **App**: cartão "No jogo agora" (dia, caminhão, trabalho em andamento), dia do app ligado ao dia do jogo, rascunhos já no dia certo.
- **Testes**: sessão de jogo simulada compilada com o plugin → companheiro → servidor de teste; 40 testes automáticos e 6 no navegador.
- Guia de instalação e limites em `telemetria.md`.

### App de PC, controle da coleta e overlay (v0.20)
- **App de PC "Carreira Realista"** (Electron): instalador `CarreiraRealista-Setup.exe` publicado em Release com link fixo; instala e confere o plugin pela Steam; ícone na bandeja com status (verde/amarelo/vermelho); painel com cada item e o botão para resolver; avisos a cada entrega; abrir junto com o jogo e iniciar com o Windows.
- **Coleta controlável**: pausar (o plugin para de gravar) e **perfil do jogo ligado à carreira** (lido no `game.log.txt`); outros perfis não enviam nada. Controle no PC e no app (*Ajustes › Telemetria do jogo*).
- **Overlay (fase 4)**: o app por cima do jogo com Ctrl+Shift+Espaço, modo compacto, arrastável.
- **Plugin 0.2**: arquivo de pausa e abertura do programa com o jogo.
- **Testes**: 44 automáticos (perfil, pausa, controle pela conta, instalador) e 11 no navegador (painel do PC, telemetria no app, overlay).

### Simulação no jogo e ajustes do overlay (v0.21, esta versão)
- **Instalador testado no Windows** (workflow `desktop` corrigido: testes no Linux, pasta da DLL criada).
- **Overlay**: ao esconder, o foco volta ao jogo; janela cerca de 15% maior.
- **Simulação no jogo**: warp automático ao abrir o jogo (ex.: 0,9), tempo de carga depois de cada entrega (padrão 1 h) e, no overlay, avançar o tempo (+1/2/4/8 h) ou ir para uma hora. O plugin 0.3 digita no console com o jogo em foco e o caminhão parado.
- **Testes**: 46 automáticos (plugin digitando no console, fila e junção de pedidos, console desligado, perfil) e 11 no navegador.

### Fase 5 — parte já feita
- 5 classificações com predefinições; fixo, hora, CPM e percentual; jornada FMCSA; empréstimo; renome; bônus de segurança; experiência e CPM sugerido; status migratório; custos de owner-operator.

## Etapas que faltam
### Fase 3 — o que falta
- ~~Primeiro teste no jogo~~: feito em 14/11 (ATS 1.62.2.2s), entrega chegou à conta. Falta ver multa, pedágio, balsa, abastecimento e cancelamento num jogo real.
- Valor do combustível (o SDK dá litros; falta o preço pago).
- Programa companheiro com ícone e início automático (hoje é uma janela de terminal); depois, junto com o overlay da fase 4.
- 10h de folga entre turnos e restart de 34h exatos usando o relógio do jogo.

### Fase 4 — Overlay (restante)
- ~~Testar no Windows~~: instalador, bandeja e overlay funcionando (14/11). Falta confirmar a simulação no jogo (warp e tempo).
- Ajustes finos de tamanho, transparência e posição conforme o uso.
- Atualização automática do app de PC (hoje: baixar a versão nova no mesmo link).

### Fase 5 — restante
- Folga em casa (home time) para OTR.
- Progressão automática: reajuste do CPM por tempo de casa e promoção sugerida.
- Caminhão próprio como bem: compra, financiamento, revenda e manutenção programada.
- Documentos do motorista: exame médico do DOT, proficiência em inglês e endossos da CDL (Hazmat, Tanker, Doubles/Triples).
- Eventos aleatórios (inspeção, quebra) e gráficos de evolução.

### Futuro
- **ETS2**: o nome do projeto já prevê o Euro Truck Simulator 2. Exige outro conjunto de regras (euro, tacógrafo da UE, impostos europeus), aproveitando o mesmo motor e a mesma telemetria.

## Próxima etapa de implementação
**Testar a simulação no jogo (v0.21):**
1. Rodar de novo o `supabase/schema.sql` (colunas `sim` e `sim_last`) e o workflow `desktop`; instalar a versão nova e aceitar a atualização do plugin (0.3) com o jogo fechado.
2. Ligar warp e tempo de carga em *Ajustes › Telemetria do jogo*, abrir o jogo e conferir o warp; fazer uma entrega e conferir o relógio; usar +1 h no overlay.
3. Depois: eventos de multa, pedágio e abastecimento num jogo real; atualização automática do app de PC.
