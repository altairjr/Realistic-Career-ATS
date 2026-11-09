# Carreira Realista ATS

Sistema de carreira realista para **American Truck Simulator**. Diário de bordo, contratos com empresas, DRE semanal, holerite com pay lag, impostos e regras do mercado de transporte dos EUA (2026).

## Como usar
- **Sem instalar nada:** abra `dist/index.html` no navegador do PC ou do celular. Os dados ficam salvos naquele navegador. Use *Ajustes › Dados e sincronização › Exportar JSON* para fazer backup ou passar os dados para outro aparelho.
- **Trazer dados de uma planilha:** em *Ajustes › Dados e sincronização*, use **Baixar modelo**, preencha as abas Motorista, Empresa e Viagens e use **Importar planilha**. `docs/minha-planilha-carreira-ats.xlsx` é um exemplo preenchido.
- **Com sincronização entre PC e celular:** use a versão publicada como artifact no claude.ai. Ela salva na sua conta. Para levar os dados para a versão local, exporte o JSON lá e importe aqui.

## Estrutura
```
src/
  engine.js    Motor de cálculo (funções puras: DRE, viagem, carro, impostos, jornada, presets)
  app.js       Interface: estado, telas, formulários, ajuda dos campos, sincronização
  shell.html   Estilos (CSS), cabeçalho e navegação
build.mjs      Junta tudo em dist/index.html (arquivo único)
dist/
  index.html   App pronto para abrir ou publicar
tests/
  engine.test.cjs  Testes do motor
docs/
  regras-de-calculo.md   Todas as regras e fórmulas
  avaliacao-realismo.md  Comparação com o mercado americano e fontes
  roadmap-status.md      Onde o projeto está e próximas etapas
```

## Desenvolvimento
Requer Node.js 18 ou mais novo. Não há dependências externas.
```bash
npm test        # roda os testes do motor
npm run build   # gera dist/index.html a partir de src/
```
Edite os arquivos em `src/` e rode o build. Não edite `dist/index.html` direto.

## Publicar no GitHub Pages
1. Suba o repositório no GitHub.
2. Em *Settings › Pages*, escolha a branch `main` e a pasta `/dist` (ou copie `dist/index.html` para `/docs`).
3. Acesse pelo celular e use "Adicionar à tela inicial".

## Fontes das regras
Faixas de salário (otrucking 2026), custos operacionais (ATRI 2025), per diem (IRS Notice 2026-60), imposto federal 2026 (Tax Foundation), jornada e isenção de curta distância (FMCSA) e CDL não-domiciliada (FMCSA, 2026). Detalhes em `docs/`.
