# Carreira Realista ATS

Sistema de carreira realista para **American Truck Simulator**. Diário de bordo, contratos com empresas, DRE semanal, holerite com pay lag, impostos e regras do mercado de transporte dos EUA (2026).

## Como usar
- **App instalável (recomendado):** publique no GitHub Pages, abra o endereço no celular e no PC e instale em *Ajustes › Dados e sincronização › Instalar o app*. Funciona sem internet.
- **Sincronizar celular e PC:** crie um projeto gratuito no Supabase, rode `supabase/schema.sql`, preencha `src/config.js` e crie sua conta no app. Passo a passo em `docs/sincronizacao.md`.
- **Sem instalar nada:** abra `dist/index.html` no navegador. Os dados ficam naquele navegador; use *Exportar JSON* para backup ou para levar a outro aparelho.
- **Dentro do Claude:** a versão publicada como artifact salva na conta Claude. Para levar a carreira ao app instalado, exporte o JSON lá e importe aqui.
- **Trazer dados de uma planilha:** em *Ajustes › Dados e sincronização*, use **Importar planilha** com a planilha Carreira Realista ATS (o modelo original de 9 abas). **Exportar planilha** devolve os dados no mesmo modelo e **Baixar modelo** gera a planilha vazia, igual a `docs/minha-planilha-carreira-ats.xlsx`.

## Estrutura
```
src/
  config.js          Endereço e chave publicável do servidor de sincronização (opcional)
  engine.js          Motor de cálculo (funções puras)
  shell.html         Estilos (CSS), cabeçalho e navegação
  app/               Módulos do app, carregados na ordem do nome
    00-core.js         Atalhos, formatação e variáveis globais
    10-storage.js      Cópia local e controle da sincronização
    12-sync-claude.js  Sincronização na conta Claude (artifact)
    14-sync-cloud.js   Sincronização em servidor próprio (Supabase) com login
    20-state.js        Carreira, empresas, contratos, regras efetivas, normalização
    22-ledger.js       Extrato, contas fixas, empréstimo, infrações, fechamento
    30-views.js        Painel, Diário, Holerite e Histórico
    40-help.js         Textos de ajuda e guia das regras
    50-forms.js        Campos e blocos recolhíveis
    52-settings.js     Aba Ajustes
    54-career.js       Aba Carreira
    56-account.js      Conta, servidor e instalação do app
    58-drafts.js       Viagens do jogo: caixa de entrada dos rascunhos
    60-xlsx.js         Leitura e escrita de .xlsx sem bibliotecas
    61-sheet-model.js  Modelo da planilha embutido, sem dados (gerado por tools/make-sheet-model.mjs)
    62-sheet-io.js     Importação e exportação no modelo da planilha
    70-dialogs.js      Janelas: nova carreira, viagem, fechamento, backup
    90-main.js         Eventos e inicialização
telemetry/           Telemetria do jogo: plugin (DLL) e núcleo do programa do PC
desktop/             App de PC (Electron): bandeja, painel, overlay e instalador
public/              Manifesto, ícones e service worker do app instalável
supabase/schema.sql  Tabelas e regras de acesso do servidor de sincronização
tools/               Gerador do modelo da planilha e envio de viagem de teste (enviar-rascunho.mjs)
build.mjs            Junta tudo em dist/ (index.html único + arquivos de public/)
dist/                App pronto para abrir ou publicar
tests/               Testes do motor, do estado e da sincronização (com servidor de teste)
docs/                Regras de cálculo, esquema de dados, sincronização, roadmap e fontes
```

## App de PC e telemetria do jogo
O **Carreira Realista para PC** instala o plugin no ATS, envia ao app o dia atual, o trabalho em andamento e as entregas concluídas, e mostra o app por cima do jogo (Ctrl+Shift+Espaço). Baixe em [Releases](https://github.com/altairjr/Realistic-Career-ATS/releases/latest/download/CarreiraRealista-Setup.exe). Detalhes em `docs/telemetria.md`.

## Desenvolvimento
Requer Node.js 18 ou mais novo. Não há dependências externas.
```bash
npm test            # 44 testes: motor, estado, sincronização e telemetria
npm run e2e:instalar  # uma vez: baixa o Playwright e o Chromium para os testes no navegador
npm run test:e2e    # 11 testes no navegador: telas, planilha, dois aparelhos, offline, atualização, viagens do jogo, telemetria, overlay e painel do PC
npm run telemetria  # programa companheiro da telemetria (deixe aberto enquanto joga)
npm run build   # gera dist/ a partir de src/ e public/
```
Edite os arquivos em `src/` e rode o build. Não edite `dist/index.html` direto.

Os módulos são scripts simples que compartilham o escopo global. Para criar um módulo, adicione um arquivo em `src/app/` com um prefixo numérico que o coloque na ordem certa.

## Publicar no GitHub Pages
1. Em *Settings › Pages*, escolha **GitHub Actions** como origem.
2. Envie para a branch `main`. O workflow `pages.yml` testa, gera `dist/` e publica.
3. Abra o endereço no celular e instale o app.

Detalhes e a configuração da sincronização em `docs/sincronizacao.md`. O que pode e o que não pode ficar público está em `docs/seguranca.md`. O formato das viagens vindas do jogo está em `docs/telemetria.md`.

## Fontes das regras
Faixas de salário (otrucking 2026), custos operacionais (ATRI 2025), per diem (IRS Notice 2026-60), imposto federal 2026 (Tax Foundation), jornada e isenção de curta distância (FMCSA) e CDL não-domiciliada (FMCSA, 2026). Detalhes em `docs/`.
