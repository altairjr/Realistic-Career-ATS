# Regras de cálculo (v0.11)

O app usa só regras realistas (EUA 2026). A planilha original serve apenas como fonte dos dados iniciais de exemplo, que são recalculados com as regras atuais.

## Estrutura
- **Carreira**:
  - **Motorista**: dados pessoais, experiência, status migratório e histórico de empresas.
  - **Contrato**: o ativo (editável) e os anteriores.
  - **Empresas**: lista de empresas, usada como opção nos contratos.
- **Contrato**:
  - **Vínculo**: empresa, classificação (5, fixas), operação, início, caminhão, trailer e renome.
  - **Condições**: remuneração, extras, bônus da empresa, quem paga cada despesa, benefícios e per diem, custos do caminhão.
  - O tipo fiscal sai da classificação: W-2 é empregado; as demais são 1099.
- **Ajustes** (regras gerais): início e contas fixas, frete de mercado do caminhão, bônus das viagens, custos de vida, impostos, viagens de carro, pay lag, jornada, calendário e cidades, tipos de operação, dados.
- **Regras efetivas** = Ajustes + condições do contrato ativo (`effSettings` em `src/app.js`).

## Início e contas fixas
- **Saldo inicial**: `bank.opening`.
- **Dia de início da carreira**: contas e parcelas contam a partir dele.
- **Contas fixas pelo calendário**: no dia escolhido de cada semana saem do saldo a moradia e, se houver, a parcela do caminhão e as licenças, mesmo sem salário. O fechamento não cobra de novo.
- **Empréstimo**: parcela mensal (30 dias) ou semanal.
  - Juros = saldo × taxa mensal (semanal = taxa × 7/30).
  - Parcela paga = mín(parcela, saldo + juros).
  - Quitado, desliga sozinho.

## Viagens
- **Caminhão**: grava no lançamento `contractId`, a cópia do contrato, quem paga cada despesa e o frete de mercado.
- **Carro** (fora do contrato):
  - **Emprestado**: 35% de (frete do jogo × 0,40). O dono paga combustível, pedágio e danos.
  - **Próprio**: 100% de (frete do jogo × 0,40) − $0,50/mi − combustível, pedágio, danos, multas e despesas pessoais.
  - **Alvo de balanceamento**: emprestado entre 35% e 50%, próprio entre 55% e 75% de uma viagem de caminhão.

## Predefinições por classificação
- **W-2**:
  - A empresa paga combustível, pedágio e hotel.
  - O motorista paga as multas e a franquia de $1.000.
  - Plano de saúde de $45/semana e bônus de segurança.
  - Per diem se a operação for OTR.
- **Lease / Owner / Autoridade / Frota**:
  - O motorista paga tudo.
  - Percentual do frete: 70% / 75% / 100% / 100%.
  - Custos do caminhão ligados.

## Forma de pagamento
- **Fixo semanal**: $1.300 + 5% do frete de mercado. Proporcional aos dias quando a semana mistura contratos.
- **Por hora**: horas × $26 (até 10h/dia e 50h/semana) + 5%. Hora extra opcional (FLSA).
- **CPM**: milhas × $0,55 + detention ($20/h após 2h) + stop pay ($50).
- **Percentual**: % do frete de mercado.
- Mínimo garantido opcional. Extras: layover ($150/dia), breakdown ($20/h) e lona ($75).

## Frete de mercado (caminhão)
Frete do jogo × 0,10, ou milhas × $/mi.

## Impostos e descontos
- **W-2**: FICA de 7,65% + IR federal pela tabela de 2026 (dedução de $16.100 solteiro ou $32.200 casado). Nevada: 0%.
- **1099**: self-employment de 15,3% × 92,35% do lucro + IR federal sobre o lucro − metade do SE.
- Plano de saúde e 401(k) pré-imposto. Per diem de $80 por noite fora, isento.

## Custos
- **Refeições**: por viagem ou automáticas por dia trabalhado.
- **Hotel**: por noite. **Moradia**: $500 por semana.
- **Caminhão (owner)**: manutenção $0,404/mi e pneus $0,05/mi (ATRI 2025), seguro, parcela e licenças.

## Holerite
- O holerite deposita o líquido do contracheque no dia do pagamento.
- No fechamento saem do saldo as despesas de viagem, os custos por milha e as contas fixas ainda não cobradas.
- **Bônus de segurança**: $300 a cada 13 semanas sem multa nem dano.

## Jornada (FMCSA), infrações e fiscalização
- **Infrações** (alerta vermelho):
  - mais de 11h de direção no dia;
  - mais de 14h de jornada;
  - mais de 8h de direção sem pausa de 30 min (exceto dentro da isenção local);
  - ciclo de 70h/8 dias (ou 60h/7) estourado.
- **Aviso** (amarelo): viagem fora do raio local de 150 mi aéreas (~172 mi de estrada). Não é infração, mas a isenção cai naquele dia e a pausa de 30 min passa a ser exigida.
- **Consequências** (Ajustes › Jornada, ligadas por padrão):
  - Qualquer infração zera o bônus de segurança.
  - No fechamento da semana, cada infração tem 25% de chance de ser pega numa fiscalização, com multa de $1.000 debitada do saldo.
  - Todas vão para o registro de segurança por 8 semanas. Com 3 ou mais, o motorista aparece "em risco".
- **Explicações**: cada alerta no Diário abre o que significa, a consequência real e no app, e como resolver. O "Guia das regras do jogo" em Ajustes reúne todas as regras.

## Pay lag
Dia do pagamento = início da semana + 7 × semanas de atraso + dia da semana do pagamento (padrão: sexta, 1 semana).

## Importar e exportar planilha (Ajustes › Dados e sincronização)
- **Formato próprio do app (.xlsx)**, com as abas:
  - **Leia-me**: instruções.
  - **Motorista** (campo/valor): nome, nacionalidade, nível, saldo bancário atual (obrigatório), dia atual do jogo (obrigatório), dia 1 do jogo.
  - **Empresa** (campo/valor): nome (obrigatório), sede, classificação (W-2, Lease, Owner-Operator, Autoridade própria, Frota; obrigatória), operação, forma de pagamento, valor base, comissão, início.
  - **Viagens**: uma linha por viagem. Colunas: Dia, Veículo (Caminhão, Carro emprestado, Carro próprio), Origem, Destino, Distância (mi), Frete, Bônus, Combustível, Pedágios, Multas, Danos, Cafés, Almoços, Jantas, Noites em hotel, Horas de direção, Horas de serviço, Status. Obrigatórias: Dia, Veículo, Destino, Distância, Frete.
- **Validação**: aba faltando, coluna obrigatória ausente, número inválido, dia depois do dia atual, veículo, status ou classificação desconhecidos. Qualquer erro mostra a lista (com aba, linha e coluna) e nada é alterado.
- **Importação**: substitui todos os dados. Viagens da semana do dia atual ficam em aberto; as mais antigas viram semanas fechadas no Histórico, já pagas. O saldo final fica igual ao informado. Tudo é recalculado com as regras do app.
- **Botões**: "Baixar modelo" gera a planilha vazia; "Exportar planilha" gera o mesmo formato com os dados atuais.
- **Leitura e escrita** de .xlsx feitas no próprio app, sem bibliotecas externas (funciona offline).
