# Carreira Realista ATS

Sistema de carreira realista para **American Truck Simulator**. Diário de bordo, contratos com empresas, DRE semanal, holerite com pay lag, impostos e regras do mercado de transporte dos EUA (2026).

## Como usar
- **Sem instalar nada:** abra `dist/index.html` no navegador do PC ou do celular. Os dados ficam salvos naquele navegador. Use *Ajustes › Dados e sincronização › Exportar JSON* para fazer backup ou passar os dados para outro aparelho.
- **Trazer dados de uma planilha:** em *Ajustes › Dados e sincronização*, use **Baixar modelo**, preencha as abas Motorista, Empresa e Viagens e use **Importar planilha**. `docs/minha-planilha-carreira-ats.xlsx` é um exemplo preenchido.
- **Com sincronização entre PC e celular:** use a versão publicada como artifact no claude.ai. Ela salva na sua conta. Para levar os dados para a versão local, exporte o JSON lá e importe aqui.

## Estrutura
```
src/
  engine.js          Motor de cálculo (funções puras)
  shell.html         Estilos (CSS), cabeçalho e navegação
  app/               Módulos do app, carregados na ordem do nome
    00-core.js         Atalhos, formatação e variáveis globais
    10-storage.js      Cópia local e sincronização na conta
    20-state.js        Carreira, empresas, contratos, regras efetivas, normalização
    22-ledger.js       Extrato, contas fixas, empréstimo, infrações, fechamento
    30-views.js        Painel, Diário, Holerite e Histórico
    40-help.js         Textos de ajuda e guia das regras
    50-forms.js        Campos e blocos recolhíveis
    52-settings.js     Aba Ajustes
    54-career.js       Aba Carreira
    60-xlsx.js         Leitura e escrita de .xlsx sem bibliotecas
    62-sheet-io.js     Modelo, importação e exportação da planilha
    70-dialogs.js      Janelas: nova carreira, viagem, fechamento, backup
    90-main.js         Eventos e inicialização
build.mjs            Junta tudo em dist/index.html (arquivo único)
dist/index.html      App pronto para abrir ou publicar
tests/               Testes do motor e do estado
docs/                Regras de cálculo, esquema de dados, roadmap e fontes
```

## Desenvolvimento
Requer Node.js 18 ou mais novo. Não há dependências externas.
```bash
npm test        # roda os 23 testes (motor e estado)
npm run build   # gera dist/index.html a partir de src/
```
Edite os arquivos em `src/` e rode o build. Não edite `dist/index.html` direto.

Os módulos são scripts simples que compartilham o escopo global. Para criar um módulo, adicione um arquivo em `src/app/` com um prefixo numérico que o coloque na ordem certa.

## Publicar no GitHub Pages
1. Suba o repositório no GitHub.
2. Em *Settings › Pages*, escolha a branch `main` e a pasta `/dist` (ou copie `dist/index.html` para `/docs`).
3. Acesse pelo celular e use "Adicionar à tela inicial".

## Fontes das regras
Faixas de salário (otrucking 2026), custos operacionais (ATRI 2025), per diem (IRS Notice 2026-60), imposto federal 2026 (Tax Foundation), jornada e isenção de curta distância (FMCSA) e CDL não-domiciliada (FMCSA, 2026). Detalhes em `docs/`.
